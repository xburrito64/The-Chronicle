import { useContext, useEffect, useState } from 'react'
import {
  coverUrl, getSeriesWatched, getMoviesWatched, setSeriesGenres, setMovieGenres,
} from './api.js'
import { COVER_ASPECT, Covers, coverFor } from './face.js'
import { formatMinutes } from './time.js'
import { episodeLabel } from './episodes.js'
import { PenIcon, TagsIcon, ClockIcon, EpisodeIcon } from './icons.jsx'
import { GenreInput } from './AnimeCard.jsx'

const MAX_GENRES = 6

/**
 * The series or film a block was, beside the note about it: the poster, the
 * name, what the evening was, and how much time the whole thing has taken
 * across every day in the vault.
 *
 * The anime card without its AniList half — TMDB is only ever read from, so
 * there is nothing here to send anywhere.
 *
 * `kind` is 'series' or 'movie'.
 */
export default function WatchCard({ kind, block, onChange, onEpisodes, onRemove }) {
  const series = kind === 'series'
  const name = series ? block.show : block.film
  const [facts, setFacts] = useState(null)
  const [genres, setLocalGenres] = useState(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let alive = true
    ;(series ? getSeriesWatched() : getMoviesWatched())
      .then((all) => {
        if (!alive) return
        setFacts(all[name] ?? null)
        setLocalGenres(all[name]?.genres ?? [])
      })
      .catch(() => { if (alive) setFacts(null) })
    return () => { alive = false }
  }, [series, name, block.startSlot, block.endSlot])

  function keep(next) {
    setLocalGenres(next)
    setAdding(false)
    ;(series ? setSeriesGenres : setMovieGenres)(name, next).catch(() => {})
  }

  const shown = genres ?? []
  const cover = coverFor(block, useContext(Covers))
  const blank = series ? '📺' : '🎬'

  return (
    <div className="gamecard">
      {cover
        ? <img className="gamecover" style={{ '--cover-aspect': COVER_ASPECT }} src={coverUrl(cover)} alt="" />
        : <span className="gamecover none" aria-hidden="true">{blank}</span>}

      <div className="gamefacts">
        <span className="gamename">{name}</span>
        <span className="gamerule" aria-hidden="true"><i /></span>

        {/* What the evening was: which season and episodes of a series, and
            for a film how long it runs. */}
        <span className="gamestat">
          <EpisodeIcon />
          {series
            ? `${Number.isInteger(block.season) ? `Season ${block.season}` : 'No season'}`
              + `${block.episodes?.length ? ` · ${episodeLabel(block.episodes)}` : ''}`
            : facts?.duration ? formatMinutes(facts.duration) : 'Film'}
          {facts?.year && <b className="gameyear">{facts.year}</b>}
        </span>

        {(shown.length > 0 || editing) && (
          <span className={`gamestat genres${editing ? ' editing' : ''}`}>
            <TagsIcon />
            {editing ? (
              <span className="genrelist">
                {shown.map((genre) => (
                  <span className="genre" key={genre} title={genre}>
                    <span className="genrename">{genre}</span>
                    <button
                      type="button"
                      className="genrex"
                      title={`Not ${genre}`}
                      onClick={() => keep(shown.filter((g) => g !== genre))}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {adding
                  ? <GenreInput onDone={(g) => (g ? keep([...shown, g]) : setAdding(false))} />
                  : shown.length < MAX_GENRES && (
                    <button type="button" className="genreadd" title="Add a genre" onClick={() => setAdding(true)}>+</button>
                  )}
              </span>
            ) : (
              <span className="genretext" title={shown.join(' · ')}>{shown.join(' · ')}</span>
            )}
          </span>
        )}

        <span className="gamefoot">
          {/* Every sitting added up. For a film watched more than once, how
              many times as well. */}
          {facts?.minutes > 0 && (
            <span className="gamestat" title={spanOf(facts)}>
              <ClockIcon />
              {formatMinutes(facts.minutes)}
              {!series && facts.times > 1 && <b className="gameyear">{facts.times}×</b>}
            </span>
          )}
          <button
            type="button"
            className={`gameedit${editing ? ' on' : ''}`}
            title={editing ? 'Done' : 'Change what this is'}
            aria-pressed={editing}
            onClick={() => { setAdding(false); setEditing(!editing) }}
          >
            <PenIcon />
          </button>
        </span>

        {editing && (
          <span className="gamecardbtns">
            {series && <button type="button" className="notebtn" onClick={onEpisodes}>Episodes</button>}
            <button type="button" className="notebtn" onClick={onChange}>Change</button>
            <button type="button" className="notebtn" onClick={onRemove}>Remove</button>
          </span>
        )}
      </div>
    </div>
  )
}

/** How many days the total is spread over, and between which of them. */
function spanOf(facts) {
  if (!facts?.days) return undefined
  const days = facts.days === 1 ? 'one day' : `${facts.days} days`
  return facts.first === facts.last
    ? `All of it on ${facts.first}`
    : `Across ${days}, ${facts.first} to ${facts.last}`
}
