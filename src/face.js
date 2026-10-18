import { createContext } from 'react'
import { coverUrl } from './api.js'

/**
 * Covers found after the fact, by what they belong to: `game:Valorant`,
 * `show:Frieren`. Handed down from the top of the app rather than through
 * every component on the way.
 *
 * A block keeps its cover in its own day's note — written the moment the game
 * was picked, and only if there was one to write. A game picked before its
 * art existed is blank there for good, and going back through a diary to
 * write a filename into every day that mentions it is not something this app
 * does. So the picture found later lives beside the covers, and a block with
 * none of its own borrows it from here.
 */
export const Covers = createContext(null)

/** The cover a block should be drawn with: its own, or one found since. */
export function coverFor(block, covers) {
  if (block?.cover) return block.cover
  if (block?.game) return covers?.get(`game:${block.game}`) ?? ''
  if (block?.show) return covers?.get(`show:${block.show}`) ?? ''
  if (block?.film) return covers?.get(`film:${block.film}`) ?? ''
  return ''
}

/**
 * A cover is upright, two by three — the shape a game's box has always been,
 * and the shape of every poster ever printed for a show. Steam's library
 * picture and AniList's cover are both exactly that, which is a coincidence
 * worth taking: one number, one rule, both kinds of picture.
 *
 * Not square, so it is given the width that shape wants rather than being
 * fitted into an icon's box, where it would sit as a narrow panel with empty
 * space either side of it.
 */
export const COVER_ASPECT = 2 / 3

/**
 * A block that says what it was, dressed as its own tag.
 *
 * Everything that draws a block — its label on the bar, its chip in the note,
 * its row in the ledger — takes a tag and asks it for a name and a picture. A
 * named game or a named show has both, better ones, so this hands them over
 * in the shape those already understand rather than teaching each of them
 * about games and anime separately.
 *
 * A block with nothing attached is just a Game block or an Anime block, and
 * gets the tag back untouched.
 */
export function blockFace(tag, block, covers) {
  const name = block?.game || block?.show || block?.film
  if (!tag || !name) return tag
  const cover = coverFor(block, covers)
  return {
    ...tag,
    name,
    image: cover ? coverUrl(cover) : tag.image,
    aspect: cover ? COVER_ASPECT : undefined,
  }
}
