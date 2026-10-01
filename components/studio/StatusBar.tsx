'use client'

import { cn } from '@/lib/utils'
import type { DesignResult } from '@/lib/design'

type StatusBarProps = {
  cursor: { x: number; y: number }
  snapOn: boolean
  gridSizeMm: number
  design: DesignResult | null
  isGenerating: boolean
  model: string
}

export function StatusBar({
  cursor,
  snapOn,
  gridSizeMm,
  design,
  isGenerating,
  model,
}: StatusBarProps) {
  const errors = design?.diagnostics.filter((d) => d.severity === 'error').length ?? 0
  const warnings = design?.diagnostics.filter((d) => d.severity === 'warning').length ?? 0

  const drcTone = !design
    ? 'text-zinc-500'
    : errors > 0
      ? 'text-red-600 font-black'
      : warnings > 0
        ? 'text-amber-600 font-black'
        : 'text-emerald-600 font-black'

  return (
    <footer className="flex h-7 shrink-0 items-stretch border-t-2 border-black bg-white font-mono text-[10px] font-bold uppercase tracking-wider">
      <Cell>{model}</Cell>
      <Cell separator>
        X <span className="tabular-nums">{cursor.x.toFixed(2)}</span> · Y{' '}
        <span className="tabular-nums">{cursor.y.toFixed(2)}</span> mm
      </Cell>
      <Cell separator>Grid {gridSizeMm}mm</Cell>
      <Cell separator>{snapOn ? 'Snap ON' : 'Snap OFF'}</Cell>
      <Cell separator>
        {design ? `${design.stats.components} comps` : '— comps'}
      </Cell>
      <Cell separator>
        {design ? `${design.stats.routedTraces}/${design.stats.sourceTraces} routed` : '— routed'}
      </Cell>
      <div className={cn('flex items-center gap-1.5 border-r-2 border-black px-2.5', drcTone)}>
        <span className="size-1.5 bg-current" />
        {isGenerating ? (
          'DRC RUNNING'
        ) : !design ? (
          'DRC IDLE'
        ) : errors > 0 ? (
          `DRC ${errors} ERR`
        ) : warnings > 0 ? (
          `DRC OK · ${warnings} WARN`
        ) : (
          'DRC PASS'
        )}
      </div>
      <div className="ml-auto flex items-center gap-1.5 bg-black px-3 text-[#00E5FF]">
        <span className={cn('size-1.5 bg-current', isGenerating && 'brutal-live-dot')} />
        {isGenerating ? 'Agent running' : design?.verified ? 'Manufacturing ready' : 'Ready'}
      </div>
    </footer>
  )
}

function Cell({ children, separator }: { children: React.ReactNode; separator?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 px-2.5 text-black/70',
        separator && 'border-r-2 border-black/15',
      )}
    >
      {children}
    </div>
  )
}
