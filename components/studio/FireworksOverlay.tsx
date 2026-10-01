'use client'

import { useEffect, useRef } from 'react'

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
}

type Shell = { x: number; y: number; targetY: number; vy: number; color: string }

const COLORS = ['#00E5FF', '#7C4DFF', '#FF4081', '#00E676', '#FFD740', '#00B0FF', '#FFFFFF']

/**
 * Full-viewport canvas fireworks — fires on verified designs.
 * Lightweight particle system, pauses when the tab is hidden.
 */
export function FireworksOverlay({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let running = true
    const particles: Particle[] = []
    const shells: Shell[] = []

    const resize = () => {
      canvas.width = window.innerWidth * devicePixelRatio
      canvas.height = window.innerHeight * devicePixelRatio
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const spawnShell = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      shells.push({
        x: w * (0.15 + Math.random() * 0.7),
        y: h + 10,
        targetY: h * (0.12 + Math.random() * 0.33),
        vy: -(8 + Math.random() * 5),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      })
    }

    const explode = (s: Shell) => {
      const count = 46 + Math.floor(Math.random() * 40)
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3
        const speed = 1.5 + Math.random() * 4.5
        particles.push({
          x: s.x,
          y: s.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          maxLife: 55 + Math.random() * 45,
          color: Math.random() > 0.75 ? '#FFFFFF' : s.color,
          size: 1.5 + Math.random() * 2.5,
        })
      }
    }

    let frame = 0
    const tick = () => {
      if (!running) return
      raf = requestAnimationFrame(tick)
      if (document.hidden) return
      frame++

      const w = window.innerWidth
      const h = window.innerHeight
      ctx.clearRect(0, 0, w, h)

      if (activeRef.current && frame % 26 === 0 && shells.length < 7) spawnShell()

      for (let i = shells.length - 1; i >= 0; i--) {
        const s = shells[i]
        s.x += s.vy * 0.08
        s.y += s.vy
        ctx.fillStyle = s.color
        ctx.fillRect(s.x - 1.5, s.y - 6, 3, 12)
        if (s.y <= s.targetY) {
          explode(s)
          shells.splice(i, 1)
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.life++
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.055
        p.vx *= 0.985
        p.vy *= 0.985
        const alpha = 1 - p.life / p.maxLife
        if (alpha <= 0) {
          particles.splice(i, 1)
          continue
        }
        ctx.globalAlpha = alpha
        ctx.fillStyle = p.color
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
      }
      ctx.globalAlpha = 1

      if (!activeRef.current && particles.length === 0 && shells.length === 0) {
        ctx.clearRect(0, 0, w, h)
      }
    }
    tick()

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [active])

  if (!active) return null

  return (
    <canvas
      ref={canvasRef}
      className="fw-overlay pointer-events-none fixed inset-0 z-50"
      aria-hidden="true"
    />
  )
}
