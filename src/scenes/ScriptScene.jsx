import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ivy, keptUp } from './manuscript.js'
import { stillness } from './loop.js'
import { feastOf } from './hoursFeasts.js'
import { FeastSky, LEAF, spritesFor } from './HoursFeasts.jsx'
import HoursDay from './HoursDays.jsx'
import { useMinute } from '../useMinute.js'
import { useFirstDay } from '../useFirstDay.js'
import { useBirthdays } from '../useBirthdays.js'
import { todayISO } from '../time.js'
import { useTodaysFestival } from '../feastPreview.js'

// Black Hours.
//
// A book of hours on black vellum, read by candlelight. The light pools from
// a candle low at the corner of the desk and moves a little as it burns; the
// page is ruled in gold at its edge.
//
// Along the head of the page runs a border of ivy, the way the bar borders of
// the books of hours ran from their initials: hairline stems drawn in silver,
// curling into spirals, with ivy leaves along them. As today is kept up with,
// the leaves are gilded one by one — a morning with nothing written has the
// border only drawn, a day kept to the minute has it all in gold. A snail
// lives on it, as one lived in every margin.
//
// Writing a stretch is laying gold: where the stroke ends, flakes of leaf
// lift off the page and settle.
//
// On a feast (hoursFeasts.js) the border grows the feast's own plant — holly
// on Christmas Eve, thorns on All Hallows' Eve, lilies at Easter, roses for
// St Valentine — painted in its colours as the day is kept up with, and
// something crosses the page (HoursFeasts.jsx): gold falling like snow,
// embers, petals, hearts, bats. In Advent four candles stand at the corner
// of the desk, as many lit as Sundays have come; and the snail dresses for
// Carnival, for Christmas Eve, and for your own birthday.
//
// Nothing here runs on a clock. The border is drawn again only when how much
// of it is gilded changes, or the window does; the candle flickers by fading
// one layer, which the graphics card does on its own.

// Which ivy grows. Any number will do; this one grows a handsome border.
const SEED = 11
// The bird on the hour goes to sleep at Compline and wakes at Prime.
const NIGHT_FROM = 21 * 60
const NIGHT_UNTIL = 6 * 60

/** Burnished gold for something `r` across at x, y: lit from the upper left. */
function gold(g, x, y, r) {
  const shine = g.createLinearGradient(x - r, y - r, x + r, y + r)
  shine.addColorStop(0, '#fff3c0')
  shine.addColorStop(0.35, '#e2bd62')
  shine.addColorStop(0.7, '#b08a3e')
  shine.addColorStop(1, '#7a5a1e')
  return shine
}

/** Polished silver, for the feasts kept in silver rather than gold. */
function silverOf(g, x, y, r) {
  const shine = g.createLinearGradient(x - r, y - r, x + r, y + r)
  shine.addColorStop(0, '#ffffff')
  shine.addColorStop(0.45, '#c9c6d4')
  shine.addColorStop(1, '#6f6a7d')
  return shine
}

const SILVER = 'rgba(206, 204, 216, 0.5)'
const DRAWN = 'rgba(206, 204, 216, 0.32)'
const HUES = { lapis: '#3f63c8', vermilion: '#cf4a33' }
// The border on an ordinary day: ivy in gold, flowering lapis and vermilion.
const PLAIN = { leaf: 'ivy', paint: null, bloom: 'flower', hues: null }
const LEAVES = Object.fromEntries(Object.entries(LEAF).map(([kind, d]) => [kind, new Path2D(d)]))

/**
 * One flower of the border, as the feast has it: a flower, berries, a rose,
 * a lily, a star or a bezant. Laid in colour and gold once `lit`; only drawn
 * in silver until then.
 */
function drawBloom(g, kind, x, y, r, hue, lit, silver) {
  const lay = (style) => {
    if (lit) {
      g.fillStyle = style
      g.fill()
      g.strokeStyle = 'rgba(42, 29, 8, 0.85)'
      g.lineWidth = 0.45
      g.stroke()
    } else {
      g.strokeStyle = DRAWN
      g.lineWidth = 0.6
      g.stroke()
    }
  }
  const circle = (cx, cy, rr) => { g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2) }
  const petals = (n, out, size, style, turn = -Math.PI / 2) => {
    for (let i = 0; i < n; i++) {
      const a = turn + (i / n) * Math.PI * 2
      circle(x + Math.cos(a) * out, y + Math.sin(a) * out, size)
      lay(style)
    }
  }
  if (kind === 'berry') {
    for (const [dx, dy] of [[0, -0.5], [-0.5, 0.35], [0.5, 0.35]]) {
      circle(x + dx * r, y + dy * r, r * 0.5)
      lay(hue)
    }
  } else if (kind === 'rose') {
    petals(5, r * 0.48, r * 0.52, hue)
    circle(x, y, r * 0.22)
    lay(gold(g, x, y, r * 0.3))
  } else if (kind === 'lily') {
    for (const deg of [-90, -30, -150]) {
      g.save()
      g.translate(x, y + r * 0.7)
      g.rotate((deg * Math.PI) / 180)
      g.scale(r * 1.8, r * 1.8)
      g.beginPath()
      g.lineWidth = 0.5 / (r * 1.8)
      if (lit) {
        g.fillStyle = hue
        g.fill(LEAVES.laurel)
        g.strokeStyle = 'rgba(42, 29, 8, 0.85)'
      } else {
        g.strokeStyle = DRAWN
      }
      g.stroke(LEAVES.laurel)
      g.restore()
    }
  } else if (kind === 'star') {
    g.beginPath()
    for (let i = 0; i < 12; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 6
      const d = i % 2 ? r * 0.45 : r
      if (i) g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d)
      else g.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d)
    }
    g.closePath()
    lay(silver ? silverOf(g, x, y, r) : gold(g, x, y, r))
  } else if (kind === 'bezant') {
    circle(x, y, r * 0.62)
    lay(gold(g, x, y, r * 0.62))
  } else {
    petals(5, r * 0.62, r * 0.5, hue)
    circle(x, y, r * 0.32)
    lay(gold(g, x, y, r * 0.4))
  }
}

/**
 * The whole border, `share` of it in gold and the rest only drawn. On a feast
 * it is the feast's plant (`border`, from hoursFeasts.js), the same stems
 * growing other leaves and other flowers.
 */
function drawIvy(canvas, w, h, share, border = PLAIN) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const g = canvas.getContext('2d')
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, w, h)
  const { stems, leaves, flowers, bezants } = ivy(w, h, SEED)

  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.strokeStyle = SILVER
  g.lineWidth = 0.8
  for (const line of stems) {
    g.beginPath()
    line.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
    g.stroke()
  }

  const shape = LEAVES[border.leaf] ?? LEAVES.ivy
  const silver = border.paint === 'silver'
  leaves.forEach((leaf, i) => {
    g.save()
    g.translate(leaf.x, leaf.y)
    g.rotate(leaf.angle)
    g.scale(leaf.size, leaf.size)
    if (leaf.rank < share) {
      g.fillStyle = border.paint === null ? gold(g, 0.5, 0, 0.7)
        : silver ? silverOf(g, 0.5, 0, 0.7)
          : border.paint === 'motley' ? border.hues[i % border.hues.length]
            : border.paint
      g.fill(shape)
      g.strokeStyle = border.edge ?? 'rgba(42, 29, 8, 0.9)'
      g.lineWidth = (border.edge ? 0.8 : 0.5) / leaf.size
      g.stroke(shape)
      // The vein, scratched into the gold — or, on a painted leaf, laid on
      // it in gold.
      if (border.leaf !== 'thorn') {
        g.beginPath()
        g.moveTo(0.12, 0)
        g.lineTo(0.8, 0)
        g.strokeStyle = border.paint === null || silver ? 'rgba(90, 60, 16, 0.55)' : 'rgba(226, 189, 98, 0.85)'
        g.stroke()
      }
    } else {
      g.strokeStyle = DRAWN
      g.lineWidth = 0.7 / leaf.size
      g.stroke(shape)
    }
    g.restore()
  })

  flowers.forEach((f, i) => {
    const hue = border.hues ? border.hues[i % border.hues.length] : HUES[f.hue]
    drawBloom(g, border.bloom, f.x, f.y, f.r * (border.bloom === 'flower' ? 1 : 1.15), hue, f.rank < share, silver)
  })

  for (const b of bezants) {
    // A border of stars has stars where it would have bezants too.
    if (border.bloom === 'star') {
      drawBloom(g, 'star', b.x, b.y, b.r * 1.6, null, b.rank < share, silver)
      continue
    }
    g.beginPath()
    g.arc(b.x, b.y, b.r, 0, Math.PI * 2)
    if (b.rank < share) {
      g.fillStyle = gold(g, b.x, b.y, b.r)
      g.fill()
      g.strokeStyle = 'rgba(70, 48, 12, 0.9)'
      g.lineWidth = 0.4
      g.stroke()
    } else {
      g.strokeStyle = DRAWN
      g.lineWidth = 0.7
      g.stroke()
    }
  }
}

export default function ScriptScene({ days }) {
  const minute = useMinute()
  const today = days?.[todayISO()]
  // Today's feast, if it is one — asked again as the minute turns, so a feast
  // comes in at midnight with the page open.
  const firstDay = useFirstDay()
  const birthdays = useBirthdays()
  const festival = useTodaysFestival(firstDay, birthdays)
  const feast = feastOf(festival)
  const feastId = feast?.id ?? null
  const yours = [festival, ...(festival?.also ?? [])].some((f) => f?.id === 'birthday' && f.self)
  // Rounded, so the border is drawn again a few dozen times a day rather than
  // every minute. The book's anniversary is gilded whole.
  const kept = Math.round(keptUp(today && !today.malformed ? today.blocks : [], minute) * 40) / 40
  const share = feast?.border.allGold ? 1 : kept

  // --- where the border goes: from the view switch to the controls ---------
  const [box, setBox] = useState(null)
  useLayoutEffect(() => {
    const measure = () => {
      const header = document.querySelector('.app > header')
      const after = document.querySelector('.viewswitch')
      const before = document.querySelector('.nav.today')
      const rule = document.querySelector('.goldrule')
      if (!header || !after || !before || !rule) return
      const top = header.getBoundingClientRect().top
      const left = after.getBoundingClientRect().right + 24
      const right = before.getBoundingClientRect().left - 24
      const foot = rule.getBoundingClientRect().top
      const next = { left, top: Math.max(0, top - 4), width: Math.max(0, right - left), height: Math.max(0, foot - top + 4) }
      setBox((was) => (was && Object.keys(next).every((k) => Math.abs(was[k] - next[k]) < 1) ? was : next))
    }
    measure()
    // The header can keep its size while what is in it moves — the title
    // narrowing once its face has loaded pushes everything after it along —
    // so the pieces either side of the border are watched too.
    const watch = new ResizeObserver(measure)
    for (const sel of ['.app > header', '.titleblock', '.viewswitch', '.nav.today']) {
      const el = document.querySelector(sel)
      if (el) watch.observe(el)
    }
    let alive = true
    document.fonts?.ready.then(() => { if (alive) measure() })
    window.addEventListener('resize', measure)
    return () => { alive = false; watch.disconnect(); window.removeEventListener('resize', measure) }
  }, [])

  const canvas = useRef(null)
  useEffect(() => {
    if (!box || !canvas.current || box.width < 80 || box.height < 30) return
    drawIvy(canvas.current, box.width, box.height, share, feast?.border)
  }, [box, share, feastId])

  // The page knows which feast it is, for the light (themes.css).
  useEffect(() => {
    const root = document.documentElement
    if (feastId) root.dataset.feast = feastId
    else delete root.dataset.feast
    return () => { delete root.dataset.feast }
  }, [feastId])

  // --- the bird on the hour sleeps through the night ------------------------
  const night = minute >= NIGHT_FROM || minute < NIGHT_UNTIL
  useEffect(() => {
    document.documentElement.dataset.vigil = night ? 'night' : 'day'
  }, [night])
  useEffect(() => () => { delete document.documentElement.dataset.vigil }, [])

  // --- gold where a stroke ends ---------------------------------------------
  const leaf = useRef(null)
  useEffect(() => {
    if (stillness()) return undefined
    let armedDown = false
    const onDown = (e) => {
      armedDown = Boolean(document.querySelector('.scroller.armed'))
        && e.target instanceof Element && Boolean(e.target.closest('.track'))
    }
    const onUp = (e) => {
      if (!armedDown) return
      armedDown = false
      const track = e.target instanceof Element ? e.target.closest('.track') : null
      if (!track || !leaf.current) return
      const r = track.getBoundingClientRect()
      const x = Math.max(r.left + 6, Math.min(r.right - 6, e.clientX))
      const y = Math.min(r.bottom - 6, Math.max(r.top + 6, e.clientY))
      const flakes = document.createElement('div')
      flakes.className = 'hours-flakes'
      Object.assign(flakes.style, { left: `${x}px`, top: `${y}px` })
      // On a feast day's bar the leaf that lifts is the feast's: snow-gold on
      // Christmas Eve, hearts on St Valentine's, petals at Easter.
      const onFeast = feastOf({ id: track.closest('[data-festival]')?.dataset.festival, nth: 1 })
      const sprites = onFeast ? spritesFor(!onFeast.sky || onFeast.sky === 'embers' ? 'stars' : onFeast.sky) : null
      for (let i = 0; i < 11; i++) {
        const flake = document.createElement('i')
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4
        const d = 18 + Math.random() * 34
        flake.style.setProperty('--dx', `${(Math.cos(a) * d).toFixed(1)}px`)
        flake.style.setProperty('--dy', `${(Math.sin(a) * d).toFixed(1)}px`)
        flake.style.setProperty('--fall', `${(14 + Math.random() * 22).toFixed(1)}px`)
        flake.style.setProperty('--turn', `${Math.round((Math.random() - 0.5) * 540)}deg`)
        flake.style.setProperty('--size', `${(3 + Math.random() * 4).toFixed(1)}px`)
        flake.style.animationDelay = `${Math.round(Math.random() * 90)}ms`
        if (sprites) {
          flake.className = 'feast'
          flake.style.backgroundImage = sprites[i % sprites.length]
        }
        flakes.appendChild(flake)
      }
      leaf.current.appendChild(flakes)
      setTimeout(() => flakes.remove(), 1900)
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointerup', onUp, true)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointerup', onUp, true)
    }
  }, [])

  // The snail keeps to the stem along the rule, a little past the middle.
  const snailAt = box ? Math.round(box.width * 0.71) : 0

  return (
    <>
      <div className="hours-candle" aria-hidden="true" />
      <div className="hours-frame" aria-hidden="true"><i /><i /><i /><i /></div>
      {box && box.width >= 80 && (
        <div
          className="hours-border"
          aria-hidden="true"
          style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
          title={share >= 1 ? 'Today kept to the minute' : undefined}
        >
          <canvas ref={canvas} style={{ width: box.width, height: box.height }} />
          <span className="hours-snail" style={{ left: snailAt - 15, top: box.height - 4 - 19 }}>
            <SnailHat feast={yours ? 'birthday' : feastId} />
          </span>
        </div>
      )}
      {feast && <div className="feast-wash" aria-hidden="true" />}
      {feast?.sky && !stillness() && (
        <FeastSky kind={feast.sky} tone={feast.border.paint === 'silver' ? 'silver' : 'gold'} />
      )}
      {festival && <HoursDay festivals={[festival, ...(festival.also ?? [])].filter((f) => feastOf(f))} />}
      <div ref={leaf} className="hours-leaf" aria-hidden="true" />
    </>
  )
}

/**
 * What the snail wears: a fool's cap with bells for Carnival, a sprig of
 * holly on its shell on Christmas Eve, and a chaplet of flowers on your own
 * birthday. Nothing on any other day.
 */
function SnailHat({ feast }) {
  if (feast === 'carnival') {
    return (
      <svg className="hours-snail-hat" viewBox="0 0 20 16" aria-hidden="true">
        <path d="M5 13C5 9 4 6 1.6 4c4 .4 6.4 3.6 7.4 9Z" fill="#27458f" stroke="#14121a" strokeWidth="0.7" />
        <path d="M15 13c0-4 1-7 3.4-9-4 .4-6.4 3.6-7.4 9Z" fill="#c8352a" stroke="#14121a" strokeWidth="0.7" />
        <rect x="4" y="12.4" width="12" height="2.6" rx="0.6" fill="#d6b05a" stroke="#14121a" strokeWidth="0.6" />
        <circle cx="1.6" cy="4" r="1.5" fill="#e2bd62" stroke="#14121a" strokeWidth="0.5" />
        <circle cx="18.4" cy="4" r="1.5" fill="#e2bd62" stroke="#14121a" strokeWidth="0.5" />
      </svg>
    )
  }
  if (feast === 'christmas-eve') {
    return (
      <svg className="hours-snail-hat" viewBox="0 0 20 16" aria-hidden="true">
        <path d="M10 13 3.4 10.6l2-1-1.6-1.8 2.2-.2-.4-2.2 2 1 .8-2 1.6 1.6Z" fill="#2d6a43" stroke="#14121a" strokeWidth="0.5" />
        <path d="M10 13l6.6-2.4-2-1 1.6-1.8-2.2-.2.4-2.2-2 1-.8-2-1.6 1.6Z" fill="#2d6a43" stroke="#14121a" strokeWidth="0.5" />
        <circle cx="9" cy="12.2" r="1.4" fill="#c8352a" stroke="#14121a" strokeWidth="0.4" />
        <circle cx="11.2" cy="12.4" r="1.4" fill="#c8352a" stroke="#14121a" strokeWidth="0.4" />
        <circle cx="10.1" cy="10.6" r="1.4" fill="#c8352a" stroke="#14121a" strokeWidth="0.4" />
      </svg>
    )
  }
  if (feast === 'birthday') {
    return (
      <svg className="hours-snail-hat" viewBox="0 0 20 16" aria-hidden="true">
        <ellipse cx="10" cy="12" rx="8" ry="2.6" fill="none" stroke="#2d6a43" strokeWidth="1.6" />
        {[[3, 11.6, '#c8352a'], [7.4, 13.8, '#f1ead8'], [12.6, 13.8, '#27458f'], [17, 11.6, '#c8352a'], [10, 9.6, '#f1ead8']].map(([x, y, c]) => (
          <g key={`${x}${y}`}>
            <circle cx={x} cy={y} r="1.7" fill={c} stroke="#14121a" strokeWidth="0.4" />
            <circle cx={x} cy={y} r="0.6" fill="#e2bd62" />
          </g>
        ))}
      </svg>
    )
  }
  return null
}
