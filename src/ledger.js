// The ledger beside the Overview: which stretch of days it adds up, and what
// it finds there. Kept apart from the drawing so it can be tested on its own.
//
// Nothing here writes anything. It reads the days the app already holds.

import { SLOTS_PER_DAY, shiftDate, daysBetween, dayOfWeek } from './time.js'

const KEY = 'daily-documenter:ledger'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/** The ways a stretch can be chosen, in the order the switch shows them. */
export const PERIOD_KINDS = [
  { id: 'last30', name: '30 days' },
  { id: 'month', name: 'Month' },
  { id: 'year', name: 'Year' },
  { id: 'range', name: 'Range' },
]

const isDate = (text) => typeof text === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(text)

const lastOfMonth = (year, month) => {
  const d = new Date(year, month, 0) // month is 1-based here: day 0 of the next
  return `${year}-${String(month).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * What the ledger was last set to, made safe to use: anything missing or
 * from another version falls back to the last thirty days, around today.
 *
 * `at` is the date the month and year choices are standing in, and `from`
 * and `to` are the range; each keeps its own, so switching between the
 * kinds returns to where each one was left.
 */
export function normalisePeriod(raw, today) {
  const got = raw && typeof raw === 'object' ? raw : {}
  const kind = PERIOD_KINDS.some((k) => k.id === got.kind) ? got.kind : 'last30'
  const at = isDate(got.at) ? got.at : today
  let from = isDate(got.from) ? got.from : shiftDate(today, -29)
  let to = isDate(got.to) ? got.to : today
  if (from > to) [from, to] = [to, from]
  return { kind, at, from, to }
}

export function loadPeriod(today) {
  try {
    return normalisePeriod(JSON.parse(localStorage.getItem(KEY) ?? 'null'), today)
  } catch {
    return normalisePeriod(null, today)
  }
}

export function savePeriod(choice) {
  try {
    localStorage.setItem(KEY, JSON.stringify(choice))
  } catch { /* nowhere to keep it; it lasts until the window closes */ }
}

/**
 * The days a choice covers: { from, to, title, steps }.
 *
 * `title` is what the ledger is headed with. `steps` is whether the arrows
 * either side of it mean anything: the last thirty days are always the last
 * thirty, so they have nowhere to step to.
 */
export function periodOf(choice, today) {
  const [y, m] = choice.at.split('-').map(Number)
  switch (choice.kind) {
    case 'month':
      return {
        from: `${y}-${String(m).padStart(2, '0')}-01`,
        to: lastOfMonth(y, m),
        title: `${MONTHS[m - 1]} ${y}`,
        steps: true,
      }
    case 'year':
      return { from: `${y}-01-01`, to: `${y}-12-31`, title: String(y), steps: true }
    case 'range':
      return { from: choice.from, to: choice.to, title: null, steps: true }
    default:
      return { from: shiftDate(today, -29), to: today, title: 'The last 30 days', steps: false }
  }
}

/**
 * One step back or forward: a month, a year, or a range by its own length,
 * so a fortnight steps a fortnight at a time.
 */
export function stepPeriod(choice, dir) {
  const [y, m] = choice.at.split('-').map(Number)
  if (choice.kind === 'month') {
    const d = new Date(y, m - 1 + dir, 1)
    return { ...choice, at: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
  }
  if (choice.kind === 'year') return { ...choice, at: `${y + dir}-01-01` }
  if (choice.kind === 'range') {
    const length = daysBetween(choice.from, choice.to) + 1
    return { ...choice, from: shiftDate(choice.from, dir * length), to: shiftDate(choice.to, dir * length) }
  }
  return choice
}

/**
 * The stretch the same length just before it, for "more or less than last
 * time". The month before for a month, the year before for a year.
 */
export function previousOf(choice, today) {
  if (choice.kind === 'month' || choice.kind === 'year') return periodOf(stepPeriod(choice, -1), today)
  const { from, to } = periodOf(choice, today)
  const length = daysBetween(from, to) + 1
  return { from: shiftDate(from, -length), to: shiftDate(to, -length) }
}

/** Every date from `from` to `to`, both included. */
export function datesIn(from, to) {
  const out = []
  for (let d = from; d <= to; d = shiftDate(d, 1)) out.push(d)
  return out
}

/** How much of a day is covered by anything, in slots: overlaps count once. */
export function coveredSlots(blocks) {
  const marks = new Uint8Array(SLOTS_PER_DAY)
  for (const b of blocks) marks.fill(1, b.startSlot, b.endSlot)
  let n = 0
  for (const x of marks) n += x
  return n
}

/** How many slots of the day each tag has, for one day. */
function tagSlots(blocks) {
  const by = new Map()
  for (const b of blocks) by.set(b.tag, (by.get(b.tag) ?? 0) + (b.endSlot - b.startSlot))
  return by
}

/** Half-hour columns in "a typical day". */
export const RHYTHM_BINS = 48
const SLOTS_PER_BIN = SLOTS_PER_DAY / RHYTHM_BINS

/**
 * Everything the ledger says about a stretch of days.
 *
 * Only the days up to today are counted: a month still running has its last
 * days ahead of it, and calling them empty would only drag every average
 * down. Blocks may overlap, so an hour of music during a game counts toward
 * both tags — the tag hours can add up to more than the day — while the
 * hours *logged* are the hours with anything in them, each counted once.
 *
 * Returns:
 *   counted     days from the start up to today (or the end)
 *   logged      of those, days with anything in them
 *   slots       Map tag -> slots
 *   covered     slots with anything in them, over the whole stretch
 *   days        [{ date, covered, top }] for every date in the stretch,
 *               future ones included (covered null) so a calendar can show them
 *   fullest     the day with the most covered, or null
 *   streak      the longest run of logged days, { length, from, to } or null
 *   rhythm      [{ total, tags: Map tag -> share }] per half hour: how much of
 *               the logged days had something then, and what it mostly was
 *   played, watched  Map name -> { slots, cover, episodes }
 */
export function ledgerOf(days, from, to, today, coverOf = () => '') {
  const end = to < today ? to : today
  const slots = new Map()
  const played = new Map()
  const watched = new Map()
  const bins = Array.from({ length: RHYTHM_BINS }, () => ({ any: 0, tags: new Map() }))
  const list = []
  let counted = 0
  let logged = 0
  let covered = 0
  let fullest = null
  let streak = null
  let run = null

  for (const date of datesIn(from, to)) {
    if (date > end) {
      list.push({ date, covered: null, top: null })
      continue
    }
    counted++
    const day = days[date]
    const blocks = day && !day.malformed ? day.blocks : []
    if (blocks.length === 0) {
      list.push({ date, covered: 0, top: null })
      run = null
      continue
    }

    logged++
    const mine = tagSlots(blocks)
    for (const [tag, n] of mine) slots.set(tag, (slots.get(tag) ?? 0) + n)
    const here = coveredSlots(blocks)
    covered += here
    // What the day was mostly: the tag with the most of it.
    let top = null
    for (const [tag, n] of mine) if (!top || n > mine.get(top)) top = tag
    list.push({ date, covered: here, top })
    if (!fullest || here > fullest.covered) fullest = { date, covered: here }

    run = run ? { ...run, to: date, length: run.length + 1 } : { from: date, to: date, length: 1 }
    if (!streak || run.length > streak.length) streak = run

    // The day by half hours: what was on in each, and whether anything was.
    const any = new Uint8Array(RHYTHM_BINS)
    for (const b of blocks) {
      for (let s = b.startSlot; s < b.endSlot; s++) {
        const bin = Math.floor(s / SLOTS_PER_BIN)
        any[bin] = 1
        const into = bins[bin].tags
        into.set(b.tag, (into.get(b.tag) ?? 0) + 1)
      }
    }
    for (let i = 0; i < RHYTHM_BINS; i++) bins[i].any += any[i]

    for (const b of blocks) {
      const name = b.game || b.show || b.film
      if (!name) continue
      const into = b.game ? played : watched
      const had = into.get(name) ?? { slots: 0, cover: '', episodes: 0 }
      into.set(name, {
        slots: had.slots + (b.endSlot - b.startSlot),
        // The first cover seen wins.
        cover: had.cover || coverOf(b),
        episodes: had.episodes + (b.episodes?.length ?? 0),
      })
    }
  }

  // Each half hour: how many of the logged days had anything in it, and of
  // what was there, each tag's share.
  const rhythm = bins.map(({ any, tags }) => {
    const all = [...tags.values()].reduce((a, b) => a + b, 0)
    return {
      total: logged ? any / logged : 0,
      tags: new Map([...tags].map(([tag, n]) => [tag, n / all])),
    }
  })

  return { counted, logged, slots, covered, days: list, fullest, streak, rhythm, played, watched }
}

/**
 * The weeks of a stretch for a calendar, Monday first: rows of seven, with
 * null where a week runs past either end.
 */
export function weeksOf(dates) {
  if (dates.length === 0) return []
  const lead = (dayOfWeek(dates[0]) + 6) % 7
  const cells = [...Array(lead).fill(null), ...dates]
  while (cells.length % 7) cells.push(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** "Oct", for a calendar of many months. */
export const monthShort = (iso) => MONTHS[Number(iso.slice(5, 7)) - 1].slice(0, 3)
