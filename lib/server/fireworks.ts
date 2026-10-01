import type { ServerConfig } from './config'

export type FireworksMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type FireworksRequestOptions = {
  timeoutMs: number
  maxTokens: number
  jsonSchema?: Record<string, unknown>
  signal?: AbortSignal
  retries?: number
  /** Lower = cheaper/faster. Models that reject the field simply ignore it. */
  reasoningEffort?: 'low' | 'medium' | 'high'
}

type FireworksResponse = {
  choices?: Array<{
    finish_reason?: string
    message?: { content?: string | Array<{ type: string; text?: string }>; reasoning_content?: string }
  }>
  error?: { message?: string; code?: string }
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])

/** Statuses / messages that mean "this model id is gone" → try the next fallback. */
function isModelGoneError(status: number, message: string): boolean {
  if (status === 404) return true
  const m = message.toLowerCase()
  return (
    m.includes('model not found') ||
    m.includes('does not exist') ||
    m.includes('decommissioned') ||
    m.includes('deprecated') ||
    m.includes('no longer available') ||
    m.includes('unknown model')
  )
}

function isUnsupportedParamError(status: number, message: string): boolean {
  if (status !== 400) return false
  const m = message.toLowerCase()
  return (
    m.includes('response_format') ||
    m.includes('json_schema') ||
    m.includes('reasoning_effort') ||
    m.includes('unsupported') ||
    m.includes('unknown parameter') ||
    m.includes('unexpected')
  )
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms)
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(id)
          reject(new DOMException('Aborted', 'AbortError'))
        },
        { once: true },
      )
    }
  })
}

function extractContentFromChoice(
  choice: FireworksResponse['choices'] extends (infer U)[] | undefined ? U : never,
): string {
  if (!choice?.message) return ''
  const msg = choice.message
  if (typeof msg.content === 'string') {
    return msg.content.trim() || msg.reasoning_content?.trim() || ''
  }
  if (Array.isArray(msg.content)) {
    const text = msg.content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part.type === 'text' && part.text) return part.text
        return ''
      })
      .join('')
      .trim()
    if (text) return text
  }
  return msg.reasoning_content?.trim() || ''
}

type AttemptContext = {
  modelIndex: number
  dropResponseFormat: boolean
  dropReasoningEffort: boolean
}

/**
 * Single-attempt Fireworks chat completion. Returns parsed content or a
 * structured failure that tells the retry loop what to change.
 */
async function attemptFireworks(
  config: ServerConfig,
  messages: FireworksMessage[],
  options: FireworksRequestOptions,
  ctx: AttemptContext,
): Promise<{ ok: true; content: string; finishReason?: string } | { ok: false; error: Error; retryable: boolean; modelGone: boolean; unsupportedParam: boolean }> {
  const model = config.modelFallbacks[ctx.modelIndex] ?? config.modelId
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs)
  const combinedSignal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal

  const body: Record<string, unknown> = {
    model,
    max_tokens: options.maxTokens,
    temperature: 0.2,
    top_p: 0.9,
    messages,
  }

  if (options.jsonSchema && !ctx.dropResponseFormat) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: 'pcb_design_brief', schema: options.jsonSchema },
    }
  } else if (options.jsonSchema && ctx.dropResponseFormat) {
    // Fallback: ask for JSON in-band when the model rejects response_format.
    body.messages = [
      ...messages,
      {
        role: 'system',
        content:
          'Respond with a single raw JSON object only. No markdown fences, no commentary.',
      },
    ]
  }

  if (options.reasoningEffort && !ctx.dropReasoningEffort) {
    body.reasoning_effort = options.reasoningEffort
  }

  try {
    const response = await fetch(config.fireworksApiUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        'User-Agent': 'pcb-copilot/2.0',
      },
      body: JSON.stringify(body),
      signal: combinedSignal,
      cache: 'no-store',
    })

    const payload = (await response.json().catch(() => null)) as FireworksResponse | null
    const apiMessage = payload?.error?.message ?? ''

    if (response.status === 401) {
      return {
        ok: false,
        error: new Error(
          'Fireworks rejected the API key (401). Check that FIREWORKS_API_KEY is valid and has quota.',
        ),
        retryable: false,
        modelGone: false,
        unsupportedParam: false,
      }
    }

    if (response.status === 404 || isModelGoneError(response.status, apiMessage)) {
      const hasMore = ctx.modelIndex + 1 < config.modelFallbacks.length
      return {
        ok: false,
        error: new Error(
          hasMore
            ? `Model "${model}" unavailable (404); trying fallback.`
            : `Fireworks could not find model "${model}" (404) and no fallback succeeded. Update FIREWORKS_MODEL_ID.`,
        ),
        retryable: hasMore,
        modelGone: true,
        unsupportedParam: false,
      }
    }

    if (response.status === 429) {
      return {
        ok: false,
        error: new Error('Fireworks rate limit or quota exceeded (429).'),
        retryable: true,
        modelGone: false,
        unsupportedParam: false,
      }
    }

    if (RETRYABLE_STATUS.has(response.status)) {
      return {
        ok: false,
        error: new Error(`Fireworks transient failure (${response.status}).`),
        retryable: true,
        modelGone: false,
        unsupportedParam: false,
      }
    }

    if (!response.ok) {
      const unsupported = isUnsupportedParamError(response.status, apiMessage)
      return {
        ok: false,
        error: new Error(apiMessage || `Fireworks request failed with status ${response.status}.`),
        retryable: unsupported,
        modelGone: false,
        unsupportedParam: unsupported,
      }
    }

    if (!payload?.choices?.length) {
      return {
        ok: false,
        error: new Error('Fireworks returned no completion choices.'),
        retryable: true,
        modelGone: false,
        unsupportedParam: false,
      }
    }

    const choice = payload.choices[0]
    const content = extractContentFromChoice(choice)

    if (!content) {
      if (choice?.finish_reason === 'length') {
        return {
          ok: false,
          error: new Error(
            'Fireworks hit the output token limit before finishing. Simplify the board or raise max_tokens.',
          ),
          retryable: false,
          modelGone: false,
          unsupportedParam: false,
        }
      }
      return {
        ok: false,
        error: new Error('Fireworks returned an empty response.'),
        retryable: true,
        modelGone: false,
        unsupportedParam: false,
      }
    }

    return { ok: true, content, finishReason: choice.finish_reason }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (options.signal?.aborted) {
        throw error // caller handles abort
      }
      return {
        ok: false,
        error: new Error('Fireworks timed out while generating the PCB.'),
        retryable: true,
        modelGone: false,
        unsupportedParam: false,
      }
    }
    if (error instanceof Error && (error.name === 'TimeoutError' || error.message.includes('timed out'))) {
      return {
        ok: false,
        error: new Error('Fireworks timed out while generating the PCB.'),
        retryable: true,
        modelGone: false,
        unsupportedParam: false,
      }
    }
    if (error instanceof TypeError || (error instanceof Error && /fetch|network/i.test(error.message))) {
      return {
        ok: false,
        error: new Error('Could not reach the Fireworks AI API (network error). Retry shortly.'),
        retryable: true,
        modelGone: false,
        unsupportedParam: false,
      }
    }
    throw error
  }
}

export async function requestFireworks(
  config: ServerConfig,
  messages: FireworksMessage[],
  options: FireworksRequestOptions,
): Promise<string> {
  const maxRetries = options.retries ?? 2
  const ctx: AttemptContext = {
    modelIndex: 0,
    dropResponseFormat: false,
    dropReasoningEffort: false,
  }

  let attempt = 0
  let rotations = 0
  const maxRotations = config.modelFallbacks.length + 2
  let lastError: Error = new Error('Fireworks request failed.')

  while (attempt <= maxRetries && rotations <= maxRotations) {
    if (options.signal?.aborted) {
      throw new DOMException('Request aborted', 'AbortError')
    }

    const result = await attemptFireworks(config, messages, options, ctx)

    if (result.ok) return result.content

    lastError = result.error

    if (result.modelGone && ctx.modelIndex + 1 < config.modelFallbacks.length) {
      ctx.modelIndex += 1
      rotations += 1
      continue // no attempt burn: model rotation is free
    }
    if (result.unsupportedParam) {
      rotations += 1
      if (!ctx.dropResponseFormat) ctx.dropResponseFormat = true
      else ctx.dropReasoningEffort = true
      continue
    }
    if (result.retryable && attempt < maxRetries) {
      const backoff = Math.min(800 * Math.pow(2, attempt) + Math.random() * 400, 6000)
      await sleep(backoff, options.signal)
      attempt += 1
      continue
    }
    break
  }

  throw lastError
}

/**
 * Streaming variant that yields text chunks via callback.
 * Falls back to non-streaming if streaming fails.
 */
export async function requestFireworksStream(
  config: ServerConfig,
  messages: FireworksMessage[],
  options: FireworksRequestOptions & { onChunk?: (chunk: string) => void },
): Promise<string> {
  const model = config.modelId
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs)
  const combinedSignal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal

  try {
    const response = await fetch(config.fireworksApiUrl, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        'User-Agent': 'pcb-copilot/2.0',
      },
      body: JSON.stringify({
        model,
        max_tokens: options.maxTokens,
        temperature: 0.2,
        top_p: 0.9,
        stream: true,
        ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
        messages,
      }),
      signal: combinedSignal,
      cache: 'no-store',
    })

    if (!response.ok || !response.body) {
      // Streaming unavailable (or model gone) → structured non-streaming path
      // which handles model fallbacks + param fallbacks.
      return requestFireworks(config, messages, options)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullText = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed === 'data: [DONE]') continue
        if (!trimmed.startsWith('data: ')) continue
        try {
          const json = JSON.parse(trimmed.slice(6))
          const delta =
            json.choices?.[0]?.delta?.content ??
            json.choices?.[0]?.message?.content ??
            ''
          if (delta) {
            fullText += delta
            options.onChunk?.(delta)
          }
        } catch {
          // Ignore malformed SSE frames (keep-alives, reasoning deltas)
        }
      }
    }

    if (fullText.trim()) return fullText.trim()
    return requestFireworks(config, messages, options)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError' && options.signal?.aborted) {
      throw error
    }
    // Streaming transport failure → non-streaming (handles fallbacks)
    return requestFireworks(config, messages, options)
  }
}
