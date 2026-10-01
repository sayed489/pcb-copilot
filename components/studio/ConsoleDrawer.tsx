'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon, TerminalSquareIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ConsoleLine } from '@/lib/chat'

type ConsoleDrawerProps = {
  lines: ConsoleLine[]
}

/**
 * Bottom console drawer — timestamped agent log like an EDA output window.
 */
export function ConsoleDrawer({ lines }: ConsoleDrawerProps) {
  const [open, setOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines, open])

  const last = lines[lines.length - 1]

  return (
    <div className="shrink-0 border-t-2 border-black bg-zinc-950">
      <button
        className="flex h-7 w-full items-center gap-2 px-2.5 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <TerminalSquareIcon className="size-3.5 text-[#00E5FF]" />
        <span className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[#00E5FF]">
          Console
        </span>
        <span className="font-mono text-[10px] text-white/40">
          {lines.length} line{lines.length === 1 ? '' : 's'}
        </span>
        {last && !open && (
          <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-white/50">
            {last.text}
          </span>
        )}
        <ChevronDownIcon
          className={cn('ml-auto size-3.5 text-white/60 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div
          ref={scrollRef}
          className="h-40 overflow-y-auto border-t-2 border-black/60 bg-black py-1"
        >
          {lines.length === 0 ? (
            <p className="console-line text-white/30">— no output yet —</p>
          ) : (
            lines.map((line) => (
              <div key={line.id} className="console-line">
                <span className="shrink-0 text-white/30 tabular-nums">
                  {new Date(line.at).toLocaleTimeString('en-GB', { hour12: false })}
                </span>
                <span
                  className={cn(
                    'shrink-0 uppercase',
                    line.level === 'error' && 'text-red-400',
                    line.level === 'warn' && 'text-amber-400',
                    line.level === 'ok' && 'text-emerald-400',
                    line.level === 'info' && 'text-[#00E5FF]',
                  )}
                >
                  {line.level === 'error' ? '✗' : line.level === 'ok' ? '✓' : line.level === 'warn' ? '!' : '›'}
                </span>
                <span
                  className={cn(
                    'min-w-0 break-all',
                    line.level === 'error' ? 'text-red-300' : 'text-white/75',
                  )}
                >
                  {line.text}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
