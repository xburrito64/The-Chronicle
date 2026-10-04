import { useSyncExternalStore } from 'react'
import { FESTIVALS, festivalOf } from './scenes/festivals.js'
import { todayISO } from './time.js'

// Trying a feast day out: today pretends to be the one picked, in the list
// and on the page around it, so how a feast looks can be seen without
// waiting a year for it. Picked in the settings, held until the app closes —
// never saved, so it can't be left on by mistake and turn up tomorrow.

let choice = null
const listeners = new Set()

const ADVENT = ['First', 'Second', 'Third', 'Fourth']

/** What can be tried, in the order of the year, as { value, label }. */
export const PREVIEW_CHOICES = [
  { value: 'new-year', label: "New Year's Day" },
  { value: 'valentines', label: "Valentine's Day" },
  { value: 'carnival', label: 'Carnival' },
  { value: 'easter', label: 'Easter' },
  { value: 'midsummer', label: 'Midsummer' },
  { value: 'perseids', label: 'The Perseids' },
  { value: 'halloween', label: 'Halloween' },
  ...ADVENT.map((n, i) => ({ value: `advent-${i + 1}`, label: `${n} Advent` })),
  { value: 'st-nicholas', label: 'St. Nicholas' },
  { value: 'geminids', label: 'The Geminids' },
  { value: 'longest-night', label: 'The Longest Night' },
  { value: 'christmas-eve', label: 'Christmas Eve' },
  { value: 'new-years-eve', label: "New Year's Eve" },
  { value: 'birthday', label: "Someone's birthday" },
  { value: 'birthday-self', label: 'Your own birthday' },
  { value: 'anniversary', label: 'The anniversary of your first day' },
]

/** The festival a choice stands for, made up the way festivals.js makes them. */
export function previewFestival(value) {
  if (!value) return null
  const advent = value.match(/^advent-(\d)$/)
  if (advent) {
    const nth = Number(advent[1])
    return { id: 'advent', name: `${ADVENT[nth - 1]} Advent`, nth, preview: true }
  }
  if (value === 'birthday') {
    return { id: 'birthday', key: 'birthday-preview', name: "Ada's 30th birthday", person: 'Ada', self: false, age: 30, eyebrow: 'A birthday', preview: true }
  }
  if (value === 'birthday-self') {
    return { id: 'birthday', key: 'birthday-preview', name: 'Your 30th birthday', person: 'You', self: true, age: 30, eyebrow: 'Your day', preview: true }
  }
  if (value === 'anniversary') {
    return { id: 'anniversary', name: 'Two years journeyed', nth: 2, since: '2024-10-04', preview: true }
  }
  const festival = FESTIVALS.find((f) => f.id === value)
  return festival ? { id: festival.id, name: festival.name, preview: true } : null
}

export function setFeastPreview(value) {
  choice = value || null
  listeners.forEach((listen) => listen())
}

const subscribe = (listen) => {
  listeners.add(listen)
  return () => listeners.delete(listen)
}

/** The feast being tried, as its choice value, or null. */
export function useFeastPreview() {
  return useSyncExternalStore(subscribe, () => choice)
}

/** Today's festival: the one being tried, if any, or the real one. */
export function useTodaysFestival(firstDay, birthdays) {
  const tried = useFeastPreview()
  return tried ? previewFestival(tried) : festivalOf(todayISO(), firstDay, birthdays)
}
