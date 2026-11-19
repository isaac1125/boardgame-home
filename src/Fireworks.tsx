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

const COLORS = ['#ff3b3b', '#ffd400', '#3b82f6', '#22c55e', '#f97316', '#ec4899', '#a855f7']

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * Lightweight canvas fireworks burst (~1.5s). Respects prefers-reduced-motion → fade only.
 */
export function FireworksBurst({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduced = prefersReducedMotion()

  useEffect(() => {
    if (reduced) {
      const t = window.setTimeout(onDone, 450)
      return () => window.clearTimeout(t)
    }

    const canvas = canvasRef.current
    if (!canvas) {
      onDone()
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      onDone()
      return
    }

    let raf = 0
    let cancelled = false
    const particles: Particle[] = []
    const start = performance.now()
    const DURATION = 1800

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = window.innerWidth
      const h = window.innerHeight
      canvas!.width = Math.floor(w * dpr)
      canvas!.height = Math.floor(h * dpr)
      canvas!.style.width = `${w}px`
      canvas!.style.height = `${h}px`
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function burst(cx: number, cy: number, count: number) {
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.35
        const speed = 2.8 + Math.random() * 5.2
        particles.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.4,
          life: 0,
          maxLife: 0.7 + Math.random() * 0.7,
          color: COLORS[i % COLORS.length]!,
          size: 3.2 + Math.random() * 3.5,
        })
      }
    }

    resize()
    const w = window.innerWidth
    const h = window.innerHeight
    burst(w * 0.5, h * 0.36, 56)
    window.setTimeout(() => {
      if (!cancelled) burst(w * 0.26, h * 0.5, 40)
    }, 160)
    window.setTimeout(() => {
      if (!cancelled) burst(w * 0.74, h * 0.44, 40)
    }, 280)

    const onResize = () => resize()
    window.addEventListener('resize', onResize)

    function frame(now: number) {
      if (cancelled) return
      const elapsed = now - start
      const cw = window.innerWidth
      const ch = window.innerHeight
      ctx!.clearRect(0, 0, cw, ch)

      for (const p of particles) {
        p.life += 1 / 60
        p.vy += 0.06
        p.x += p.vx
        p.y += p.vy
        p.vx *= 0.99
        const t = p.life / p.maxLife
        if (t >= 1) continue
        const alpha = 1 - t
        ctx!.globalAlpha = alpha
        ctx!.fillStyle = p.color
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.size * (1 - t * 0.4), 0, Math.PI * 2)
        ctx!.fill()
      }
      ctx!.globalAlpha = 1

      if (elapsed < DURATION) {
        raf = requestAnimationFrame(frame)
      } else {
        onDone()
      }
    }

    raf = requestAnimationFrame(frame)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [onDone, reduced])

  if (reduced) {
    return <div className="fireworks-fade" aria-hidden="true" />
  }

  return (
    <canvas
      ref={canvasRef}
      className="fireworks-canvas"
      aria-hidden="true"
    />
  )
}
