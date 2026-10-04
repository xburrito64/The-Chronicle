import { useId } from 'react'
import { FeastMiniature, Leaf, Bloom, Metals, LEAF, starPoints } from './HoursFeasts.jsx'

// The bar of a feast day in Black Hours, made into a page of its own.
//
// Two layers, in the bar's own pixels (`w` by `h`), so nothing stretches:
//
//   FeastGround, under the blocks — the ground a miniature was painted on,
//   showing wherever the day is still empty: a lapis night pricked with gold
//   for Christmas Eve, violet diapered in gold for Advent, an ember glow for
//   All Hallows' Eve, dawn for Easter, a field of bezants for St Nicholas,
//   harlequin for Carnival, the darkest star field for the longest night.
//
//   FeastBar, over them — what fills the margins of that page, large, at the
//   ends of the day where it costs least to look past, and on some feasts
//   across the whole of it:
//     Christmas Eve   holly and berries; the star, its rays streaming across
//     Advent          the candles, as many lit as Sundays; a fir garland, a bow
//     All Hallows     a briar of black thorns, a skull; a bare branch, bats
//     Easter          lilies; the sun rising, its rays across the bar
//     St Nicholas     his crozier and three gold balls; oranges and coins
//     St Valentine    roses climbing in from both ends
//     Carnival        the fool's bauble; a mask; pennants and bells all along
//     St Sylvester    gilded starbursts; the hourglass of the year
//     New Year        Janus; the year in Roman numerals in a laurel wreath
//     Perseids        St Lawrence's gridiron; his tears falling across the bar
//     Geminids        the Twins as stars; silver falling across the bar
//     Longest night   a single candle kept lit; the moon
//     Midsummer       St John's fire; the sun; fireflies along the bar
//     A birthday      heralds' trumpets from both ends, their banners
//                     bearing the years and the name, on cloth of gold
//     The anniversary a quill and ink; the seal; a scroll with the years
//
// Drawn once for the size of the bar; only the flames and the star move.

const INK = '#2a1d08'
const LAPIS = '#27458f'
const VERMILION = '#c8352a'
const MALACHITE = '#2d6a43'
const VELLUM = '#f1ead8'
const SABLE = '#141217'
const GREENS = ['#2d6a43', '#245a38', '#3a8250']

/** A four-pointed glint at x, y. */
const glint = (x, y, r) => `M${x} ${y - r}L${x + r * 0.22} ${y - r * 0.22}L${x + r} ${y}L${x + r * 0.22} ${y + r * 0.22}L${x} ${y + r}L${x - r * 0.22} ${y + r * 0.22}L${x - r} ${y}L${x - r * 0.22} ${y - r * 0.22}Z`

/** Roman numerals, for years and ages. */
export function roman(n) {
  const marks = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let out = ''
  let left = Math.max(0, Math.floor(n))
  for (const [v, m] of marks) while (left >= v) { out += m; left -= v }
  return out
}

/** A piece drawn in a box 100 tall at the left end of the bar. */
const Left = ({ u, children }) => <g transform={`scale(${u})`}>{children}</g>
/** A piece drawn in a box `width` by 100 at the right end of the bar. */
const Right = ({ u, w, width, children }) => <g transform={`translate(${w - width * u} 0) scale(${u})`}>{children}</g>

const thin = { vectorEffect: 'non-scaling-stroke' }
const inked = { stroke: INK, strokeWidth: 0.8, strokeLinejoin: 'round', ...thin }

/** A stem drawn twice, a dark line in a coloured edge, as the briars are. */
function Briar({ d, edge, core, width = 2.4 }) {
  return (
    <>
      <path d={d} fill="none" stroke={edge} strokeWidth={width + 1.4} strokeLinecap="round" {...thin} />
      <path d={d} fill="none" stroke={core} strokeWidth={width} strokeLinecap="round" {...thin} />
    </>
  )
}

/** Fir needles along a gentle curve from (x0,y0) through (cx,cy) to (x1,y1). */
function Garland({ x0, y0, cx, cy, x1, y1, berries = true }) {
  const at = (t) => ({
    x: (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1,
    y: (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1,
  })
  const needles = []
  const dots = []
  for (let i = 0; i <= 80; i++) {
    const t = i / 80
    const p = at(t)
    const q = at(Math.min(1, t + 0.01))
    const a = Math.atan2(q.y - p.y, q.x - p.x)
    for (const side of [-1, 1]) {
      const n = a + side * 1.15
      needles.push(<path key={`${i}${side}`} d={`M${p.x} ${p.y}l${Math.cos(n) * 9} ${Math.sin(n) * 9}`} stroke={GREENS[(i + side + 2) % 3]} strokeWidth="1.3" strokeLinecap="round" {...thin} />)
    }
    if (berries && i % 13 === 6) dots.push(p)
  }
  return (
    <g>
      {needles}
      {dots.map((p, i) => <Bloom key={i} kind="berry" x={p.x} y={p.y + 3} r={4.2} hue={VERMILION} ids="" />)}
    </g>
  )
}

/** A scroll across the head of the bar, with words on it. */
function Banderole({ w, h, words }) {
  const width = Math.min(w * 0.34, 380)
  const tall = Math.max(16, h * 0.2)
  const x = (w - width) / 2
  const y = 3
  const tail = tall * 0.9
  return (
    <g className="feast-scroll">
      <path d={`M${x} ${y + tall * 0.2}L${x - tail} ${y + tall * 0.2}L${x - tail * 0.55} ${y + tall * 0.7}L${x - tail} ${y + tall * 1.2}L${x + 4} ${y + tall * 1.2}Z`} fill="#d9cfb6" {...inked} />
      <path d={`M${x + width} ${y + tall * 0.2}L${x + width + tail} ${y + tall * 0.2}L${x + width + tail * 0.55} ${y + tall * 0.7}L${x + width + tail} ${y + tall * 1.2}L${x + width - 4} ${y + tall * 1.2}Z`} fill="#d9cfb6" {...inked} />
      <path d={`M${x} ${y}Q${x + width / 2} ${y + tall * 0.35} ${x + width} ${y}V${y + tall}Q${x + width / 2} ${y + tall * 1.35} ${x} ${y + tall}Z`} fill={VELLUM} {...inked} />
      <text x={w / 2} y={y + tall * 0.74} textAnchor="middle" className="feast-scroll-words" style={{ fontSize: `${tall * 0.62}px` }}>{words}</text>
    </g>
  )
}

/**
 * A herald's trumpet coming in from the left at the top of the bar, a
 * swallow-tailed banner hung from it in vermilion fringed with gold, and
 * gold bursting from its bell. Drawn in the 100-tall box; the words on the
 * banner are BannerWords, so the right-hand one can be turned without them.
 */
export function Herald({ id }) {
  const gold = `url(#${id}g)`
  const tube = (x) => 12 + (x + 6) * (20 / 160)
  const fringe = []
  for (let x = 46; x <= 116; x += 3.5) {
    const y = x < 81 ? 84 - ((x - 44) / 37) * 12 : 72 + ((x - 81) / 37) * 12
    fringe.push(<path key={x} d={`M${x} ${y}v4`} stroke="#e2bd62" strokeWidth="1" {...thin} />)
  }
  return (
    <g>
      {/* The banner, hung from two cords on the tube. */}
      <path d={`M44 ${tube(44) + 2}L118 ${tube(118) + 2}L118 84L81 72L44 84Z`} fill={VERMILION} {...inked} />
      <path d={`M48 ${tube(48) + 6}L114 ${tube(114) + 6}L114 79L81 67.6L48 79Z`} fill="none" stroke="#e2bd62" strokeWidth="0.9" {...thin} />
      <path d={`M44 ${tube(44) + 2}L60 ${tube(60) + 2}L60 79L44 84Z`} fill="#000" opacity="0.14" />
      {fringe}
      {[44, 118].map((x) => <circle key={x} cx={x} cy={tube(x) + 1} r="2.6" fill={gold} {...inked} />)}
      {/* The trumpet: a long gold tube, a knop, and the flared bell. */}
      <path d={`M-6 12L150 ${tube(150)}`} stroke={INK} strokeWidth="6" strokeLinecap="round" {...thin} />
      <path d={`M-6 12L150 ${tube(150)}`} stroke={gold} strokeWidth="4.4" strokeLinecap="round" {...thin} />
      <ellipse cx="34" cy={tube(34)} rx="5" ry="4.4" fill={gold} {...inked} />
      <ellipse cx="128" cy={tube(128)} rx="3.6" ry="3.4" fill={gold} {...inked} />
      <path d={`M146 ${tube(146) - 2.2}L170 ${tube(170) - 12}Q175 ${tube(170)} 170 ${tube(170) + 12}L146 ${tube(146) + 2.2}Z`} fill={gold} {...inked} />
      <ellipse cx="170" cy={tube(170)} rx="3" ry="12" fill="#b08a3e" {...inked} />
      {/* The fanfare. */}
      {[[186, 22, 5, 'g'], [198, 38, 3, VERMILION], [184, 50, 4, 'g'], [206, 16, 2.6, LAPIS], [212, 46, 3.4, 'g'], [194, 8, 2.4, VELLUM], [216, 30, 2.2, VERMILION]].map(([x, y, r, c]) => (
        c === 'g'
          ? <path key={`${x}${y}`} d={glint(x, y, r)} fill="#fff0c0" />
          : <circle key={`${x}${y}`} cx={x} cy={y} r={r * 0.6} fill={c} />
      ))}
    </g>
  )
}

/**
 * The words on a herald's banner, centred at x. A long name is set a little
 * smaller and then drawn together to fit, rather than shrunk out of reading.
 */
export function BannerWords({ x, words }) {
  const size = Math.min(16, Math.max(11.5, 150 / Math.max(1, words.length)))
  const tight = words.length * size * 0.62 > 64
  return (
    <text
      x={x}
      y={52 + size * 0.36}
      textAnchor="middle"
      className="feast-banner-words"
      style={{ fontSize: `${size}px` }}
      textLength={tight ? 64 : undefined}
      lengthAdjust={tight ? 'spacingAndGlyphs' : undefined}
    >
      {words}
    </text>
  )
}

/** Long falling stars across the bar: thin wedges, brightest at the head. */
function Streaks({ w, h, id, tone, count, angle }) {
  const out = []
  for (let i = 0; i < count; i++) {
    const len = h * (1.3 + ((i * 37) % 10) / 7)
    const a = (angle * Math.PI) / 180
    const hx = w * (0.18 + (i / count) * 0.66) + ((i * 53) % 40)
    const hy = h * (0.3 + ((i * 29) % 50) / 100)
    const tx = hx - Math.cos(a) * len
    const ty = hy - Math.sin(a) * len
    const nx = -Math.sin(a) * 1.6
    const ny = Math.cos(a) * 1.6
    out.push(
      <g key={i}>
        <linearGradient id={`${id}t${i}`} gradientUnits="userSpaceOnUse" x1={tx} y1={ty} x2={hx} y2={hy}>
          <stop offset="0" stopColor={tone} stopOpacity="0" />
          <stop offset="0.8" stopColor={tone} stopOpacity="0.75" />
          <stop offset="1" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <path d={`M${tx} ${ty}L${hx + nx} ${hy + ny}L${hx - nx} ${hy - ny}Z`} fill={`url(#${id}t${i})`} />
        <path d={glint(hx, hy, 5)} fill="#fff" />
      </g>,
    )
  }
  return <g>{out}</g>
}

const BAT = 'M20 8c1-2 2.4-2 3-1l.6-1.6.6 1.8C27 4 32 3 39 5c-3 1-4.4 3-4.6 5.6-2-1.4-4.4-1.2-5.6.8-1.4-1.6-3.4-1.4-4.6.2-1.4.9-3 1.6-4.2 3.2-1.2-1.6-2.8-2.3-4.2-3.2-1.2-1.6-3.2-1.8-4.6-.2-1.2-2-3.6-2.2-5.6-.8C5.4 8 4 6 1 5c7-2 12-1 14.2 2.2l.6-1.8.6 1.6c.6-1 2-1 3 1Z'

/** A flame with its glow, standing at x, y (its foot). */
function Flame({ x, y, size, id }) {
  return (
    <g>
      <circle cx={x} cy={y - size * 0.55} r={size * 1.3} fill={`url(#${id}glow)`} />
      <path className="feast-flicker" d={`M${x} ${y - size}C${x + size * 0.42} ${y - size * 0.55} ${x + size * 0.36} ${y - size * 0.1} ${x} ${y}C${x - size * 0.36} ${y - size * 0.1} ${x - size * 0.42} ${y - size * 0.55} ${x} ${y - size}Z`} fill={`url(#${id}g)`} stroke="#8a3a12" strokeWidth="0.6" {...thin} />
    </g>
  )
}

/** The ground of a feast's bar, under its blocks. */
export function FeastGround({ id: feast, w, h }) {
  const id = `fg${useId().replace(/:/g, '')}`
  if (!w || !h) return null
  const pattern = (pid, pw, ph, body) => (
    <pattern id={`${id}${pid}`} width={pw} height={ph} patternUnits="userSpaceOnUse">{body}</pattern>
  )
  const wash = (top, bottom) => (
    <linearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={top} />
      <stop offset="1" stopColor={bottom} />
    </linearGradient>
  )
  let defs = null
  let layers = null
  const stars = (fill, r = 1) => pattern('p', 54, 40, (
    <g fill={fill}>
      <path d={glint(8, 9, 2.4 * r)} /><path d={glint(31, 28, 1.6 * r)} /><path d={glint(45, 12, 1.2 * r)} />
      <circle cx="20" cy="34" r={0.7 * r} /><circle cx="50" cy="36" r={0.6 * r} /><circle cx="24" cy="6" r={0.5 * r} />
    </g>
  ))
  const lozenges = (stroke, size = 26) => pattern('p', size, size, (
    <g fill="none" stroke={stroke} strokeWidth="0.7">
      <path d={`M${size / 2} 1 ${size - 1} ${size / 2} ${size / 2} ${size - 1} 1 ${size / 2}Z`} />
      <circle cx={size / 2} cy={size / 2} r="1.1" fill={stroke} stroke="none" />
    </g>
  ))

  switch (feast) {
    case 'christmas-eve':
      defs = <>{wash('rgba(39, 69, 143, 0.42)', 'rgba(39, 69, 143, 0.12)')}{stars('#e2bd62')}</>
      layers = <><rect width={w} height={h} fill={`url(#${id}w)`} /><rect width={w} height={h} fill={`url(#${id}p)`} opacity="0.7" /></>
      break
    case 'advent':
      defs = <>{wash('rgba(91, 47, 120, 0.12)', 'rgba(91, 47, 120, 0.42)')}{lozenges('rgba(226, 189, 98, 0.32)')}</>
      layers = <><rect width={w} height={h} fill={`url(#${id}w)`} /><rect width={w} height={h} fill={`url(#${id}p)`} /></>
      break
    case 'halloween':
      defs = wash('rgba(0, 0, 0, 0.2)', 'rgba(200, 64, 30, 0.38)')
      layers = <rect width={w} height={h} fill={`url(#${id}w)`} />
      break
    case 'easter':
      defs = (
        <>
          {wash('rgba(255, 220, 170, 0.06)', 'rgba(255, 168, 128, 0.32)')}
          {pattern('p', 30, 30, <g fill="#f6ead0" opacity="0.5"><circle cx="15" cy="15" r="1.4" /><circle cx="15" cy="10.6" r="1" /><circle cx="15" cy="19.4" r="1" /><circle cx="10.6" cy="15" r="1" /><circle cx="19.4" cy="15" r="1" /></g>)}
        </>
      )
      layers = <><rect width={w} height={h} fill={`url(#${id}w)`} /><rect width={w} height={h} fill={`url(#${id}p)`} opacity="0.5" /></>
      break
    case 'st-nicholas':
      defs = <>{wash('rgba(200, 53, 42, 0.32)', 'rgba(200, 53, 42, 0.12)')}{pattern('p', 24, 24, <g fill="#e2bd62"><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="18" r="2.2" /></g>)}</>
      layers = <><rect width={w} height={h} fill={`url(#${id}w)`} /><rect width={w} height={h} fill={`url(#${id}p)`} opacity="0.4" /></>
      break
    case 'valentines':
      defs = (
        <>
          {wash('rgba(201, 113, 138, 0.3)', 'rgba(200, 53, 42, 0.16)')}
          {pattern('p', 32, 28, <path d="M16 20c-3.4-2.6-5.4-4.6-5.4-6.8 0-1.6 1.2-2.8 2.7-2.8 1.1 0 2 .6 2.7 1.6.7-1 1.6-1.6 2.7-1.6 1.5 0 2.7 1.2 2.7 2.8 0 2.2-2 4.2-5.4 6.8Z" fill="#e58aa0" />)}
        </>
      )
      layers = <><rect width={w} height={h} fill={`url(#${id}w)`} /><rect width={w} height={h} fill={`url(#${id}p)`} opacity="0.35" /></>
      break
    case 'carnival':
      defs = pattern('p', 36, 48, (
        <g>
          <rect width="36" height="48" fill={VERMILION} />
          <path d="M18 0 36 24 18 48 0 24Z" fill={LAPIS} />
          <path d="M0 0 18 0 0 24ZM36 0 18 0 36 24ZM0 48 18 48 0 24ZM36 48 18 48 36 24Z" fill={MALACHITE} />
          <circle cx="18" cy="24" r="1.6" fill="#e2bd62" /><circle cx="0" cy="0" r="1.6" fill="#e2bd62" /><circle cx="36" cy="48" r="1.6" fill="#e2bd62" />
        </g>
      ))
      layers = <rect width={w} height={h} fill={`url(#${id}p)`} opacity="0.3" />
      break
    case 'new-years-eve':
      defs = <>{wash('rgba(20, 22, 60, 0.45)', 'rgba(20, 22, 60, 0.15)')}{stars('#e2bd62', 0.8)}</>
      layers = <><rect width={w} height={h} fill={`url(#${id}w)`} /><rect width={w} height={h} fill={`url(#${id}p)`} opacity="0.6" /></>
      break
    case 'new-year':
      defs = <>{wash('rgba(240, 206, 130, 0.22)', 'rgba(240, 206, 130, 0.06)')}{lozenges('rgba(226, 189, 98, 0.3)', 20)}</>
      layers = <><rect width={w} height={h} fill={`url(#${id}w)`} /><rect width={w} height={h} fill={`url(#${id}p)`} /></>
      break
    case 'perseids':
      defs = <>{wash('rgba(39, 69, 143, 0.4)', 'rgba(20, 30, 70, 0.15)')}{stars('#e2bd62', 0.9)}</>
      layers = <><rect width={w} height={h} fill={`url(#${id}w)`} /><rect width={w} height={h} fill={`url(#${id}p)`} opacity="0.6" /></>
      break
    case 'geminids':
      defs = <>{wash('rgba(40, 52, 110, 0.42)', 'rgba(20, 24, 50, 0.15)')}{stars('#d8dcf0', 0.9)}</>
      layers = <><rect width={w} height={h} fill={`url(#${id}w)`} /><rect width={w} height={h} fill={`url(#${id}p)`} opacity="0.6" /></>
      break
    case 'longest-night':
      defs = (
        <>
          {wash('rgba(0, 0, 0, 0.5)', 'rgba(30, 28, 60, 0.3)')}
          {pattern('p', 40, 30, <g fill="#d8d5de"><path d={glint(6, 7, 1.8)} /><circle cx="18" cy="22" r="0.8" /><circle cx="30" cy="10" r="0.6" /><circle cx="36" cy="26" r="0.9" /><circle cx="12" cy="16" r="0.5" /><path d={glint(26, 19, 1.2)} /></g>)}
        </>
      )
      layers = <><rect width={w} height={h} fill={`url(#${id}w)`} /><rect width={w} height={h} fill={`url(#${id}p)`} opacity="0.8" /></>
      break
    case 'midsummer':
      defs = wash('rgba(255, 196, 110, 0.18)', 'rgba(60, 140, 90, 0.34)')
      layers = <rect width={w} height={h} fill={`url(#${id}w)`} />
      break
    case 'birthday':
      // Crimson cloth of gold: an ogee lattice woven in gold, a pomegranate
      // in every cell — the hanging behind a feast.
      defs = (
        <>
          {wash('rgba(150, 28, 34, 0.42)', 'rgba(110, 18, 26, 0.26)')}
          {pattern('p', 44, 56, (
            <g fill="none" stroke="#e2bd62" strokeWidth="0.8">
              <path d="M22 0C34 10 34 18 22 28S10 46 22 56M22 0C10 10 10 18 22 28S34 46 22 56" />
              <path d="M0 23.5c2.4 0 4 1.8 4 4.4S2.4 32.4 0 32.4M44 23.5c-2.4 0-4 1.8-4 4.4s1.6 4.5 4 4.5" fill="#e2bd62" fillOpacity="0.5" />
              <path d="M22 25l3 3-3 3-3-3Z" fill="#e2bd62" stroke="none" />
            </g>
          ))}
        </>
      )
      layers = <><rect width={w} height={h} fill={`url(#${id}w)`} /><rect width={w} height={h} fill={`url(#${id}p)`} opacity="0.4" /></>
      break
    case 'anniversary':
      defs = <>{wash('rgba(214, 176, 90, 0.26)', 'rgba(214, 176, 90, 0.08)')}{lozenges('rgba(240, 210, 140, 0.4)', 22)}</>
      layers = <><rect width={w} height={h} fill={`url(#${id}w)`} /><rect width={w} height={h} fill={`url(#${id}p)`} /></>
      break
    default:
      return null
  }
  return (
    <svg className="feast-ground" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <defs>{defs}</defs>
      {layers}
    </svg>
  )
}

/** What fills the margins of a feast's bar, over its blocks. */
export function FeastBar({ festival, date, w, h }) {
  const id = `fb${useId().replace(/:/g, '')}`
  if (!w || !h || !festival) return null
  const u = h / 100
  const gold = `url(#${id}g)`
  const silver = `url(#${id}s)`
  const feast = festival.id
  let art = null

  switch (feast) {
    case 'christmas-eve': {
      const sx = w - 52 * u
      const sy = 34 * u
      art = (
        <>
          {[[w * 0.42, 4], [w * 0.5, 15 * u], [w * 0.58, 28 * u], [w * 0.66, 44 * u]].map(([x, y], i) => (
            <g key={i}>
              <linearGradient id={`${id}r${i}`} gradientUnits="userSpaceOnUse" x1={sx} y1={sy} x2={x} y2={y}>
                <stop offset="0" stopColor="#fff0c0" stopOpacity="0.85" />
                <stop offset="1" stopColor="#e2bd62" stopOpacity="0" />
              </linearGradient>
              <path d={`M${sx} ${sy}L${x} ${y}`} stroke={`url(#${id}r${i})`} strokeWidth={i % 2 ? 1 : 1.6} />
            </g>
          ))}
          <path d={`M${sx - 4 * u} ${sy + 18 * u}L${sx + 4 * u} ${sy + 18 * u}L${sx + 22 * u} ${h}L${sx - 22 * u} ${h}Z`} fill="#f3dc95" opacity="0.1" />
          <circle className="feast-pulse" cx={sx} cy={sy} r={40 * u} fill={`url(#${id}glow)`} />
          <polygon points={starPoints(sx, sy, 24 * u, 8 * u, 8)} fill={gold} {...inked} />
          <polygon points={starPoints(sx, sy, 9 * u, 3.4 * u, 8, -Math.PI / 2 + Math.PI / 8)} fill="#fffbe8" opacity="0.8" />
          <Left u={u}>
            <path d="M-2 10C30 4 55 22 85 16S125 4 150 14M42 17C46 34 38 52 46 72M110 9c4 14 0 26 8 36" fill="none" stroke={gold} strokeWidth="1.4" {...thin} />
            {[[10, 8, -62, 20], [26, 11, 52, 22], [52, 19, -48, 22], [66, 21, 58, 20], [98, 14, -56, 20], [114, 10, 62, 18], [138, 12, -40, 16], [44, 40, 160, 18], [42, 60, 20, 16], [114, 30, 150, 16], [118, 44, 30, 14]].map(([x, y, a, s], i) => (
              <Leaf key={i} kind="holly" x={x} y={y} angle={a} size={s} paint={GREENS[i % 3]} hue={null} ids={id} />
            ))}
            {[[32, 23], [74, 31], [124, 22], [47, 78], [120, 50]].map(([x, y], i) => <Bloom key={i} kind="berry" x={x} y={y} r={8} hue={VERMILION} ids={id} />)}
          </Left>
        </>
      )
      break
    }
    case 'advent': {
      const nth = festival.nth ?? 1
      art = (
        <>
          <Left u={u}>
            <rect x="8" y="88" width="108" height="8" rx="2" fill={gold} {...inked} />
            {[22, 46, 70, 94].map((x, i) => (
              <g key={x}>
                <rect x={x - 5} y="44" width="10" height="44" fill={i === 2 ? '#d98ba0' : VELLUM} {...inked} />
                {i < nth ? <Flame x={x} y={42} size={16} id={id} /> : <path d={`M${x} 44v-6`} stroke={INK} strokeWidth="1.2" {...thin} />}
              </g>
            ))}
          </Left>
          <Right u={u} w={w} width={300}>
            <path d="M0 2Q150 50 300 2" fill="none" stroke={gold} strokeWidth="1" {...thin} />
            <Garland x0={0} y0={2} cx={150} cy={50} x1={300} y1={2} />
            {[[70, 28, LAPIS], [230, 28, VERMILION]].map(([x, y, c]) => (
              <g key={x}>
                <path d={`M${x} ${y - 6}v14`} stroke={gold} strokeWidth="0.8" {...thin} />
                <circle cx={x} cy={y + 14} r="7" fill={c} {...inked} />
                <circle cx={x - 2.4} cy={y + 11.6} r="2" fill="#fff" opacity="0.55" />
                <rect x={x - 2.6} y={y + 5} width="5.2" height="3" fill={gold} />
              </g>
            ))}
            <path d="M150 27C130 10 120 32 150 27C170 10 180 32 150 27Z" fill={VERMILION} {...inked} />
            <path d="M150 27 136 54l6-2 3 6ZM150 27l14 27-6-2-3 6Z" fill={VERMILION} {...inked} />
            <circle cx="150" cy="27" r="4.6" fill="#9e2a22" {...inked} />
          </Right>
        </>
      )
      break
    }
    case 'halloween': {
      art = (
        <>
          {[[0.36, 12], [0.5, 24], [0.6, 10], [0.72, 20]].map(([fx, y], i) => (
            <g key={i} transform={`translate(${w * fx} ${y * u}) scale(${u * (0.75 + (i % 2) * 0.25)})`}>
              <path d={BAT} fill="#0c0a0e" stroke="#e2bd62" strokeWidth="0.7" {...thin} />
            </g>
          ))}
          <Left u={u}>
            <Briar d="M-2 98C20 70 8 40 30 24S72 6 104 12S152 30 176 16M30 24C42 42 62 48 66 72M104 12c6 12 4 22 12 30" edge={VERMILION} core={SABLE} width={3} />
            {[[18, 52, 200, 11], [24, 34, -120, 10], [50, 12, -80, 10], [80, 9, 100, 10], [128, 20, -70, 10], [160, 20, 120, 9], [50, 46, 20, 9], [62, 62, 200, 9], [110, 26, 30, 8]].map(([x, y, a, s], i) => (
              <Leaf key={i} kind="thorn" x={x} y={y} angle={a} size={s} paint={SABLE} edge={VERMILION} hue={null} ids={id} />
            ))}
            {[[92, 18], [140, 26], [66, 76], [118, 46]].map(([x, y], i) => <Bloom key={i} kind="berry" x={x} y={y} r={6.5} hue={VERMILION} ids={id} />)}
            <g transform="translate(14 40) scale(2.05)"><FeastMiniature id="halloween" plain size={28} /></g>
          </Left>
          <Right u={u} w={w} width={170}>
            <Briar d="M172 6C140 10 118 4 96 14S62 22 44 18M118 8c-6 10-2 20-10 28M74 18c-4-8-12-10-18-14M150 7c2 10 10 14 8 24" edge={VERMILION} core={SABLE} width={2.6} />
            <path d="M108 36v6" stroke="#8f8b99" strokeWidth="0.6" {...thin} />
            <path d="M108 42c-6 2-9 12-7 18 3-2 4-1 7 2 3-3 4-4 7-2 2-6-1-16-7-18Z" fill="#0c0a0e" stroke="#e2bd62" strokeWidth="0.7" {...thin} />
            <g transform="translate(20 50) scale(1.3)"><path d={BAT} fill="#0c0a0e" stroke="#e2bd62" strokeWidth="0.7" {...thin} /></g>
          </Right>
        </>
      )
      break
    }
    case 'easter': {
      const cx = w - 74 * u
      const cy = h * 0.95
      const rays = Array.from({ length: 13 }, (_, i) => {
        const a = Math.PI + (i / 12) * Math.PI
        const len = (110 + (i % 2) * 60) * u
        return `M${cx + Math.cos(a - 0.03) * 34 * u} ${cy + Math.sin(a - 0.03) * 34 * u}L${cx + Math.cos(a) * len} ${cy + Math.sin(a) * len}L${cx + Math.cos(a + 0.03) * 34 * u} ${cy + Math.sin(a + 0.03) * 34 * u}Z`
      })
      art = (
        <>
          {rays.map((d, i) => <path key={i} d={d} fill="#ffe2a8" opacity="0.32" />)}
          <circle cx={cx} cy={cy} r={34 * u} fill={gold} {...inked} />
          <circle cx={cx - 10 * u} cy={cy - 14 * u} r={2 * u} fill={INK} /><circle cx={cx + 10 * u} cy={cy - 14 * u} r={2 * u} fill={INK} />
          <path d={`M${cx - 9 * u} ${cy - 4 * u}q${9 * u} ${7 * u} ${18 * u} 0`} fill="none" stroke={INK} strokeWidth="1.2" />
          <circle cx={cx - 15 * u} cy={cy - 7 * u} r={3 * u} fill={VERMILION} opacity="0.35" /><circle cx={cx + 15 * u} cy={cy - 7 * u} r={3 * u} fill={VERMILION} opacity="0.35" />
          <Left u={u}>
            {[[30, 34], [62, 20], [96, 40], [128, 30]].map(([x, top], i) => (
              <g key={x}>
                <path d={`M${x - 4} 102C${x - 2} 70 ${x + 3} 50 ${x} ${top}`} fill="none" stroke={MALACHITE} strokeWidth="2.2" {...thin} />
                <Leaf kind="laurel" x={x - 3} y={88 - i * 3} angle={-120} size={24} paint={GREENS[i % 3]} hue={null} ids={id} />
                <Leaf kind="laurel" x={x - 1} y={74} angle={-58} size={20} paint={GREENS[(i + 1) % 3]} hue={null} ids={id} />
                <Bloom kind="lily" x={x} y={top - 4} r={9} hue={VELLUM} ids={id} />
              </g>
            ))}
          </Left>
        </>
      )
      break
    }
    case 'st-nicholas': {
      art = (
        <>
          <Left u={u}>
            <path d="M26 100V34" stroke={INK} strokeWidth="5" {...thin} />
            <path d="M26 100V34" stroke={gold} strokeWidth="3.4" {...thin} />
            <path d="M26 34C26 12 52 6 55 24 57 38 38 40 38 29 38 22 45 20 47 25" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" {...thin} />
            <path d="M26 34C26 12 52 6 55 24 57 38 38 40 38 29 38 22 45 20 47 25" fill="none" stroke={gold} strokeWidth="3.4" strokeLinecap="round" {...thin} />
            <circle cx="26" cy="44" r="5" fill={gold} {...inked} />
            {[[74, 82], [102, 82], [88, 58]].map(([x, y]) => (
              <g key={x + y}>
                <circle cx={x} cy={y} r="12" fill={gold} {...inked} />
                <circle cx={x - 4} cy={y - 4} r="3" fill="#fff" opacity="0.6" />
              </g>
            ))}
          </Left>
          <Right u={u} w={w} width={320}>
            <path d="M0 3Q160 46 320 3" fill="none" stroke={gold} strokeWidth="1" {...thin} />
            {Array.from({ length: 9 }, (_, i) => {
              const t = 0.1 + i * 0.1
              const x = 320 * t
              const y = (1 - t) ** 2 * 3 + 2 * (1 - t) * t * 46 + t * t * 3
              return i % 2 ? (
                <g key={i}><circle cx={x} cy={y + 8} r="7" fill={gold} {...inked} /><circle cx={x} cy={y + 8} r="4.4" fill="none" stroke="#7a5a1e" strokeWidth="0.8" {...thin} /></g>
              ) : (
                <g key={i}>
                  <circle cx={x} cy={y + 9} r="8" fill="#e8892a" {...inked} />
                  <circle cx={x - 2.6} cy={y + 6.4} r="2" fill="#fff" opacity="0.45" />
                  <Leaf kind="laurel" x={x} y={y + 1.5} angle={-30} size={9} paint={MALACHITE} hue={null} ids={id} />
                </g>
              )
            })}
          </Right>
        </>
      )
      break
    }
    case 'valentines': {
      const briar = (
        <>
          <path d="M-2 92C30 62 20 32 60 22S122 32 152 14 196 10 214 22M60 22c6 18 2 34 12 46" fill="none" stroke={MALACHITE} strokeWidth="2.4" {...thin} />
          {[[28, 54, 200, 7], [44, 30, -110, 7], [100, 22, -80, 7], [140, 20, 100, 7], [190, 12, -70, 6], [68, 50, 30, 6]].map(([x, y, a, s], i) => (
            <Leaf key={`t${i}`} kind="thorn" x={x} y={y} angle={a} size={s} paint={MALACHITE} hue={null} ids={id} />
          ))}
          {[[36, 44, -150, 16], [84, 20, -40, 16], [118, 32, 140, 15], [168, 10, -30, 14], [74, 58, 160, 14], [200, 22, 60, 12]].map(([x, y, a, s], i) => (
            <Leaf key={`l${i}`} kind="ivy" x={x} y={y} angle={a} size={s} paint={GREENS[i % 3]} hue={null} ids={id} />
          ))}
          <Bloom kind="rose" x={60} y={22} r={15} hue={VERMILION} ids={id} />
          <Bloom kind="rose" x={128} y={24} r={12} hue="#c9718a" ids={id} />
          <Bloom kind="rose" x={186} y={16} r={10} hue={VERMILION} ids={id} />
          <Bloom kind="rose" x={74} y={70} r={9} hue="#c9718a" ids={id} />
        </>
      )
      art = (
        <>
          <Left u={u}>{briar}</Left>
          <Right u={u} w={w} width={214}><g transform="translate(214 0) scale(-1 1)">{briar}</g></Right>
        </>
      )
      break
    }
    case 'carnival': {
      const colours = [LAPIS, VERMILION, MALACHITE, '#d6b05a']
      const step = 32
      const n = Math.ceil(w / step)
      const deep = Math.max(12, 18 * u)
      art = (
        <>
          <path d={`M0 2.5H${w}`} stroke={gold} strokeWidth="1.2" />
          {Array.from({ length: n }, (_, i) => (
            <g key={i}>
              <path d={`M${i * step + 2} 2.5H${i * step + step - 2}L${i * step + step / 2} ${deep}Z`} fill={colours[i % 4]} {...inked} />
              {i % 2 === 0 && <circle cx={i * step + step / 2} cy={deep + 3} r={Math.max(2.2, 3 * u)} fill={gold} {...inked} />}
            </g>
          ))}
          <Left u={u}>
            <path d="M34 100V54" stroke={INK} strokeWidth="4.4" {...thin} />
            <path d="M34 100V54" stroke={gold} strokeWidth="3" {...thin} />
            <circle cx="34" cy="50" r="11" fill={VELLUM} {...inked} />
            <circle cx="30" cy="48" r="1.4" fill={INK} /><circle cx="38" cy="48" r="1.4" fill={INK} />
            <path d="M29 54q5 4 10 0" fill="none" stroke={INK} strokeWidth="1" {...thin} />
            <path d="M24 42C22 34 18 30 10 28c8-2 14 2 18 10ZM44 42c2-8 6-12 14-14-8-2-14 2-18 10Z" fill={LAPIS} {...inked} />
            <path d="M28 40c0-10 2-16 6-22 4 6 6 12 6 22Z" fill={VERMILION} {...inked} />
            <circle cx="10" cy="28" r="3" fill={gold} {...inked} /><circle cx="58" cy="28" r="3" fill={gold} {...inked} /><circle cx="34" cy="17" r="3" fill={gold} {...inked} />
            <path d="M22 62 18 74M46 62l4 12" stroke={VERMILION} strokeWidth="2" {...thin} />
          </Left>
          <Right u={u} w={w} width={110}>
            <path d="M14 56C14 44 30 40 46 46c6 2 10 2 16 0 16-6 32-2 32 10 0 10-10 14-22 12-8-1-12-6-18-6s-10 5-18 6C20 70 14 66 14 56Z" fill={SABLE} stroke="#e2bd62" strokeWidth="1" {...thin} />
            <ellipse cx="36" cy="55" rx="8" ry="5" fill="#2a2633" /><ellipse cx="72" cy="55" rx="8" ry="5" fill="#2a2633" />
            <path d="M14 56C6 60 4 72 0 80M94 56c8 4 10 16 14 24" fill="none" stroke={VERMILION} strokeWidth="2" {...thin} />
          </Right>
        </>
      )
      break
    }
    case 'new-years-eve': {
      const burst = (cx, cy, r, tone) => (
        <g key={`${cx}${cy}`}>
          {Array.from({ length: 16 }, (_, i) => {
            const a = (i / 16) * Math.PI * 2
            return (
              <g key={i}>
                <path d={`M${cx + Math.cos(a) * r * 0.25} ${cy + Math.sin(a) * r * 0.25}L${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r}`} stroke={i % 2 ? tone : gold} strokeWidth="1.2" {...thin} />
                <circle cx={cx + Math.cos(a) * r * 1.08} cy={cy + Math.sin(a) * r * 1.08} r={i % 2 ? 1.6 : 2.2} fill={i % 2 ? tone : '#fff0c0'} />
              </g>
            )
          })}
          <polygon points={starPoints(cx, cy, r * 0.22, r * 0.09, 6)} fill={gold} />
        </g>
      )
      art = (
        <>
          <Left u={u}>
            {burst(52, 38, 30, VERMILION)}
            {burst(130, 28, 22, '#c9d4f2')}
            {burst(196, 54, 16, VERMILION)}
            {burst(250, 22, 12, '#c9d4f2')}
          </Left>
          <Right u={u} w={w} width={96}>
            <g transform="translate(2 4) scale(3.3)"><FeastMiniature id="new-years-eve" size={28} /></g>
          </Right>
        </>
      )
      break
    }
    case 'new-year': {
      const year = Number(String(date ?? '').slice(0, 4)) || new Date().getFullYear()
      const leaves = []
      for (let a = 100; a <= 250; a += 15) leaves.push(a)
      for (let a = -70; a <= 80; a += 15) leaves.push(a)
      art = (
        <>
          <Left u={u}>
            <g transform="translate(2 2) scale(3.45)"><FeastMiniature id="new-year" size={28} /></g>
          </Left>
          <Right u={u} w={w} width={112}>
            {leaves.map((deg, i) => {
              const a = (deg * Math.PI) / 180
              const x = 56 + Math.cos(a) * 38
              const y = 48 + Math.sin(a) * 38
              const turn = deg > 90 ? deg - 90 - 30 : deg + 90 + 30
              return <Leaf key={i} kind="laurel" x={x} y={y} angle={turn} size={14} paint={null} hue={null} ids={id} />
            })}
            <path d="M50 86 40 98M62 86l10 12" stroke={VERMILION} strokeWidth="3" {...thin} />
            <circle cx="56" cy="86" r="4" fill={VERMILION} {...inked} />
            <text x="56" y="53" textAnchor="middle" className="feast-roman" textLength={roman(year).length > 6 ? 58 : undefined} lengthAdjust="spacingAndGlyphs">{roman(year)}</text>
          </Right>
        </>
      )
      break
    }
    case 'perseids':
    case 'geminids': {
      const perseids = feast === 'perseids'
      art = (
        <>
          <Streaks w={w} h={h} id={id} tone={perseids ? '#ffe3a0' : '#dfe6ff'} count={perseids ? 6 : 5} angle={perseids ? 26 : 34} />
          {perseids ? (
            <Left u={u}>
              <g transform="rotate(-8 60 50)">
                <rect x="14" y="26" width="72" height="48" rx="2" fill="none" stroke={INK} strokeWidth="4.6" {...thin} />
                <rect x="14" y="26" width="72" height="48" rx="2" fill="none" stroke={gold} strokeWidth="3" {...thin} />
                {[26, 38, 50, 62, 74].map((x) => <path key={x} d={`M${x} 26V74`} stroke={gold} strokeWidth="2" {...thin} />)}
                <path d="M86 50h22" stroke={gold} strokeWidth="3" {...thin} />
                <circle cx="113" cy="50" r="5" fill="none" stroke={gold} strokeWidth="2" {...thin} />
                <path d="M20 74v8M80 74v8" stroke={gold} strokeWidth="2.4" {...thin} />
              </g>
            </Left>
          ) : (
            <Right u={u} w={w} width={130}>
              <path d="M34 16 26 40 20 64 14 88M26 40 46 46M58 22 52 46 54 70 62 92M52 46 36 52M34 16 58 22" fill="none" stroke={gold} strokeWidth="0.9" strokeDasharray="3 2" {...thin} />
              {[[26, 40, 4], [20, 64, 3.6], [14, 88, 3.4], [46, 46, 3], [52, 46, 4], [54, 70, 3.6], [62, 92, 3.4], [36, 52, 3]].map(([x, y, r]) => (
                <polygon key={`${x}${y}`} points={starPoints(x, y, r, r * 0.42, 6)} fill={silver} {...inked} />
              ))}
              <circle cx="34" cy="16" r="12" fill={`url(#${id}glow)`} /><circle cx="58" cy="22" r="12" fill={`url(#${id}glow)`} />
              <polygon points={starPoints(34, 16, 9, 3.4, 8)} fill={gold} {...inked} />
              <polygon points={starPoints(58, 22, 9, 3.4, 8)} fill={silver} {...inked} />
            </Right>
          )}
        </>
      )
      break
    }
    case 'longest-night': {
      art = (
        <>
          <Left u={u}>
            <ellipse cx="38" cy="94" rx="22" ry="4" fill={silver} {...inked} />
            <path d="M24 94c2-6 26-6 28 0" fill={silver} {...inked} />
            <rect x="31" y="42" width="14" height="50" fill={VELLUM} {...inked} />
            <path d="M31 44c3 2 4 6 3 10" fill="none" stroke="#d9cfb6" strokeWidth="2" {...thin} />
            <Flame x={38} y={40} size={18} id={id} />
          </Left>
          <Right u={u} w={w} width={100}>
            <circle cx="46" cy="50" r="46" fill={`url(#${id}moon)`} />
            <g transform="translate(4 6) scale(3.1)"><FeastMiniature id="longest-night" plain size={28} /></g>
          </Right>
        </>
      )
      break
    }
    case 'midsummer': {
      const flies = Array.from({ length: 12 }, (_, i) => ({ x: w * (0.14 + ((i * 0.073 + (i % 3) * 0.031) % 0.72)), y: h * (0.5 + ((i * 17) % 40) / 100) }))
      art = (
        <>
          {flies.map((f, i) => (
            <g key={i} className="feast-firefly" style={{ animationDelay: `${-i * 0.7}s` }}>
              <circle cx={f.x} cy={f.y} r={6} fill={`url(#${id}fly)`} />
              <circle cx={f.x} cy={f.y} r={1.4} fill="#fff6c8" />
            </g>
          ))}
          <Left u={u}>
            <path d="M14 96 86 82M14 82l72 14" stroke="#4a2f18" strokeWidth="6" strokeLinecap="round" {...thin} />
            <circle cx="50" cy="56" r="44" fill={`url(#${id}glow)`} />
            <path className="feast-flicker" d="M50 18C62 34 76 44 72 64 70 78 60 88 50 88S28 80 27 64C26 48 40 40 44 26c4 10 2 18 8 22 2-10 0-20-2-30Z" fill={VERMILION} {...inked} />
            <path className="feast-flicker slow" d="M50 40C58 50 64 58 62 70 60 80 56 86 50 86s-12-6-12-16c0-8 6-12 8-20 2 6 4 10 6 10 0-4 0-6-2-10Z" fill="#f08a2a" />
            <path className="feast-flicker" d="M50 58c4 6 6 10 5 16-1 6-3 10-5 10s-5-4-5-10c0-4 3-8 5-16Z" fill="#ffe08a" />
            {[[30, 14], [70, 8], [58, 2], [40, 30], [80, 24]].map(([x, y]) => <circle key={x + y} cx={x} cy={y} r="1.6" fill="#ffd27a" />)}
          </Left>
          <Right u={u} w={w} width={100}>
            <g transform="translate(4 4) scale(3.3)"><FeastMiniature id="midsummer" size={28} /></g>
          </Right>
        </>
      )
      break
    }
    case 'birthday': {
      // A fanfare: a herald's trumpet sounding in from each end, a banner
      // hung from it — the years on one, whose day it is on the other — and
      // gold bursting from the bells.
      const age = festival.age ? roman(festival.age) : null
      const name = festival.self ? 'Dies Natalis' : (festival.person ?? 'Natalis')
      const left = age ?? (festival.self ? 'Tibi' : 'Natalis')
      art = (
        <>
          <Left u={u}><Herald id={id} /></Left>
          <Right u={u} w={w} width={220}><g transform="translate(220 0) scale(-1 1)"><Herald id={id} /></g></Right>
          <Left u={u}><BannerWords x={81} words={left} /></Left>
          <Right u={u} w={w} width={220}><BannerWords x={139} words={name} /></Right>
        </>
      )
      break
    }
    case 'anniversary': {
      art = (
        <>
          <Banderole w={w} h={h} words={`Anniversarium · ${roman(festival.nth ?? 1)}`} />
          <Left u={u}>
            <path d="M44 74C60 50 86 22 122 4 104 30 80 56 52 78Z" fill={VELLUM} {...inked} />
            <path d="M48 76C70 50 96 24 120 6" fill="none" stroke={gold} strokeWidth="1.2" {...thin} />
            {[60, 72, 84, 96].map((x, i) => <path key={x} d={`M${x} ${62 - i * 13}l${8 + i} ${2 + i}`} stroke="#b9ad92" strokeWidth="0.8" {...thin} />)}
            <ellipse cx="40" cy="90" rx="22" ry="7" fill="#1c1820" {...inked} />
            <path d="M18 90V76c0-6 44-6 44 0v14" fill="#1c1820" {...inked} />
            <ellipse cx="40" cy="76" rx="22" ry="6" fill={gold} {...inked} />
            <ellipse cx="40" cy="76" rx="12" ry="3" fill="#0c0a0e" />
          </Left>
          <Right u={u} w={w} width={100}>
            <path d="M38 70 30 100h8l4-8 4 8h8L46 70Z" fill={VERMILION} {...inked} />
            <g transform="translate(4 2) scale(3.25)"><FeastMiniature id="anniversary" nth={festival.nth} size={28} /></g>
          </Right>
        </>
      )
      break
    }
    default:
      return null
  }

  return (
    <svg className="feast-bar" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <defs>
        <Metals id={id} />
        <radialGradient id={`${id}glow`}>
          <stop offset="0" stopColor="#ffdb8a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffdb8a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}moon`}>
          <stop offset="0" stopColor="#d8d5f0" stopOpacity="0.3" />
          <stop offset="1" stopColor="#d8d5f0" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}fly`}>
          <stop offset="0" stopColor="#fff2a0" stopOpacity="0.8" />
          <stop offset="1" stopColor="#fff2a0" stopOpacity="0" />
        </radialGradient>
      </defs>
      {art}
    </svg>
  )
}
