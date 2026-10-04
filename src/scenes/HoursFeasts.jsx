import { useId, useMemo } from 'react'
import { feastOf } from './hoursFeasts.js'

// The feasts of Black Hours, drawn. Which they are and what each is made of
// is hoursFeasts.js; here are the pictures.
//
// In the list, every feast day is a red-letter day, all year round: its
// initial laid in gold on the feast's own colours, its calendar name in red
// beside the date with a little painting in the margin — the star over
// Bethlehem, the four candles of Advent, a skull for the Office of the Dead,
// the red egg of Easter, St Nicholas's three gold balls, a heart with its
// arrow, a fool's cap, the hourglass of the year's last night, Janus looking
// both ways on the first, the falling tears of St Lawrence, the Twins, a
// moon with a face, a sun with one, a chaplet of flowers for a birthday and a
// wax seal for the book's own anniversary — and the ends of its bar
// sprigged with the feast's plant: holly, laurel, thorn, lilies, roses.
//
// On the day itself the border at the head of the page grows that plant
// (ScriptScene.jsx), and something crosses the page: gold falling like snow,
// embers going up, petals, hearts, coins, motley, bats, the slow streak of a
// falling star, or stars pricked in the vellum.

const INK = '#2a1d08'
const LAPIS = '#27458f'
const VERMILION = '#c8352a'
const MALACHITE = '#2d6a43'
const VELLUM = '#f1ead8'
const SABLE = '#141217'

/**
 * The leaves the borders grow, each as one outline at unit size with its
 * stalk at the origin and its point along +x — so the same shape serves a
 * painting here and the canvas of the border (as a Path2D).
 */
export const LEAF = {
  ivy: 'M0 0Q-0.05 -0.5 0.32 -0.58Q0.62 -0.64 0.6 -0.3Q0.86 -0.24 1.1 0Q0.86 0.24 0.6 0.3Q0.62 0.64 0.32 0.58Q-0.05 0.5 0 0Z',
  holly: 'M0 0L0.12 -0.2L0.24 -0.13L0.34 -0.36L0.47 -0.22L0.62 -0.38L0.72 -0.2L0.88 -0.25L1.15 0L0.88 0.25L0.72 0.2L0.62 0.38L0.47 0.22L0.34 0.36L0.24 0.13L0.12 0.2Z',
  laurel: 'M0 0Q0.42 -0.34 1.15 0Q0.42 0.34 0 0Z',
  thorn: 'M0 -0.15L0 0.15Q0.52 0.12 1.05 -0.38Q0.56 -0.04 0 -0.15Z',
}

/** The points of a star of `n` rays round cx, cy, out to R and in to r. */
function starPoints(cx, cy, R, r, n, turn = -Math.PI / 2) {
  const pts = []
  for (let i = 0; i < n * 2; i++) {
    const a = turn + (i * Math.PI) / n
    const d = i % 2 ? r : R
    pts.push(`${(cx + Math.cos(a) * d).toFixed(2)},${(cy + Math.sin(a) * d).toFixed(2)}`)
  }
  return pts.join(' ')
}

/** Burnished gold and polished silver, lit from the upper left. */
function Metals({ id }) {
  return (
    <>
      <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff3c0" />
        <stop offset="0.35" stopColor="#e2bd62" />
        <stop offset="0.7" stopColor="#b08a3e" />
        <stop offset="1" stopColor="#7a5a1e" />
      </linearGradient>
      <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.45" stopColor="#c9c6d4" />
        <stop offset="1" stopColor="#6f6a7d" />
      </linearGradient>
    </>
  )
}

/** A roundel in a gold ring, the ground most of the paintings sit on. */
const Roundel = ({ id, fill }) => (
  <circle cx="14" cy="14" r="12.4" fill={fill} stroke={`url(#${id}g)`} strokeWidth="1.5" />
)

/** The little painting in the margin beside a feast's date. */
export function FeastMiniature({ id: feast, nth = 1, lit = false, size = 26 }) {
  const id = `m${useId().replace(/:/g, '')}`
  const gold = `url(#${id}g)`
  const silver = `url(#${id}s)`
  const line = { stroke: INK, strokeWidth: 0.7, strokeLinejoin: 'round' }
  let art = null

  if (feast === 'christmas-eve') {
    // The star over Bethlehem, its light let down to the stable.
    art = (
      <>
        <Roundel id={id} fill={LAPIS} />
        <path d="M12.9 15.2 14 25.6 15.1 15.2Z" fill={gold} opacity="0.85" />
        <polygon points={starPoints(14, 12, 7.2, 2.6, 8)} fill={gold} {...line} />
        <g fill="#fff" opacity="0.8">
          <circle cx="6.4" cy="9" r="0.7" /><circle cx="21.6" cy="7.4" r="0.6" />
          <circle cx="7.6" cy="19.4" r="0.6" /><circle cx="21" cy="19.2" r="0.7" />
        </g>
      </>
    )
  } else if (feast === 'advent') {
    // Four candles, as many lit as Sundays have come; the third is rose.
    art = (
      <>
        {[5.6, 11.2, 16.8, 22.4].map((x, i) => (
          <g key={x}>
            <rect x={x - 1.8} y="11.6" width="3.6" height="11.4" fill={i === 2 ? '#d98ba0' : i < nth ? VELLUM : '#b9b2a2'} {...line} />
            {i < nth ? (
              <path
                className={lit ? 'feast-flame' : ''}
                d={`M${x} 4.6C${x + 2} 7.4 ${x + 1.6} 10 ${x} 10.4C${x - 1.6} 10 ${x - 2} 7.4 ${x} 4.6Z`}
                fill={gold}
                stroke="#8a3a12"
                strokeWidth="0.5"
              />
            ) : (
              <path d={`M${x} 11.6V9.6`} stroke={INK} strokeWidth="0.8" strokeLinecap="round" />
            )}
          </g>
        ))}
        <rect x="2.4" y="23" width="23.2" height="2.6" rx="0.6" fill={gold} {...line} />
      </>
    )
  } else if (feast === 'halloween') {
    // A skull, for the Office of the Dead every book of hours carried.
    art = (
      <>
        <Roundel id={id} fill={VERMILION} />
        <path d="M14 5.6c-4.6 0-7.4 3.2-7.4 7.2 0 2.5 1.2 4.1 2.6 5v2.6h9.6v-2.6c1.4-.9 2.6-2.5 2.6-5 0-4-2.8-7.2-7.4-7.2Z" fill={VELLUM} {...line} />
        <ellipse cx="11.2" cy="12.6" rx="1.9" ry="2.1" fill={lit ? gold : SABLE} />
        <ellipse cx="16.8" cy="12.6" rx="1.9" ry="2.1" fill={lit ? gold : SABLE} />
        <path d="M14 14.8 13 17h2Z" fill={SABLE} />
        <path d="M11.6 20.4h4.8M12.8 19.4v1.9M14 19.4v1.9M15.2 19.4v1.9" stroke={INK} strokeWidth="0.6" />
      </>
    )
  } else if (feast === 'easter') {
    // The red egg, banded and crossed in gold.
    art = (
      <>
        <path d="M14 3.4C10.2 3.4 7 10 7 15c0 4.6 3.1 8 7 8s7-3.4 7-8c0-5-3.2-11.6-7-11.6Z" fill={VERMILION} {...line} />
        <path d="M7.5 14.6c4.3 1.5 8.7 1.5 13 0" fill="none" stroke={gold} strokeWidth="1.7" />
        <g fill={gold}><circle cx="9.6" cy="18.6" r="0.8" /><circle cx="14" cy="19.6" r="0.8" /><circle cx="18.4" cy="18.6" r="0.8" /></g>
        <path d="M14 6.6v5M11.7 8.9h4.6" stroke={gold} strokeWidth="1.2" strokeLinecap="round" />
        <path d="M10.4 10c.5-1.9 1.5-3.2 2.5-3.9" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="0.8" strokeLinecap="round" />
      </>
    )
  } else if (feast === 'st-nicholas') {
    // His three gold balls: the three purses left at a poor man's window.
    art = (
      <>
        <Roundel id={id} fill={VERMILION} />
        {[[14, 8.8], [9.4, 17], [18.6, 17]].map(([x, y]) => (
          <g key={x}>
            <circle cx={x} cy={y} r="3.7" fill={gold} {...line} />
            <circle cx={x - 1.2} cy={y - 1.3} r="0.8" fill="#fff" opacity="0.7" />
          </g>
        ))}
      </>
    )
  } else if (feast === 'valentines') {
    // A heart, and the arrow through it.
    art = (
      <>
        <path d="M3.2 22.4 24.6 6.2" stroke={gold} strokeWidth="1.2" strokeLinecap="round" />
        <path d="M14 23.6C8 19 4.6 15.4 4.6 11.4c0-2.8 2.1-4.9 4.7-4.9 2 0 3.5 1.1 4.7 2.9 1.2-1.8 2.7-2.9 4.7-2.9 2.6 0 4.7 2.1 4.7 4.9 0 4-3.4 7.6-9.4 12.2Z" fill={VERMILION} {...line} />
        <path d="M8 9.6c.6-1 1.4-1.4 2.2-1.4" fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="0.8" strokeLinecap="round" />
        <path d="M17.2 13.4 24.6 6.2M24.6 6.2l-3.8.4M24.6 6.2l-.8 3.6" stroke={gold} strokeWidth="1.2" strokeLinecap="round" fill="none" />
        <path d="M3.2 22.4l1.4-3M3.2 22.4l3-1.2M4.6 21.4l1.4-3M4.6 21.4l3-1.2" stroke={gold} strokeWidth="0.8" strokeLinecap="round" />
      </>
    )
  } else if (feast === 'carnival') {
    // The fool's cap, in motley, with its bells.
    art = (
      <>
        <path d="M6.2 20.4C6.2 13.4 4.8 8.6 2.8 5.2c6 1.4 9.8 6.6 11 15.2Z" fill={LAPIS} {...line} />
        <path d="M21.8 20.4c0-7 1.4-11.8 3.4-15.2-6 1.4-9.8 6.6-11 15.2Z" fill={VERMILION} {...line} />
        <path d="M11.6 20.4C11.6 12.8 12.6 7.6 14 3.6c1.4 4 2.4 9.2 2.4 16.8Z" fill={MALACHITE} {...line} />
        <rect x="5" y="20" width="18" height="4" rx="0.8" fill={gold} {...line} />
        <g fill={gold} {...line}>
          <circle cx="2.8" cy="5.2" r="2" /><circle cx="25.2" cy="5.2" r="2" /><circle cx="14" cy="3.4" r="2" />
        </g>
        <g fill={VERMILION}><path d="M9 22 10 21l1 1-1 1Z" /><path d="M13 22l1-1 1 1-1 1Z" /><path d="M17 22l1-1 1 1-1 1Z" /></g>
      </>
    )
  } else if (feast === 'new-years-eve') {
    // The hourglass, the year's sand all but run through.
    art = (
      <>
        <path d="M7 5.6v16.8M21 5.6v16.8" stroke={gold} strokeWidth="1.1" />
        <path d="M8.6 6c0 5 4.4 6.6 4.4 8s-4.4 3-4.4 8h10.8c0-5-4.4-6.6-4.4-8s4.4-3 4.4-8Z" fill="rgba(210, 220, 255, 0.16)" stroke={silver} strokeWidth="0.8" />
        <path d="M11.4 10c.8 1.2 2 2.2 2.6 2.9.6-.7 1.8-1.7 2.6-2.9Z" fill={gold} />
        <path d="M14 13v4" stroke={gold} strokeWidth="0.6" />
        <path d="M9.4 21.6c1.2-3.2 3.4-4 4.6-4.2 1.2.2 3.4 1 4.6 4.2Z" fill={gold} />
        <rect x="5.6" y="3.4" width="16.8" height="2.6" rx="0.6" fill={gold} {...line} />
        <rect x="5.6" y="22" width="16.8" height="2.6" rx="0.6" fill={gold} {...line} />
      </>
    )
  } else if (feast === 'new-year') {
    // Janus, crowned, looking back at the old year and on to the new: the
    // painting every calendar opened January with.
    art = (
      <>
        <Roundel id={id} fill={LAPIS} />
        <path d="M14 7.2c3.4 0 5.3 2.1 5.5 4.6l2 2.4-1.8.6c0 2.4-1.2 4.2-3.2 4.8v2.6h-5v-2.6c-2-.6-3.2-2.4-3.2-4.8l-1.8-.6 2-2.4c.2-2.5 2.1-4.6 5.5-4.6Z" fill={VELLUM} {...line} />
        <path d="M14 7.4v12" stroke={INK} strokeOpacity="0.25" strokeWidth="0.6" />
        <circle cx="17.6" cy="12" r="0.75" fill={INK} /><circle cx="10.4" cy="12" r="0.75" fill={INK} />
        <path d="M18.4 16.2h1.1M8.5 16.2h1.1" stroke={INK} strokeWidth="0.6" strokeLinecap="round" />
        <path d="M9.4 8.4 10.2 4.8l2 2.1L14 4l1.8 2.9 2-2.1.8 3.6Z" fill={gold} {...line} />
      </>
    )
  } else if (feast === 'perseids') {
    // The tears of St Lawrence: stars falling, their light trailing.
    art = (
      <>
        {[[19, 10.4, 8.6, 4.4], [23, 19.4, 14.6, 14.4], [10.4, 21.6, 3.4, 17.6]].map(([x, y, tx, ty]) => (
          <g key={x}>
            <path d={`M${tx} ${ty}L${x} ${y}`} stroke={gold} strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
            <polygon points={starPoints(x, y, 2.9, 1.15, 5)} fill={gold} {...line} strokeWidth="0.5" />
          </g>
        ))}
      </>
    )
  } else if (feast === 'geminids') {
    // The Twins, a gold star and a silver, under one arch.
    art = (
      <>
        <path d="M9.4 7.6Q14 3.2 18.6 7.6" fill="none" stroke={gold} strokeWidth="1" />
        <polygon points={starPoints(9.4, 14.2, 5.2, 2, 5)} fill={gold} {...line} strokeWidth="0.55" />
        <polygon points={starPoints(18.6, 14.2, 5.2, 2, 5)} fill={silver} {...line} strokeWidth="0.55" />
        <g fill="#fff" opacity="0.7"><circle cx="14" cy="21.6" r="0.7" /><circle cx="5" cy="22.4" r="0.5" /><circle cx="23" cy="22.4" r="0.5" /></g>
      </>
    )
  } else if (feast === 'longest-night') {
    // The moon, with a face, on the darkest night.
    art = (
      <>
        <Roundel id={id} fill={SABLE} />
        <path d="M16.6 6.4A8 8 0 1 0 16.6 21.6A6.4 6.4 0 1 1 16.6 6.4Z" fill={silver} {...line} />
        <circle cx="10" cy="12.4" r="0.75" fill={INK} />
        <path d="M8.8 16.4q1.2.9 2.5.2" fill="none" stroke={INK} strokeWidth="0.6" strokeLinecap="round" />
        <g fill="#fff"><circle cx="20.4" cy="9.4" r="0.7" /><circle cx="22.4" cy="15" r="0.55" /><circle cx="19.4" cy="19.8" r="0.6" /></g>
      </>
    )
  } else if (feast === 'midsummer') {
    // The sun, with a face, on the longest day.
    art = (
      <>
        <polygon points={starPoints(14, 14, 13, 8.6, 12)} fill={gold} {...line} strokeWidth="0.55" />
        <circle cx="14" cy="14" r="7.6" fill={gold} {...line} />
        <circle cx="11.6" cy="12.8" r="0.85" fill={INK} /><circle cx="16.4" cy="12.8" r="0.85" fill={INK} />
        <circle cx="10.6" cy="15.6" r="1.1" fill={VERMILION} opacity="0.45" /><circle cx="17.4" cy="15.6" r="1.1" fill={VERMILION} opacity="0.45" />
        <path d="M11.6 16.2q2.4 1.9 4.8 0" fill="none" stroke={INK} strokeWidth="0.7" strokeLinecap="round" />
      </>
    )
  } else if (feast === 'birthday') {
    // A chaplet: a crown of leaves with flowers set in it.
    art = (
      <>
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2
          const x = 14 + Math.cos(a) * 8.6
          const y = 14 + Math.sin(a) * 8.6
          return (
            <path key={i} d={LEAF.laurel} fill={MALACHITE} stroke={INK} strokeWidth="0.12"
              transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${((a + Math.PI / 2) * 180) / Math.PI + 18}) scale(5.4)`} />
          )
        })}
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2
          return <MiniFlower key={i} x={14 + Math.cos(a) * 8.6} y={14 + Math.sin(a) * 8.6} r={2.6} hue={[VERMILION, LAPIS, VELLUM][i % 3]} gold={gold} />
        })}
        {lit && <circle cx="14" cy="14" r="2.2" fill={gold} />}
      </>
    )
  } else if (feast === 'anniversary') {
    // The book's seal, in red wax, the years pressed into it.
    const edge = Array.from({ length: 28 }, (_, i) => {
      const a = (i / 28) * Math.PI * 2
      const r = i % 2 ? 11.4 : 12.4
      return `${(14 + Math.cos(a) * r).toFixed(2)},${(14 + Math.sin(a) * r).toFixed(2)}`
    }).join(' ')
    art = (
      <>
        <polygon points={edge} fill="#9e2a22" {...line} />
        <circle cx="14" cy="14" r="8" fill="none" stroke="#5e130e" strokeWidth="0.9" />
        <circle cx="14" cy="14" r="8" fill="none" stroke="#fff" strokeOpacity="0.12" strokeWidth="0.5" transform="translate(-0.5 -0.5)" />
        <text x="14" y="18" textAnchor="middle" className="feast-seal-years" fill={gold}>{nth}</text>
      </>
    )
  }
  if (!art) return null

  return (
    <svg className={`feast-mini${lit ? ' lit' : ''}`} viewBox="0 0 28 28" width={size} height={size} aria-hidden="true">
      <defs><Metals id={id} /></defs>
      {art}
    </svg>
  )
}

function MiniFlower({ x, y, r, hue, gold }) {
  return (
    <g>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2
        return <circle key={i} cx={x + Math.cos(a) * r * 0.6} cy={y + Math.sin(a) * r * 0.6} r={r * 0.48} fill={hue} stroke={INK} strokeWidth="0.35" />
      })}
      <circle cx={x} cy={y} r={r * 0.32} fill={gold} />
    </g>
  )
}

/** One leaf of a border, painted as the feast paints it. */
function Leaf({ kind, x, y, angle, size, paint, edge, hue, ids }) {
  const fill = paint === null ? `url(#${ids}g)` : paint === 'silver' ? `url(#${ids}s)` : paint === 'motley' ? hue : paint
  const vein = paint === null || paint === 'silver' ? 'rgba(70, 48, 12, 0.6)' : `url(#${ids}g)`
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${size})`}>
      <path d={LEAF[kind]} fill={fill} stroke={edge ?? INK} strokeWidth={(edge ? 0.9 : 0.7) / size} strokeLinejoin="round" />
      {kind !== 'thorn' && <path d="M0.14 0H0.86" stroke={vein} strokeWidth={0.55 / size} />}
    </g>
  )
}

/** What flowers on a border: a flower, berries, a rose, a lily, a star or a bezant. */
function Bloom({ kind, x, y, r, hue, ids, silver = false }) {
  const gold = `url(#${ids}g)`
  const ink = { stroke: INK, strokeWidth: 0.45 }
  if (kind === 'berry') {
    return (
      <g>
        {[[0, -0.5], [-0.5, 0.35], [0.5, 0.35]].map(([dx, dy]) => (
          <g key={`${dx}${dy}`}>
            <circle cx={x + dx * r} cy={y + dy * r} r={r * 0.5} fill={hue} {...ink} />
            <circle cx={x + dx * r - r * 0.16} cy={y + dy * r - r * 0.16} r={r * 0.13} fill="#fff" opacity="0.7" />
          </g>
        ))}
      </g>
    )
  }
  if (kind === 'rose') {
    return (
      <g>
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2 + Math.PI / 5
          return <path key={`s${i}`} d={`M${x} ${y}L${x + Math.cos(a - 0.2) * r * 1.05} ${y + Math.sin(a - 0.2) * r * 1.05}L${x + Math.cos(a + 0.2) * r * 1.05} ${y + Math.sin(a + 0.2) * r * 1.05}Z`} fill={MALACHITE} />
        })}
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2
          return <circle key={i} cx={x + Math.cos(a) * r * 0.48} cy={y + Math.sin(a) * r * 0.48} r={r * 0.52} fill={hue} {...ink} />
        })}
        <circle cx={x} cy={y} r={r * 0.42} fill="#fff" opacity="0.28" />
        <circle cx={x} cy={y} r={r * 0.22} fill={gold} />
      </g>
    )
  }
  if (kind === 'lily') {
    return (
      <g>
        {[-90, -30, -150].map((deg) => (
          <path key={deg} d={LEAF.laurel} fill={hue} stroke={INK} strokeWidth={0.45 / (r * 1.8)}
            transform={`translate(${x} ${y + r * 0.7}) rotate(${deg}) scale(${r * 1.8})`} />
        ))}
        <path d={`M${x} ${y + r * 0.7}v${-r * 1.1}M${x} ${y + r * 0.7}l${-r * 0.5} ${-r * 0.9}M${x} ${y + r * 0.7}l${r * 0.5} ${-r * 0.9}`} stroke={gold} strokeWidth={r * 0.14} />
        <circle cx={x} cy={y + r * 0.75} r={r * 0.3} fill={gold} />
      </g>
    )
  }
  if (kind === 'star') return <polygon points={starPoints(x, y, r, r * 0.45, 6)} fill={silver ? `url(#${ids}s)` : gold} {...ink} />
  if (kind === 'bezant') {
    return (
      <g>
        <circle cx={x} cy={y} r={r * 0.62} fill={gold} {...ink} />
        <circle cx={x - r * 0.2} cy={y - r * 0.22} r={r * 0.16} fill="#fff" opacity="0.6" />
      </g>
    )
  }
  return <MiniFlower x={x} y={y} r={r} hue={hue} gold={gold} />
}

// Where the leaves and flowers sit on a sprig: a stem out along the top of
// the bar from its corner, curling at its end, and a shorter one down the
// side. [x, y, degrees, size] and [x, y, r].
const SPRIG_LEAVES = [[9, 3.4, 58, 7], [17.4, 6.4, -46, 7.6], [27, 7.4, 62, 7], [36.6, 4.4, -54, 6.6], [45.6, 6.2, 56, 6], [4.6, 11.6, 24, 6], [3.6, 19.4, 150, 5.4]]
const SPRIG_BLOOMS = [[47.2, 16.2, 4], [22.8, 15.6, 3.6], [5.4, 25.6, 3]]

/**
 * The feast's plant, sprigged over the two top corners of its bar — the
 * right one the left one turned over. Drawn small, at the very ends of the
 * day, where it costs least to look past.
 */
export function FeastSprigs({ id: feastId }) {
  const ids = `s${useId().replace(/:/g, '')}`
  const feast = feastOf({ id: feastId, nth: 1 })
  if (!feast) return null
  const { leaf, paint, edge, bloom, hues } = feast.border
  const sprig = (
    <>
      <path d="M-2 3.2C10 2.4 18 8.8 26 7.8s14-6 22-1c6 3.6 8 9.4 4 12.4-3 2.4-6.4 0-5-2.6M7 3c-2.6 6-4 12-1.4 20.4M21.8 7.6c.6 2.8.8 5 1 7.8" fill="none" stroke={`url(#${ids}g)`} strokeWidth="0.9" strokeLinecap="round" />
      {SPRIG_LEAVES.map(([x, y, deg, s], i) => (
        <Leaf key={i} kind={leaf} x={x} y={y} angle={deg} size={s} paint={paint} edge={edge} hue={hues[i % hues.length]} ids={ids} />
      ))}
      {SPRIG_BLOOMS.map(([x, y, r], i) => (
        <Bloom key={i} kind={bloom} x={x} y={y} r={r} hue={hues[i % hues.length]} ids={ids} silver={paint === 'silver'} />
      ))}
    </>
  )
  return (
    <>
      <svg className="feast-sprig" viewBox="0 -4 64 34" aria-hidden="true">
        <defs><Metals id={ids} /></defs>
        {sprig}
      </svg>
      <svg className="feast-sprig right" viewBox="0 -4 64 34" aria-hidden="true">
        <defs><Metals id={`${ids}r`} /></defs>
        <g transform="translate(64 0) scale(-1 1)">{sprig}</g>
      </svg>
    </>
  )
}

/** The date of a feast, its paintings, and its names in the calendar's red. */
export function FeastHeading({ festival, date, lit }) {
  const all = [festival, ...(festival.also ?? [])]
  const feasts = all.map((f) => ({ f, feast: feastOf(f) })).filter((x) => x.feast)
  return (
    <>
      <span className="feastdate">{date}</span>
      {feasts.map(({ f }) => <FeastMiniature key={f.key ?? f.id} id={f.id} nth={f.nth} lit={lit} />)}
      <span className="feastname">
        {feasts.map(({ f, feast }, i) => (
          <span key={f.key ?? f.id} className="feastone">
            {i > 0 && <span className="feastsep"> · </span>}
            <span className="feastlatin">{feast.latin}</span>
            {' '}
            <span className="feastplain">{f.age != null ? `${f.name} · ${f.age}` : f.name}</span>
          </span>
        ))}
      </span>
    </>
  )
}

// --- what crosses the page on the day itself --------------------------------

const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
const NS = "xmlns='http://www.w3.org/2000/svg'"
const GOLD_GRAD = "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#fff3c0'/><stop offset='.4' stop-color='#e2bd62'/><stop offset='1' stop-color='#8a6420'/></linearGradient></defs>"

/** The little pictures each kind of sky is made of, as images for CSS. */
export function spritesFor(kind, tone = 'gold') {
  const metal = tone === 'silver' ? "fill='#dcdbe6'" : "fill='url(#g)'"
  switch (kind) {
    case 'snow':
      return [
        `<svg ${NS} viewBox='-10 -10 20 20'>${GOLD_GRAD}<polygon points='${starPoints(0, 0, 9, 3.4, 6)}' fill='url(#g)' stroke='#4a3510' stroke-width='.6'/></svg>`,
        `<svg ${NS} viewBox='-10 -10 20 20'><polygon points='${starPoints(0, 0, 9, 3.4, 6)}' fill='#e6e4ee' stroke='#55516a' stroke-width='.6'/></svg>`,
      ].map(svgUrl)
    case 'petals':
      return ['#f6f0e2', '#f2c9d3', '#fbf8f0'].map((c) => svgUrl(
        `<svg ${NS} viewBox='0 0 20 20'><path d='M10 1C15 5 15 13 10 19 5 13 5 5 10 1Z' fill='${c}' stroke='#7a6a58' stroke-width='.5'/></svg>`))
    case 'confetti':
      return [LAPIS, VERMILION, MALACHITE, '#d6b05a'].map((c) => svgUrl(
        `<svg ${NS} viewBox='0 0 20 20'><rect x='3' y='6' width='14' height='8' fill='${c}' stroke='#1a1206' stroke-width='.6'/></svg>`))
    case 'coins':
      return [svgUrl(`<svg ${NS} viewBox='0 0 20 20'>${GOLD_GRAD}<circle cx='10' cy='10' r='8.5' fill='url(#g)' stroke='#4a3510' stroke-width='.8'/><circle cx='10' cy='10' r='5.6' fill='none' stroke='#7a5a1e' stroke-width='.6'/></svg>`)]
    case 'embers':
      return ['255, 214, 130', '255, 160, 80', '255, 236, 190'].map((c) => svgUrl(
        `<svg ${NS} viewBox='0 0 20 20'><radialGradient id='e'><stop offset='0' stop-color='rgb(${c})'/><stop offset='.35' stop-color='rgba(${c}, .7)'/><stop offset='1' stop-color='rgba(${c}, 0)'/></radialGradient><circle cx='10' cy='10' r='10' fill='url(#e)'/></svg>`))
    case 'hearts':
      return [VERMILION, '#c9718a'].map((c) => svgUrl(
        `<svg ${NS} viewBox='0 0 28 28'>${GOLD_GRAD}<path d='M14 24C8 19.4 4.6 15.6 4.6 11.4c0-2.8 2.1-4.9 4.7-4.9 2 0 3.5 1.1 4.7 2.9 1.2-1.8 2.7-2.9 4.7-2.9 2.6 0 4.7 2.1 4.7 4.9 0 4.2-3.4 8-9.4 12.6Z' fill='${c}' stroke='url(#g)' stroke-width='1.3'/></svg>`))
    case 'tears':
      return [svgUrl(`<svg ${NS} viewBox='0 0 100 6' preserveAspectRatio='none'><linearGradient id='t'><stop offset='0' stop-color='${tone === 'silver' ? '#dfe6ff' : '#ffe3a0'}' stop-opacity='0'/><stop offset='.85' stop-color='${tone === 'silver' ? '#eef2ff' : '#ffe9b4'}' stop-opacity='.8'/><stop offset='1' stop-color='#fff'/></linearGradient><path d='M0 3 L96 1.2 A1.8 1.8 0 0 1 96 4.8Z' fill='url(#t)'/></svg>`)]
    case 'bats':
      return [svgUrl(`<svg ${NS} viewBox='0 0 40 20'>${GOLD_GRAD}<path d='M20 8c1-2 2.4-2 3-1l.6-1.6.6 1.8C27 4 32 3 39 5c-3 1-4.4 3-4.6 5.6-2-1.4-4.4-1.2-5.6.8-1.4-1.6-3.4-1.4-4.6.2-1.4.9-3 1.6-4.2 3.2-1.2-1.6-2.8-2.3-4.2-3.2-1.2-1.6-3.2-1.8-4.6-.2-1.2-2-3.6-2.2-5.6-.8C5.4 8 4 6 1 5c7-2 12-1 14.2 2.2l.6-1.8.6 1.6c.6-1 2-1 3 1Z' fill='#0c0a0e' stroke='url(#g)' stroke-width='.7' stroke-linejoin='round'/></svg>`)]
    case 'stars':
    default:
      return [
        `<svg ${NS} viewBox='-10 -10 20 20'>${GOLD_GRAD}<path d='M0-9 1.6-1.6 9 0 1.6 1.6 0 9-1.6 1.6-9 0-1.6-1.6Z' ${metal}/></svg>`,
        `<svg ${NS} viewBox='-10 -10 20 20'><path d='M0-9 1.6-1.6 9 0 1.6 1.6 0 9-1.6 1.6-9 0-1.6-1.6Z' fill='#e8e6f0'/></svg>`,
      ].map(svgUrl)
  }
}

// How each kind of sky moves, how many there are, and how big and slow.
const SKIES = {
  snow: { motion: 'fall', count: 24, size: [6, 11], dur: [16, 28] },
  petals: { motion: 'fall', count: 18, size: [7, 12], dur: [13, 22] },
  confetti: { motion: 'fall', count: 26, size: [6, 10], dur: [9, 15] },
  coins: { motion: 'fall', count: 12, size: [8, 12], dur: [10, 17] },
  embers: { motion: 'rise', count: 22, size: [4, 9], dur: [10, 18] },
  hearts: { motion: 'rise', count: 12, size: [9, 14], dur: [13, 21] },
  tears: { motion: 'streak', count: 5, size: [70, 130], dur: [9, 17] },
  bats: { motion: 'cross', count: 3, size: [22, 30], dur: [18, 30] },
  stars: { motion: 'twinkle', count: 32, size: [5, 10], dur: [3, 7] },
}

/**
 * Whatever crosses the page on a feast: `kind` from the feast, `tone` silver
 * for the feasts kept in silver. Every piece is placed once and moves by CSS
 * alone (themes.css), so nothing here runs on a clock.
 */
export function FeastSky({ kind, tone = 'gold' }) {
  const sky = SKIES[kind] ?? SKIES.stars
  const pieces = useMemo(() => {
    const sprites = spritesFor(kind, tone)
    const between = ([a, b]) => a + Math.random() * (b - a)
    return Array.from({ length: sky.count }, (_, i) => {
      const dur = between(sky.dur)
      return {
        key: i,
        style: {
          '--x': `${(Math.random() * 100).toFixed(1)}vw`,
          '--y': `${(Math.random() * 100).toFixed(1)}vh`,
          '--s': `${between(sky.size).toFixed(1)}px`,
          '--d': `${dur.toFixed(1)}s`,
          // Already under way when the page opens, rather than all starting
          // from the top together.
          '--delay': `${(-Math.random() * dur * (sky.motion === 'streak' ? 3 : 1)).toFixed(1)}s`,
          '--drift': `${((Math.random() - 0.5) * 18).toFixed(1)}vw`,
          '--turn': `${Math.round((Math.random() - 0.5) * 720)}deg`,
          backgroundImage: sprites[i % sprites.length],
        },
      }
    })
  }, [kind, tone, sky])
  return (
    <div className={`feast-sky ${sky.motion}`} data-sky={kind} aria-hidden="true">
      {pieces.map((p) => <i key={p.key} style={p.style} />)}
    </div>
  )
}
