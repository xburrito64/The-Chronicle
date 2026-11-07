// Finding a game, and keeping its cover in the vault.
//
// Three databases, because no one of them does the whole job. RAWG knows
// about nine hundred thousand games including everything that never came to a
// PC, which makes it the right thing to search — but it has no cover art at
// all. What it has is `background_image`, which is key art or a screenshot:
// the picture across the top of a store page, not the box. Steam has the
// actual cover for every game it sells, at a fixed address worked out from
// the game's id, and wants no key to hand it over. So: RAWG finds the game,
// Steam draws it.
//
// Steam cannot draw all of them. It never sold Minecraft, and a game it does
// sell can still have no library art up yet, which is ordinary for something
// just released. SteamGridDB is people collecting the covers for both cases,
// at the size Steam uses, so it stands behind Steam rather than beside it: it
// is only ever asked once Steam has come back empty. It wants a free key, and
// without one this simply ends where it used to — a name and no picture.
//
// And Steam is asked for names as well as for pictures, because RAWG runs
// behind it. A game out this week is on Steam's own shelf the day it goes up
// and in RAWG some time after — a fortnight for one, longer for another, and
// the one you played last night is exactly the one that has not made it over
// yet. Steam's store search wants no key and answers with the app id, which
// is the one thing the cover needs anyway. It is asked beside RAWG rather
// than instead: RAWG still knows nine hundred thousand games Steam never
// sold, and what it says about a game is richer.
//
// And RAWG does go down, sometimes for a day at a time. Steam alone cannot
// cover for it, since the games it never sold — Fortnite, Minecraft — are
// exactly the ones it has no answer for. SteamGridDB can find those by name
// as well as draw them, so while RAWG is failing, and only then, it is asked
// for names too. It knows little about a game beyond its name and year, but a
// name and a cover are the record.
//
// Copying the cover into the vault is the part that matters. The folder still
// reads offline, still reads in five years, and still reads if this app is
// gone. Nothing here ever writes into a note; covers live in their own folder.

import fs from 'node:fs/promises'
import path from 'node:path'

const API = 'https://api.rawg.io/api'

// Steam's own art, addressed by app id. `library_600x900` is the upright
// picture Steam shows in your library — the modern box art, and the only one
// of its sizes that is a cover rather than a banner.
const STEAM_HOST = 'shared.cloudflare.steamstatic.com'
const STEAM_ART = `https://${STEAM_HOST}/store_item_assets/steam/apps`
const COVER_FILE = 'library_600x900.jpg'

// Steam's shop, asked by name. The same shop the cover comes from, so a game
// found here already has the one thing a cover needs: its app id.
const STEAM_STORE = 'https://store.steampowered.com/api'
// A game found on Steam's shelf rather than in RAWG wears the shop's name in
// front of its number. The two count from one independently and mean nothing
// to each other; a bare number that could be either is a number that could
// name the wrong game. See kitsu.js, which does the same for the same reason.
const STEAM_PREFIX = 'steam-'
// How many games Steam may add to a list RAWG did not know about. More than
// this and a search for one new game brings back its soundtrack's neighbours.
const STEAM_EXTRA = 4

// Where a cover comes from when Steam has none, which happens two ways: a
// game Steam never sold — Minecraft is on five shops and not that one — and a
// game with a Steam page whose library art was never published. SteamGridDB
// is people drawing and collecting the covers for both, at the size Steam
// uses, so it slots in behind without anything downstream noticing.
const GRID_API = 'https://www.steamgriddb.com/api/v2'
const GRID_HOST_RE = /^cdn\d*\.steamgriddb\.com$/
const GRID_SIZE = { width: 600, height: 900 }
const GRID_WANTED = { dimensions: '600x900', types: 'static', nsfw: 'false', humor: 'false' }
// A game found on SteamGridDB wears its name too, for the same reason a game
// off Steam's shelf does: it counts from one like the others do.
const GRID_PREFIX = 'grid-'
// How many games it may offer while RAWG is out. It files spin-offs and fan
// projects under a name as well, and past this it is mostly those.
const GRID_EXTRA = 6

// What is known about each game, beside the covers it belongs with.
const FACTS_FILE = 'games.json'

// Genres are yours to edit, so they need bounds. Three is what the database
// offers and what a card was drawn for; six is where a row of them stops
// reading as a handful and starts reading as a list.
const MAX_GENRES = 6
const GENRE_CHARS = 40

const STEAM_APP_RE = /store\.steampowered\.com\/app\/(\d+)/

// A screenful and a bit. Eight was a pick rather than a list to read, and it
// still is for anything with a name of its own — but RAWG carries every game
// itch.io has ever hosted, and "Click the Button" is the name of eleven of
// them. Under a dozen the list still reads at a glance; below it, a game you
// actually played sits on a page you cannot get to.
const RESULTS = 12
const DESCRIPTION_CHARS = 260
const SEARCH_TIMEOUT_MS = 6000
const COVER_TIMEOUT_MS = 15_000
const MAX_COVER_BYTES = 6 * 1024 * 1024

const CACHE_LIMIT = 120

// How long an answer may be reused.
//
// A cover that was found is found for good — the address is worked out from
// an id and does not move. A cover that was *not* found is a different kind
// of answer: it may mean the game has no art anywhere, or it may mean one
// request out of twenty failed on its way. Remembering the second forever is
// how a moment's trouble becomes a permanent hole that closing the app is the
// only cure for, which is exactly the sort of thing nobody would guess.
const MISS_TTL_MS = 5 * 60_000
// Searches carry covers with them, so they expire on the same clock rather
// than holding yesterday's blank pictures over a fresh lookup.
const SEARCH_TTL_MS = 5 * 60_000

// How often a game still without a cover is asked about again.
//
// A cover missing on the day a game was picked is very often a cover that did
// not exist yet: art goes up on SteamGridDB a week or three after a game
// comes out, and a key put in later can only find what is asked for after it
// was put in. Without this, a blank written down once stayed blank for good,
// however long ago the picture turned up. Six hours is often enough that a
// cover arrives the same day it becomes findable, and rare enough that a
// dozen coverless games cost the databases nothing worth noticing.
export const REFILL_EVERY_MS = 6 * 60 * 60_000

/**
 * Something went wrong out on the network rather than in here. Said with a
 * status of its own so a cover that will not download reads as what it is,
 * rather than as this app having fallen over.
 */
const upstream = (message) => Object.assign(new Error(message), { status: 502 })
/** Something arrived that we are not going to act on. */
const refused = (message) => Object.assign(new Error(message), { status: 400 })
/** RAWG not answering, in words rather than in whatever the network said. */
const rawgDown = () => upstream(
  "RAWG, the game database, isn't answering right now, and nowhere else knew that name. Try again in a while.",
)

/** Smallest thing that behaves like a cache: oldest out once it's full. */
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

/** "Grand Theft Auto V" -> "grand-theft-auto-v". Filenames only. */
export function slugify(name) {
  return String(name)
    // Split the accents off their letters and drop them, rather than turning
    // each one into a dash of its own — Ōkami is okami, not o-kami.
    .normalize('NFKD')
    .replace(/\p{Mark}+/gu, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60) || 'game'
}

/** The app id inside a Steam game id, or null if that is not what this is. */
export function steamId(raw) {
  const text = String(raw ?? '').trim()
  if (!text.startsWith(STEAM_PREFIX)) return null
  const number = Number(text.slice(STEAM_PREFIX.length))
  return Number.isInteger(number) && number > 0 ? number : null
}

/** The SteamGridDB number inside a game id, or null if that is not what this is. */
export function gridId(raw) {
  const text = String(raw ?? '').trim()
  if (!text.startsWith(GRID_PREFIX)) return null
  const number = Number(text.slice(GRID_PREFIX.length))
  return Number.isInteger(number) && number > 0 ? number : null
}

/**
 * What a game id is for on disk: the tail of its cover's filename. RAWG's is
 * the bare number, as it has always been, so nothing already in a vault
 * moves; the others keep their source's name so no two can share a file.
 */
export function gameStamp(raw) {
  const steam = steamId(raw)
  if (steam) return `${STEAM_PREFIX}${steam}`
  const grid = gridId(raw)
  if (grid) return `${GRID_PREFIX}${grid}`
  const number = Number(raw)
  return Number.isInteger(number) && number > 0 ? String(number) : null
}

/**
 * A name reduced to what two databases would agree on.
 *
 * RAWG tells eleven games called "Click the Button" apart by writing the
 * developer after the name in brackets; Steam does not. Trademark marks,
 * punctuation and capitals all vary by who typed the name in. None of it is
 * the name.
 */
export function plainName(name) {
  return String(name ?? '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/[™®©]/g, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
}

// How far apart two release years may be and still be one game. A port
// reaches Steam a year or two after the game came out — Hades' Star was on
// phones in 2017 and on Steam in 2019 — while the eleven games called "Click
// the Button" are spread across eight years.
const SAME_GAME_YEARS = 2

/**
 * How far apart two listings of a game are, or null if they are not one
 * game at all.
 *
 * The name alone is not enough — eleven games share one — so the year has to
 * roughly agree as well, where both are known. Roughly, because a port
 * arrives on Steam after the game did. A year missing on one side is not a
 * disagreement, only silence, and counts as furthest-but-still-matching so
 * that a listing with a year is preferred over one without.
 */
export function gameGap(a, b) {
  if (plainName(a.name) !== plainName(b.name)) return null
  const ya = Number(String(a.released ?? '').slice(0, 4))
  const yb = Number(String(b.released ?? '').slice(0, 4))
  if (!ya || !yb) return SAME_GAME_YEARS
  const gap = Math.abs(ya - yb)
  return gap <= SAME_GAME_YEARS ? gap : null
}

/** Which of several listings is the same game as this one, if any. */
export function twinOf(game, among) {
  let best = null
  let closest = Infinity
  for (const other of among) {
    const gap = gameGap(other, game)
    if (gap !== null && gap < closest) {
      best = other
      closest = gap
    }
  }
  return best
}

// Steam's words for where a game runs, in RAWG's words, so a card reads one
// vocabulary whichever shelf the game came off.
const STEAM_PLATFORMS = { windows: 'PC', mac: 'Apple Macintosh', linux: 'Linux' }

/**
 * A game as this app talks about it, from a game as Steam's shop describes
 * it. `type` and `appId` ride along for the search to use and are dropped
 * before anything is sent on.
 */
export function shapeSteam(appId, details) {
  const d = details ?? {}
  const year = /\b(\d{4})\b/.exec(String(d.release_date?.date ?? ''))?.[1] ?? ''
  return {
    id: `${STEAM_PREFIX}${appId}`,
    appId: String(appId),
    type: String(d.type ?? ''),
    name: String(d.name ?? '').trim(),
    released: year,
    cover: '',
    genres: cleanGenres((d.genres ?? []).slice(0, 3).map((g) => g.description)),
    platforms: Object.entries(d.platforms ?? {})
      .filter(([, on]) => on)
      .map(([key]) => STEAM_PLATFORMS[key])
      .filter(Boolean)
      .sort((a, b) => (a === 'PC' ? -1 : b === 'PC' ? 1 : 0)),
    description: shorten(d.short_description),
  }
}

/**
 * A game as this app talks about it, from a game as SteamGridDB files it. Its
 * release date is in seconds, and is sometimes not there at all.
 */
export function shapeGrid(entry) {
  const seconds = Number(entry?.release_date)
  return {
    id: `${GRID_PREFIX}${entry?.id}`,
    appId: '',
    type: 'game',
    name: String(entry?.name ?? '').trim(),
    released: seconds > 0 ? String(new Date(seconds * 1000).getUTCFullYear()) : '',
    cover: '',
    genres: [],
    platforms: [],
    description: '',
  }
}

/**
 * Enough of a description to tell two games of the same name apart, which is
 * the whole reason it is shown. Cut on a sentence where there is one nearby,
 * so it ends rather than just stopping.
 */
function shorten(text) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (clean.length <= DESCRIPTION_CHARS) return clean
  const cut = clean.slice(0, DESCRIPTION_CHARS)
  const stop = cut.lastIndexOf('. ')
  return stop > DESCRIPTION_CHARS * 0.6 ? cut.slice(0, stop + 1) : `${cut.trimEnd()}…`
}

/**
 * A list of genres fit to write down: trimmed, nothing blank, nothing twice,
 * and few enough and short enough to sit on a card.
 *
 * The same name in different capitals is the same genre — "FPS" typed once as
 * "fps" should not become a second one. The first spelling wins, since that
 * is the one already on screen.
 */
export function cleanGenres(list) {
  const seen = new Set()
  const out = []
  for (const raw of Array.isArray(list) ? list : []) {
    const genre = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, GENRE_CHARS)
    if (!genre || seen.has(genre.toLowerCase())) continue
    seen.add(genre.toLowerCase())
    out.push(genre)
    if (out.length === MAX_GENRES) break
  }
  return out
}

/** Where Steam keeps a game's cover. */
export const steamCover = (appId) => `${STEAM_ART}/${appId}/${COVER_FILE}`

/**
 * Check a cover address before downloading it.
 *
 * What ends up in a note eventually turns into a download, so the address is
 * not something to take on trust: it has to be Steam's art host, and it has
 * to be a cover rather than any other file that host happens to serve.
 */
export function coverSource(raw) {
  const url = new URL(raw)
  if (url.protocol !== 'https:') throw refused('not a cover')
  // Steam's, at the one address that is a cover rather than a banner.
  if (url.hostname === STEAM_HOST) {
    if (path.basename(url.pathname) !== COVER_FILE) throw refused('not a Steam cover')
    return url
  }
  // SteamGridDB's, which are named by a hash rather than by a size, so the
  // check is on the host and on it being a picture at all.
  if (GRID_HOST_RE.test(url.hostname)) {
    if (!/\.(jpe?g|png|webp)$/i.test(url.pathname)) throw refused('not a SteamGridDB cover')
    return url
  }
  throw refused('not a cover we know')
}

/**
 * The best of the covers offered for one game.
 *
 * SteamGridDB is people uploading art, so a game can have fifty and they are
 * not all the box: some are fan-made, some are the wrong shape, some are a
 * joke. Only the ones at exactly the size Steam's own covers are, and then
 * the one the site's own voting likes most — which is as close to "the
 * obvious one" as anything here can get.
 */
export function pickGrid(body) {
  const best = (body?.data ?? [])
    .filter((g) => (
      g?.width === GRID_SIZE.width && g?.height === GRID_SIZE.height && typeof g.url === 'string'
    ))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]
  return best?.url ?? ''
}

export function createGames({ apiKey, gridKey = '', coversDir }) {
  const searches = boundedCache(CACHE_LIMIT)
  // When each coverless game was last asked about. Held in memory rather than
  // written down: the file beside the covers is something a person reads, and
  // "last looked for a picture at 14:02" is not something anyone wants to.
  // Forgetting on restart only means one more look.
  const tried = new Map()
  // One change to the facts file at a time. Every change is read, altered,
  // written; two of those overlapping means the second writes over the
  // first, and with a background refill running that stops being
  // hypothetical — it would be your own genres, lost to a picture.
  let writing = Promise.resolve()
  const exclusive = (task) => {
    const run = writing.then(task, task)
    writing = run.catch(() => {})
    return run
  }
  const details = boundedCache(CACHE_LIMIT * 4)
  const covers = boundedCache(CACHE_LIMIT * 4)

  /**
   * The key, as it is on disk right now.
   *
   * `apiKey` may be a function, and from the app it is: the settings file is
   * something you edit while the app is open, and having to close it and open
   * it again before it counts is exactly the sort of thing nobody is told and
   * everybody trips over. Same as the tag list, which is re-read per request
   * for the same reason.
   */
  const keyNow = () => String(typeof apiKey === 'function' ? apiKey() : apiKey ?? '').trim()
  const gridNow = () => String(typeof gridKey === 'function' ? gridKey() : gridKey ?? '').trim()

  async function ask(pathname, params, timeout) {
    const url = new URL(API + pathname)
    url.search = new URLSearchParams({ ...params, key: keyNow() }).toString()
    let res
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(timeout) })
    } catch {
      throw rawgDown()
    }
    if (res.status === 401) throw upstream('RAWG turned the key down — check rawgKey in config.json')
    if (res.status >= 500) throw rawgDown()
    if (!res.ok) throw upstream(`RAWG answered ${res.status}`)
    return res.json()
  }

  /** One question to Steam's shop, which needs no key and gets no key. */
  async function askSteam(pathname, params) {
    const url = new URL(STEAM_STORE + pathname)
    url.search = new URLSearchParams({ ...params, cc: 'us', l: 'en' }).toString()
    const res = await fetch(url, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) })
    if (!res.ok) throw upstream(`Steam answered ${res.status}`)
    return res.json()
  }

  /**
   * What Steam's shop knows about one app, shaped — or null for anything it
   * will not say, which is what a region lock looks like from here. Kept for
   * as long as the app runs: a shop page does not change under a search.
   */
  async function steamDetails(appId) {
    const at = `steam:${appId}`
    const had = details.get(at)
    if (had !== undefined) return had
    let game = null
    try {
      const body = await askSteam('/appdetails', { appids: String(appId) })
      const entry = body?.[String(appId)]
      if (entry?.success && entry.data) game = shapeSteam(appId, entry.data)
    } catch { /* then Steam has nothing to add about it */ }
    details.set(at, game)
    return game
  }

  /**
   * Games on Steam's shelf matching what was typed, each with everything the
   * shop will say about it. Every failure here is a shrug: this is the second
   * list, and the first one not being enough is what it is for, not what it
   * needs.
   */
  async function steamSearch(q) {
    try {
      const body = await askSteam('/storesearch/', { term: q })
      const apps = (body?.items ?? []).filter((it) => it?.type === 'app' && it.id)
      const games = await Promise.all(apps.map((it) => steamDetails(it.id)))
      return games.filter(Boolean)
    } catch {
      return []
    }
  }

  /**
   * A game's description, which the search results don't carry — RAWG only
   * hands those out one game at a time. They are fetched alongside each other
   * rather than one after another, and a game whose description doesn't
   * arrive is still perfectly pickable, so a failure here is a shrug.
   */
  async function describe(id) {
    const had = details.get(id)
    if (had !== undefined) return had
    try {
      const game = await ask(`/games/${id}`, {}, SEARCH_TIMEOUT_MS)
      const text = shorten(game.description_raw)
      details.set(id, text)
      return text
    } catch {
      return ''
    }
  }

  /**
   * The game's cover, by way of its Steam page.
   *
   * RAWG knows which shops sell a game and links to each of them, so the app
   * id is sitting in the Steam link — and the address of the cover follows
   * from the app id alone. Asked for rather than assumed, because a game can
   * be on Steam without that particular picture having been made.
   *
   * No Steam page, or no cover on it, and the answer is nothing at all. A
   * screenshot in a cover's place is what this replaced.
   */
  async function askGrid(pathname, params) {
    const url = new URL(GRID_API + pathname)
    if (params) url.search = new URLSearchParams(params).toString()
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${gridNow()}` },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    })
    if (res.status === 401 || res.status === 403) {
      throw upstream('SteamGridDB turned the key down — check steamGridKey in config.json')
    }
    // Nothing filed under that id. An answer, not a failure — and treating it
    // as one used to abandon the search by name that should have followed it.
    if (res.status === 404) return { data: [] }
    if (!res.ok) throw upstream(`SteamGridDB answered ${res.status}`)
    return res.json()
  }

  /** One question to SteamGridDB, where not getting an answer is allowed. */
  async function someGrid(pathname, params) {
    try {
      return pickGrid(await askGrid(pathname, params))
    } catch (err) {
      console.error(`SteamGridDB: ${err.message}`)
      return ''
    }
  }

  /**
   * A cover for a game Steam has none for.
   *
   * By Steam id where there is one, because an id names one game exactly and
   * a search by name never can — a game with a Steam page but no library art
   * is still the same game over there. Only then by name, which is the only
   * handle left for something Steam has never sold.
   *
   * Every failure here is a shrug. This is already the second place asked,
   * and a game is allowed to end up with no picture — that is what it did
   * before any of this existed.
   */
  async function gridCover(name, appId) {
    if (!gridNow()) return ''

    // By Steam id first, where there is one.
    if (appId) {
      const found = await someGrid(`/grids/steam/${appId}`, GRID_WANTED)
      if (found) return found
    }

    // Then by name — reached whether the id found nothing or went wrong, since
    // a game can be filed there under its own id rather than Steam's.
    try {
      const hits = await askGrid(`/search/autocomplete/${encodeURIComponent(name)}`)
      const game = (hits?.data ?? [])[0]
      if (!game?.id) return ''
      return await someGrid(`/grids/game/${game.id}`, GRID_WANTED)
    } catch (err) {
      // Said out loud rather than only swallowed. A game with no cover
      // anywhere and a game whose key was typed wrong look identical from
      // the outside, and only one of them is worth doing something about.
      console.error(`no SteamGridDB cover for "${name}": ${err.message}`)
      return ''
    }
  }

  /**
   * Games SteamGridDB has filed under what was typed. Only asked while RAWG is
   * failing, and failing here too just leaves the list as short as it was.
   */
  async function gridSearch(q) {
    if (!gridNow()) return []
    try {
      const body = await askGrid(`/search/autocomplete/${encodeURIComponent(q)}`)
      return (body?.data ?? [])
        .map(shapeGrid)
        .filter((game) => gridId(game.id) && game.name)
    } catch (err) {
      console.error(`SteamGridDB, asked for "${q}" while RAWG is out: ${err.message}`)
      return []
    }
  }

  /** Whether Steam has the upright cover for an app, and where. */
  async function steamArt(appId) {
    try {
      const url = steamCover(appId)
      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) })
      return res.ok ? url : ''
    } catch {
      return ''
    }
  }

  /**
   * `hint` is a Steam app id the search already knows for this game — from
   * finding the same name and year on Steam's shelf. RAWG's own link to the
   * shop is still believed first, since it names the game exactly; the hint
   * only fills in where RAWG has no link at all, which is the ordinary state
   * of a game out this month.
   */
  async function coverOf(id, name, hint = '') {
    // The key is part of what was asked, not just how. A cover looked for
    // before there was a SteamGridDB key must not be remembered as "there
    // isn't one" after the key is put in — that would make adding it look
    // like it did nothing until the app was restarted.
    const at = `${id}:${hint}:${gridNow() ? 'grid' : 'steam'}`
    const had = covers.get(at)
    // A cover once found stays found. A cover not found is only believed for
    // a few minutes: it may be the truth about the game, or it may be one
    // request that went wrong, and there is no way to tell the two apart at
    // the moment it happens.
    if (had && (had.cover || Date.now() - had.when < MISS_TTL_MS)) return had.cover

    let appId = ''
    // Only a RAWG game has a RAWG page to ask about shops. One off Steam's own
    // shelf already is its app id, and one found on SteamGridDB is asked for
    // there by its own number, which names it exactly.
    const grid = gridId(id)
    if (grid) {
      const found = gridNow() ? await someGrid(`/grids/game/${grid}`, GRID_WANTED) : ''
      covers.set(at, { cover: found, when: Date.now() })
      return found
    }
    if (!steamId(id)) {
      try {
        const body = await ask(`/games/${id}/stores`, {}, SEARCH_TIMEOUT_MS)
        const app = (body.results ?? [])
          .map((s) => STEAM_APP_RE.exec(s.url ?? ''))
          .find(Boolean)
        if (app) appId = app[1]
      } catch { /* no cover, which a game is allowed not to have */ }
    }
    if (!appId) appId = String(hint ?? '')
    let found = appId ? await steamArt(appId) : ''

    // Steam had nothing. Either it never sold the game, or it sells it and
    // the library art was never put up — the second is common for something
    // just released, and looks identical from here.
    if (!found) found = await gridCover(name, appId)

    covers.set(at, { cover: found, when: Date.now() })
    return found
  }

  return {
    get configured() { return keyNow() !== '' },

    /**
     * Games matching what has been typed so far, best first.
     *
     * Cached by query: typing a name out and then backspacing over it should
     * not spend a second round trip on every letter of the way back.
     */
    async search(query) {
      const q = String(query ?? '').trim()
      if (q === '') return []

      // Keyed on the second database being available too, for the same
      // reason the cover cache is: a search run before the key was put in
      // must not keep answering with the covers it could not find then.
      const at = `${q.toLowerCase()}:${gridNow() ? 'grid' : 'steam'}`
      const had = searches.get(at)
      // Held only briefly. Results carry their covers with them, so a search
      // kept for ever would keep handing back the blanks of a bad minute
      // long after the minute had passed.
      if (had && Date.now() - had.when < SEARCH_TTL_MS) return had.results

      // `search_precise` asks RAWG to weigh the words typed over anything
      // that merely looks like them. It is the difference between "Click the
      // Button" bringing back Click-Clack and Click-Tock Clock, and it
      // bringing back the games actually called that; on a name with nothing
      // to confuse it for — Hades, Minecraft — it changes nothing at all.
      //
      // Both shelves at once. RAWG failing is still a failure — unless Steam
      // or SteamGridDB came back with something, in which case a shorter list
      // beats a red panel.
      const [asked, shelf] = await Promise.all([
        ask(
          '/games',
          { search: q, page_size: String(RESULTS), search_precise: 'true' },
          SEARCH_TIMEOUT_MS,
        ).then((body) => ({ body }), (error) => ({ error })),
        steamSearch(q),
      ])
      const found = (asked.body?.results ?? []).slice(0, RESULTS)

      // Where Steam's shelf and RAWG's list name the same game, RAWG's entry
      // stays — it says more — and takes the app id with it, so a game RAWG
      // has not yet linked to the shop still gets the shop's cover. What is
      // on the shelf and nowhere in the list is new, and is added.
      const hints = new Map()
      const spare = []
      for (const game of shelf) {
        const twin = twinOf(game, found.filter((g) => !hints.has(g.id)))
        if (twin) hints.set(twin.id, game.appId)
        else if (game.type === 'game') spare.push(game)
      }

      // Steam's listing wins where both know a game: it says more about it.
      const borrowed = asked.error
        ? (await gridSearch(q)).filter((game) => !twinOf(game, spare)).slice(0, GRID_EXTRA)
        : []
      if (asked.error && spare.length === 0 && borrowed.length === 0) throw asked.error

      // Every result is worked out beside every other one. Eight games one
      // after another would be a wait; eight at once is one.
      const results = await Promise.all(found.map(async (game) => {
        const [description, cover] = await Promise.all([
          describe(game.id),
          coverOf(game.id, game.name, hints.get(game.id) ?? ''),
        ])
        return {
          id: game.id,
          name: game.name,
          released: game.released ? game.released.slice(0, 4) : '',
          cover,
          genres: cleanGenres((game.genres ?? []).slice(0, 3).map((g) => g.name)),
          // What it is sold on, which is not quite what it was played on —
          // see `remember`. PC first, since that is where a cover came from.
          platforms: (game.parent_platforms ?? [])
            .map((p) => p.platform.name)
            .sort((a, b) => (a === 'PC' ? -1 : b === 'PC' ? 1 : 0)),
          description,
        }
      }))

      const extras = [...spare.slice(0, STEAM_EXTRA), ...borrowed]
      const added = await Promise.all(extras.map(async (game) => {
        const { appId, type, ...shown } = game
        return { ...shown, cover: await coverOf(game.id, game.name, appId) }
      }))

      // A game whose name is exactly what was typed is the game that was
      // meant, and goes to the top whichever shelf it came off. The rest of
      // what was added goes to the bottom: it is only there in case.
      const wanted = plainName(q)
      const meant = added.filter((g) => plainName(g.name) === wanted)
      const rest = added.filter((g) => plainName(g.name) !== wanted)
      const all = [...meant, ...results, ...rest]

      searches.set(at, { results: all, when: Date.now() })
      return all
    },

    /**
     * Copy a cover into the vault and answer with the name it was given.
     *
     * Linking to Steam would leave the record depending on a website: no
     * network, no covers, and one day no page. A file in the vault beside the
     * notes is the whole point — it is yours, and it keeps.
     *
     * A cover already there is left alone. The same game logged on fifty days
     * is one picture, and it is named after the game rather than after the
     * day, so the fifty-first costs nothing.
     */
    async keep({ id, name, image }) {
      const stamp = gameStamp(id)
      if (!stamp) throw refused('bad game id')

      // Nothing came back this time. That is not the same as the game having
      // no cover: it may already be sitting in the vault from the day the
      // lookup did work, and a picture we have beats a picture we failed to
      // fetch. The name is worked out from the game rather than the day, so
      // finding it is a matter of looking.
      if (!image) {
        const base = `${slugify(name)}-${stamp}`
        for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'gif']) {
          try {
            await fs.access(path.join(coversDir, `${base}.${ext}`))
            return { cover: `${base}.${ext}`, already: true }
          } catch { /* not that one */ }
        }
        return { cover: '' }
      }

      const url = coverSource(image)
      // Named for the game as RAWG knows it, since that is what was searched
      // and picked. Where the picture came from is not the game's identity.
      // SteamGridDB serves png and webp as well as jpg, so the name follows
      // the picture rather than assuming what Steam alone used to send.
      const ext = /\.(png|webp)$/i.exec(url.pathname)?.[1]?.toLowerCase() ?? 'jpg'
      const file = `${slugify(name)}-${stamp}.${ext}`
      const target = path.join(coversDir, file)
      try {
        await fs.access(target)
        return { cover: file, already: true }
      } catch { /* not there yet, fetch it */ }

      const res = await fetch(url, { signal: AbortSignal.timeout(COVER_TIMEOUT_MS) })
      if (!res.ok) throw upstream(`the cover answered ${res.status}`)
      const bytes = Buffer.from(await res.arrayBuffer())
      if (bytes.length === 0) throw upstream('the cover came back empty')
      if (bytes.length > MAX_COVER_BYTES) throw upstream('the cover is far too big')

      // Only the covers folder itself, never the vault above it: a fresh
      // install's placeholder vault must not be made up on someone's drive.
      await fs.mkdir(coversDir).catch((err) => { if (err.code !== 'EEXIST') throw err })
      // Beside it then swapped over, the same as a note: a half-written
      // picture should never be something the vault has in it.
      const tmp = `${target}.tmp-${process.pid}`
      await fs.writeFile(tmp, bytes)
      await fs.rename(tmp, target)
      return { cover: file, already: false }
    },

    /**
     * What is known about a game, kept once for the game rather than once for
     * every hour spent on it.
     *
     * This does not go in the daily notes. A day is a record of what happened,
     * and "Action, Strategy, PC" is not something that happened — it would be
     * the same forty lines of it in a year of playing one game, in the file
     * you actually read. It sits beside the covers instead, keyed by the name
     * the notes use, so the two halves still find each other offline and a
     * person opening it can see what it is.
     *
     * The platforms are the ones it is sold on rather than the one it was
     * played on, which nothing here can know. PC comes first because that is
     * where the cover came from.
     */
    async remember(game) {
      return exclusive(() => this.rememberNow(game))
    },

    async rememberNow(game) {
      const all = await this.known()
      const had = all[game.name]
      all[game.name] = {
        // Which game this is, exactly, so a cover can be looked for again
        // later without guessing from the name. Games picked before this was
        // kept have none, and are looked for by name instead.
        ...(game.id ? { id: game.id } : had?.id ? { id: had.id } : {}),
        platforms: game.platforms ?? [],
        // Genres are the one thing here you can change by hand, so a game
        // already on the list keeps the ones it has. Picking the same game
        // again — to fix a cover, or by way of changing your mind back —
        // must not quietly throw your own filing away.
        genres: had?.genres?.length ? had.genres : cleanGenres(game.genres),
        released: game.released ?? '',
        // The same care the genres get, and for a sharper reason: this is
        // written every time a game is picked, and a pick whose lookup came
        // back empty would otherwise rub out the cover recorded on the day it
        // worked. Nothing is better than something only when there was
        // nothing before.
        cover: game.cover || had?.cover || '',
      }
      await this.write(all)
    },

    /**
     * File a game under different genres.
     *
     * The database's are a starting point and a coarse one — it has no name
     * for the difference between a shooter and a first-person shooter, and no
     * idea which of the five it lists is the one you would have said. These
     * are yours, and nothing overwrites them afterwards.
     */
    async setGenres(name, genres) {
      const game = String(name ?? '').trim()
      if (!game) throw refused('which game?')
      return exclusive(async () => {
        const all = await this.known()
        all[game] = { ...(all[game] ?? {}), genres: cleanGenres(genres) }
        await this.write(all)
        return all[game]
      })
    },

    /**
     * Look again for the covers that were not there when their games were
     * picked, and keep any that are now.
     *
     * Only ever fills a blank. A game that has a picture keeps it, and
     * nothing here goes near a daily note: the cover is written beside the
     * others and into the list of what each game is, and the app draws a
     * block from there when its note has none. Your days stay exactly as
     * they were written.
     *
     * Found the same way a pick finds it. A game remembered with its id is
     * asked about by that id; one from before ids were kept is searched for
     * by name and only taken if the name comes back exactly — "Click the
     * button" from 2018 is not a stand-in for LoopCap's, and a picture of the
     * wrong game is worse than none.
     *
     * Answers with the names that got a cover this time. `force` is the
     * button in the settings: asked now, however recently it last was.
     */
    async refill({ force = false } = {}) {
      if (!keyNow()) return []
      const filled = []
      for (const [name, facts] of Object.entries(await this.known())) {
        if (facts?.cover) continue
        const last = tried.get(name)
        if (!force && last && Date.now() - last < REFILL_EVERY_MS) continue
        tried.set(name, Date.now())

        try {
          let id = facts?.id ?? ''
          let image = ''
          if (id) {
            image = await coverOf(id, name, steamId(id) ? String(steamId(id)) : '')
          } else {
            const asked = name.replace(/\s*\([^)]*\)\s*$/, '')
            const hit = (await this.search(asked)).find((game) => game.name === name)
            if (hit) {
              id = hit.id
              image = hit.cover
            }
          }
          if (!id || !image) continue

          const kept = await this.keep({ id, name, image })
          if (!kept.cover) continue

          const done = await exclusive(async () => {
            // Read again: something may have been picked or re-filed while
            // this was out asking, and that change is not ours to undo.
            const all = await this.known()
            if (!all[name] || all[name].cover) return false
            all[name] = { ...all[name], cover: kept.cover, ...(all[name].id ? {} : { id }) }
            await this.write(all)
            return true
          })
          if (done) filled.push(name)
        } catch (err) {
          console.error(`looking again for a cover for "${name}": ${err.message}`)
        }
      }
      return filled
    },

    async write(all) {
      // Only the covers folder itself, never the vault above it: a fresh
      // install's placeholder vault must not be made up on someone's drive.
      await fs.mkdir(coversDir).catch((err) => { if (err.code !== 'EEXIST') throw err })
      const target = path.join(coversDir, FACTS_FILE)
      const tmp = `${target}.tmp-${process.pid}`
      await fs.writeFile(tmp, `${JSON.stringify(all, null, 1)}\n`, 'utf8')
      await fs.rename(tmp, target)
    },

    /** Everything remembered so far, by game name. Empty if there is none. */
    async known() {
      try {
        const text = await fs.readFile(path.join(coversDir, FACTS_FILE), 'utf8')
        const parsed = JSON.parse(text.replace(/^﻿/, ''))
        return parsed && typeof parsed === 'object' ? parsed : {}
      } catch {
        // Missing, or edited into something we can't read. Either way there is
        // nothing to say about a game, which the card is built to survive.
        return {}
      }
    },
  }
}
