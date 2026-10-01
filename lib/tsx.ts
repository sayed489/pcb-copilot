const MAX_CODE_LENGTH = 80_000
const MIN_CODE_LENGTH = 20

/**
 * Extract a tscircuit TSX module from raw LLM output (fences, chatter, etc.).
 * Pure module — safe to import from both server routes and browser code.
 */
export function extractTsx(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('The model returned empty circuit source.')

  // Handle multiple fence types, prefer largest block (often the final code)
  const fenceRegex = /```(?:tsx|typescript|jsx|ts)?\s*([\s\S]*?)```/gi
  let match: RegExpExecArray | null
  let lastCode: string | null = null
  let largestCode: string | null = null

  while ((match = fenceRegex.exec(trimmed)) !== null) {
    const code = match[1].trim()
    if (code) {
      lastCode = code
      if (!largestCode || code.length > largestCode.length) {
        largestCode = code
      }
    }
  }

  // Prefer largest fenced block, fallback to last, then full text
  let code = largestCode ?? lastCode ?? trimmed

  // If still contains fences markers inside, strip them
  code = code.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()

  // Remove any leading explanation before export default
  const exportIndex = code.indexOf('export default')
  if (exportIndex > 0 && exportIndex < 500) {
    // If there's a lot of text before export default, trim to export
    const before = code.slice(0, exportIndex)
    if (before.split('\n').length > 3 && !before.includes('<board')) {
      code = code.slice(exportIndex)
    }
  }

  if (!code) throw new Error('The model returned empty circuit source.')
  if (code.length < MIN_CODE_LENGTH) {
    throw new Error('Generated circuit source is too short.')
  }
  if (code.length > MAX_CODE_LENGTH) {
    throw new Error(`Generated circuit source is too large (${code.length} chars > ${MAX_CODE_LENGTH}).`)
  }

  return code
}
