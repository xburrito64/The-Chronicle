import { memo } from 'react'
import {
  SLOTS_PER_DAY, MINUTES_PER_DAY, slotToTime, todayISO,
  formatDayHeading, formatShortDate, weekdayOf, dayOfWeek,
} from './time.js'
import { useMinute } from './useMinute.js'
import { Initial, Chronicle } from './scenes/ScriptParts.jsx'
import { illumination } from './scenes/manuscript.js'
import { MagicCircle, Moonweed, RankGem, rankTitle } from './scenes/StarParts.jsx'
import { isComplete } from './scenes/starlit.js'
import { festivalOf } from './scenes/festivals.js'
import { FestiveMark, Spider } from './scenes/Festive.jsx'
import { FeastHeading } from './scenes/HoursFeasts.jsx'
import { FeastGround, FeastBar } from './scenes/HoursFeastBars.jsx'
import { feastOf } from './scenes/hoursFeasts.js'
import { previewFestival } from './feastPreview.js'
import { applyPaint, applyResize, layoutLanes, stripsOf } from './blocks.js'
import { pieceLook, runeSpans, RUNES_MIN_BAND, PEEK_MAX } from './blockLooks.js'
import { blockFace } from './face.js'
import { wordsFor } from './themeWords.js'
import TagIcon, { clampScale } from './TagIcon.jsx'

// One day on the list, and everything drawn in it: the bar with its blocks,
// their names and grab strips, and in the Day view the heading, the hours and
// the tags under it. The list (DayList.jsx) decides which days are built and
// handles the pointer; this only draws what it is handed.

const pct = (slot) => (slot / SLOTS_PER_DAY) * 100
const PREVIEW_ID = '__preview' // the block being painted, not yet committed

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
  pickedIds, snipAt, groupBlocks, tried,
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
  const festival = !(starlit || scriptorium) ? null
    : tried ? previewFestival(tried) : festivalOf(date, firstDay, birthdays)
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

export default DayRow
