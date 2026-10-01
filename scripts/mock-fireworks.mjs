#!/usr/bin/env node
/**
 * mock-fireworks.mjs — OpenAI-compatible mock of the Fireworks chat API.
 *
 * Used for end-to-end testing of pcb-copilot when the sandbox cannot reach
 * api.fireworks.ai. Speaks the same protocol: /v1/chat/completions, JSON-schema
 * structured outputs, and SSE streaming.
 *
 * Behavior:
 *  - Brief requests (response_format json_schema present, or prompt mentions
 *    "engineering brief"):
 *      * first conversation without "Copilot:" → needs_clarification + questions
 *      * otherwise → ready brief
 *  - Codegen requests (system prompt contains "PCB design engineer"):
 *      → streams a known-good tscircuit TSX module in SSE chunks
 *  - Repair requests (prompt contains "Repair this tscircuit") → same TSX
 *
 * Usage: node scripts/mock-fireworks.mjs [port]   (default 8787)
 */

import { createServer } from 'node:http'

const PORT = Number(process.argv[2] ?? 8787)

/** Golden TSX — verified locally to compile and pass runAllChecks with 0 errors. */
const GOLDEN_TSX = `export default () => (
  <board width="40mm" height="30mm">
    <pinheader name="J1" pinCount={2} footprint="pinrow2" pcbX={-16} pcbY={0} schX={10} schY={40} />
    <resistor name="R1" resistance="330" footprint="0603" pcbX={-4} pcbY={4} schX={30} schY={20} />
    <led name="LED1" color="red" footprint="0603" pcbX={8} pcbY={0} schX={60} schY={20} />
    <trace from=".J1 > .pin1" to=".R1 > .pin1" />
    <trace from=".R1 > .pin2" to=".LED1 > .anode" />
    <trace from=".LED1 > .cathode" to=".J1 > .pin2" />
  </board>
)`

const CLARIFY_BRIEF = {
  status: 'needs_clarification',
  questions: [
    'What is the supply voltage and its acceptable range?',
    'How much maximum current must the board deliver?',
  ],
  summary: 'Vague request needing key electrical details',
  assumptions: [],
  requirements: [],
}

const READY_BRIEF = {
  status: 'ready',
  questions: [],
  summary:
    '40×30mm LED indicator board: 2-pin power input header, series current-limit resistor, indicator LED. 2-layer FR4.',
  assumptions: [
    '5V supply from 2-pin header',
    'Indicator LED current ≈ 10mA',
  ],
  requirements: [
    '2-pin power input connector at board edge',
    '330Ω series resistor with 0603 footprint',
    'Red indicator LED 0603',
    'Fully routed 2-layer board, 40×30mm',
  ],
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function extractText(messages) {
  return messages
    .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
    .join('\n')
}

function classify(body, userText) {
  const sys = extractText(body.messages?.filter((m) => m.role === 'system') ?? [])
  if (sys.includes('PCB design engineer')) return 'codegen'
  if (sys.includes('repair engineer') || userText.includes('Repair this tscircuit')) return 'repair'
  if (
    body.response_format?.type === 'json_schema' ||
    userText.includes('engineering brief') ||
    userText.includes('senior PCB requirements engineer')
  ) {
    return 'brief'
  }
  return 'chat'
}

async function handleChat(body) {
  const userText = extractText(body.messages?.filter((m) => m.role === 'user') ?? [])
  const allText = extractText(body.messages ?? [])
  const kind = classify(body, userText)

  // Brief: ask for clarification only on a first-pass vague request
  if (kind === 'brief') {
    // The app instructs "Clarification was already requested" on follow-ups,
    // and prefixes assistant turns with "Copilot:" — key off those.
    const clarificationBanned = allText.includes('Clarification was already requested')
    const conversationMatch = userText.match(/Conversation:\n([\s\S]*)$/)
    const conversation = conversationMatch?.[1] ?? userText
    const alreadyAsked = conversation.includes('Copilot:') || allText.includes('Copilot:')
    const hasSpecs = /voltage|3\.3v|5v|12v|supply|mm|led|sensor|esp32|usb/i.test(conversation)
    const vague = /make me a board|something|a board\b/i.test(conversation)
    const finalBrief = clarificationBanned || alreadyAsked || !vague || hasSpecs
      ? READY_BRIEF
      : CLARIFY_BRIEF
    return { content: JSON.stringify(finalBrief) }
  }

  if (kind === 'codegen' || kind === 'repair') {
    return { content: GOLDEN_TSX, stream: true }
  }

  return { content: 'OK — I am the PCB Copilot mock.' }
}

const server = createServer(async (req, res) => {
  if (req.method !== 'POST' || !req.url?.includes('/chat/completions')) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { message: `mock: unknown route ${req.method} ${req.url}` } }))
    return
  }

  let raw = ''
  for await (const chunk of req) raw += chunk
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'invalid JSON' } }))
    return
  }

  const auth = req.headers.authorization ?? ''
  if (!auth.startsWith('Bearer ') || auth.length < 30) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'invalid api key' } }))
    return
  }

  const result = await handleChat(body)
  const model = body.model ?? 'mock-model'

  if (body.stream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    const text = result.content
    const chunkSize = 48
    for (let i = 0; i < text.length; i += chunkSize) {
      const delta = text.slice(i, i + chunkSize)
      res.write(
        `data: ${JSON.stringify({
          id: 'mock',
          model,
          choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
        })}\n\n`,
      )
      await sleep(8)
    }
    res.write(
      `data: ${JSON.stringify({
        id: 'mock',
        model,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      })}\n\n`,
    )
    res.write('data: [DONE]\n\n')
    res.end()
    return
  }

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(
    JSON.stringify({
      id: 'mock',
      model,
      object: 'chat.completion',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: result.content },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
    }),
  )
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[mock-fireworks] listening on http://0.0.0.0:${PORT}/v1/chat/completions`)
})
