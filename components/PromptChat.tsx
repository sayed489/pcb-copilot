'use client'

import { useEffect, useRef, useState } from 'react'
import { CornerDownLeftIcon, SendIcon, Trash2Icon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/lib/chat'
import type { DesignDiagnostic } from '@/lib/design'
import { LiveGenerationStatus } from '@/components/LiveGenerationStatus'

type PromptChatProps = {
  messages: ChatMessage[]
  isGenerating: boolean
  onSubmit: (prompt: string) => void
  onClear?: () => void
  stages?: string[]
  liveCode?: string
  liveDiagnostics?: DesignDiagnostic[]
}

const EXAMPLES = [
  '5V USB-C sensor board, 40×25mm, Qwiic connector',
  'ESP32 dev board with LiPo charger + status LEDs',
  'Motor driver 12V 5A with current sense',
  'LED matrix 8×8 with shift registers',
]

export function PromptChat({
  messages,
  isGenerating,
  onSubmit,
  onClear,
  stages = [],
  liveCode,
  liveDiagnostics,
}: PromptChatProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
  const pendingQuestions = lastAssistant?.questions ?? []

  function submitPrompt(text?: string) {
    const prompt = (text ?? value).trim()
    if (!prompt || isGenerating) return
    onSubmit(prompt)
    setValue('')
  }

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [value])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, isGenerating])

  const userCount = messages.filter((m) => m.role === 'user').length

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-white">
      {/* Header */}
      <header className="flex h-8 shrink-0 items-center justify-between border-b-2 border-black bg-white px-2.5">
        <div className="flex items-center gap-2">
          <span className="studio-panel-title">Brief</span>
          <Badge variant="outline" className="h-4 px-1.5 text-[9px]">
            {userCount} input{userCount === 1 ? '' : 's'}
          </Badge>
          {isGenerating && (
            <Badge variant="live" className="h-4 px-1.5 text-[9px]">
              <span className="size-1.5 bg-[#00E5FF] brutal-live-dot" />
              LIVE
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              className="flex size-5 items-center justify-center border border-black/20 hover:bg-zinc-100"
              onClick={onClear}
              title="Clear conversation"
            >
              <Trash2Icon className="size-3" />
            </button>
          )}
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2.5">
        {messages.length === 0 ? (
          <div className="space-y-2.5">
            <div className="border-2 border-black bg-[#00E5FF]/15 p-2.5 shadow-[3px_3px_0px_0px_black]">
              <p className="font-mono text-[11px] font-bold leading-relaxed">
                Describe the board you need. The agent writes real{' '}
                <span className="bg-[#00E5FF] px-0.5">tscircuit TSX</span>, compiles it, runs
                ERC/DRC, repairs failures — and only then unlocks fab files.
              </p>
            </div>
            <p className="font-mono text-[9px] font-black uppercase tracking-[0.16em] text-zinc-400">
              Try one of these →
            </p>
            <div className="space-y-1.5">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  onClick={() => submitPrompt(example)}
                  disabled={isGenerating}
                  className="block w-full border-2 border-black bg-white px-2 py-1.5 text-left font-mono text-[10px] font-bold leading-tight shadow-[2px_2px_0px_0px_black] transition-all hover:-translate-x-px hover:-translate-y-px hover:bg-[#00E5FF] hover:shadow-[3px_3px_0px_0px_black] disabled:opacity-50"
                >
                  → {example}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) =>
              message.role === 'user' || message.role === 'assistant' ? (
                <div
                  key={message.id}
                  className={cn(
                    'max-w-[92%] border-2 border-black p-2 shadow-[3px_3px_0px_0px_black]',
                    message.role === 'user'
                      ? 'ml-auto bg-[#00E5FF]'
                      : 'mr-auto bg-white',
                  )}
                >
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="font-mono text-[9px] font-black uppercase tracking-[0.18em]">
                      {message.role === 'user' ? 'You' : 'Copilot'}
                    </span>
                    {message.createdAt && (
                      <span className="font-mono text-[9px] tabular-nums opacity-50">
                        {new Date(message.createdAt).toLocaleTimeString('en-GB', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        })}
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
                    {message.content}
                  </p>
                </div>
              ) : (
                <div
                  key={message.id}
                  className={cn(
                    'border-2 border-black px-2 py-1.5 font-mono text-[10px] font-black uppercase tracking-wider',
                    message.tone === 'error'
                      ? 'bg-red-500 text-white shadow-[2px_2px_0px_0px_black]'
                      : message.tone === 'success'
                        ? 'bg-emerald-400 text-black shadow-[2px_2px_0px_0px_black]'
                        : 'bg-black text-[#00E5FF] shadow-[2px_2px_0px_0px_#00E5FF]',
                  )}
                >
                  {message.content}
                </div>
              ),
            )}

            {(isGenerating || stages.length > 0) && (
              <LiveGenerationStatus
                isGenerating={isGenerating}
                stages={stages}
                currentCode={liveCode}
                diagnosticsCount={liveDiagnostics?.length}
              />
            )}
          </>
        )}
      </div>

      {/* Clarification quick-replies */}
      {pendingQuestions.length > 0 && !isGenerating && (
        <div className="shrink-0 border-t-2 border-black bg-[#00E5FF]/10 p-2">
          <p className="mb-1.5 font-mono text-[9px] font-black uppercase tracking-[0.16em]">
            Quick reply
          </p>
          <div className="flex flex-wrap gap-1.5">
            {pendingQuestions.map((question, i) => (
              <button
                key={i}
                onClick={() => submitPrompt(question)}
                disabled={isGenerating}
                className="border-2 border-black bg-white px-2 py-1 text-left font-mono text-[10px] font-bold shadow-[2px_2px_0px_0px_black] transition-all hover:-translate-x-px hover:-translate-y-px hover:bg-[#00E5FF] disabled:opacity-50"
              >
                {i + 1}. {question.length > 60 ? `${question.slice(0, 60)}…` : question}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Composer */}
      <form
        className="shrink-0 border-t-2 border-black bg-white p-2"
        onSubmit={(event) => {
          event.preventDefault()
          submitPrompt()
        }}
      >
        <div className="border-2 border-black shadow-[3px_3px_0px_0px_black] focus-within:shadow-[4px_4px_0px_0px_#00E5FF]">
          <textarea
            ref={textareaRef}
            rows={2}
            value={value}
            disabled={isGenerating}
            placeholder="e.g. 3.3V sensor board, 4 LEDs, Qwiic, 30×20mm…"
            aria-label="Circuit requirements"
            className="min-h-14 w-full resize-none bg-white p-2 font-mono text-[11px] leading-relaxed outline-none placeholder:text-zinc-400 disabled:opacity-50"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey) return
              if (event.nativeEvent.isComposing || event.keyCode === 229) return
              event.preventDefault()
              submitPrompt()
            }}
          />
          <div className="flex items-center justify-between border-t-2 border-black bg-zinc-50 px-2 py-1">
            <div className="flex items-center gap-1.5">
              <Kbd className="border border-black bg-white px-1 text-[9px]">
                <CornerDownLeftIcon className="size-2.5" />
              </Kbd>
              <span className="hidden font-mono text-[9px] font-black uppercase tracking-wider text-zinc-500 sm:inline">
                send · shift+enter = newline
              </span>
            </div>
            <Button
              type="submit"
              variant="cyan"
              size="xs"
              disabled={isGenerating || value.trim().length === 0}
              className="h-6 text-[10px]"
            >
              {isGenerating ? (
                <Spinner className="size-3" />
              ) : (
                <SendIcon className="size-3" />
              )}
              {isGenerating ? 'WORKING' : 'SEND'}
            </Button>
          </div>
        </div>
      </form>
    </section>
  )
}
