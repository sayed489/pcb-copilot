'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { CircuitViewer } from '@/components/CircuitViewer'
import { PromptChat } from '@/components/PromptChat'
import { ConsoleDrawer } from '@/components/studio/ConsoleDrawer'
import { FireworksOverlay } from '@/components/studio/FireworksOverlay'
import { InspectorPanel } from '@/components/studio/InspectorPanel'
import { MenuBar } from '@/components/studio/MenuBar'
import { StatusBar } from '@/components/studio/StatusBar'
import { StorylinePanel } from '@/components/studio/StorylinePanel'
import { Toolbar, type ToolId } from '@/components/studio/Toolbar'
import type { ChatMessage, ConsoleLine } from '@/lib/chat'
import type { DesignResult, DesignStreamEvent, DesignDiagnostic } from '@/lib/design'

const MODEL_LABEL = 'GLM 5.3 FLASH'

export default function Page() {
  // ── Design state ────────────────────────────────────────────
  const [design, setDesign] = useState<DesignResult | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([])
  const [stages, setStages] = useState<string[]>([])
  const [liveCode, setLiveCode] = useState('')
  const [liveDiagnostics, setLiveDiagnostics] = useState<DesignDiagnostic[]>([])
  const [progress, setProgress] = useState(0)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [celebrate, setCelebrate] = useState(false)
  const [clarified, setClarified] = useState(false)

  // ── Studio UI state ─────────────────────────────────────────
  const [activeTool, setActiveTool] = useState<ToolId>('select')
  const [gridOn, setGridOn] = useState(true)
  const [snapOn, setSnapOn] = useState(true)
  const [activeTab, setActiveTab] = useState('schematic')
  const [cursor, setCursor] = useState({ x: 0, y: 0 })

  const abortControllerRef = useRef<AbortController | null>(null)
  const clarifiedRef = useRef(false)

  const log = useCallback((level: ConsoleLine['level'], text: string) => {
    setConsoleLines((prev) => [
      ...prev.slice(-400),
      { id: crypto.randomUUID(), at: Date.now(), level, text },
    ])
  }, [])

  // Boot log
  useEffect(() => {
    log('info', `PCB Copilot studio online · engine: Fireworks ${MODEL_LABEL}`)
  }, [log])

  // Celebration auto-off
  useEffect(() => {
    if (!celebrate) return
    const t = setTimeout(() => setCelebrate(false), 9000)
    return () => clearTimeout(t)
  }, [celebrate])

  const addMessage = useCallback((message: Omit<ChatMessage, 'id'>) => {
    setMessages((current) => [
      ...current,
      { ...message, id: crypto.randomUUID(), createdAt: Date.now() },
    ])
  }, [])

  // ── Generation ──────────────────────────────────────────────
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
    setProgress(0)

    const wasClarified = clarifiedRef.current
    log('info', `brief submitted (${prompt.length} chars${wasClarified ? ', post-clarification' : ''})`)

    const addStage = (stage: string) => {
      setStages((prev) => {
        if (prev[prev.length - 1] === stage) return prev
        const next = [...prev, stage].slice(-12)
        return next
      })
      log('info', stage)
      setProgress((p) => {
        if (stage.includes('Reviewing')) return Math.max(p, 15)
        if (stage.includes('Generating')) return Math.max(p, 35)
        if (stage.includes('Compiling')) return Math.max(p, 60)
        if (stage.includes('Repairing')) return Math.max(p, 78)
        if (stage.includes('Verification passed')) return 100
        return p
      })
    }

    try {
      const response = await fetch('/api/design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages
            .filter((message) => message.role === 'user' || message.role === 'assistant')
            .slice(-12)
            .map((message) =>
              message.role === 'assistant' ? `Copilot: ${message.content}` : message.content,
            ),
          allowClarification: !clarifiedRef.current,
        }),
        signal: abortController.signal,
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
            log('info', `live preview: ${event.design.stats.components} comps`)
            break
          case 'diagnostics': {
            setLiveDiagnostics(event.diagnostics)
            const errs = event.diagnostics.filter((d) => d.severity === 'error').length
            if (errs > 0) log('warn', `${errs} blocking issue(s) in current pass`)
            break
          }
          case 'clarification': {
            setClarified(true)
            clarifiedRef.current = true
            const content =
              event.questions.length === 1
                ? `I need one detail before routing:\n1. ${event.questions[0]}`
                : `I need ${event.questions.length} critical details before routing:\n${event.questions
                    .map((q, i) => `${i + 1}. ${q}`)
                    .join('\n')}`
            addMessage({
              role: 'assistant',
              content,
              questions: event.questions,
            })
            log('warn', `clarification requested: ${event.questions.length} question(s)`)
            break
          }
          case 'result': {
            setDesign(event.design)
            setLiveDiagnostics(event.design.diagnostics)
            setProgress(100)
            setActiveTab(event.design.verified ? 'pcb' : 'review')
            if (event.design.verified) {
              addMessage({
                role: 'status',
                content: `Verified after ${event.design.iterations} pass${event.design.iterations === 1 ? '' : 'es'} · ${event.design.stats.components} comps · ${event.design.stats.routedTraces} traces routed`,
                tone: 'success',
              })
              log('ok', `verification PASSED (${event.design.iterations} iteration(s))`)
              setCelebrate(true)
            } else {
              const blocking = event.design.diagnostics.filter(
                (d) => d.severity === 'error',
              ).length
              addMessage({
                role: 'status',
                content: `Generated with ${blocking} blocking issue(s) — open the Checks tab for details`,
                tone: 'error',
              })
              log('error', `verification failed: ${blocking} blocking issue(s)`)
            }
            break
          }
          case 'error':
            // Do NOT throw — record it and let the loop drain cleanly so
            // the message actually reaches the user (this was the old bug:
            // the error was thrown inside the parse try/catch and swallowed).
            fatalError = event.message
            log('error', event.message)
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
            } catch (parseError) {
              log('warn', `bad stream frame: ${String(parseError).slice(0, 80)}`)
            }
            if (fatalError) break
          }
        }
        if (done) break
        if (fatalError) break
      }

      if (fatalError) {
        setStreamError(fatalError)
        addMessage({ role: 'status', content: `✗ ${fatalError}`, tone: 'error' })
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        addMessage({ role: 'status', content: 'Generation aborted', tone: 'error' })
        log('warn', 'aborted by user')
        return
      }
      const message = error instanceof Error ? error.message : 'Generation failed'
      setStreamError(message)
      addMessage({ role: 'status', content: `✗ ${message}`, tone: 'error' })
      log('error', message)
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
    setConsoleLines([
      { id: crypto.randomUUID(), at: Date.now(), level: 'info', text: 'workspace reset' },
    ])
  }

  async function handleExport() {
    if (!design?.verified) return
    // Reuse the viewer's export path via a synthetic click on the FAB button:
    // simplest is to call the API here directly.
    try {
      log('info', 'packaging manufacturing bundle…')
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tsx: design.tsx,
          summary: design.summary,
          assumptions: design.assumptions,
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? 'Export failed')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'pcb-copilot-fab-bundle.zip'
      a.click()
      URL.revokeObjectURL(url)
      log('ok', 'fab bundle downloaded')
    } catch (error) {
      log('error', error instanceof Error ? error.message : 'Export failed')
    }
  }

  async function handleReview() {
    if (!design) return
    try {
      log('info', 'running deep review…')
      const response = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tsx: design.tsx }),
      })
      if (!response.ok) throw new Error('Review failed')
      const data = await response.json()
      log(data.manufacturingReady ? 'ok' : 'warn', `deep review score: ${Math.round(data.score)}%`)
      setActiveTab('review')
    } catch (error) {
      log('error', error instanceof Error ? error.message : 'Review failed')
    }
  }

  const blockingIssues = liveDiagnostics.filter((d) => d.severity === 'error').length
  const verified = design?.verified ?? false

  const statusText = isGenerating
    ? stages[stages.length - 1] ?? 'Agent starting…'
    : streamError
      ? `Error: ${streamError.slice(0, 60)}`
      : verified
        ? 'Manufacturing ready'
        : design
          ? `${blockingIssues} blocking · needs repair`
          : 'Awaiting brief'

  const statusTone = isGenerating
    ? 'live'
    : streamError || blockingIssues > 0
      ? 'error'
      : verified
        ? 'ok'
        : 'idle'

  return (
    <div
      className="flex h-svh min-h-0 flex-col overflow-hidden bg-white"
      onPointerMove={(e) => {
        // Studio-style live coordinates (mm, rough 1:1 mapping)
        const rect = e.currentTarget.getBoundingClientRect()
        setCursor({
          x: ((e.clientX - rect.left - rect.width / 2) / 16) * 1.0,
          y: ((rect.bottom - e.clientY - rect.height / 2) / 16) * 1.0,
        })
      }}
    >
      {/* Celebration fireworks (on verified) */}
      <FireworksOverlay active={celebrate} />

      {/* ── Menu bar ─────────────────────────────────────────── */}
      <MenuBar
        statusText={statusText}
        statusTone={statusTone}
        onNewDesign={resetAll}
        onExport={handleExport}
        onRunReview={handleReview}
        onGotoTab={setActiveTab}
        exportEnabled={verified}
        hasDesign={Boolean(design)}
      />

      {/* ── Toolbar ──────────────────────────────────────────── */}
      <Toolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        gridOn={gridOn}
        onToggleGrid={() => setGridOn((g) => !g)}
        snapOn={snapOn}
        onToggleSnap={() => setSnapOn((s) => !s)}
        isGenerating={isGenerating}
        progress={progress}
        hasBrief={messages.some((m) => m.role === 'user')}
        onGenerate={() => {
          const last = [...messages].reverse().find((m) => m.role === 'user')
          if (last && !isGenerating) handleGenerate(last.content)
        }}
        onExport={handleExport}
        onReview={handleReview}
        exportEnabled={verified}
        hasDesign={Boolean(design)}
      />

      {/* ── Workspace ────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Left dock: storyline + brief chat */}
        <aside className="flex h-[38vh] min-h-0 shrink-0 flex-col border-b-2 border-black lg:h-auto lg:w-[330px] lg:border-b-0 lg:border-r-2">
          <StorylinePanel
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

        {/* Center: document canvas */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <CircuitViewer
            design={design}
            isGenerating={isGenerating}
            liveCode={liveCode}
            stages={stages}
            diagnostics={isGenerating ? liveDiagnostics : design?.diagnostics ?? liveDiagnostics}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            gridOn={gridOn}
          />
          <ConsoleDrawer lines={consoleLines} />
        </main>

        {/* Right dock: inspector */}
        <aside className="hidden h-full min-h-0 w-[264px] shrink-0 border-l-2 border-black lg:block">
          <InspectorPanel
            design={design}
            diagnostics={isGenerating ? liveDiagnostics : design?.diagnostics ?? []}
            isGenerating={isGenerating}
            activeTool={activeTool}
          />
        </aside>
      </div>

      {/* ── Status bar ───────────────────────────────────────── */}
      <StatusBar
        cursor={cursor}
        snapOn={snapOn}
        gridSizeMm={gridOn ? 0.5 : 1}
        design={design}
        isGenerating={isGenerating}
        model={MODEL_LABEL}
      />
    </div>
  )
}
