import type { DesignDiagnostic } from '@/lib/design'
import { extractTsx } from '@/lib/tsx'

import type { DesignBrief } from '../brief-schema'
import type { ServerConfig } from './config'
import { requestFireworks, requestFireworksStream } from './fireworks'
import { SYSTEM_PROMPT, buildGenerationPrompt } from './prompts'

export { extractTsx }

export type GenerationCallbacks = {
  onChunk?: (chunk: string) => void
  signal?: AbortSignal
}

export async function generateInitialCode(
  config: ServerConfig,
  brief: DesignBrief,
  callbacks?: GenerationCallbacks,
): Promise<string> {
  let fullText = ''
  const text = await requestFireworksStream(
    config,
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildGenerationPrompt(brief) },
    ],
    {
      timeoutMs: 120_000,
      maxTokens: 16_384,
      reasoningEffort: 'medium',
      signal: callbacks?.signal,
      onChunk: (chunk) => {
        fullText += chunk
        callbacks?.onChunk?.(chunk)
      },
    },
  )

  // If streaming didn't trigger callback (fallback), use returned text
  const source = fullText.length > 0 ? fullText : text
  return extractTsx(source)
}

export async function repairGeneratedCode(
  config: ServerConfig,
  code: string,
  diagnostics: DesignDiagnostic[],
  compileFailure?: string,
  callbacks?: GenerationCallbacks,
): Promise<string> {
  const diagnosticLines =
    diagnostics
      .slice(0, 20)
      .map((item) => `- [${item.severity}] ${item.type}: ${item.message}`)
      .join('\n') || '- none'

  const prompt = `Repair this tscircuit design. Preserve its intended function, but fix every compiler, connectivity, placement, and routing failure. Return the full corrected TSX module only.

Compiler failure: ${compileFailure ?? 'none'}
Diagnostics:
${diagnosticLines}

Current source:
${code.slice(0, 30_000)}`

  const text = await requestFireworks(
    config,
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    {
      timeoutMs: 120_000,
      maxTokens: 16_384,
      reasoningEffort: 'medium',
      signal: callbacks?.signal,
    },
  )

  // For repair, we use non-streaming for stability, but still support chunk callback via streaming if needed
  if (callbacks?.onChunk) {
    // Simulate chunking for UI liveness
    const chunks = chunkString(text, 50)
    for (const c of chunks) {
      callbacks.onChunk(c)
      await new Promise((r) => setTimeout(r, 5))
    }
  }

  return extractTsx(text)
}

function chunkString(str: string, size: number): string[] {
  const chunks: string[] = []
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size))
  }
  return chunks
}
