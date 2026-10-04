// Festivals: which days are more than a date, and the frost on Christmas Eve.

import assert from 'node:assert/strict'
import {
  festivalOf, festivalsOn, frostFerns, cobweb, easterSunday, blossomBranch, meadow, adventSundays, firBough, solstice, fireworksEvery, shroveTuesday, anniversaryOn,
} from './festivals.js'

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

t('Christmas Eve is the 24th of December, every year', () => {
  for (const year of [2025, 2026, 2031]) {
    assert.equal(festivalOf(`${year}-12-24`)?.id, 'christmas-eve')
    assert.equal(festivalOf(`${year}-12-24`)?.name, 'Christmas Eve')
  }
})

t('Halloween is the 31st of October, every year', () => {
  for (const year of [2025, 2026, 2030]) {
    assert.equal(festivalOf(`${year}-10-31`)?.id, 'halloween')
    assert.equal(festivalOf(`${year}-10-31`)?.name, 'Halloween')
  }
  assert.equal(festivalOf('2026-10-30'), null)
  assert.equal(festivalOf('2026-11-01'), null)
})

t('the days either side of it are ordinary', () => {
  assert.equal(festivalOf('2026-12-23'), null)
  assert.equal(festivalOf('2026-12-25'), null)
  assert.equal(festivalOf('2026-11-24'), null)
  assert.equal(festivalOf('2026-09-29'), null)
})

t('anything that is not a date is no festival', () => {
  assert.equal(festivalOf(undefined), null)
  assert.equal(festivalOf(''), null)
  assert.equal(festivalOf('24.12.2026'), null)
  assert.equal(festivalOf('2026-12-24T00:00'), null)
})

t('the frost is the same pane every time', () => {
  const a = frostFerns(240, 160, 7)
  const b = frostFerns(240, 160, 7)
  assert.deepEqual(a, b)
  assert.notDeepEqual(frostFerns(240, 160, 8).lines.slice(0, 5), a.lines.slice(0, 5))
})

t('the frost grows from its corner, and stays mostly near it', () => {
  const { lines, rime, glints } = frostFerns(600, 400, 24)
  assert.ok(lines.length > 200, `only ${lines.length} strokes`)
  assert.ok(glints.length > 0)
  const close = rime.filter((d) => Math.hypot(d.x, d.y) < 120).length
  assert.ok(close > rime.length / 3, 'the rime gathers in the corner')
  const near = lines.filter((l) => Math.hypot(l.x0, l.y0) < Math.hypot(600, 400) * 0.5).length
  assert.ok(near / lines.length > 0.7, 'most of it by the corner')
  for (const l of lines) {
    assert.ok(l.alpha > 0 && l.alpha <= 0.5)
    assert.ok(l.width > 0)
  }
})

t('a cobweb is the same web every time, spun inside its corner', () => {
  const a = cobweb(240, 120, 5)
  assert.deepEqual(a, cobweb(240, 120, 5))
  assert.ok(a.lines.length >= 5 && a.silk.length > 20)
  for (const l of a.lines) {
    assert.equal(l.x0, 0)
    assert.equal(l.y0, 0)
    assert.ok(l.x1 <= 240.001 && l.y1 <= 120.001 && l.x1 >= 0 && l.y1 >= 0, 'every spoke ends on the pane')
  }
  for (const s of a.silk) {
    // Each strand sags toward the corner, never away from it.
    assert.ok(Math.hypot(s.cx, s.cy) < Math.hypot((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2))
  }
})

t('Easter Sunday moves with the moon, and lands where the calendars say', () => {
  const known = {
    2019: '04-21', 2024: '03-31', 2025: '04-20', 2026: '04-05', 2027: '03-28',
    2028: '04-16', 2030: '04-21', 2038: '04-25', 2285: '03-22',
  }
  for (const [year, day] of Object.entries(known)) {
    const { month, day: d } = easterSunday(Number(year))
    assert.equal(`${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`, day, year)
    assert.equal(festivalOf(`${year}-${day}`)?.id, 'easter', year)
  }
  // The day before and after it are ordinary, and so is last year's date.
  assert.equal(festivalOf('2027-03-27'), null)
  assert.equal(festivalOf('2027-03-29'), null)
  assert.equal(festivalOf('2027-04-05'), null)
})

t('the blossom branch and the flower field stay on their panes', () => {
  const b = blossomBranch(360, 120)
  assert.deepEqual(b, blossomBranch(360, 120))
  assert.ok(b.wood.length > 10 && b.blossoms.length > 5)
  for (const f of b.blossoms) assert.ok(f.tone >= 0 && f.tone < 4)
  const m = meadow(1200, 96)
  assert.ok(m.blades.length > 200 && m.flowers.length > 20)
  for (const f of m.flowers) {
    assert.ok(f.height > 0 && f.height < 96, 'no flower taller than the field')
    assert.ok(f.kind >= 0 && f.kind < 4)
  }
})

t('the four Sundays of Advent count back from the last Sunday before Christmas', () => {
  const known = {
    2025: ['11-30', '12-07', '12-14', '12-21'],
    2026: ['11-29', '12-06', '12-13', '12-20'],
    2027: ['11-28', '12-05', '12-12', '12-19'],
    2029: ['12-02', '12-09', '12-16', '12-23'],
  }
  const names = ['First Advent', 'Second Advent', 'Third Advent', 'Fourth Advent']
  for (const [year, days] of Object.entries(known)) {
    days.forEach((day, i) => {
      const f = festivalOf(`${year}-${day}`)
      assert.equal(f?.id, 'advent', `${year}-${day}`)
      assert.equal(f?.nth, i + 1)
      assert.equal(f?.name, names[i])
    })
  }
  // The Saturdays and Mondays round them are ordinary.
  assert.equal(festivalOf('2026-12-05'), null)
  assert.equal(festivalOf('2026-12-07'), null)
  assert.equal(festivalOf('2026-11-22'), null)
})

t('when Christmas Eve is the fourth Sunday of Advent, it is Christmas Eve', () => {
  // 2023 and 2028: the 24th is a Sunday.
  for (const year of [2023, 2028]) {
    assert.deepEqual(adventSundays(year)[3], { month: 12, day: 24 })
    assert.equal(festivalOf(`${year}-12-24`)?.id, 'christmas-eve')
    assert.equal(festivalOf(`${year}-12-17`)?.name, 'Third Advent')
  }
})

t('the fir bough hangs its star inside the pane', () => {
  const f = firBough(360, 120)
  assert.deepEqual(f, firBough(360, 120))
  assert.ok(f.needles.length > f.wood.length, 'more needles than wood')
  assert.ok(f.berries.length > 0)
  for (const s of f.stars) assert.ok(s.x > 0 && s.x < 360 && s.y > 0 && s.y < 120)
})

t('the solstices land within minutes of the published moments', () => {
  // UTC, from the published tables.
  const known = [
    [2024, 'june', '2024-06-20T20:51'], [2024, 'december', '2024-12-21T09:20'],
    [2025, 'june', '2025-06-21T02:42'], [2025, 'december', '2025-12-21T15:03'],
    [2026, 'june', '2026-06-21T08:24'], [2026, 'december', '2026-12-21T20:50'],
    [2027, 'june', '2027-06-21T14:11'], [2027, 'december', '2027-12-22T02:42'],
  ]
  for (const [year, which, at] of known) {
    const off = Math.abs(solstice(year, which) - Date.parse(`${at}Z`)) / 60000
    assert.ok(off < 5, `${year} ${which} is ${off.toFixed(1)} minutes out`)
  }
})

t('the Longest Night and Midsummer fall on the solstice, on this machine\'s clock', () => {
  for (const year of [2025, 2026, 2027]) {
    for (const [which, id] of [['june', 'midsummer'], ['december', 'longest-night']]) {
      const d = new Date(solstice(year, which))
      const date = `${year}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const on = festivalsOn(date).map((f) => f.id)
      assert.ok(on.includes(id), `${date} should be ${id}, is ${on}`)
    }
  }
})

t('the nights of falling stars', () => {
  assert.equal(festivalOf('2027-08-12')?.id, 'perseids')
  assert.equal(festivalOf('2026-12-14')?.id, 'geminids')
  assert.equal(festivalOf('2027-08-13'), null)
})

t('two festivals on one day: the first leads, the other comes along', () => {
  // 21 December 2025 was the fourth Sunday of Advent and the solstice.
  const both = festivalOf('2025-12-21')
  assert.equal(both.id, 'advent')
  assert.equal(both.nth, 4)
  assert.deepEqual(both.also.map((f) => f.id), ['longest-night'])
  // 6 December 2026 is the second Sunday of Advent and St. Nicholas.
  assert.deepEqual(festivalsOn('2026-12-06').map((f) => f.id), ['advent', 'st-nicholas'])
  // A day with only one has nothing along with it.
  assert.equal(festivalOf('2026-10-31').also, undefined)
})

t('the turn of the year: New Year\'s Eve, then New Year\'s Day', () => {
  assert.equal(festivalOf('2026-12-31')?.id, 'new-years-eve')
  assert.equal(festivalOf('2027-01-01')?.id, 'new-year')
  assert.equal(festivalOf('2027-01-02'), null)
})

t('fireworks go up more and more often toward midnight, then die away', () => {
  const at = (h, m, s = 0) => new Date(2026, 11, 31, h, m, s)
  const eve = (h, m, s) => fireworksEvery('new-years-eve', at(h, m, s))
  const day = (h, m) => fireworksEvery('new-year', new Date(2027, 0, 1, h, m))
  assert.ok(eve(15, 0) > eve(20, 0), 'the afternoon is quieter than the evening')
  assert.ok(eve(20, 0) > eve(23, 0))
  assert.ok(eve(23, 0) > eve(23, 55))
  assert.ok(eve(23, 59, 50) > 0.4 && eve(23, 59, 50) < 0.7, 'a flurry at the end, but never none')
  assert.ok(day(0, 1) < eve(23, 59, 50), 'a barrage at midnight')
  assert.ok(day(0, 30) < day(1, 30))
  assert.equal(day(3, 0), null, 'and quiet by the small hours')
  assert.equal(fireworksEvery('halloween', at(23, 0)), null)
})

t('the folk days: St. Nicholas, Valentine\'s Day, and Carnival moving with Easter', () => {
  assert.equal(festivalOf('2027-12-06')?.id, 'st-nicholas')
  assert.equal(festivalOf('2027-02-14')?.id, 'valentines')
  // Shrove Tuesday, 47 days before Easter Sunday.
  const known = { 2024: '02-13', 2025: '03-04', 2026: '02-17', 2027: '02-09', 2028: '02-29' }
  for (const [year, day] of Object.entries(known)) {
    const { month, day: d } = shroveTuesday(Number(year))
    assert.equal(`${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`, day, year)
    assert.equal(festivalOf(`${year}-${day}`)?.id, 'carnival', year)
  }
})

t('the anniversary of the first day logged, each year after it', () => {
  const first = '2026-07-22'
  assert.equal(anniversaryOn('2026-07-22', first), null, 'not on the first day itself')
  assert.equal(anniversaryOn('2027-07-21', first), null)
  const one = anniversaryOn('2027-07-22', first)
  assert.equal(one.id, 'anniversary')
  assert.equal(one.name, 'One year journeyed')
  assert.equal(one.nth, 1)
  assert.equal(one.since, first)
  assert.equal(anniversaryOn('2029-07-22', first).name, 'Three years journeyed')
  assert.equal(anniversaryOn('2038-07-22', first).name, '12 years journeyed')
  // Nothing logged yet, or nothing known: no anniversary.
  assert.equal(anniversaryOn('2027-07-22', null), null)
  assert.equal(festivalOf('2027-07-22'), null)
  assert.equal(festivalOf('2027-07-22', first)?.id, 'anniversary')
})

t('a journey begun on the 29th of February is kept on the 28th in other years', () => {
  const first = '2028-02-29'
  assert.equal(anniversaryOn('2029-02-28', first)?.nth, 1)
  assert.equal(anniversaryOn('2029-03-01', first), null)
  assert.equal(anniversaryOn('2032-02-29', first)?.nth, 4)
  assert.equal(anniversaryOn('2032-02-28', first), null)
})

t('an anniversary on a festival comes along with it', () => {
  // Someone who started on Halloween.
  const f = festivalOf('2027-10-31', '2026-10-31')
  assert.equal(f.id, 'halloween')
  assert.deepEqual(f.also.map((x) => x.id), ['anniversary'])
})

t('a birthday on a festival leads it: it is someone\'s own day', () => {
  // Made-up people.
  const people = [{ id: 'b-a', name: 'Ada', day: 31, month: 10, year: 2001 }, { id: 'b-me', name: 'Me', day: 1, month: 5, self: true }]
  const f = festivalOf('2027-10-31', null, people)
  assert.equal(f.id, 'birthday')
  assert.equal(f.name, "Ada's 26th birthday")
  assert.equal(f.age, 26)
  assert.deepEqual(f.also.map((x) => x.id), ['halloween'])
  assert.equal(festivalOf('2027-05-01', null, people).name, 'Your birthday')
  assert.equal(festivalOf('2027-05-02', null, people), null)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
