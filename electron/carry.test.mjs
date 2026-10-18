import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { newTagsFor, iconsToAdd } from './carry.js'

let pass = 0, fail = 0
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name) }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message) }
}

const tag = (id) => ({ id, name: id, colour: '#000000', icon: '' })
const shipped = ['sleep', 'game', 'anime', 'series', 'movie', 'youtube'].map(tag)

t('an install from before is offered the new tags, beside the ones they follow', () => {
  const installed = ['sleep', 'anime', 'youtube', 'mine'].map(tag)
  const { tags, added, offered } = newTagsFor(installed, shipped, null)
  assert.deepStrictEqual(tags.map((x) => x.id), ['sleep', 'anime', 'series', 'movie', 'youtube', 'mine'])
  assert.deepStrictEqual(added, ['series', 'movie'])
  assert.ok(offered.includes('series') && offered.includes('game'))
})

t('a starter tag deleted long ago does not come back', () => {
  const installed = ['sleep', 'anime', 'youtube'].map(tag) // no game: deleted
  const { tags } = newTagsFor(installed, shipped, null)
  assert.ok(!tags.some((x) => x.id === 'game'))
})

t('a new tag offered once and then deleted stays deleted', () => {
  const first = newTagsFor(['sleep', 'anime'].map(tag), shipped, null)
  const deleted = first.tags.filter((x) => x.id !== 'movie')
  const again = newTagsFor(deleted, shipped, first.offered)
  assert.deepStrictEqual(again.added, [])
  assert.ok(!again.tags.some((x) => x.id === 'movie'))
})

t('a list that already has them is left exactly as it is', () => {
  const installed = ['movie', 'sleep', 'series', 'anime'].map(tag)
  const { tags, added } = newTagsFor(installed, shipped, null)
  assert.deepStrictEqual(added, [])
  assert.deepStrictEqual(tags, installed)
})

t('icons are added only where that tag has no picture yet', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carry-'))
  const from = path.join(dir, 'ship')
  const to = path.join(dir, 'mine')
  const put = (file) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'x') }
  put(path.join(from, 'Sleep.png'))
  put(path.join(from, 'Movie.png'))
  put(path.join(from, 'README.md'))
  put(path.join(from, 'Set', 'Series.png'))
  put(path.join(from, 'Set', 'Anime.png'))
  put(path.join(from, 'Set', '.replaced', 'Old.png'))
  put(path.join(to, 'sleep.gif')) // their own, in another format
  put(path.join(to, 'Set', 'anime.svg'))
  const got = iconsToAdd(from, to).map((x) => path.relative(to, x.to).replace(/\\/g, '/')).sort()
  assert.deepStrictEqual(got, ['Movie.png', 'Set/Series.png'])
  fs.rmSync(dir, { recursive: true, force: true })
})

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
