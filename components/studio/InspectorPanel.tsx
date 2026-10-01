'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CpuIcon,
  LayersIcon,
  XCircleIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { DesignDiagnostic, DesignResult } from '@/lib/design'
import { getManufacturingReadinessScore } from '@/lib/design'

type InspectorPanelProps = {
  design: DesignResult | null
  diagnostics: DesignDiagnostic[]
  isGenerating: boolean
  activeTool: string
}

type Section = 'properties' | 'layers' | 'problems'

/**
 * Right-hand inspector dock — properties, layer stack, live problem list.
 * Mirrors the dock layout of mainstream EDA tools.
 */
export function InspectorPanel({ design, diagnostics, isGenerating, activeTool }: InspectorPanelProps) {
  const [openSection, setOpenSection] = useState<Record<Section, boolean>>({
    properties: true,
    layers: true,
    problems: true,
  })

  const errors = diagnostics.filter((d) => d.severity === 'error')
  const warnings = diagnostics.filter((d) => d.severity === 'warning')
  const score = design ? getManufacturingReadinessScore(design) : 0

  const layers = useMemo(() => {
    const base = [
      { name: 'F.Cu', tone: 'bg-red-400', on: true },
      { name: 'B.Cu', tone: 'bg-blue-400', on: true },
      { name: 'F.Silk', tone: 'bg-white border border-black', on: true },
      { name: 'B.Silk', tone: 'bg-white border border-black', on: true },
      { name: 'F.Mask', tone: 'bg-purple-300', on: true },
      { name: 'Edge.Cuts', tone: 'bg-emerald-400', on: true },
    ]
    if ((design?.stats.pcbLayers ?? 1) > 2) {
      base.splice(2, 0, { name: 'In1.Cu', tone: 'bg-amber-400', on: true })
    }
    return base
  }, [design?.stats.pcbLayers])

  const toggle = (s: Section) => setOpenSection((prev) => ({ ...prev, [s]: !prev[s] }))

  return (
    <div className="studio-dock h-full">
      <div className="studio-panel-header">
        <span className="studio-panel-title">Inspector</span>
        <Badge variant="outline" className="h-4 px-1.5 text-[9px]">
          {activeTool.toUpperCase()}
        </Badge>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* ── Properties ─────────────────────────────── */}
        <SectionHeader
          open={openSection.properties}
          onToggle={() => toggle('properties')}
          icon={<CpuIcon className="size-3" />}
          title="Properties"
        />
        {openSection.properties && (
          <div className="border-b-2 border-black/10 p-2.5">
            {!design && !isGenerating ? (
              <p className="py-3 text-center font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                No board loaded
              </p>
            ) : (
              <dl className="space-y-1.5 font-mono text-[11px]">
                <Prop k="Board" v={boardSize(design)} />
                <Prop k="Layers" v={String(design?.stats.pcbLayers ?? 2)} />
                <Prop k="Components" v={String(design?.stats.components ?? '—')} />
                <Prop k="Nets" v={String(design?.stats.sourceTraces ?? '—')} />
                <Prop k="Traces" v={String(design?.stats.routedTraces ?? '—')} />
                <Prop k="Passes" v={String(design?.iterations ?? '—')} />
                <div className="flex items-center justify-between border-t border-dashed border-black/20 pt-1.5">
                  <dt className="text-[10px] font-black uppercase tracking-wider">Score</dt>
                  <dd>
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-16 border border-black bg-white">
                        <div
                          className={cn(
                            'h-full transition-all',
                            score >= 80 ? 'bg-emerald-400' : score >= 50 ? 'bg-amber-400' : 'bg-red-400',
                          )}
                          style={{ width: `${score}%` }}
                        />
                      </div>
                      <span className="font-black tabular-nums">{design ? score : '—'}</span>
                    </div>
                  </dd>
                </div>
              </dl>
            )}
            {design && (
              <p className="mt-2 border-l-2 border-[#00E5FF] bg-[#00E5FF]/10 px-2 py-1 text-[10px] leading-relaxed">
                {design.summary.slice(0, 180)}
                {design.summary.length > 180 ? '…' : ''}
              </p>
            )}
          </div>
        )}

        {/* ── Layers ─────────────────────────────────── */}
        <SectionHeader
          open={openSection.layers}
          onToggle={() => toggle('layers')}
          icon={<LayersIcon className="size-3" />}
          title="Layers"
        />
        {openSection.layers && (
          <div className="border-b-2 border-black/10 p-2.5">
            <ul className="space-y-1">
              {layers.map((layer) => (
                <li
                  key={layer.name}
                  className="flex items-center gap-2 border-2 border-black/80 bg-white px-1.5 py-1 shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,0.25)]"
                >
                  <span className={cn('size-3 shrink-0 border border-black', layer.tone)} />
                  <span className="font-mono text-[10px] font-black uppercase tracking-wider">
                    {layer.name}
                  </span>
                  <span className="ml-auto font-mono text-[9px] text-zinc-400">
                    {layer.name.endsWith('.Cu') ? 'copper' : 'tech'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Problems ───────────────────────────────── */}
        <SectionHeader
          open={openSection.problems}
          onToggle={() => toggle('problems')}
          icon={
            errors.length > 0 ? (
              <XCircleIcon className="size-3 text-red-500" />
            ) : (
              <CheckCircle2Icon className="size-3 text-emerald-500" />
            )
          }
          title={`Problems · ${diagnostics.length}`}
          badge={
            errors.length > 0 ? (
              <Badge variant="destructive" className="h-4 px-1.5 text-[9px]">
                {errors.length}
              </Badge>
            ) : warnings.length > 0 ? (
              <Badge variant="warning" className="h-4 px-1.5 text-[9px]">
                {warnings.length}
              </Badge>
            ) : design ? (
              <Badge variant="success" className="h-4 px-1.5 text-[9px]">
                CLEAN
              </Badge>
            ) : null
          }
        />
        {openSection.problems && (
          <div className="p-2.5">
            {diagnostics.length === 0 ? (
              <p className="py-3 text-center font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                {isGenerating ? 'Collecting diagnostics…' : 'No problems'}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {diagnostics.slice(0, 40).map((d, i) => (
                  <li
                    key={i}
                    className={cn(
                      'flex items-start gap-1.5 border-2 px-1.5 py-1 font-mono text-[10px] leading-4',
                      d.severity === 'error'
                        ? 'border-black bg-red-50 shadow-[1.5px_1.5px_0px_0px_#ef4444]'
                        : 'border-black/60 bg-amber-50 shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,0.2)]',
                    )}
                  >
                    {d.severity === 'error' ? (
                      <XCircleIcon className="mt-0.5 size-3 shrink-0 text-red-500" />
                    ) : (
                      <AlertTriangleIcon className="mt-0.5 size-3 shrink-0 text-amber-500" />
                    )}
                    <span className="min-w-0 break-words">{d.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SectionHeader({
  open,
  onToggle,
  icon,
  title,
  badge,
}: {
  open: boolean
  onToggle: () => void
  icon: React.ReactNode
  title: string
  badge?: React.ReactNode
}) {
  return (
    <button
      className="flex w-full items-center gap-1.5 bg-zinc-100 px-2 py-1.5 text-left hover:bg-zinc-200"
      onClick={onToggle}
    >
      <ChevronRightIcon
        className={cn('size-3 shrink-0 transition-transform', open && 'rotate-90')}
      />
      {icon}
      <span className="flex-1 font-mono text-[10px] font-black uppercase tracking-[0.14em]">
        {title}
      </span>
      {badge}
    </button>
  )
}

function Prop({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-[10px] font-black uppercase tracking-wider text-zinc-500">{k}</dt>
      <dd className="font-black tabular-nums">{v}</dd>
    </div>
  )
}

function boardSize(design: DesignResult | null) {
  if (!design?.stats.boardWidthMm) return '—'
  return `${design.stats.boardWidthMm} × ${design.stats.boardHeightMm} mm`
}
