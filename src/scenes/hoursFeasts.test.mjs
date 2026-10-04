import assert from 'node:assert'
import { FEASTS, feastOf, ordinalWord } from './hoursFeasts.js'
import { FESTIVALS, festivalOf } from './festivals.js'

let pass = 0, fail = 0
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name) }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message) }
}

t('every festival has a feast in Black Hours, and birthdays and the anniversary too', () => {
  for (const f of FESTIVALS) assert.ok(FEASTS[f.id], `no feast for ${f.id}`)
  assert.ok(FEASTS.birthday && FEASTS.anniversary)
})

t('every feast is whole: a name, a ground, a border, a sky and a line', () => {
  const blooms = ['flower', 'berry', 'rose', 'lily', 'star', 'bezant']
  const leaves = ['ivy', 'holly', 'laurel', 'thorn']
  const skies = ['snow', 'embers', 'bats', 'petals', 'coins', 'hearts', 'confetti', 'stars', 'tears']
  for (const id of Object.keys(FEASTS)) {
    const f = feastOf({ id, nth: 2, age: 30, person: 'Sam', self: false })
    assert.ok(f.latin && typeof f.latin === 'string', `${id}: latin`)
    assert.ok(Array.isArray(f.ground) && f.ground.length >= 1 && f.ground.length <= 4, `${id}: ground`)
    assert.ok(leaves.includes(f.border.leaf) && blooms.includes(f.border.bloom), `${id}: border`)
    assert.ok(skies.includes(f.sky), `${id}: sky`)
    assert.ok(f.line && typeof f.line === 'string', `${id}: line`)
  }
})

t('the Sundays of Advent are numbered as the calendar numbers them', () => {
  const sundays = [1, 2, 3, 4].map((nth) => feastOf({ id: 'advent', nth }).latin)
  assert.deepStrictEqual(sundays, [
    'Dominica I Adventus', 'Dominica II Adventus', 'Dominica III Adventus', 'Dominica IV Adventus',
  ])
})

t('the third Sunday of Advent, the one of rejoicing, is rose', () => {
  assert.equal(feastOf({ id: 'advent', nth: 3 }).ground[0], '#c9718a')
  assert.notEqual(feastOf({ id: 'advent', nth: 2 }).ground[0], '#c9718a')
})

t('a birthday says whose and how old, and your own says which year begins', () => {
  assert.equal(feastOf({ id: 'birthday', person: 'Sam', age: 30 }).line, 'Sam is 30 today')
  assert.equal(feastOf({ id: 'birthday', person: 'Sam', age: null }).line, "Sam's day of birth")
  assert.equal(feastOf({ id: 'birthday', self: true, age: 20 }).line, 'your twenty-first year begins')
  assert.equal(feastOf({ id: 'birthday', self: true, age: null }).line, 'the day of your birth')
})

t('years are counted in words', () => {
  assert.deepStrictEqual([1, 12, 20, 21, 30, 42, 99, 101].map(ordinalWord),
    ['first', 'twelfth', 'twentieth', 'twenty-first', 'thirtieth', 'forty-second', 'ninety-ninth', '101st'])
})

t('a real festival date comes through to its feast', () => {
  assert.equal(feastOf(festivalOf('2026-12-24')).latin, 'Vigilia Nativitatis')
  assert.equal(feastOf(festivalOf('2026-10-31')).sky, 'bats')
  assert.strictEqual(feastOf(festivalOf('2026-10-04')), null)
})

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
