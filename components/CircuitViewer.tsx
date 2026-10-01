'use client'

import { type ReactNode, useState, useEffect, useMemo } from 'react'
import {
  CheckCircle2Icon,
  Code2Icon,
  DownloadIcon,
  LayersIcon,
  ShieldAlertIcon,
  ZapIcon,
  EyeIcon,
  BoxIcon,
  FileCodeIcon,
  ClipboardCheckIcon,
} from 'lucide-react'

import { PcbView } from '@/components/PcbView'
import { SchematicView } from '@/components/SchematicView'
import { ThreeDView } from '@/components/ThreeDView'
import { ReviewPanel } from '@/components/ReviewPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BrutalCard } from '@/components/ui/brutal-card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { cn } from '@/lib/utils'
import type { DesignResult, DesignDiagnostic } from '@/lib/design'
import { MANUFACTURING_BUNDLE_FILENAME } from '@/lib/exports'

type CircuitViewerProps = {
  design: DesignResult | null
  isGenerating: boolean
  liveCode?: string
  stages?: string[]
  diagnostics?: DesignDiagnostic[]
  activeTab?: string
  onTabChange?: (tab: string) => void
  gridOn?: boolean
}

const DOC_TABS = [
  { id: 'schematic', label: 'Schematic', icon: EyeIcon },
  { id: 'pcb', label: 'PCB', icon: LayersIcon },
  { id: '3d', label: '3D', icon: BoxIcon },
  { id: 'source', label: 'Source', icon: FileCodeIcon },
  { id: 'review', label: 'Checks', icon: ClipboardCheckIcon },
] as const

export function CircuitViewer({
  design,
  isGenerating,
  liveCode,
  stages = [],
  diagnostics,
  activeTab: controlledTab,
  onTabChange,
  gridOn = true,
}: CircuitViewerProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [isReviewing, setIsReviewing] = useState(false)
  const [reviewData, setReviewData] = useState<any>(null)
  const [internalTab, setInternalTab] = useState('schematic')

  const activeTab = controlledTab ?? internalTab
  const setActiveTab = (t: string) => {
    if (controlledTab === undefined) setInternalTab(t)
    onTabChange?.(t)
  }

  // Auto-switch to PCB when the design lands (the "hero" view)
  useEffect(() => {
    if (design && !isGenerating && controlledTab === undefined) {
      setInternalTab('pcb')
    }
  }, [design, isGenerating, controlledTab])

  async function downloadManufacturingBundle() {
    if (!design?.verified || isExporting) return
    setIsExporting(true)
    setExportError(null)
    try {
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
        throw new Error(payload?.error ?? 'Manufacturing export failed.')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = MANUFACTURING_BUNDLE_FILENAME
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Export failed.')
    } finally {
      setIsExporting(false)
    }
  }

  async function runDeepReview() {
    if (!design || isReviewing) return
    setIsReviewing(true)
    try {
      const response = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tsx: design.tsx }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? 'Review failed')
      }
      setReviewData(await response.json())
    } catch (error) {
      console.error('Review failed:', error)
    } finally {
      setIsReviewing(false)
    }
  }

  const errorCount = diagnostics?.filter((d) => d.severity === 'error').length ?? 0

  const content = useMemo(() => {
    if (isGenerating) {
      return <GeneratingPane stages={stages} liveCode={liveCode} diagnostics={diagnostics} />
    }
    if (!design) {
      return <WelcomePane onPickExample={undefined} />
    }
    switch (activeTab) {
      case 'pcb':
        return (
          <Pane>
            <PcbView circuitJson={design.circuitJson} />
          </Pane>
        )
      case '3d':
        return (
          <Pane>
            <ThreeDView circuitJson={design.circuitJson} />
          </Pane>
        )
      case 'source':
        return <SourcePane design={design} diagnostics={diagnostics} />
      case 'review':
        return (
          <Pane scroll>
            <ReviewPanel design={design} onRunReview={runDeepReview} isReviewing={isReviewing} />
            {reviewData && (
              <div className="mt-3 border-2 border-black bg-black p-3 shadow-[3px_3px_0px_0px_#00E5FF]">
                <p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[#00E5FF]">
                  Deep review · score {Math.round(reviewData.score ?? 0)}%
                </p>
                <p className="mt-1 font-mono text-[11px] text-white/70">
                  {reviewData.manufacturingReady
                    ? 'Manufacturing ready.'
                    : `${reviewData.categorized?.errors?.length ?? 0} blocking issue(s) remain.`}
                </p>
              </div>
            )}
          </Pane>
        )
      default:
        return (
          <Pane>
            <SchematicView circuitJson={design.circuitJson} />
          </Pane>
        )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, design, isGenerating, stages, liveCode, diagnostics, reviewData, isReviewing])

  return (
    <section className="flex h-full min-h-0 flex-col bg-white">
      {/* Document tabs */}
      <div className="flex h-8 shrink-0 items-stretch border-b-2 border-black bg-zinc-100">
        <div className="flex min-w-0 flex-1 overflow-x-auto">
          {DOC_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className="doc-tab"
              data-active={activeTab === id && !isGenerating}
              onClick={() => setActiveTab(id)}
            >
              <Icon className="size-3.5" />
              {label}
              {id === 'review' && errorCount > 0 && (
                <span className="ml-0.5 border border-black bg-red-500 px-1 text-[9px] text-white">
                  {errorCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab-right controls */}
        <div className="flex shrink-0 items-center gap-1.5 border-l-2 border-black px-2">
          {isGenerating ? (
            <Badge variant="live" className="h-5 text-[9px]">
              <span className="size-1.5 bg-[#00E5FF] brutal-live-dot" />
              COMPILING
            </Badge>
          ) : design ? (
            design.verified ? (
              <Badge variant="success" className="h-5 text-[9px]">
                <CheckCircle2Icon className="size-3" />
                VERIFIED
              </Badge>
            ) : (
              <Badge variant="destructive" className="h-5 text-[9px]">
                <ShieldAlertIcon className="size-3" />
                BLOCKED
              </Badge>
            )
          ) : null}
          {design?.verified && (
            <Button
              size="xs"
              variant="cyan"
              className="h-5 text-[9px]"
              disabled={isExporting}
              onClick={downloadManufacturingBundle}
            >
              <DownloadIcon className="size-3" />
              {isExporting ? 'PACKING…' : 'FAB BUNDLE'}
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className={cn('min-h-0 flex-1 overflow-hidden studio-grid-bg', !gridOn && 'bg-white')}>
        {content}
      </div>

      {exportError && (
        <div className="border-t-2 border-black bg-red-500 px-3 py-1 font-mono text-[10px] font-bold text-white">
          ⚠ {exportError}
        </div>
      )}
    </section>
  )
}

/* ── Panes ─────────────────────────────────────────────────── */

function Pane({ children, scroll }: { children: ReactNode; scroll?: boolean }) {
  return (
    <div className={cn('size-full min-h-0', scroll ? 'overflow-y-auto p-3' : 'overflow-hidden')}>
      {children}
    </div>
  )
}

function WelcomePane(_: { onPickExample?: undefined }) {
  return (
    <div className="flex size-full items-center justify-center p-6">
      <Empty className="max-w-md rounded-none border-2 border-dashed border-black/30 bg-white/80">
        <EmptyHeader>
          <EmptyMedia
            variant="icon"
            className="border-2 border-black bg-[#00E5FF] shadow-[3px_3px_0px_0px_black]"
          >
            <LayersIcon className="text-black" />
          </EmptyMedia>
          <EmptyTitle className="font-black uppercase tracking-widest">
            Canvas empty
          </EmptyTitle>
          <EmptyDescription className="font-mono text-xs leading-relaxed">
            Send a brief in the left dock. Schematic, layout, 3D and checks appear here the
            moment the agent compiles a design.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}

function GeneratingPane({
  stages,
  liveCode,
  diagnostics,
}: {
  stages: string[]
  liveCode?: string
  diagnostics?: DesignDiagnostic[]
}) {
  const current = stages[stages.length - 1] ?? 'Initializing agent…'
  const errCount = diagnostics?.filter((d) => d.severity === 'error').length ?? 0

  return (
    <div className="flex size-full flex-col">
      {/* Big stage */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        {/* Spinning trace ring */}
        <div className="relative size-28">
          <div className="absolute inset-0 border-[3px] border-black bg-white shadow-[5px_5px_0px_0px_black]" />
          <div className="absolute inset-2 border-[3px] border-dashed border-[#00E5FF] animate-spin [animation-duration:3s]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <ZapIcon className="size-8 text-black brutal-animate-pulse" />
          </div>
        </div>

        <div className="max-w-lg text-center">
          <p className="font-black text-sm uppercase tracking-[0.2em]">{current}</p>
          <p className="mt-1 font-mono text-[11px] text-zinc-500">
            Fireworks is writing tscircuit TSX → compiling → ERC/DRC → repairing
          </p>
        </div>

        {/* Stage chips */}
        <div className="flex max-w-2xl flex-wrap justify-center gap-1.5">
          {stages.slice(-6).map((stage, idx) => (
            <span
              key={`${stage}-${idx}`}
              className={cn(
                'border-2 border-black px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-wider',
                idx === stages.slice(-6).length - 1
                  ? 'bg-[#00E5FF] shadow-[2px_2px_0px_0px_black]'
                  : 'bg-white text-black/50',
              )}
            >
              {stage}
            </span>
          ))}
        </div>

        {errCount > 0 && (
          <Badge variant="destructive" className="text-[10px]">
            {errCount} issue{errCount === 1 ? '' : 's'} queued for repair
          </Badge>
        )}
      </div>

      {/* Live code strip */}
      {liveCode && (
        <div className="h-28 shrink-0 overflow-hidden border-t-2 border-black bg-zinc-950">
          <div className="flex items-center gap-2 border-b border-white/10 px-2 py-0.5">
            <span className="size-1.5 bg-[#00E5FF] brutal-live-dot" />
            <span className="font-mono text-[9px] font-black uppercase tracking-[0.16em] text-[#00E5FF]">
              Live TSX
            </span>
          </div>
          <pre className="h-[calc(100%-18px)] overflow-hidden p-2 font-mono text-[10px] leading-4 text-emerald-300">
            {liveCode.slice(-700)}
            <span className="ml-0.5 inline-block h-3 w-1.5 bg-[#00E5FF] brutal-animate-blink" />
          </pre>
        </div>
      )}
    </div>
  )
}

function SourcePane({ design, diagnostics }: { design: DesignResult; diagnostics?: DesignDiagnostic[] }) {
  const stats = [
    ['Components', design.stats.components],
    ['Nets', design.stats.sourceTraces],
    ['Routed', design.stats.routedTraces],
    ['Passes', design.iterations],
  ] as const

  return (
    <div className="size-full overflow-y-auto p-3">
      <BrutalCard
        variant={design.verified ? 'cyan' : 'white'}
        shadow="default"
        className="flex flex-wrap items-start justify-between gap-3"
      >
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            {design.verified ? (
              <CheckCircle2Icon className="size-5" />
            ) : (
              <ShieldAlertIcon className="size-5" />
            )}
            <h2 className="font-black text-sm uppercase tracking-wider">
              {design.verified ? 'Automated checks passed' : 'Manufacturing blocked'}
            </h2>
            <Badge variant={design.verified ? 'success' : 'destructive'}>
              {design.verified ? 'READY' : 'BLOCKED'}
            </Badge>
          </div>
          <p className="max-w-2xl font-mono text-xs leading-relaxed">{design.summary}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{design.stats.components} COMPS</Badge>
            <Badge variant="outline">{design.stats.sourceTraces} NETS</Badge>
            <Badge variant="outline">{design.stats.routedTraces} ROUTED</Badge>
            <Badge variant="outline">{design.iterations} PASSES</Badge>
          </div>
        </div>
      </BrutalCard>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div
            key={label}
            className="border-2 border-black bg-white p-2 shadow-[2px_2px_0px_0px_black]"
          >
            <p className="font-mono text-[9px] font-black uppercase tracking-wider text-zinc-500">
              {label}
            </p>
            <p className="font-black text-xl">{value}</p>
          </div>
        ))}
      </div>

      {diagnostics && diagnostics.length > 0 && (
        <BrutalCard variant="white" shadow="sm" padding="sm" className="mt-3">
          <div className="flex items-center gap-2">
            <ZapIcon className="size-4" />
            <span className="font-mono text-xs font-black uppercase">
              Diagnostics: {diagnostics.length}
            </span>
          </div>
          <div className="mt-2 max-h-24 overflow-auto">
            {diagnostics.slice(0, 5).map((d, i) => (
              <div key={i} className="font-mono text-[11px]">
                [{d.severity}] {d.message.slice(0, 100)}
              </div>
            ))}
          </div>
        </BrutalCard>
      )}

      <BrutalCard variant="white" shadow="sm" padding="none" className="mt-3 overflow-hidden">
        <div className="flex items-center justify-between border-b-2 border-black bg-black px-3 py-1.5">
          <h3 className="flex items-center gap-2 font-mono text-[11px] font-black uppercase tracking-widest text-[#00E5FF]">
            <Code2Icon className="size-3.5" /> tscircuit TSX · {design.tsx.length} chars
          </h3>
        </div>
        <pre className="max-h-80 overflow-auto bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-100">
          <code>{design.tsx}</code>
        </pre>
      </BrutalCard>

      <p className="mt-3 border-l-4 border-[#00E5FF] bg-[#00E5FF]/10 p-2 font-mono text-[10px] leading-relaxed">
        <strong>MANUFACTURING DISCLAIMER:</strong> Automated verification is a gate, not a
        substitute for qualified review of datasheets, footprints, thermal limits, EMC,
        regulatory compliance, and fabricator stack-up.
      </p>
    </div>
  )
}
