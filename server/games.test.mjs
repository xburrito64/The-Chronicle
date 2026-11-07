import assert from 'node:assert'
import fs from 'node:fs/promises'
import os from 'node:os'
import nodePath from 'node:path'
import {
  slugify, steamCover, coverSource, cleanGenres, pickGrid, createGames,
  steamId, gridId, gameStamp, plainName, gameGap, twinOf, shapeSteam, shapeGrid,
} from './games.js'

let pass = 0, fail = 0
const t = async (name, fn) => {
  try { await fn(); pass++; console.log('  ok   ' + name) }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message) }
}

await t('a game name becomes a filename you can still read', () => {
  assert.equal(slugify('Grand Theft Auto V'), 'grand-theft-auto-v')
  assert.equal(slugify('NieR:Automata'), 'nier-automata')
  assert.equal(slugify('Ōkami HD'), 'okami-hd')
  assert.equal(slugify('  Hades  '), 'hades')
})

await t('a name with nothing in it still names a file', () => {
  // A cover is written to disk under this. Coming back empty would mean a
  // filename that is only an extension.
  assert.equal(slugify('???'), 'game')
  assert.equal(slugify(''), 'game')
})

await t('a slug cannot walk out of the covers folder', () => {
  assert.equal(slugify('../../etc/passwd'), 'etc-passwd')
  assert.equal(slugify('..'), 'game')
})

await t("a cover is Steam's upright library picture", () => {
  // The one size Steam serves that is a cover rather than a banner. Every
  // other one is wide, and a wide picture is key art, which is the thing
  // this replaced.
  assert.equal(
    steamCover(1245620),
    'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/1245620/library_600x900.jpg',
  )
  assert.equal(coverSource(steamCover(1245620)).hostname, 'shared.cloudflare.steamstatic.com')
})

await t('covers come from a host we know or they do not come at all', () => {
  // Whatever is in the note eventually turns into a download. The host it
  // names is not something to take on trust — and a second source being
  // allowed is a second host, not an open door.
  for (const url of [
    'https://example.com/store_item_assets/steam/apps/1/library_600x900.jpg',
    'http://shared.cloudflare.steamstatic.com.evil.test/x/library_600x900.jpg',
    'file:///C:/Windows/System32/library_600x900.jpg',
  ]) {
    assert.throws(() => coverSource(url), new RegExp('not a'), url)
  }
})

await t('and only the cover, not anything else that host serves', () => {
  const host = 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/620'
  for (const file of ['header.jpg', 'capsule_231x87.jpg', 'movie480.webm', '']) {
    assert.throws(() => coverSource(`${host}/${file}`), new RegExp('not a Steam cover'), file)
  }
})

await t('genres are tidied on the way in', () => {
  // They are typed by hand, so they arrive however they were typed.
  assert.deepStrictEqual(cleanGenres(['  Turn-Based  Strategy ', '', null, 'Indie']),
    ['Turn-Based Strategy', 'Indie'])
})

await t('the same genre twice is one genre', () => {
  // "FPS" and "fps" are the same filing, and the spelling already on screen
  // is the one that stays.
  assert.deepStrictEqual(cleanGenres(['FPS', 'fps', 'Fps']), ['FPS'])
})

await t('a card cannot be flooded with genres', () => {
  assert.equal(cleanGenres(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']).length, 6)
  assert.equal(cleanGenres(['x'.repeat(200)])[0].length, 40)
})

await t('nothing at all is a perfectly good answer', () => {
  for (const bad of [null, undefined, 'Action', 42, {}]) {
    assert.deepStrictEqual(cleanGenres(bad), [], String(bad))
  }
})

// --- the second place a cover can come from --------------------------------

await t("SteamGridDB's covers are allowed through as well", () => {
  // Steam cannot dress every game: it never sold Minecraft, and a game it
  // does sell can have no library art up yet.
  const url = 'https://cdn2.steamgriddb.com/grid/9f2c6b1e.png'
  assert.equal(coverSource(url).href, url)
  assert.ok(coverSource('https://cdn.steamgriddb.com/grid/a1.jpg'))
  assert.ok(coverSource('https://cdn2.steamgriddb.com/grid/a1.webp'))
})

await t('but nothing else pretending to be one is', () => {
  const no = [
    'https://steamgriddb.com.evil.example.com/grid/x.png',
    'https://cdn2.steamgriddb.com/grid/x.svg',
    'https://cdn2.steamgriddb.com/grid/x.exe',
    'http://cdn2.steamgriddb.com/grid/x.png',
    'https://example.com/grid/x.png',
  ]
  for (const url of no) assert.throws(() => coverSource(url), /not a/, url)
})

await t('the cover picked is the right shape and the best liked', () => {
  // People upload these, so a game can have fifty and they are not all the
  // box. Only the ones the size Steam's own covers are.
  const body = { data: [
    { url: 'https://cdn2.steamgriddb.com/grid/wide.png', width: 920, height: 430, score: 999 },
    { url: 'https://cdn2.steamgriddb.com/grid/ok.png', width: 600, height: 900, score: 3 },
    { url: 'https://cdn2.steamgriddb.com/grid/best.png', width: 600, height: 900, score: 40 },
  ] }
  assert.equal(pickGrid(body), 'https://cdn2.steamgriddb.com/grid/best.png')
})

await t('and nothing is picked when there is nothing of that shape', () => {
  assert.equal(pickGrid({ data: [{ url: 'https://cdn2.steamgriddb.com/grid/w.png', width: 460, height: 215, score: 9 }] }), '')
  assert.equal(pickGrid({ data: [] }), '')
  assert.equal(pickGrid(null), '')
  // An entry with no address is not an answer, however well liked.
  assert.equal(pickGrid({ data: [{ width: 600, height: 900, score: 99 }] }), '')
})

// --- not losing a cover we already have -----------------------------------
//
// The way this broke in the wild: Steam had the cover on the day the game was
// first logged, stopped serving it a day later, and the next entry for the
// same game came back empty. The empty answer then overwrote the good record,
// so a picture sitting in the vault the whole time stopped being used.

const tmp = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'covers-'))
const games = createGames({ apiKey: '', coversDir: tmp })

await t('a lookup that comes back empty uses the cover already in the vault', async () => {
  await fs.writeFile(nodePath.join(tmp, 'a-game-about-chopping-trees-1019471.jpg'), 'not really a jpeg')
  const kept = await games.keep({ id: 1019471, name: 'A Game About Chopping Trees', image: '' })
  assert.equal(kept.cover, 'a-game-about-chopping-trees-1019471.jpg')
})

await t('whatever the picture was saved as', async () => {
  await fs.writeFile(nodePath.join(tmp, 'minecraft-22509.png'), 'not really a png')
  assert.equal((await games.keep({ id: 22509, name: 'Minecraft', image: '' })).cover, 'minecraft-22509.png')
})

await t('and answers with nothing when there really is nothing', async () => {
  assert.equal((await games.keep({ id: 999999, name: 'Never Logged', image: '' })).cover, '')
})

await t('an empty cover never rubs out the one already written down', async () => {
  const game = { name: 'A Game About Chopping Trees', platforms: ['PC'], genres: ['Indie'] }
  await games.remember({ ...game, cover: 'a-game-about-chopping-trees-1019471.jpg' })
  // The same game picked again on a day the lookup failed.
  await games.remember({ ...game, cover: '' })
  assert.equal((await games.known())[game.name].cover, 'a-game-about-chopping-trees-1019471.jpg')
})

await t('but a new cover does replace an old one', async () => {
  const game = { name: 'A Game About Chopping Trees', platforms: ['PC'], genres: ['Indie'] }
  await games.remember({ ...game, cover: 'a-game-about-chopping-trees-1019471.png' })
  assert.equal((await games.known())[game.name].cover, 'a-game-about-chopping-trees-1019471.png')
})

await t("a game off Steam's shelf is filed under the shop's name", async () => {
  // So the same game, if RAWG ever catches up, can never be handed this
  // picture by accident — and a RAWG id never gets Steam's number.
  await fs.writeFile(nodePath.join(tmp, 'dub-together-steam-5020310.jpg'), 'not really a jpeg')
  const kept = await games.keep({ id: 'steam-5020310', name: 'Dub Together', image: '' })
  assert.equal(kept.cover, 'dub-together-steam-5020310.jpg')
})

await t('an id from neither shelf is refused', async () => {
  await assert.rejects(games.keep({ id: 'steam-', name: 'x', image: '' }), /bad game id/)
  await assert.rejects(games.keep({ id: 'anything', name: 'x', image: '' }), /bad game id/)
  await assert.rejects(games.keep({ id: -4, name: 'x', image: '' }), /bad game id/)
})

await fs.rm(tmp, { recursive: true, force: true })

// --- two shelves, one list ---------------------------------------------------

await t("the two shelves never wear each other's numbers", () => {
  assert.equal(steamId('steam-5020310'), 5020310)
  assert.equal(steamId(5020310), null)
  assert.equal(steamId('5020310'), null)
  assert.equal(gameStamp(1019721), '1019721', 'RAWG stays the bare number it always was')
  assert.equal(gameStamp('steam-5020310'), 'steam-5020310')
  assert.equal(gameStamp('steam-0'), null)
  assert.equal(gameStamp('nope'), null)
})

await t('a name is what two databases would agree on', () => {
  assert.equal(plainName('Click the Button (LoopCap)'), 'click the button')
  assert.equal(plainName('Click the Button'), 'click the button')
  assert.equal(plainName('Minecraft: Dungeons'), plainName('Minecraft Dungeons'))
  assert.equal(plainName("Hades' Star™"), 'hades star')
  assert.equal(plainName('Click the Button!'), 'click the button')
  // The bracket only comes off the end.
  assert.equal(plainName('Hades (2016)'), 'hades')
  assert.equal(plainName('Hades 2 (2001)'), 'hades 2')
})

await t('same name and near enough the same year is the same game', () => {
  const steam = { name: 'Click the Button', released: '2026' }
  assert.equal(gameGap({ name: 'Click the Button (LoopCap)', released: '2026' }, steam), 0)
  assert.equal(gameGap({ name: 'Click the button', released: '2018' }, steam), null, 'eight years is a different game')
  // A port lands on Steam after it came out.
  assert.equal(gameGap({ name: "Hades' Star", released: '2017' }, { name: "Hades' Star", released: '2019' }), 2)
  assert.equal(gameGap({ name: 'Minecraft: Dungeons', released: '2020' }, { name: 'Minecraft Dungeons', released: '2021' }), 1)
  assert.equal(gameGap({ name: 'Hades', released: '2020' }, { name: 'Hades II', released: '2025' }), null, 'a different name')
  assert.equal(gameGap({ name: 'Something', released: '' }, { name: 'Something', released: '2024' }), 2, 'silence is not a disagreement')
})

await t('and the eleven namesakes each find their own twin', () => {
  const rawg = [
    { id: 1, name: 'Click the button', released: '2018' },
    { id: 2, name: 'Click the Button!', released: '2022' },
    { id: 3, name: 'Click the Button (samumalta)', released: '2023' },
    { id: 4, name: 'Click the Button (LoopCap)', released: '2026' },
  ]
  assert.equal(twinOf({ name: 'Click the Button', released: '2026' }, rawg)?.id, 4)
  assert.equal(twinOf({ name: 'Click the Button', released: '2023' }, rawg)?.id, 3)
  assert.equal(twinOf({ name: 'Click the Button', released: '2010' }, rawg), null)
  // The closest year wins, not the first in the list.
  assert.equal(twinOf({ name: 'Click the Button', released: '2024' }, rawg)?.id, 3)
})

await t('a game as Steam describes it comes back in the words RAWG uses', () => {
  const shown = shapeSteam(5020310, {
    type: 'game',
    name: 'Dub Together ',
    release_date: { date: 'Sep 1, 2026' },
    genres: [{ description: 'Casual' }, { description: 'Indie' }],
    platforms: { windows: true, mac: false, linux: true },
    short_description: 'Up to six players redub video clips.',
  })
  assert.deepEqual(shown, {
    id: 'steam-5020310',
    appId: '5020310',
    type: 'game',
    name: 'Dub Together',
    released: '2026',
    cover: '',
    genres: ['Casual', 'Indie'],
    platforms: ['PC', 'Linux'],
    description: 'Up to six players redub video clips.',
  })
})

await t('and says nothing it was not told', () => {
  const shown = shapeSteam(1, {})
  assert.deepEqual(
    { name: shown.name, released: shown.released, genres: shown.genres, platforms: shown.platforms, description: shown.description },
    { name: '', released: '', genres: [], platforms: [], description: '' },
  )
})

// --- looking again for covers that were not there ---------------------------
//
// With a stand-in for the internet, so these say exactly what happens and
// never go online. Steam has a cover for app 5 and nothing else; RAWG and
// Steam's search know no games at all.

const realFetch = globalThis.fetch
const asked = []
globalThis.fetch = async (input, init = {}) => {
  const url = String(input)
  asked.push(url)
  if (url.includes('/apps/5/library_600x900.jpg')) {
    return new Response(init.method === 'HEAD' ? null : 'a picture', { status: 200 })
  }
  if (url.includes('api.rawg.io/api/games?')) return Response.json({ results: [] })
  if (url.includes('/api/storesearch/')) return Response.json({ items: [] })
  return new Response('', { status: 404 })
}

const shelf = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'refill-'))
const facts = nodePath.join(shelf, 'games.json')
const start = {
  'Has One': { platforms: ['PC'], genres: ['Mine'], released: '2020', cover: 'has-one-1.jpg' },
  'Found Later': { id: 'steam-5', platforms: ['PC'], genres: ['Yours'], released: '2026', cover: '' },
  'Nowhere': { platforms: [], genres: [], released: '', cover: '' },
}
await fs.writeFile(facts, JSON.stringify(start))
const refilling = createGames({ apiKey: 'a key', coversDir: shelf })

await t('a cover that turned up since is found and kept', async () => {
  assert.deepEqual(await refilling.refill(), ['Found Later'])
  const now = JSON.parse(await fs.readFile(facts, 'utf8'))
  assert.equal(now['Found Later'].cover, 'found-later-steam-5.jpg')
  assert.equal(await fs.readFile(nodePath.join(shelf, 'found-later-steam-5.jpg'), 'utf8'), 'a picture')
})

await t('and nothing else in the list is touched', async () => {
  const now = JSON.parse(await fs.readFile(facts, 'utf8'))
  assert.deepEqual(now['Has One'], start['Has One'], 'a cover already there stays')
  assert.deepEqual(now['Found Later'].genres, ['Yours'], 'your own filing stays')
  assert.deepEqual(now.Nowhere, start.Nowhere, 'no cover anywhere is still no cover')
})

await t('a game with a cover is never asked about', async () => {
  assert.ok(!asked.some((url) => /has[-%20]one/i.test(url)))
})

await t('a game with no id is only taken by its exact name', async () => {
  // "Nowhere" was searched for, and nothing came back called exactly that.
  assert.ok(asked.some((url) => url.includes('search=Nowhere')))
  const now = JSON.parse(await fs.readFile(facts, 'utf8'))
  assert.equal(now.Nowhere.cover, '')
})

await t('and nobody is asked twice in one sitting', async () => {
  const before = asked.length
  assert.deepEqual(await refilling.refill(), [])
  assert.equal(asked.length, before, 'no request went out at all')
})

await t('with no RAWG key there is nothing to ask with, and nothing is asked', async () => {
  const before = asked.length
  assert.deepEqual(await createGames({ apiKey: '', coversDir: shelf }).refill(), [])
  assert.equal(asked.length, before)
})

await t('a pick and a refill at the same moment both land', async () => {
  // The way this would go wrong: both read the list, both write it, and the
  // second write loses the first. One of them is someone's own genres.
  await fs.writeFile(facts, JSON.stringify({
    'Found Later': { id: 'steam-5', genres: [], cover: '' },
  }))
  await fs.rm(nodePath.join(shelf, 'found-later-steam-5.jpg'))
  const fresh = createGames({ apiKey: 'a key', coversDir: shelf })
  await Promise.all([
    fresh.refill(),
    fresh.remember({ id: 7, name: 'Picked Just Now', genres: ['Puzzle'], cover: 'x.jpg' }),
    fresh.setGenres('Found Later', ['Mine']),
  ])
  const now = JSON.parse(await fs.readFile(facts, 'utf8'))
  assert.equal(now['Found Later'].cover, 'found-later-steam-5.jpg')
  assert.deepEqual(now['Found Later'].genres, ['Mine'])
  assert.equal(now['Picked Just Now'].cover, 'x.jpg')
  assert.equal(now['Picked Just Now'].id, 7, 'and a new pick remembers exactly which game it was')
})

// --- RAWG being down ---------------------------------------------------------
//
// The same stand-in idea. `rawg` says how RAWG is failing, or that it is fine;
// Steam sells Hades and nothing else; SteamGridDB knows Fortnite and Hades.

const GRID_COVER = 'https://cdn2.steamgriddb.com/grid/fortnite.png'
const gridGames = {
  fortnite: [
    { id: 36136, name: 'Fortnite', release_date: 1500940800 },
    { id: 5438682, name: 'Fortnite Festival', release_date: 1702080000 },
    { id: 99, name: 'Fortnite Porting' },
  ],
  hades: [{ id: 7, name: 'Hades', release_date: 1600300800 }],
}
let rawg = 'timeout'
const down = []
const outage = async (input, init = {}) => {
  const url = String(input)
  down.push(url)
  if (url.includes('api.rawg.io')) {
    if (rawg === 'timeout') throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    if (rawg === '522') return new Response('', { status: 522 })
    if (url.includes('/games?')) return Response.json({ results: [{ id: 1, name: 'Fortnite', released: '2017-07-25' }] })
    return Response.json({ results: [], description_raw: '' })
  }
  if (url.includes('/api/storesearch/')) {
    return Response.json({ items: url.includes('hades') ? [{ type: 'app', id: 1145360 }] : [] })
  }
  if (url.includes('/api/appdetails')) {
    return Response.json({ 1145360: { success: true, data: { type: 'game', name: 'Hades', release_date: { date: '17 Sep, 2020' } } } })
  }
  if (url.includes('/search/autocomplete/')) {
    const term = decodeURIComponent(url.split('/search/autocomplete/')[1])
    return Response.json({ data: gridGames[term] ?? [] })
  }
  if (url.includes('/grids/game/36136')) {
    return Response.json({ data: [{ width: 600, height: 900, score: 1, url: GRID_COVER }] })
  }
  if (url.includes('/grids/')) return Response.json({ data: [] })
  if (init.method === 'HEAD') return new Response(null, { status: 404 })
  return new Response('a picture', { status: 200 })
}
globalThis.fetch = outage

const quiet = console.error
console.error = () => {}
const withGrid = () => createGames({ apiKey: 'a key', gridKey: 'a grid key', coversDir: shelf })

await t('a SteamGridDB game has an id of its own, and a year if it says one', () => {
  assert.equal(gridId('grid-36136'), 36136)
  assert.equal(gridId(36136), null)
  assert.equal(gridId('grid-0'), null)
  assert.equal(gameStamp('grid-36136'), 'grid-36136')
  assert.equal(shapeGrid({ id: 36136, name: 'Fortnite', release_date: 1500940800 }).released, '2017')
  assert.equal(shapeGrid({ id: 99, name: 'Undated' }).released, '')
})

for (const failure of ['timeout', '522']) {
  await t(`with RAWG failing by ${failure}, a game Steam never sold is still found`, async () => {
    rawg = failure
    const results = await withGrid().search('fortnite')
    assert.equal(results[0].name, 'Fortnite', 'what was typed comes first')
    assert.equal(results[0].id, 'grid-36136')
    assert.equal(results[0].released, '2017')
    assert.equal(results[0].cover, GRID_COVER)
    assert.equal(results.length, 3)
  })
}

await t('a game Steam and SteamGridDB both know is listed once, as Steam has it', async () => {
  rawg = 'timeout'
  const results = await withGrid().search('hades')
  assert.deepEqual(results.map((game) => game.id), ['steam-1145360'])
})

await t('a game found this way keeps its cover under its own name', async () => {
  rawg = 'timeout'
  const games = withGrid()
  const [game] = await games.search('fortnite')
  const kept = await games.keep({ id: game.id, name: game.name, image: game.cover })
  assert.equal(kept.cover, 'fortnite-grid-36136.png')
})

await t('nowhere knowing the name says RAWG is down, in words', async () => {
  rawg = 'timeout'
  await assert.rejects(withGrid().search('nothing called this'), (err) => {
    assert.match(err.message, /isn't answering/)
    assert.equal(err.status, 502)
    return true
  })
})

await t('without a SteamGridDB key it says so too, and asks nobody without one', async () => {
  rawg = '522'
  down.length = 0
  await assert.rejects(
    createGames({ apiKey: 'a key', coversDir: shelf }).search('fortnite'),
    /isn't answering/,
  )
  assert.ok(!down.some((url) => url.includes('steamgriddb')))
})

await t('with RAWG answering, SteamGridDB is not asked for names', async () => {
  rawg = 'fine'
  down.length = 0
  const results = await withGrid().search('fortnite')
  assert.equal(results[0].id, 1)
  assert.ok(!down.some((url) => url.includes('/search/autocomplete/fortnite')))
})

console.error = quiet
globalThis.fetch = realFetch
await fs.rm(shelf, { recursive: true, force: true })

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
