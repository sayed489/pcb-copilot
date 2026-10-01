'use client'

import { useEffect, useRef, useState } from 'react'

import { CircuitViewer } from '@/components/CircuitViewer'
import { PromptChat } from '@/components/PromptChat'
import { FireworksOverlay } from '@/components/studio/FireworksOverlay'
import { MascotStrip } from '@/components/studio/MascotStrip'
import { StatusBar } from '@/components/studio/StatusBar'
import { getDirectConfig, directBrief, directGenerate, directVerify } from '@/lib/direct'
import type { ChatMessage } from '@/lib/chat'
import type { DesignResult, DesignStreamEvent, DesignDiagnostic } from '@/lib/design'

type Engine = 'direct' | 'server'

const hasDirect = Boolean(getDirectConfig())

export default function Page() {
  // ── Design state ────────────────────────────────────────────
  const [design, setDesign] = useState<DesignResult | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [stages, setStages] = useState<string[]>([])
  const [liveCode, setLiveCode] = useState('')
  const [liveDiagnostics, setLiveDiagnostics] = useState<DesignDiagnostic[]>([])
  const [progress, setProgress] = useState(0)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [celebrate, setCelebrate] = useState(false)
  const [clarified, setClarified] = useState(false)

  // ── Engine (browser-direct = real API from your browser) ────
  const [engine, setEngine] = useState<Engine>(hasDirect ? 'direct' : 'server')

  // ── Viewer ──────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('schematic')

  const abortControllerRef = useRef<AbortController | null>(null)
  const clarifiedRef = useRef(false)

  useEffect(() => {
    if (!celebrate) return
    const t = setTimeout(() => setCelebrate(false), 9000)
    return () => clearTimeout(t)
  }, [celebrate])

  const addMessage = (message: Omit<ChatMessage, 'id'>) => {
    setMessages((current) => [...current, { ...message, id: crypto.randomUUID(), createdAt: Date.now() }])
  }

  const addStage = (stage: string) => {
    setStages((prev) => (prev[prev.length - 1] === stage ? prev : [...prev, stage].slice(-12)))
    setProgress((p) => {
      if (/review/i.test(stage)) return Math.max(p, 15)
      if (/generat/i.test(stage)) return Math.max(p, 35)
      if (/compil/i.test(stage)) return Math.max(p, 65)
      if (/repair/i.test(stage)) return Math.max(p, 80)
      if (/verification passed/i.test(stage)) return 100
      return p
    })
  }

  const handleClarification = (questions: string[]) => {
    setClarified(true)
    clarifiedRef.current = true
    const content =
      questions.length === 1
        ? `One detail before routing:\n1. ${questions[0]}`
        : `${questions.length} critical details before routing:\n${questions
            .map((q, i) => `${i + 1}. ${q}`)
            .join('\n')}`
    addMessage({ role: 'assistant', content, questions })
  }

  const handleResult = (resultDesign: DesignResult) => {
    setDesign(resultDesign)
    setLiveDiagnostics(resultDesign.diagnostics)
    setProgress(100)
    setActiveTab(resultDesign.verified ? 'pcb' : 'review')
    if (resultDesign.verified) {
      addMessage({
        role: 'status',
        content: `Verified · ${resultDesign.stats.components} comps · ${resultDesign.stats.routedTraces} traces · 0 errors`,
        tone: 'success',
      })
      setCelebrate(true)
    } else {
      const blocking = resultDesign.diagnostics.filter((d) => d.severity === 'error').length
      addMessage({
        role: 'status',
        content: `Generated with ${blocking} blocking issue(s) — see the Checks tab`,
        tone: 'error',
      })
    }
  }

  const handleError = (message: string) => {
    setStreamError(message)
    addMessage({ role: 'status', content: `✗ ${message}`, tone: 'error' })
  }

  const buildConversation = (list: ChatMessage[]) =>
    list
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-12)
      .map((m) => (m.role === 'assistant' ? `Copilot: ${m.content}` : m.content))

  // ── Engine A: server pipeline (NDJSON stream) ───────────────
  async function runServer(list: ChatMessage[], signal: AbortSignal) {
    const response = await fetch('/api/design', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: buildConversation(list),
        allowClarification: !clarifiedRef.current,
      }),
      signal,
    })

    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => null)
      throw new Error(payload?.error ?? 'Unable to start PCB generation.')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fatalError: string | null = null

    const processEvent = (event: DesignStreamEvent) => {
      switch (event.type) {
        case 'stage':
          addStage(event.message)
          break
        case 'code_chunk':
          setLiveCode((prev) => (prev + event.chunk).slice(-2400))
          break
        case 'code':
          setLiveCode(event.code.slice(-2400))
          break
        case 'partial_result':
          setDesign(event.design)
          setLiveDiagnostics(event.design.diagnostics)
          setActiveTab((t) => (t === 'schematic' ? 'pcb' : t))
          break
        case 'diagnostics':
          setLiveDiagnostics(event.diagnostics)
          break
        case 'clarification':
          handleClarification(event.questions)
          break
        case 'result':
          handleResult(event.design)
          break
        case 'error':
          // Record — never throw inside the parse loop (v1's silent-failure bug).
          fatalError = event.message
          break
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (value) {
        buffer += decoder.decode(value, { stream: !done })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            processEvent(JSON.parse(line) as DesignStreamEvent)
          } catch {
            // skip malformed frame
          }
          if (fatalError) break
        }
      }
      if (done || fatalError) break
    }

    if (fatalError) handleError(fatalError)
  }

  // ── Engine B: browser-direct (browser → Fireworks, verify here) ──
  async function runDirect(list: ChatMessage[], signal: AbortSignal) {
    const config = getDirectConfig()
    if (!config) {
      throw new Error('No NEXT_PUBLIC_FIREWORKS_API_KEY configured for browser-direct mode.')
    }

    addStage('Reviewing requirements with Fireworks')
    const brief = await directBrief(config, buildConversation(list), !clarifiedRef.current, signal)

    if (brief.status === 'needs_clarification' && brief.questions.length > 0) {
      handleClarification(brief.questions)
      return
    }

    addStage(`Generating tscircuit TSX with ${(config.modelId ?? 'glm-5p3-flash').split('/').pop()}`)
    const tsx = await directGenerate(config, brief, (chunk) => {
      setLiveCode((prev) => (prev + chunk).slice(-2400))
    }, signal)

    addStage('Compiling and running ERC/DRC — pass 1')
    const result = await directVerify(tsx, brief.summary, signal)
    setDesign(result)
    setLiveDiagnostics(result.diagnostics)
    addStage(result.verified ? 'Verification passed; manufacturing exports unlocked' : 'Verification found blocking issues')
    handleResult(result)
  }

  // ── Entry point ─────────────────────────────────────────────
  async function handleGenerate(prompt: string) {
    abortControllerRef.current?.abort()
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt,
      createdAt: Date.now(),
    }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setIsGenerating(true)
    setStreamError(null)
    setStages([])
    setLiveCode('')
    setLiveDiagnostics([])
    setProgress(5)

    try {
      if (engine === 'direct') {
        await runDirect(nextMessages, abortController.signal)
      } else {
        await runServer(nextMessages, abortController.signal)
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        addMessage({ role: 'status', content: 'Generation aborted', tone: 'error' })
        return
      }
      handleError(error instanceof Error ? error.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
      abortControllerRef.current = null
    }
  }

  function resetAll() {
    abortControllerRef.current?.abort()
    setDesign(null)
    setMessages([])
    setStages([])
    setLiveCode('')
    setLiveDiagnostics([])
    setProgress(0)
    setStreamError(null)
    setClarified(false)
    clarifiedRef.current = false
    setCelebrate(false)
    setActiveTab('schematic')
  }

  // ── Header status ───────────────────────────────────────────
  const blockingIssues = liveDiagnostics.filter((d) => d.severity === 'error').length
  const verified = design?.verified ?? false

  const statusText = isGenerating
    ? stages[stages.length - 1] ?? 'Starting…'
    : streamError
      ? streamError.slice(0, 70)
      : verified
        ? 'Manufacturing ready'
        : design
          ? `${blockingIssues} blocking · needs repair`
          : 'Describe your board to begin'

  return (
    <div className="flex h-svh min-h-0 flex-col overflow-hidden bg-white">
      <FireworksOverlay active={celebrate} />

      {/* ── Top bar ─────────────────────────────────────── */}
      <header className="flex h-11 shrink-0 items-center gap-3 border-b-2 border-black bg-white px-3">
        <div className="flex items-center gap-2">
          <div className="size-4 border-2 border-black bg-[#00E5FF] shadow-[2px_2px_0px_0px_black]" />
          <h1 className="font-black text-[13px] uppercase tracking-[0.18em]">
            PCB<span className="bg-black px-1 text-[#00E5FF]">COPILOT</span>
          </h1>
        </div>

        <div className="hidden h-5 w-px bg-black/20 sm:block" />

        <p
          className={`min-w-0 flex-1 truncate font-mono text-[11px] font-bold uppercase tracking-wider ${
            streamError ? 'text-red-600' : isGenerating ? 'text-black' : 'text-black/60'
          }`}
          title={statusText}
        >
          {isGenerating && (
            <span className="mr-1.5 inline-block size-2 bg-[#00E5FF] brutal-live-dot align-middle" />
          )}
          {statusText}
          {isGenerating && progress > 0 && <span className="ml-2 text-black/40">{progress}%</span>}
        </p>

        {hasDirect && (
          <button
            onClick={() => setEngine((e) => (e === 'direct' ? 'server' : 'direct'))}
            className={`h-7 border-2 border-black px-2 font-mono text-[10px] font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_black] transition-all hover:-translate-x-px hover:-translate-y-px ${
              engine === 'direct' ? 'bg-[#00E5FF]' : 'bg-white'
            }`}
            title={
              engine === 'direct'
                ? 'Browser calls Fireworks directly with your key (real API test)'
                : 'Server calls Fireworks (sandbox preview uses the local mock)'
            }
          >
            {engine === 'direct' ? '◈ DIRECT · REAL API' : '◈ SERVER'}
          </button>
        )}

        <button
          onClick={resetAll}
          className="h-7 border-2 border-black bg-white px-2 font-mono text-[10px] font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_black] transition-all hover:-translate-x-px hover:-translate-y-px"
          title="New design — clear conversation and canvas"
        >
          ⟲ NEW
        </button>
      </header>

      {/* ── Workspace ───────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Chat dock */}
        <aside className="flex h-[40vh] min-h-0 shrink-0 flex-col border-b-2 border-black lg:h-auto lg:w-[340px] lg:border-b-0 lg:border-r-2">
          <MascotStrip
            stages={stages}
            isGenerating={isGenerating}
            error={streamError}
            verified={verified}
          />
          <PromptChat
            messages={messages}
            isGenerating={isGenerating}
            onSubmit={handleGenerate}
            onClear={resetAll}
            stages={stages}
            liveCode={liveCode}
            liveDiagnostics={liveDiagnostics}
          />
        </aside>

        {/* Canvas */}
        <main className="min-h-0 min-w-0 flex-1">
          <CircuitViewer
            design={design}
            isGenerating={isGenerating}
            liveCode={liveCode}
            stages={stages}
            diagnostics={isGenerating ? liveDiagnostics : design?.diagnostics ?? liveDiagnostics}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            gridOn
          />
        </main>
      </div>

      {/* ── Status bar ──────────────────────────────────── */}
      <StatusBar engine={engine} design={design} isGenerating={isGenerating} />
    </div>
  )
}
