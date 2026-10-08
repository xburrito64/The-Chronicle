import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DayList, { ZOOM } from './DayList.jsx'
import NotePanel from './NotePanel.jsx'
import Totals from './Totals.jsx'
import FindBar from './FindBar.jsx'
import Settings from './Settings.jsx'
import TideScene, { daysDown } from './scenes/TideScene.jsx'
import PetalScene from './scenes/PetalScene.jsx'
import HearthScene from './scenes/HearthScene.jsx'
import TermScene, { TermMonitor } from './scenes/TermScene.jsx'
import { modeOf } from './scenes/terminal.js'
import ScriptScene from './scenes/ScriptScene.jsx'
import { Initial, HourOf } from './scenes/ScriptParts.jsx'
import StarScene from './scenes/StarScene.jsx'
import { MoonWords } from './scenes/StarParts.jsx'
import { RANK_DAYS } from './scenes/starlit.js'
import { restWhenAway } from './scenes/loop.js'
import { branchDays } from './scenes/petals.js'
import { wordsFor } from './themeWords.js'
import { useDays } from './useDays.js'
import { loadPeriod, savePeriod, periodOf } from './ledger.js'
import { getTags, findBlocks, getPlayed, getWatched, getSetup } from './api.js'
import { Covers } from './face.js'
import {
  Appearance, loadAppearance, saveAppearance, normalise, widthOf, wearTheme,
} from './appearance.js'
import {
  applyPaint, applyResize, removeBlock, setNote, setGame, setShow,
  newId, overlapCluster, snipBlock, moveBlocks, pasteBlocks,
} from './blocks.js'
import {
  todayISO, formatDotted, minutesNow, shiftDate, daysBetween, MINUTES_PER_SLOT, SLOTS_PER_DAY,
} from './time.js'
import { TOOL_KEYS, selects } from './Tools.jsx'

const zoomKey = (mode) => `daily-documenter:zoom:${mode}`

// How often the screen asks what covers exist. Cheap — the answer is a list
// the server already keeps — and the app asks again whenever its window comes
// back to the front, so this is only the floor for a window left open all day.
const COVERS_EVERY_MS = 10 * 60_000

/** Every cover the vault knows of, keyed the way face.js looks them up. */
async function knownCovers() {
  const [games, shows] = await Promise.all([
    getPlayed().catch(() => ({})),
    getWatched().catch(() => ({})),
  ])
  const covers = new Map()
  for (const [name, facts] of Object.entries(games ?? {})) if (facts?.cover) covers.set(`game:${name}`, facts.cover)
  for (const [name, facts] of Object.entries(shows ?? {})) if (facts?.cover) covers.set(`show:${name}`, facts.cover)
  return covers
}

/**
 * Whether a key was pressed inside the settings panel. Keys there belong to
 * the panel: Delete at the end of a tag's name must not take the open block
 * with it, and Ctrl+C there is about the words in the box.
 */
const inSettings = (el) => el instanceof Element && Boolean(el.closest('.settings'))

/**
 * What Ctrl+C keeps of some blocks: everything each one was except when it
 * happened, and `at` — when it started, counted in ten minutes from the start
 * of the first of their days — so that a paste can keep them as far apart as
 * they were. `from` names what was copied, so the note can say "Copied".
 */
function copyOf(from, picks, days) {
  const first = picks.reduce((a, p) => (p.date < a ? p.date : a), picks[0].date)
  const items = picks
    .map(({ date, id }) => ({ date, block: days[date]?.blocks.find((b) => b.id === id) }))
    .filter((p) => p.block)
    .map(({ date, block }) => ({
      tag: block.tag,
      note: block.note ?? '',
      game: block.game ?? '',
      show: block.show ?? '',
      episodes: block.episodes ?? [],
      cover: block.cover ?? '',
      slots: block.endSlot - block.startSlot,
      at: daysBetween(first, date) * SLOTS_PER_DAY + block.startSlot,
    }))
  return items.length > 0 ? { from, items } : null
}

/** Every day that is read in and can be written, as { date: blocks }. */
const writable = (days) => Object.fromEntries(
  Object.entries(days).filter(([, d]) => !d.malformed).map(([date, d]) => [date, d.blocks]),
)

/** Whether the key went to something with a cursor in it. */
const inBox = (el) => el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement

const sameCovers = (a, b) => a.size === b.size && [...a].every(([key, file]) => b.get(key) === file)

// "not saved" stays plain — it is the one of these you need to act on, and
// the chronicle voice is the wrong register for a problem.
const STATUS_WORDS = {
  loading: 'loading…',
  saving: 'inscribing…',
  saved: 'inscribed',
  error: 'not saved',
  idle: '',
}

/** The save state, as a word and a lit dot that agree with each other. */
function Status({ status }) {
  const word = STATUS_WORDS[status]
  return (
    <span className={`status ${status}`}>
      {word && <i className="statusdot" />}
      {word}
    </span>
  )
}

/**
 * Whether Delete would have nothing to do in this box: no selection, and the
 * cursor already at the end of what is written.
 *
 * Asked of the box rather than assumed from its kind, because a date field
 * has no cursor to ask about and throws when you try — which is a no, not a
 * crash.
 */
function nothingAhead(el) {
  try {
    return el.selectionStart === el.selectionEnd && el.selectionStart === el.value.length
  } catch {
    return false
  }
}

const storedZoom = (mode) => {
  const saved = Number(localStorage.getItem(zoomKey(mode)))
  const limits = ZOOM[mode]
  return saved >= limits.min && saved <= limits.max ? saved : limits.start
}

export default function App() {
  const [view, setView] = useState('day') // day | compact
  const [tags, setTags] = useState([])
  const [tagError, setTagError] = useState(null)
  const [armed, setArmed] = useState(null) // { date, tag } — a tag armed for one day
  const [selected, setSelected] = useState(null) // { date, id }
  // What Ctrl+C took: everything some blocks were, minus where they were (see
  // copyOf). Held for the session only — a clipboard that outlived the app
  // would be a thing to wonder about later rather than a convenience now.
  const [copied, setCopied] = useState(null)
  // Which tool the bar is worked with: move (press, drag, stretch — as it
  // always was), snip, or select. Always move when the app opens, so a tool
  // left on from yesterday never turns a click into something unexpected.
  const [tool, setTool] = useState('move')
  // What the select tool has gathered up: [{ date, id }], across any days.
  const [picked, setPicked] = useState([])
  // Where the pointer is over the bars, for pasting there. Kept in a ref the
  // list writes to: nothing is drawn from it.
  const hoverRef = useRef(null)
  const [find, setFind] = useState(null) // { query, hits, at } while the bar is open
  const [jumpTo, setJumpTo] = useState(null)
  const [visible, setVisible] = useState(null) // days currently on screen
  // Read from a keyboard handler that should not be torn down and rebuilt
  // every time the list scrolls.
  const visibleRef = useRef(visible)
  visibleRef.current = visible

  const [zoom, setZoom] = useState(() => ({
    day: storedZoom('day'),
    compact: storedZoom('compact'),
  }))

  const { days, ensure, editDay, editDays, undo, status, problem } = useDays()

  // Covers found since their blocks were written. Kept the same object while
  // nothing changes, so a quiet check that finds nothing new redraws nothing.
  // The last few weeks as Petalfall's branch: which days bloomed. Worked out
  // whatever the theme, since it is cheap and the days are already here.
  const branch = useMemo(() => branchDays(days, todayISO()), [days])

  const [covers, setCovers] = useState(() => new Map())
  const refreshCovers = useCallback(() => knownCovers()
    .then((next) => setCovers((was) => (sameCovers(was, next) ? was : next)))
    .catch(() => {}), [])
  useEffect(() => {
    refreshCovers()
    const timer = setInterval(refreshCovers, COVERS_EVERY_MS)
    window.addEventListener('focus', refreshCovers)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refreshCovers)
    }
  }, [refreshCovers])

  // How the app looks — picked in the settings, kept on this machine.
  const [appearance, setAppearance] = useState(() => {
    const kept = loadAppearance()
    wearTheme(kept.theme)
    return kept
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Which tab the settings open on, when something other than the gear opens
  // them; the gear opens them wherever they were left.
  const [settingsTab, setSettingsTab] = useState(null)
  // A fresh install has no notes folder until one is picked. Asked once at
  // the start: picking one takes effect at the next start anyway.
  const [noVault, setNoVault] = useState(false)
  useEffect(() => {
    getSetup().then((setup) => setNoVault(setup.vaultFound === false && !setup.nextVault)).catch(() => {})
  }, [])
  // The stretch the ledger beside the Overview adds up, kept between visits.
  const [ledgerChoice, setLedgerChoice] = useState(() => loadPeriod(todayISO()))
  const chooseLedger = useCallback((next) => {
    setLedgerChoice(next)
    savePeriod(next)
  }, [])
  const ledgerFrom = view === 'compact' ? periodOf(ledgerChoice, todayISO()).from : null
  const ledgerTo = view === 'compact' ? periodOf(ledgerChoice, todayISO()).to : null
  // The same object while the days are the same: the list is handed it, and
  // a new one every draw would draw the list again.
  const ledgerPeriod = useMemo(() => (ledgerFrom ? { from: ledgerFrom, to: ledgerTo } : null), [ledgerFrom, ledgerTo])
  const changeAppearance = (next) => {
    const kept = normalise(next)
    // Before the state changes, so the draw it causes is already in the new
    // theme — see wearTheme.
    wearTheme(kept.theme)
    setAppearance(kept)
    saveAppearance(kept)
  }

  // The page's animations hold still while another window is in front.
  useEffect(() => restWhenAway(), [])

  // Starlit ranks each tag by its last month, so it needs that month read in
  // even when the list only shows a few days of it.
  useEffect(() => {
    if (appearance.theme !== 'starlit') return
    const today = todayISO()
    ensure(shiftDate(today, -(RANK_DAYS - 1)), today)
  }, [appearance.theme, ensure])

  // Asked again whenever the icon set changes: the server works out which
  // picture each tag wears, so a different set is a different list of tags.
  useEffect(() => {
    getTags(appearance.iconSet).then(setTags).catch((err) => setTagError(err.message))
  }, [appearance.iconSet])

  // Escape closes the search, then the settings, then disarms, then closes
  // the note — whatever was opened last goes first.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (find) setFind(null)
      else if (settingsOpen) setSettingsOpen(false)
      else if (armed) setArmed(null)
      else if (picked.length > 0) setPicked([])
      else setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [armed, find, settingsOpen, picked.length])

  // One key for each tool — see TOOL_KEYS. Only on the Day view, where there
  // is something to work on, and never while typing.
  useEffect(() => {
    if (view !== 'day') return
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      if (inSettings(e.target) || inBox(e.target)) return
      const next = Object.keys(TOOL_KEYS).find((t) => TOOL_KEYS[t].includes(e.key.toLowerCase()))
      if (!next) return
      e.preventDefault()
      setTool(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view])

  // What was gathered up belongs to the tools that gather, and goes with them.
  useEffect(() => { if (!selects(tool)) setPicked([]) }, [tool])

  // Only what still exists: a delete, an undo, or two picked blocks moved
  // into one can each leave a pick pointing at nothing.
  const pickedLive = useMemo(
    () => picked.filter((p) => days[p.date]?.blocks.some((b) => b.id === p.id)),
    [picked, days],
  )

  // Takes away everything the select tool has gathered up, as one change.
  const removePicked = useCallback(() => {
    const byDate = new Map()
    for (const { date, id } of pickedLive) byDate.set(date, [...(byDate.get(date) ?? []), id])
    editDays([...byDate].map(([date, ids]) => ({
      date,
      update: (prev) => prev.filter((b) => !ids.includes(b.id)),
    })))
    setSelected((sel) => (sel && pickedLive.some((p) => p.date === sel.date && p.id === sel.id) ? null : sel))
    setPicked([])
  }, [pickedLive, editDays])

  // Delete removes the block whose note is open. Same change the button in the
  // note makes, so ctrl+z takes it back the same way. With blocks gathered up
  // by the select tool it takes all of them instead, as one change.
  useEffect(() => {
    if (pickedLive.length === 0) return
    const onKey = (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (inSettings(e.target) || inBox(e.target)) return
      e.preventDefault()
      removePicked()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pickedLive.length, removePicked])

  useEffect(() => {
    if (!selected || pickedLive.length > 0) return
    const onKey = (e) => {
      if (e.key !== 'Delete') return
      if (inSettings(e.target)) return
      // Delete belongs to the text you are writing — but only while there is
      // text for it to take. Sitting in a box with nothing in front of the
      // cursor it does nothing at all, and having to click out of a box that
      // was going to ignore the key anyway is a step for no reason.
      const el = e.target
      const typing = el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement
      if (typing && !nothingAhead(el)) return
      e.preventDefault()
      editDay(selected.date, (prev) => removeBlock(prev, selected.id))
      setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, editDay, pickedLive.length])

  // Ctrl+Z puts the last change back — a mispainted block, a wrong slide, a
  // delete, a whole day cleared. Everything that changes a day goes through
  // one place, so everything that changes a day can be taken back.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'z' && e.key !== 'Z') return
      if (!e.ctrlKey && !e.metaKey) return
      // In the note, Ctrl+Z belongs to the text you are writing.
      const el = e.target
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return
      e.preventDefault()
      const date = undo()
      if (!date) return
      // Go and look at it, but only if it happened somewhere you can't see.
      // Undoing something already in front of you should not also throw the
      // list around.
      const seen = visibleRef.current
      if (!seen || date < seen.from || date > seen.to) setJumpTo(date)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo])


  /**
   * Whether some of what is in a box is selected.
   *
   * Asked of the box rather than assumed, because a date field has no
   * selection to ask about and throws when you try — which is a no.
   */
  function holding(el) {
    try {
      return el.selectionStart !== el.selectionEnd
    } catch {
      return false
    }
  }

  // Ctrl+C takes the whole of a block — what it was, what was played or
  // watched, which episodes, and whatever was written about it. Everything
  // except when it happened, which is the one thing a paste decides for
  // itself.
  //
  // Whatever the select tool has gathered up goes before the open note: all
  // of it, and how far apart it was.
  //
  // Ctrl+X is the same, and then takes what it copied away — one change, so
  // Ctrl+Z puts it all back.
  useEffect(() => {
    if (!selected && pickedLive.length === 0) return
    const onKey = (e) => {
      const key = e.key.toLowerCase()
      if (key !== 'c' && key !== 'x') return
      if (inSettings(e.target)) return
      if (!e.ctrlKey && !e.metaKey) return
      // Ctrl+C over selected words is the copy everyone means, and stays
      // theirs. With nothing selected there is nothing for it to take — and
      // opening a note puts the cursor in it, so that is where this key is
      // pressed from nearly every time.
      const el = e.target
      if (inBox(el) ? holding(el) : window.getSelection()?.toString()) return
      const copy = pickedLive.length > 0
        ? copyOf('picked', pickedLive, days)
        : copyOf(selected.date + selected.id, [selected], days)
      if (!copy) return
      e.preventDefault()
      // Let go of the note, so the Ctrl+V that follows is about the block too
      // rather than about the words the cursor is still sitting in.
      if (inBox(el)) el.blur()
      setCopied(copy)
      if (key !== 'x') return
      if (pickedLive.length > 0) removePicked()
      else {
        editDay(selected.date, (prev) => removeBlock(prev, selected.id))
        setSelected(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, pickedLive, days, removePicked, editDay])

  // Ctrl+V puts it down on today, starting at the ten minutes you are in.
  // The same thing again, now: which is what copying a block is for.
  //
  // With the select tool it goes where you are pointing instead — that tool
  // is for putting things exactly — and what lands is what is gathered up
  // next, ready to be nudged into place.
  useEffect(() => {
    if (!copied) return
    const onKey = (e) => {
      if (e.key !== 'v' && e.key !== 'V') return
      if (!e.ctrlKey && !e.metaKey) return
      if (inSettings(e.target)) return
      // In a box, paste belongs to the box: putting words into a note is a
      // real thing to want, and there is no telling it apart from this.
      if (inBox(e.target)) return
      e.preventDefault()

      const aimed = selects(tool) && view === 'day' ? hoverRef.current : null
      const date = aimed?.date ?? todayISO()
      const slot = aimed?.slot ?? Math.floor(minutesNow() / MINUTES_PER_SLOT)
      const { days: landed, placed } = pasteBlocks(writable(days), copied.items, date, slot)
      const changes = Object.entries(landed).map(([day, blocks]) => ({ date: day, update: blocks }))
      if (changes.length === 0) return
      editDays(changes)
      if (aimed) setPicked(placed)
      else setJumpTo(date) // it landed on today, which may be nowhere near the screen
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [copied, editDays, days, tool, view])

  // Ctrl+F opens the find bar, or refocuses it if it is already open — the
  // second press selects what is in it, so a new search replaces the old one.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'f' && e.key !== 'F') return
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setFind((was) => (was ? { ...was } : { query: '', hits: [], at: 0 }))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The search itself, a moment after you stop typing. Every keystroke asking
  // the vault would be a read per letter for an answer nobody has looked at
  // yet; an overtaken search is dropped so its answer can't land on top of a
  // newer one.
  const query = find?.query ?? ''
  useEffect(() => {
    if (query.trim() === '') {
      setFind((was) => (was && was.hits.length ? { ...was, hits: [], at: 0 } : was))
      return
    }
    const stop = new AbortController()
    const timer = setTimeout(() => {
      findBlocks(query, stop.signal)
        .then(({ hits }) => setFind((was) => (
          was && was.query === query ? { ...was, hits, at: 0 } : was
        )))
        .catch(() => {}) // an abandoned search is not a problem to report
    }, 140)
    return () => { clearTimeout(timer); stop.abort() }
  }, [query])

  // Walking the results walks the list: the day a match is on is scrolled to,
  // loading it first if it is outside the days already read.
  const hit = find?.hits[find.at]
  useEffect(() => { if (hit) setJumpTo(hit.date) }, [hit?.date, hit?.start])

  const stepFind = (by) => setFind((was) => {
    if (!was || was.hits.length === 0) return was
    const many = was.hits.length
    return { ...was, at: (was.at + by + many) % many }
  })

  useEffect(() => { setArmed(null) }, [view])

  // handleZoom lives inside a wheel listener, so it reads the current view
  // from a ref rather than a stale closure.
  const viewRef = useRef(view)
  viewRef.current = view

  const handleZoom = useCallback((next) => {
    const mode = viewRef.current
    localStorage.setItem(zoomKey(mode), String(next))
    setZoom((z) => ({ ...z, [mode]: next }))
  }, [])

  const handleArm = useCallback((date, tag) => {
    setArmed((a) => (a && a.date === date && a.tag === tag ? null : { date, tag }))
  }, [])

  /**
   * Commit a painted stretch. Usually one day; more when it ran past
   * midnight, which a day file cannot hold, so it lands as one block per day.
   *
   * All of them go in as a single act, so one ctrl+z takes the whole stretch
   * back rather than half of it.
   *
   * `at` is where the pointer went down: it decides whether the new block
   * lands above or below whatever is already there.
   */
  const handlePaint = useCallback((date, spans, at) => {
    if (!armed || armed.date !== date) return
    editDays(spans.map((span) => ({
      date: span.date,
      update: (prev) => applyPaint(prev, {
        id: newId(),
        tag: armed.tag,
        startSlot: span.startSlot,
        endSlot: span.endSlot,
        note: '',
      }, { slot: span.date === date ? at.slot : span.startSlot, lane: at.lane }),
    })))
    setArmed(null)
  }, [armed, editDays])

  /**
   * Say what a block was — which game, which show — or take the name off.
   *
   * Naming one can fold it into a stretch of the same thing it was already
   * touching, and the survivor of that is the other block. So the note
   * follows it in rather than closing on an id that no longer exists — from
   * where you are sitting nothing was deleted, two things became one.
   *
   * Both kinds go through here because both kinds can vanish that way, and
   * the note has to land on its feet either way.
   */
  function handleNamed(id, name) {
    const date = selected.date
    const before = days[date]?.blocks ?? []
    const after = name(before)
    editDay(date, after)

    if (after.some((b) => b.id === id)) return
    const was = before.find((b) => b.id === id)
    const survivor = was && after.find((b) => (
      b.tag === was.tag && b.startSlot <= was.startSlot && b.endSlot >= was.endSlot
    ))
    if (survivor) setSelected({ date, id: survivor.id })
  }

  const handleGame = (id, game) => handleNamed(id, (blocks) => setGame(blocks, id, game))
  const handleShow = (id, show) => handleNamed(id, (blocks) => setShow(blocks, id, show))

  // `at` is only there when the whole block was slid: it is the height the
  // pointer was holding it at. Dragging an edge sends nothing, and keeps the
  // height it already had.
  const handleResize = useCallback((date, id, startSlot, endSlot, at) =>
    editDay(date, (prev) => applyResize(prev, id, startSlot, endSlot, at)), [editDay])

  const handleSnip = useCallback((date, id, slot) =>
    editDay(date, (prev) => snipBlock(prev, id, slot)), [editDay])

  // Read from a ref, so the list is handed one function for good: see below.
  const daysRef = useRef(days)
  daysRef.current = days
  /** Everything picked, moved by the same amount — see moveBlocks. */
  const handleMoveMany = useCallback((picks, by) => {
    const out = moveBlocks(writable(daysRef.current), picks, by)
    if (!out) return
    editDays(Object.entries(out).map(([date, blocks]) => ({ date, update: blocks })))
    setPicked(picks.map(({ date, id }) => ({ date: shiftDate(date, by.days ?? 0), id })))
  }, [editDays])

  // The list is told what to do through these, made once: a new one each time
  // the app redraws would have the whole list — every day, every tag — built
  // again with it, which is what made scrolling stutter. See DayList's memo.
  const handleSelect = useCallback((date, id) => setSelected({ date, id }), [])
  const handlePickDay = useCallback((date) => { setView('day'); setJumpTo(date) }, [])
  const handleWipeDay = useCallback((date) => {
    editDay(date, () => [])
    setSelected((sel) => (sel?.date === date ? null : sel))
  }, [editDay])
  const handleJumped = useCallback(() => setJumpTo(null), [])

  // Days you have actually written something on — the count under the title.
  // Only the loaded window is in `days`, which is the window you have
  // scrolled through, so it grows as you go rather than being the true total.
  const recorded = Object.values(days).filter((d) => !d.malformed && d.blocks.length > 0).length

  // Whatever day is at the top of the list, or today before anything has
  // been scrolled. It is what the picker shows and what it opens on.
  const shownDate = visible?.from ?? todayISO()

  const dayBlocks = selected ? days[selected.date]?.blocks ?? [] : []
  const selectedBlock = selected ? dayBlocks.find((b) => b.id === selected.id) ?? null : null
  // Named across the top of the note, so you can see what else was running.
  const selectedCluster = selectedBlock ? overlapCluster(dayBlocks, selected.id) : []

  return (
    <Appearance.Provider value={appearance}>
    <Covers.Provider value={covers}>
    <div className="app" style={{ maxWidth: widthOf(appearance.barWidth) }}>
      {/* The sky. Each layer is a size of star with its own rate and its own
          brightness — see app.css. Decoration only, so it is hidden from
          anything reading the page. */}
      <div className="sky" aria-hidden="true">
        <i /><i /><i /><i /><i /><i /><i />
      </div>
      {/* A theme with more to it than colours brings its own scene. */}
      {appearance.theme === 'tidewater' && <TideScene days={daysDown(visible, todayISO())} />}
      {appearance.theme === 'starlit' && <StarScene days={days} tags={tags} />}
      {appearance.theme === 'scriptorium' && <ScriptScene days={days} />}
      {appearance.theme === 'petalfall' && (
        <PetalScene branch={branch} onPick={(date) => { setView('day'); setJumpTo(date) }} />
      )}

      <header>
        <div className="titlerow">
          <div className="titleblock">
            {appearance.theme === 'scriptorium' ? (
              // The book's own initial: gilded, on lapis, catching the light.
              <h1 aria-label="The Chronicle">
                <Initial letter="T" level="gilded" colours={['#27458f']} size={66} gleam className="titleinitial" />
                he Chronicle
              </h1>
            ) : (
              <h1>The Chronicle</h1>
            )}
            <span className="subtitle">
              {wordsFor(appearance.theme).recorded(recorded)}
              {appearance.theme === 'scriptorium' && <HourOf />}
              {appearance.theme === 'starlit' && <MoonWords />}
            </span>
          </div>

          <div className="viewswitch">
            <button className={view === 'day' ? 'on' : ''} onClick={() => setView('day')}>Day</button>
            <button
              className={view === 'compact' ? 'on' : ''}
              onClick={() => {
                // The Overview opens on the stretch its ledger is adding up,
                // so the days beside the figures are the days they count.
                if (view !== 'compact') setJumpTo(periodOf(ledgerChoice, todayISO()).from)
                setView('compact')
              }}
            >
              Overview
            </button>
          </div>

          {appearance.theme === 'nightshift' && <TermMonitor days={days} tags={tags} />}

          <button className="control nav today" onClick={() => setJumpTo(todayISO())}>Today</button>
          {/* The date reads as a date rather than as an empty form field, and
              says which day you are looking at rather than nothing at all. The
              real input is laid over it, invisible, so the calendar is still
              one click away — the native one cannot be made to look like this,
              but it can be made to sit behind something that does. */}
          <label className="datepick">
            <span className="datetext">{formatDotted(shownDate)}</span>
            <input
              type="date"
              value={shownDate}
              onChange={(e) => e.target.value && setJumpTo(e.target.value)}
              onClick={(e) => e.currentTarget.showPicker?.()}
            />
          </label>
          <Status status={status} />
          <button
            type="button"
            className={`gear${settingsOpen ? ' on' : ''}`}
            onClick={() => setSettingsOpen((open) => !open)}
            aria-label="Settings"
            aria-expanded={settingsOpen}
            title="Settings"
          >
            {/* Eight teeth worked out around the middle of the box, and the
                hole on that same middle — the old one was drawn by hand,
                and its teeth sat off to one side of the hole. */}
            <svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
              <path d="M8.32 3.72L8.51 1.53L11.49 1.53L11.68 3.72A6.5 6.5 0 0 1 13.25 4.37L14.93 2.96L17.04 5.07L15.63 6.75A6.5 6.5 0 0 1 16.28 8.32L18.47 8.51L18.47 11.49L16.28 11.68A6.5 6.5 0 0 1 15.63 13.25L17.04 14.93L14.93 17.04L13.25 15.63A6.5 6.5 0 0 1 11.68 16.28L11.49 18.47L8.51 18.47L8.32 16.28A6.5 6.5 0 0 1 6.75 15.63L5.07 17.04L2.96 14.93L4.37 13.25A6.5 6.5 0 0 1 3.72 11.68L1.53 11.49L1.53 8.51L3.72 8.32A6.5 6.5 0 0 1 4.37 6.75L2.96 5.07L5.07 2.96L6.75 4.37A6.5 6.5 0 0 1 8.32 3.72Z" />
              <circle cx="10" cy="10" r="2.8" />
            </svg>
          </button>
        </div>
      </header>

      <div className="goldrule" />

      {find && (
        <FindBar
          query={find.query}
          hits={find.hits}
          at={find.at}
          onQuery={(query) => setFind((was) => was && { ...was, query })}
          onStep={stepFind}
          onClose={() => setFind(null)}
        />
      )}

      {noVault && (
        <div className="banner setup">
          Pick the folder your daily notes are in, and your days will be kept there.
          <button
            type="button"
            className="bannerbutton"
            onClick={() => { setSettingsTab('setup'); setSettingsOpen(true) }}
          >
            Open Setup
          </button>
        </div>
      )}
      {tagError && <div className="banner offline">Couldn't load tags.json — {tagError}</div>}
      {problem && <div className={`banner ${problem.kind}`}>{problem.message}</div>}

      <div className={`workspace ${view}`}>
        <DayList
        mode={view}
        days={days}
        tags={tags}
        ensure={ensure}
        armed={view === 'day' ? armed : null}
        onArm={handleArm}
        tool={tool}
        onTool={setTool}
        picked={pickedLive}
        onPick={setPicked}
        onSnip={handleSnip}
        onMoveMany={handleMoveMany}
        hoverRef={hoverRef}
        selected={selected}
        barHeight={zoom[view]}
        onZoom={handleZoom}
        onPaint={handlePaint}
        onResize={handleResize}
        onSelect={handleSelect}
        onPickDay={handlePickDay}
        onWipeDay={handleWipeDay}
        onVisibleRange={setVisible}
        find={find}
        jumpTo={jumpTo}
        onJumped={handleJumped}
        period={ledgerPeriod}
        />
        {/* Kept built while the Day view is up, only out of sight: opening
            the Overview then has the list to build and nothing else. */}
        <Totals
          days={days}
          tags={tags}
          ensure={ensure}
          choice={ledgerChoice}
          onChoice={chooseLedger}
          onJump={setJumpTo}
          hidden={view !== 'compact'}
        />
      </div>

      {selectedBlock && (
        <NotePanel
          block={selectedBlock}
          cluster={selectedCluster}
          copied={copied?.from === selected.date + selected.id}
          onCopy={() => setCopied(copyOf(selected.date + selected.id, [selected], days))}
          date={selected.date}
          tags={tags}
          onNote={(id, note) => editDay(selected.date, (prev) => setNote(prev, id, note))}
          onGame={handleGame}
          onShow={handleShow}
          onDelete={() => {
            editDay(selected.date, (prev) => removeBlock(prev, selected.id))
            setSelected(null)
          }}
          onClose={() => setSelected(null)}
        />
      )}
      {/* Hearthfire's fire has a strip of its own at the foot of the page,
          so it comes last, under everything else. */}
      {appearance.theme === 'hearthfire' && (
        <HearthScene days={days} onToday={() => { setView('day'); setJumpTo(todayISO()) }} />
      )}
      {appearance.theme === 'nightshift' && (
        <TermScene
          days={days}
          tags={tags}
          recorded={recorded}
          mode={modeOf({
            settings: settingsOpen,
            find: Boolean(find),
            armedTag: armed && view === 'day' ? tags.find((t) => t.id === armed.tag)?.name ?? armed.tag : '',
            note: selectedBlock
              ? selectedBlock.game || selectedBlock.show || tags.find((t) => t.id === selectedBlock.tag)?.name || selectedBlock.tag
              : '',
          })}
        />
      )}
      {settingsOpen && (
        <Settings
          openOn={settingsTab}
          appearance={appearance}
          onChange={changeAppearance}
          tags={tags}
          onClose={() => { setSettingsOpen(false); setSettingsTab(null) }}
          onTagsSaved={setTags}
          onPictureChanged={() => getTags(appearance.iconSet).then(setTags).catch(() => {})}
          onResetRows={() => {
            for (const mode of Object.keys(ZOOM)) {
              try { localStorage.removeItem(zoomKey(mode)) } catch { /* nothing kept */ }
            }
            setZoom(Object.fromEntries(Object.entries(ZOOM).map(([mode, z]) => [mode, z.start])))
          }}
          onCoversFound={refreshCovers}
        />
      )}
    </div>
    </Covers.Provider>
    </Appearance.Provider>
  )
}
