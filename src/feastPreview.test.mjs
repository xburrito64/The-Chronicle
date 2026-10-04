import assert from 'node:assert/strict'
import { PREVIEW_CHOICES, previewFestival } from './feastPreview.js'
import { feastOf } from './scenes/hoursFeasts.js'

let passed = 0, failed = 0
const t = (name, fn) => {
  try { fn(); passed++; console.log('  ok   ' + name) }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message) }
}

t('every feast that can be tried stands for a real feast, with a name', () => {
  for (const { value } of PREVIEW_CHOICES) {
    const f = previewFestival(value)
    assert.ok(f && f.name, `${value} makes no festival`)
    assert.ok(feastOf(f), `${value} has no feast in Black Hours`)
    assert.equal(f.preview, true, `${value} is not marked as tried`)
  }
})

t('the Sundays of Advent are tried one by one', () => {
  assert.deepEqual([1, 2, 3, 4].map((n) => previewFestival(`advent-${n}`).nth), [1, 2, 3, 4])
  assert.equal(previewFestival('advent-3').name, 'Third Advent')
})

t('a tried birthday is someone else\'s, or your own, with an age', () => {
  assert.equal(previewFestival('birthday').self, false)
  assert.equal(previewFestival('birthday-self').self, true)
  assert.equal(previewFestival('birthday').age, 30)
})

t('nothing tried is no festival', () => {
  assert.equal(previewFestival(''), null)
  assert.equal(previewFestival(null), null)
  assert.equal(previewFestival('not-a-feast'), null)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
