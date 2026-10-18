// Finding a series or a film on TMDB, and keeping its poster in the vault.
//
// The same bargain as anime, with two differences that shape everything
// here. TMDB wants a key — a free one, from an account — so, like the game
// lookup, there is a "not set up yet" to answer with. And a series is one
// record with its seasons inside it, not a chain of records the way AniList
// keeps anime: "which season" is a number on the show, and the episodes are
// numbered within that season. So a block of a series carries the season as
// well as the episodes, and the two only mean anything together.
//
// Nothing here sends anything but a search or a lookup, and only because
// something was typed or picked.

import fs from 'node:fs/promises'
import path from 'node:path'
import { slugify, cleanGenres } from './anime.js'

const API = 'https://api.themoviedb.org/3'
// Posters at a size that is sharp on the card and still small on disk.
const POSTER = 'https://image.tmdb.org/t/p/w500'
const COVER_HOST = 'image.tmdb.org'
const COVER_PATH = '/t/p/'

// What is known about each, beside the covers. Two files rather than one,
// because a series and a film can share a name — Fargo is both — and the
// name is what the notes go by.
const FACTS = { series: 'series.json', movie: 'movies.json' }

const RESULTS = 8
const DESCRIPTION_CHARS = 260
const TIMEOUT_MS = 8000
const COVER_TIMEOUT_MS = 15000
const MAX_COVER_BYTES = 6 * 1024 * 1024
const CACHE_LIMIT = 120
// Seasons past this are not offered. Nothing real has this many; a bound
// means a strange answer can never turn into a thousand rows.
const MAX_SEASONS = 80

const upstream = (message) => Object.assign(new Error(message), { status: 502 })
const refused = (message) => Object.assign(new Error(message), { status: 400 })

function boundedCache(limit) {
  const map = new Map()
  return {
    get: (key) => map.get(key),
    set(key, value) {
      map.set(key, value)
      if (map.size > limit) map.delete(map.keys().next().value)
    },
  }
}

/**
 * How a key is handed to TMDB. It gives out two kinds and either works: the
 * short "API key", which goes in the address, and the long "read access
 * token", which goes in a header. The long one has dots in it; the short one
 * never does.
 */
export function authFor(key) {
  const k = String(key ?? '').trim()
  return k.includes('.')
    ? { headers: { Authorization: `Bearer ${k}` }, params: {} }
    : { headers: {}, params: { api_key: k } }
}

/** "2019-03-14" -> 2019. Nothing for nothing. */
const yearOf = (date) => {
  const y = Number(String(date ?? '').slice(0, 4))
  return Number.isInteger(y) && y > 1800 ? y : null
}

function shorten(text) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (clean.length <= DESCRIPTION_CHARS) return clean
  const cut = clean.slice(0, DESCRIPTION_CHARS)
  const stop = cut.lastIndexOf('. ')
  return stop > DESCRIPTION_CHARS * 0.6 ? cut.slice(0, stop + 1) : `${cut.trimEnd()}…`
}

const posterOf = (p) => (typeof p === 'string' && p.startsWith('/') ? `${POSTER}${p}` : '')

/**
 * How many episodes of one season you could actually have watched.
 *
 * TMDB lists a season's episodes before they air, so the count on a season
 * still going out is a promise rather than a fact. The last episode that has
 * aired is the honest edge: every season before it is whole, its own season
 * stops at it, and every season after it has not started.
 *
 * A show with no "last aired" at all has aired nothing — unless TMDB simply
 * did not say, in which case a season that started before today is taken as
 * whole, which is the only guess that does not invent episodes.
 */
export function airedIn(season, last, today) {
  const count = Number.isInteger(season?.episode_count) ? season.episode_count : 0
  const n = season?.season_number
  if (Number.isInteger(last?.season_number) && Number.isInteger(last?.episode_number)) {
    if (n < last.season_number) return count
    if (n === last.season_number) return count > 0 ? Math.min(count, last.episode_number) : last.episode_number
    return 0
  }
  return season?.air_date && season.air_date <= today ? count : 0
}

/**
 * The seasons of a series as the app lists them, in order.
 *
 * Season 0 is where TMDB keeps the specials: one-offs, extras, shorts. They
 * are related to the show without being a season of it, the same reason
 * films and recaps are left out of an anime's seasons.
 */
export function seasonsOf(details, today) {
  return (Array.isArray(details?.seasons) ? details.seasons : [])
    .filter((s) => Number.isInteger(s?.season_number) && s.season_number > 0)
    .sort((a, b) => a.season_number - b.season_number)
    .slice(0, MAX_SEASONS)
    .map((s) => ({
      number: s.season_number,
      name: String(s.name ?? '').trim() || `Season ${s.season_number}`,
      year: yearOf(s.air_date),
      episodes: Number.isInteger(s.episode_count) ? s.episode_count : null,
      aired: airedIn(s, details.last_episode_to_air, today),
      cover: posterOf(s.poster_path),
    }))
}

/** A series as the app talks about it, from a search hit or a full record. */
export function shapeSeries(raw, genreNames = new Map()) {
  const name = String(raw?.name ?? '').trim()
  const genres = Array.isArray(raw?.genres)
    ? raw.genres.map((g) => g?.name)
    : (raw?.genre_ids ?? []).map((id) => genreNames.get(id))
  return {
    id: raw?.id,
    name,
    original: raw?.original_name && raw.original_name !== name ? String(raw.original_name) : '',
    year: yearOf(raw?.first_air_date),
    seasons: Number.isInteger(raw?.number_of_seasons) ? raw.number_of_seasons : null,
    genres: cleanGenres(genres),
    cover: posterOf(raw?.poster_path),
    description: shorten(raw?.overview),
    duration: Array.isArray(raw?.episode_run_time) && Number.isInteger(raw.episode_run_time[0])
      ? raw.episode_run_time[0] : null,
  }
}

/** A film as the app talks about it. */
export function shapeMovie(raw, genreNames = new Map()) {
  const name = String(raw?.title ?? '').trim()
  const genres = Array.isArray(raw?.genres)
    ? raw.genres.map((g) => g?.name)
    : (raw?.genre_ids ?? []).map((id) => genreNames.get(id))
  return {
    id: raw?.id,
    name,
    original: raw?.original_title && raw.original_title !== name ? String(raw.original_title) : '',
    year: yearOf(raw?.release_date),
    genres: cleanGenres(genres),
    cover: posterOf(raw?.poster_path),
    description: shorten(raw?.overview),
    duration: Number.isInteger(raw?.runtime) && raw.runtime > 0 ? raw.runtime : null,
  }
}

/** Only TMDB's own picture host, and only its poster folder. */
export function coverSource(raw) {
  const url = new URL(raw)
  const no = () => refused('not a poster from TMDB')
  if (url.protocol !== 'https:' || url.hostname !== COVER_HOST) throw no()
  if (!url.pathname.startsWith(COVER_PATH)) throw no()
  if (!/\.(jpe?g|png|webp)$/i.test(url.pathname)) throw no()
  return url
}

const idOf = (raw) => {
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) throw refused('bad id')
  return n
}

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function createTmdb({ coversDir, key = '' }) {
  const keyNow = () => String(typeof key === 'function' ? key() : key ?? '').trim()
  const searches = boundedCache(CACHE_LIMIT)
  const details = boundedCache(CACHE_LIMIT)
  const genreLists = {}

  async function ask(route, params = {}) {
    const k = keyNow()
    if (!k) throw refused('no TMDB key yet')
    const auth = authFor(k)
    const query = new URLSearchParams({ ...params, ...auth.params })
    let res
    try {
      res = await fetch(`${API}${route}?${query}`, {
        headers: { Accept: 'application/json', ...auth.headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      throw upstream('could not reach TMDB')
    }
    if (res.status === 401) throw upstream('TMDB turned the key down — check it under Settings → Setup')
    if (res.status === 429) throw upstream('TMDB is asking for a moment — try again shortly')
    if (res.status === 404) throw refused('TMDB has nothing by that id')
    const body = await res.json().catch(() => null)
    if (!res.ok || !body) throw upstream(`TMDB answered ${res.status}`)
    return body
  }

  /** Genre names by id. A search only sends the ids; asked once a session. */
  async function genres(kind) {
    if (genreLists[kind]) return genreLists[kind]
    try {
      const body = await ask(`/genre/${kind === 'series' ? 'tv' : 'movie'}/list`)
      genreLists[kind] = new Map((body.genres ?? []).map((g) => [g.id, g.name]))
    } catch {
      return new Map() // genres are a nicety; a search without them still finds
    }
    return genreLists[kind]
  }

  const kinds = {
    series: { search: '/search/tv', record: '/tv', shape: shapeSeries },
    movie: { search: '/search/movie', record: '/movie', shape: shapeMovie },
  }

  async function record(kind, id) {
    const cacheKey = `${kind}:${id}`
    const had = details.get(cacheKey)
    // Held for ten minutes: long enough to go back and forth between the
    // seasons and the episodes for free, short enough that a new episode
    // turns up the same evening.
    if (had && Date.now() - had.when < 10 * 60_000) return had.body
    const body = await ask(`${kinds[kind].record}/${id}`)
    details.set(cacheKey, { body, when: Date.now() })
    return body
  }

  async function readFacts(kind) {
    try {
      const text = await fs.readFile(path.join(coversDir, FACTS[kind]), 'utf8')
      const parsed = JSON.parse(text.replace(/^﻿/, ''))
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  async function writeFacts(kind, all) {
    await fs.mkdir(coversDir).catch((err) => { if (err.code !== 'EEXIST') throw err })
    const target = path.join(coversDir, FACTS[kind])
    const tmp = `${target}.tmp-${process.pid}`
    await fs.writeFile(tmp, `${JSON.stringify(all, null, 1)}\n`, 'utf8')
    await fs.rename(tmp, target)
  }

  /** One kind's half of all this: series or films. */
  const side = (kind) => ({
    /** Matches for what has been typed, best first. */
    async search(query) {
      const q = String(query ?? '').trim()
      if (q === '') return []
      const cacheKey = q.toLowerCase()
      const had = searches.get(`${kind}:${cacheKey}`)
      if (had) return had
      const [body, names] = await Promise.all([
        ask(kinds[kind].search, { query: q, include_adult: 'false' }),
        genres(kind),
      ])
      const results = (body.results ?? []).slice(0, RESULTS)
        .map((raw) => kinds[kind].shape(raw, names))
        .filter((r) => r.name)
      searches.set(`${kind}:${cacheKey}`, results)
      return results
    },

    /** Copy a poster into the vault; answers with the file it became. */
    async keep({ id, name, image }) {
      const n = idOf(id)
      if (!image) return { cover: '' }
      const url = coverSource(image)
      const ext = /\.(png|webp)$/i.exec(url.pathname)?.[1]?.toLowerCase() ?? 'jpg'
      // The kind in the name, so a series and a film that share a name and a
      // number are still two pictures.
      const file = `${slugify(name)}-${kind === 'series' ? 'tv' : 'film'}${n}.${ext}`
      const target = path.join(coversDir, file)
      try {
        await fs.access(target)
        return { cover: file, already: true }
      } catch { /* not there yet */ }

      const res = await fetch(url, { signal: AbortSignal.timeout(COVER_TIMEOUT_MS) })
      if (!res.ok) throw upstream(`the poster answered ${res.status}`)
      const bytes = Buffer.from(await res.arrayBuffer())
      if (bytes.length === 0) throw upstream('the poster came back empty')
      if (bytes.length > MAX_COVER_BYTES) throw upstream('the poster is far too big')
      await fs.mkdir(coversDir).catch((err) => { if (err.code !== 'EEXIST') throw err })
      const tmp = `${target}.tmp-${process.pid}`
      await fs.writeFile(tmp, bytes)
      await fs.rename(tmp, target)
      return { cover: file, already: false }
    },

    /**
     * What is known about it, kept once beside the covers rather than in
     * every note — and the TMDB id, which means nothing to anyone reading
     * the vault without this app.
     */
    async remember(item) {
      const all = await readFacts(kind)
      const had = all[item.name]
      all[item.name] = {
        tmdbId: idOf(item.id),
        year: item.year ?? null,
        duration: item.duration ?? null,
        ...(kind === 'series' ? { seasons: item.seasons ?? had?.seasons ?? null } : {}),
        // Yours once changed by hand; picking it again keeps them.
        genres: had?.genres?.length ? had.genres : cleanGenres(item.genres),
        cover: item.cover ?? '',
      }
      await writeFacts(kind, all)
    },

    async setGenres(name, list) {
      const key = String(name ?? '').trim()
      if (!key) throw refused('which one?')
      const all = await readFacts(kind)
      all[key] = { ...(all[key] ?? {}), genres: cleanGenres(list) }
      await writeFacts(kind, all)
      return all[key]
    },

    /** Everything remembered so far, by name. */
    known: () => readFacts(kind),
  })

  const series = side('series')
  const movie = side('movie')

  /**
   * Every season of a series with how many of its episodes have aired, and
   * the facts about the show as a whole — one lookup, since TMDB keeps the
   * seasons inside the show's own record.
   */
  series.seasons = async (rawId) => {
    const id = idOf(rawId)
    const body = await record('series', id)
    return { show: shapeSeries(body), seasons: seasonsOf(body, today()) }
  }

  /** The full record of a film, for its running time and genres. */
  movie.details = async (rawId) => shapeMovie(await record('movie', idOf(rawId)))

  return {
    get configured() { return keyNow() !== '' },
    series,
    movie,
  }
}
