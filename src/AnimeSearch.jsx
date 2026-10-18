import { useContext, useEffect, useRef, useState } from 'react'
import { searchAnime, animeSeasons, attachAnime, getWatched } from './api.js'
import { Covers } from './face.js'
import { recentShows } from './episodes.js'
import RecentTiles, { whenOf } from './RecentTiles.jsx'

// Long enough that typing a name doesn't fire a search per letter, short
// enough that stopping feels like the results were already waiting.
const DEBOUNCE_MS = 320
// One letter matches everything and answers with noise.
const MIN_QUERY = 2

// Kept level with MAX_EPISODES in server/store.js: the server is the one that
// enforces it, this only stops you clicking a box that won't be kept.
const MAX_PICKED = 60

/**
 * Saying what was watched: which show, which season of it, which episodes.
 *
 * Three questions, asked one after another rather than all at once, because
 * each one is only answerable once the one before it has been. AniList keeps
 * every season as a separate record, so "which season" is really a second
 * lookup and not a field — and the episodes cannot be listed until it is
 * known whose episodes they are.
 *
 * A show still going out only offers the episodes that have actually aired.
 * There is no honest way to have watched episode 12 of a show that has
 * broadcast eight, and offering it invites a mistake nothing would catch.
 *
 * The name and the numbers are the record: they are what the note in the
 * vault says, and what it will still say with none of this installed. The
 * cover is a copy kept beside the notes for the same reason.
 */
export default function AnimeSearch({ block, startWith, onAttach, onCancel }) {
  // find -> seasons -> episodes. Coming in from the card's Episodes button
  // starts at the end of that, since the first two are already answered.
  const [step, setStep] = useState(startWith ? 'episodes' : 'find')

  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [state, setState] = useState('idle') // idle | searching | done | error
  const [cursor, setCursor] = useState(0)
  const [problem, setProblem] = useState('')

  const [seasons, setSeasons] = useState(null) // null while it is being asked
  const [season, setSeason] = useState(null)
  const [chosen, setChosen] = useState(() => new Set(startWith ? block.episodes ?? [] : []))
  const [seen, setSeen] = useState([]) // already written down on some day
  const [saving, setSaving] = useState(false)
  // The last few shows watched, offered before anything is typed: most
  // evenings are the next episode of something already on the go.
  const [recent, setRecent] = useState([])
  const covers = useContext(Covers)

  const input = useRef(null)
  const active = useRef(null)
  const grid = useRef(null)

  // The box appears, the cursor is in it. Opening an Anime block with nothing
  // attached is the question being asked, and it should not need a click.
  useEffect(() => { if (step === 'find') input.current?.focus() }, [step])

  useEffect(() => {
    if (startWith) return
    let alive = true
    getWatched()
      .then((all) => { if (alive) setRecent(recentShows(all, block.show ?? '')) })
      .catch(() => {})
    return () => { alive = false }
  }, [startWith, block.show])

  // Coming straight to the episodes: the seasons still have to be fetched,
  // both for the aired count and so the way back up is there.
  useEffect(() => {
    if (!startWith) return
    let alive = true
    animeSeasons(startWith.id)
      .then(({ seasons: found }) => {
        if (!alive) return
        setSeasons(found)
        setSeason(found.find((s) => s.id === startWith.id) ?? found[0] ?? null)
      })
      .catch((err) => { if (alive) setProblem(err.message) })
    return () => { alive = false }
  }, [startWith])

  useEffect(() => {
    const q = query.trim()
    if (q.length < MIN_QUERY) {
      setResults([])
      setState('idle')
      return
    }

    // Every search abandons the one before it. Otherwise the answer to half a
    // word can arrive after the answer to the whole one and overwrite it.
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setState('searching')
      try {
        const body = await searchAnime(q, controller.signal)
        if (controller.signal.aborted) return
        setResults(body.results)
        setCursor(0)
        setState('done')
      } catch (err) {
        if (controller.signal.aborted || err.name === 'AbortError') return
        setProblem(err.message)
        setState('error')
      }
    }, DEBOUNCE_MS)

    return () => { clearTimeout(timer); controller.abort() }
  }, [query])

  useEffect(() => { active.current?.scrollIntoView({ block: 'nearest' }) }, [cursor])

  // Which episodes of this season are already written down somewhere in the
  // vault. Marked in the grid rather than enforced — the point is to show you
  // where you had got to, not to stop you saying you rewatched one.
  useEffect(() => {
    if (!season) return
    let alive = true
    getWatched()
      .then((all) => { if (alive) setSeen(all[season.name]?.seen ?? []) })
      .catch(() => { if (alive) setSeen([]) })
    return () => { alive = false }
  }, [season?.name])

  // Long-running shows are a thousand boxes, and the useful end of that is
  // the end you are at. Puts the last one you have seen in view, so a show
  // eight hundred episodes in doesn't open at episode one.
  useEffect(() => {
    if (step !== 'episodes' || !grid.current) return
    const marked = grid.current.querySelectorAll('.epon, .epseen')
    marked[marked.length - 1]?.scrollIntoView({ block: 'center' })
  }, [step, seen.length, season?.id])

  async function pick(show) {
    setProblem('')
    setSeasons(null)
    setStep('seasons')
    try {
      const { seasons: found } = await animeSeasons(show.id)
      setSeasons(found)
      // One season is not a choice. Straight past it to the episodes, which
      // is the question that was actually left.
      if (found.length === 1) choose(found[0])
    } catch (err) {
      setProblem(err.message)
      setSeasons([])
    }
  }

  /**
   * One of the shows watched lately: straight to the season that was being
   * watched, and its episodes. Every season is its own record, so the one
   * remembered is the one to open; the list of all of them is still one step
   * back, for the evening the next season was started.
   */
  async function pickRecent(show) {
    setProblem('')
    setSeasons(null)
    setStep('seasons')
    try {
      const { seasons: found } = await animeSeasons(show.id)
      setSeasons(found)
      const same = found.find((s) => String(s.id) === String(show.id))
        ?? found.find((s) => s.name === show.name)
      if (same) choose(same)
    } catch (err) {
      setProblem(err.message)
      setSeasons([])
    }
  }

  function choose(next) {
    setSeason(next)
    // Coming back to the season already attached keeps what was picked; a
    // different one starts empty, since episode 7 of one show is not episode
    // 7 of another.
    setChosen(new Set(next.name === block.show ? block.episodes ?? [] : []))
    setStep('episodes')
  }

  const toggle = (n) => setChosen((was) => {
    const next = new Set(was)
    if (next.has(n)) next.delete(n)
    else if (next.size < MAX_PICKED) next.add(n)
    return next
  })

  /**
   * Keep it. The cover is fetched first so the whole thing lands as one
   * change — one line in the note, and one ctrl+z to take it back.
   *
   * A cover that won't come is not a reason to lose the name. The name and
   * the episodes are the part that matters; say what went wrong and keep it.
   */
  async function keep() {
    if (!season) return
    setSaving(true)
    setProblem('')
    let cover = ''
    try {
      const kept = await attachAnime(season)
      cover = kept.cover
    } catch (err) {
      setProblem(`Kept the name, but not the cover — ${err.message}`)
    }
    setSaving(false)
    onAttach({ name: season.name, cover, episodes: [...chosen].sort((a, b) => a - b) })
  }

  function back() {
    setProblem('')
    if (step === 'episodes' && seasons && seasons.length > 1) setStep('seasons')
    else if (step === 'episodes' || step === 'seasons') {
      setStep('find')
      setSeason(null)
    } else onCancel()
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      // Clear the box first; only an empty one goes back a step.
      if (query) { e.stopPropagation(); setQuery(''); return }
      // Something already attached: escape is "never mind", which puts it
      // back rather than closing the note out from under a half-asked
      // question.
      if (block.show) { e.stopPropagation(); onCancel() }
      return
    }
    // Before anything is typed the arrows and Enter work the shows watched
    // lately instead — so Enter alone carries on with the last one.
    const offering = showingRecent ? recent : results
    if (offering.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(offering.length - 1, c + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(0, c - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (showingRecent) pickRecent(recent[Math.min(cursor, recent.length - 1)])
      else pick(results[cursor])
    }
  }

  const showingRecent = step === 'find' && query.trim() === '' && recent.length > 0

  return (
    <div className="gamepick">
      {step === 'find' ? (
        <div className="gamesearch">
          <input
            ref={input}
            className="gameinput"
            type="text"
            value={query}
            placeholder={block.show ? `Instead of ${block.show}…` : 'Which anime?'}
            onChange={(e) => { setQuery(e.target.value); setCursor(0) }}
            onKeyDown={onKeyDown}
          />
          {state === 'searching' && <span className="gamenote">looking…</span>}
        </div>
      ) : (
        // The way back, and where you are. One line, because the two are the
        // same thought: this is the show, and that is how to leave it.
        <div className="stepline">
          <button type="button" className="stepback" onClick={back} title="Back">←</button>
          <span className="stepwhere">
            {step === 'seasons' ? 'Which season?' : season?.name ?? 'Which episodes?'}
          </span>
        </div>
      )}

      {problem && <p className="gameproblem">{problem}</p>}

      {/* The card is not empty, it is unwritten — same as a day with nothing
          on it. Only before anything is typed, and only when there is nothing
          to go back to; changing a show already says what it is changing. */}
      {showingRecent && (
        <RecentTiles
          items={recent.map((show) => ({
            key: show.name,
            name: show.name,
            cover: covers?.get(`show:${show.name}`) ?? '',
            meta: `${show.upTo > 0 ? `ep ${show.upTo} · ` : ''}${whenOf(show.last)}`,
            title: `${show.name} — straight to its episodes`,
            show,
          }))}
          cursor={cursor}
          setCursor={setCursor}
          onPick={(item) => pickRecent(item.show)}
        />
      )}

      {step === 'find' && state === 'idle' && !block.show && !showingRecent && (
        <p className="gameunnamed">
          <span className="gamerule" aria-hidden="true"><i /></span>
          Something unwatched
          <i>type a few letters to say what</i>
        </p>
      )}

      {step === 'find' && state === 'done' && results.length === 0 && (
        <p className="gamenote">Nothing by that name.</p>
      )}

      {step === 'find' && results.length > 0 && (
        <ul className="gamelist">
          {results.map((show, i) => (
            <li key={show.id}>
              <button
                type="button"
                ref={i === cursor ? active : undefined}
                className={`gameresult${i === cursor ? ' on' : ''}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => pick(show)}
              >
                {show.cover
                  ? <img className="gameshot" src={show.cover} alt="" loading="lazy" />
                  : <span className="gameshot none" aria-hidden="true">🌸</span>}
                <span className="gamebody">
                  <span className="gametitle">
                    {show.name}
                    {show.year && <b className="gameyear">{show.year}</b>}
                  </span>
                  <span className="gamegenres">{countOf(show)}</span>
                  {show.description && <span className="gameblurb">{show.description}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {step === 'seasons' && (
        seasons === null
          ? <p className="gamenote">finding the seasons…</p>
          : seasons.length === 0
            ? <p className="gamenote">Couldn't ask about the seasons — go back and try again.</p>
            : (
            <ul className="gamelist">
              {seasons.map((s, i) => (
                <li key={s.id}>
                  <button type="button" className="gameresult season" onClick={() => choose(s)}>
                    {s.cover
                      ? <img className="gameshot small" src={s.cover} alt="" loading="lazy" />
                      : <span className="gameshot small none" aria-hidden="true">🌸</span>}
                    <span className="gamebody short">
                      <span className="gametitle">
                        <b className="seasonno">{i + 1}</b>
                        {s.name}
                        {s.year && <b className="gameyear">{s.year}</b>}
                      </span>
                      <span className="gamegenres">{countOf(s)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
      )}

      {step === 'episodes' && season && (
        season.aired === 0
          ? <p className="gamenote">Nothing has aired yet — keeping the show alone.</p>
          : (
            <>
              <div className="epgrid" ref={grid}>
                {Array.from({ length: season.aired }, (_, i) => i + 1).map((n) => (
                  <button
                    type="button"
                    key={n}
                    className={`ep${chosen.has(n) ? ' epon' : ''}${seen.includes(n) ? ' epseen' : ''}`}
                    title={seen.includes(n) ? `Episode ${n} — already written down` : `Episode ${n}`}
                    onClick={() => toggle(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="epnote">
                {chosen.size === 0
                  ? 'Click the ones you watched.'
                  : `${chosen.size} picked${chosen.size >= MAX_PICKED ? ' — that is the lot' : ''}`}
                {seen.length > 0 && <i> · underlined are already written down</i>}
              </p>
            </>
          )
      )}

      <span className="gamecardbtns">
        {block.show && step === 'find' && (
          <button type="button" className="notebtn" onClick={onCancel}>
            Keep {block.show}
          </button>
        )}
        {step === 'episodes' && season && (
          <button type="button" className="notebtn keep" disabled={saving} onClick={keep}>
            {saving ? 'keeping…' : 'Done'}
          </button>
        )}
      </span>
    </div>
  )
}

/**
 * How many episodes, said the way the show's own state makes true: a finished
 * show has a number, one still going out has got as far as it has got, and
 * one that hasn't started has neither.
 */
function countOf(show) {
  if (show.aired === 0) return show.year ? 'not out yet' : ''
  if (show.episodes && show.aired >= show.episodes) return `${show.episodes} episodes`
  return `${show.aired} of ${show.episodes ?? '?'} aired`
}

