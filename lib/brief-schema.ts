import { z } from 'zod'

export const designBriefSchema = z.object({
  status: z.enum(['ready', 'needs_clarification']),
  questions: z.array(z.string().min(1).max(300)).max(5),
  summary: z.string().min(1).max(2000),
  assumptions: z.array(z.string().min(1).max(500)).max(20),
  requirements: z.array(z.string().min(1).max(500)).max(40),
})

export type DesignBrief = z.infer<typeof designBriefSchema>

/**
 * Parse an LLM JSON response into a DesignBrief with robust fallback.
 * Pure module — safe to import from both server routes and browser code.
 */
export function parseDesignBrief(raw: string): DesignBrief {
  const jsonStr = extractJson(raw)
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(jsonStr)
  } catch {
    // Try to repair common JSON issues: trailing commas, single quotes
    try {
      const repaired = jsonStr
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/'/g, '"')
      parsedJson = JSON.parse(repaired)
    } catch {
      throw new Error('The model returned invalid JSON for the design brief.')
    }
  }

  const parsed = designBriefSchema.safeParse(parsedJson)
  if (parsed.success) return parsed.data

  const partial = designBriefSchema.partial().safeParse(parsedJson)
  if (!partial.success) {
    throw new Error('The model returned an invalid design brief.')
  }

  const data = partial.data
  return {
    status: 'ready',
    questions: [],
    summary: data.summary ?? 'Generated PCB design',
    assumptions: data.assumptions ?? ['Key parameters unspecified; conservative defaults assumed.'],
    requirements: data.requirements ?? ['Generate a manufacturable PCB for the described board.'],
  }
}

function extractJson(raw: string) {
  const trimmed = raw.trim()
  // Handle fenced JSON
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()

  // Find first { and last } to extract JSON object
  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1)
  }

  return trimmed
}

/* ── Shared prompt pieces (used by server and browser-direct engines) ── */

export const BRIEF_SYSTEM_PROMPT =
  'You are a senior PCB requirements engineer. Return JSON matching the supplied schema exactly. Be concise but thorough. Prioritize safety and manufacturability.'

export function briefJsonSchema(allowClarification: boolean) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['status', 'questions', 'summary', 'assumptions', 'requirements'],
    properties: {
      status: {
        type: 'string',
        enum: allowClarification ? ['ready', 'needs_clarification'] : ['ready'],
      },
      questions: {
        type: 'array',
        maxItems: 5,
        items: { type: 'string', minLength: 1, maxLength: 300 },
      },
      summary: { type: 'string', minLength: 1, maxLength: 2000 },
      assumptions: {
        type: 'array',
        maxItems: 20,
        items: { type: 'string', minLength: 1, maxLength: 500 },
      },
      requirements: {
        type: 'array',
        maxItems: 40,
        items: { type: 'string', minLength: 1, maxLength: 500 },
      },
    },
  } as Record<string, unknown>
}

export function buildBriefUserPrompt(messages: string[], allowClarification: boolean): string {
  const clarificationInstruction = allowClarification
    ? 'This is the ONLY opportunity to ask clarification questions. If the brief is missing information that materially affects safety or function, set status to needs_clarification and list up to 5 critical questions.'
    : 'Clarification was already requested. Do NOT ask any more questions. Set status to ready and make conservative, explicit engineering assumptions for missing details.'

  const conversation = messages
    .slice(-10)
    .map((message, index) => `${index + 1}. ${message.slice(0, 1000)}`)
    .join('\n')

  return `Review this PCB design conversation and produce a complete engineering brief.

${clarificationInstruction}

Ask ONLY critical questions that materially change safety or function: supply voltage/range, maximum current, required interfaces, board dimensions/connector constraints, load characteristics, or exact controller when relevant. Do not ask cosmetic questions. If earlier messages answer a question, do not ask it again.

Conversation:
${conversation}`
}

/** Post-process a brief the same way the server engine does. */
export function finalizeBrief(brief: DesignBrief, allowClarification: boolean): DesignBrief {
  if (!allowClarification) return { ...brief, status: 'ready', questions: [] }
  if (brief.status === 'needs_clarification' && brief.questions.length === 0) {
    return { ...brief, status: 'ready' }
  }
  return brief
}
