import { useContext, useEffect, useRef, useState } from 'react'
import { slotToTime, formatDuration } from './time.js'
import { blockFace, Covers } from './face.js'
import GameSearch from './GameSearch.jsx'
import GameCard from './GameCard.jsx'
import AnimeSearch from './AnimeSearch.jsx'
import AnimeCard from './AnimeCard.jsx'
import SeriesSearch from './SeriesSearch.jsx'
import MovieSearch from './MovieSearch.jsx'
import WatchCard from './WatchCard.jsx'
import { getWatched, getSeriesWatched } from './api.js'
import TagIcon from './TagIcon.jsx'

/** The tags that ask what they were. Everything else is only its tag. */
const GAME = 'game'
const ANIME = 'anime'
const SERIES = 'series'
const MOVIE = 'movie'

/**
 * The note for one block. `block` is the one clicked — its own text, its own
 * times, and what Delete removes. `cluster` is everything overlapping it, listed
 * across the top so you can see what else was running at the same time.
 */
export default function NotePanel({
  cluster, block, date, tags, onNote, onGame, onShow, onSeries, onFilm, onDelete, onClose, onCopy, copied,
}) {
  const covers = useContext(Covers)
  const area = useRef(null)
  const tagFor = (id) => tags.find((t) => t.id === id)

  const clickedTag = tagFor(block.tag)
  const named = {
    [GAME]: block.game, [ANIME]: block.show, [SERIES]: block.show, [MOVIE]: block.film,
  }[block.tag] ?? ''
  const searchable = [GAME, ANIME, SERIES, MOVIE].includes(block.tag)

  // Asking to change one opens the search back over it without taking it off
  // first: a search that finds nothing should leave you where you were rather
  // than having thrown away what you had.
  //
  // 'episodes' is the same door held open at a different room — the show is
  // right, and only which of it was watched is in question.
  const [changing, setChanging] = useState(null) // null | 'show' | 'episodes'
  useEffect(() => { setChanging(null) }, [block.id])

  // Going straight to the episodes needs the id AniList knows the show by,
  // which lives beside the covers rather than in the note. Asked for only
  // when that door is opened.
  const [startWith, setStartWith] = useState(null)

  const searching = searchable && (!named || changing !== null)
  // A block with nothing attached opens on the question, not on the note:
  // naming what you did is the thing you came here to do, and the note is
  // still one tab away.
  const askFirst = searchable && !named

  // Opening the panel should put the cursor straight in the text — unless the
  // search is going to want it.
  //
  // On opening, and only on opening. Attaching something turns the question
  // off, and following that with the cursor would drag it into the note
  // nobody asked to write — and take ctrl+z with it, which at that moment
  // means "not that one", and is the first thing you would reach for.
  const opened = useRef(null)
  useEffect(() => {
    const fresh = opened.current !== block.id
    opened.current = block.id
    if (fresh && !askFirst) area.current?.focus()
  }, [block.id, askFirst])

  /**
   * Straight to the grid of episodes, skipping the two questions already
   * answered. The show's AniList id is kept beside the covers rather than in
   * the note, so it is fetched here and handed over; without it the search
   * simply starts at the top, which is a longer way round rather than a wall.
   */
  async function toEpisodes() {
    // A series knows its season already; only the TMDB id is beside the covers.
    if (block.tag === SERIES) {
      try {
        const known = (await getSeriesWatched())[block.show]
        setStartWith(known?.tmdbId ? { id: known.tmdbId, name: block.show, season: block.season } : null)
      } catch {
        setStartWith(null)
      }
      setChanging('episodes')
      return
    }
    try {
      const all = await getWatched()
      // AniList's id first: a show that has one is a show whose seasons come
      // off the list that can also be written back to. The backup's is the
      // fallback, and carries its list's name so the two never mix.
      const known = all[block.show]
      const id = known?.anilistId ?? (known?.kitsuId ? `kitsu-${known.kitsuId}` : null)
      setStartWith(id ? { id, name: block.show } : null)
    } catch {
      setStartWith(null)
    }
    setChanging('episodes')
  }

  return (
    <div className="notepanel">
      <div className="notehead">
        {cluster.map((b) => {
          const tag = blockFace(tagFor(b.tag), b, covers)
          return (
            <span
              key={b.id}
              className={`notetag${b.id === block.id ? ' current' : ''}`}
              style={{ '--tag': tagFor(b.tag)?.colour }}
              title={`${slotToTime(b.startSlot)} – ${slotToTime(b.endSlot)}`}
            >
              <TagIcon tag={tag} />
              {tag ? tag.name : b.tag}
            </span>
          )
        })}

        <span className="notedate">{date}</span>
        {/* The clicked block's own hours, not the whole overlap's. */}
        <span className="notetime">{slotToTime(block.startSlot)} – {slotToTime(block.endSlot)}</span>
        <span className="notedur">{formatDuration(block.endSlot - block.startSlot)}</span>

        <button
          className="notebtn danger"
          onClick={onDelete}
          title={`Remove the ${clickedTag?.name ?? block.tag} block — or press Delete`}
        >
          Delete {cluster.length > 1 ? (clickedTag?.name ?? block.tag) : ''}
        </button>
        <button
          className="notebtn"
          title="Copy this block — ctrl+c. Ctrl+v puts it on today at the time it is now."
          onClick={onCopy}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button className="notebtn" onClick={onClose}>Close</button>
      </div>

      {/* One column for what it was and one for the note, whichever state the
          first of those is in. Looking for something and having found it are
          two things to see in the same place, and the panel changing shape
          between them reads as having landed somewhere else.

          Keyed on the block, so clicking a different one starts a fresh
          search rather than showing the last block's results under it. */}
      <div className="notebody">
        {block.tag === GAME && (searching ? (
          <GameSearch
            key={block.id}
            block={block}
            onAttach={(game) => { setChanging(null); onGame(block.id, game) }}
            onCancel={() => setChanging(null)}
          />
        ) : (
          <GameCard
            key={block.id}
            block={block}
            onChange={() => setChanging('show')}
            onRemove={() => onGame(block.id, null)}
          />
        ))}

        {block.tag === ANIME && (searching ? (
          <AnimeSearch
            // Keyed on which door was opened as well as which block, so
            // "change the show" and "change the episodes" are two states of
            // the box rather than one box being talked into the other.
            key={`${block.id}:${changing ?? 'new'}`}
            block={block}
            startWith={changing === 'episodes' ? startWith : null}
            onAttach={(show) => { setChanging(null); onShow(block.id, show) }}
            onCancel={() => setChanging(null)}
          />
        ) : (
          <AnimeCard
            key={block.id}
            block={block}
            onChange={() => setChanging('show')}
            onEpisodes={toEpisodes}
            onRemove={() => onShow(block.id, null)}
          />
        ))}

        {block.tag === SERIES && (searching ? (
          <SeriesSearch
            key={`${block.id}:${changing ?? 'new'}`}
            block={block}
            startWith={changing === 'episodes' ? startWith : null}
            onAttach={(series) => { setChanging(null); onSeries(block.id, series) }}
            onCancel={() => setChanging(null)}
          />
        ) : (
          <WatchCard
            key={block.id}
            kind="series"
            block={block}
            onChange={() => setChanging('show')}
            onEpisodes={toEpisodes}
            onRemove={() => onSeries(block.id, null)}
          />
        ))}

        {block.tag === MOVIE && (searching ? (
          <MovieSearch
            key={`${block.id}:${changing ?? 'new'}`}
            block={block}
            onAttach={(film) => { setChanging(null); onFilm(block.id, film) }}
            onCancel={() => setChanging(null)}
          />
        ) : (
          <WatchCard
            key={block.id}
            kind="movie"
            block={block}
            onChange={() => setChanging('show')}
            onRemove={() => onFilm(block.id, null)}
          />
        ))}

        <textarea
          ref={area}
          className="notetext"
          placeholder="Anything worth remembering about this…"
          value={block.note ?? ''}
          onChange={(e) => onNote(block.id, e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
        />
      </div>
    </div>
  )
}
