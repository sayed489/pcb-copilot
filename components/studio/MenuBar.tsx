'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type MenuDef = {
  label: string
  items: Array<
    | { label: string; hint?: string; onSelect?: () => void; disabled?: boolean }
    | { separator: true }
  >
}

type MenuBarProps = {
  statusText: string
  statusTone?: 'idle' | 'live' | 'ok' | 'error'
  onNewDesign?: () => void
  onExport?: () => void
  onRunReview?: () => void
  onGotoTab?: (tab: string) => void
  exportEnabled?: boolean
  hasDesign?: boolean
}

export function MenuBar({
  statusText,
  statusTone = 'idle',
  onNewDesign,
  onExport,
  onRunReview,
  onGotoTab,
  exportEnabled = false,
  hasDesign = false,
}: MenuBarProps) {
  const [open, setOpen] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpen(null)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const menus: MenuDef[] = [
    {
      label: 'File',
      items: [
        { label: 'New design', hint: '⌘N', onSelect: onNewDesign },
        { separator: true },
        { label: 'Export fab bundle', hint: '⌘E', onSelect: onExport, disabled: !exportEnabled },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Run deep review', hint: '⌘R', onSelect: onRunReview, disabled: !hasDesign },
        { separator: true },
        { label: 'Clear conversation', onSelect: onNewDesign },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Schematic', onSelect: () => onGotoTab?.('schematic') },
        { label: 'PCB layout', onSelect: () => onGotoTab?.('pcb') },
        { label: '3D assembly', onSelect: () => onGotoTab?.('3d') },
        { label: 'Source', onSelect: () => onGotoTab?.('source') },
        { separator: true },
        { label: 'Design checks', onSelect: () => onGotoTab?.('review') },
      ],
    },
    {
      label: 'Help',
      items: [
        {
          label: 'Fireworks + tscircuit',
          hint: 'engine',
          disabled: true,
        },
        { label: 'Model: GLM 5.3 Flash', disabled: true },
      ],
    },
  ]

  const toneDot: Record<string, string> = {
    idle: 'bg-zinc-400',
    live: 'bg-[#00E5FF] brutal-live-dot',
    ok: 'bg-emerald-500',
    error: 'bg-red-500 brutal-live-dot',
  }

  return (
    <div
      ref={barRef}
      className="relative z-40 flex h-9 shrink-0 items-stretch border-b-2 border-black bg-white"
    >
      {/* Brand */}
      <div className="flex items-center gap-2 border-r-2 border-black bg-[#00E5FF] px-3">
        <div className="size-3 border-2 border-black bg-black" />
        <span className="font-black text-[12px] uppercase tracking-[0.2em] text-black">
          PCB<span className="bg-black px-1 text-[#00E5FF]">COPILOT</span>
        </span>
      </div>

      {/* Menus */}
      <div className="flex items-stretch">
        {menus.map((menu) => (
          <div key={menu.label} className="relative flex items-stretch">
            <button
              className={cn(
                'flex items-center gap-1 border-r-2 border-black px-3 font-mono text-[11px] font-bold uppercase tracking-wider transition-colors',
                open === menu.label ? 'bg-black text-[#00E5FF]' : 'bg-white text-black hover:bg-zinc-100',
              )}
              onClick={() => setOpen(open === menu.label ? null : menu.label)}
              onMouseEnter={() => open && setOpen(menu.label)}
            >
              {menu.label}
              <ChevronDownIcon className="size-3 opacity-60" />
            </button>
            {open === menu.label && (
              <div className="absolute left-0 top-full min-w-56 border-2 border-black bg-white shadow-[4px_4px_0px_0px_black]">
                {menu.items.map((item, i) =>
                  'separator' in item ? (
                    <div key={i} className="my-1 h-0.5 bg-black/10" />
                  ) : (
                    <button
                      key={i}
                      disabled={item.disabled}
                      className="studio-menu-item disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => {
                        item.onSelect?.()
                        setOpen(null)
                      }}
                    >
                      <span className="flex-1">{item.label}</span>
                      {item.hint && (
                        <span className="text-black/40">{item.hint}</span>
                      )}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Status */}
      <div className="ml-auto flex items-center gap-2 border-l-2 border-black px-3">
        <div className={cn('size-2 border border-black', toneDot[statusTone])} />
        <span className="max-w-[46vw] truncate font-mono text-[10px] font-black uppercase tracking-[0.15em]">
          {statusText}
        </span>
      </div>
    </div>
  )
}
