'use client'

import { useMemo } from 'react'
import { Mascot3D, type MascotState } from '@/components/studio/Mascot3D'
import { cn } from '@/lib/utils'

type MascotStripProps = {
  stages: string[]
  isGenerating: boolean
  error?: string | null
  verified?: boolean
}

/**
 * Compact storyline strip: Solder (3D mascot) + one-line narration
 * + five act dots. Sits at the top of the chat dock.
 */
export function MascotStrip({ stages, isGenerating, error, verified }: MascotStripProps) {
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

  const actIdx = useMemo(() => {
    if (!isGenerating && !verified) return -1
    const last = stages[stages.length - 1] ?? ''
    if (/manufactur|unlock|export/i.test(last)) return 4
    if (/erc|drc|check|repair|verif/i.test(last)) return 3
    if (/compil/i.test(last)) return 2
    if (/generat|tsx/i.test(last)) return 1
    if (/review|brief/i.test(last)) return 0
    return verified ? 5 : isGenerating ? 0 : -1
  }, [stages, isGenerating, verified])

  const narration = useMemo(() => {
    if (error) return error
    if (verified && !isGenerating) return 'Shipped — fabrication files unlocked.'
    if (!isGenerating) return 'Describe a board. I write the code, compile it, and run DRC.'
    return stages[stages.length - 1] ? `${stages[stages.length - 1]}…` : 'Warming up…'
  }, [error, verified, isGenerating, stages])

  return (
    <div className="flex shrink-0 items-stretch gap-2 border-b-2 border-black bg-zinc-50 p-2">
      <div
        className={cn(
          'shrink-0 border-2 border-black bg-black shadow-[2px_2px_0px_0px_black]',
          mascotState === 'idle' && 'mascot-float',
        )}
      >
        <Mascot3D state={mascotState} className="size-16" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
        <p
          className={cn(
            'line-clamp-2 font-mono text-[10px] leading-snug',
            error ? 'text-red-600 font-bold' : 'text-black/80',
          )}
          title={narration}
        >
          {narration}
        </p>
        <div className="flex gap-1" title="brief → draft → compile → verify → ship">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 flex-1 border border-black',
                i < actIdx ? 'bg-black' : i === actIdx ? 'bg-[#00E5FF] brutal-live-dot' : 'bg-white',
              )}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
