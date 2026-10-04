import { useEffect, useRef } from 'react'
import { runLoop, stillness } from './loop.js'
import { fireworksEvery } from './festivals.js'

// The moving skies of Black Hours' feast days, drawn on canvases on the
// shared clock (loop.js): bats that shy from the pointer on All Hallows'
// Eve, fireworks of gold leaf at the turn of the year, the tears of St
// Lawrence and the Geminids, fireflies and St John's fire at Midsummer. And
// the painted borders that go round the window on a feast — lilies along its
// foot at Easter, a fir garland over its head in Advent, roses climbing its
// sides on St Valentine's — drawn once for the size of the window.
//
// With less movement asked for, the moving ones are not drawn at all.

const INK = '#2a1d08'
const VERMILION = '#c8352a'
const LAPIS = '#27458f'
const GREENS = ['#2d6a43', '#245a38', '#3a8250']

/** A canvas over the whole window at the screen's own sharpness. */
function fitCanvas(canvas, w = window.innerWidth, h = window.innerHeight) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  const g = canvas.getContext('2d')
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  return g
}

/** The same small generator the other scenes use: one seed, one picture. */
function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A soft round glow, drawn once and stamped from then on. */
function glowSprite(rgb, size = 32) {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d')
  const r = size / 2
  const fill = g.createRadialGradient(r, r, 0, r, r, r)
  fill.addColorStop(0, `rgba(${rgb}, 1)`)
  fill.addColorStop(0.25, `rgba(${rgb}, 0.6)`)
  fill.addColorStop(1, `rgba(${rgb}, 0)`)
  g.fillStyle = fill
  g.fillRect(0, 0, size, size)
  return c
}

/** Where the pointer is, kept up to date for a scene that wants to know. */
function usePointer() {
  const at = useRef({ x: -9999, y: -9999 })
  useEffect(() => {
    const move = (e) => { at.current = { x: e.clientX, y: e.clientY } }
    const leave = () => { at.current = { x: -9999, y: -9999 } }
    window.addEventListener('pointermove', move)
    document.addEventListener('pointerleave', leave)
    return () => {
      window.removeEventListener('pointermove', move)
      document.removeEventListener('pointerleave', leave)
    }
  }, [])
  return at
}

// --- All Hallows' Eve: bats ----------------------------------------------------

/** A bat seen from below, wings at `flap` (−1 up to 1 down), `size` across. */
function drawBat(g, x, y, size, flap, heading) {
  const s = size / 40
  g.save()
  g.translate(x, y)
  g.scale(heading < 0 ? -s : s, s)
  const tip = flap * 9
  const mid = flap * 4
  g.beginPath()
  g.moveTo(0, -2)
  // The near wing: three fingers, scalloped between them.
  g.bezierCurveTo(5, -6 + mid, 12, -8 + mid, 20, -4 + tip)
  g.quadraticCurveTo(15, 0 + mid, 14, 4 + mid * 0.6)
  g.quadraticCurveTo(10, 1 + mid * 0.4, 7, 5)
  g.quadraticCurveTo(4, 2, 1, 4)
  // The far wing, the same turned over.
  g.lineTo(-1, 4)
  g.quadraticCurveTo(-4, 2, -7, 5)
  g.quadraticCurveTo(-10, 1 + mid * 0.4, -14, 4 + mid * 0.6)
  g.quadraticCurveTo(-15, 0 + mid, -20, -4 + tip)
  g.bezierCurveTo(-12, -8 + mid, -5, -6 + mid, 0, -2)
  g.closePath()
  g.fillStyle = '#0b090d'
  g.fill()
  g.lineWidth = 0.9 / s
  g.strokeStyle = 'rgba(226, 189, 98, 0.85)'
  g.stroke()
  // The body and the ears.
  g.beginPath()
  g.ellipse(0, 1.5, 2.6, 4.6, 0, 0, Math.PI * 2)
  g.moveTo(-1.8, -2.4)
  g.lineTo(-2.4, -5.6)
  g.lineTo(-0.6, -3.4)
  g.lineTo(0.6, -3.4)
  g.lineTo(2.4, -5.6)
  g.lineTo(1.8, -2.4)
  g.fillStyle = '#0b090d'
  g.fill()
  g.stroke()
  g.restore()
}

/**
 * Bats over the page: a handful, wandering, beating their wings — and
 * scattering away from the pointer when it comes near.
 */
export function HallowBats({ count = 8 }) {
  const ref = useRef(null)
  const pointer = usePointer()
  useEffect(() => {
    if (stillness()) return undefined
    const canvas = ref.current
    let g = fitCanvas(canvas)
    const resize = () => { g = fitCanvas(canvas) }
    window.addEventListener('resize', resize)
    const rand = Math.random
    const bats = Array.from({ length: count }, () => ({
      x: rand() * window.innerWidth,
      y: window.innerHeight * (0.08 + rand() * 0.55),
      a: rand() * Math.PI * 2,
      speed: 60 + rand() * 50,
      size: 18 + rand() * 16,
      phase: rand() * 10,
      rate: 7 + rand() * 4,
    }))
    const stop = runLoop((now, dt) => {
      const w = window.innerWidth
      const h = window.innerHeight
      g.clearRect(0, 0, w, h)
      const p = pointer.current
      for (const b of bats) {
        // Wander, keep to the upper page, and flee the pointer.
        b.a += (Math.random() - 0.5) * 2.4 * dt
        const dx = b.x - p.x
        const dy = b.y - p.y
        const near = Math.hypot(dx, dy)
        let fast = 1
        if (near < 170) {
          const away = Math.atan2(dy, dx)
          let turn = away - b.a
          turn = Math.atan2(Math.sin(turn), Math.cos(turn))
          b.a += turn * Math.min(1, dt * 7)
          fast = 2.8 - near / 120
        }
        if (b.y < h * 0.05) b.a += (Math.PI / 2 - b.a) * dt * 2
        if (b.y > h * 0.7) b.a += (-Math.PI / 2 - b.a) * dt * 2
        b.x += Math.cos(b.a) * b.speed * fast * dt
        b.y += Math.sin(b.a) * b.speed * fast * dt * 0.6
        if (b.x < -40) b.x = w + 40
        if (b.x > w + 40) b.x = -40
        b.phase += dt * b.rate * (fast > 1 ? 1.6 : 1)
        drawBat(g, b.x, b.y, b.size, Math.sin(b.phase), Math.cos(b.a))
      }
    })
    return () => { stop(); window.removeEventListener('resize', resize) }
  }, [count])
  return <canvas ref={ref} className="hours-canvas over" aria-hidden="true" />
}

// --- the turn of the year: fireworks of gold leaf --------------------------------

const BURST_TONES = ['255, 214, 120', '255, 236, 190', '214, 84, 60', '226, 232, 255', '255, 190, 90', '150, 175, 255']

/**
 * Fireworks: rockets going up from the foot of the page and breaking into
 * gold, vermilion and silver, some round and some in the shape of a star,
 * the sparks falling and glinting as they go out. As often as
 * festivals.js's fireworksEvery says for the hour — or, with `demo`, every
 * couple of seconds, for trying the day out. `flurry` sets off a crowd of
 * them at once (midnight).
 */
export function HoursFireworks({ festival, demo = false, flurry = 0 }) {
  const ref = useRef(null)
  const burstNow = useRef(null)
  useEffect(() => {
    if (stillness()) return undefined
    const canvas = ref.current
    let g = fitCanvas(canvas)
    const resize = () => { g = fitCanvas(canvas) }
    window.addEventListener('resize', resize)
    const sprites = Object.fromEntries(BURST_TONES.map((t) => [t, glowSprite(t, 24)]))
    const rockets = []
    const sparks = []
    let wait = 1
    const launch = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      const x = w * (0.12 + Math.random() * 0.76)
      rockets.push({ x, y: h + 10, vx: (Math.random() - 0.5) * 60, vy: -(h * (0.75 + Math.random() * 0.35)), top: h * (0.12 + Math.random() * 0.3), tone: BURST_TONES[Math.floor(Math.random() * BURST_TONES.length)] })
    }
    burstNow.current = (n) => { for (let i = 0; i < n; i++) setTimeout(launch, i * 140) }
    const explode = (r) => {
      const star = Math.random() < 0.35
      const n = 70 + Math.floor(Math.random() * 40)
      const second = Math.random() < 0.4 ? BURST_TONES[Math.floor(Math.random() * BURST_TONES.length)] : r.tone
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        // A star breaks into eight arms; a round one into a ball.
        const arm = star ? 0.45 + 0.55 * Math.abs(Math.cos(a * 4)) : 0.75 + Math.random() * 0.25
        const v = (190 + Math.random() * 60) * arm * (1 + Math.random() * 0.15)
        sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 1.4 + Math.random() * 0.9, tone: i % 3 ? r.tone : second, px: r.x, py: r.y })
      }
    }
    const stop = runLoop((now, dt) => {
      const w = window.innerWidth
      const h = window.innerHeight
      g.clearRect(0, 0, w, h)
      wait -= dt
      if (wait <= 0) {
        const every = demo ? 1.3 : fireworksEvery(festival, new Date())
        if (every != null) launch()
        wait = every != null ? every * (0.6 + Math.random() * 0.8) : 20
      }
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i]
        r.vy += 260 * dt
        r.x += r.vx * dt
        r.y += r.vy * dt
        g.globalAlpha = 0.9
        g.drawImage(sprites[r.tone], r.x - 5, r.y - 5, 10, 10)
        g.strokeStyle = `rgba(${r.tone}, 0.35)`
        g.lineWidth = 1.4
        g.beginPath()
        g.moveTo(r.x, r.y)
        g.lineTo(r.x - r.vx * 0.05, r.y - r.vy * 0.05)
        g.stroke()
        if (r.y <= r.top || r.vy >= 0) {
          explode(r)
          rockets.splice(i, 1)
        }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]
        s.age += dt
        if (s.age > s.life) { sparks.splice(i, 1); continue }
        s.px = s.x
        s.py = s.y
        s.vx *= 1 - 1.5 * dt
        s.vy = s.vy * (1 - 1.5 * dt) + 70 * dt
        s.x += s.vx * dt
        s.y += s.vy * dt
        const fade = 1 - s.age / s.life
        const glint = s.age > s.life * 0.55 && Math.random() < 0.3 ? 1.6 : 1
        g.globalAlpha = Math.max(0, fade) * 0.9
        g.strokeStyle = `rgba(${s.tone}, ${(fade * 0.6).toFixed(3)})`
        g.lineWidth = 1.6
        g.beginPath()
        g.moveTo(s.px, s.py)
        g.lineTo(s.x, s.y)
        g.stroke()
        const size = 9 * glint * (0.5 + fade * 0.5)
        g.drawImage(sprites[s.tone], s.x - size / 2, s.y - size / 2, size, size)
      }
      g.globalAlpha = 1
    })
    return () => { stop(); window.removeEventListener('resize', resize) }
  }, [festival, demo])
  useEffect(() => { if (flurry) burstNow.current?.(14) }, [flurry])
  return <canvas ref={ref} className="hours-canvas over" aria-hidden="true" />
}

// --- the nights of falling stars ---------------------------------------------------

/**
 * A meteor shower: stars falling away from the one point of the sky the
 * shower comes from (`radiant`, as shares of the window), each a bright head
 * and a tail of its colour, and now and then a fireball that leaves gold dust
 * hanging in the air behind it.
 */
const EVERY = [0.5, 2.2]
export function HoursMeteors({ radiant, tones, every = EVERY }) {
  const ref = useRef(null)
  useEffect(() => {
    if (stillness()) return undefined
    const canvas = ref.current
    let g = fitCanvas(canvas)
    const resize = () => { g = fitCanvas(canvas) }
    window.addEventListener('resize', resize)
    const heads = Object.fromEntries(tones.map((t) => [t, glowSprite(t, 28)]))
    const meteors = []
    const dust = []
    let wait = 0.6
    const stop = runLoop((now, dt) => {
      const w = window.innerWidth
      const h = window.innerHeight
      g.clearRect(0, 0, w, h)
      wait -= dt
      if (wait <= 0) {
        wait = every[0] + Math.random() * (every[1] - every[0])
        const rx = w * radiant[0]
        const ry = h * radiant[1]
        const toward = Math.atan2(h * 0.6 - ry, w * 0.5 - rx) + (Math.random() - 0.5) * 1.5
        const start = 40 + Math.random() * Math.min(w, h) * 0.45
        const fireball = Math.random() < 0.14
        meteors.push({
          x: rx + Math.cos(toward) * start,
          y: ry + Math.sin(toward) * start,
          a: toward,
          speed: (fireball ? 520 : 760) + Math.random() * 520,
          age: 0,
          life: (fireball ? 1.3 : 0.55) + Math.random() * 0.45,
          length: (fireball ? 220 : 120) + Math.random() * 90,
          tone: tones[Math.floor(Math.random() * tones.length)],
          fireball,
        })
      }
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i]
        m.age += dt
        if (m.age > m.life) { meteors.splice(i, 1); continue }
        m.x += Math.cos(m.a) * m.speed * dt
        m.y += Math.sin(m.a) * m.speed * dt
        const fade = Math.min(1, m.age * 8) * (1 - m.age / m.life)
        const tx = m.x - Math.cos(m.a) * m.length * Math.min(1, m.age * 3)
        const ty = m.y - Math.sin(m.a) * m.length * Math.min(1, m.age * 3)
        const tail = g.createLinearGradient(tx, ty, m.x, m.y)
        tail.addColorStop(0, `rgba(${m.tone}, 0)`)
        tail.addColorStop(1, `rgba(${m.tone}, ${(0.85 * fade).toFixed(3)})`)
        g.strokeStyle = tail
        g.lineWidth = m.fireball ? 2.6 : 1.5
        g.lineCap = 'round'
        g.beginPath()
        g.moveTo(tx, ty)
        g.lineTo(m.x, m.y)
        g.stroke()
        const size = (m.fireball ? 18 : 9) * (0.6 + fade * 0.4)
        g.globalAlpha = fade
        g.drawImage(heads[m.tone], m.x - size / 2, m.y - size / 2, size, size)
        g.globalAlpha = 1
        if (m.fireball && Math.random() < 0.7) {
          dust.push({ x: m.x, y: m.y, age: 0, life: 1.6 + Math.random() * 1.4, vy: 8 + Math.random() * 10 })
        }
      }
      for (let i = dust.length - 1; i >= 0; i--) {
        const d = dust[i]
        d.age += dt
        if (d.age > d.life) { dust.splice(i, 1); continue }
        d.y += d.vy * dt
        g.fillStyle = `rgba(255, 220, 140, ${(0.7 * (1 - d.age / d.life)).toFixed(3)})`
        g.fillRect(d.x, d.y, 1.4, 1.4)
      }
    })
    return () => { stop(); window.removeEventListener('resize', resize) }
  }, [radiant, tones, every])
  return <canvas ref={ref} className="hours-canvas over" aria-hidden="true" />
}

// --- Midsummer: fireflies, and St John's fire ---------------------------------------

/** Fireflies low over the page, blinking, drawn toward the pointer when it comes near. */
export function HoursFireflies({ count = 34 }) {
  const ref = useRef(null)
  const pointer = usePointer()
  useEffect(() => {
    if (stillness()) return undefined
    const canvas = ref.current
    let g = fitCanvas(canvas)
    const resize = () => { g = fitCanvas(canvas) }
    window.addEventListener('resize', resize)
    const glow = glowSprite('255, 236, 140', 36)
    const flies = Array.from({ length: count }, () => ({
      x: Math.random() * window.innerWidth,
      y: window.innerHeight * (0.4 + Math.random() * 0.58),
      a: Math.random() * Math.PI * 2,
      phase: Math.random() * 10,
      rate: 0.6 + Math.random() * 0.9,
    }))
    const stop = runLoop((now, dt) => {
      const w = window.innerWidth
      const h = window.innerHeight
      g.clearRect(0, 0, w, h)
      const p = pointer.current
      for (const f of flies) {
        f.a += (Math.random() - 0.5) * 3 * dt
        const dx = p.x - f.x
        const dy = p.y - f.y
        const near = Math.hypot(dx, dy)
        if (near < 240 && near > 30) {
          const to = Math.atan2(dy, dx)
          let turn = to - f.a
          turn = Math.atan2(Math.sin(turn), Math.cos(turn))
          f.a += turn * dt * 1.5
        }
        f.x += Math.cos(f.a) * 22 * dt
        f.y += Math.sin(f.a) * 16 * dt
        if (f.y < h * 0.3) f.a += (Math.PI / 2 - f.a) * dt
        if (f.y > h - 6) f.a = -Math.PI / 2
        if (f.x < -10) f.x = w + 10
        if (f.x > w + 10) f.x = -10
        f.phase += dt * f.rate
        const lit = Math.max(0, Math.sin(f.phase * Math.PI))
        if (lit < 0.05) continue
        g.globalAlpha = lit
        g.drawImage(glow, f.x - 13, f.y - 13, 26, 26)
        g.fillStyle = '#fffbe0'
        g.fillRect(f.x - 0.8, f.y - 0.8, 1.6, 1.6)
      }
      g.globalAlpha = 1
    })
    return () => { stop(); window.removeEventListener('resize', resize) }
  }, [count])
  return <canvas ref={ref} className="hours-canvas over" aria-hidden="true" />
}

/** St John's fire in the corner of the desk: logs, and flames and sparks going up. */
export function StJohnsFire() {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    const W = 150
    const H = 190
    const g = fitCanvas(canvas, W, H)
    const glow = glowSprite('255, 170, 70', 48)
    const flames = []
    const sparks = []
    const logs = () => {
      g.save()
      g.lineCap = 'round'
      for (const [x0, y0, x1, y1] of [[22, 178, 128, 156], [24, 156, 130, 178], [50, 182, 104, 150]]) {
        g.strokeStyle = INK
        g.lineWidth = 13
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke()
        g.strokeStyle = '#5a3a1e'
        g.lineWidth = 10
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke()
        g.fillStyle = '#c9a26a'
        g.beginPath(); g.arc(x1, y1, 4.4, 0, Math.PI * 2); g.fill()
      }
      g.restore()
    }
    const draw = (dt) => {
      g.clearRect(0, 0, W, H)
      g.globalAlpha = 0.55 + Math.random() * 0.1
      g.drawImage(glow, W / 2 - 80, H - 150, 160, 160)
      g.globalAlpha = 1
      logs()
      for (let i = 0; i < 3; i++) {
        flames.push({ x: W / 2 + (Math.random() - 0.5) * 50, y: H - 30, vx: (Math.random() - 0.5) * 14, vy: -(50 + Math.random() * 50), age: 0, life: 0.7 + Math.random() * 0.6, size: 16 + Math.random() * 14 })
      }
      if (Math.random() < 0.25) sparks.push({ x: W / 2 + (Math.random() - 0.5) * 30, y: H - 60, vx: (Math.random() - 0.5) * 30, vy: -(70 + Math.random() * 60), age: 0, life: 1.4 + Math.random() })
      g.globalCompositeOperation = 'lighter'
      for (let i = flames.length - 1; i >= 0; i--) {
        const f = flames[i]
        f.age += dt
        if (f.age > f.life) { flames.splice(i, 1); continue }
        f.x += (f.vx + (W / 2 - f.x) * 0.9) * dt
        f.y += f.vy * dt
        const t = f.age / f.life
        const size = f.size * (1 - t * 0.7)
        const hue = t < 0.3 ? '255, 236, 170' : t < 0.6 ? '255, 160, 60' : '210, 70, 40'
        g.fillStyle = `rgba(${hue}, ${(0.32 * (1 - t)).toFixed(3)})`
        g.beginPath()
        g.ellipse(f.x, f.y, size * 0.5, size, 0, 0, Math.PI * 2)
        g.fill()
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]
        s.age += dt
        if (s.age > s.life) { sparks.splice(i, 1); continue }
        s.x += s.vx * dt + Math.sin(s.age * 6) * 0.4
        s.y += s.vy * dt
        g.fillStyle = `rgba(255, 210, 120, ${(1 - s.age / s.life).toFixed(3)})`
        g.fillRect(s.x, s.y, 1.6, 1.6)
      }
      g.globalCompositeOperation = 'source-over'
    }
    if (stillness()) { draw(0.5); return undefined }
    return runLoop((now, dt) => draw(dt))
  }, [])
  return <canvas ref={ref} className="hours-fire" aria-hidden="true" />
}

// --- the painted borders round the window ---------------------------------------

/** A leaf at unit size (stalk at the origin, point along +x), as the border paints it. */
const LANCE = new Path2D('M0 0Q0.42 -0.34 1.15 0Q0.42 0.34 0 0Z')
const IVY = new Path2D('M0 0Q-0.05 -0.5 0.32 -0.58Q0.62 -0.64 0.6 -0.3Q0.86 -0.24 1.1 0Q0.86 0.24 0.6 0.3Q0.62 0.64 0.32 0.58Q-0.05 0.5 0 0Z')
function leaf(g, shape, x, y, angle, size, fill) {
  g.save()
  g.translate(x, y)
  g.rotate(angle)
  g.scale(size, size)
  g.fillStyle = fill
  g.fill(shape)
  g.lineWidth = 0.7 / size
  g.strokeStyle = INK
  g.stroke(shape)
  g.restore()
}
const goldOf = (g, x, y, r) => {
  const s = g.createLinearGradient(x - r, y - r, x + r, y + r)
  s.addColorStop(0, '#fff3c0')
  s.addColorStop(0.4, '#e2bd62')
  s.addColorStop(1, '#7a5a1e')
  return s
}

/** A border drawn once for the window, again only when the window changes size. */
function Painted({ className, draw }) {
  const ref = useRef(null)
  useEffect(() => {
    const paint = () => {
      const g = fitCanvas(ref.current)
      draw(g, window.innerWidth, window.innerHeight)
    }
    paint()
    window.addEventListener('resize', paint)
    return () => window.removeEventListener('resize', paint)
  }, [draw])
  return <canvas ref={ref} className={`hours-canvas ${className}`} aria-hidden="true" />
}

/** Easter: lilies and grass all along the foot of the window. */
function drawLilies(g, w, h) {
  const rand = seeded(17)
  const foot = h - 8
  for (let x = 10; x < w - 10; x += 3 + rand() * 4) {
    const tall = 10 + rand() ** 1.6 * 26
    const lean = (rand() - 0.5) * 10
    g.strokeStyle = GREENS[Math.floor(rand() * 3)]
    g.lineWidth = 1.2 + rand()
    g.beginPath()
    g.moveTo(x, foot)
    g.quadraticCurveTo(x + lean * 0.3, foot - tall * 0.6, x + lean, foot - tall)
    g.stroke()
  }
  for (let x = 24; x < w - 24; x += 46 + rand() * 70) {
    const tall = 34 + rand() * 40
    const lean = (rand() - 0.5) * 12
    const topX = x + lean
    const topY = foot - tall
    g.strokeStyle = '#2d6a43'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(x, foot)
    g.quadraticCurveTo(x + lean * 0.2, foot - tall * 0.5, topX, topY)
    g.stroke()
    leaf(g, LANCE, x + lean * 0.1, foot - tall * 0.3, -Math.PI / 2 - 0.7, 18 + rand() * 6, GREENS[Math.floor(rand() * 3)])
    leaf(g, LANCE, x + lean * 0.15, foot - tall * 0.42, -Math.PI / 2 + 0.6, 16 + rand() * 6, GREENS[Math.floor(rand() * 3)])
    // The flower: three white petals turned out, gold stamens in its throat.
    const r = 9 + rand() * 3
    for (const turn of [-Math.PI / 2, -Math.PI / 2 - 0.95, -Math.PI / 2 + 0.95]) {
      leaf(g, LANCE, topX, topY + 2, turn, r * 1.5, '#f6f0e2')
    }
    g.strokeStyle = '#d6b05a'
    g.lineWidth = 1
    for (const d of [-0.4, 0, 0.4]) {
      g.beginPath()
      g.moveTo(topX, topY + 2)
      g.lineTo(topX + Math.sin(d) * r * 0.8, topY + 2 - Math.cos(d) * r * 0.9)
      g.stroke()
      g.fillStyle = '#e2bd62'
      g.beginPath()
      g.arc(topX + Math.sin(d) * r * 0.8, topY + 2 - Math.cos(d) * r * 0.9, 1.3, 0, Math.PI * 2)
      g.fill()
    }
    // A bud beside it, sometimes.
    if (rand() < 0.5) leaf(g, LANCE, x - lean * 0.2 - 4, foot - tall * 0.66, -Math.PI / 2 - 0.25, 10, '#e9e2cf')
  }
}
export const LilyBorder = () => <Painted className="under" draw={drawLilies} />

/** Advent: a fir garland swagged across the head of the window, bows and baubles on it. */
function drawGarland(g, w) {
  const rand = seeded(5)
  const nails = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => 10 + t * (w - 20))
  const top = 12
  for (let k = 0; k < nails.length - 1; k++) {
    const x0 = nails[k]
    const x1 = nails[k + 1]
    const sag = 26
    const at = (t) => ({ x: x0 + (x1 - x0) * t, y: top + Math.sin(t * Math.PI) * sag })
    for (let i = 0; i <= 60; i++) {
      const t = i / 60
      const p = at(t)
      const q = at(Math.min(1, t + 0.02))
      const a = Math.atan2(q.y - p.y, q.x - p.x)
      for (const side of [-1, 1]) {
        for (const reach of [1, 0.6]) {
          const n = a + side * (1.1 + rand() * 0.3)
          g.strokeStyle = GREENS[Math.floor(rand() * 3)]
          g.lineWidth = 1.3
          g.beginPath()
          g.moveTo(p.x, p.y)
          g.lineTo(p.x + Math.cos(n) * 10 * reach, p.y + Math.sin(n) * 10 * reach)
          g.stroke()
        }
      }
    }
    // A bauble hanging from the lowest point of each swag.
    const low = at(0.5)
    const hue = [VERMILION, LAPIS, '#d6b05a'][k % 3]
    g.strokeStyle = '#d6b05a'
    g.lineWidth = 0.8
    g.beginPath(); g.moveTo(low.x, low.y); g.lineTo(low.x, low.y + 14); g.stroke()
    g.fillStyle = hue === '#d6b05a' ? goldOf(g, low.x, low.y + 21, 7) : hue
    g.beginPath(); g.arc(low.x, low.y + 21, 7, 0, Math.PI * 2); g.fill()
    g.strokeStyle = INK
    g.stroke()
    g.fillStyle = 'rgba(255, 255, 255, 0.5)'
    g.beginPath(); g.arc(low.x - 2.4, low.y + 18.6, 2, 0, Math.PI * 2); g.fill()
    g.fillStyle = goldOf(g, low.x, low.y + 13, 3)
    g.fillRect(low.x - 2.6, low.y + 12.6, 5.2, 3)
  }
  // A red bow at every nail between.
  for (const x of nails.slice(1, -1)) {
    g.fillStyle = VERMILION
    g.strokeStyle = INK
    g.lineWidth = 0.8
    g.beginPath()
    g.moveTo(x, top)
    g.bezierCurveTo(x - 18, top - 10, x - 22, top + 10, x, top)
    g.bezierCurveTo(x + 18, top - 10, x + 22, top + 10, x, top)
    g.fill(); g.stroke()
    g.beginPath()
    g.moveTo(x, top); g.lineTo(x - 10, top + 24); g.lineTo(x - 5, top + 22); g.lineTo(x - 3, top + 27); g.closePath()
    g.moveTo(x, top); g.lineTo(x + 10, top + 24); g.lineTo(x + 5, top + 22); g.lineTo(x + 3, top + 27); g.closePath()
    g.fill(); g.stroke()
    g.fillStyle = '#9e2a22'
    g.beginPath(); g.arc(x, top, 4, 0, Math.PI * 2); g.fill(); g.stroke()
  }
}
export const AdventGarland = () => <Painted className="under" draw={drawGarland} />

/** St Valentine's: a briar of roses climbing each side of the window. */
function drawRoseSides(g, w, h) {
  const rand = seeded(23)
  const climb = (side) => {
    const edge = side < 0 ? 12 : w - 12
    let x = edge
    let y = h - 6
    const top = h * 0.32
    g.strokeStyle = '#2d6a43'
    g.lineWidth = 2.2
    const pts = []
    while (y > top) {
      const nx = edge - side * (8 + rand() * 22)
      const ny = y - 26 - rand() * 18
      g.beginPath()
      g.moveTo(x, y)
      g.quadraticCurveTo(edge - side * (rand() * 30), (y + ny) / 2, nx, ny)
      g.stroke()
      pts.push({ x: nx, y: ny })
      x = nx
      y = ny
    }
    pts.forEach((p, i) => {
      leaf(g, IVY, p.x, p.y, side < 0 ? -0.4 + rand() : Math.PI + 0.4 - rand(), 11 + rand() * 4, GREENS[i % 3])
      if (i % 2 === 0) {
        // A rose: five petals round a gold heart, with sepals between.
        const r = 7 + rand() * 4
        const hue = rand() < 0.5 ? VERMILION : '#c9718a'
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 - Math.PI / 2
          g.fillStyle = hue
          g.strokeStyle = INK
          g.lineWidth = 0.6
          g.beginPath()
          g.arc(p.x + Math.cos(a) * r * 0.5, p.y + Math.sin(a) * r * 0.5, r * 0.55, 0, Math.PI * 2)
          g.fill(); g.stroke()
        }
        g.fillStyle = 'rgba(255, 255, 255, 0.25)'
        g.beginPath(); g.arc(p.x, p.y, r * 0.45, 0, Math.PI * 2); g.fill()
        g.fillStyle = goldOf(g, p.x, p.y, r * 0.25)
        g.beginPath(); g.arc(p.x, p.y, r * 0.24, 0, Math.PI * 2); g.fill()
      }
    })
  }
  climb(-1)
  climb(1)
}
export const RoseSides = () => <Painted className="under" draw={drawRoseSides} />

/** Carnival: pennants in motley strung along the head of the window. */
function drawPennants(g, w) {
  const colours = [LAPIS, VERMILION, '#2d6a43', '#d6b05a']
  const step = 30
  g.strokeStyle = '#d6b05a'
  g.lineWidth = 1
  g.beginPath()
  for (let x = 10; x <= w - 10; x += 2) g.lineTo(x, 11 + Math.sin(((x - 10) / (w - 20)) * Math.PI * 6) * 3)
  g.stroke()
  for (let i = 0, x = 12; x < w - 30; i++, x += step) {
    const y = 11 + Math.sin(((x - 10) / (w - 20)) * Math.PI * 6) * 3
    g.fillStyle = colours[i % 4]
    g.strokeStyle = INK
    g.lineWidth = 0.7
    g.beginPath()
    g.moveTo(x, y); g.lineTo(x + step - 4, y); g.lineTo(x + (step - 4) / 2, y + 20); g.closePath()
    g.fill(); g.stroke()
    if (i % 2 === 0) {
      g.fillStyle = goldOf(g, x + (step - 4) / 2, y + 24, 3)
      g.beginPath(); g.arc(x + (step - 4) / 2, y + 24, 3, 0, Math.PI * 2); g.fill(); g.stroke()
    }
  }
}
export const CarnivalPennants = () => <Painted className="under" draw={drawPennants} />
