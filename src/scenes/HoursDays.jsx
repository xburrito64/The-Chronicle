import { useEffect, useId, useRef, useState } from 'react'
import { feastOf } from './hoursFeasts.js'
import { FeastMiniature, Metals, spritesFor } from './HoursFeasts.jsx'
import { Herald, BannerWords, roman } from './HoursFeastBars.jsx'
import {
  HallowBats, HoursFireworks, HoursMeteors, HoursFireflies, StJohnsFire,
  LilyBorder, AdventGarland, RoseSides, CarnivalPennants,
} from './HoursSkies.jsx'
import { stillness } from './loop.js'
import { todayISO } from '../time.js'

// A feast day in Black Hours, on the day itself.
//
// The book opens on it with a proclamation: a leaf of vellum unfolds at the
// head of the page with the feast's painting, its name in the calendar's red
// and its own words. And each feast keeps something of its own about the
// page for the day:
//
//   Christmas Eve   the star over Bethlehem above the head of the page, its
//                   light let down to a stable drawn in gold at the foot
//   Advent          a fir garland over the window; the candles at the corner
//                   of the desk, as many lit as Sundays have come
//   All Hallows     bats that scatter from the pointer; a skeleton in the
//                   corner that waves when you come near
//   Easter          lilies along the foot of the window, and five painted
//                   eggs hidden about the page — find them all and a dove
//                   flies over
//   St Nicholas     three purses of gold on a heap of coins, spilling coins
//                   when pressed
//   St Valentine    roses climbing the sides of the window; two lovebirds on
//                   the border at the head of the page, hearts between them
//   Carnival        pennants strung over the window; a fool juggling at the
//                   foot of the page, who ducks when you come near
//   St Sylvester    fireworks of gold, more and more as midnight comes, and
//                   the last ten seconds counted in Roman numerals
//   New Year        the leaf of the old year turned over as the book opens,
//                   and fireworks for the first hours of the new one
//   Perseids        the tears of St Lawrence falling, in gold
//   Geminids        the Geminids falling, in silver and colours
//   Longest night   the dark comes in, and the light goes where the pointer
//                   goes, like a candle carried; the moon over the page
//   Midsummer       fireflies that come to the pointer; St John's fire in
//                   the corner of the desk
//   A birthday      heralds sounding from both corners, their banners
//                   bearing the years and the name
//   The anniversary the book's seal pressed on the page, the years in it
//
// Trying a feast out in the settings plays what would otherwise wait for
// its hour: the countdown, the fireworks, the turning of the leaf.

/** Bits of gold, petals or coins lifting off at x, y and falling away. */
export function scatter(x, y, sprites, count = 16, spread = 1) {
  const leaf = document.querySelector('.app > .hours-leaf')
  if (!leaf || stillness()) return
  const flakes = document.createElement('div')
  flakes.className = 'hours-flakes'
  Object.assign(flakes.style, { left: `${x}px`, top: `${y}px` })
  for (let i = 0; i < count; i++) {
    const flake = document.createElement('i')
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 3
    const d = (24 + Math.random() * 46) * spread
    flake.className = 'feast'
    flake.style.setProperty('--dx', `${(Math.cos(a) * d).toFixed(1)}px`)
    flake.style.setProperty('--dy', `${(Math.sin(a) * d).toFixed(1)}px`)
    flake.style.setProperty('--fall', `${(20 + Math.random() * 40).toFixed(1)}px`)
    flake.style.setProperty('--turn', `${Math.round((Math.random() - 0.5) * 540)}deg`)
    flake.style.setProperty('--size', `${(6 + Math.random() * 6).toFixed(1)}px`)
    flake.style.animationDelay = `${Math.round(Math.random() * 120)}ms`
    flake.style.backgroundImage = sprites[i % sprites.length]
    flakes.appendChild(flake)
  }
  leaf.appendChild(flakes)
  setTimeout(() => flakes.remove(), 2200)
}

/** Where things are on the page, measured again when the window changes. */
function usePlaces() {
  const [places, setPlaces] = useState(null)
  useEffect(() => {
    const measure = () => {
      const rect = (sel) => document.querySelector(sel)?.getBoundingClientRect() ?? null
      setPlaces({
        w: window.innerWidth,
        h: window.innerHeight,
        border: rect('.app > .hours-border'),
        title: rect('.app header h1'),
        today: rect('.nav.today'),
      })
    }
    measure()
    const later = setTimeout(measure, 900)
    window.addEventListener('resize', measure)
    return () => { clearTimeout(later); window.removeEventListener('resize', measure) }
  }, [])
  return places
}

// --- the proclamation ----------------------------------------------------------

/** A leaf of vellum unfolding at the head of the page, and folding away. */
export function Proclamation({ mini, latin, name, line, onDone }) {
  useEffect(() => {
    const timer = setTimeout(() => onDone?.(), 7200)
    return () => clearTimeout(timer)
  }, [onDone])
  return (
    <div className="hours-card" role="status" onClick={() => onDone?.()}>
      <i /><i /><i /><i />
      <span className="hc-mini">{mini}</span>
      <span className="hc-words">
        <span className="hc-latin">{latin}</span>
        <b className="hc-name">{name}</b>
        <span className="hc-line">{line}</span>
      </span>
    </div>
  )
}

/** The feasts of the day proclaimed, one after another, shortly after opening. */
function Proclamations({ festivals }) {
  const [at, setAt] = useState(-1)
  const key = festivals.map((f) => f.key ?? f.id).join(',')
  useEffect(() => {
    setAt(-1)
    const timer = setTimeout(() => setAt(0), 700)
    return () => clearTimeout(timer)
  }, [key])
  const f = festivals[at]
  const feast = f && feastOf(f)
  if (!feast) return null
  return (
    <Proclamation
      key={`${key}-${at}`}
      mini={<FeastMiniature id={f.id} nth={f.nth} lit size={62} />}
      latin={feast.latin}
      name={f.name}
      line={feast.line}
      onDone={() => setAt((i) => (i + 1 < festivals.length ? i + 1 : -2))}
    />
  )
}

// --- Easter: five eggs ------------------------------------------------------------

const EGG = 'M11 1.5C6.6 1.5 2.5 9.6 2.5 16.2c0 6 3.8 10.3 8.5 10.3s8.5-4.3 8.5-10.3C19.5 9.6 15.4 1.5 11 1.5Z'

/** An egg painted the way the margins paint them, in one of five patterns. */
function PaintedEgg({ tone }) {
  const id = `e${useId().replace(/:/g, '')}`
  const gold = `url(#${id}g)`
  const grounds = ['#c8352a', '#27458f', '#2d6a43', null, '#f1ead8']
  const pattern = [
    <g key="0"><path d="M2 12.6c6 2 12 2 18 0M2 19c6 2 12 2 18 0" stroke={gold} strokeWidth="1.6" fill="none" />{[5, 9, 13, 17].map((x) => <circle key={x} cx={x} cy="15.9" r="0.8" fill={gold} />)}</g>,
    <g key="1" fill={gold}>{[[7, 8], [14, 10], [9, 15], [15, 18], [7, 21], [12, 23]].map(([x, y]) => <path key={`${x}${y}`} d={`M${x} ${y - 2}l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6Z`} />)}</g>,
    <g key="2"><path d="M2 11l3 3 3-3 3 3 3-3 3 3 3-3M2 18l3 3 3-3 3 3 3-3 3 3 3-3" stroke={gold} strokeWidth="1.2" fill="none" /></g>,
    <g key="3"><path d="M11 6v15M6 12.4h10" stroke="#c8352a" strokeWidth="2.4" /><circle cx="11" cy="12.4" r="2" fill="#c8352a" /></g>,
    <g key="4">{[[7, 10, '#27458f'], [15, 10, '#c8352a'], [11, 16, '#27458f'], [7, 21, '#c8352a'], [15, 21, '#27458f']].map(([x, y, c]) => <path key={`${x}${y}`} d={`M${x} ${y - 2.6}l2.6 2.6-2.6 2.6-2.6-2.6Z`} fill={c} />)}</g>,
  ]
  return (
    <svg viewBox="0 0 22 28" width="22" height="28" aria-hidden="true">
      <defs>
        <Metals id={id} />
        <clipPath id={`${id}c`}><path d={EGG} /></clipPath>
      </defs>
      <path d={EGG} fill={grounds[tone] ?? gold} />
      <g clipPath={`url(#${id}c)`}>{pattern[tone]}</g>
      <path d={EGG} fill="none" stroke="#2a1d08" strokeWidth="0.9" />
      <path d="M6.6 9c.6-2.2 1.8-3.8 3-4.6" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}

/** The dove, flying over the page with a sprig of olive. */
function Dove() {
  return (
    <div className="hours-dove" aria-hidden="true">
      <svg viewBox="0 0 80 50" width="96" height="60">
        <g className="dove-wing back"><path d="M38 24C30 10 18 4 6 6c10 4 18 12 24 20Z" fill="#e9e3d4" stroke="#7a6a58" strokeWidth="0.8" /></g>
        <path d="M14 30c10-6 26-8 40-4 6 1 10-2 14-4 2 4-2 8-8 9-8 6-24 8-36 6-4 2-8 4-12 3 2-4 2-7 2-10Z" fill="#fbf8f0" stroke="#7a6a58" strokeWidth="0.8" />
        <circle cx="62" cy="24" r="1.2" fill="#2a1d08" />
        <path d="M68 22l6 1-6 2Z" fill="#d6b05a" />
        <path d="M72 23c3 2 4 6 3 9M75 26l3-1M75 30l3 1" stroke="#2d6a43" strokeWidth="1" fill="none" />
        <g className="dove-wing"><path d="M40 24C34 8 24 0 10 0c10 6 18 14 22 26Z" fill="#fbf8f0" stroke="#7a6a58" strokeWidth="0.8" /></g>
      </svg>
    </div>
  )
}

/**
 * Five eggs hidden about the page: in the border at its head, beside the
 * title, against the left edge, low at the right, and leaning on the Today
 * button. Each one found breaks open in petals and gold, and is remembered
 * for the day; all five found, a dove flies over and it is proclaimed.
 */
function EasterHunt({ trying }) {
  const places = usePlaces()
  const key = `daily-documenter:hours-eggs:${todayISO()}`
  const [found, setFound] = useState(() => {
    if (trying) return []
    try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
  })
  const [done, setDone] = useState(false)
  if (!places) return null
  const { w, h, border, title, today } = places
  const spots = [
    border ? { x: border.left + border.width * 0.42, y: border.bottom - 30, turn: -10 } : { x: w * 0.45, y: 60, turn: -10 },
    title ? { x: title.right + 4, y: title.bottom - 30, turn: 14 } : { x: 240, y: 70, turn: 14 },
    { x: 12, y: h * 0.56, turn: -22 },
    { x: w - 50, y: h - 58, turn: 8 },
    today ? { x: today.left - 26, y: today.bottom - 26, turn: -6 } : { x: w - 300, y: 60, turn: -6 },
  ]
  const find = (i, e) => {
    if (found.includes(i)) return
    const next = [...found, i]
    setFound(next)
    if (!trying) {
      try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* remembered until closed */ }
    }
    const r = e.currentTarget.getBoundingClientRect()
    scatter(r.left + r.width / 2, r.top + r.height / 2, [...spritesFor('petals'), ...spritesFor('stars')], 22)
    if (next.length === spots.length) setDone(true)
  }
  return (
    <>
      <div className="hours-eggs">
        {spots.map((s, i) => (found.includes(i) ? null : (
          <button
            key={i}
            type="button"
            className="hours-egg"
            aria-label="A hidden egg"
            style={{ left: `${s.x}px`, top: `${s.y}px`, '--turn': `${s.turn}deg` }}
            onClick={(e) => find(i, e)}
          >
            <PaintedEgg tone={i} />
          </button>
        )))}
      </div>
      {done && (
        <>
          <Dove />
          <Proclamation
            mini={<FeastMiniature id="easter" lit size={62} />}
            latin="Alleluia"
            name="All five eggs found"
            line="the morning thanks you for looking"
            onDone={() => setDone(false)}
          />
        </>
      )}
    </>
  )
}

// --- Christmas Eve: the star and the stable ----------------------------------------

/**
 * The star over Bethlehem, above the head of the page, its rays turning
 * slowly and its light let down the page to a stable drawn in gold at the
 * foot. Brighter after dusk.
 */
function Nativity() {
  const places = usePlaces()
  const ref = useRef(null)
  const x = places ? (places.border ? places.border.left + places.border.width * 0.8 : places.w * 0.7) : 0
  const y = places?.border ? places.border.top + places.border.height * 0.42 : 50
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return undefined
    const S = 220
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = S * dpr
    canvas.height = S * dpr
    const g = canvas.getContext('2d')
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    const dusk = new Date().getHours() >= 16 ? 1 : 0.75
    const draw = (t) => {
      g.clearRect(0, 0, S, S)
      const c = S / 2
      const breathe = 0.85 + Math.sin(t * 0.0012) * 0.15
      const halo = g.createRadialGradient(c, c, 0, c, c, c)
      halo.addColorStop(0, `rgba(255, 236, 180, ${0.55 * dusk * breathe})`)
      halo.addColorStop(0.25, `rgba(255, 214, 130, ${0.18 * dusk})`)
      halo.addColorStop(1, 'rgba(255, 214, 130, 0)')
      g.fillStyle = halo
      g.fillRect(0, 0, S, S)
      const turn = t * 0.00006
      for (let i = 0; i < 16; i++) {
        const a = turn + (i / 16) * Math.PI * 2
        const long = i % 2 ? 0.42 : 0.95
        const len = c * long * (0.9 + 0.1 * Math.sin(t * 0.002 + i))
        const ray = g.createLinearGradient(c, c, c + Math.cos(a) * len, c + Math.sin(a) * len)
        ray.addColorStop(0, `rgba(255, 244, 200, ${0.9 * dusk})`)
        ray.addColorStop(1, 'rgba(255, 220, 140, 0)')
        g.fillStyle = ray
        g.beginPath()
        g.moveTo(c + Math.cos(a - Math.PI / 2) * 2.4, c + Math.sin(a - Math.PI / 2) * 2.4)
        g.lineTo(c + Math.cos(a) * len, c + Math.sin(a) * len)
        g.lineTo(c + Math.cos(a + Math.PI / 2) * 2.4, c + Math.sin(a + Math.PI / 2) * 2.4)
        g.fill()
      }
      // The star itself: eight points of gold, white at the heart.
      g.beginPath()
      for (let i = 0; i < 16; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 8
        const d = i % 2 ? 6 : 17
        const px = c + Math.cos(a) * d
        const py = c + Math.sin(a) * d
        if (i) g.lineTo(px, py); else g.moveTo(px, py)
      }
      g.closePath()
      const body = g.createLinearGradient(c - 17, c - 17, c + 17, c + 17)
      body.addColorStop(0, '#fff6d0')
      body.addColorStop(0.5, '#e2bd62')
      body.addColorStop(1, '#9a7428')
      g.fillStyle = body
      g.fill()
      g.strokeStyle = 'rgba(42, 29, 8, 0.8)'
      g.lineWidth = 0.8
      g.stroke()
      g.fillStyle = '#fffdf0'
      g.beginPath(); g.arc(c, c, 3.4, 0, Math.PI * 2); g.fill()
    }
    if (stillness()) { draw(0); return undefined }
    let frame
    let last = 0
    const tick = (t) => {
      frame = requestAnimationFrame(tick)
      if (document.hidden || t - last < 50) return
      last = t
      draw(t)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [places !== null])
  if (!places) return null
  return (
    <>
      <div className="hours-beam" aria-hidden="true" style={{ left: x - 90, top: y }} />
      <canvas ref={ref} className="hours-star" aria-hidden="true" style={{ left: x - 110, top: y - 110, width: 220, height: 220 }} />
      <svg className="hours-stable" viewBox="0 0 150 96" aria-hidden="true" style={{ left: Math.min(places.w - 170, x - 75) }}>
        <defs>
          <radialGradient id="hours-manger">
            <stop offset="0" stopColor="#fff2c0" stopOpacity="0.9" />
            <stop offset="1" stopColor="#ffd780" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="75" cy="72" r="26" fill="url(#hours-manger)" />
        <g fill="none" stroke="#e2bd62" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          {/* The stable: a thatched roof on two posts. */}
          <path d="M10 42 75 8 140 42M18 38v54M132 38v54M4 92h142" />
          <path d="M30 31l4 6M46 23l4 6M62 15l3 6M88 15l-3 6M104 23l-4 6M120 31l-4 6" strokeWidth="0.9" />
          {/* The ox and the ass, looking in from the back. */}
          <path d="M44 56c-4-6 0-12 6-12s9 4 8 9M42 48l-5-4M57 47l5-4M47 52h.1M54 52h.1" />
          <path d="M96 58c-2-6 1-12 6-13 4-1 8 3 7 8M99 46l-3-9M106 46l2-9M100 52h.1" />
          {/* The manger, straw over its edge. */}
          <path d="M58 76h34l-4 12H62Z M60 76l3-4M66 76l2-5M74 76v-5M82 76l-2-5M89 76l-3-4" />
          {/* Mary kneeling, Joseph with his staff. */}
          <path d="M36 92c-2-10 0-20 6-26 5-4 9-1 9 4 0 4-2 6 0 10 3 6 2 9 0 12M40 70c3-2 6-2 8 0" />
          <path d="M114 92c2-12 1-24-2-32-2-6-8-6-10 0-2 7 0 18-1 32M120 50v42M104 64c4 2 8 2 16 0" />
        </g>
        <circle cx="42" cy="62" r="4.6" fill="none" stroke="#e2bd62" strokeWidth="0.8" />
        <circle cx="107" cy="55" r="4.6" fill="none" stroke="#e2bd62" strokeWidth="0.8" />
      </svg>
    </>
  )
}

// --- All Hallows' Eve: the dancing skeleton ------------------------------------------

/** A skeleton of the dance of death in the corner, who waves when you come near. */
function Skeleton() {
  const ref = useRef(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const move = (e) => {
      const r = ref.current?.getBoundingClientRect()
      if (!r) return
      setNear(Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) < 240)
    }
    window.addEventListener('pointermove', move)
    return () => window.removeEventListener('pointermove', move)
  }, [])
  const bone = { stroke: '#2a1d08', strokeWidth: 1, strokeLinecap: 'round', strokeLinejoin: 'round' }
  return (
    <svg ref={ref} className={`hours-skeleton${near ? ' waving' : ''}`} viewBox="0 0 90 140" aria-hidden="true">
      <g className="sk-body">
        {/* Skull */}
        <path d="M45 6c-9 0-14 6-14 13 0 5 2 8 5 10v5h18v-5c3-2 5-5 5-10 0-7-5-13-14-13Z" fill="#efe6cf" {...bone} />
        <ellipse cx="40" cy="19" rx="3.4" ry="3.8" fill="#14121a" />
        <ellipse cx="50" cy="19" rx="3.4" ry="3.8" fill="#14121a" />
        <path d="M45 23l-1.6 3.4h3.2Z" fill="#14121a" />
        <path d="M39.6 31.4h10.8M42 30v3M45 30v3M48 30v3" {...bone} strokeWidth="0.7" />
        {/* Spine, ribs, pelvis */}
        <path d="M45 34v42" stroke="#efe6cf" strokeWidth="4" strokeLinecap="round" />
        <path d="M45 34v42" fill="none" {...bone} strokeDasharray="2.4 1.6" />
        {[42, 49, 56, 63].map((y, i) => (
          <path key={y} d={`M45 ${y}c-${10 - i} 0-${14 - i * 2} 3-${14 - i * 2} 6M45 ${y}c${10 - i} 0 ${14 - i * 2} 3 ${14 - i * 2} 6`} fill="none" stroke="#efe6cf" strokeWidth="2.6" />
        ))}
        {[42, 49, 56, 63].map((y, i) => (
          <path key={`o${y}`} d={`M45 ${y}c-${10 - i} 0-${14 - i * 2} 3-${14 - i * 2} 6M45 ${y}c${10 - i} 0 ${14 - i * 2} 3 ${14 - i * 2} 6`} fill="none" {...bone} strokeWidth="0.5" />
        ))}
        <path d="M34 78c4-4 18-4 22 0 2 4-2 8-11 8s-13-4-11-8Z" fill="#efe6cf" {...bone} />
        {/* Legs, mid-step in the dance */}
        <path d="M39 84 33 106 38 130M51 84l8 20-4 26" fill="none" stroke="#efe6cf" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M39 84 33 106 38 130M51 84l8 20-4 26M34 131h-8M55 131h8" fill="none" {...bone} strokeWidth="0.7" />
        {/* The left arm, on the hip */}
        <path d="M34 40 24 56 34 70" fill="none" stroke="#efe6cf" strokeWidth="3" strokeLinecap="round" />
        <path d="M34 40 24 56 34 70" fill="none" {...bone} strokeWidth="0.7" />
      </g>
      {/* The right arm: it waves. */}
      <g className="sk-arm">
        <path d="M56 40 70 30 76 12" fill="none" stroke="#efe6cf" strokeWidth="3" strokeLinecap="round" />
        <path d="M56 40 70 30 76 12M74 10l-2-5M77 9l0-5M80 10l2-4" fill="none" {...bone} strokeWidth="0.7" />
      </g>
    </svg>
  )
}

// --- St Nicholas: three purses of gold -----------------------------------------------

function Purses() {
  const [shaking, setShaking] = useState(-1)
  const spill = (i, e) => {
    setShaking(i)
    setTimeout(() => setShaking(-1), 600)
    const r = e.currentTarget.getBoundingClientRect()
    scatter(r.left + r.width / 2, r.top + 6, spritesFor('coins'), 14, 1.3)
  }
  return (
    <div className="hours-purses">
      <svg className="purse-heap" viewBox="0 0 170 40" aria-hidden="true">
        {[[20, 32], [40, 28], [62, 33], [84, 26], [104, 31], [126, 27], [148, 33], [72, 20], [96, 18], [52, 22], [118, 20]].map(([x, y], i) => (
          <ellipse key={i} cx={x} cy={y} rx="11" ry="4.4" fill={i % 2 ? '#e2bd62' : '#c9a24c'} stroke="#2a1d08" strokeWidth="0.8" />
        ))}
      </svg>
      {[0, 1, 2].map((i) => (
        <button
          key={i}
          type="button"
          className={`purse${shaking === i ? ' shaking' : ''}`}
          style={{ left: `${18 + i * 46}px` }}
          aria-label="A purse of gold"
          onClick={(e) => spill(i, e)}
        >
          <svg viewBox="0 0 40 46" width="40" height="46" aria-hidden="true">
            <path d="M12 14c-8 6-10 18-6 25 3 5 25 5 28 0 4-7 2-19-6-25Z" fill={['#c8352a', '#27458f', '#2d6a43'][i]} stroke="#2a1d08" strokeWidth="1" />
            <path d="M11 14c2-4 16-4 18 0-2 3-16 3-18 0Z" fill="#9e7a32" stroke="#2a1d08" strokeWidth="0.8" />
            <path d="M14 8c2 3 4 4 6 6 2-2 4-3 6-6" fill="none" stroke="#9e7a32" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M12 26c6 2 10 2 16 0" fill="none" stroke="#e2bd62" strokeWidth="1.2" />
            <circle cx="20" cy="33" r="3.6" fill="#e2bd62" stroke="#2a1d08" strokeWidth="0.7" />
          </svg>
        </button>
      ))}
    </div>
  )
}

// --- St Valentine's: the lovebirds ----------------------------------------------------

function Lovebirds() {
  const places = usePlaces()
  if (!places?.border) return null
  const x = places.border.left + places.border.width * 0.44
  const y = places.border.bottom - 40
  const send = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    scatter(r.left + r.width / 2, r.top + 10, spritesFor('hearts'), 10, 0.9)
  }
  return (
    <button type="button" className="hours-lovebirds" style={{ left: x - 40, top: y }} aria-label="Two lovebirds" onClick={send}>
      <svg viewBox="0 0 80 40" width="80" height="40" aria-hidden="true">
        <path className="lb-heart" d="M40 15c-3-2.4-5-4.2-5-6.2 0-1.5 1.1-2.6 2.5-2.6 1 0 1.9.6 2.5 1.5.6-.9 1.5-1.5 2.5-1.5 1.4 0 2.5 1.1 2.5 2.6 0 2-2 3.8-5 6.2Z" fill="#c8352a" stroke="#e2bd62" strokeWidth="0.6" />
        <g>
          <path d="M8 34c2-10 10-16 18-14 4 1 6 4 6 7l4 1-4 2c-2 5-10 7-16 6-3 2-7 2-10 1Z" fill="#c9718a" stroke="#2a1d08" strokeWidth="0.8" />
          <path d="M14 28c4-2 8-2 11 1" fill="none" stroke="#9e2a22" strokeWidth="0.9" />
          <circle cx="28" cy="25" r="1" fill="#14121a" />
        </g>
        <g transform="translate(80 0) scale(-1 1)">
          <path d="M8 34c2-10 10-16 18-14 4 1 6 4 6 7l4 1-4 2c-2 5-10 7-16 6-3 2-7 2-10 1Z" fill="#c8352a" stroke="#2a1d08" strokeWidth="0.8" />
          <path d="M14 28c4-2 8-2 11 1" fill="none" stroke="#7a1c16" strokeWidth="0.9" />
          <circle cx="28" cy="25" r="1" fill="#14121a" />
        </g>
        <path d="M2 38h76" stroke="#e2bd62" strokeWidth="1.2" />
      </svg>
    </button>
  )
}

// --- Carnival: the juggling fool -------------------------------------------------------

function Jester() {
  const ref = useRef(null)
  const [hiding, setHiding] = useState(false)
  useEffect(() => {
    let timer = null
    const move = (e) => {
      const r = ref.current?.getBoundingClientRect()
      if (!r) return
      const close = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) < 170
      if (close) {
        clearTimeout(timer)
        setHiding(true)
      } else {
        clearTimeout(timer)
        timer = setTimeout(() => setHiding(false), 900)
      }
    }
    window.addEventListener('pointermove', move)
    return () => { clearTimeout(timer); window.removeEventListener('pointermove', move) }
  }, [])
  return (
    <div ref={ref} className={`hours-jester${hiding ? ' hiding' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 90 120" width="90" height="120">
        <g className="jg-balls">
          <circle className="jb jb1" cx="45" cy="10" r="4.4" fill="#c8352a" stroke="#2a1d08" strokeWidth="0.8" />
          <circle className="jb jb2" cx="45" cy="10" r="4.4" fill="#27458f" stroke="#2a1d08" strokeWidth="0.8" />
          <circle className="jb jb3" cx="45" cy="10" r="4.4" fill="#e2bd62" stroke="#2a1d08" strokeWidth="0.8" />
        </g>
        {/* Motley: a tunic quartered blue and red, sleeves the other way. */}
        <path d="M24 120 28 78c2-8 30-8 34 0l4 42Z" fill="#27458f" stroke="#2a1d08" strokeWidth="1" />
        <path d="M45 74c8 0 16 1 17 4l4 42H45Z" fill="#c8352a" stroke="#2a1d08" strokeWidth="1" />
        <path d="M28 80 14 60M62 80 76 60" stroke="#2a1d08" strokeWidth="6.4" strokeLinecap="round" />
        <path d="M28 80 14 60" stroke="#c8352a" strokeWidth="5" strokeLinecap="round" />
        <path d="M62 80 76 60" stroke="#27458f" strokeWidth="5" strokeLinecap="round" />
        <circle cx="14" cy="58" r="3.6" fill="#efe6cf" stroke="#2a1d08" strokeWidth="0.8" />
        <circle cx="76" cy="58" r="3.6" fill="#efe6cf" stroke="#2a1d08" strokeWidth="0.8" />
        <path d="M30 74l5 6 5-6 5 6 5-6 5 6 5-6" fill="#e2bd62" stroke="#2a1d08" strokeWidth="0.8" />
        {/* The face, and the cap of bells. */}
        <circle cx="45" cy="60" r="12" fill="#efe6cf" stroke="#2a1d08" strokeWidth="1" />
        <circle cx="41" cy="58" r="1.3" fill="#14121a" /><circle cx="49" cy="58" r="1.3" fill="#14121a" />
        <path d="M40 64q5 4 10 0" fill="none" stroke="#2a1d08" strokeWidth="1" />
        <circle cx="38" cy="63" r="2" fill="#c8352a" opacity="0.4" /><circle cx="52" cy="63" r="2" fill="#c8352a" opacity="0.4" />
        <path d="M33 54c-4-8-10-10-18-8 8-6 18-2 22 6ZM57 54c4-8 10-10 18-8-8-6-18-2-22 6Z" fill="#2d6a43" stroke="#2a1d08" strokeWidth="0.9" />
        <path d="M38 50c0-10 3-16 7-22 4 6 7 12 7 22Z" fill="#c8352a" stroke="#2a1d08" strokeWidth="0.9" />
        <circle cx="15" cy="46" r="2.8" fill="#e2bd62" stroke="#2a1d08" strokeWidth="0.7" />
        <circle cx="75" cy="46" r="2.8" fill="#e2bd62" stroke="#2a1d08" strokeWidth="0.7" />
        <circle cx="45" cy="27" r="2.8" fill="#e2bd62" stroke="#2a1d08" strokeWidth="0.7" />
      </svg>
    </div>
  )
}

// --- the turn of the year ------------------------------------------------------------

/**
 * The last seconds of the year counted in Roman numerals across the page,
 * and the new year proclaimed at midnight. With `demo`, a midnight a few
 * seconds from now, for trying the day out.
 */
function RomanCountdown({ demo, onMidnight }) {
  const [left, setLeft] = useState(null)
  const [hail, setHail] = useState(false)
  const told = useRef(onMidnight)
  told.current = onMidnight
  useEffect(() => {
    const midnight = demo ? Date.now() + 14000 : (() => {
      const d = new Date()
      d.setHours(24, 0, 0, 0)
      return d.getTime()
    })()
    let fired = false
    const timer = setInterval(() => {
      const ms = midnight - Date.now()
      if (ms <= 0) {
        if (!fired) {
          fired = true
          setLeft(null)
          setHail(true)
          told.current?.()
          setTimeout(() => setHail(false), 9000)
        }
        return
      }
      setLeft(ms <= 10000 ? Math.ceil(ms / 1000) : null)
    }, 200)
    return () => clearInterval(timer)
  }, [demo])
  // Read after midnight has struck, so it is already the new year's number.
  const year = new Date().getFullYear() + (demo ? 1 : 0)
  if (hail) {
    return (
      <div className="hours-annus" role="status">
        <span className="ha-latin">Annus Novus</span>
        <b className="ha-year">{roman(year)}</b>
      </div>
    )
  }
  if (left == null) return null
  return <div key={left} className="hours-count" aria-live="polite">{roman(left)}</div>
}

/** The old year's leaf turned over as the book opens on New Year's Day — once. */
function TurnedLeaf({ trying }) {
  const key = `daily-documenter:hours-leaf:${todayISO()}`
  const [turning] = useState(() => {
    if (trying) return true
    try {
      if (localStorage.getItem(key)) return false
      localStorage.setItem(key, '1')
    } catch { /* turns every time, then */ }
    return true
  })
  const [gone, setGone] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setGone(true), 3200)
    return () => clearTimeout(timer)
  }, [])
  if (!turning || gone || stillness()) return null
  return (
    <div className="hours-turn" aria-hidden="true">
      <div className="ht-leaf">
        {/* "Here ends": how a scribe closed a book. */}
        <span className="ht-explicit">Explicit annus</span>
        <span className="ht-old">{roman(new Date().getFullYear() - 1)}</span>
      </div>
    </div>
  )
}

function TurnOfTheYear({ festival, trying }) {
  const [flurry, setFlurry] = useState(0)
  return (
    <>
      <HoursFireworks festival={festival} demo={trying} flurry={flurry} />
      {festival === 'new-years-eve' && <RomanCountdown demo={trying} onMidnight={() => setFlurry((n) => n + 1)} />}
      {festival === 'new-year' && <TurnedLeaf trying={trying} />}
    </>
  )
}

// --- the longest night ----------------------------------------------------------------

/** The dark come in over the page, and the light carried where the pointer goes. */
function CarriedLight() {
  const ref = useRef(null)
  useEffect(() => {
    let frame = 0
    let tx = window.innerWidth / 2
    let ty = window.innerHeight / 2
    let x = tx
    let y = ty
    const move = (e) => { tx = e.clientX; ty = e.clientY }
    const tick = () => {
      frame = requestAnimationFrame(tick)
      x += (tx - x) * 0.18
      y += (ty - y) * 0.18
      ref.current?.style.setProperty('--lx', `${x.toFixed(1)}px`)
      ref.current?.style.setProperty('--ly', `${y.toFixed(1)}px`)
    }
    window.addEventListener('pointermove', move)
    if (!stillness()) frame = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('pointermove', move) }
  }, [])
  return (
    <>
      <div ref={ref} className="hours-dark" aria-hidden="true" />
      <div className="hours-moon" aria-hidden="true"><FeastMiniature id="longest-night" plain size={120} /></div>
    </>
  )
}

// --- a birthday: the heralds ----------------------------------------------------------

function Fanfare({ festival }) {
  const id = `h${useId().replace(/:/g, '')}`
  const [on, setOn] = useState(true)
  const age = festival.age ? roman(festival.age) : null
  const name = festival.self ? 'Dies Natalis' : (festival.person ?? 'Natalis')
  const left = age ?? (festival.self ? 'Tibi' : 'Natalis')
  useEffect(() => {
    const blow = setTimeout(() => {
      for (const side of ['left', 'right']) {
        const bell = document.querySelector(`.hours-herald.${side} .herald-bell`)?.getBoundingClientRect()
        if (bell) scatter(bell.left + bell.width / 2, bell.top + bell.height / 2, [...spritesFor('confetti'), ...spritesFor('stars')], 26, 1.6)
      }
    }, 1100)
    const away = setTimeout(() => setOn(false), 9500)
    return () => { clearTimeout(blow); clearTimeout(away) }
  }, [])
  if (!on) return null
  return (
    <>
      {['left', 'right'].map((side) => (
        <svg key={side} className={`hours-herald ${side}`} viewBox="0 0 220 100" aria-hidden="true">
          <defs><Metals id={`${id}${side}`} /></defs>
          <g transform={side === 'right' ? 'translate(220 0) scale(-1 1)' : undefined}>
            <Herald id={`${id}${side}`} />
            <circle className="herald-bell" cx="170" cy="32" r="8" fill="transparent" />
          </g>
          <BannerWords x={side === 'right' ? 139 : 81} words={side === 'right' ? name : left} />
        </svg>
      ))}
    </>
  )
}

// --- the anniversary: the seal ----------------------------------------------------------

function SealPressed({ festival }) {
  const [on, setOn] = useState(true)
  useEffect(() => {
    const press = setTimeout(() => {
      const seal = document.querySelector('.hours-seal svg')?.getBoundingClientRect()
      if (seal) scatter(seal.left + seal.width / 2, seal.top + seal.height / 2, spritesFor('stars'), 24, 1.8)
    }, 900)
    const away = setTimeout(() => setOn(false), 6500)
    return () => { clearTimeout(press); clearTimeout(away) }
  }, [])
  if (!on) return null
  return (
    <div className="hours-seal" aria-hidden="true">
      <i className="hs-ring" />
      <FeastMiniature id="anniversary" nth={festival.nth} size={150} />
      <span className="hs-words">Anniversarium · {roman(festival.nth ?? 1)}</span>
    </div>
  )
}

// --- the day ---------------------------------------------------------------------------

/** Everything a feast day keeps about the page, for every feast falling today. */
export default function HoursDay({ festivals }) {
  const trying = festivals.some((f) => f.preview)
  const has = (id) => festivals.find((f) => f.id === id)
  const advent = has('advent')
  const key = festivals.map((f) => f.key ?? f.id).join(',')
  return (
    <div className="hours-day" key={key}>
      {has('christmas-eve') && <Nativity />}
      {advent && <AdventGarland />}
      {advent && (
        <div className="hours-advent" aria-hidden="true">
          <FeastMiniature id="advent" nth={advent.nth} lit size={78} />
        </div>
      )}
      {has('halloween') && <HallowBats />}
      {has('halloween') && <Skeleton />}
      {has('easter') && <LilyBorder />}
      {has('easter') && <EasterHunt trying={trying} />}
      {has('st-nicholas') && <Purses />}
      {has('valentines') && <RoseSides />}
      {has('valentines') && <Lovebirds />}
      {has('carnival') && <CarnivalPennants />}
      {has('carnival') && <Jester />}
      {has('new-years-eve') && <TurnOfTheYear festival="new-years-eve" trying={trying} />}
      {has('new-year') && <TurnOfTheYear festival="new-year" trying={trying} />}
      {has('perseids') && <HoursMeteors radiant={PERSEIDS} tones={GOLD_TEARS} />}
      {has('geminids') && <HoursMeteors radiant={GEMINIDS} tones={GEMINI_TONES} every={GEMINI_EVERY} />}
      {has('longest-night') && <CarriedLight />}
      {has('midsummer') && <HoursFireflies />}
      {has('midsummer') && <StJohnsFire />}
      {has('birthday') && <Fanfare festival={has('birthday')} />}
      {has('anniversary') && <SealPressed festival={has('anniversary')} />}
      <Proclamations festivals={festivals} />
    </div>
  )
}

const PERSEIDS = [0.88, 0.04]
const GEMINIDS = [0.12, 0.06]
const GOLD_TEARS = ['255, 226, 150', '255, 240, 200', '255, 206, 120']
const GEMINI_TONES = ['255, 255, 255', '220, 228, 255', '255, 236, 170', '190, 255, 214']
// The Geminids are the richer shower of the two.
const GEMINI_EVERY = [0.35, 1.6]
