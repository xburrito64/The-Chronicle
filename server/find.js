/**
 * Finding a thing again.
 *
 * The question this answers is "when did I do this" — every stretch of time in
 * the vault that has something to do with a word. It reads the whole vault
 * rather than the days currently on screen, because "all the times I watched
 * One Piece" is a different question from "the times on this screen", and a
 * count that changed as you scrolled would be a lie.
 *
 * The search is a plain case-insensitive substring, the way find in any other
 * window works. No fuzziness, no ranking: you typed the name of a thing, and
 * either a block says that thing or it doesn't.
 */

/**
 * Everything about a block a search may look at, as one lowercased string.
 *
 * The tag is in there twice on purpose — under the name you see on its chip
 * and under the id the vault writes down — so "Walking the dog" and
 * "walk-dog" both find the same afternoons. What was played, what was
 * watched, and whatever was written about it all count too: half of why a day
 * is worth finding again is the sentence attached to it.
 *
 * Episodes are the one thing left out. They are numbers, and a search for
 * "12" that turned up every twelfth episode of everything would bury the day
 * you were actually looking for.
 */
function haystack(entry, tagName) {
  return [tagName, entry.tag, entry.game, entry.show, entry.film, entry.note]
    .filter(Boolean)
    .join('\n')
    .toLowerCase()
}

/** What a block should be called in a list of results. */
const nameOf = (entry, tagName) => entry.game || entry.show || entry.film || tagName || entry.tag

/**
 * Every block in `days` that answers to `query`, oldest first.
 *
 * `days` is `[{ date, entries }]` straight from the store; `tags` is the tag
 * list, only so a search can be for what a tag is called rather than for what
 * it is called in the file.
 *
 * A day that could not be parsed contributes nothing. It has no blocks to
 * offer — and a broken note is already reported where it can be fixed.
 *
 * Ordered by when it happened, which is also the order the days are drawn in,
 * so stepping through the results walks down the screen rather than jumping
 * about it.
 */
export function findIn(days, query, tags = []) {
  const needle = query.trim().toLowerCase()
  if (needle === '') return []

  const named = new Map(tags.map((tag) => [tag.id, tag.name]))
  const hits = []

  for (const day of days) {
    if (day.malformed) continue
    for (const entry of day.entries ?? []) {
      const tagName = named.get(entry.tag) ?? ''
      if (!haystack(entry, tagName).includes(needle)) continue
      hits.push({
        date: day.date,
        start: entry.start,
        end: entry.end,
        tag: entry.tag,
        game: entry.game ?? '',
        show: entry.show ?? '',
        film: entry.film ?? '',
        note: entry.note ?? '',
        what: nameOf(entry, tagName),
      })
    }
  }

  return hits.sort((a, b) => (
    a.date < b.date ? -1 : a.date > b.date ? 1
      : a.start < b.start ? -1 : a.start > b.start ? 1 : 0
  ))
}
