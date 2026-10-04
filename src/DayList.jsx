import { memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  SLOTS_PER_DAY, MINUTES_PER_DAY, slotToTime, formatDuration, shiftDate, todayISO,
  daysBetween, formatDayHeading, formatShortDate, weekdayOf, dayOfWeek,
  paintSpans,
} from './time.js'
import { useMinute } from './useMinute.js'
import { useFirstDay } from './useFirstDay.js'
import { useBirthdays } from './useBirthdays.js'
import { Initial, Chronicle } from './scenes/ScriptParts.jsx'
import { illumination } from './scenes/manuscript.js'
import { MagicCircle, Moonweed, RankGem, rankTitle } from './scenes/StarParts.jsx'
import { monthByTag, isComplete } from './scenes/starlit.js'
import { festivalOf } from './scenes/festivals.js'
import { FestiveMark, Spider } from './scenes/Festive.jsx'
import { FeastHeading } from './scenes/HoursFeasts.jsx'
import { FeastGround, FeastBar } from './scenes/HoursFeastBars.jsx'
import { feastOf } from './scenes/hoursFeasts.js'
import { applyPaint, applyResize, layoutLanes, stripsOf, moveBlocks, clampShift, cutPartner } from './blocks.js'
import Tools, { selects } from './Tools.jsx'
import { pieceLook, runeSpans, RUNES_MIN_BAND, PEEK_MAX } from './blockLooks.js'
import { blockFace, Covers } from './face.js'
import { Appearance } from './appearance.js'
import { wordsFor } from './themeWords.js'
import TagIcon, { clampScale } from './TagIcon.jsx'

const pct = (slot) => (slot / SLOTS_PER_DAY) * 100

/**
 * Whether there is writing right under the pointer — the letters themselves,
 * not merely the box they sit in, so the space beside a heading still starts
 * a selection box and the heading's words can still be selected.
 */
function overText(x, y) {
  const node = document.caretRangeFromPoint?.(x, y)?.startContainer
  if (!node || node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) return false
  const whole = document.createRange()
  whole.selectNodeContents(node)
  return [...whole.getClientRects()].some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)
}
// How far the pointer may wander and still count as a click. Roughly a slot
// wide, so that letting go after a small slip opens the note rather than
// nudging the block ten minutes sideways.
const CLICK_SLOP_PX = 8
const CHUNK = 21 // days added each time you reach an end
const INITIAL = 70 // enough rows to fill the screen even at the smallest zoom
const EDGE_PX = 600 // how close to an end before more days load
const REPORT_MS = 150 // how often the days in view are said while scrolling
const BAND_GROW_MS = 40 // the next few days are built within five times this, idle or not

/** Zoom is the height of the bar itself. */
export const ZOOM = {
  day: { min: 46, max: 200, start: 88 },
  // Same look as Day view, but it can shrink far enough to scan months.
  compact: { min: 8, max: 120, start: 44 },
}

/**
 * Everything in a row that isn't the bar: heading, hour scale, chips, spacing.
 * Measured from the DOM rather than hardcoded, so changing the CSS can't
 * silently break the scroll arithmetic. These are first-paint guesses only.
 */
const CHROME_GUESS = { day: 160, compact: 4 }

const WIPE_CONFIRM_MS = 4000
// How near the top or bottom of the list a box being drawn, or blocks being
// carried, has to come before the list scrolls to follow — and how fast.
const SCROLL_EDGE_PX = 40
const SCROLL_MAX_PX = 22
const PREVIEW_ID = '__preview' // the block being painted, not yet committed

// How far a painted stretch may run past the day it started on. One, because
// the point of it is an activity that ran past midnight, and a drag that
// reaches further than the next bar is far more likely to be a slip than a
// day and a half of the same thing.
const PAINT_REACH_DAYS = 1

// How long a block's wipe-in runs for, from the CSS. A block older than
// this is settled, and dropping the animation from it is not something
// anyone can see.
const INK_MS = 600

const LABEL_PADDING = 16 // matches the label's horizontal padding in the CSS
// How much of a block's width an icon on its own may fill.
//
// A share rather than a number of pixels, so the air reads the same at every
// width. Two thirds: an icon taking four fifths of its block looks wedged
// into it, and the width only ever binds on a narrow block anyway — a wide
// one runs out of height long before it runs out of room at the sides.
const ICON_FILL = 0.66
// How far along its block a picture may drift and still count as being in the
// middle of it, and how far off the middle of what it stands on it may sit
// before it counts as stranded at an edge. Both are shares: of the block's
// length, and of the bar's height.
const MIDDLE_ENOUGH = 0.15
const STRANDED = 0.2
const ICON_GAP = 6
const ICON_MIN_PX = 11 // any smaller and it reads as a smudge, not a picture
const LABEL_MIN_LANE = 34 // a lane shorter than this has no room for a name
const ICON_GROWTH = 4 // the most an icon may outgrow its normal size
const ICON_OF_LANE = 0.44 // how much of the row's height an icon reaches for
const ICON_INSET = 6 // an icon stops short of the lane's edges rather than filling it
// An upright picture — a game's cover — is bounded by the block it sits in
// rather than by a size of its own.
//
// Above and below, by a share of the row rather than a number of pixels, so
// that it looks like the same margin however tall the bar is. Seven pixels
// reads as a margin on an eighty-pixel row and as a hairline on a
// two-hundred-pixel one. Held between a floor and a ceiling: a tenth of a
// thirty-pixel row is nothing at all, and a tenth of the tallest bar would
// start being more air than picture.
//
// The floor has to clear the block's rounded corners and the bar's own inset
// with something to spare, or a cover in a half-height row is drawn across
// the very corner of the block it belongs to.
const COVER_GAP_SHARE = 0.1
const COVER_GAP_MIN = 8
const COVER_GAP_MAX = 22
// Either side, by a fixed distance. What a cover sits next to sideways is the
// end of its block and then whatever is next along, and none of that changes
// with the height of the bar.
const COVER_SIDE_ROOM = 14

/**
 * Width of a string in the label font, measured once per string. The font is
 * read from the type tokens so this stays honest if they change.
 */
const widths = new Map()
let labelFont = null
let measureCtx = null
let iconBase = null

/** The size a tag icon is normally drawn at, read from the tokens. */
/**
 * Everything measured off the page's styles is only true of the theme it was
 * measured in: a name in a monospace face is wider than the same name in a
 * serif. So the moment the page is wearing another one, it is all forgotten.
 */
let measuredIn
function sameTheme() {
  const theme = document.documentElement.dataset.theme ?? ''
  if (theme === measuredIn) return
  measuredIn = theme
  iconBase = null
  labelFont = null
  widths.clear()
}

function baseIconPx() {
  sameTheme()
  if (iconBase === null) {
    const token = getComputedStyle(document.documentElement).getPropertyValue('--tagicon-size')
    iconBase = parseFloat(token) || 16
  }
  return iconBase
}

function textWidth(text) {
  sameTheme()
  if (labelFont === null) {
    const root = getComputedStyle(document.documentElement)
    labelFont = [
      root.getPropertyValue('--w-medium').trim(),
      root.getPropertyValue('--f-md').trim(),
      root.getPropertyValue('--font-ui').trim(),
    ].join(' ')
  }
  if (!widths.has(text)) {
    measureCtx ??= document.createElement('canvas').getContext('2d')
    measureCtx.font = labelFont
    widths.set(text, measureCtx.measureText(text).width)
  }
  return widths.get(text)
}

/**
 * The outline of what can actually be seen of a block.
 *
 * Both edges move. The top steps up where the block rises to fill the strip
 * along the ceiling, and the bottom stops short wherever something painted
 * over it begins. Outlining the block's full rectangle instead would draw a
 * box straight through whatever is sitting on it, which reads as selecting
 * both.
 *
 * So the block's span is cut at every point either edge changes, and the
 * outline traces the tops left to right and the bottoms back again.
 */
function silhouette(mine, pieces) {
  const steps = stripsOf(mine, pieces)
  const x = (slot) => (slot / SLOTS_PER_DAY) * 100
  const points = []
  for (const s of steps) points.push(`${x(s.from)},${s.top * 100}`, `${x(s.to)},${s.top * 100}`)
  for (const s of [...steps].reverse()) {
    points.push(`${x(s.to)},${s.bottom * 100}`, `${x(s.from)},${s.bottom * 100}`)
  }
  return points.join(' ')
}

/**
 * Where a block's name goes, and the rectangle it gets to itself there.
 *
 * Every run of touching strips is a candidate, along with the band all of
 * them have in common — a name may sit across a run like that without ever
 * leaving its block, so the two hours of music broken up by a walk are still
 * one place to write "Music". Each run is offered twice: as itself, and
 * trimmed to the widest stretch of it that is centred on the block's middle.
 *
 * Then, in order:
 *
 * A name beats no name. A block with room for one somewhere should say what
 * it is, and a bare picture in a slightly better spot says less.
 *
 * A cover goes where there is the most room for it. It is a picture of the
 * thing itself, it says more the bigger it is, and half a bar of it beside a
 * neighbour is worth less than a whole bar of it in the clear.
 *
 * An icon stays in the middle. It is a symbol, it stops saying anything more
 * past a certain size, and moving it off the middle of its own block to buy
 * a few pixels would be a bad trade. Anything within a twentieth of the
 * block's length of the middle counts as the middle, so where two places are
 * both centred the roomier one wins — which is the whole of what fixes a
 * picture squeezed by a neighbour that only covers part of the block.
 */
function bandFor(mine, middle, tag, fallback, barHeight, trackWidth, pieces, withNames = true) {
  const pxOf = (slots) => (slots / SLOTS_PER_DAY) * trackWidth
  const inSlots = (px) => (px / Math.max(1, trackWidth)) * SLOTS_PER_DAY
  const strips = stripsOf(mine, pieces)

  const measure = (top, bottom, from, to) => {
    const label = fitLabel(tag, fallback, pxOf(to - from), barHeight * (bottom - top), withNames)
    return label
      ? { label, top, bottom, from, to, off: Math.abs((from + to) / 2 - middle) }
      : null
  }

  const tries = []
  for (let i = 0; i < strips.length; i++) {
    let top = 0
    let bottom = 1
    for (let j = i; j < strips.length; j++) {
      if (j > i && strips[j].from !== strips[j - 1].to) break
      top = Math.max(top, strips[j].top)
      bottom = Math.min(bottom, strips[j].bottom)
      if (bottom <= top) break
      const from = strips[i].from
      const to = strips[j].to
      tries.push(measure(top, bottom, from, to))
      // Truly centred: the widest stretch of this run that has the middle of
      // the block at its own middle. Nearly every block is one run, and then
      // this is simply the block.
      const room = 2 * Math.min(middle - from, to - middle)
      if (room > 0) tries.push(measure(top, bottom, middle - room / 2, middle + room / 2))
    }
  }

  const found = tries.filter(Boolean)
  if (found.length === 0) return null

  const block = mine[0].block
  const span = block.endSlot - block.startSlot
  // How far off the middle of its block, as a share of the block's length —
  // and near enough is the middle. A picture that has drifted a tenth of the
  // way along has not drifted anywhere anyone would notice, and refusing it
  // the room it could have there would be pedantry.
  const centred = (f) => (f.off <= span * MIDDLE_ENOUGH ? 0 : Math.round((f.off / span) * 20))

  // Whether the picture is stranded near an edge of its own block.
  //
  // A picture centred in its band still reads as pushed against an edge when
  // the block carries on past that band underneath it. Forty minutes of
  // Youtube with ten minutes of it under a game is drawn as one band, the
  // lower half — and the picture ends up along the bottom of a block that is
  // full height for three quarters of its width, with nothing above it.
  //
  // Measured over the picture's own width, so a step somewhere else along the
  // block is not this picture's problem, and only past a fifth of the bar: a
  // picture that half stands on a neighbour and half doesn't is sitting where
  // it should, between the two.
  const adrift = (f) => {
    const wide = inSlots(f.label.iconPx)
    const at = (f.from + f.to) / 2
    let width = 0
    let middle = 0
    for (const s of strips) {
      const w = Math.min(s.to, at + wide / 2) - Math.max(s.from, at - wide / 2)
      if (w <= 0) continue
      width += w
      middle += w * (s.top + s.bottom) / 2
    }
    if (width === 0) return 0
    return Math.abs((f.top + f.bottom) / 2 - middle / width) > STRANDED ? 1 : 0
  }

  const upright = tag?.aspect > 0 && tag.aspect < 1
  // A name beats no name — for an icon. A cover is the exception: it is a
  // picture of the thing itself and says more than its name ever will, so it
  // takes the room over the words rather than sitting small beside them.
  const named = found.filter((f) => f.label.mode === 'full')
  const order = upright
    ? (a, b) => b.label.iconPx - a.label.iconPx
      || (b.label.mode === 'full') - (a.label.mode === 'full')
      || a.off - b.off
    : (a, b) => adrift(a) - adrift(b)
      || centred(a) - centred(b)
      || b.label.iconPx - a.label.iconPx
      || (b.bottom - b.top) - (a.bottom - a.top)
      || a.off - b.off
  return [...(!upright && named.length > 0 ? named : found)].sort(order)[0]
}

/**
 * How to draw a block's label: how much of it fits, and how big to draw the
 * icon. Returns { mode: 'full' | 'icon', iconPx }, or nothing at all when even
 * an icon would be a smudge.
 *
 * The icon is sized to the room available rather than fixed, and grows with
 * the height of the row. It never gives that height back to make room for the
 * name: a small icon beside a name reads worse than a big icon on its own, so
 * when both won't fit at full size the name is what goes.
 *
 * The two want different things from the lane. A name needs one tall enough to
 * read it in; an icon only needs one it fits inside. So a lane too short for a
 * name still carries an icon, and only when the icon itself no longer fits is
 * the block left bare.
 *
 * A custom image is square; an emoji is text, so its width has to be measured
 * and scales with the size it is drawn at; a game's cover is upright, and is
 * the one of the three that is bounded by the block rather than by a size.
 */
function fitLabel(tag, fallback, widthPx, lanePx, withNames = true) {
  const room = widthPx - LABEL_PADDING
  const named = lanePx >= LABEL_MIN_LANE
  if (!tag) {
    if (!named) return null
    const width = textWidth(fallback)
    return width <= room ? { mode: 'full', iconPx: 0, width } : null
  }

  const iconPx = baseIconPx()
  const base = iconPx * clampScale(tag.iconScale)
  // How wide the picture comes out per unit of height. Everything below is
  // reasoned in heights, since that is what the lane limits, and this is the
  // one number that turns a height back into the room it takes up.
  const aspect = tag.image
    ? (tag.aspect > 0 ? tag.aspect : 1)
    : (textWidth(tag.icon) || iconPx) / iconPx
  // The tallest icon that fits a given width, and how wide one of a given
  // height comes out.
  const sizeFor = (width) => width / aspect
  const widthAt = (px) => px * aspect

  const upright = aspect < 1
  // What is left of the block's width once the picture has been given room to
  // stand clear of its edges.
  const sideways = upright ? widthPx - COVER_SIDE_ROOM : widthPx * ICON_FILL

  // How tall it would like to be.
  //
  // An icon is a symbol: it grows with the row, but only to a share of it and
  // never past four times its normal size, because past a certain size a
  // symbol stops saying any more than it already did.
  //
  // A cover is a picture, and does say more the bigger it is, so nothing caps
  // it but the block — it fills the row bar its margin.
  const gap = Math.min(COVER_GAP_MAX, Math.max(COVER_GAP_MIN, lanePx * COVER_GAP_SHARE))
  const reach = upright
    ? lanePx - 2 * gap
    : Math.min(
      base * ICON_GROWTH,
      Math.max(base, lanePx * ICON_OF_LANE),
      Math.max(0, lanePx - ICON_INSET),
    )

  // What the block is wide enough to hold. Whichever of height and width runs
  // out first is what stops it, which on a short block is the width and on a
  // tall row is the height.
  //
  // The width only ever holds it back from growing, and never shrinks it
  // below its normal size: a narrow block keeps its picture, which is the
  // whole reason one is drawn without a name.
  const wanted = Math.min(reach, Math.max(base, sizeFor(sideways)))
  // Never insist on more than the tag asked for: a deliberately small icon
  // shouldn't be dropped for being small. Measured against what the tag asks
  // for rather than what the lane allows, or a lane too short for anything
  // readable would let a smudge through.
  const floor = Math.min(ICON_MIN_PX, base)

  // "Icon only" in the settings: a name is never put beside the picture,
  // however much room there is for one.
  const withName = widthAt(wanted) + ICON_GAP + textWidth(tag.name)
  if (withNames && named && withName <= room) {
    return { mode: 'full', iconPx: wanted, width: withName }
  }

  // Only now does the icon give any ground, and only because at this width
  // there is nothing else to give. A picture with no name beside it may fill
  // the block right up to the share it is allowed — the room a cover keeps
  // clear at its sides is room for a name, and there is no name here.
  const alone = Math.min(wanted, sizeFor(widthPx * ICON_FILL))
  return alone >= floor ? { mode: 'icon', iconPx: alone, width: widthAt(alone) } : null
}

/**
 * Where you are in the day, drawn on today's bar.
 *
 * It keeps its own clock rather than taking the time as a prop, so the minute
 * turning over re-renders this one line instead of every day in the list —
 * there can be several hundred of those, and none of the rest of them have
 * changed.
 */
function NowLine({ date }) {
  const minute = useMinute()
  // Past midnight this is yesterday's row, and the mark belongs on the new
  // day rather than back at the start of this one.
  if (date !== todayISO()) return null
  return <i className="nowline" style={{ left: `${(minute / MINUTES_PER_DAY) * 100}%` }} />
}

/**
 * Hearthfire only: the part of today that has already burned. It sits under
 * the blocks, so what shows of it is exactly the time that went by with
 * nothing logged — the hours you missed, gone to ash.
 */
function Burnt({ date }) {
  const minute = useMinute()
  if (date !== todayISO()) return null
  return <i className="burnt" style={{ width: `${(minute / MINUTES_PER_DAY) * 100}%` }} />
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L12 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.6 6.6v4.6M9.4 6.6v4.6" strokeLinecap="round" />
    </svg>
  )
}

function DayList({
  mode, // 'day' (editable) | 'compact' (read-only)
  days,
  tags,
  ensure,
  armed, // { date, tag } | null
  onArm,
  selected, // { date, id } | null
  barHeight,
  onZoom,
  onPaint,
  onResize,
  onSelect,
  onPickDay,
  onWipeDay,
  onVisibleRange,
  jumpTo,
  onJumped,
  find,
  period,
  tool = 'move', // 'move' | 'snip' — see Tools.jsx
  onTool,
  picked, // [{ date, id }] gathered up by the select tool
  onPick,
  onSnip,
  onMoveMany,
  hoverRef, // where the pointer is over the bars, for a paste to land there
}) {
  const today = todayISO()
  const scrollRef = useRef(null)
  const isDay = mode === 'day'
  // Below this the insets and gridlines are more noise than information.
  const dense = barHeight < 26

  // Chrome is whatever a row measures minus its bar. It doesn't change with
  // zoom, so measuring it once per view keeps every row a known height.
  const firstRowRef = useRef(null)
  const [chrome, setChrome] = useState({ mode, value: CHROME_GUESS[mode], measured: false })
  const rowTotal = barHeight + chrome.value
  // Not just "matches this view" — it must be a real measurement, or the
  // first scroll is computed from a guess and lands on the wrong day.
  const chromeReady = chrome.mode === mode && chrome.measured

  useLayoutEffect(() => {
    const row = firstRowRef.current
    const track = row?.querySelector('.track')
    if (!row || !track) return
    const value = row.getBoundingClientRect().height - track.getBoundingClientRect().height
    if (value > 0 && (!chromeReady || Math.abs(value - chrome.value) > 0.5)) {
      // The rows are changing height under whatever is on screen: the tag
      // boxes arriving just after the first measure, say, or wrapping onto
      // another line as the window narrows. Every row above the one at the
      // top grows with it, so without this the list opened about ten days
      // before today. Hold the day at the top where it is instead.
      const el = scrollRef.current
      if (chromeReady && el && didInitialScroll.current && !pendingAnchor.current) {
        const was = rowTotal
        const index = Math.max(0, Math.floor(el.scrollTop / was))
        const date = datesRef.current[index]
        if (date) {
          pendingAnchor.current = { date, offset: ((el.scrollTop - index * was) / was) * (barHeight + value) }
        }
      }
      setChrome({ mode, value, measured: true })
    }
  })

  const [range, setRange] = useState(() => ({
    start: shiftDate(today, -INITIAL),
    end: shiftDate(today, INITIAL),
  }))

  const dates = []
  for (let d = range.start; d <= range.end; d = shiftDate(d, 1)) dates.push(d)

  const datesRef = useRef(dates)
  datesRef.current = dates

  /**
   * Which blocks have already wiped themselves in, and when.
   *
   * A block wipes in when it arrives — painted, or the day it belongs to
   * being read for the first time. It should not do it again for anything
   * else, and until now it did: a block cut around an overlap is several
   * elements, and dragging one block's edge changes how many pieces its
   * neighbours are cut into. Every piece that appears is a new element, and a
   * new element plays whatever it plays on arrival. So a neighbour nobody
   * touched wiped itself in again, in the middle of a drag, for no reason
   * anyone watching could see.
   *
   * Remembered per block rather than per piece, and the time is kept rather
   * than a flag: a redraw a tenth of a second after a block appears must not
   * take the animation off it half way through. Once the wipe is over,
   * dropping it changes nothing on screen.
   *
   * Filled in after the frame is on screen, so the frame a block arrives on
   * is the one that animates.
   */
  const inked = useRef(new Map())
  const wiping = useCallback((date, block) => {
    const at = inked.current.get(`${date}:${block.id}`)
    return at === undefined || performance.now() - at < INK_MS
  }, [])
  useEffect(() => {
    const now = performance.now()
    for (const date of dates) {
      for (const b of days[date]?.blocks ?? []) {
        if (!inked.current.has(`${date}:${b.id}`)) inked.current.set(`${date}:${b.id}`, now)
      }
    }
  })

  const rowTotalRef = useRef(rowTotal)
  rowTotalRef.current = rowTotal

  // --- only the days near the screen are built ---------------------------
  // Hundreds of days are loaded, and a few dozen are ever in view. Building
  // every one of them whenever the rows changed shape — a step of zoom,
  // opening the Overview — took a tenth of a second at a time. So the days
  // are built as a band around the screen, and the rest are empty room of
  // exactly their height, so every position worked out from the row height
  // still lands where it did.
  //
  // When the rows change shape, only what is on screen is built straight
  // away. The band then grows outward a few rows at a time while nothing else
  // is happening, until it reaches several screens either way — so that by
  // the time you scroll, the days are already there, and scrolling builds
  // nothing. Building as you scroll instead dropped frames.
  //
  // The band is kept as dates, not as places in the list: weeks loading in
  // above the screen move every place down, and a band kept by place would
  // throw away the days it had built and build as many again.
  const [band, setBand] = useState({ from: null, to: null, mode, rowTotal: 0 })
  const bandRef = useRef(band)
  bandRef.current = band
  /** The band as places in the list as it is now; -1 where it has gone. */
  const bandAt = (b) => ({ first: datesRef.current.indexOf(b.from), last: datesRef.current.indexOf(b.to) })
  const bandOf = (first, last, h) => ({
    from: datesRef.current[first], to: datesRef.current[last], mode: modeRef.current, rowTotal: h,
  })
  /** Where the screen is in the list, and how far the band reaches round it. */
  const bandView = () => {
    const el = scrollRef.current
    const h = rowTotalRef.current
    const count = datesRef.current.length
    if (!el || count === 0) return null
    const screen = Math.max(1, Math.ceil(el.clientHeight / h))
    const top = Math.min(count - 1, Math.max(0, Math.floor(el.scrollTop / h)))
    const day = modeRef.current === 'day'
    return {
      h, count, top,
      bottom: Math.min(count - 1, top + screen),
      // Built straight away: a little past the screen.
      near: day ? 1 : Math.ceil(screen / 2),
      // Grown to, a few rows at a time. The Overview's rows are small enough
      // that every day loaded can be built, so scrolling it builds nothing.
      far: day ? 2 * screen + 2 : count,
    }
  }
  const placeBand = useCallback(() => {
    const at = bandView()
    if (!at) return
    const { h, count, top, bottom, near, far } = at
    const was = bandAt(bandRef.current)
    const fresh = bandRef.current.mode !== modeRef.current || bandRef.current.rowTotal !== h
      || was.first < 0 || was.last < 0
    const want = { first: Math.max(0, top - near), last: Math.min(count - 1, bottom + near) }
    if (!fresh && was.first <= want.first && was.last >= want.last) return
    // Moving on: what is built is kept where it joins what is needed, so
    // scrolling back finds it still there; otherwise start again from here.
    const joins = !fresh && was.last >= want.first - 1 && was.first <= want.last + 1
    const next = joins
      ? {
        first: Math.max(Math.min(was.first, want.first), top - far),
        last: Math.min(Math.max(was.last, want.last), bottom + far),
      }
      : want
    setBand(bandOf(next.first, next.last, h))
  }, [])
  // The growing, a step at a time whenever the page has a moment to spare —
  // scrolling included, since the graphics card does the scrolling and the
  // page is mostly idle meanwhile. One step waits at a time.
  const growing = useRef(null)
  useEffect(() => () => cancelIdleCallback(growing.current), [])
  useEffect(() => {
    if (growing.current) return
    growing.current = requestIdleCallback(() => {
      growing.current = null
      const at = bandView()
      if (!at || bandRef.current.mode !== modeRef.current || bandRef.current.rowTotal !== at.h) return
      const was = bandAt(bandRef.current)
      if (was.first < 0 || was.last < 0) return
      const target = { first: Math.max(0, at.top - at.far), last: Math.min(at.count - 1, at.bottom + at.far) }
      if (was.first <= target.first && was.last >= target.last) return
      const step = modeRef.current === 'day' ? 2 : 12
      setBand(bandOf(
        Math.max(target.first, Math.min(was.first, was.first - step)),
        Math.min(target.last, Math.max(was.last, was.last + step)),
        at.h,
      ))
    }, { timeout: BAND_GROW_MS * 5 })
  })

  useEffect(() => { ensure(range.start, range.end) }, [range.start, range.end, ensure])

  // --- keeping your place while the list grows or the rows resize --------
  const didInitialScroll = useRef(false)
  // Each view keeps its own place. Scrolling back through the Overview
  // shouldn't drag the Day view along with it, so switching between them
  // returns to wherever that view was left.
  const topDates = useRef({ day: today, compact: today })
  const lastMode = useRef(mode)
  // handleScroll is memoised, so it reads the view from here rather than
  // from a closure that was made several views ago.
  const modeRef = useRef(mode)
  modeRef.current = mode

  /**
   * Every correction says "put this date back where it was", never "shift by
   * N pixels". That makes them idempotent, so loading more days, switching
   * view and zooming can all land on the same frame without fighting.
   */
  const pendingAnchor = useRef(null)

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return

    if (lastMode.current !== mode) {
      lastMode.current = mode
      pendingAnchor.current = { date: topDates.current[mode], offset: 0 }
    }

    const anchor = pendingAnchor.current
    if (!anchor) return
    // rowTotal is still a guess for this view; wait for the real measurement
    // rather than scrolling to a position computed from the wrong height.
    if (!chromeReady) return

    const i = dates.indexOf(anchor.date)
    if (i < 0) {
      // The day this view was left on isn't loaded any more — jumping to a
      // date in the other view moves the window. Load around it and let this
      // run again; the anchor stays pending until it lands.
      setRange({ start: shiftDate(anchor.date, -INITIAL), end: shiftDate(anchor.date, INITIAL) })
      return
    }
    pendingAnchor.current = null
    el.scrollTop = anchor.cursorY == null
      ? i * rowTotal + anchor.offset
      : (i + anchor.frac) * rowTotal - anchor.cursorY
  }, [range.start, dates.length, rowTotal, mode, chromeReady])

  // Short rows can leave the loaded window shorter than the viewport, which
  // means nothing to scroll. Keep at least two screens' worth loaded.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || dates.length > 800) return
    if (el.scrollHeight >= el.clientHeight * 2) return
    pendingAnchor.current = { date: topDates.current[mode], offset: 0 }
    setRange((r) => ({ start: shiftDate(r.start, -CHUNK), end: shiftDate(r.end, CHUNK) }))
  }, [dates.length, rowTotal])

  // Open with today at the top: the past above, the future below.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || didInitialScroll.current || dates.length === 0 || !chromeReady) return
    const i = dates.indexOf(today)
    if (i < 0) return
    el.scrollTop = i * rowTotal
    topDates.current[mode] = today
    didInitialScroll.current = true
  }, [dates, rowTotal, today, chromeReady])

  // Which days are actually on screen, for the date in the header (and
  // Tidewater's water). Said at most every REPORT_MS while scrolling: each
  // time it is said the whole app redraws, and in the Overview, where a row
  // is a few pixels tall, the days in view change on almost every frame.
  const reportedRange = useRef('')
  const reportTimer = useRef(null)
  const lastReport = useRef(0)
  useEffect(() => () => clearTimeout(reportTimer.current), [])
  const reportVisible = useCallback(() => {
    if (reportTimer.current) return
    const wait = Math.max(0, REPORT_MS - (performance.now() - lastReport.current))
    reportTimer.current = setTimeout(() => {
      reportTimer.current = null
      lastReport.current = performance.now()
      reportNowRef.current()
    }, wait)
  }, [])
  const reportNow = useCallback(() => {
    const el = scrollRef.current
    if (!el || !onVisibleRange) return
    const h = rowTotalRef.current
    const list = datesRef.current
    const first = Math.max(0, Math.floor(el.scrollTop / h))
    const last = Math.min(list.length - 1, Math.ceil((el.scrollTop + el.clientHeight) / h) - 1)
    if (last < first) return

    const range = { from: list[first], to: list[last] }
    const key = `${range.from}|${range.to}`
    if (key === reportedRange.current) return
    reportedRange.current = key
    onVisibleRange(range)
  }, [onVisibleRange])
  const reportNowRef = useRef(reportNow)
  reportNowRef.current = reportNow

  useEffect(reportVisible)

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    reportVisible()
    placeBand()

    const h = rowTotalRef.current
    const index = Math.max(0, Math.floor(el.scrollTop / h))
    // Mid-correction the scroll position isn't a truthful answer to
    // "which day are you looking at", so don't record it.
    const atTop = datesRef.current[index]
    if (atTop && !pendingAnchor.current) topDates.current[modeRef.current] = atTop

    if (el.scrollTop < EDGE_PX) {
      if (atTop) pendingAnchor.current = { date: atTop, offset: el.scrollTop - index * h }
      setRange((r) => ({ ...r, start: shiftDate(r.start, -CHUNK) }))
    } else if (el.scrollHeight - el.scrollTop - el.clientHeight < EDGE_PX) {
      setRange((r) => ({ ...r, end: shiftDate(r.end, CHUNK) }))
    }
  }, [reportVisible, placeBand])

  // --- ctrl+scroll zoom, anchored on whatever is under the cursor --------
  // What the wheel handler needs, kept current without setting it up again:
  // it is set up once, and only listens while Ctrl is held.
  const zoomState = useRef(null)
  zoomState.current = { barHeight, rowTotal, mode, onZoom }
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return undefined

    // Non-passive, so the browser doesn't zoom the whole page instead.
    const onWheel = (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const { barHeight: height, rowTotal: stride, mode: view, onZoom: zoom } = zoomState.current

      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      const limits = ZOOM[view]
      const next = Math.round(Math.min(limits.max, Math.max(limits.min, height * factor)))
      if (next === height) return

      const rect = el.getBoundingClientRect()
      const cursorY = e.clientY - rect.top
      const position = (el.scrollTop + cursorY) / stride
      const index = Math.min(datesRef.current.length - 1, Math.max(0, Math.floor(position)))

      pendingAnchor.current = {
        date: datesRef.current[index],
        frac: position - Math.floor(position),
        cursorY,
      }
      zoom(next)
    }

    // Only listened for while Ctrl is held. A wheel listener that can stop the
    // scroll makes the browser ask it first about every turn of the wheel, so
    // with one always there, scrolling waited on the app every step of the
    // way. Without one, scrolling is the graphics card's alone.
    let listening = false
    const listen = (on) => {
      if (on === listening) return
      listening = on
      if (on) el.addEventListener('wheel', onWheel, { passive: false })
      else el.removeEventListener('wheel', onWheel)
    }
    const onKey = (e) => listen(e.ctrlKey || e.metaKey)
    const onBlur = () => listen(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      listen(false)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // Pixel width of a bar. Labels need it to decide whether the tag name fits,
  // and every block is placed on it — so it is measured before the frame is
  // painted rather than after. Measuring afterwards would show one frame of
  // blocks laid out against the width of whichever view was on screen last.
  const [trackWidth, setTrackWidth] = useState(0)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => {
      const t = el.querySelector('.track')
      if (t) setTrackWidth((w) => (Math.abs(w - t.clientWidth) > 1 ? t.clientWidth : w))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [mode])

  /**
   * Where a slot boundary falls, as a whole pixel.
   *
   * Two blocks that meet share a slot, but as percentages they do not share a
   * number: one block's right edge is worked out as its left plus its width,
   * while its neighbour's left edge is worked out on its own. Land that shared
   * boundary on half a pixel and the two roundings can disagree, leaving a
   * one-pixel crack between blocks that are supposed to be touching — and at
   * every hour there is a gridline sitting directly behind the crack, which is
   * what shows through it.
   *
   * Both edges are the same slot, so here they are the same number, and there
   * is nothing left for anything to show through. Until the bar has been
   * measured there is no pixel to snap to, so percentages stand in — one frame
   * of the old behaviour beats one frame of no blocks at all.
   */
  const xAt = (slot) => Math.round((slot / SLOTS_PER_DAY) * trackWidth)
  const edgeAt = (slot) => (trackWidth ? `${xAt(slot)}px` : `${pct(slot)}%`)
  const spanAt = (from, to) => (trackWidth
    ? { left: `${xAt(from)}px`, width: `${xAt(to) - xAt(from)}px` }
    : { left: `${pct(from)}%`, width: `${pct(to - from)}%` })

  /**
   * Which blocks the find bar has lit, and which of them it is standing on.
   *
   * Keyed by what a block *is* — its times, its tag, and what was played or
   * watched — rather than by its id. The ids are minted when a day is read
   * into the app and mean nothing to the vault the search actually read, and
   * two blocks that agree on all of that are the same block by any test the
   * app has.
   */
  const found = new Map()
  for (const [at, hit] of (find?.hits ?? []).entries()) {
    const onDay = found.get(hit.date) ?? new Map()
    onDay.set(`${hit.start}|${hit.end}|${hit.tag}|${hit.game}|${hit.show}`, at)
    found.set(hit.date, onDay)
  }
  const searching = (find?.hits.length ?? 0) > 0
  /** Whether a day is in the stretch the ledger beside the Overview is adding up. */
  const inPeriod = (date) => !isDay && !!period && date >= period.from && date <= period.to
  const markOf = (date, b) => found.get(date)?.get(
    `${slotToTime(b.startSlot)}|${slotToTime(b.endSlot)}|${b.tag}|${b.game ?? ''}|${b.show ?? ''}`,
  )
  /** '', ' hit', or ' hit current' — what a search has to say about a block. */
  const litFor = (date, b) => {
    const at = markOf(date, b)
    return at === undefined ? '' : at === find.at ? ' hit current' : ' hit'
  }

  // --- the paint / resize / click gesture --------------------------------
  const [drag, setDrag] = useState(null)
  const dragRef = useRef(null)
  const handlers = useRef({})
  handlers.current = { onPaint, onResize, onSelect, onPickDay, onSnip, onPick, onMoveMany }
  const pickedRef = useRef(picked)
  pickedRef.current = picked ?? []

  // The snip tool's line: which block it is over, and where it would cut.
  const [snipHover, setSnipHover] = useState(null) // { date, id, slot }
  const snipRef = useRef(snipHover)
  snipRef.current = snipHover
  useEffect(() => { if (tool !== 'snip' || !isDay) setSnipHover(null) }, [tool, isDay])

  function setDragState(next) {
    dragRef.current = next
    setDrag(next)
  }

  function cellFrom(trackEl, clientX) {
    const rect = trackEl.getBoundingClientRect()
    const cell = Math.floor(((clientX - rect.left) / rect.width) * SLOTS_PER_DAY)
    return Math.min(SLOTS_PER_DAY - 1, Math.max(0, cell))
  }

  /**
   * Which lane a new block should take, from how far down the bar the pointer
   * went. The bar is split into one band per block already there, plus one:
   * with a single block that means the top half puts the new one above it and
   * the bottom half below, and aiming at the seam between two blocks slots the
   * new one in between them. Decided once, when the drag starts — dragging
   * sideways over more blocks must not shuffle it.
   */
  function laneFrom(trackEl, clientY, blocks, cell) {
    const rect = trackEl.getBoundingClientRect()
    const bands = blocks.filter((b) => b.startSlot <= cell && b.endSlot > cell).length + 1
    const band = Math.floor(((clientY - rect.top) / rect.height) * bands)
    return Math.min(bands - 1, Math.max(0, band))
  }

  /**
   * Which lane a block being slid is asking for.
   *
   * Measured from where it was picked up, not from where the pointer is in
   * the bar. A block is drawn from its lane down to the floor, so grabbing a
   * top-lane block near its bottom edge puts the pointer in the band below
   * it — read absolutely, sliding it sideways would shove it down a lane it
   * was never asked to leave. Moving up or down by one lane's worth of height
   * moves it one lane, and holding still leaves it alone.
   */
  function laneWhileSliding(trackEl, clientY, d, cell) {
    const rect = trackEl.getBoundingClientRect()
    const bands = d.others.filter((b) => b.startSlot <= cell && b.endSlot > cell).length + 1
    const by = (clientY - rect.top) / rect.height - d.grabY
    return Math.min(bands - 1, Math.max(0, d.wasLane + Math.round(by * bands)))
  }

  function boundaryFrom(trackEl, clientX) {
    const rect = trackEl.getBoundingClientRect()
    const slot = Math.round(((clientX - rect.left) / rect.width) * SLOTS_PER_DAY)
    return Math.min(SLOTS_PER_DAY, Math.max(0, slot))
  }

  /**
   * Where the snip tool would cut, from where the pointer is: the ten-minute
   * mark nearest to it inside the block it is over, never either end. Null
   * off a block, or on one ten minutes long, which has nowhere to cut.
   */
  function snipFrom(e) {
    const trackEl = e.target.closest?.('[data-track-date]')
    const blockEl = e.target.closest?.('[data-block-id]')
    if (!trackEl || !blockEl) return null
    const date = trackEl.dataset.trackDate
    if (days[date]?.malformed) return null
    const block = days[date]?.blocks.find((b) => b.id === blockEl.dataset.blockId)
    if (!block || block.endSlot - block.startSlot < 2) return null
    const slot = Math.min(block.endSlot - 1, Math.max(block.startSlot + 1, boundaryFrom(trackEl, e.clientX)))
    return { date, id: block.id, slot }
  }

  function handlePointerMove(e) {
    if (hoverRef) {
      const trackEl = isDay && e.target.closest?.('[data-track-date]')
      hoverRef.current = trackEl
        ? { date: trackEl.dataset.trackDate, slot: cellFrom(trackEl, e.clientX) }
        : null
    }
    if (tool === 'snip' && isDay && !dragRef.current) {
      const next = snipFrom(e)
      const was = snipRef.current
      if (next?.date !== was?.date || next?.id !== was?.id || next?.slot !== was?.slot) setSnipHover(next)
    }
  }

  function handlePointerLeave() {
    if (hoverRef) hoverRef.current = null
    if (snipRef.current) setSnipHover(null)
  }

  /**
   * Start drawing a box. Where it starts is kept in the list's own terms —
   * scrolled distance included — so the corner stays on the day it was put
   * down on while the list scrolls under it. Holding shift or ctrl adds to
   * what is already gathered up; otherwise a box starts afresh.
   */
  function startMarquee(e) {
    e.preventDefault()
    const el = scrollRef.current
    const rect = el.getBoundingClientRect()
    const adding = e.shiftKey || e.ctrlKey || e.metaKey
    if (!adding && pickedRef.current.length > 0) handlers.current.onPick([])
    setDragState({
      mode: 'marquee',
      x0: e.clientX - rect.left,
      y0: e.clientY - rect.top + el.scrollTop,
      originX: e.clientX,
      originY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      base: adding ? pickedRef.current : [],
      moved: false,
    })
  }

  /** The box on screen, in the window's own coordinates. */
  function marqueeBox(d) {
    const el = scrollRef.current
    const rect = el.getBoundingClientRect()
    const ax = rect.left + d.x0
    const ay = rect.top + d.y0 - el.scrollTop
    return {
      left: Math.min(ax, d.x),
      right: Math.max(ax, d.x),
      top: Math.max(rect.top, Math.min(ay, d.y)),
      bottom: Math.min(rect.bottom, Math.max(ay, d.y)),
    }
  }

  /**
   * Every block the box touches, on every day it reaches. Asked of the
   * blocks as drawn, so whatever can be seen of a block is what can be caught.
   */
  const pickKey = useRef('')
  function gatherIn(d) {
    const el = scrollRef.current
    const box = marqueeBox(d)
    const top = d.y0 + el.getBoundingClientRect().top - el.scrollTop
    const hits = new Map(d.base.map((p) => [`${p.date}|${p.id}`, p]))
    for (const blockEl of el.querySelectorAll('[data-track-date] .block[data-block-id]')) {
      const r = blockEl.getBoundingClientRect()
      // Measured against the whole box rather than the part on screen, so a
      // block scrolled out of sight stays caught.
      const boxTop = Math.min(top, d.y)
      const boxBottom = Math.max(top, d.y)
      if (r.right < box.left || r.left > box.right || r.bottom < boxTop || r.top > boxBottom) continue
      const date = blockEl.closest('[data-track-date]').dataset.trackDate
      hits.set(`${date}|${blockEl.dataset.blockId}`, { date, id: blockEl.dataset.blockId })
    }
    const list = [...hits.values()]
    const key = [...hits.keys()].sort().join(',')
    if (key !== pickKey.current) {
      pickKey.current = key
      handlers.current.onPick(list)
    }
  }

  function handlePointerDown(e) {
    if (e.button !== 0) return

    const trackEl = e.target.closest?.('[data-track-date]')
    if (!trackEl) {
      // Between the bars — a heading, the hours, the gap between days — is
      // as good a place as any to start a box. The buttons there are not,
      // and nor is a word: pressing on writing is how to select it.
      if (isDay && selects(tool) && !armed && !e.target.closest('button, input, textarea, label, a')
        && !overText(e.clientX, e.clientY)) startMarquee(e)
      return
    }
    const date = trackEl.dataset.trackDate

    if (!isDay) {
      setDragState({ mode: 'press', date, originX: e.clientX, originY: e.clientY, compact: true })
      return
    }
    if (days[date]?.malformed) return

    // A tag is armed for one specific day, so it can't paint on another.
    if (armed?.date === date) {
      e.preventDefault()
      const cell = cellFrom(trackEl, e.clientX)
      const lane = laneFrom(trackEl, e.clientY, days[date]?.blocks ?? [], cell)
      setDragState({ mode: 'paint', date, trackEl, anchor: cell, cell, lane, toDate: date })
      return
    }

    const blockEl = e.target.closest('[data-block-id]')

    if (tool === 'snip') {
      const at = blockEl && snipFrom(e)
      if (!at) return
      e.preventDefault()
      handlers.current.onSnip(at.date, at.id, at.slot)
      // Back on the next movement, over whichever half the pointer is on.
      setSnipHover(null)
      return
    }

    const block = blockEl && days[date]?.blocks.find((b) => b.id === blockEl.dataset.blockId)

    if (selects(tool)) {
      if (!block) {
        startMarquee(e)
        return
      }
      const mine = { date, id: block.id }
      const all = pickedRef.current
      const isPicked = all.some((p) => p.date === date && p.id === block.id)
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        e.preventDefault()
        handlers.current.onPick(isPicked
          ? all.filter((p) => !(p.date === date && p.id === block.id))
          : [...all, mine])
        return
      }
    }

    // A block works the way it always has — pressed for its note, dragged
    // to move, stretched by an edge — unless it is one of several gathered
    // up, which are carried together.
    const all = pickedRef.current
    const carryMany = block && !e.target.dataset?.handle
      && all.length > 1 && all.some((p) => p.date === date && p.id === block.id)
    if (!carryMany && all.length > 0) handlers.current.onPick([])

    if (carryMany) {
      e.preventDefault()
      setDragState({
        mode: 'grouppress', date, originX: e.clientX, originY: e.clientY,
        width: trackEl.getBoundingClientRect().width,
        picks: all,
        blocks: all.map((p) => days[p.date]?.blocks.find((b) => b.id === p.id)).filter(Boolean),
        clicked: { date, id: block.id },
        days: 0,
        slots: 0,
      })
      return
    }

    if (!block) return

    e.preventDefault()
    const edge = e.target.dataset?.handle
    if (edge) {
      // Where the block was snipped, the edge is the cut, and the other half
      // follows it — but only as far as leaves that half ten minutes of its
      // own (see applyResize). The readout says where it will really land.
      const partner = cutPartner(days[date]?.blocks ?? [], block.id, edge)
      setDragState({
        mode: 'resize', date, trackEl, id: block.id, edge,
        startSlot: block.startSlot, endSlot: block.endSlot,
        // Kept so a press that goes nowhere can be told from a real drag.
        was: { startSlot: block.startSlot, endSlot: block.endSlot },
        limit: partner ? (edge === 'start' ? partner.startSlot + 1 : partner.endSlot - 1) : null,
      })
    } else {
      // A press, until it moves far enough to be a drag. Everything a slide
      // needs is taken now, while the block is still where it started.
      const rect = trackEl.getBoundingClientRect()
      setDragState({
        mode: 'press', date, trackEl, id: block.id,
        originX: e.clientX, originY: e.clientY,
        startSlot: block.startSlot, endSlot: block.endSlot,
        was: { startSlot: block.startSlot, endSlot: block.endSlot },
        // Where it sits now, and how far down the bar it was taken hold of.
        // Both are what a slide is measured against.
        wasLane: layoutLanes(days[date]?.blocks ?? [], { keepPauses })
          .find((p) => p.block.id === block.id)?.lane ?? 0,
        grabY: (e.clientY - rect.top) / rect.height,
        // The day without this block in it. Which lane the pointer is asking
        // for is a question about what it would be landing among, and a block
        // is not among itself.
        others: (days[date]?.blocks ?? []).filter((b) => b.id !== block.id),
      })
    }
  }

  useEffect(() => {
    if (!drag) return

    const onMove = (e) => {
      const d = dragRef.current
      if (!d) return

      if (d.mode === 'paint') {
        // Which bar the pointer is over now, which need not be the one it
        // started on: ending on the next day's bar is how a stretch carries
        // past midnight. Off the bars entirely, it keeps the day it last
        // reached rather than snapping back — you are on your way somewhere.
        //
        // Past the reach it stops at the furthest day it is allowed, rather
        // than giving up and going home: a drag that has gone too far should
        // stop at the limit, not turn into a stretch on the day it started.
        const over = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-track-date]')
        const onto = over?.dataset.trackDate
        let toDate = d.toDate
        if (onto) {
          const reach = Math.max(-PAINT_REACH_DAYS,
            Math.min(PAINT_REACH_DAYS, daysBetween(d.date, onto)))
          const target = shiftDate(d.date, reach)
          if (days[target] && !days[target].malformed) toDate = target
        }
        // Every bar in this view has the same left edge and the same width,
        // so the time under the pointer reads the same off any of them.
        const cell = cellFrom(d.trackEl, e.clientX)
        if (cell !== d.cell || toDate !== d.toDate) setDragState({ ...d, cell, toDate })
        return
      }
      if (d.mode === 'marquee') {
        const moved = d.moved || Math.abs(e.clientX - d.originX) > CLICK_SLOP_PX
          || Math.abs(e.clientY - d.originY) > CLICK_SLOP_PX
        const next = { ...d, x: e.clientX, y: e.clientY, moved }
        setDragState(next)
        if (moved) gatherIn(next)
        return
      }
      if (d.mode === 'grouppress' || d.mode === 'group') {
        const moved = d.mode === 'group' || Math.abs(e.clientX - d.originX) > CLICK_SLOP_PX
          || Math.abs(e.clientY - d.originY) > CLICK_SLOP_PX
        if (!moved) return
        // Along the day by how far the pointer has gone, measured from where
        // it was pressed, as one block slides; and from day to day by which
        // day the pointer is over now.
        const travelled = Math.round(((e.clientX - d.originX) / d.width) * SLOTS_PER_DAY)
        const over = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-date]')?.dataset.date
        const dayShift = over ? daysBetween(d.date, over) : d.days
        const slots = clampShift(d.blocks, travelled)
        if (d.mode !== 'group' || slots !== d.slots || dayShift !== d.days) {
          setDragState({ ...d, mode: 'group', slots, days: dayShift })
        }
        return
      }
      if (d.mode === 'resize') {
        let at = boundaryFrom(d.trackEl, e.clientX)
        if (d.limit != null) at = d.edge === 'start' ? Math.max(at, d.limit) : Math.min(at, d.limit)
        const next = d.edge === 'start'
          ? { ...d, startSlot: Math.min(at, d.endSlot - 1) }
          : { ...d, endSlot: Math.max(at, d.startSlot + 1) }
        if (next.startSlot !== d.startSlot || next.endSlot !== d.endSlot) setDragState(next)
        return
      }
      if (d.mode === 'move' || d.mode === 'press') {
        const moved = Math.abs(e.clientX - d.originX) > CLICK_SLOP_PX
          || Math.abs(e.clientY - d.originY) > CLICK_SLOP_PX
        if (!moved) return
        // Both edges together, so the block keeps its length. The whole block
        // has to stay in the day, so the shift is clamped rather than the
        // edges — clamping the edges would squash it against midnight.
        // How far it has travelled, in slots, measured from where it was
        // taken hold of. Counting whole cells crossed instead would make the
        // first step depend on where inside a cell the press landed — a pixel
        // from the edge and it jumps, halfway across and it takes a full slot.
        // From the grab point it is always half a slot, wherever you grabbed.
        const rect = d.trackEl.getBoundingClientRect()
        const travelled = Math.round(
          ((e.clientX - d.originX) / rect.width) * SLOTS_PER_DAY)
        const shift = Math.max(-d.was.startSlot,
          Math.min(SLOTS_PER_DAY - d.was.endSlot, travelled))
        const cell = cellFrom(d.trackEl, e.clientX)
        // How high you are holding it says where it should sit — judged where
        // the pointer is, since that is what you are aiming at. Judging it at
        // the block's own start would ask about a moment that can be hours
        // away and over something else entirely.
        const lane = laneWhileSliding(d.trackEl, e.clientY, d, cell)
        const next = {
          ...d, mode: 'move', moved: true,
          startSlot: d.was.startSlot + shift, endSlot: d.was.endSlot + shift,
          at: { slot: cell, lane },
        }
        if (next.mode !== d.mode || next.startSlot !== d.startSlot || lane !== d.at?.lane) {
          setDragState(next)
        }
        return
      }
      const moved = Math.abs(e.clientX - d.originX) > CLICK_SLOP_PX
        || Math.abs(e.clientY - d.originY) > CLICK_SLOP_PX
      if (moved && !d.moved) setDragState({ ...d, moved: true })
    }

    const onUp = () => {
      const d = dragRef.current
      setDragState(null)
      if (!d) return
      const h = handlers.current

      if (d.mode === 'paint') {
        h.onPaint(d.date, paintSpans(d.date, d.anchor, d.toDate, d.cell), {
          slot: d.anchor, lane: d.lane,
        })
      } else if (d.mode === 'group') {
        if (d.slots || d.days) h.onMoveMany(d.picks, { days: d.days, slots: d.slots })
      } else if (d.mode === 'grouppress') {
        // A click, not a drag: that block's note, as a click on any block.
        h.onPick([])
        h.onSelect(d.clicked.date, d.clicked.id)
      } else if (d.mode === 'marquee') {
        pickKey.current = ''
      } else if (d.mode === 'resize' || d.mode === 'move') {
        // Landing back where it started isn't an edit — it's a click. Which is
        // the only way to open the note on a block too narrow to have anywhere
        // else to click, and what a stray wobble on any other block should
        // come to as well.
        //
        // A slide can change where a block sits without changing when it
        // happened, though, and dragging one straight up is the plainest way
        // to ask for that. Times alone would call it a click and throw the
        // whole thing away.
        const sameTimes = d.startSlot === d.was.startSlot && d.endSlot === d.was.endSlot
        const sameLane = d.mode !== 'move' || d.at?.lane === d.wasLane
        if (sameTimes && sameLane) {
          h.onSelect(d.date, d.id)
        } else {
          h.onResize(d.date, d.id, d.startSlot, d.endSlot, d.at)
        }
      } else if (!d.moved) {
        if (d.compact) h.onPickDay(d.date)
        else h.onSelect(d.date, d.id)
      }
    }

    const onCancel = () => setDragState(null)
    const onKey = (e) => { if (e.key === 'Escape') setDragState(null) }

    // A box being drawn, or blocks being carried, can reach days that are not
    // on screen yet: held near the top or bottom of the list, it scrolls to
    // follow, faster the closer it is to the edge. Scrolled by hand meanwhile,
    // the box and the blocks keep up with that too.
    let last = null
    const follows = () => ['marquee', 'group', 'grouppress'].includes(dragRef.current?.mode)
    const track = (e) => { last = { clientX: e.clientX, clientY: e.clientY } }
    let frame = requestAnimationFrame(function edge() {
      const el = scrollRef.current
      if (last && el && follows()) {
        const r = el.getBoundingClientRect()
        const into = last.clientY < r.top + SCROLL_EDGE_PX
          ? last.clientY - (r.top + SCROLL_EDGE_PX)
          : last.clientY > r.bottom - SCROLL_EDGE_PX ? last.clientY - (r.bottom - SCROLL_EDGE_PX) : 0
        if (into) el.scrollTop += Math.max(-SCROLL_MAX_PX, Math.min(SCROLL_MAX_PX, into / 2))
      }
      frame = requestAnimationFrame(edge)
    })
    const onScroll = () => { if (last && follows()) onMove(last) }
    const scroller = scrollRef.current

    window.addEventListener('pointermove', track)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
    scroller?.addEventListener('scroll', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', track)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
      scroller?.removeEventListener('scroll', onScroll)
    }
  }, [drag !== null])

  // Clearing a whole day is the one thing here with no way back, so it asks
  // once. Second click within a few seconds does it; otherwise it forgets.
  const [confirmWipe, setConfirmWipe] = useState(null)
  const wipeTimer = useRef(null)

  useEffect(() => () => clearTimeout(wipeTimer.current), [])

  // The same function from one draw to the next, so the rows it is handed
  // to are not drawn again for it: which day is asking is read from a ref.
  const confirmRef = useRef(confirmWipe)
  confirmRef.current = confirmWipe
  const askWipe = useCallback((date) => {
    clearTimeout(wipeTimer.current)
    if (confirmRef.current === date) {
      setConfirmWipe(null)
      onWipeDay(date)
      return
    }
    setConfirmWipe(date)
    wipeTimer.current = setTimeout(() => setConfirmWipe(null), WIPE_CONFIRM_MS)
  }, [onWipeDay])

  const tagById = (id) => tags.find((t) => t.id === id)
  const armedTag = armed ? tagById(armed.tag) : null

  // Abandon a paint if the armed tag disappears mid-gesture.
  useEffect(() => {
    if (dragRef.current?.mode === 'paint' && !armedTag) setDragState(null)
  }, [armedTag])

  // --- jump to a date from the date picker -------------------------------
  useEffect(() => {
    if (!jumpTo) return
    if (jumpTo < range.start || jumpTo > range.end) {
      setRange({ start: shiftDate(jumpTo, -INITIAL), end: shiftDate(jumpTo, INITIAL) })
      return // re-runs once the range covers it
    }
    topDates.current[mode] = jumpTo
    // Asking for a date beats every correction still queued, including the one
    // that puts a view back where you left it — which is what makes clicking a
    // day in the Overview open that day rather than the last one you read.
    const el = scrollRef.current
    if (el && chromeReady) {
      pendingAnchor.current = null
      el.scrollTop = daysBetween(range.start, jumpTo) * rowTotal
    } else {
      pendingAnchor.current = { date: jumpTo, offset: 0 }
    }
    onJumped()
  }, [jumpTo, range.start, range.end, rowTotal, onJumped, mode, chromeReady])

  const painting = drag?.mode === 'paint' && armedTag
    ? paintSpans(drag.date, drag.anchor, drag.toDate, drag.cell)
    : null
  // A move is a resize where both edges went the same way, so it previews and
  // reads out through the same path.
  const resizing = drag?.mode === 'resize' || drag?.mode === 'move' ? drag : null

  // The readout says the whole stretch, however many days it lands on: the
  // time it starts, the time it ends, and how long it comes to. Across
  // midnight the end time belongs to a later day, which the count says.
  const readoutRange = painting
    ? {
      startSlot: painting[0].startSlot,
      endSlot: painting[painting.length - 1].endSlot,
      slots: painting.reduce((sum, p) => sum + (p.endSlot - p.startSlot), 0),
      overnights: painting.length - 1,
    }
    : resizing
  const resizingBlock = resizing
    ? days[resizing.date]?.blocks.find((b) => b.id === resizing.id)
    : null

  // Blocks being carried by the select tool: every day they leave or land
  // on, laid out as it will be once they are let go. Null while nothing has
  // moved yet, or where they cannot land (a day not read in, or one that
  // needs fixing in Obsidian).
  const group = drag?.mode === 'group' ? drag : null
  let groupOut = null
  if (group && (group.slots || group.days)) {
    const byDate = {}
    for (const p of group.picks) {
      for (const date of [p.date, shiftDate(p.date, group.days)]) {
        if (days[date] && !days[date].malformed) byDate[date] = days[date].blocks
      }
    }
    groupOut = moveBlocks(byDate, group.picks, { days: group.days, slots: group.slots })
  }
  // Which blocks are gathered up on each day, as one string per day so a day
  // whose picks did not change is not drawn again. While they are carried,
  // they are outlined where they are going.
  const pickedOn = new Map()
  for (const p of picked ?? []) {
    const date = groupOut ? shiftDate(p.date, group.days) : p.date
    pickedOn.set(date, pickedOn.has(date) ? `${pickedOn.get(date)},${p.id}` : p.id)
  }
  const snipBlockNow = snipHover ? days[snipHover.date]?.blocks.find((b) => b.id === snipHover.id) : null
  const pickedSlots = (picked ?? []).reduce((sum, p) => {
    const b = days[p.date]?.blocks.find((x) => x.id === p.id)
    return sum + (b ? b.endSlot - b.startSlot : 0)
  }, 0)
  const covers = useContext(Covers)
  const { chipLook, blockLook, keepPauses, labels, covers: showCovers, hints, theme } = useContext(Appearance)
  const starlit = theme === 'starlit'
  const firstDay = useFirstDay()
  const birthdays = useBirthdays()
  // Starlit ranks every tag by its hours this past month. Kept the same
  // object while the hours are the same: every row is handed it, and older
  // weeks arriving as you scroll change nothing about this past month.
  const monthRef = useRef(null)
  const month = useMemo(() => {
    const next = starlit ? monthByTag(days, todayISO()) : null
    const was = monthRef.current
    if (was && next && was.size === next.size && [...next].every(([id, minutes]) => was.get(id) === minutes)) return was
    monthRef.current = next
    return next
  }, [days, starlit])
  // With covers off, a named block is drawn as though none had ever been
  // found: its own cover set aside, and nothing borrowed.
  const faceOf = (b) => blockFace(tagById(b.tag), showCovers ? b : { ...b, cover: '' }, showCovers ? covers : null)
  // Dragging a named game around should read as that game, not as "Game".
  const readoutTag = painting
    ? armedTag
    : resizingBlock && faceOf(resizingBlock)
  const snipTag = snipBlockNow && faceOf(snipBlockNow)
  const many = (n) => `${n} block${n === 1 ? '' : 's'}`
  const signed = (slots) => (slots < 0 ? `− ${formatDuration(-slots)}` : `+ ${formatDuration(slots)}`)

  // After every draw, and so after anything that has just moved the list —
  // opening on today, a jump, the place kept while days load above — the
  // band is put where the list now is, before the frame is shown.
  useLayoutEffect(placeBand)
  // Until then, if the rows have changed shape since the band was placed —
  // zoomed, or the other view — only the rows that are about to be on screen
  // are built, around the day the list is about to show.
  let shown = { first: dates.indexOf(band.from), last: dates.indexOf(band.to) }
  if (band.mode !== mode || band.rowTotal !== rowTotal || shown.first < 0 || shown.last < 0) {
    const el = scrollRef.current
    const screen = el ? Math.max(1, Math.ceil(el.clientHeight / rowTotal)) : 40
    const at = pendingAnchor.current?.date ?? jumpTo ?? topDates.current[mode]
    let i = dates.indexOf(at)
    if (i < 0) i = el ? Math.floor(el.scrollTop / rowTotal) : 0
    shown = { first: i - screen, last: i + screen }
  }
  shown = {
    first: Math.min(Math.max(0, shown.first), Math.max(0, dates.length - 1)),
    last: Math.min(Math.max(0, shown.last), dates.length - 1),
  }

  const hourTicks = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]

  // The hour lines inside every bar, as one picture shared by all of them:
  // a line at each hour, on the same whole pixel the blocks' edges use.
  // Twenty-three elements a row was over a thousand on the Overview, each
  // made and placed whenever a row was.
  const gridlines = useMemo(() => {
    const at = (h) => (trackWidth ? `${Math.round((h / 24) * trackWidth)}px` : `${(h / 24) * 100}%`)
    const one = (h) => `transparent ${at(h)}, var(--c-line-soft) ${at(h)}, `
      + `var(--c-line-soft) calc(${at(h)} + 1px), transparent calc(${at(h)} + 1px)`
    return `linear-gradient(90deg, ${Array.from({ length: 23 }, (_, i) => one(i + 1)).join(', ')})`
  }, [trackWidth])


  return (
    <div className={`daylist ${mode}`}>
      <div className="listbar">
        <div className="listreadout">
          {group ? (
            <>
              <span className="readout-range">{many(group.picks.length)}</span>
              {group.slots !== 0 && <span className="readout-dur">{signed(group.slots)}</span>}
              {group.days !== 0 && (
                <span className="readout-over">onto {formatDayHeading(shiftDate(group.date, group.days))}</span>
              )}
              {!groupOut && (group.slots || group.days) ? <span className="readout-over">can't land there</span> : null}
            </>
          ) : snipTag ? (
            <>
              <span className="readout-tag" style={{ '--tag': snipTag.colour }}>
                <TagIcon tag={snipTag} />
                {snipTag.name}
              </span>
              <span className="readout-range">snip at {slotToTime(snipHover.slot)}</span>
              <span className="readout-dur">
                {formatDuration(snipHover.slot - snipBlockNow.startSlot)} | {formatDuration(snipBlockNow.endSlot - snipHover.slot)}
              </span>
            </>
          ) : readoutRange ? (
            <>
              <span className="readout-tag" style={{ '--tag': readoutTag?.colour }}>
                <TagIcon tag={readoutTag} />
                {readoutTag?.name}
              </span>
              <span className="readout-range">
                {slotToTime(readoutRange.startSlot)} – {slotToTime(readoutRange.endSlot)}
              </span>
              <span className="readout-dur">
                {formatDuration(readoutRange.slots ?? readoutRange.endSlot - readoutRange.startSlot)}
              </span>
              {readoutRange.overnights > 0 && (
                <span className="readout-over">
                  over {readoutRange.overnights === 1 ? 'midnight' : `${readoutRange.overnights} nights`}
                </span>
              )}
            </>
          ) : (
            <span className="readout-hint">
              {armedTag && isDay
                ? `Drag across ${formatDayHeading(armed.date)} to paint ${armedTag.name}`
                // The shortcuts can be switched off in the settings; what to
                // do with an armed tag is said regardless, since it is the
                // answer to "why isn't clicking doing anything".
                : !hints
                  ? ''
                  : !isDay
                    ? 'Click a day to open it · ctrl+f finds · ctrl+scroll to resize'
                    : tool === 'snip'
                      ? 'Click a block to snip it in two at the line · drag the cut with the move tool to shift it · V goes back to moving'
                      : picked?.length
                        ? `${many(picked.length)} selected, ${formatDuration(pickedSlots)} · drag to move them · delete removes them · ctrl+c copies, ctrl+v puts them where you point · esc lets go`
                        : 'Pick a tag under a day to add time · click a block for its note, drag it to move it · drag on empty space to select, shift-click adds · ctrl+c copies, ctrl+v pastes where you point · ctrl+f finds · ctrl+z undoes · ctrl+scroll to resize'}
            </span>
          )}
          {isDay && onTool && <Tools tool={tool} onTool={onTool} />}
        </div>

        {!isDay && (
          <div className="listruler">
            {hourTicks.map((h) => (
              <span key={h} className="ltick" style={{ left: edgeAt(h * 6) }}>
                {String(h).padStart(2, '0')}
              </span>
            ))}
            <span className="ltick last" style={{ left: edgeAt(SLOTS_PER_DAY) }}>24</span>
          </div>
        )}
      </div>

      <div
        className={`scroller${armedTag ? ' armed' : ''}${isDay ? ` tool-${tool}` : ''}`}
        ref={scrollRef}
        data-blocks={blockLook}
        onScroll={handleScroll}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <div className="rowspacer" aria-hidden="true" style={{ height: shown.first * rowTotal }} />
        {dates.slice(shown.first, shown.last + 1).map((date, i) => {
          const rowIndex = shown.first + i
          // Everything a row is given is either the same for every row, or
          // set only on the row it concerns, so a row with nothing new to
          // show is skipped: loading the next few weeks, or painting on one
          // day, no longer builds every other day on the list again.
          const span = painting?.find((p) => p.date === date)
          return (
            <DayRow
              key={date}
              date={date}
              day={days[date]}
              isToday={date === today}
              rowRef={rowIndex === shown.first ? firstRowRef : undefined}
              mode={mode}
              dense={dense}
              barHeight={barHeight}
              rowTotal={rowTotal}
              trackWidth={trackWidth}
              gridlines={gridlines}
              theme={theme}
              blockLook={blockLook}
              keepPauses={keepPauses}
              labels={labels}
              chipLook={chipLook}
              showCovers={showCovers}
              covers={covers}
              tags={tags}
              firstDay={firstDay}
              birthdays={birthdays}
              month={month}
              inPeriod={inPeriod(date)}
              armedTagId={armed?.date === date ? armed.tag : null}
              resizing={resizing?.date === date ? resizing : null}
              paintSpan={span}
              paintFrom={span ? { tag: armed.tag, date: drag.date, anchor: drag.anchor, lane: drag.lane } : null}
              selectedId={selected?.date === date ? selected.id : null}
              searching={searching}
              marks={found.get(date)}
              currentAt={find?.at}
              confirming={confirmWipe === date}
              wiping={wiping}
              onArm={onArm}
              askWipe={askWipe}
              pickedIds={pickedOn.get(date)}
              snipAt={snipHover?.date === date ? snipHover : null}
              groupBlocks={groupOut?.[date]}
            />
          )
        })}
        <div className="rowspacer" aria-hidden="true" style={{ height: Math.max(0, dates.length - 1 - shown.last) * rowTotal }} />
      </div>
      {drag?.mode === 'marquee' && drag.moved && (() => {
        const box = marqueeBox(drag)
        return (
          <div
            className="marquee"
            aria-hidden="true"
            style={{ left: box.left, top: box.top, width: box.right - box.left, height: Math.max(0, box.bottom - box.top) }}
          />
        )
      })()}
    </div>
  )
}

/**
 * One day on the list: its bar, and in the Day view its heading, ruler and
 * tags.
 *
 * Its own component so that it can be skipped. The list holds hundreds of
 * days, and building every one of them again whenever anything changed —
 * the next few weeks arriving as you scroll, one block being painted — was
 * what made scrolling the Overview hitch. Everything it is given is either
 * the same for every row or set only on the row it concerns, so a day with
 * nothing new to show is left exactly as it was.
 */
const DayRow = memo(function DayRow({
  date, day, isToday, rowRef, mode, dense, barHeight, rowTotal, trackWidth, gridlines,
  theme, blockLook, keepPauses, labels, chipLook, showCovers, covers, tags,
  firstDay, birthdays, month, inPeriod, armedTagId, resizing, paintSpan, paintFrom,
  selectedId, searching, marks, currentAt, confirming, wiping, onArm, askWipe,
  pickedIds, snipAt, groupBlocks,
}) {
  const isDay = mode === 'day'
  const starlit = theme === 'starlit'
  const scriptorium = theme === 'scriptorium'
  const words = wordsFor(theme)
  const tagById = (id) => tags.find((t) => t.id === id)
  // With covers off, a named block is drawn as though none had ever been
  // found: its own cover set aside, and nothing borrowed.
  const faceOf = (b) => blockFace(tagById(b.tag), showCovers ? b : { ...b, cover: '' }, showCovers ? covers : null)
  // See the list's own xAt: every edge on a whole pixel, shared by the two
  // blocks that meet there.
  const xAt = (slot) => Math.round((slot / SLOTS_PER_DAY) * trackWidth)
  const edgeAt = (slot) => (trackWidth ? `${xAt(slot)}px` : `${pct(slot)}%`)
  const spanAt = (from, to) => (trackWidth
    ? { left: `${xAt(from)}px`, width: `${xAt(to) - xAt(from)}px` }
    : { left: `${pct(from)}%`, width: `${pct(to - from)}%` })
  /** '', ' hit', or ' hit current' — what a search has to say about a block. */
  const litFor = (_date, b) => {
    const at = marks?.get(`${slotToTime(b.startSlot)}|${slotToTime(b.endSlot)}|${b.tag}|${b.game ?? ''}|${b.show ?? ''}`)
    return at === undefined ? '' : at === currentAt ? ' hit current' : ' hit'
  }

  // Christmas Eve, the Sundays of Advent, Halloween, Easter, and
  // whatever festivals follow them.
  // Starlit only, so far.
  // Black Hours keeps the same days as its red-letter days (hoursFeasts.js).
  const festival = starlit || scriptorium ? festivalOf(date, firstDay, birthdays) : null
  const feast = scriptorium ? feastOf(festival) : null
  let blocks = groupBlocks ?? (resizing?.date === date
    ? applyResize(day?.blocks ?? [], resizing.id, resizing.startSlot, resizing.endSlot, resizing.at)
    : day?.blocks ?? [])

  // While painting, lay the day out as it will be once the drag is
  // released — so the new block shows at the height it will land at,
  // and anything it overlaps shrinks to make room for it. A stretch
  // that runs past midnight previews on every day it reaches, which
  // is what shows you it is going to land as more than one block.
  let previewId = null
  const span = paintSpan
  if (span) {
    const before = blocks
    blocks = applyPaint(
      before,
      {
        id: PREVIEW_ID,
        tag: paintFrom.tag,
        startSlot: span.startSlot,
        endSlot: span.endSlot,
        note: '',
      },
      // Where the pointer went down decides the height on the day it
      // went down on. The days it carried into take the same lane,
      // measured from where the stretch enters them.
      { slot: date === paintFrom.date ? paintFrom.anchor : span.startSlot, lane: paintFrom.lane },
    )
    // Usually the new block, but painting a tag over itself merges,
    // in which case the survivor is what changed.
    previewId = blocks.find((b) => {
      const was = before.find((o) => o.id === b.id)
      return !was || was.startSlot !== b.startSlot || was.endSlot !== b.endSlot
    })?.id ?? null
  }

  // Counted after the paint preview is folded in, so the first drag
  // on an empty day fills it in as you draw rather than after.
  const blank = !day?.malformed && blocks.length === 0

  const pieces = layoutLanes(blocks, { keepPauses })
  // Which block covers which is the lane's business, not the DOM's.
  //
  // The list order is the stacking order, and dragging an edge
  // rewrites it to keep a block at the height it already had. If the
  // blocks were drawn in list order, that rewrite would shuffle the
  // elements on screen — and moving an element is enough to start
  // anything that plays on arrival over again, for every block in the
  // day, twice: once on the way out and once on the way back.
  //
  // So they are drawn in an order that never changes, and depth is
  // said out loud with a z-index instead. Sorting by id is arbitrary,
  // which is the point: nothing about the day can reorder it.
  const drawn = [...pieces].sort((a, b) =>
    (a.block.id < b.block.id ? -1 : a.block.id > b.block.id ? 1 : a.index - b.index))
  // One piece per block, for the grab strips: they belong to the
  // block's own ends rather than to any slice of it.
  const wholes = drawn.filter((p) => p.isFirst)
  // Each piece by its place in its block, so one can find the pieces
  // either side of it: a block looks at where its neighbours start to
  // draw its steps.
  const pieceAt = new Map(pieces.map((p) => [`${p.block.id}#${p.index}`, p]))
  // Where a block's name sits across the line of runes in one of its
  // pieces, in px along the bar; null where it is up or down out of
  // the way, or there is no name.
  const holeIn = (piece) => {
    const band = labelOf.get(piece.block)
    if (!band) return null
    const row = (piece.top + 0.5) / piece.lanes
    if (row < band.top || row > band.bottom) return null
    const middle = (xAt(band.from) + xAt(band.to)) / 2
    return [middle - band.label.width / 2, middle + band.label.width / 2]
  }
  // A name belongs to the block rather than to any slice of it, so it
  // is centred on the whole block. Choosing a slice and centring in
  // that instead is what pushed names off to one side: the roomiest
  // slice of a two-hour block can sit right at one end of it.
  //
  // Each block keeps its pieces, though, because the band a name sits
  // in has to be one the block holds along the whole width the name
  // reaches — see below.
  const named = [...drawn.reduce((byBlock, p) => {
    const had = byBlock.get(p.block) ?? []
    had.push(p)
    byBlock.set(p.block, had)
    return byBlock
  }, new Map())].map(([block, mine]) => ({
    block,
    mine,
    middle: (block.startSlot + block.endSlot) / 2,
  }))
  // Where each name goes, worked out ahead of the blocks: Grimoire's
  // runes part around it.
  const wordsOnly = labels === 'name'
  const labelled = day?.malformed ? [] : named.map(({ block: b, mine, middle }) => {
    // A named game wears its own name and its own cover here.
    // Twenty Game blocks in a week all called "Game" say nothing
    // the colour hasn't already said.
    const tag = faceOf(b)
    // "Name only" is laid out as a block with no picture at all,
    // which the fitting already knows how to do: the name, where
    // it fits, and nothing where it doesn't.
    const band = wordsOnly
      ? bandFor(mine, middle, null, tag?.name ?? b.tag, barHeight, trackWidth, drawn)
      : bandFor(mine, middle, tag, b.tag, barHeight, trackWidth, drawn, labels !== 'icon')
    return band && { block: b, tag, band }
  }).filter(Boolean)
  const labelOf = new Map(labelled.map((l) => [l.block, l.band]))
  const selectedPieces = selectedId
    ? pieces.filter((p) => p.block.id === selectedId)
    : []
  // Gathered up by the select tool.
  const pickedSet = new Set(pickedIds ? pickedIds.split(',') : [])
  const pickedBlocks = pickedSet.size > 0 ? blocks.filter((b) => pickedSet.has(b.id)) : []
  // The snip tool's line, as tall as the block is where it would cut.
  const snipPiece = snipAt && pieces.find((p) => p.block.id === snipAt.id && p.from < snipAt.slot && p.to >= snipAt.slot)

  // Blocks a search has lit, and which of them it is standing on.
  // Outlined rather than ringed: a block with something laid over it
  // is several rectangles, and a ring on each of them draws lines
  // through the middle of one block and leaves the shape it really
  // has unmarked.
  const litBlocks = searching
    ? blocks.map((b) => ({ block: b, lit: litFor(date, b) })).filter((b) => b.lit)
    : []

  const track = (
    <div
      className={`track${dense ? ' dense' : ''}${blank ? ' empty' : ''}`
        + `${searching ? ' finding' : ''}`}
      data-track-date={date}
      style={{ height: barHeight }}
    >
      {isToday && theme === 'hearthfire' && !day?.malformed && <Burnt date={date} />}
      {/* Halloween's spider, let down from its web over the bar. */}
      {starlit && festival?.id === 'halloween' && isDay && <Spider className="bar-spider" />}

      {/* A line at each hour, on the same whole pixels the blocks use, so a
          line sits exactly under the edge that covers it. */}
      {!dense && <div className="gridlines" style={{ backgroundImage: gridlines }} />}

      {/* A feast's bar is the ground of a painting, under its blocks. */}
      {feast && !day?.malformed && <FeastGround id={feast.id} w={trackWidth} h={barHeight} />}

      {/* Said out loud rather than left blank — but only in the Day
          view, where there is room for it. In the Overview a row is
          a few pixels tall and the hatching alone reads fine. */}
      {blank && isDay && (
        <span className="emptyday">{words.emptyDay}</span>
      )}

      {/* The blocks keep their depths to themselves, so a block three
          lanes down still sits under every name and grab strip. */}
      {day?.malformed ? (
        <span className="rowbroken">needs fixing in Obsidian</span>
      ) : (
      <div className="blocks">
        {drawn.map((piece) => {
        const b = piece.block
        const tag = tagById(b.tag)
        const look = pieceLook(
          piece,
          pieceAt.get(`${b.id}#${piece.index - 1}`),
          pieceAt.get(`${b.id}#${piece.index + 1}`),
        )
        // Grimoire's runes, whole ones only, through the middle of
        // what shows of the piece; none where too little of it shows
        // to hold a line. Where the block's name sits across that
        // line, the runes part for it.
        const runes = blockLook === 'grimoire' && trackWidth && barHeight / piece.lanes >= RUNES_MIN_BAND
          ? runeSpans(xAt(b.startSlot), xAt(b.endSlot), xAt(piece.from), xAt(piece.to), holeIn(piece))
          : []
        return (
          <div
            // Named for which piece of its block it is, not for where
            // it happens to start. Dragging an edge moves where a
            // piece begins, and a key built from that would make every
            // step look like a different element: React would replace
            // it, and anything that plays on arrival would play again.
            key={`${b.id}#${piece.index}`}
            data-block-id={b.id}
            className={
              'block' + (b.id === previewId ? ' preview' : '')
              + litFor(date, b)
              // Only on the way in. A piece that appears because
              // something else moved is not an arrival.
              + (wiping(date, b) ? '' : ' settled')
              // Square where the block carries on: a block cut where
              // it steps up has to read as one shape.
              + `${piece.isFirst ? '' : ' joined-start'}${piece.isLast ? '' : ' joined-end'}`
              + `${look.stepStart ? ' step-start' : ''}${look.stepEnd ? ' step-end' : ''}`
              + (look.stepStart && look.stepEnd && trackWidth
                && xAt(piece.to) - xAt(piece.from) <= PEEK_MAX ? ' peek' : '')
              + (runes.length > 0 ? ' runes' : '') + (runes.length > 1 ? ' runes2' : '')
              + (pickedSet.has(b.id) ? ' picked' : '')
            }
            style={{
              ...spanAt(piece.from, piece.to),
              // Where the piece starts along the bar, for the looks
              // with a pattern: drawn from the bar's own start, the
              // pattern runs on unbroken across the cut where a block
              // steps around an overlap.
              '--x': trackWidth ? `${xAt(piece.from)}px` : '0px',
              ...look.vars,
              ...Object.fromEntries(runes.flatMap((r, i) => [
                [`--runes${i ? 2 : ''}-l`, `${r.left}px`],
                [`--runes${i ? 2 : ''}-r`, `${r.right}px`],
                [`--runes${i ? 2 : ''}-shift`, `${r.shift}px`],
              ])),
              // Every block runs from wherever it starts to the floor
              // of the bar. Whatever is layered over it covers the
              // lower part, so nothing is left standing in empty
              // space. Inset only against the edges of the bar itself.
              top: piece.top === 0
                ? 'var(--block-inset)'
                : `${(piece.top / piece.lanes) * 100}%`,
              bottom: 'var(--block-inset)',
              // How deep the block sits is how it stacks.
              zIndex: piece.lane,
              '--tag': tag?.colour ?? '#555',
            }}
            title={`${b.game || b.show || tag?.name || b.tag} · ${slotToTime(b.startSlot)}–${slotToTime(b.endSlot)}${b.note ? `
${b.note}` : ''}`}
          />
        )
        })}
      </div>
      )}

      {/* What fills a feast's margins, over the blocks but under their
          names, so a block at the end of the day can still be read. */}
      {feast && isDay && !day?.malformed && <FeastBar festival={festival} date={date} w={trackWidth} h={barHeight} />}

      {/* Over the blocks, so it can be found against a full day, but
          under the names and grab strips, which you have to be able to
          read and grab through it. */}
      {isToday && <NowLine date={date} />}

      {/* Names are drawn over the blocks, one per block rather than
          one per piece: a block cut where it steps up is still one
          thing with one name, sitting in its own lane across the whole
          of it. */}
      {labelled.map(({ block: b, tag, band }) => {
        const { label, top, bottom, from, to } = band
        return (
          <span
            key={`l${b.id}`}
            className={`block-label${litFor(date, b)}`}
            // Names its block, the way the block itself does. It is
            // not always drawn across the whole of it, so there is
            // otherwise no way to tell from the page which is which.
            data-block-id={b.id}
            style={{
              ...spanAt(from, to),
              top: `${top * 100}%`,
              height: `${(bottom - top) * 100}%`,
            }}
          >
            {!wordsOnly && <TagIcon tag={tag} scale={label.iconPx / baseIconPx()} />}
            {label.mode === 'full' && (tag ? tag.name : b.tag)}
          </span>
        )
      })}

      {/* Handles are drawn over the blocks so they are never buried,
          but only as tall as the block itself — a full-height strip
          would reach into whatever is stacked above or below and steal
          its clicks. A ten-minute block is narrower than two grab
          strips, so they halve to fit; it ends up entirely covered,
          which is why a press that goes nowhere opens the note instead
          of counting as a resize. */}
      {isDay && !day?.malformed && !previewId && wholes.map((piece) => {
        const b = piece.block
        const lane = {
          top: piece.lane === 0
            ? 'var(--block-inset)'
            : `${(piece.lane / piece.lanes) * 100}%`,
          height: `calc(${100 / piece.lanes}%`
            + `${piece.lane === 0 ? ' - var(--block-inset)' : ''}`
            + `${piece.lane === piece.lanes - 1 ? ' - var(--block-inset)' : ''})`,
          '--block-w': `${((b.endSlot - b.startSlot) / SLOTS_PER_DAY) * trackWidth}px`,
        }
        return (
          <span key={`h${b.id}`}>
            <span
              className="handle start"
              data-block-id={b.id}
              data-handle="start"
              style={{ left: edgeAt(b.startSlot), ...lane }}
            />
            <span
              className="handle end"
              data-block-id={b.id}
              data-handle="end"
              style={{ left: edgeAt(b.endSlot), ...lane }}
            />
          </span>
        )
      })}

      {litBlocks.length > 0 && (
        <svg className="finds" viewBox="0 0 100 100" preserveAspectRatio="none">
          {litBlocks.map(({ block, lit }) => (
            <polygon
              key={`f${block.id}`}
              className={lit.includes('current') ? 'current' : ''}
              points={silhouette(pieces.filter((p) => p.block === block), pieces)}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      )}

      {selectedPieces.length > 0 && (
        <svg className="selection" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon points={silhouette(selectedPieces, pieces)} vectorEffect="non-scaling-stroke" />
        </svg>
      )}

      {pickedBlocks.length > 0 && (
        <svg className="selection picks" viewBox="0 0 100 100" preserveAspectRatio="none">
          {pickedBlocks.map((block) => (
            <polygon
              key={`p${block.id}`}
              points={silhouette(pieces.filter((p) => p.block === block), pieces)}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      )}

      {snipPiece && (
        <span
          className="snipline"
          aria-hidden="true"
          style={{
            left: edgeAt(snipAt.slot),
            top: snipPiece.top === 0 ? 'var(--block-inset)' : `${(snipPiece.top / snipPiece.lanes) * 100}%`,
          }}
        />
      )}

   </div>
  )

  if (!isDay) {
    return (
      <div
        key={date}
        ref={rowRef}
        data-date={date}
        className={`compactrow${isToday ? ' today' : ''}${dayOfWeek(date) === 0 ? ' weekedge' : ''}`
          + `${rowRef ? ' measured' : ''}${inPeriod ? ' inperiod' : ''}`}
        // Its height, for when it is out of sight: the browser skips drawing
        // it and holds its place at exactly this. See app.css.
        style={{ '--row-total': `${rowTotal}px` }}
        data-festival={festival?.id}
      >
        <div className="gutter">
          <span className="gday">{weekdayOf(date)}</span>
          <span className="gdate">{formatShortDate(date)}</span>
        </div>
        {track}
      </div>
    )
  }

  return (
    <section
      key={date}
      ref={rowRef}
      data-date={date}
      className={`daysection${isToday ? ' today' : ''}${blank ? ' blank' : ''}`
        + `${rowRef ? ' measured' : ''}`}
      style={{ '--row-total': `${rowTotal}px` }}
      data-festival={festival?.id}
    >
      <h2 className="dayhead">
        {/* Scriptorium opens every day with an illuminated initial,
            coloured by what filled it. */}
        {scriptorium && (() => {
          // A feast's initial is laid in gold, on the feast's own colours,
          // whatever was written that day.
          if (feast) {
            return (
              <Initial
                letter={weekdayOf(date).charAt(0).toUpperCase()}
                level="gilded"
                colours={feast.ground}
                gleam={isToday}
              />
            )
          }
          const lit = illumination(day?.malformed ? [] : day?.blocks)
          return (
            <Initial
              letter={weekdayOf(date).charAt(0).toUpperCase()}
              level={lit.level}
              colours={lit.grounds.map((id) => tagById(id)?.colour ?? '#8a7a66')}
              gleam={isToday && lit.level === 'gilded'}
            />
          )
        })()}
        <span className="dayweekday" data-dow={dayOfWeek(date)}>{weekdayOf(date)}</span>
        {feast ? (
          <FeastHeading festival={festival} date={formatDayHeading(date)} lit={isToday} />
        ) : festival && starlit ? (
          <>
            <span className="festdate">{formatDayHeading(date)}</span>
            {[festival, ...(festival.also ?? [])].map((f) => (
              <FestiveMark key={f.key ?? f.id} id={f.id} lit={isToday} nth={f.nth} />
            ))}
            <span className="festname">
              {[festival, ...(festival.also ?? [])]
                .map((f) => f.name)
                .join(' · ')}
            </span>
          </>
        ) : formatDayHeading(date)}
        {starlit && !day?.malformed && isComplete(day?.blocks) && (
          <Moonweed title="Every hour of this day accounted for" />
        )}
        {isToday && <span className="todaymark">today</span>}
        {blank && <span className="daysummary">{words.blank}</span>}
        {scriptorium && !day?.malformed && (
          <Chronicle
            blocks={day?.blocks}
            isToday={isToday}
            nameOf={(id) => tagById(id)?.name ?? id}
            colourOf={(id) => tagById(id)?.colour ?? '#9e3122'}
          />
        )}
      </h2>

      {track}

      <div className="dayruler">
        {Array.from({ length: 25 }, (_, h) => (
          <span
            key={h}
            data-hour={h}
            className={`rtick${h % 2 === 0 ? ' major' : ''}`}
            style={{ left: edgeAt(h * 6) }}
          >
            <i className="rmark" />
            {h % 2 === 0 && (
              <b className={`rlabel${h === 0 ? ' first' : ''}${h === 24 ? ' last' : ''}`}>
                {String(h).padStart(2, '0')}:00
              </b>
            )}
          </span>
        ))}
      </div>

      <div className="daychips">
        <div className="chipgroup">
        {/* Hidden tags leave the row but not the bar: every day that
            already has one still draws it by the full list. */}
        {tags.filter((t) => !t.hidden).map((t) => {
          const isArmed = armedTagId === t.id
          return (
          <button
            key={t.id}
            type="button"
            className={`chip${isArmed ? ' armed' : ''}`}
            data-look={chipLook}
            style={{ '--chip': t.colour }}
            disabled={day?.malformed}
            onClick={() => onArm(date, t.id)}
            title={month ? rankTitle(t.name, month.get(t.id) ?? 0) : undefined}
          >
            {/* The glow of a picked-up tag, as its own element so it
                can pulse by fading — which the graphics card does on
                its own — rather than by redrawing its shadow, which
                makes the page redraw every day in the list with it. */}
            {isArmed && <i className="chip-aura" aria-hidden="true" />}
            {/* Starlit: a picked-up tag is a spell being readied, a
                circle turning behind it. */}
            {starlit && isArmed && (
              <i className="chip-circle" aria-hidden="true"><MagicCircle size="100%" /></i>
            )}
            {month && <RankGem minutes={month.get(t.id) ?? 0} />}
            <TagIcon tag={t} />
            {t.name}
            {/* Hearthfire sets a picked-up tag alight: flames along
                its top and an ember creeping round its edge. */}
            {theme === 'hearthfire' && isArmed && (
              <i className="chip-fire" aria-hidden="true"><i className="fuse"><i /></i></i>
            )}
          </button>
          )
        })}
        </div>

        <button
          type="button"
          className={`wipe${confirming ? ' confirming' : ''}`}
          disabled={day?.malformed || (day?.blocks.length ?? 0) === 0}
          title={confirming ? 'Click again to clear' : 'Clear this whole day'}
          onClick={() => askWipe(date)}
        >
          <TrashIcon />
          {confirming ? words.wipeConfirm : words.wipe}
        </button>
      </div>
    </section>
  )
})

// Built again only when something it is given changes. Scrolling tells the
// app which days are in view, the app redraws to say so beside the list, and
// without this the whole list — hundreds of days of tags and blocks — was
// built again with it, several times a second, while you scrolled.
export default memo(DayList)
