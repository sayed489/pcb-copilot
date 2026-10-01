'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export type MascotState = 'idle' | 'thinking' | 'building' | 'routing' | 'success' | 'error'

type Mascot3DProps = {
  state: MascotState
  className?: string
}

/**
 * "Solder" — the PCB Copilot mascot: a floating IC with eyes.
 * Pure three.js (no external assets). Reacts to the generation pipeline:
 * idle → thinking → building → routing → success/error.
 */
export function Mascot3D({ state, className }: Mascot3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<MascotState>(state)
  stateRef.current = state

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false
    let raf = 0

    // ── Scene setup ─────────────────────────────────────────────
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50)
    camera.position.set(0, 0.4, 5.2)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'

    const CYAN = 0x00e5ff
    const DARK = 0x111113

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.85))
    const key = new THREE.DirectionalLight(0xffffff, 1.4)
    key.position.set(3, 4, 5)
    scene.add(key)
    const rim = new THREE.DirectionalLight(CYAN, 1.1)
    rim.position.set(-4, -1, -3)
    scene.add(rim)

    // ── Chip body ───────────────────────────────────────────────
    const mascot = new THREE.Group()
    scene.add(mascot)

    const bodyMat = new THREE.MeshStandardMaterial({
      color: DARK,
      roughness: 0.35,
      metalness: 0.45,
    })
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 0.42), bodyMat)
    mascot.add(body)

    // Cyan edge plate (top face frame)
    const frameMat = new THREE.MeshStandardMaterial({
      color: CYAN,
      roughness: 0.3,
      metalness: 0.2,
      emissive: CYAN,
      emissiveIntensity: 0.35,
    })
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.86, 1.86, 0.1), frameMat)
    frame.position.z = 0.2
    mascot.add(frame)
    const face = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1.5, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1f, roughness: 0.5 }),
    )
    face.position.z = 0.24
    mascot.add(face)

    // Pin-1 dot
    const dot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.06, 20),
      new THREE.MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: 0.8 }),
    )
    dot.rotation.x = Math.PI / 2
    dot.position.set(-0.55, 0.55, 0.32)
    mascot.add(dot)

    // Legs (gold pins, 4 per side)
    const pinMat = new THREE.MeshStandardMaterial({ color: 0xffd54f, roughness: 0.25, metalness: 0.9 })
    const pinGeo = new THREE.BoxGeometry(0.16, 0.1, 0.5)
    for (let i = 0; i < 4; i++) {
      const offset = -0.57 + i * 0.38
      for (const side of [-1, 1]) {
        const pin = new THREE.Mesh(pinGeo, pinMat)
        pin.position.set(side * 0.95, offset, 0)
        mascot.add(pin)
        const pinH = new THREE.Mesh(pinGeo, pinMat)
        pinH.position.set(offset, side * 0.95, 0)
        pinH.rotation.z = Math.PI / 2
        mascot.add(pinH)
      }
    }

    // ── Eyes ────────────────────────────────────────────────────
    const eyes = new THREE.Group()
    eyes.position.z = 0.34
    mascot.add(eyes)
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.4,
      roughness: 0.2,
    })
    const pupilMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: CYAN,
      emissiveIntensity: 0.6,
    })
    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 24), eyeMat)
    leftEye.position.set(-0.34, 0.12, 0)
    const rightEye = leftEye.clone()
    rightEye.position.x = 0.34
    const leftPupil = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), pupilMat)
    leftPupil.position.set(-0.34, 0.12, 0.16)
    const rightPupil = leftPupil.clone()
    rightPupil.position.x = 0.34
    eyes.add(leftEye, rightEye, leftPupil, rightPupil)

    // Mouth (small emissive bar that stretches on success)
    const mouth = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.07, 0.04),
      new THREE.MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: 0.7 }),
    )
    mouth.position.set(0, -0.32, 0.34)
    mascot.add(mouth)

    // ── Orbiting electrons ──────────────────────────────────────
    const electronGroup = new THREE.Group()
    scene.add(electronGroup)
    const electronMat = new THREE.MeshStandardMaterial({
      color: CYAN,
      emissive: CYAN,
      emissiveIntensity: 1.2,
    })
    const electrons = Array.from({ length: 5 }, (_, i) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 12), electronMat)
      electronGroup.add(e)
      return { mesh: e, phase: (i / 5) * Math.PI * 2, radius: 1.7 + (i % 2) * 0.35 }
    })

    // ── Circuit ring under mascot ───────────────────────────────
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.02, 8, 64),
      new THREE.MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: 0.5 }),
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = -1.45
    scene.add(ring)

    // Particle burst for success
    const burstCount = 60
    const burstGeo = new THREE.BufferGeometry()
    const burstPos = new Float32Array(burstCount * 3)
    const burstVel: THREE.Vector3[] = []
    for (let i = 0; i < burstCount; i++) {
      burstPos.set([0, 0, 0], i * 3)
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const speed = 1.5 + Math.random() * 2.5
      burstVel.push(
        new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * speed,
          Math.sin(phi) * Math.sin(theta) * speed,
          Math.cos(phi) * speed,
        ),
      )
    }
    burstGeo.setAttribute('position', new THREE.BufferAttribute(burstPos, 3))
    const burstMat = new THREE.PointsMaterial({
      color: CYAN,
      size: 0.09,
      transparent: true,
      opacity: 0,
    })
    const burst = new THREE.Points(burstGeo, burstMat)
    scene.add(burst)
    let burstT = -1

    // ── Resize ──────────────────────────────────────────────────
    const resize = () => {
      const w = container.clientWidth || 200
      const h = container.clientHeight || 200
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)

    // ── Animation loop ──────────────────────────────────────────
    const clock = new THREE.Clock()
    let prev: MascotState = stateRef.current

    const animate = () => {
      if (disposed) return
      raf = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()
      const s = stateRef.current

      if (s !== prev) {
        if (s === 'success') {
          burstT = 0
          const pos = burst.geometry.attributes.position as THREE.BufferAttribute
          for (let i = 0; i < burstCount; i++) pos.setXYZ(i, 0, 0, 0)
          pos.needsUpdate = true
        }
        prev = s
      }

      // Idle float + state-driven motion
      const floatY = Math.sin(t * 1.6) * 0.09
      mascot.position.y = floatY
      mascot.rotation.y = Math.sin(t * 0.6) * 0.35
      mascot.rotation.x = Math.sin(t * 0.9) * 0.06

      if (s === 'thinking') {
        mascot.rotation.y = Math.sin(t * 2.4) * 0.5
        electronGroup.rotation.y = t * 2.4
      } else if (s === 'building' || s === 'routing') {
        mascot.rotation.z = Math.sin(t * 7) * 0.045
        electronGroup.rotation.y = t * 4.5
        mouth.scale.x = 1 + Math.sin(t * 10) * 0.5
      } else if (s === 'success') {
        mascot.position.y = floatY + Math.abs(Math.sin(t * 4)) * 0.35
        mascot.rotation.y += 0.04
        mouth.scale.x = 2.4
        electronGroup.rotation.y = t * 3
      } else if (s === 'error') {
        mascot.rotation.z = Math.sin(t * 12) * 0.08
        mouth.scale.x = 0.5
      } else {
        mouth.scale.x = 1
        electronGroup.rotation.y = t * 0.8
      }

      // Eyes: blink + pupil tracking
      const blink = Math.sin(t * 2.2) > 0.97 ? 0.12 : 1
      leftEye.scale.y = blink
      rightEye.scale.y = blink
      const look = Math.sin(t * 0.8) * 0.05
      leftPupil.position.x = -0.34 + look
      rightPupil.position.x = 0.34 + look
      const pupilGlow = s === 'error' ? 2.2 : s === 'success' ? 1.6 : 0.6
      ;(leftPupil.material as THREE.MeshStandardMaterial).emissiveIntensity = pupilGlow
      ;(rightPupil.material as THREE.MeshStandardMaterial).emissiveIntensity = pupilGlow
      if (s === 'error') {
        ;(leftPupil.material as THREE.MeshStandardMaterial).emissive.setHex(0xff3b30)
        ;(rightPupil.material as THREE.MeshStandardMaterial).emissive.setHex(0xff3b30)
      } else {
        ;(leftPupil.material as THREE.MeshStandardMaterial).emissive.setHex(CYAN)
        ;(rightPupil.material as THREE.MeshStandardMaterial).emissive.setHex(CYAN)
      }

      // Electrons
      for (const e of electrons) {
        const a = t * 1.4 + e.phase
        e.mesh.position.set(
          Math.cos(a) * e.radius,
          Math.sin(a * 1.7) * 0.55,
          Math.sin(a) * e.radius * 0.55,
        )
      }

      ring.rotation.z = t * 0.4
      const ringPulse = s === 'success' ? 1 + Math.sin(t * 6) * 0.08 : 1
      ring.scale.setScalar(ringPulse)
      ;(ring.material as THREE.MeshStandardMaterial).emissiveIntensity =
        s === 'error' ? 0.2 : s === 'success' ? 1.4 : 0.5

      // Success particle burst (fixed timestep — avoids clock.getDelta()
      // fighting with getElapsedTime, which also advances the clock)
      if (burstT >= 0) {
        burstT += 0.016
        const pos = burst.geometry.attributes.position as THREE.BufferAttribute
        for (let i = 0; i < burstCount; i++) {
          pos.setXYZ(
            i,
            burstVel[i].x * burstT,
            burstVel[i].y * burstT - 1.2 * burstT * burstT,
            burstVel[i].z * burstT,
          )
        }
        pos.needsUpdate = true
        burstMat.opacity = Math.max(0, 1 - burstT / 1.4)
        if (burstT > 1.5) burstT = -1
      }

      renderer.render(scene, camera)
    }
    animate()

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      observer.disconnect()
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
          obj.geometry.dispose()
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          mats.forEach((m) => m.dispose())
        }
      })
      renderer.dispose()
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [])

  return <div ref={containerRef} className={className} aria-label="PCB Copilot mascot" />
}
