import { useId } from 'react'
import { chronicle, chronicleWords, hourOf } from './manuscript.js'
import { feastOf } from './hoursFeasts.js'
import { useMinute } from '../useMinute.js'
import { useFirstDay } from '../useFirstDay.js'
import { useBirthdays } from '../useBirthdays.js'
import { useTodaysFestival } from '../feastPreview.js'

// The pieces of Black Hours that live inside the page rather than over it:
// the illuminated initials, the line of chronicle beside each day, and the
// canonical hour in the title. See manuscript.js for what decides them.

// The dark line round a painted initial, and the silver of one only drawn.
const INK = '#2a1d08'
const SILVER = '#8f8b99'

/** The ground of an initial, quartered like arms in up to four colours. */
function Ground({ colours }) {
  const [a, b, c, d] = colours
  const x = 5
  const w = 38
  if (colours.length <= 1) return <rect x={x} y={x} width={w} height={w} fill={a} />
  if (colours.length === 2) {
    return (
      <>
        <rect x={x} y={x} width={w / 2} height={w} fill={a} />
        <rect x={x + w / 2} y={x} width={w / 2} height={w} fill={b} />
      </>
    )
  }
  return (
    <>
      <rect x={x} y={x} width={w / 2} height={w / 2} fill={a} />
      <rect x={x + w / 2} y={x} width={w / 2} height={w / 2} fill={b} />
      <rect x={x} y={x + w / 2} width={w / 2} height={w / 2} fill={c} />
      <rect x={x + w / 2} y={x + w / 2} width={w / 2} height={w / 2} fill={d ?? a} />
    </>
  )
}

/**
 * An illuminated initial. 'sketch' is how a scribe left it for the
 * illuminator: drawn in silverpoint, a ruled frame and a small guide letter
 * in the corner saying which capital goes there. 'painted' sets it in a frame
 * of gold leaf with its ground in the day's colours and white vinework;
 * 'gilded' lays the letter and the vines in burnished gold as well, which
 * catches the light.
 */
export function Initial({ letter, level, colours = [], size = 34, gleam = false, className = '' }) {
  const id = useId().replace(/:/g, '')
  const gold = `g${id}`
  const diaper = `d${id}`
  const sketch = level === 'sketch'
  const gilded = level === 'gilded'
  const vine = gilded ? `url(#${gold})` : '#fffaf0'

  const picture = (
    <svg
      className={`initial ${level}${gleam ? '' : ` ${className}`}`}
      viewBox="0 0 48 48"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8a5a12" />
          <stop offset="0.32" stopColor="#f3d98a" />
          <stop offset="0.52" stopColor="#c28f2e" />
          <stop offset="0.7" stopColor="#fff0b3" />
          <stop offset="1" stopColor="#9c6a1c" />
        </linearGradient>
        <pattern id={diaper} width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M3 0.8 5.2 3 3 5.2 0.8 3Z" fill="none" stroke="#fff" strokeOpacity="0.18" strokeWidth="0.6" />
        </pattern>
      </defs>

      {sketch ? (
        <>
          <rect x="3.5" y="3.5" width="41" height="41" fill="none" stroke={SILVER} strokeOpacity="0.7" strokeWidth="0.8" strokeDasharray="2.2 1.6" />
          <text x="24" y="35" textAnchor="middle" className="initial-letter" fill="none" stroke={SILVER} strokeWidth="0.6">{letter}</text>
          <text x="7" y="13" className="initial-guide" fill={SILVER}>{letter.toLowerCase()}</text>
        </>
      ) : (
        <>
          <rect x="2" y="2" width="44" height="44" fill={`url(#${gold})`} />
          <rect x="2" y="2" width="44" height="44" fill="none" stroke={INK} strokeWidth="0.8" />
          <Ground colours={colours} />
          <rect x="5" y="5" width="38" height="38" fill={`url(#${diaper})`} />
          <rect x="7" y="7" width="34" height="34" fill="none" stroke={vine} strokeOpacity="0.55" strokeWidth="0.6" />
          {/* Vinework curling out of two corners, ending in leaves. */}
          <g fill="none" stroke={vine} strokeWidth="1.1" strokeLinecap="round">
            <path d="M8.5 39.5c0-6 5-8.5 8-5.5s-.6 6.4-3.3 4.3" />
            <path d="M39.5 8.5c0 6-5 8.5-8 5.5s.6-6.4 3.3-4.3" />
            <path d="M8.5 30c2.5-.4 3.6-2 3.4-4.2M39.5 18c-2.5.4-3.6 2-3.4 4.2" />
          </g>
          <g fill={vine}>
            <circle cx="12" cy="25.4" r="1.3" />
            <circle cx="36" cy="22.6" r="1.3" />
            <path d="M13.5 38.8c1.8-.6 2.6.3 2.2 1.8-1.7.5-2.5-.3-2.2-1.8Z" />
            <path d="M34.5 9.2c-1.8.6-2.6-.3-2.2-1.8 1.7-.5 2.5.3 2.2 1.8Z" />
          </g>
          <text
            x="24"
            y="35"
            textAnchor="middle"
            className="initial-letter"
            fill={gilded ? `url(#${gold})` : '#fffaf0'}
            stroke={INK}
            strokeWidth="0.9"
            paintOrder="stroke"
          >
            {letter}
          </text>
        </>
      )}
    </svg>
  )
  if (!gleam) return picture
  // Burnished gold catching the light: a band of it sliding across, laid
  // over the picture and moved as a whole, so nothing is redrawn to do it.
  return (
    <span className={`initial-wrap ${level} ${className}`}>
      {picture}
      <i className="initial-shine" aria-hidden="true" />
    </span>
  )
}

/** The line of chronicle beside a day: what it was given to, in red for each tag. */
function Words({ parts, colourOf }) {
  return (
    <span className="chronicle">
      {parts.map((p, i) => (p.tag
        ? <em key={i} style={{ '--rubric': colourOf(p.tag) }}>{p.text}</em>
        : <span key={i}>{p.text}</span>))}
    </span>
  )
}

function TodayChronicle({ blocks, nameOf, colourOf }) {
  const minute = useMinute()
  return <Words parts={chronicleWords(chronicle(blocks, { now: minute }), nameOf)} colourOf={colourOf} />
}

export function Chronicle({ blocks, isToday, nameOf, colourOf }) {
  if (!blocks || blocks.length === 0) return null
  if (isToday) return <TodayChronicle blocks={blocks} nameOf={nameOf} colourOf={colourOf} />
  return <Words parts={chronicleWords(chronicle(blocks), nameOf)} colourOf={colourOf} />
}

/**
 * "· the hour of Terce", for beside the count of days — and on a feast, what
 * the feast is, in its own words: "· the tears of St Lawrence are falling".
 */
export function HourOf() {
  const minute = useMinute()
  const firstDay = useFirstDay()
  const birthdays = useBirthdays()
  const festival = useTodaysFestival(firstDay, birthdays)
  const lines = [festival, ...(festival?.also ?? [])].map(feastOf).filter(Boolean).map((f) => f.line)
  return (
    <span className="script-hour">
      {' · the hour of '}<em>{hourOf(minute)}</em>
      {lines.map((line) => <span key={line} className="script-feast"> · {line}</span>)}
    </span>
  )
}
