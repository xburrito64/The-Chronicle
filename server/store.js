import fs from 'node:fs/promises'
import path from 'node:path'
import { readBlock, writeBlock, formatEntries } from './fence.js'

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]|24):([0-5]\d)$/
// A cover is the name of a file in the covers folder and nothing else. No
// folders, no walking up out of it, no leading dot — whatever ends up in a
// note eventually gets joined onto a path, so it is checked on the way in
// rather than trusted on the way out.
const COVER_RE = /^[\w][\w .-]{0,119}\.(jpe?g|png|webp|gif)$/i

// One evening of anime is a handful of episodes, not a season — and a number
// is an episode, so it is a whole one and a small one. The bounds are here
// rather than trusted from the app because whatever is in a note gets read
// back and drawn.
const MAX_EPISODES = 60
const MAX_EPISODE_NO = 9999
// A series' season is a small whole number. Nothing has run to three digits.
const MAX_SEASON = 999

const toMinutes = (t) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/** Kept level with MINUTES_PER_SLOT in src/time.js. */
export const MINUTES_PER_MARK = 10

/**
 * Throws on anything we refuse to write to disk.
 *
 * `grid` is off when reading. Days written when a mark was fifteen minutes
 * hold times that don't divide by ten, and they are still perfectly good
 * records — the app snaps them as it loads them. Refusing to read them would
 * declare a day broken over a change we made, which is not the same thing as
 * a day someone broke by hand.
 */
export function validateEntries(entries, { grid = true } = {}) {
  if (!Array.isArray(entries)) throw new Error('entries must be an array')

  const checked = entries.map((e, i) => {
    const where = `entry ${i}`
    if (!e || typeof e !== 'object') throw new Error(`${where}: not an object`)
    if (typeof e.tag !== 'string' || !e.tag) throw new Error(`${where}: missing tag`)
    if (!TIME_RE.test(e.start ?? '')) throw new Error(`${where}: bad start "${e.start}"`)
    if (!TIME_RE.test(e.end ?? '')) throw new Error(`${where}: bad end "${e.end}"`)

    const start = toMinutes(e.start)
    const end = toMinutes(e.end)
    if (grid && (start % MINUTES_PER_MARK || end % MINUTES_PER_MARK)) {
      throw new Error(`${where}: times must sit on ${MINUTES_PER_MARK}-minute marks`)
    }
    if (end <= start) throw new Error(`${where}: end must come after start`)
    if (e.note != null && typeof e.note !== 'string') throw new Error(`${where}: note must be text`)
    if (e.game != null && typeof e.game !== 'string') throw new Error(`${where}: game must be text`)
    if (e.show != null && typeof e.show !== 'string') throw new Error(`${where}: show must be text`)
    if (e.film != null && typeof e.film !== 'string') throw new Error(`${where}: film must be text`)
    if (e.season != null && (!Number.isInteger(e.season) || e.season < 1 || e.season > MAX_SEASON)) {
      throw new Error(`${where}: bad season "${e.season}"`)
    }
    if (e.cover && !COVER_RE.test(e.cover)) throw new Error(`${where}: bad cover "${e.cover}"`)

    // Which episodes, in order and each of them once. Sorted here rather than
    // wherever they were picked, so a note reads 3, 4, 5 however they were
    // clicked — and so two blocks holding the same episodes hold them the
    // same way round.
    let episodes
    if (e.episodes != null) {
      if (!Array.isArray(e.episodes)) throw new Error(`${where}: episodes must be a list`)
      if (e.episodes.length > MAX_EPISODES) throw new Error(`${where}: too many episodes`)
      for (const n of e.episodes) {
        if (!Number.isInteger(n) || n < 1 || n > MAX_EPISODE_NO) {
          throw new Error(`${where}: bad episode "${n}"`)
        }
      }
      episodes = [...new Set(e.episodes)].sort((a, b) => a - b)
    }

    // Rebuild rather than pass through, so stray keys never reach the note.
    const clean = { tag: e.tag, start: e.start, end: e.end }
    if (e.note) clean.note = e.note
    // What was being played, written out in full so the note still says it
    // without this app — and the file its picture was saved as, which is the
    // only thing here that means nothing on its own.
    if (e.game) clean.game = e.game
    // The same for what was watched, and which of it. The episodes are the
    // one part of this that is a number rather than a name, and they still
    // read plainly in the note: "show", then 3, 4, 5.
    if (e.show) clean.show = e.show
    // A series says which season, since its episodes are numbered within one:
    // "South Park", season 27, episodes 3, 4. Only beside a show — a season
    // of nothing in particular would be a number with no meaning.
    if (e.show && e.season != null) clean.season = e.season
    if (e.show && episodes?.length) clean.episodes = episodes
    // A film is one sitting, so it is only ever a name.
    if (e.film) clean.film = e.film
    if ((e.game || e.show || e.film) && e.cover) clean.cover = e.cover
    return { clean, start, end }
  })

  // Overlaps are allowed: two things really can happen at once, and the app
  // draws them stacked. Only the shape of each entry is enforced here.
  //
  // The order is left exactly as given. It is not decoration — it decides
  // which of two overlapping blocks is drawn above the other, so sorting
  // here would quietly undo that every time a day was saved.
  return checked.map((c) => c.clean)
}

export function createStore(dailyDir) {
  const fileFor = (date) => {
    if (!DATE_RE.test(date)) throw new Error(`bad date "${date}"`)
    return path.join(dailyDir, `${date}.md`)
  }

  async function readRaw(date) {
    try {
      return await fs.readFile(fileFor(date), 'utf8')
    } catch (err) {
      if (err.code === 'ENOENT') return null
      throw err
    }
  }

  return {
    fileFor,

    /**
     * { entries, exists, hasBlock, malformed, raw }
     * `malformed` means the fence holds something we couldn't parse — the
     * caller must refuse to overwrite it rather than discard hand edits.
     */
    async readDay(date) {
      const text = await readRaw(date)
      if (text === null) return { entries: [], exists: false, hasBlock: false, malformed: false }

      const body = readBlock(text)
      if (body === null) return { entries: [], exists: true, hasBlock: false, malformed: false }

      const trimmed = body.trim()
      if (trimmed === '') return { entries: [], exists: true, hasBlock: true, malformed: false }

      try {
        const parsed = JSON.parse(trimmed)
        return { entries: validateEntries(parsed, { grid: false }), exists: true, hasBlock: true, malformed: false }
      } catch (err) {
        return { entries: [], exists: true, hasBlock: true, malformed: true, raw: trimmed, reason: err.message }
      }
    },

    async writeDay(date, entries) {
      const clean = validateEntries(entries)
      const file = fileFor(date)

      // The notes folder has to be there already. A fresh install points at
      // a placeholder until a folder is picked in the settings, and saving
      // into it would quietly make that folder up on someone's drive and put
      // their days somewhere they never chose.
      const folder = await fs.stat(dailyDir).catch(() => null)
      if (!folder?.isDirectory()) {
        throw Object.assign(new Error('there is no notes folder yet — pick the folder your daily notes are in under Settings → Setup'), { status: 409, noVault: true })
      }

      const existing = await readRaw(date)

      // Never discard a block we failed to understand.
      if (existing !== null) {
        const body = readBlock(existing)
        if (body !== null && body.trim() !== '') {
          try { JSON.parse(body.trim()) } catch {
            throw Object.assign(new Error('the daily-log block in this note is not valid JSON; fix it in Obsidian first'), { status: 409 })
          }
        }
      }

      const next = writeBlock(existing ?? '', formatEntries(clean))
      if (next === existing) return { entries: clean, unchanged: true }

      // Write beside the target then swap, so a crash can't truncate the note.
      const tmp = `${file}.tmp-${process.pid}`
      await fs.writeFile(tmp, next, 'utf8')
      await fs.rename(tmp, file)
      return { entries: clean, unchanged: false }
    },

    /** Dates that already have a note file, for the review view. */
    /**
     * The first day anything was logged: the earliest note whose block
     * holds at least one entry. Notes from before the app (no block, an
     * empty one) and blocks that cannot be read are passed over. Only reads,
     * and only as far as it has to; null if nothing has been logged yet.
     */
    async firstLogged() {
      for (const date of await this.listDates()) {
        const day = await this.readDay(date)
        if (!day.malformed && day.entries.length > 0) return date
      }
      return null
    },

    async listDates() {
      try {
        const names = await fs.readdir(dailyDir)
        return names
          .filter((n) => n.endsWith('.md') && DATE_RE.test(n.slice(0, -3)))
          .map((n) => n.slice(0, -3))
          .sort()
      } catch (err) {
        if (err.code === 'ENOENT') return []
        throw err
      }
    },
  }
}
