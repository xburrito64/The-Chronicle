// Changing the settings file from inside the app: where the vault is, and the
// keys for the game lookups.
//
// That file holds a password to someone's AniList account and the address of
// their diary, so two rules. A key goes in and is never sent back out — the
// app is only ever told whether one is there. And a file that cannot be read
// is never written: writing "what we could read" plus one new line over a
// file we could not read would be writing one line over everything.

import fs from 'node:fs'
import path from 'node:path'
import { readJson } from './config.js'
import { authFor } from './tmdb.js'

const refused = (message) => Object.assign(new Error(message), { status: 400 })

/**
 * Change some lines of the settings file and leave every other line as it was.
 *
 * Refuses outright if the file is there but cannot be read, rather than
 * starting again from nothing. Written beside and swapped over, so a crash
 * half way leaves the old file, never half of a new one.
 */
export function writeSettings(file, change) {
  if (!file) throw refused('there is no settings file to write to')
  let current = {}
  if (fs.existsSync(file)) {
    try {
      current = readJson(file)
    } catch (err) {
      throw refused(`the settings file could not be read, so it was left alone: ${err.message}`)
    }
  }
  const next = { ...current, ...change }
  for (const [key, value] of Object.entries(change)) if (value === undefined) delete next[key]
  const tmp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  fs.renameSync(tmp, file)
  return next
}

/**
 * A pasted key, tidied — or a refusal that says what is wrong with it.
 * Keys for both services are letters and digits; anything else pasted along
 * with one, a space or a line break, is what copying from a web page adds.
 */
export function cleanKey(raw) {
  const key = String(raw ?? '').trim()
  if (key === '') return ''
  if (/\s/.test(key)) throw refused('that key has a space in it — copy just the key, nothing around it')
  // Dots too: TMDB's long "read access token" is three parts joined by them.
  if (!/^[A-Za-z0-9_.-]{8,512}$/.test(key)) throw refused('that does not look like a key — it should be letters and numbers only')
  return key
}

/**
 * Whether a folder can be the vault's daily notes, and how many notes it has.
 *
 * It has to exist and be a folder. It does not have to have notes in it: a
 * new vault is empty, and the first day logged is the first note.
 */
export function checkVault(raw) {
  const dir = String(raw ?? '').trim()
  if (!dir) throw refused('which folder?')
  if (!path.isAbsolute(dir)) throw refused('that needs to be the whole path, starting from the drive')
  let stat
  try {
    stat = fs.statSync(dir)
  } catch {
    throw refused('there is no folder there')
  }
  if (!stat.isDirectory()) throw refused('that is a file, not a folder')
  const notes = fs.readdirSync(dir).filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name)).length
  // Forward slashes, the way the settings file has always asked for them.
  return { dir: dir.replace(/\\/g, '/'), notes }
}

// Where each key is checked, with the key in the one place each service
// wants it. Only ever asked when a key is saved — pressing Save is the press.
const CHECKS = {
  rawgKey: (key) => fetch(
    `https://api.rawg.io/api/games?${new URLSearchParams({ key, page_size: '1' })}`,
    { signal: AbortSignal.timeout(10_000) },
  ),
  steamGridKey: (key) => fetch(
    'https://www.steamgriddb.com/api/v2/search/autocomplete/minecraft',
    { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) },
  ),
  // Either of the two kinds TMDB hands out — see authFor.
  tmdbKey: (key) => {
    const auth = authFor(key)
    return fetch(
      `https://api.themoviedb.org/3/configuration?${new URLSearchParams(auth.params)}`,
      { headers: auth.headers, signal: AbortSignal.timeout(10_000) },
    )
  },
}
export const KEY_NAMES = Object.keys(CHECKS)

/**
 * Whether a key works, asked of the service it is for. Answers with nothing
 * when it does and with what went wrong when it doesn't, in words — "turned
 * down" is a wrong key, anything else is the service or the connection.
 */
export async function tryKey(which, key) {
  let res
  try {
    res = await CHECKS[which](key)
  } catch {
    return 'could not reach the site to check it — try again in a moment'
  }
  if (res.status === 401 || res.status === 403) return 'the site turned that key down'
  if (!res.ok) return `the site answered ${res.status} — try again in a moment`
  return ''
}
