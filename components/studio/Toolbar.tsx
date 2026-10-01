'use client'

import {
  MousePointerIcon,
  RulerIcon,
  RouteIcon,
  Grid3x3Icon,
  MagnetIcon,
  ZapIcon,
  DownloadIcon,
  ClipboardCheckIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToolId = 'select' | 'route' | 'measure' | 'grid' | 'snap'

type ToolbarProps = {
  activeTool: ToolId
  onToolChange: (t: ToolId) => void
  gridOn: boolean
  onToggleGrid: () => void
  snapOn: boolean
  onToggleSnap: () => void
  isGenerating: boolean
  progress: number
  hasBrief?: boolean
  onGenerate: () => void
  onExport: () => void
  onReview: () => void
  exportEnabled: boolean
  hasDesign: boolean
}

const TOOLS: Array<{ id: ToolId; label: string; icon: typeof MousePointerIcon }> = [
  { id: 'select', label: 'Select', icon: MousePointerIcon },
  { id: 'route', label: 'Route', icon: RouteIcon },
  { id: 'measure', label: 'Measure', icon: RulerIcon },
]

export function Toolbar({
  activeTool,
  onToolChange,
  gridOn,
  onToggleGrid,
  snapOn,
  onToggleSnap,
  isGenerating,
  progress,
  hasBrief = false,
  onGenerate,
  onExport,
  onReview,
  exportEnabled,
  hasDesign,
}: ToolbarProps) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-1.5 overflow-x-auto border-b-2 border-black bg-zinc-50 px-2">
      {TOOLS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          className="tool-btn"
          data-active={activeTool === id}
          onClick={() => onToolChange(id)}
          title={`${label} tool`}
        >
          <Icon className="size-3.5" />
          <span className="hidden lg:inline">{label}</span>
        </button>
      ))}

      <div className="mx-1 h-5 w-0.5 shrink-0 bg-black/20" />

      <button className="tool-btn" data-active={gridOn} onClick={onToggleGrid} title="Toggle grid">
        <Grid3x3Icon className="size-3.5" />
        <span className="hidden lg:inline">Grid</span>
      </button>
      <button className="tool-btn" data-active={snapOn} onClick={onToggleSnap} title="Toggle snap">
        <MagnetIcon className="size-3.5" />
        <span className="hidden lg:inline">Snap</span>
      </button>

      <div className="mx-1 h-5 w-0.5 shrink-0 bg-black/20" />

      <button
        className="tool-btn"
        onClick={onReview}
        disabled={!hasDesign}
        title="Run deep design review"
      >
        <ClipboardCheckIcon className="size-3.5" />
        <span className="hidden lg:inline">Review</span>
      </button>
      <button
        className="tool-btn"
        onClick={onExport}
        disabled={!exportEnabled}
        title="Download manufacturing bundle"
      >
        <DownloadIcon className="size-3.5" />
        <span className="hidden lg:inline">Fab</span>
      </button>

      {/* Pipeline progress / generate */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {isGenerating && (
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-28 border-2 border-black bg-white">
              <div
                className="h-full bg-[#00E5FF] transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="font-mono text-[10px] font-black">{progress}%</span>
          </div>
        )}
        <button
          className={cn('tool-btn', (isGenerating || !hasBrief) && 'opacity-50')}
          data-active={isGenerating}
          disabled={isGenerating || !hasBrief}
          onClick={onGenerate}
          title="Regenerate from the last brief"
        >
          <ZapIcon className="size-3.5" />
          {isGenerating ? 'GENERATING' : 'GENERATE'}
        </button>
      </div>
    </div>
  )
}
