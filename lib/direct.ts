/**
 * Browser-direct engine — the browser calls Fireworks itself.
 *
 * Used when the app host cannot reach api.fireworks.ai (e.g. sandboxed
 * previews) but the visitor's browser can. The heavy tscircuit compile step
 * still runs server-side via POST /api/verify.
 */

import {
  BRIEF_SYSTEM_PROMPT,
  briefJsonSchema,
  buildBriefUserPrompt,
  finalizeBrief,
  parseDesignBrief,
  type DesignBrief,
} from './brief-schema'
import { SYSTEM_PROMPT, buildGenerationPrompt } from './server/prompts'
import { extractTsx } from './tsx'
import type { DesignResult } from './design'

const DEFAULT_URL = 'https://api.fireworks.ai/inference/v1/chat/completions'
const DEFAULT_MODEL = 'accounts/fireworks/models/glm-5p3-flash'

export type DirectConfig = { apiKey: string; apiUrl: string; modelId: string }

export function getDirectConfig(): DirectConfig | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREWORKS_API_KEY?.trim()
  if (!apiKey) return null
  return {
    apiKey,
    apiUrl: process.env.NEXT_PUBLIC_FIREWORKS_API_URL?.trim() || DEFAULT_URL,
    modelId: process.env.NEXT_PUBLIC_FIREWORKS_MODEL_ID?.trim() || DEFAULT_MODEL,
  }
}

function friendlyError(error: unknown): Error {
  if (error instanceof TypeError) {
    return new Error(
      'Browser could not reach Fireworks (network or CORS blocked). Try the SERVER engine, or run the app on a host with internet access.',
    )
  }
  if (error instanceof DOMException && error.name === 'AbortError') return error
  return error instanceof Error ? error : new Error(String(error))
}

async function chatCompletion(
  config: DirectConfig,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Response> {
  let response: Response
  try {
    response = await fetch(config.apiUrl!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ ...body, model: config.modelId }),
      signal,
      cache: 'no-store',
    })
  } catch (error) {
    throw friendlyError(error)
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null
    const message = payload?.error?.message ?? `Fireworks request failed (${response.status}).`
    throw new Error(message)
  }
  return response
}

/** Step 1 — requirements → DesignBrief (structured output). */
export async function directBrief(
  config: DirectConfig,
  messages: string[],
  allowClarification: boolean,
  signal?: AbortSignal,
): Promise<DesignBrief> {
  let response: Response
  try {
    response = await chatCompletion(
      config,
      {
        max_tokens: 4096,
        temperature: 0.2,
        messages: [
          { role: 'system', content: BRIEF_SYSTEM_PROMPT },
          { role: 'user', content: buildBriefUserPrompt(messages, allowClarification) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'pcb_design_brief', schema: briefJsonSchema(allowClarification) },
        },
      },
      signal,
    )
  } catch (error) {
    // Retry once without response_format if the model rejects it
    const message = error instanceof Error ? error.message : ''
    if (/response_format|json_schema|unsupported|unexpected/i.test(message)) {
      response = await chatCompletion(
        config,
        {
          max_tokens: 4096,
          temperature: 0.2,
          messages: [
            { role: 'system', content: BRIEF_SYSTEM_PROMPT },
            { role: 'user', content: buildBriefUserPrompt(messages, allowClarification) },
            { role: 'system', content: 'Respond with a single raw JSON object only.' },
          ],
        },
        signal,
      )
    } else {
      throw error
    }
  }

  const text = await response.text()
  return finalizeBrief(parseDesignBrief(text), allowClarification)
}

/** Step 2 — brief → TSX (streamed; onChunk gets live code). */
export async function directGenerate(
  config: DirectConfig,
  brief: DesignBrief,
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  let response: Response
  try {
    response = await fetch(config.apiUrl!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.modelId,
        max_tokens: 16384,
        temperature: 0.2,
        top_p: 0.9,
        stream: true,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildGenerationPrompt(brief) },
        ],
      }),
      signal,
      cache: 'no-store',
    })
  } catch (error) {
    throw friendlyError(error)
  }

  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null
    throw new Error(payload?.error?.message ?? `Fireworks generation failed (${response.status}).`)
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
      if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue
      try {
        const json = JSON.parse(trimmed.slice(6))
        const delta = json.choices?.[0]?.delta?.content ?? ''
        if (delta) {
          fullText += delta
          onChunk?.(delta)
        }
      } catch {
        // ignore malformed SSE frames
      }
    }
  }

  if (!fullText.trim()) throw new Error('Fireworks returned an empty response.')
  return extractTsx(fullText)
}

/** Step 3 — compile + verify server-side. */
export async function directVerify(
  tsx: string,
  summary: string,
  signal?: AbortSignal,
): Promise<DesignResult> {
  let response: Response
  try {
    response = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tsx, summary, model: 'browser-direct' }),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error('Could not reach /api/verify on this host.')
  }

  const payload = await response.json().catch(() => null) as
    | { design?: DesignResult; error?: string }
    | null

  if (!response.ok || !payload?.design) {
    throw new Error(payload?.error ?? 'Verification failed.')
  }
  return payload.design
}
