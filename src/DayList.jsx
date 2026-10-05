import { memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  SLOTS_PER_DAY, slotToTime, formatDuration, shiftDate, todayISO,
  daysBetween, formatDayHeading, paintSpans,
} from './time.js'
import { useFirstDay } from './useFirstDay.js'
import { useBirthdays } from './useBirthdays.js'
import { monthByTag } from './scenes/starlit.js'
import { useFeastPreview } from './feastPreview.js'
import { applyResize, layoutLanes, moveBlocks, clampShift, cutPartner } from './blocks.js'
import Tools, { selects } from './Tools.jsx'
import { blockFace, Covers } from './face.js'
import { Appearance } from './appearance.js'
import TagIcon from './TagIcon.jsx'
import DayRow from './DayRow.jsx'

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

// What can be done in the Day view, a little at a time: one line too long
// for the window only ever showed its first half. Each says one thing, and
// they take turns.
const DAY_TIPS = [
  'Pick a tag under a day, then drag across its bar to add time',
  'Click a block for its note · drag it to move it · drag an edge to stretch it',
  'Drag on empty space to select blocks · shift-click adds or takes one away',
  'ctrl+c copies · ctrl+v pastes where you point · ctrl+z undoes',
  'ctrl+f finds anything you have written · ctrl+scroll makes the rows taller or shorter',
  'V moves and selects · S snips a block in two',
]
const TIP_EVERY_MS = 8000

/** Tips taking turns, each fading in where the last one was. */
function TakingTurns({ tips }) {
  const [at, setAt] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setAt((i) => (i + 1) % tips.length), TIP_EVERY_MS)
    return () => clearInterval(timer)
  }, [tips])
  return <span key={at} className="tip-turn">{tips[at]}</span>
}

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

// How far a painted stretch may run past the day it started on. One, because
// the point of it is an activity that ran past midnight, and a drag that
// reaches further than the next bar is far more likely to be a slip than a
// day and a half of the same thing.
const PAINT_REACH_DAYS = 1

// How long a block's wipe-in runs for, from the CSS. A block older than
// this is settled, and dropping the animation from it is not something
// anyone can see.
const INK_MS = 600


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
  // A feast being tried in the settings, worn by today's row.
  const tried = useFeastPreview()
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
                        : <TakingTurns tips={DAY_TIPS} />}
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
              tried={date === today ? tried : null}
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

// Built again only when something it is given changes. Scrolling tells the
// app which days are in view, the app redraws to say so beside the list, and
// without this the whole list — hundreds of days of tags and blocks — was
// built again with it, several times a second, while you scrolled.
export default memo(DayList)
