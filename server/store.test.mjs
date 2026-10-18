import assert from 'node:assert'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createStore, validateEntries } from './store.js'

let pass = 0, fail = 0
const t = async (name, fn) => {
  try { await fn(); pass++; console.log('  ok   ' + name) }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message) }
}

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'daily-doc-'))
const store = createStore(dir)

await t('entry order survives the round trip', async () => {
  // Order is the stacking order, so it must come back exactly as written even
  // though these are not in time order.
  const entries = [
    { tag: 'sleep', start: '00:00', end: '04:00' },
    { tag: 'dgg', start: '11:00', end: '14:00' },
    { tag: 'music', start: '06:00', end: '12:30' },
  ]
  await store.writeDay('2027-06-15', entries)
  const back = await store.readDay('2027-06-15')
  assert.deepStrictEqual(back.entries.map((e) => e.tag), ['sleep', 'dgg', 'music'])
})

await t('a notes folder that is not there is never made up', async () => {
  // A fresh install points at a placeholder until a folder is picked.
  const nowhere = path.join(dir, 'not-a-folder-yet', 'Daily')
  const missing = createStore(nowhere)
  await assert.rejects(
    missing.writeDay('2027-06-16', [{ tag: 'sleep', start: '00:00', end: '04:00' }]),
    (err) => err.status === 409 && /Setup/.test(err.message),
  )
  await assert.rejects(fs.stat(path.join(dir, 'not-a-folder-yet')), 'and nothing was created on the way')
})

await t('validateEntries does not reorder', () => {
  const out = validateEntries([
    { tag: 'b', start: '10:00', end: '11:00' },
    { tag: 'a', start: '01:00', end: '02:00' },
  ])
  assert.deepStrictEqual(out.map((e) => e.tag), ['b', 'a'])
})

await t('overlapping entries are accepted', () => {
  const out = validateEntries([
    { tag: 'game', start: '14:00', end: '18:00' },
    { tag: 'dgg', start: '15:00', end: '16:00' },
  ])
  assert.strictEqual(out.length, 2)
})

await t('a day written on the old 15-minute grid still opens', async () => {
  // Days logged before a slot became ten minutes are records, not damage:
  // they must read back normally rather than being called malformed.
  const file = store.fileFor('2027-06-20')
  await fs.writeFile(file, '```daily-log\n[{"tag":"sleep","start":"23:45","end":"24:00"}]\n```\n', 'utf8')
  const back = await store.readDay('2027-06-20')
  assert.strictEqual(back.malformed, false, 'must not be called malformed')
  assert.deepStrictEqual(back.entries, [{ tag: 'sleep', start: '23:45', end: '24:00' }])
})

await t('but writing off the grid is still refused', async () => {
  assert.throws(
    () => validateEntries([{ tag: 'x', start: '09:45', end: '10:00' }]),
    /10-minute marks/,
  )
})

await t('bad shapes are still rejected', () => {
  const bad = [
    [{ tag: 'x', start: '09:07', end: '10:00' }],   // off the grid entirely
    [{ tag: 'x', start: '10:00', end: '09:00' }],   // ends before it starts
    [{ start: '00:00', end: '01:00' }],             // no tag
    [{ tag: 'x', start: '25:00', end: '26:00' }],   // not a time
  ]
  for (const entries of bad) {
    assert.throws(() => validateEntries(entries), new RegExp('entry 0'))
  }
})

await t('notes survive, stray fields do not', async () => {
  await store.writeDay('2027-06-16', [
    { tag: 'game', start: '01:00', end: '02:00', note: 'kept', bogus: 'dropped' },
  ])
  const back = await store.readDay('2027-06-16')
  assert.deepStrictEqual(back.entries, [{ tag: 'game', start: '01:00', end: '02:00', note: 'kept' }])
})

await t('a game and its cover are kept, and go in readable', async () => {
  await store.writeDay('2027-06-17', [
    { tag: 'game', start: '14:00', end: '16:00', game: 'Elden Ring', cover: 'elden-ring-326243.jpg' },
  ])
  const text = await fs.readFile(path.join(dir, '2027-06-17.md'), 'utf8')
  // The name is the record: it has to read as a name in the note itself, not
  // as an id that means something only to this app.
  assert.ok(text.includes('"game":"Elden Ring"'), text)
  const back = await store.readDay('2027-06-17')
  assert.deepStrictEqual(back.entries[0].game, 'Elden Ring')
  assert.deepStrictEqual(back.entries[0].cover, 'elden-ring-326243.jpg')
})

await t('a cover is a filename and nothing else', () => {
  for (const cover of ['../../secrets.jpg', 'covers/x.jpg', 'x.exe', '.hidden.jpg', 'C:/x.jpg']) {
    assert.throws(
      () => validateEntries([{ tag: 'game', start: '01:00', end: '02:00', game: 'X', cover }]),
      new RegExp('bad cover'),
      cover,
    )
  }
})

await t('a cover without a game is dropped', () => {
  assert.deepStrictEqual(
    validateEntries([{ tag: 'game', start: '01:00', end: '02:00', cover: 'x.jpg' }]),
    [{ tag: 'game', start: '01:00', end: '02:00' }],
  )
})

await t('a show carries which episodes were watched', () => {
  assert.deepStrictEqual(
    validateEntries([{
      tag: 'anime', start: '20:00', end: '21:00',
      show: 'Frieren: Beyond Journey’s End', episodes: [5, 6, 7],
    }]),
    [{
      tag: 'anime', start: '20:00', end: '21:00',
      show: 'Frieren: Beyond Journey’s End', episodes: [5, 6, 7],
    }],
  )
})

await t('episodes are sorted and deduped on the way in', () => {
  const [entry] = validateEntries([{
    tag: 'anime', start: '20:00', end: '21:00', show: 'X', episodes: [7, 5, 6, 5],
  }])
  assert.deepStrictEqual(entry.episodes, [5, 6, 7])
})

await t('an episode has to be a whole, sane number', () => {
  for (const episodes of [[0], [-3], [1.5], ['4'], [99999], [null]]) {
    assert.throws(
      () => validateEntries([{ tag: 'anime', start: '01:00', end: '02:00', show: 'X', episodes }]),
      /bad episode/,
      JSON.stringify(episodes),
    )
  }
  assert.throws(
    () => validateEntries([{ tag: 'anime', start: '01:00', end: '02:00', show: 'X', episodes: 7 }]),
    /episodes must be a list/,
  )
  assert.throws(
    () => validateEntries([{
      tag: 'anime', start: '01:00', end: '02:00', show: 'X',
      episodes: Array.from({ length: 61 }, (_, i) => i + 1),
    }]),
    /too many episodes/,
  )
})

await t('episodes without a show are dropped — they would name nothing', () => {
  assert.deepStrictEqual(
    validateEntries([{ tag: 'anime', start: '01:00', end: '02:00', episodes: [1, 2] }]),
    [{ tag: 'anime', start: '01:00', end: '02:00' }],
  )
})

await t('a show and its cover survive being written and read back', async () => {
  await store.writeDay('2027-06-18', [{
    tag: 'anime', start: '20:00', end: '21:30',
    show: 'Frieren', episodes: [1, 2, 3], cover: 'frieren-154587.jpg',
  }])
  const back = await store.readDay('2027-06-18')
  assert.deepStrictEqual(back.entries[0].show, 'Frieren')
  assert.deepStrictEqual(back.entries[0].episodes, [1, 2, 3])
  assert.deepStrictEqual(back.entries[0].cover, 'frieren-154587.jpg')
})

await t('the first day logged passes over notes with nothing logged, and touches none of them', async () => {
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), 'daily-first-'))
  const notes = {
    '2019-04-02': '# A diary entry from before the app\n\nJust words.\n',
    '2020-01-01': 'Words.\n\n```daily-log\n\n```\n',
    '2021-06-30': 'Hand-edited into nonsense.\n\n```daily-log\n[{"tag": \n```\n',
    '2023-03-03': 'The first real day.\n\n```daily-log\n[{"tag":"sleep","start":"00:00","end":"07:00"}]\n```\n',
    '2024-01-01': '```daily-log\n[{"tag":"walk","start":"10:00","end":"11:00"}]\n```\n',
  }
  for (const [date, text] of Object.entries(notes)) await fs.writeFile(path.join(vault, `${date}.md`), text, 'utf8')
  const first = await createStore(vault).firstLogged()
  assert.strictEqual(first, '2023-03-03')
  for (const [date, text] of Object.entries(notes)) {
    assert.strictEqual(await fs.readFile(path.join(vault, `${date}.md`), 'utf8'), text, `${date} must be untouched`)
  }
  assert.strictEqual(await createStore(path.join(vault, 'nowhere')).firstLogged(), null)
  await fs.rm(vault, { recursive: true, force: true })
})

await t('a series keeps its season beside the episodes', async () => {
  const [e] = validateEntries([{ tag: 'series', start: '21:00', end: '22:00', show: 'South Park', season: 27, episodes: [4, 3], cover: 'south-park-tv2190.jpg' }])
  assert.deepStrictEqual(e, { tag: 'series', start: '21:00', end: '22:00', show: 'South Park', season: 27, episodes: [3, 4], cover: 'south-park-tv2190.jpg' })
})

await t('a season with no show is not written', async () => {
  const [e] = validateEntries([{ tag: 'series', start: '21:00', end: '22:00', season: 3 }])
  assert.equal(e.season, undefined)
})

await t('a season that is not a small whole number is refused', async () => {
  for (const season of [0, -1, 2.5, '3', 1000]) {
    assert.throws(() => validateEntries([{ tag: 'series', start: '21:00', end: '22:00', show: 'X', season }]))
  }
})

await t('a film is a name and its poster', async () => {
  const [e] = validateEntries([{ tag: 'movie', start: '20:00', end: '22:10', film: 'Dune: Part Two', cover: 'dune-part-two-film693134.jpg', episodes: [1] }])
  assert.deepStrictEqual(e, { tag: 'movie', start: '20:00', end: '22:10', film: 'Dune: Part Two', cover: 'dune-part-two-film693134.jpg' })
  assert.throws(() => validateEntries([{ tag: 'movie', start: '20:00', end: '22:10', film: 5 }]))
})

await fs.rm(dir, { recursive: true, force: true })
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
