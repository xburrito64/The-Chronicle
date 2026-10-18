import assert from 'node:assert'
import { airedIn, seasonsOf, shapeSeries, shapeMovie, coverSource, authFor } from './tmdb.js'

let pass = 0, fail = 0
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name) }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message) }
}

const last = { season_number: 27, episode_number: 4 }

t('every season before the last one aired is whole', () => {
  assert.equal(airedIn({ season_number: 26, episode_count: 6 }, last, '2026-10-18'), 6)
})

t('the season going out stops at the last episode aired', () => {
  assert.equal(airedIn({ season_number: 27, episode_count: 10 }, last, '2026-10-18'), 4)
})

t('a season after it has not started', () => {
  assert.equal(airedIn({ season_number: 28, episode_count: 10 }, last, '2026-10-18'), 0)
})

t('with no last episode said, a season that has started counts whole', () => {
  assert.equal(airedIn({ season_number: 1, episode_count: 8, air_date: '2020-01-01' }, null, '2026-10-18'), 8)
  assert.equal(airedIn({ season_number: 2, episode_count: 8, air_date: '2027-01-01' }, null, '2026-10-18'), 0)
})

t('the seasons leave out the specials, in order, with what has aired', () => {
  const seasons = seasonsOf({
    last_episode_to_air: { season_number: 2, episode_number: 3 },
    seasons: [
      { season_number: 2, episode_count: 10, name: 'Season 2', air_date: '2026-09-01', poster_path: '/b.jpg' },
      { season_number: 0, episode_count: 5, name: 'Specials' },
      { season_number: 1, episode_count: 8, name: '', air_date: '2025-01-01' },
    ],
  }, '2026-10-18')
  assert.deepStrictEqual(seasons.map((s) => [s.number, s.name, s.aired, s.year]),
    [[1, 'Season 1', 8, 2025], [2, 'Season 2', 3, 2026]])
  assert.equal(seasons[1].cover, 'https://image.tmdb.org/t/p/w500/b.jpg')
})

t('a search hit becomes a series with its genres named', () => {
  const s = shapeSeries({
    id: 2190, name: 'South Park', original_name: 'South Park', first_air_date: '1997-08-13',
    genre_ids: [16, 35], poster_path: '/p.jpg', overview: 'Four boys.',
  }, new Map([[16, 'Animation'], [35, 'Comedy']]))
  assert.deepStrictEqual(s, {
    id: 2190, name: 'South Park', original: '', year: 1997, seasons: null,
    genres: ['Animation', 'Comedy'], cover: 'https://image.tmdb.org/t/p/w500/p.jpg',
    description: 'Four boys.', duration: null,
  })
})

t('a full film record carries its running time', () => {
  const m = shapeMovie({
    id: 693134, title: 'Dune: Part Two', release_date: '2024-02-27', runtime: 167,
    genres: [{ id: 878, name: 'Science Fiction' }], poster_path: '/d.jpg',
  })
  assert.equal(m.duration, 167)
  assert.equal(m.year, 2024)
  assert.deepStrictEqual(m.genres, ['Science Fiction'])
})

t('only posters from TMDB are fetched', () => {
  assert.ok(coverSource('https://image.tmdb.org/t/p/w500/abc.jpg'))
  assert.throws(() => coverSource('https://example.com/t/p/w500/abc.jpg'))
  assert.throws(() => coverSource('http://image.tmdb.org/t/p/w500/abc.jpg'))
  assert.throws(() => coverSource('https://image.tmdb.org/other/abc.jpg'))
})

t('a short key goes in the address, a long token in a header', () => {
  assert.deepStrictEqual(authFor('abc123def456'), { headers: {}, params: { api_key: 'abc123def456' } })
  assert.deepStrictEqual(authFor('eyJhbGc.eyJzdWI.sig'),
    { headers: { Authorization: 'Bearer eyJhbGc.eyJzdWI.sig' }, params: {} })
})

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
