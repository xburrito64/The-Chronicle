import { useContext, useEffect, useRef, useState } from 'react'
import { searchSeries, seriesSeasons, attachSeries, getSeriesWatched } from './api.js'
import { Covers } from './face.js'
import { recentSeries, seasonToOpen } from './episodes.js'
import { useLookup } from './useLookup.js'
import RecentTiles, { whenOf } from './RecentTiles.jsx'

// Kept level with MAX_EPISODES in server/store.js.
const MAX_PICKED = 60

/**
 * Saying which series was watched: which show, which season, which episodes.
 *
 * The anime picker's three questions, with one difference underneath. TMDB
 * keeps a series as one record with its seasons inside it, so the seasons
 * come with the show in one lookup rather than a walk — and the season is a
 * number the block keeps beside the episodes, because episode 3 means nothing
 * until it is known which season's.
 *
 * Only aired episodes are offered, and the ones already written down on some
 * day are underlined, the same as for anime.
 */
export default function SeriesSearch({ block, startWith, onAttach, onCancel }) {
  const [step, setStep] = useState(startWith ? 'episodes' : 'find')
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const { results, state, configured, problem, setProblem } = useLookup(searchSeries, query)

  const [show, setShow] = useState(null) // the series picked, as the lookup describes it
  const [seasons, setSeasons] = useState(null) // null while it is being asked
  const [season, setSeason] = useState(null)
  const [chosen, setChosen] = useState(() => new Set(startWith ? block.episodes ?? [] : []))
  const [watched, setWatched] = useState({}) // every series, as the vault knows it
  const [recent, setRecent] = useState([])
  const [saving, setSaving] = useState(false)
  const covers = useContext(Covers)

  const input = useRef(null)
  const active = useRef(null)
  const grid = useRef(null)
  const lastRow = useRef(null)

  useEffect(() => { if (step === 'find') input.current?.focus() }, [step])
  useEffect(() => { active.current?.scrollIntoView({ block: 'nearest' }) }, [cursor])

  // What the vault already has: for the last few watched, and for which
  // episodes of a season to underline.
  useEffect(() => {
    let alive = true
    getSeriesWatched()
      .then((all) => {
        if (!alive) return
        setWatched(all)
        setRecent(recentSeries(all, block.show ?? ''))
      })
      .catch(() => {})
    return () => { alive = false }
  }, [block.show])

  /**
   * The seasons of a show, then straight to one of them — `which` picks it
   * from the list, or leaves the list to be chosen from when it answers
   * nothing. One season is not a choice either way.
   */
  async function open(picked, which = () => null) {
    setProblem('')
    setShow(picked)
    setSeasons(null)
    setStep('seasons')
    try {
      const found = await seriesSeasons(picked.id)
      // The full record knows what the search hit didn't: how many seasons,
      // how long an episode runs. It is what gets written down beside the covers.
      setShow({ ...picked, ...found.show, name: picked.name || found.show.name })
      setSeasons(found.seasons)
      const target = which(found.seasons) ?? (found.seasons.length === 1 ? found.seasons[0] : null)
      if (target) choose(target, picked.name || found.show.name)
    } catch (err) {
      setProblem(err.message)
      setSeasons([])
    }
  }

  // Coming in from the card's Episodes button: the show and season are
  // already answered, so straight to that season's grid.
  useEffect(() => {
    if (!startWith) return
    open({ id: startWith.id, name: startWith.name }, (list) => list.find((s) => s.number === startWith.season))
    // Once, for the door that was opened.
  }, [startWith])

  function choose(next, name = show?.name) {
    setSeason(next)
    // The same season of the same show keeps what was picked; anything else
    // starts empty, since episode 7 of one season is not episode 7 of another.
    setChosen(new Set(name === block.show && next.number === block.season ? block.episodes ?? [] : []))
    setStep('episodes')
  }

  const seen = season && show ? watched[show.name]?.seenBySeason?.[season.number] ?? [] : []

  // A long season opens where you are, not at episode one.
  useEffect(() => {
    if (step !== 'episodes' || !grid.current) return
    const marked = grid.current.querySelectorAll('.epon, .epseen')
    marked[marked.length - 1]?.scrollIntoView({ block: 'center' })
  }, [step, seen.length, season?.number])

  // A show twenty-seven seasons long opens its list at the season you were
  // last on, not at season one.
  const lastSeason = show ? watched[show.name]?.lastSeason : null
  useEffect(() => {
    if (step === 'seasons' && seasons?.length) lastRow.current?.scrollIntoView({ block: 'center' })
  }, [step, seasons, lastSeason])

  const toggle = (n) => setChosen((was) => {
    const next = new Set(was)
    if (next.has(n)) next.delete(n)
    else if (next.size < MAX_PICKED) next.add(n)
    return next
  })

  /** Keep it: the poster first, so the whole thing lands as one change. */
  async function keep() {
    if (!season || !show) return
    setSaving(true)
    setProblem('')
    let cover = ''
    try {
      cover = (await attachSeries(show)).cover
    } catch (err) {
      setProblem(`Kept the name, but not the poster — ${err.message}`)
    }
    setSaving(false)
    onAttach({
      name: show.name,
      cover,
      season: season.number,
      episodes: [...chosen].sort((a, b) => a - b),
    })
  }

  function back() {
    setProblem('')
    if (step === 'episodes' && seasons && seasons.length > 1) setStep('seasons')
    else if (step === 'episodes' || step === 'seasons') {
      setStep('find')
      setSeason(null)
    } else onCancel()
  }

  const showingRecent = step === 'find' && query.trim() === '' && recent.length > 0 && configured !== false
  const pickRecent = (r) => open({ id: r.id, name: r.name }, (list) => seasonToOpen(list, r.season, r.seen))

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      if (query) { e.stopPropagation(); setQuery(''); return }
      if (block.show) { e.stopPropagation(); onCancel() }
      return
    }
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
      else open(results[Math.min(cursor, results.length - 1)])
    }
  }

  return (
    <div className="gamepick">
      {step === 'find' ? (
        <div className="gamesearch">
          <input
            ref={input}
            className="gameinput"
            type="text"
            value={query}
            placeholder={block.show ? `Instead of ${block.show}…` : 'Which series?'}
            onChange={(e) => { setQuery(e.target.value); setCursor(0) }}
            onKeyDown={onKeyDown}
          />
          {state === 'searching' && <span className="gamenote">looking…</span>}
        </div>
      ) : (
        <div className="stepline">
          <button type="button" className="stepback" onClick={back} title="Back">←</button>
          <span className="stepwhere">
            {step === 'seasons' || !season
              ? show?.name ?? 'Which season?'
              : `${show?.name ?? ''} · ${season.name}`}
          </span>
        </div>
      )}

      {configured === false && step === 'find' && <NoKey />}
      {problem && <p className="gameproblem">{problem}</p>}

      {showingRecent && (
        <RecentTiles
          blank="📺"
          items={recent.map((r) => ({
            key: r.name,
            name: r.name,
            cover: covers?.get(`show:${r.name}`) ?? watched[r.name]?.cover ?? '',
            meta: `S${r.season}${r.upTo > 0 ? ` E${r.upTo}` : ''} · ${whenOf(r.last)}`,
            title: `${r.name} — straight to its episodes`,
            r,
          }))}
          cursor={cursor}
          setCursor={setCursor}
          onPick={(item) => pickRecent(item.r)}
        />
      )}

      {step === 'find' && state === 'idle' && !block.show && !showingRecent && configured !== false && (
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
          {results.map((found, i) => (
            <li key={found.id}>
              <button
                type="button"
                ref={i === cursor ? active : undefined}
                className={`gameresult${i === cursor ? ' on' : ''}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => open(found)}
              >
                {found.cover
                  ? <img className="gameshot" src={found.cover} alt="" loading="lazy" />
                  : <span className="gameshot none" aria-hidden="true">📺</span>}
                <span className="gamebody">
                  <span className="gametitle">
                    {found.name}
                    {found.year && <b className="gameyear">{found.year}</b>}
                  </span>
                  <span className="gamegenres">{found.genres.join(' · ')}</span>
                  {found.description && <span className="gameblurb">{found.description}</span>}
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
            ? <p className="gamenote">No seasons listed for this one — go back and try again.</p>
            : (
              <ul className="gamelist">
                {seasons.map((s) => (
                  <li key={s.number} ref={s.number === lastSeason ? lastRow : undefined}>
                    <button
                      type="button"
                      className={`gameresult season${s.number === lastSeason ? ' on' : ''}`}
                      onClick={() => choose(s)}
                    >
                      {s.cover
                        ? <img className="gameshot small" src={s.cover} alt="" loading="lazy" />
                        : <span className="gameshot small none" aria-hidden="true">📺</span>}
                      <span className="gamebody short">
                        <span className="gametitle">
                          {/* Only where the name does not already say it: "Season 3" needs no 3 in front. */}
                          {s.name !== `Season ${s.number}` && <b className="seasonno">{s.number}</b>}
                          {s.name}
                          {s.year && <b className="gameyear">{s.year}</b>}
                        </span>
                        <span className="gamegenres">{countOf(s, watched[show?.name]?.seenBySeason?.[s.number])}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
      )}

      {step === 'episodes' && season && (
        season.aired === 0
          ? <p className="gamenote">Nothing of this season has aired yet — keeping the show alone.</p>
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
          <button type="button" className="notebtn" onClick={onCancel}>Keep {block.show}</button>
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

/** What a missing key means here, and where to put one. */
export function NoKey() {
  return (
    <p className="gameproblem">
      Series and films are looked up on TMDB, which needs a free key. Add yours under{' '}
      <strong>Settings → Setup</strong> — there is nothing to restart.
    </p>
  )
}

/** A season's episodes, said the way its state makes true, and how far you are. */
function countOf(season, seen = []) {
  if (season.aired === 0) return 'not out yet'
  const out = season.episodes && season.aired >= season.episodes
    ? `${season.episodes} episodes`
    : `${season.aired} of ${season.episodes ?? '?'} aired`
  return seen.length ? `${out} · ${seen.length} written down` : out
}
