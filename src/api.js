async function request(url, options) {
  const res = await fetch(url, options)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(body.error ?? res.statusText), { status: res.status })
  return body
}

/** The tags, wearing the icon set picked in the settings — '' for the usual. */
export const getTags = (icons = '') =>
  request(icons ? `/api/tags?icons=${encodeURIComponent(icons)}` : '/api/tags')
export const getIconSets = () => request('/api/icon-sets')

const json = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/** Save the tag list; answers with it saved, wearing the icon set in use. */
export const saveTags = (tags, icons = '') =>
  request(`/api/tags${icons ? `?icons=${encodeURIComponent(icons)}` : ''}`, json('PUT', { tags }))
/** Give a tag its own picture, in the icon set in use. `picture` is a data: address. */
export const setTagPicture = (id, picture, set = '') =>
  request(`/api/tags/${encodeURIComponent(id)}/picture`, json('POST', { picture, set }))

/** Where the vault is and which keys are saved — never the keys themselves. */
export const getSetup = () => request('/api/setup')
export const saveKey = (which, key) => request('/api/setup/key', json('POST', { which, key }))
export const saveVault = (dir) => request('/api/setup/vault', json('POST', { dir }))
/** Look for every missing game cover now; answers with the games that got one. */
export const refillCovers = () => request('/api/games/refill', json('POST', {}))
export const getDay = (date) => request(`/api/day/${date}`)
/** The birthdays kept on this machine. */
export const getBirthdays = () => request('/api/birthdays')
/** Save the birthdays; answers with them as saved, new ones given ids. */
export const saveBirthdays = (birthdays) => request('/api/birthdays', json('PUT', { birthdays }))
/** The first day anything was logged, as { date }; date is null before there is one. */
export const getFirstDay = () => request('/api/first-day')

export const putDay = (date, entries) =>
  request(`/api/day/${date}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries }),
  })

export const getRange = (from, to) => request(`/api/range?from=${from}&to=${to}`)

/**
 * Every block in the vault that answers to a search. `signal` drops an
 * overtaken search, so the answer to what you typed a moment ago can never
 * land on top of the answer to what you are typing now.
 */
export const findBlocks = (query, signal) =>
  request(`/api/find?q=${encodeURIComponent(query)}`, { signal })

/**
 * Games matching what has been typed. `signal` abandons a search the moment
 * a newer one starts, so the answer to a word you have finished typing can
 * never land on top of the answer to the word you are typing now.
 */
export const searchGames = (query, signal) =>
  request(`/api/games?q=${encodeURIComponent(query)}`, { signal })

/**
 * Take a game: its cover into the vault, and what it is written down beside
 * the covers. Answers with the file the cover became.
 */
export const attachGame = (game) =>
  request('/api/games/attach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(game),
  })

/** How long has gone into each game, across every day in the vault. */
export const getPlayed = () => request('/api/games/played')

/** File a game under your own genres. Answers with the list as it was kept. */
export const setGenres = (name, genres) =>
  request('/api/games/genres', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, genres }),
  })

/** Shows matching what has been typed. `signal` abandons an overtaken search. */
export const searchAnime = (query, signal) =>
  request(`/api/anime?q=${encodeURIComponent(query)}`, { signal })

/**
 * Every season of the show one entry belongs to, earliest first. Asked for
 * separately because it costs a walk along AniList's sequel links, and is
 * only wanted once a show has been picked out of the search.
 */
export const animeSeasons = (id, signal) =>
  request(`/api/anime/seasons?id=${encodeURIComponent(id)}`, { signal })

/** Take a show: its cover into the vault, its facts beside the covers. */
export const attachAnime = (show) =>
  request('/api/anime/attach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(show),
  })

/** How long has gone into each show, and which episodes the vault knows of. */
export const getWatched = () => request('/api/anime/watched')

/** File a show under your own genres. */
export const setShowGenres = (name, genres) =>
  request('/api/anime/genres', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, genres }),
  })

/** Whether AniList is connected, and to whom. */
export const getAnilist = () => request('/api/anilist')

/** Keep the AniList connection. Answers with who the token turned out to be. */
export const saveAnilist = (clientId, token) =>
  request('/api/anilist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, token }),
  })

/**
 * Tell AniList a show has been watched up to an episode. `rewatching` is the
 * button on the card having been pressed; left off, the server works it out
 * from where AniList has you and what it was told last time.
 */
export const syncAnime = (name, episode, rewatching) =>
  request('/api/anime/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, episode, rewatching }),
  })

/** Where a show stands on AniList, and whether a rewatch is under way. */
export const getStanding = (name) =>
  request(`/api/anime/standing?name=${encodeURIComponent(name)}`)

/** Say a show is being watched again, or that it isn't any more. */
export const setRewatching = (name, rewatching) =>
  request('/api/anime/rewatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, rewatching }),
  })

/** Where a kept cover is served from. */
export const coverUrl = (file) => `/api/covers/${encodeURIComponent(file)}`

// --- series and films, off TMDB ---------------------------------------

/** Series matching what has been typed; `configured` is false with no key yet. */
export const searchSeries = (query, signal) =>
  request(`/api/series?q=${encodeURIComponent(query)}`, { signal })
/** Every season of a series, with how much of each has aired, and the show itself. */
export const seriesSeasons = (id, signal) =>
  request(`/api/series/seasons?id=${encodeURIComponent(id)}`, { signal })
/** Take a series: its poster into the vault, its facts beside the covers. */
export const attachSeries = (show) => request('/api/series/attach', json('POST', show))
/** How long has gone into each series, and which episodes of which season. */
export const getSeriesWatched = () => request('/api/series/watched')
export const setSeriesGenres = (name, genres) =>
  request('/api/series/genres', json('POST', { name, genres }))

/** Films matching what has been typed; `configured` is false with no key yet. */
export const searchMovies = (query, signal) =>
  request(`/api/movies?q=${encodeURIComponent(query)}`, { signal })
/** Take a film: its poster into the vault, its facts beside the covers. */
export const attachMovie = (film) => request('/api/movies/attach', json('POST', film))
/** How long has gone into each film, and how many times. */
export const getMoviesWatched = () => request('/api/movies/watched')
export const setMovieGenres = (name, genres) =>
  request('/api/movies/genres', json('POST', { name, genres }))
