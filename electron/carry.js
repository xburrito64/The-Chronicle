// What a new version brings to an install that already has its own settings:
// tags it has never been offered, and icon pictures for tags that have none.
//
// The settings folder is copied once, on first run, and then belongs to the
// person using it — so without this, a tag or an icon added in a later
// version would never reach anybody who installed an earlier one. Both only
// ever add. Nothing already there is changed.

import fs from 'node:fs'
import path from 'node:path'
import { ICON_EXTENSIONS } from '../server/icons.js'

/**
 * Tags added to the app after its first releases. An install that has never
 * kept track of which tags it was offered is offered these, and assumed to
 * have seen every other one already: a starter tag someone deleted long ago
 * must not come back just because the tracking is new. Add to this list when
 * a new main tag is added to tags.json.
 */
export const NEWER_TAGS = ['series', 'movie']

/**
 * The installed tag list with any shipped tag it has never been offered, and
 * the new list of which have been.
 *
 * `offered` is the ids offered before, or null if that was never kept. A new
 * tag goes in after the tag it follows in the shipped list, where that one
 * is there, so Series lands beside Anime rather than at the end.
 *
 * Returns { tags, offered, added }.
 */
export function newTagsFor(installed, shipped, offered) {
  const have = new Set(installed.map((tag) => tag.id))
  const seen = new Set(offered ?? [
    ...have,
    ...shipped.map((tag) => tag.id).filter((id) => !NEWER_TAGS.includes(id)),
  ])
  const tags = [...installed]
  const added = []
  shipped.forEach((tag, i) => {
    if (have.has(tag.id) || seen.has(tag.id)) return
    // After the nearest shipped tag before it that the list has.
    let at = tags.length
    for (let j = i - 1; j >= 0; j--) {
      const where = tags.findIndex((t) => t.id === shipped[j].id)
      if (where >= 0) { at = where + 1; break }
    }
    tags.splice(at, 0, tag)
    added.push(tag.id)
  })
  return {
    tags,
    offered: [...new Set([...seen, ...shipped.map((tag) => tag.id)])],
    added,
  }
}

const isPicture = (name) => ICON_EXTENSIONS.includes(path.extname(name).toLowerCase())
const baseOf = (name) => path.basename(name, path.extname(name)).toLowerCase()

/**
 * Which shipped icon pictures to copy into the settings folder: every one
 * whose tag has no picture of any kind in the same place there — loose, or
 * in the same icon set. A picture of a tag already there, whatever its format,
 * means somebody already has one for it, and it stays theirs.
 *
 * Returns [{ from, to }].
 */
export function iconsToAdd(shippedDir, targetDir) {
  const out = []
  const walk = (from, to, depth) => {
    const there = fs.existsSync(to)
      ? new Set(fs.readdirSync(to).filter(isPicture).map(baseOf))
      : new Set()
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      if (entry.isDirectory()) {
        // A set is a folder of pictures, one level down; never deeper.
        if (depth === 0) walk(path.join(from, entry.name), path.join(to, entry.name), 1)
        continue
      }
      if (!isPicture(entry.name) || there.has(baseOf(entry.name))) continue
      out.push({ from: path.join(from, entry.name), to: path.join(to, entry.name) })
    }
  }
  walk(shippedDir, targetDir, 0)
  return out
}
