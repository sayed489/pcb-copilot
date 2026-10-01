'use client'

import { useMemo } from 'react'
import { Mascot3D, type MascotState } from '@/components/studio/Mascot3D'
import { cn } from '@/lib/utils'

type StorylinePanelProps = {
  stages: string[]
  isGenerating: boolean
  error?: string | null
  verified?: boolean
}

type Beat = { id: string; label: string; match: RegExp }

/** The five-act story of every board we ship. */
const BEATS: Beat[] = [
  { id: 'brief', label: 'Read the brief', match: /review|brief|requirement/i },
  { id: 'draft', label: 'Draft the circuit', match: /generat|tsx|fireworks/i },
  { id: 'compile', label: 'Compile to copper', match: /compil|circuit json/i },
  { id: 'verify', label: 'Run ERC / DRC', match: /erc|drc|check|verif/i },
  { id: 'ship', label: 'Unlock fabrication', match: /manufactur|export|unlock/i },
]

/**
 * Storyline dock: the mascot "Solder" narrates the generation pipeline
 * as a five-act story, with a live act indicator.
 */
export function StorylinePanel({ stages, isGenerating, error, verified }: StorylinePanelProps) {
  const mascotState = useMemo<MascotState>(() => {
    if (error) return 'error'
    if (verified && !isGenerating) return 'success'
    if (!isGenerating) return 'idle'
    const last = stages[stages.length - 1] ?? ''
    if (/review|brief/i.test(last)) return 'thinking'
    if (/generat|tsx/i.test(last)) return 'building'
    if (/compil|check|erc|drc|repair|verif/i.test(last)) return 'routing'
    return 'thinking'
  }, [error, verified, isGenerating, stages])

  const activeIdx = useMemo(() => {
    if (!isGenerating && !verified) return -1
    const last = stages[stages.length - 1] ?? ''
    for (let i = BEATS.length - 1; i >= 0; i--) {
      if (BEATS[i].match.test(last)) return i
    }
    if (verified) return BEATS.length
    return isGenerating ? 0 : -1
  }, [stages, isGenerating, verified])

  const narration = useMemo(() => {
    if (error) return error
    if (verified && !isGenerating) return 'Board shipped — fabrication files unlocked.'
    if (!isGenerating) return 'Describe a board and I’ll write, compile, and verify real tscircuit code.'
    const last = stages[stages.length - 1]
    return last ? `${last}…` : 'Warming up the fab line…'
  }, [error, verified, isGenerating, stages])

  return (
    <div className="studio-dock border-b-2 border-black">
      <div className="studio-panel-header">
        <span className="studio-panel-title">Storyline</span>
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-black/40">
          with Solder
        </span>
      </div>

      <div className="flex gap-2 p-2.5">
        {/* Mascot */}
        <div className="relative shrink-0">
          <div
            className={cn(
              'border-2 border-black bg-black shadow-[3px_3px_0px_0px_black]',
              mascotState === 'idle' && 'mascot-float',
            )}
          >
            <Mascot3D state={mascotState} className="size-24" />
          </div>
          <span
            className={cn(
              'absolute -bottom-1.5 -right-1.5 border-2 border-black px-1 py-px font-mono text-[8px] font-black uppercase',
              mascotState === 'error'
                ? 'bg-red-500 text-white'
                : mascotState === 'success'
                  ? 'bg-emerald-400 text-black'
                  : 'bg-[#00E5FF] text-black',
            )}
          >
            {mascotState}
          </span>
        </div>

        {/* Speech bubble + acts */}
        <div className="min-w-0 flex-1">
          <div className="relative border-2 border-black bg-white px-2.5 py-2 shadow-[3px_3px_0px_0px_black]">
            <p
              className={cn(
                'font-mono text-[11px] leading-snug',
                error ? 'text-red-600' : 'text-black',
              )}
            >
              {narration}
            </p>
          </div>

          {/* Act indicators */}
          <ol className="mt-2 flex gap-1">
            {BEATS.map((beat, i) => {
              const state =
                i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'todo'
              return (
                <li
                  key={beat.id}
                  title={beat.label}
                  className={cn(
                    'h-1.5 flex-1 border border-black transition-colors',
                    state === 'done' && 'bg-black',
                    state === 'active' && 'bg-[#00E5FF] brutal-live-dot',
                    state === 'todo' && 'bg-white',
                  )}
                />
              )
            })}
          </ol>
          <div className="mt-1 flex justify-between font-mono text-[8px] font-bold uppercase tracking-widest text-black/40">
            <span>Brief</span>
            <span>Draft</span>
            <span>Compile</span>
            <span>Verify</span>
            <span>Ship</span>
          </div>
        </div>
      </div>
    </div>
  )
}
