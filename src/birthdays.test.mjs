// Birthdays: reading them as they are written, which fall on a day, ages.

import assert from 'node:assert/strict'
import { parseBirthday, formatBirthday, birthdaysOn, nextBirthday, isBirthDate, ordinal } from './birthdays.js'

let passed = 0
let failed = 0
const t = (name, fn) => {
  try {
    fn()
    passed++
    console.log(`  ok   ${name}`)
  } catch (err) {
    failed++
    console.log(`  FAIL ${name}\n       ${err.message}`)
  }
}

t('a birthday is read the way it is written', () => {
  assert.deepEqual(parseBirthday('03.06.2001'), { day: 3, month: 6, year: 2001 })
  assert.deepEqual(parseBirthday('3.6.2001'), { day: 3, month: 6, year: 2001 })
  assert.deepEqual(parseBirthday(' 09.10 '), { day: 9, month: 10, year: null })
  assert.deepEqual(parseBirthday('21.09.'), { day: 21, month: 9, year: null })
  assert.deepEqual(parseBirthday('17/11'), { day: 17, month: 11, year: null })
  assert.deepEqual(parseBirthday('15-04-1968'), { day: 15, month: 4, year: 1968 })
})

t('anything that is not a birthday is refused', () => {
  for (const bad of ['', '32.01', '00.05', '15.13', '31.04', '30.02', '29.02.2003', '1.1.1800', 'someday', '12', '2001-06-03']) {
    assert.equal(parseBirthday(bad), null, bad)
  }
  assert.deepEqual(parseBirthday('29.02'), { day: 29, month: 2, year: null })
  assert.deepEqual(parseBirthday('29.02.2004'), { day: 29, month: 2, year: 2004 })
  assert.equal(isBirthDate(29, 2, 2004), true)
  assert.equal(isBirthDate(29, 2, 2005), false)
})

t('and written back the same way', () => {
  assert.equal(formatBirthday({ day: 3, month: 6, year: 2001 }), '03.06.2001')
  assert.equal(formatBirthday({ day: 9, month: 10, year: null }), '09.10.')
  assert.deepEqual(parseBirthday(formatBirthday({ day: 9, month: 10, year: null })), { day: 9, month: 10, year: null })
})

// Made-up people: the real list lives only on the machine it belongs to.
const list = [
  { id: 'a', name: 'Ada', day: 5, month: 3, year: 2001 },
  { id: 'b', name: 'Me', day: 12, month: 6, year: 2003, self: true },
  { id: 'c', name: 'Nan', day: 14, month: 10, year: null },
  { id: 'd', name: 'Twin', day: 12, month: 6, year: 2010 },
  { id: 'e', name: 'Leap', day: 29, month: 2, year: 2004 },
]

t('the birthdays on a day, with the age turned', () => {
  const [r] = birthdaysOn('2027-03-05', list)
  assert.equal(r.id, 'birthday')
  assert.equal(r.name, "Ada's 26th birthday", 'which birthday, when the year is known')
  assert.equal(r.person, 'Ada')
  assert.equal(r.age, 26)
  assert.equal(r.self, false)
  const [nan] = birthdaysOn('2026-10-14', list)
  assert.equal(nan.age, null, 'no year, no age')
  assert.equal(nan.name, "Nan's birthday", 'and just her birthday')
  assert.deepEqual(birthdaysOn('2026-10-15', list), [])
})

t('an age is counted the way it is said', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 52, 101, 111, 112].map(ordinal),
    ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '52nd', '101st', '111th', '112th'])
})

t('your own comes first, and is yours', () => {
  const both = birthdaysOn('2026-06-12', list)
  assert.deepEqual(both.map((b) => b.person), ['Me', 'Twin'])
  assert.equal(both[0].name, 'Your 23rd birthday')
  assert.equal(both[0].age, 23)
  assert.equal(both[0].eyebrow, 'Your day')
})

t('not before someone was born, and not on the day itself', () => {
  assert.deepEqual(birthdaysOn('2003-06-12', list).map((b) => b.person), [], 'the day of birth is no birthday yet')
  assert.deepEqual(birthdaysOn('2002-06-12', list).map((b) => b.person), [])
  assert.deepEqual(birthdaysOn('2004-06-12', list).map((b) => b.person), ['Me'])
})

t('a birthday on the 29th of February is kept on the 28th in other years', () => {
  assert.equal(birthdaysOn('2027-02-28', list)[0]?.person, 'Leap')
  assert.deepEqual(birthdaysOn('2028-02-28', list), [])
  assert.equal(birthdaysOn('2028-02-29', list)[0]?.age, 24)
})

t('how long until each comes round again', () => {
  assert.deepEqual(nextBirthday(list[0], '2026-09-30'), { inDays: 156, turns: 26 })
  assert.deepEqual(nextBirthday(list[2], '2026-09-30'), { inDays: 14, turns: null })
  assert.deepEqual(nextBirthday(list[1], '2026-06-12'), { inDays: 0, turns: 23 })
  assert.deepEqual(nextBirthday(list[1], '2026-06-13'), { inDays: 364, turns: 24 })
})

t('nothing to go on, nothing found', () => {
  assert.deepEqual(birthdaysOn('2026-06-12', []), [])
  assert.deepEqual(birthdaysOn('2026-06-12', null), [])
  assert.deepEqual(birthdaysOn('not a date', list), [])
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
