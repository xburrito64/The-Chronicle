import assert from 'node:assert'
import { formatEpisodes, episodeLabel, furthest, recentShows } from './episodes.js'

let pass = 0, fail = 0
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name) }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message) }
}

t('one episode is just the number', () => {
  assert.equal(formatEpisodes([7]), '7')
  assert.equal(episodeLabel([7]), 'Episode 7')
})

t('a run of three or more collapses to a range', () => {
  assert.equal(formatEpisodes([5, 6, 7]), '5–7')
  assert.equal(episodeLabel([5, 6, 7]), 'Episodes 5–7')
})

t('two in a row are listed, not ranged', () => {
  // "5–6" is a range you have to work out to learn it holds two numbers.
  assert.equal(formatEpisodes([5, 6]), '5, 6')
})

t('gaps stay gaps', () => {
  assert.equal(formatEpisodes([1, 2, 3, 7, 9, 10, 11]), '1–3, 7, 9–11')
})

t('clicked in any order, it reads in one', () => {
  assert.equal(formatEpisodes([7, 5, 6]), '5–7')
  assert.equal(formatEpisodes([3, 1, 2, 3]), '1–3')
})

t('nothing picked says nothing', () => {
  assert.equal(formatEpisodes([]), '')
  assert.equal(formatEpisodes(null), '')
  assert.equal(episodeLabel([]), '')
  assert.equal(episodeLabel(undefined), '')
})

t('the furthest one is what AniList calls progress', () => {
  assert.equal(furthest([5, 6, 7]), 7)
  assert.equal(furthest([12, 3]), 12)
  assert.equal(furthest([]), 0)
  assert.equal(furthest(undefined), 0)
})

t('the shows watched lately come newest first, four of them', () => {
  const all = {
    A: { anilistId: 1, last: '2026-10-01', lastAt: '2026-10-01 22:00', seen: [1, 2] },
    B: { anilistId: 2, last: '2026-10-03', lastAt: '2026-10-03 20:00', seen: [5] },
    C: { anilistId: 3, last: '2026-10-03', lastAt: '2026-10-03 23:30' },
    D: { kitsuId: 9, last: '2026-09-20', lastAt: '2026-09-20 21:00', seen: [3, 4] },
    E: { anilistId: 5, last: '2026-09-01', lastAt: '2026-09-01 21:00' },
  }
  assert.deepStrictEqual(recentShows(all).map((s) => s.name), ['C', 'B', 'A', 'D'])
  assert.deepStrictEqual(recentShows(all)[3], { name: 'D', id: 'kitsu-9', last: '2026-09-20', upTo: 4 })
  assert.equal(recentShows(all)[1].upTo, 5)
})

t('a show never logged, or with no id to look it up by, is not offered', () => {
  const all = {
    picked: { anilistId: 1 },
    nameless: { last: '2026-10-01', lastAt: '2026-10-01 22:00' },
    real: { anilistId: 2, last: '2026-10-02', lastAt: '2026-10-02 22:00' },
  }
  assert.deepStrictEqual(recentShows(all).map((s) => s.name), ['real'])
})

t('the show the block already is is left out', () => {
  const all = {
    A: { anilistId: 1, last: '2026-10-02', lastAt: '2026-10-02 22:00' },
    B: { anilistId: 2, last: '2026-10-01', lastAt: '2026-10-01 22:00' },
  }
  assert.deepStrictEqual(recentShows(all, 'A').map((s) => s.name), ['B'])
  assert.deepStrictEqual(recentShows(null), [])
})

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
