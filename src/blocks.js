import { slotToTime, timeToSlot, shiftDate, SLOTS_PER_DAY } from './time.js'

let seq = 0
export const newId = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`

const byStart = (a, b) =>
  a.startSlot - b.startSlot || a.endSlot - b.endSlot || (a.id < b.id ? -1 : 1)

const overlaps = (a, b) => a.startSlot < b.endSlot && a.endSlot > b.startSlot

/*
 * Lane order is list order: the first block in the list is drawn in the top
 * lane wherever things overlap. Which one that should be can't be worked out
 * from the times — a block painted later may be longer, shorter, earlier or
 * later — so the list is kept in whatever order things end up in and saved
 * that way. Read the file back and the stacking is unchanged.
 */

/**
 * Where a block has to sit in the list to be drawn in `lane` at `atSlot`.
 * List order is stacking order, so this is the one place that decides it.
 *
 * A single list can only ever approximate this: the top and bottom lanes are
 * exact, but a block wedged between two others is placed by the company it
 * keeps at `atSlot` and takes its chances everywhere else.
 */
function placeFor(blocks, atSlot, lane) {
  const covering = blocks.filter((b) => b.startSlot <= atSlot && b.endSlot > atSlot)
  if (lane <= 0) return 0 // above everything
  if (lane >= covering.length) return blocks.length // below everything
  return blocks.indexOf(covering[lane - 1]) + 1
}

/**
 * Whether two blocks are the same activity, and so cannot be two blocks.
 *
 * The tag says it for eighteen tags out of twenty. Games and anime are the
 * exceptions: finishing one and starting another is two things that happened,
 * and they are both tagged Game, or both tagged Anime. So what is being
 * played or watched counts too, and one nobody has named yet is its own
 * answer — it never folds into a named one, because there is no way to know
 * it was the same thing, and getting that wrong would put a name on time that
 * wasn't spent there.
 *
 * Which episodes deliberately do not count. Two stretches of the same show
 * back to back are one evening in front of it, whether you sat through three
 * episodes or one — the episodes join up rather than keeping the blocks
 * apart.
 */
const sameThing = (a, b) =>
  a.tag === b.tag && (a.game ?? '') === (b.game ?? '') && (a.show ?? '') === (b.show ?? '')

/** What a block is, as one word: its tag and whatever was played or watched. */
const thingOf = (b) => `${b.tag}|${b.game ?? ''}|${b.show ?? ''}`

/**
 * Every place a block was snipped in two: each moment where one block ends
 * and a twin of it — the same thing, see sameThing — starts.
 *
 * Nothing records a cut but the two blocks themselves, written down side by
 * side. Two stretches of the same thing touching end to end are never made
 * any other way, because any other way of bringing them together joins them
 * into one; so two that touch are two because somebody said so, and they
 * stay two. Read back from a note they are still touching, and still two.
 *
 * Returned as a set of "thing@slot".
 */
export function cutsOf(blocks) {
  const cuts = new Set()
  for (const a of blocks) {
    for (const b of blocks) {
      if (a !== b && a.endSlot === b.startSlot && sameThing(a, b)) cuts.add(`${thingOf(a)}@${a.endSlot}`)
    }
  }
  return cuts
}

/**
 * Fold a block together with every block of the same activity it meets.
 *
 * One activity can't run alongside itself, so two stretches of it that touch
 * or overlap are one stretch — however they came to meet. Painting one over
 * the other, dragging an edge until it reaches, or sliding the whole block up
 * against it all end in the same place.
 *
 * Ends that merely touch count: a block ending at 14:00 and one starting at
 * 14:00 are not two things — unless that is where it was snipped. `cuts`
 * (see cutsOf) are the places that were cut before this change, and two ends
 * meeting at one of them stay apart. Something laid across a cut, overlapping
 * both sides of it, still joins them: painting over a cut heals it.
 *
 * The survivor is the earliest of them in the list and keeps its place, so
 * joining two blocks is not a reason to restack anything around them.
 */
function mergeSameTag(blocks, block, cuts = new Set()) {
  const twins = blocks.filter((b) => sameThing(b, block))
  const meet = (a, b) => {
    if (a.startSlot < b.endSlot && a.endSlot > b.startSlot) return true
    const at = a.endSlot === b.startSlot ? a.endSlot : b.endSlot === a.startSlot ? a.startSlot : null
    return at !== null && !cuts.has(`${thingOf(block)}@${at}`)
  }
  // Everything it reaches, and everything those reach in turn.
  const reached = new Set([block])
  for (let grew = true; grew;) {
    grew = false
    for (const b of twins) {
      if (reached.has(b) || ![...reached].some((r) => meet(r, b))) continue
      reached.add(b)
      grew = true
    }
  }
  const touching = blocks.filter((b) => reached.has(b))
  if (touching.length < 2) return blocks

  const keep = touching[0]
  const notes = touching.map((b) => b.note).filter(Boolean)
  const episodes = touching.flatMap((b) => b.episodes ?? [])
  const merged = {
    ...keep,
    startSlot: Math.min(...touching.map((b) => b.startSlot)),
    endSlot: Math.max(...touching.map((b) => b.endSlot)),
    // Don't lose anything that was written on the blocks being absorbed.
    note: [...new Set(notes)].join('\n'),
    // Nor anything that was watched during them. Two stretches of one show
    // becoming one stretch means the evening was all of those episodes.
    ...(episodes.length > 0 ? { episodes: [...new Set(episodes)].sort((a, b) => a - b) } : {}),
  }
  return blocks
    .filter((b) => b === keep || !touching.includes(b))
    .map((b) => (b === keep ? merged : b))
}

/** Fold each of `arrived` into whatever of the same thing it meets in `blocks`. */
function settle(blocks, arrived, cuts) {
  let next = blocks
  for (const a of arrived) {
    const still = next.find((b) => b.id === a.id)
    if (still) next = mergeSameTag(next, still, cuts)
  }
  return next
}

/**
 * Add a painted range. Different tags are allowed to overlap — they stack in
 * lanes when drawn. Painting a tag over itself merges instead of stacking.
 *
 * `at` is { slot, lane }: where the pointer went down, and which lane that
 * height means. Without it the block lands underneath, as it always did.
 */
export function applyPaint(blocks, painted, at) {
  const index = at ? placeFor(blocks, at.slot, at.lane) : blocks.length
  return mergeSameTag([...blocks.slice(0, index), painted, ...blocks.slice(index)], painted, cutsOf(blocks))
}

/**
 * Move one block's edges, or the whole block. Neighbours are left alone;
 * overlaps just stack, and meeting its own tag merges.
 *
 * With an `at` of { slot, lane } the block is being slid bodily, and that is
 * the height the pointer is asking for — read the same way painting reads it,
 * so dropping a block on the upper half of something puts it above rather
 * than always underneath.
 *
 * Without one, an edge is being dragged, and that must never change the
 * height the block is drawn at: the point is to change the times, not the
 * stacking. So whatever height it has now, it keeps over everything the new
 * extent reaches — top stays top, bottom stays bottom. A block wedged between
 * two others keeps its exact place in the order, since that is the only
 * record of where it sits. One that isn't overlapping anything has no height
 * to keep, so it tucks under, the same as painting it there would.
 *
 * An edge that sits where the block was snipped (see cutsOf) is the cut
 * itself, and dragging it moves the cut: the other half follows, longer or
 * shorter, and the two still meet. Never so far that the other half is gone —
 * the edge stops ten minutes short of its far end.
 */
export function applyResize(blocks, id, startSlot, endSlot, at) {
  if (endSlot <= startSlot) return blocks
  const target = blocks.find((b) => b.id === id)
  if (!target) return blocks
  const cuts = cutsOf(blocks)

  if (!at) {
    const edge = startSlot !== target.startSlot ? 'start' : endSlot !== target.endSlot ? 'end' : null
    const partner = edge && cutPartner(blocks, id, edge)
    if (partner) {
      let follows
      if (edge === 'start') {
        startSlot = Math.max(startSlot, partner.startSlot + 1)
        follows = { ...partner, endSlot: startSlot }
      } else {
        endSlot = Math.min(endSlot, partner.endSlot - 1)
        follows = { ...partner, startSlot: endSlot }
      }
      if (endSlot <= startSlot) return blocks
      cuts.add(`${thingOf(target)}@${edge === 'start' ? startSlot : endSlot}`)
      blocks = blocks.map((b) => (b === partner ? follows : b))
    }
  }

  const moved = { ...target, startSlot, endSlot }
  const rest = blocks.filter((b) => b.id !== id)

  if (at) {
    const index = placeFor(rest, at.slot, at.lane)
    return mergeSameTag([...rest.slice(0, index), moved, ...rest.slice(index)], moved, cuts)
  }

  // Which of its pieces says where the block stands. A stretch it has to
  // itself says nothing — every block is lane 0 of 1 when it is alone — so
  // the answer comes from where it actually shares the bar, and from the
  // longest such stretch, which is the one you would point at.
  const mine = layoutLanes(blocks).filter((p) => p.block.id === id)
  const shared = mine.filter((p) => p.lanes > 1)
  const drawn = (shared.length > 0 ? shared : mine)
    .reduce((a, b) => (b.to - b.from > a.to - a.from ? b : a))

  // Sharing with nothing means there is no height to keep.
  const placed = drawn.lanes === 1 || drawn.lane === drawn.lanes - 1
    ? [...rest, moved]
    : drawn.lane === 0
      ? [moved, ...rest]
      : blocks.map((b) => (b.id === id ? moved : b))
  return mergeSameTag(placed, moved, cuts)
}

/**
 * The other half of a cut at one edge of a block: the twin that ends where
 * this block starts (`edge` 'start') or starts where it ends ('end'). Null
 * where that edge is not a cut.
 */
export function cutPartner(blocks, id, edge) {
  const block = blocks.find((b) => b.id === id)
  if (!block) return null
  return blocks.find((b) => b !== block && sameThing(b, block)
    && (edge === 'start' ? b.endSlot === block.startSlot : b.startSlot === block.endSlot)) ?? null
}

/**
 * Snip a block in two at `slot`: the same thing either side, one ending and
 * the other starting right there.
 *
 * Both halves are all of what the block was — what was played or watched,
 * the episodes, the cover, what was written about it — since there is no
 * telling which half any of it belonged to. Say so on each half afterwards;
 * paint back over the cut and they are one block again, with nothing written
 * twice.
 *
 * The second half sits right after the first in the list, so it stacks
 * exactly where the block did. A cut at either end, or outside the block,
 * cuts nothing.
 */
export function snipBlock(blocks, id, slot) {
  const target = blocks.find((b) => b.id === id)
  if (!target || slot <= target.startSlot || slot >= target.endSlot) return blocks
  const first = { ...target, endSlot: slot, episodes: [...(target.episodes ?? [])] }
  const second = { ...target, id: newId(), startSlot: slot, episodes: [...(target.episodes ?? [])] }
  return blocks.flatMap((b) => (b === target ? [first, second] : [b]))
}

/**
 * Move several blocks at once, every one of them by the same amount: `slots`
 * along the day, and `days` from one day to another.
 *
 * `byDate` holds the blocks of every day involved, where they come from and
 * where they land. `picks` is [{ date, id }]. Returns { date: blocks } for
 * the days that changed, or null if a day they would land on isn't there.
 *
 * The shift is held so that every block stays inside its own day: a group
 * slid against midnight stops there as a whole rather than being squashed.
 *
 * Moving within a day, each keeps its place in the list, and so its height.
 * Moving to another day they go in underneath what is there, the way
 * anything painted there would without a height asked for.
 *
 * Blocks moved together that were cut stay cut. A moved block that comes to
 * meet the same thing where it lands joins it, the way one block would.
 */
export function moveBlocks(byDate, picks, { days = 0, slots = 0 }) {
  const moving = picks
    .map(({ date, id }) => ({ date, block: byDate[date]?.find((b) => b.id === id) }))
    .filter((m) => m.block)
  if (moving.length === 0) return {}
  const shift = clampShift(moving.map((m) => m.block), slots)
  const shifted = (b) => ({ ...b, startSlot: b.startSlot + shift, endSlot: b.endSlot + shift })
  const sources = [...new Set(moving.map((m) => m.date))]
  const pickedOn = (date) => new Set(moving.filter((m) => m.date === date).map((m) => m.block.id))

  const out = {}
  if (days === 0) {
    for (const date of sources) {
      const ids = pickedOn(date)
      const kept = byDate[date].filter((b) => !ids.has(b.id))
      const arrived = byDate[date].filter((b) => ids.has(b.id)).map(shifted)
      const cuts = new Set([...cutsOf(kept), ...cutsOf(arrived)])
      out[date] = settle(byDate[date].map((b) => (ids.has(b.id) ? shifted(b) : b)), arrived, cuts)
    }
    return out
  }

  const targets = sources.map((date) => shiftDate(date, days))
  if (targets.some((date) => !byDate[date])) return null
  for (const date of new Set([...sources, ...targets])) {
    const ids = pickedOn(date)
    const kept = byDate[date].filter((b) => !ids.has(b.id))
    const arrived = moving.filter((m) => shiftDate(m.date, days) === date).map((m) => shifted(m.block))
    const cuts = new Set([...cutsOf(kept), ...cutsOf(arrived)])
    out[date] = settle([...kept, ...arrived], arrived, cuts)
  }
  return out
}

/** How far a group can go along the day, toward `slots`, with all of it still inside it. */
export function clampShift(blocks, slots) {
  const lowest = Math.min(...blocks.map((b) => b.startSlot))
  const highest = Math.max(...blocks.map((b) => b.endSlot))
  return Math.max(-lowest, Math.min(SLOTS_PER_DAY - highest, slots))
}

/**
 * Put copied blocks down, keeping how they sat with one another.
 *
 * `items` are what was copied: everything each block was, `slots` for how
 * long it ran, and `at` for when it started counted in slots from the start
 * of the first copied day — so a copy of an evening that ran past midnight
 * still runs past it. The earliest of them lands at `slot` on `date`, and the
 * rest follow at the same distances.
 *
 * Each one keeps its length up to the end of the day it lands on, as a single
 * pasted block does (see pasteAt). One landing on a day that isn't there is
 * left out.
 *
 * Returns { days: { date: blocks }, placed: [{ date, id }] }.
 */
export function pasteBlocks(byDate, items, date, slot) {
  if (items.length === 0) return { days: {}, placed: [] }
  const first = Math.min(...items.map((item) => item.at))
  const landing = {}
  for (const item of items) {
    const when = slot + item.at - first
    const ahead = Math.floor(when / SLOTS_PER_DAY)
    const day = shiftDate(date, ahead)
    if (!byDate[day]) continue
    const block = pasteAt(item, when - ahead * SLOTS_PER_DAY)
    if (block) (landing[day] ??= []).push(block)
  }
  const days = {}
  const placed = []
  for (const [day, arrived] of Object.entries(landing)) {
    const cuts = new Set([...cutsOf(byDate[day]), ...cutsOf(arrived)])
    const next = settle([...byDate[day], ...arrived], arrived, cuts)
    days[day] = next
    // What became of each: itself, or whatever it was folded into.
    for (const a of arrived) {
      const into = next.find((b) => b.id === a.id)
        ?? next.find((b) => sameThing(b, a) && b.startSlot <= a.startSlot && b.endSlot >= a.endSlot)
      if (into && !placed.some((p) => p.date === day && p.id === into.id)) placed.push({ date: day, id: into.id })
    }
  }
  return { days, placed }
}

/**
 * A copied block, put down at `slot`.
 *
 * Everything it was comes with it — what it was, what was played or watched,
 * which episodes, the cover, and whatever was written about it. Everything
 * except when it happened, which is the one thing being decided here.
 *
 * It keeps its length, up to the end of the day. Ten minutes to midnight is
 * not a reason to refuse a two-hour block, and it is certainly not a reason to
 * write tomorrow's hours into today's note — so what fits is what lands, and
 * an edge can be dragged afterwards if the rest of it matters.
 *
 * Nothing at all lands at midnight itself, where there is no room for even
 * one mark.
 */
export function pasteAt(copied, slot) {
  const endSlot = Math.min(SLOTS_PER_DAY, slot + copied.slots)
  if (endSlot <= slot) return null
  // `slots` is how long it was, `from` is which block it came off and `at`
  // is when it started — all about the copy, not about the block, and none
  // of them is written down.
  const { slots, from, at, ...was } = copied
  return { id: newId(), ...was, startSlot: slot, endSlot }
}

export const removeBlock = (blocks, id) => blocks.filter((b) => b.id !== id)

export const setNote = (blocks, id, note) =>
  blocks.map((b) => (b.id === id ? { ...b, note } : b))

/**
 * Say what was being played, or take it back off.
 *
 * `game` is { name, cover } or null. The cover is only ever the file the
 * picture was saved as — the name is the record, and it is what the note in
 * the vault reads as with nothing else installed.
 *
 * Naming a block can leave it up against another stretch of the same game
 * that it was already touching, so it merges on the way out, exactly as it
 * would have if the two had been dragged together.
 */
export function setGame(blocks, id, game) {
  const named = blocks.map((b) => (
    b.id === id ? { ...b, game: game?.name ?? '', cover: game?.cover ?? '' } : b
  ))
  const target = named.find((b) => b.id === id)
  return target ? mergeSameTag(named, target, cutsOf(blocks)) : named
}

/**
 * Say what was being watched, and which of it, or take it back off.
 *
 * `show` is { name, cover, episodes } or null. The same bargain the game
 * above strikes: the name and the episodes are the record and are written out
 * in the note, the cover is only ever the file the picture was saved as.
 *
 * Changing to a different show drops the episodes with it. Episode 7 of one
 * thing is not episode 7 of another, and carrying the numbers across would be
 * a quiet lie about an evening rather than an empty field.
 */
export function setShow(blocks, id, show) {
  const named = blocks.map((b) => (b.id === id
    ? {
      ...b,
      show: show?.name ?? '',
      cover: show?.cover ?? '',
      episodes: show?.name ? [...new Set(show.episodes ?? [])].sort((a, b2) => a - b2) : [],
    }
    : b))
  const target = named.find((b) => b.id === id)
  // Cut halves of a show stay halves while their episodes are said one half
  // at a time: the cuts are the ones there were before, and a half that is
  // still the same show still meets its other half at one.
  return target ? mergeSameTag(named, target, cutsOf(blocks)) : named
}

/** How far down the bar a piece (or a moment of one) starts, 0 to 1. */
const depthOf = (at) => at.lane / at.lanes

/**
 * Where one block is in a moment: its place in it, and how far down the bar
 * its top and bottom are. Null if it isn't there.
 */
function edgesIn(moment, block) {
  const at = moment.findIndex((m) => m.block === block)
  if (at < 0) return null
  const next = moment[at + 1]
  return { at, top: depthOf(moment[at]), bottom: next ? depthOf(next) : 1 }
}

/** A place `depth` of the way down the bar, as a lane of the fewest lanes that says it. */
function laneAt(block, depth) {
  for (let lanes = 1; lanes <= 96; lanes++) {
    const lane = Math.round(depth * lanes)
    if (Math.abs(lane - depth * lanes) < 1e-9) return { block, lane, lanes }
  }
  return { block, lane: Math.round(depth * 960), lanes: 960 }
}

/**
 * Whether two bands of one block meet in less than half the thinner of them:
 * drawn one after the other, a passage that narrow reads as a pinch.
 */
const pinches = (a, b) =>
  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) < Math.min(a.bottom - a.top, b.bottom - b.top) / 2 - 1e-9

/** Both edges of a block moving the same way between two bands: a Z. */
const zed = (a, b) => (b.top < a.top && b.bottom < a.bottom) || (b.top > a.top && b.bottom > a.bottom)

/** The same band of the bar, both edges. */
const sameBand = (x, y) => !!x && !!y && x.top === y.top && x.bottom === y.bottom

/**
 * Move the edge under the `i`th block of a moment to `depth`, by moving the
 * top of whatever is under it. Only if every block there keeps some room.
 */
function setBottom(moment, i, depth) {
  const under = moment[i + 1]
  if (!under || depth === depthOf(under)) return false
  const floor = moment[i + 2] ? depthOf(moment[i + 2]) : 1
  if (depth <= depthOf(moment[i]) || depth >= floor) return false
  moment[i + 1] = laneAt(under.block, depth)
  return true
}

/** Move the top of the `i`th block of a moment to `depth`; never the topmost. */
function setTop(moment, i, depth) {
  if (i === 0 || depth === depthOf(moment[i])) return false
  const bottom = moment[i + 1] ? depthOf(moment[i + 1]) : 1
  if (depth <= depthOf(moment[i - 1]) || depth >= bottom) return false
  moment[i] = laneAt(moment[i].block, depth)
  return true
}

/**
 * A block grows into its new place before it gives up its old one.
 *
 * When the bar divides differently from one moment to the next, a block in
 * the middle can have both its edges move the same way at once. Three things
 * become two when the top one stops: the middle one rises from the middle
 * third to the top half, its top and its bottom jumping up together. Drawn,
 * that is a Z — the old band and the new one only meet in a sliver, and the
 * block looks pinched to a thin passage right where it steps.
 *
 * So the step is taken in two: for ten minutes the block holds both, the
 * room it is moving into and the room it is leaving, and only then does the
 * block under it take its share. The block keeps its thickness all the way
 * round the corner, a staircase rather than a neck. The same in reverse
 * where something arrives above: the block under it gives way ten minutes
 * early, the block reaches down into that room first, and then it is pushed
 * down into it.
 *
 * That needs the block underneath to be there on both sides of the step.
 * Where it is the one ending (or starting) there, it can't keep the place
 * for the block above, so it gives up half of it instead, for its last (or
 * first) ten minutes: the block grows down into that half, and the step
 * becomes a staircase of two smaller ones.
 *
 * The same pinch can also take two moments: a block in the top half, the
 * block under it stopping, ten minutes with the bar to itself, then
 * something arriving on top and pushing it into the bottom half. The ten
 * minutes in between are a column the full height of the bar, and the only
 * way from the top half to the bottom one — a passage ten minutes wide. So
 * either side of the column the neighbours give up half their room for ten
 * minutes, and the column becomes the middle of a staircase.
 *
 * Only ever ten minutes, and only by a neighbour standing aside — so no block
 * is ever drawn anywhere it isn't running, and nothing is reordered. Changed
 * in place.
 */
function growBeforeShrinking(moments) {
  // A step taken in two can leave the moment before it in need of the same,
  // so this looks again — a few times at most; it settles at once in practice.
  for (let pass = 0; pass < 4; pass++) {
    let changed = false
    for (let slot = 1; slot < moments.length; slot++) {
      const was = moments[slot - 1]
      const now = moments[slot]
      if (!was || !now) continue
      for (const { block } of now) {
        const a = edgesIn(was, block)
        const b = edgesIn(now, block)
        if (!a || !b) continue
        if (b.top < a.top && b.bottom < a.bottom) {
          // Rising: the block underneath stays where it was a moment longer.
          const under = now[b.at + 1]
          const kept = was[a.at + 1]
          const floor = now[b.at + 2] ? depthOf(now[b.at + 2]) : 1
          if (kept?.block === under.block && depthOf(kept) < floor) {
            now[b.at + 1] = kept
            changed = true
          } else if (pinches(a, b)) {
            // It can't: it has only just arrived. It starts in the lower
            // half of its room instead.
            changed = setBottom(now, b.at, (b.bottom + Math.min(a.bottom, floor)) / 2) || changed
          }
        } else if (b.top > a.top && b.bottom > a.bottom) {
          // Sinking: the block underneath makes way a moment early.
          const under = was[a.at + 1]
          const early = now[b.at + 1]
          const floor = was[a.at + 2] ? depthOf(was[a.at + 2]) : 1
          if (early?.block === under.block && depthOf(early) < floor) {
            was[a.at + 1] = early
            changed = true
          } else if (pinches(a, b)) {
            // It can't: it is on its way out. It ends in the lower half of
            // its room instead.
            changed = setBottom(was, a.at, (a.bottom + Math.min(b.bottom, floor)) / 2) || changed
          }
        }
      }
    }

    // The column: a block with the bar to itself for ten or twenty minutes,
    // between a band before it and a band after it that barely meet.
    for (let slot = 1; slot < moments.length; slot++) {
      const was = moments[slot - 1]
      const now = moments[slot]
      if (!was || !now) continue
      for (const { block } of now) {
        const a = edgesIn(was, block)
        const b = edgesIn(now, block)
        if (!a || !b || b.top > a.top || b.bottom < a.bottom) continue
        let end = slot + 1
        while (end < slot + 3 && moments[end] && sameBand(edgesIn(moments[end], block), b)) end++
        const next = moments[end]
        const c = next && edgesIn(next, block)
        if (!c || end - slot > 2 || b.top > c.top || b.bottom < c.bottom) continue
        if (!zed(a, c) || !pinches(a, c)) continue
        if (c.top > a.top) {
          // From high to low: the one under it ends lower, the one over it
          // starts thinner.
          changed = setBottom(was, a.at, (a.bottom + b.bottom) / 2) || changed
          changed = setTop(next, c.at, (b.top + c.top) / 2) || changed
        } else {
          // From low to high: the one over it ends thinner, the one under it
          // starts lower.
          changed = setTop(was, a.at, (a.top + b.top) / 2) || changed
          changed = setBottom(next, c.at, (c.bottom + b.bottom) / 2) || changed
        }
      }
    }
    if (!changed) return
  }
}

/**
 * Work out where every block should be drawn once overlaps are allowed.
 *
 * One rectangle per block, the same height and position for its whole length.
 * The bar is divided by how many things were happening **at that moment** —
 * nothing else. Two at once is halves, three is thirds, one is the whole bar.
 *
 * That "at that moment" is the whole of it. It used to be worked out per
 * group: everything joined by a chain of overlaps was divided by the deepest
 * pile-up anywhere in that chain. So two hours of music with a walk during it
 * were drawn a third of the bar high, because the music brushed a game that
 * brushed a ten-minute meal four hours earlier — and nothing was three-deep at
 * the moment you were walking the dog. Height meant "how busy was the day
 * around here", which is not a thing anyone reads a bar for.
 *
 * A lane is where a block *starts*: it is drawn from there down to the floor
 * of the bar, and whatever is layered over it covers the lower part. So a
 * block is never left as a thin band floating in empty space, every block ends
 * on the same line, and the moment a neighbour stops the block beneath it
 * grows into the room that just came free.
 *
 * Which lane is list order, and list order is yours: paint or drop one block
 * over another and it goes above it. Nothing here reorders that.
 *
 * The one softening: the bar makes room ten minutes before anything starts,
 * holding the lane the new block will take, so that it gives way ahead of the
 * block rather than jolting on the slot it appears. Whatever sits above that
 * lane reaches the floor and fills it in the meantime, so nothing shows
 * through and nothing moves twice.
 *
 * Where the block was a short one, the room stays open ten minutes after it
 * too: a ten-minute meal would otherwise cut a notch exactly its own width —
 * a spike, rather than somewhere the day made room. An hour of something keeps
 * no such room after it, which would only leave whatever is beside it standing
 * higher than anything running there could account for.
 *
 * A block is cut only where that count genuinely changes, and each run comes
 * back as one piece.
 *
 * With `keepPauses` (a setting, off unless chosen), a ten-minute pause in
 * something above a block is drawn as a gap rather than filled: see below.
 *
 * And where a block would have to jump up or down the bar in one go, it
 * takes the step in two: see growBeforeShrinking.
 *
 * Returns { block, from, to, lane, lanes, top, z, index, isFirst, isLast }.
 * A piece starts `lane / lanes` of the way down the bar; `z` is how deep it
 * stacks, deeper over shallower.
 */
export function layoutLanes(blocks, { keepPauses = false } = {}) {
  if (blocks.length === 0) return []

  // What is running at each ten minutes of the day, in list order — which is
  // stacking order.
  const running = []
  for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
    running[slot] = blocks.filter((b) => b.startSlot <= slot && b.endSlot > slot)
  }

  /** Where down the bar a block starts at a moment, or -1 if it isn't there. */
  const shareAt = (block, slot) => {
    const at = running[slot]?.indexOf(block) ?? -1
    return at < 0 ? -1 : at / running[slot].length
  }

  // Each ten minutes as it is drawn: what is there, top to bottom, and the
  // lane each of them starts in. Worked out moment by moment first, then
  // smoothed where one moment meets the next (see below), then cut into
  // pieces.
  const moments = []
  for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
    const from = slot
    const to = slot + 1
    const here = running[slot]
    if (here.length === 0) continue
    const before = moments[slot - 1]

    // Left alone, a block rises into any room above it, ten minutes of it
    // included: the bar is always filled. Some would rather a ten-minute pause
    // above a block read as a pause than as the block standing up to full
    // height for exactly those ten minutes and dropping back. With
    // keepPauses, where every block here is drawn the same just before and
    // just after, and the slot between is the only one that differs, they
    // keep the place they had and the pause shows as the gap it was.
    const bridged = keepPauses && before && here.every((b) => {
      const share = shareAt(b, slot - 1)
      return share >= 0 && share === shareAt(b, slot + 1)
    }) && here.some((b) => shareAt(b, slot) !== shareAt(b, slot - 1))
    if (bridged) {
      moments[slot] = before.filter((at) => here.includes(at.block))
      continue
    }

    // The bar makes its change ten minutes early and holds it ten minutes
    // late: a lane is kept for a block that starts next, and kept a moment
    // longer for one that has just stopped. So a block steps aside once,
    // ahead of the new one, rather than being shoved on the very slot it
    // appears — and a short block sits in a shelf rather than in a notch
    // exactly its own width.
    //
    // The lane is what is kept, not merely the room. The block that has to
    // move goes straight to the place it will hold, instead of rising into
    // the gap and dropping back out of it ten minutes later. Nothing shows
    // through a kept lane: whatever is above it reaches the floor and fills
    // it until the new block lands there.
    //
    // Two things have to be true before a lane is kept, and both of them
    // matter.
    //
    // Something that is still going to be here has to actually move. A block
    // on its way out has nothing to step aside for, and keeping a lane on its
    // account only pushes it about on the way — which is how a bar ended up
    // with a stub at the start and end of every block on it, and how a shelf
    // came out twenty minutes wide instead of ten, one moment held for a
    // block leaving and the next for one arriving that nothing there would
    // ever meet.
    //
    // And the lane has to be underneath everything drawn. A lane kept above
    // something running would push that block down for ten minutes and let it
    // back up the moment the new one arrived — and the block on top of the
    // pile, which reaches the floor, would swell down into the kept lane and
    // shrink out of it again, the line under it dipping and coming back for
    // no reason anybody watching could see. Room made early has to lift what
    // is already there, or it is not worth making.
    const stirs = (then) => here.some((b) => {
      const share = shareAt(b, then)
      return share >= 0 && share !== shareAt(b, slot)
    })
    const ahead = stirs(to)
    const behind = stirs(slot - 1)
    const lowest = blocks.indexOf(here[here.length - 1])
    const held = blocks.filter((b) => here.includes(b) || (blocks.indexOf(b) > lowest
      && ((ahead && b.startSlot === to) || (behind && b.endSlot === from))))

    // And only where it can be seen: a share of the bar that works out the
    // same either way is not worth cutting the block for.
    const same = here.every((b) => held.indexOf(b) * here.length === here.indexOf(b) * held.length)
    const claiming = same ? here : held
    const lanes = claiming.length
    moments[slot] = here.map((block) => ({ block, lane: claiming.indexOf(block), lanes }))
  }

  growBeforeShrinking(moments)

  const pieces = []
  const open = new Map() // block -> the run being extended
  for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
    for (const { block, lane, lanes } of moments[slot] ?? []) {
      const last = open.get(block)
      // One rectangle per run at the same height, so a block is only cut
      // where the number of things beside it really changes.
      if (last && last.to === slot && last.lane === lane && last.lanes === lanes) {
        last.to = slot + 1
        continue
      }
      const piece = { block, from: slot, to: slot + 1, lane, lanes, top: lane }
      open.set(block, piece)
      pieces.push(piece)
    }
  }

  // How deep each piece sits, as a plain order to stack by. Its lane alone
  // won't do: next to a step (see growBeforeShrinking) one block can be
  // counted in halves while the one under it is still counted in thirds.
  const depths = [...new Set(pieces.map(depthOf))].sort((a, b) => a - b)
  for (const piece of pieces) piece.z = depths.indexOf(depthOf(piece))

  for (const block of blocks) {
    const mine = pieces.filter((p) => p.block === block)
    if (mine.length === 0) continue
    // Rounded ends and grab strips belong to the outermost pieces only; the
    // joins between them are drawn square so a stepped block reads as one.
    mine[0].isFirst = true
    mine[mine.length - 1].isLast = true
    // Which piece of its block this is. Counting from the start of the block
    // rather than naming a piece after where it begins gives it an identity
    // that survives the block being dragged.
    mine.forEach((piece, at) => { piece.index = at })
  }

  return pieces
}


/**
 * The strips of a block that can actually be seen, left to right.
 *
 * A block is cut into pieces where the bar changes how many ways it divides.
 * That is not the only thing that changes how much of the block shows,
 * though: a neighbour can start and stop inside one piece without the count
 * ever changing. Ask a piece how much room it has and the answer is the one
 * from its worst moment, applied across its whole width — which is how a
 * block standing at full height for most of its length ended up wearing a
 * picture sized for the sliver a neighbour was sitting on, drawn up in the
 * corner rather than in the middle of it.
 *
 * So the cuts come from both: the block's own pieces, and the edges of
 * everything drawn over it. Each strip is then a rectangle that is the
 * block's alone, and neighbouring strips with the same top and bottom are one
 * rectangle again.
 */
export function stripsOf(mine, pieces) {
  const block = mine[0].block
  const over = pieces.filter(
    (p) => p.block !== block && p.from < block.endSlot && p.to > block.startSlot,
  )
  const cuts = [...new Set([
    ...mine.flatMap((p) => [p.from, p.to]),
    ...over.flatMap((p) => [p.from, p.to]),
  ])]
    .filter((slot) => slot >= block.startSlot && slot <= block.endSlot)
    .sort((a, b) => a - b)

  const strips = []
  for (let i = 0; i < cuts.length - 1; i++) {
    const from = cuts[i]
    const to = cuts[i + 1]
    const piece = mine.find((p) => p.from <= from && p.to >= to)
    if (!piece) continue
    // A strip lies inside one cut, so anything over it covers all of it.
    const top = depthOf(piece)
    const under = over.filter((p) => depthOf(p) > top && p.from <= from && p.to >= to)
    const bottom = under.length > 0 ? Math.min(...under.map(depthOf)) : 1
    const last = strips[strips.length - 1]
    if (last && last.to === from && last.top === top && last.bottom === bottom) last.to = to
    else strips.push({ from, to, top, bottom })
  }
  return strips
}

/**
 * Every block joined to this one by overlap, directly or through others.
 * Each keeps its own note; this is only so the note panel can name what else
 * was running at the time. Sorted by start, so it reads in order.
 */
export function overlapCluster(blocks, id) {
  const start = blocks.find((b) => b.id === id)
  if (!start) return []

  const cluster = [start]
  let grew = true
  while (grew) {
    grew = false
    for (const b of blocks) {
      if (cluster.includes(b)) continue
      if (cluster.some((c) => overlaps(b, c))) {
        cluster.push(b)
        grew = true
      }
    }
  }
  return cluster.sort(byStart)
}

/** Internal blocks -> the JSON shape stored in the Obsidian fence. */
export function serialise(blocks) {
  // Saved in list order, not sorted by time: the order is what decides which
  // block stacks above which, and it has to survive a reload.
  return blocks.map(({ tag, startSlot, endSlot, note, game, show, episodes, cover }) => {
    const entry = { tag, start: slotToTime(startSlot), end: slotToTime(endSlot) }
    if (note) entry.note = note
    // The name goes in whether or not there is a picture; the picture is no
    // use on its own, so it only goes in behind the name.
    if (game) entry.game = game
    if (show) entry.show = show
    if (show && episodes?.length) entry.episodes = episodes
    if ((game || show) && cover) entry.cover = cover
    return entry
  })
}

export function deserialise(entries) {
  return entries.map((e) => ({
    id: newId(),
    tag: e.tag,
    startSlot: timeToSlot(e.start),
    endSlot: timeToSlot(e.end),
    note: e.note ?? '',
    game: e.game ?? '',
    show: e.show ?? '',
    episodes: e.episodes ?? [],
    cover: e.cover ?? '',
  }))
}
