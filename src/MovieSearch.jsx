import { useEffect, useRef, useState } from 'react'
import { searchMovies, attachMovie } from './api.js'
import { useLookup } from './useLookup.js'
import { NoKey } from './SeriesSearch.jsx'

/**
 * Saying which film it was. One question rather than three: a film is one
 * sitting, with no seasons and no episodes, so picking it is the end of it.
 */
export default function MovieSearch({ block, onAttach, onCancel }) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [saving, setSaving] = useState(false)
  const { results, state, configured, problem, setProblem } = useLookup(searchMovies, query)
  const input = useRef(null)
  const active = useRef(null)

  useEffect(() => { input.current?.focus() }, [])
  useEffect(() => { active.current?.scrollIntoView({ block: 'nearest' }) }, [cursor])

  /** The poster first, so the whole thing lands as one change. */
  async function pick(film) {
    if (saving) return
    setSaving(true)
    setProblem('')
    let cover = ''
    try {
      cover = (await attachMovie(film)).cover
    } catch (err) {
      setProblem(`Kept the name, but not the poster — ${err.message}`)
    }
    setSaving(false)
    onAttach({ name: film.name, cover })
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      if (query) { e.stopPropagation(); setQuery(''); return }
      if (block.film) { e.stopPropagation(); onCancel() }
      return
    }
    if (results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(results.length - 1, c + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(0, c - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(results[Math.min(cursor, results.length - 1)])
    }
  }

  return (
    <div className="gamepick">
      <div className="gamesearch">
        <input
          ref={input}
          className="gameinput"
          type="text"
          value={query}
          placeholder={block.film ? `Instead of ${block.film}…` : 'Which film?'}
          onChange={(e) => { setQuery(e.target.value); setCursor(0) }}
          onKeyDown={onKeyDown}
        />
        {(state === 'searching' || saving) && <span className="gamenote">{saving ? 'keeping…' : 'looking…'}</span>}
      </div>

      {configured === false && <NoKey />}
      {problem && <p className="gameproblem">{problem}</p>}

      {state === 'idle' && !block.film && configured !== false && (
        <p className="gameunnamed">
          <span className="gamerule" aria-hidden="true"><i /></span>
          Something unwatched
          <i>type a few letters to say what</i>
        </p>
      )}
      {state === 'done' && results.length === 0 && <p className="gamenote">Nothing by that name.</p>}

      {results.length > 0 && (
        <ul className="gamelist">
          {results.map((film, i) => (
            <li key={film.id}>
              <button
                type="button"
                ref={i === cursor ? active : undefined}
                className={`gameresult${i === cursor ? ' on' : ''}`}
                disabled={saving}
                onMouseEnter={() => setCursor(i)}
                onClick={() => pick(film)}
              >
                {film.cover
                  ? <img className="gameshot" src={film.cover} alt="" loading="lazy" />
                  : <span className="gameshot none" aria-hidden="true">🎬</span>}
                <span className="gamebody">
                  <span className="gametitle">
                    {film.name}
                    {film.year && <b className="gameyear">{film.year}</b>}
                  </span>
                  <span className="gamegenres">{film.genres.join(' · ')}</span>
                  {film.description && <span className="gameblurb">{film.description}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {block.film && (
        <span className="gamecardbtns">
          <button type="button" className="notebtn" onClick={onCancel}>Keep {block.film}</button>
        </span>
      )}
    </div>
  )
}
