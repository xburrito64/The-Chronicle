import assert from 'node:assert'
import {
  applyPaint, applyResize, layoutLanes, stripsOf, overlapCluster, pasteAt, serialise, deserialise, setGame, setShow,
  snipBlock, cutsOf, cutPartner, moveBlocks, pasteBlocks,
} from './blocks.js'
import { paintSpans, SLOTS_PER_DAY } from './time.js'

let pass = 0, fail = 0
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name) }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message) }
}

const b = (id, tag, startSlot, endSlot, note = '') => ({ id, tag, startSlot, endSlot, note })
/** compact view of a layout: "id from-to top/lanes" — where it is drawn from */
const shape = (pieces) => pieces
  .map((p) => `${p.block.id} ${p.from}-${p.to} ${p.top}/${p.lanes}`)
  .sort()

/** compact view of what can be seen of one block: "from-to top..bottom" */
const seen = (blocks, id) => {
  const pieces = layoutLanes(blocks)
  return stripsOf(pieces.filter((p) => p.block.id === id), pieces)
    .map((s) => `${s.from}-${s.to} ${s.top}..${s.bottom}`)
}

t('a block with nothing on it is one strip, the whole bar deep', () => {
  assert.deepStrictEqual(seen([b('g', 'game', 0, 10)], 'g'), ['0-10 0..1'])
})

t('a strip stops where something is laid over the block, and starts again after', () => {
  // The reported fault, and the reason a picture came out sized for a sliver:
  // one neighbour on each end of a half-hour block left it cut into a single
  // piece, and asking that piece how deep it was gave the answer from its
  // worst moment across the whole width — even the middle, where the block
  // stood at full height with nothing on it at all.
  const blocks = [b('g', 'game', 10, 13), b('d', 'dgg', 9, 11), b('y', 'youtube', 12, 14)]
  assert.deepStrictEqual(seen(blocks, 'g'), [
    '10-11 0..0.5',   // dgg underneath it here
    '11-12 0..1',     // and nothing at all here, so the whole bar
    '12-13 0..0.5',   // youtube underneath it here
  ])
})

t('a block only covered for part of its length keeps the rest of its depth', () => {
  const blocks = [b('g', 'game', 0, 20), b('d', 'dgg', 0, 4)]
  assert.deepStrictEqual(seen(blocks, 'g'), ['0-4 0..0.5', '4-20 0..1'])
})

t('touching strips of the same depth are one strip', () => {
  // game is cut in two by the room the bar makes for the meal beside it, but
  // nothing is ever drawn over game, so what you see of it is one rectangle.
  const blocks = [b('g', 'game', 0, 20), b('d', 'dgg', 30, 32)]
  assert.deepStrictEqual(seen(blocks, 'g'), ['0-20 0..1'])
})

t('what is seen of the block underneath stops at the one on top', () => {
  const blocks = [b('g', 'game', 0, 10), b('d', 'dgg', 4, 8)]
  assert.deepStrictEqual(seen(blocks, 'd'), ['4-8 0.5..1'])
  // Cut into four pieces by the room the bar makes either side of dgg, but
  // only three of what you can see: the shelf is game's own, so it reads as
  // one rectangle up to where dgg starts and one again after it ends.
  assert.deepStrictEqual(seen(blocks, 'g'), ['0-4 0..1', '4-8 0..0.5', '8-10 0..1'])
})

t('the bar gives way a block before something starts, however long it is', () => {
  // Asked for: the block above should be out of the way by the time the new
  // one arrives, rather than moving on the very slot it appears.
  const pieces = layoutLanes([b('d', 'dgg', 0, 7), b('f', 'food', 0, 7), b('a', 'anything', 3, 9)])
  const food = pieces.filter((p) => p.block.id === 'f')
  assert.deepStrictEqual(food.map((p) => p.from + '-' + p.to + ' ' + p.lane + '/' + p.lanes),
    ['0-2 1/2', '2-7 1/3'], 'it makes room a block before anything else starts')
})

t('but a long block keeps no room once it is over', () => {
  // The other end of the same day: nothing is running there but the two that
  // are, so the bar says two. Holding the third lane open for ten minutes
  // after an hour of something ended left the block beside it standing higher
  // than the day could account for.
  const pieces = layoutLanes([b('d', 'dgg', 0, 7), b('f', 'food', 0, 7), b('a', 'anything', 3, 9)])
  const anything = pieces.filter((p) => p.block.id === 'a')
  assert.deepStrictEqual(anything.map((p) => p.from + '-' + p.to + ' ' + p.lane + '/' + p.lanes),
    ['3-7 2/3', '7-9 0/1'])
})

t('a short one keeps its shelf at both ends', () => {
  const pieces = layoutLanes([b('d', 'dgg', 0, 7), b('f', 'food', 0, 7), b('a', 'anything', 3, 5)])
  const food = pieces.filter((p) => p.block.id === 'f')
  assert.deepStrictEqual(food.map((p) => p.from + '-' + p.to + ' ' + p.lane + '/' + p.lanes),
    ['0-2 1/2', '2-6 1/3', '6-7 1/2'])
})

t('a block steps aside once, into the place it is going to hold', () => {
  // The reported fault: food rose into the room made ahead of it and then
  // dropped back out of it ten minutes later, when the block it was making
  // room for actually arrived. It goes straight to where it ends up instead,
  // and stays there — a third of the bar rather than a half, a block early.
  const pieces = layoutLanes([b('d', 'dgg', 0, 7), b('f', 'food', 0, 7), b('a', 'anything', 3, 9)])
  const food = pieces.filter((p) => p.block.id === 'f')
  assert.deepStrictEqual(food.map((p) => p.from + '-' + p.to + ' ' + p.lane + '/' + p.lanes),
    ['0-2 1/2', '2-7 1/3'], 'up to its final lane a block before anything arrives')
})

t('but never early when the new block lands above it', () => {
  // The same day with anything else dropped on top of food instead. Making
  // room early would push food *down* for ten minutes and let it back up the
  // moment the new block arrived — and dgg, which reaches the floor, would
  // swell down into the held lane and shrink out of it again, so the line
  // under dgg dipped and came back for no reason anyone watching could see.
  // Everything happens at once, where it really happens.
  const pieces = layoutLanes([b('d', 'dgg', 0, 7), b('a', 'anything', 3, 9), b('f', 'food', 0, 7)])
  const food = pieces.filter((p) => p.block.id === 'f')
  assert.deepStrictEqual(food.map((p) => p.from + '-' + p.to + ' ' + p.lane + '/' + p.lanes),
    ['0-3 1/2', '3-7 2/3'])
  // dgg is drawn from the ceiling throughout and is never cut at all.
  const dgg = pieces.filter((p) => p.block.id === 'd')
  assert.deepStrictEqual(dgg.map((p) => p.from + '-' + p.to + ' ' + p.lane + '/' + p.lanes),
    ['0-3 0/2', '3-7 0/3'])
})

t('no lane is kept for a block nothing here will be around to meet', () => {
  // The reported fault: a stub at the start and end of blocks all over the
  // bar. dgg stops exactly where youtube starts, so nothing running at the
  // handover has to step aside for anything — game is on top throughout and
  // is drawn from the ceiling either way — and there is nothing to keep a
  // lane for.
  const pieces = layoutLanes([b('g', 'game', 0, 20), b('d', 'dgg', 5, 10), b('y', 'youtube', 10, 15)])
  assert.deepStrictEqual(shape(pieces),
    ['d 5-10 1/2', 'g 0-5 0/1', 'g 15-20 0/1', 'g 5-15 0/2', 'y 10-15 1/2'])
})

t('and a shelf is one block wide, not two', () => {
  // The other half of the same fault. The room kept past the end of dgg and
  // food is ten minutes; the shower arriving ten minutes after that keeps
  // nothing, because anything stops on the slot the shower starts and is
  // never there to meet it.
  const pieces = layoutLanes([
    b('m', 'music', 7, 14), b('d', 'dgg', 0, 7), b('a', 'anything', 3, 9),
    b('s', 'shower', 9, 13), b('f', 'food', 0, 7),
  ])
  const anything = pieces.filter((p) => p.block.id === 'a')
  assert.deepStrictEqual(anything.map((p) => p.from + '-' + p.to + ' ' + p.lane + '/' + p.lanes),
    ['3-8 1/3', '8-9 1/2'], 'one block past the end of the two it was sharing with')
})

t('a copy lands whole, at the moment it is put down', () => {
  const copied = {
    from: 'somewhere', slots: 12, tag: 'anime', show: 'ONE PIECE',
    episodes: [1175], cover: 'one-piece-21.jpg', note: 'Enies Lobby', game: '',
  }
  const put = pasteAt(copied, 90) // 15:00
  assert.deepStrictEqual(
    { ...put, id: undefined },
    {
      id: undefined, tag: 'anime', show: 'ONE PIECE', game: '',
      episodes: [1175], cover: 'one-piece-21.jpg', note: 'Enies Lobby',
      startSlot: 90, endSlot: 102,
    },
    'everything it was, and nothing about the copying',
  )
  assert.ok(put.id, 'and an id of its own, so it is a block rather than the block')
})

t('and keeps what fits when there is not a whole day left', () => {
  const copied = { slots: 12, tag: 'game', note: '', game: '', show: '', episodes: [], cover: '' }
  const put = pasteAt(copied, SLOTS_PER_DAY - 2) // ten past eleven at night
  assert.deepStrictEqual([put.startSlot, put.endSlot], [142, 144],
    'twenty minutes of it rather than two hours of tomorrow')
})

t('nothing lands at midnight itself', () => {
  const copied = { slots: 12, tag: 'game', note: '', game: '', show: '', episodes: [], cover: '' }
  assert.strictEqual(pasteAt(copied, SLOTS_PER_DAY), null)
})

t('a pasted block folds into the same thing already running there', () => {
  // Watching more of what is already on: one evening, not two blocks.
  const day = [b('a', 'anime', 90, 96)]
  day[0].show = 'ONE PIECE'
  const put = pasteAt({ slots: 6, tag: 'anime', show: 'ONE PIECE', game: '', note: '', episodes: [], cover: '' }, 96)
  const after = applyPaint(day, put)
  assert.strictEqual(after.length, 1)
  assert.deepStrictEqual([after[0].startSlot, after[0].endSlot], [90, 102])
})

t('a lone block fills the bar', () => {
  assert.deepStrictEqual(shape(layoutLanes([b('g', 'game', 0, 10)])), ['g 0-10 0/1'])
})

t('the bar is shared exactly while it is shared', () => {
  // Forty minutes of dgg is long enough to make its own room, so the bar
  // halves where the two actually run together and nowhere else.
  const pieces = layoutLanes([b('g', 'game', 0, 12), b('d', 'dgg', 4, 8)])
  assert.deepStrictEqual(shape(pieces), [
    'd 4-8 1/2',    // dgg underneath, exactly where it runs
    'g 0-4 0/1',    // game has the bar to itself
    'g 4-8 0/2',    // halves while the two are both running
    'g 8-12 0/1',   // and the whole bar again the moment it stops
  ])
  // Nothing here is cut early: game is on top throughout, so it is drawn from
  // the ceiling to the floor whether the bar says one lane or two, and there
  // is nothing to move out of dgg's way.
})

t('a block gives up room when a third thing starts, and takes it back after', () => {
  // This used to go the other way: a block held one height for its whole
  // length, which meant it stayed a third high long after the third thing had
  // stopped — and, worse, could be thinned by a pile-up hours away that it
  // only touched through a chain of others. Asked for again the other way
  // round: the height says how many things were running just there.
  const pieces = layoutLanes([
    b('s', 'sleep', 0, 60), b('m', 'music', 0, 60), b('a', 'anime', 20, 40),
  ])
  const music = pieces.filter((p) => p.block.id === 'm')
  // A block early at each end: the bar gives way ahead of anime arriving and
  // keeps the lane a moment after it has gone, so music steps once each way
  // rather than on the very slot.
  assert.deepStrictEqual(music.map((p) => p.from + '-' + p.to + ' ' + p.lane + '/' + p.lanes),
    ['0-19 1/2', '19-41 1/3', '41-60 1/2'])
})

t('a block rises to fill the top once nothing is above it', () => {
  // dgg is pushed down while game is there; past the end of game there is
  // nothing above it, so it takes the whole bar rather than leaving a gap.
  const pieces = layoutLanes([b('g', 'game', 6, 11), b('d', 'dgg', 10, 13)])
  assert.deepStrictEqual(shape(pieces), [
    'd 10-11 1/2',   // under game
    'd 11-13 0/1',   // and has the bar to itself after it
    'g 10-11 0/2',
    'g 6-10 0/1',
  ])
})

t('a ten-minute pause above a block is filled, as the bar always is', () => {
  // The bar is never left with room in it: the walk stands up to full height
  // for the ten minutes between the two stretches of music.
  const pieces = layoutLanes([b('m1', 'music', 0, 6), b('m2', 'music', 7, 12), b('w', 'walk', 0, 20)])
  assert.deepStrictEqual(shape(pieces.filter((p) => p.block.id === 'w')),
    ['w 0-6 1/2', 'w 12-20 0/1', 'w 6-7 0/1', 'w 7-12 1/2'])
})

t('with keepPauses, a ten-minute pause above a block is a gap instead', () => {
  // Chosen in the settings: the walk stays where it is under the music, and
  // the pause shows as the gap it was.
  const pieces = layoutLanes([b('m1', 'music', 0, 6), b('m2', 'music', 7, 12), b('w', 'walk', 0, 20)],
    { keepPauses: true })
  assert.deepStrictEqual(shape(pieces), [
    'm1 0-6 0/2',
    'm2 7-12 0/2',
    'w 0-12 1/2',   // under the music, the pause included
    'w 12-20 0/1',  // and rises only once the music is done
  ])
})

t('even with keepPauses, a longer pause above a block is room it rises into', () => {
  // Twenty minutes is a stretch of the walk with nothing above it, and it
  // is drawn that way, as it always was.
  const pieces = layoutLanes([b('m1', 'music', 0, 6), b('m2', 'music', 8, 12), b('w', 'walk', 0, 20)],
    { keepPauses: true })
  assert.deepStrictEqual(shape(pieces.filter((p) => p.block.id === 'w')),
    ['w 0-6 1/2', 'w 12-20 0/1', 'w 6-8 0/1', 'w 8-12 1/2'])
})

t('a block cut where it rises is still one block', () => {
  const pieces = layoutLanes([b('g', 'game', 6, 11), b('d', 'dgg', 10, 13)])
  const dgg = pieces.filter((p) => p.block.id === 'd')
  assert.strictEqual(dgg.length, 2)
  assert.deepStrictEqual(dgg.map((p) => [p.isFirst, p.isLast]), [[true, undefined], [undefined, true]],
    'only the outer ends are rounded, and only they carry handles')
  assert.deepStrictEqual(dgg.map((p) => p.lane), [1, 0], 'it rises when the block above it ends')
})

t('nothing is left empty above the shallowest block', () => {
  // whatever is topmost at any moment reaches the ceiling
  const pieces = layoutLanes([
    b('a', 'game', 0, 10), b('bb', 'dgg', 5, 20), b('c', 'anime', 15, 30),
  ])
  for (const slot of [0, 5, 10, 15, 20, 25]) {
    const here = pieces.filter((p) => p.from <= slot && p.to > slot)
    assert.ok(here.some((p) => p.top === 0), `nothing reaches the top at slot ${slot}`)
  }
})

t('blocks that miss each other never thin one another', () => {
  // dgg and anime both sit under game, but never at the same moment: halves
  // where each of them runs, and the whole bar in between. Nothing is ever a
  // third here, because nothing was ever three-deep.
  const pieces = layoutLanes([b('g', 'game', 0, 20), b('d', 'dgg', 0, 4), b('a', 'anime', 16, 20)])
  assert.deepStrictEqual(shape(pieces),
    ['a 16-20 1/2', 'd 0-4 1/2', 'g 0-4 0/2', 'g 16-20 0/2', 'g 4-16 0/1'])
})

t('a block that overlaps nothing keeps the full height', () => {
  const pieces = layoutLanes([b('g', 'game', 0, 10), b('d', 'dgg', 2, 8), b('far', 'walk', 30, 40)])
  assert.strictEqual(pieces.find((p) => p.block.id === 'far').lanes, 1)
})

// Whatever was painted later is later in the list, and goes underneath.
const lanesAt = (pieces, slot) => Object.fromEntries(
  pieces.filter((p) => p.from <= slot && p.to > slot).map((p) => [p.block.id, p.lane]))

t('the block added first takes the top lane', () => {
  const pieces = layoutLanes([b('g', 'game', 0, 12), b('d', 'dgg', 4, 8)])
  assert.deepStrictEqual(lanesAt(pieces, 5), { g: 0, d: 1 })
})

t('a short block painted at the START of a long one goes underneath', () => {
  const pieces = layoutLanes([b('g', 'game', 48, 80), b('r', 'reading', 48, 52)])
  assert.deepStrictEqual(lanesAt(pieces, 49), { g: 0, r: 1 })
})

t('a short block painted at the END of a long one goes underneath', () => {
  const pieces = layoutLanes([b('g', 'game', 48, 80), b('r', 'reading', 76, 80)])
  assert.deepStrictEqual(lanesAt(pieces, 77), { g: 0, r: 1 })
})

t('identical spans put the newer block underneath', () => {
  const pieces = layoutLanes([b('b1', 'game', 0, 8), b('b2', 'reading', 0, 8)])
  assert.deepStrictEqual(lanesAt(pieces, 1), { b1: 0, b2: 1 })
})

t('a later block stays underneath even when it is LONGER', () => {
  // the reported bug: reading was dragged out past game, and jumped on top
  const pieces = layoutLanes([b('g', 'game', 48, 64), b('r', 'reading', 48, 90)])
  assert.deepStrictEqual(lanesAt(pieces, 50), { g: 0, r: 1 })
})

t('a later block stays underneath when it spans two earlier ones', () => {
  // reading dragged right so it covers the end of game and the start of dgg
  const pieces = layoutLanes([
    b('g', 'game', 48, 64), b('d', 'dgg', 70, 84), b('r', 'reading', 60, 76),
  ])
  assert.deepStrictEqual(lanesAt(pieces, 62), { g: 0, r: 1 }, 'over game')
  assert.deepStrictEqual(lanesAt(pieces, 72), { d: 0, r: 1 }, 'over dgg')
})

t('the whole of a long block stays in one lane while something nests in it', () => {
  const pieces = layoutLanes([b('g', 'game', 48, 80), b('r', 'reading', 48, 52)])
  const game = pieces.filter((p) => p.block.id === 'g')
  assert.ok(game.every((p) => p.lane === 0), 'game must not change lane part-way')
})

t('stacking order survives a save and reload', () => {
  const painted = applyPaint([b('g', 'game', 48, 64)], b('r', 'reading', 48, 90))
  const reloaded = deserialise(serialise(painted))
  const ids = reloaded.map((x) => x.tag)
  assert.deepStrictEqual(ids, ['game', 'reading'], 'file order must not be re-sorted')
  const pieces = layoutLanes(reloaded)
  const at = pieces.filter((p) => p.from <= 50 && p.to > 50)
  assert.strictEqual(at.find((p) => p.block.tag === 'game').lane, 0)
  assert.strictEqual(at.find((p) => p.block.tag === 'reading').lane, 1)
})

t('three at once split into thirds, and only then', () => {
  const pieces = layoutLanes([
    b('a', 'game', 0, 10), b('b', 'dgg', 2, 10), b('c', 'anime', 4, 10),
  ])
  // The whole bar, then halves, then thirds. a is on top the whole way and
  // never has to move, so it is cut where the others actually start; b does
  // have to move for c, and so gives way a block early.
  assert.deepStrictEqual(shape(pieces),
    ['a 0-2 0/1', 'a 2-3 0/2', 'a 3-10 0/3', 'b 2-3 1/2', 'b 3-10 1/3', 'c 4-10 2/3'])
})

t('identical ranges share evenly', () => {
  const pieces = layoutLanes([b('a', 'game', 0, 4), b('b', 'dgg', 0, 4)])
  assert.deepStrictEqual(shape(pieces), ['a 0-4 0/2', 'b 0-4 1/2'])
})

t('touching but not overlapping stays full height', () => {
  const pieces = layoutLanes([b('a', 'game', 0, 4), b('b', 'dgg', 4, 8)])
  assert.deepStrictEqual(shape(pieces), ['a 0-4 0/1', 'b 4-8 0/1'])
})

t('a short block inside a long one notches it rather than halving all of it', () => {
  // Twenty minutes of dgg in the middle of a long game is no reason for the
  // game to be half height for its whole length.
  const pieces = layoutLanes([b('g', 'game', 0, 20), b('d', 'dgg', 8, 10)])
  assert.deepStrictEqual(shape(pieces),
    ['d 8-10 1/2', 'g 0-8 0/1', 'g 10-20 0/1', 'g 8-10 0/2'])
})

t('the shelf a short block sits in is a block wider at each end', () => {
  // A notch exactly the width of a ten-minute block reads as a spike. One
  // block of room at each end makes it a shelf the day made room in.
  //
  // Which only shows on a block that has somewhere to be moved to: music has
  // to give up a third of the bar for the walk, and does so a block early and
  // takes it back a block late. Sleep is on top throughout and never moves,
  // so nothing about it is cut.
  const blocks = [b('s', 'sleep', 0, 20), b('m', 'music', 0, 20), b('d', 'dgg', 9, 10)]
  const music = layoutLanes(blocks).filter((p) => p.block.id === 'm')
  assert.deepStrictEqual(music.map((p) => p.from + '-' + p.to + ' ' + p.lane + '/' + p.lanes),
    ['0-8 1/2', '8-11 1/3', '11-20 1/2'])
  const dgg = layoutLanes(blocks).find((p) => p.block.id === 'd')
  assert.deepStrictEqual([dgg.from, dgg.to], [9, 10], 'the block keeps its own times')
})

t('a block covered in two places is notched twice and whole in between', () => {
  const pieces = layoutLanes([
    b('g', 'game', 0, 20), b('d', 'dgg', 4, 6), b('y', 'youtube', 12, 14),
  ])
  const game = pieces.filter((p) => p.block.id === 'g')
  assert.deepStrictEqual(game.map((p) => p.from + '-' + p.to + ' of ' + p.lanes),
    ['0-4 of 1', '4-6 of 2', '6-12 of 1', '12-14 of 2', '14-20 of 1'])
  // Still one block: only the outer ends are rounded and carry the handles.
  assert.deepStrictEqual([game[0].isFirst, game[game.length - 1].isLast], [true, true])
})

t('painting a different tag stacks instead of trimming', () => {
  const out = applyPaint([b('g', 'game', 0, 12)], b('d', 'dgg', 4, 8))
  assert.strictEqual(out.length, 2)
  assert.deepStrictEqual(out.map((x) => [x.tag, x.startSlot, x.endSlot]),
    [['game', 0, 12], ['dgg', 4, 8]])
})

t('a merge keeps the surviving block in its original place in the order', () => {
  const out = applyPaint(
    [b('g', 'game', 0, 12), b('d', 'dgg', 20, 24)],
    b('n', 'game', 12, 16),
  )
  assert.deepStrictEqual(out.map((x) => x.tag), ['game', 'dgg'], 'game must not jump to the end')
})

// Painting says where it goes: `at` is the slot the pointer went down on and
// the lane that height came out as.
t('painting in the upper half puts the new block on top', () => {
  const out = applyPaint([b('g', 'game', 0, 12)], b('m', 'music', 4, 8), { slot: 4, lane: 0 })
  assert.deepStrictEqual(lanesAt(layoutLanes(out), 5), { m: 0, g: 1 })
})

t('painting in the lower half puts the new block underneath', () => {
  const out = applyPaint([b('g', 'game', 0, 12)], b('m', 'music', 4, 8), { slot: 4, lane: 1 })
  assert.deepStrictEqual(lanesAt(layoutLanes(out), 5), { g: 0, m: 1 })
})

t('painting at the seam between two blocks lands between them', () => {
  const out = applyPaint(
    [b('g', 'game', 0, 12), b('d', 'dgg', 0, 12)],
    b('m', 'music', 4, 8),
    { slot: 4, lane: 1 },
  )
  assert.deepStrictEqual(lanesAt(layoutLanes(out), 5), { g: 0, m: 1, d: 2 })
})

t('a block painted on top stays on top when it is dragged wider', () => {
  const painted = applyPaint(
    [b('g', 'game', 0, 12), b('d', 'dgg', 16, 24)],
    b('m', 'music', 4, 8),
    { slot: 4, lane: 0 },
  )
  const out = applyResize(painted, 'm', 4, 20)
  assert.deepStrictEqual(lanesAt(layoutLanes(out), 5), { m: 0, g: 1 }, 'still over game')
  assert.deepStrictEqual(lanesAt(layoutLanes(out), 18), { m: 0, d: 1 }, 'and over dgg too')
})

t('where you painted it survives a save and reload', () => {
  const painted = applyPaint([b('g', 'game', 0, 12)], b('m', 'music', 4, 8), { slot: 4, lane: 0 })
  const reloaded = deserialise(serialise(painted))
  assert.deepStrictEqual(reloaded.map((x) => x.tag), ['music', 'game'])
})

t('a block wedged between two others keeps its place when resized', () => {
  const start = [
    b('a', 'game', 0, 20), b('n', 'music', 0, 20), b('c', 'dgg', 0, 20), b('d', 'anime', 24, 28),
  ]
  const out = applyResize(start, 'n', 0, 30)
  assert.deepStrictEqual(lanesAt(layoutLanes(out), 5), { a: 0, n: 1, c: 2 }, 'still the middle one')
})

t('dragging a lone block onto another tucks it underneath', () => {
  // nothing is stacked with music yet, so it has no height to keep
  const start = [b('m', 'music', 0, 8), b('d', 'dgg', 20, 30)]
  const out = applyResize(start, 'm', 0, 24)
  assert.deepStrictEqual(lanesAt(layoutLanes(out), 22), { d: 0, m: 1 })
})

t('dragging a block that sits underneath keeps it underneath', () => {
  // music is under game; dragged right across dgg it must stay the lower one
  const start = [b('g', 'game', 0, 12), b('m', 'music', 8, 20), b('d', 'dgg', 30, 40)]
  const out = applyResize(start, 'm', 8, 34)
  assert.deepStrictEqual(lanesAt(layoutLanes(out), 10), { g: 0, m: 1 }, 'still under game')
  assert.deepStrictEqual(lanesAt(layoutLanes(out), 32), { d: 0, m: 1 }, 'and under dgg too')
})

t('dragging a block that sits on top keeps it on top', () => {
  // game is over music; dragged right across dgg it must stay the upper one
  const start = [b('g', 'game', 0, 12), b('m', 'music', 8, 20), b('d', 'dgg', 30, 40)]
  const out = applyResize(start, 'g', 0, 34)
  assert.deepStrictEqual(lanesAt(layoutLanes(out), 10), { g: 0, m: 1 }, 'still over music')
  assert.deepStrictEqual(lanesAt(layoutLanes(out), 32), { g: 0, d: 1 }, 'and over dgg too')
})

t('painting the same tag over itself merges', () => {
  const out = applyPaint([b('g', 'game', 0, 8)], b('n', 'game', 6, 14))
  assert.strictEqual(out.length, 1)
  assert.deepStrictEqual([out[0].startSlot, out[0].endSlot], [0, 14])
})

t('merging same-tag blocks keeps their notes', () => {
  const out = applyPaint([b('g', 'game', 0, 8, 'first half')], b('n', 'game', 8, 14))
  assert.strictEqual(out[0].note, 'first half')

  const two = applyPaint(
    [b('a', 'game', 0, 4, 'one'), b('b', 'game', 6, 10, 'two')],
    b('n', 'game', 4, 6),
  )
  assert.strictEqual(two.length, 1)
  assert.strictEqual(two[0].note, 'one\ntwo')
})

t('resize no longer eats its neighbour', () => {
  const out = applyResize([b('g', 'game', 0, 4), b('d', 'dgg', 6, 10)], 'g', 0, 8)
  assert.strictEqual(out.length, 2)
  // order is stacking order, so the dragged block is last; check contents
  const byId = Object.fromEntries(out.map((x) => [x.id, [x.startSlot, x.endSlot]]))
  assert.deepStrictEqual(byId, { g: [0, 8], d: [6, 10] })
})

t('cluster is the same whichever member you click', () => {
  const blocks = [b('g', 'game', 0, 12), b('d', 'dgg', 4, 8), b('far', 'walk', 20, 24)]
  const fromGame = overlapCluster(blocks, 'g').map((x) => x.id)
  const fromDgg = overlapCluster(blocks, 'd').map((x) => x.id)
  assert.deepStrictEqual(fromGame, ['g', 'd'])
  assert.deepStrictEqual(fromDgg, ['g', 'd'])
})

t('cluster follows a chain of overlaps', () => {
  // a overlaps b, b overlaps c, a and c do not touch
  const blocks = [b('a', 'game', 0, 6), b('b', 'dgg', 4, 12), b('c', 'anime', 10, 16)]
  for (const id of ['a', 'b', 'c']) {
    assert.deepStrictEqual(overlapCluster(blocks, id).map((x) => x.id), ['a', 'b', 'c'])
  }
})

t('a block with nothing around it is its own cluster', () => {
  const blocks = [b('a', 'game', 0, 4), b('b', 'dgg', 8, 12)]
  assert.deepStrictEqual(overlapCluster(blocks, 'a').map((x) => x.id), ['a'])
})

t('the cluster reads in time order, not list order', () => {
  const blocks = [b('late', 'dgg', 4, 8), b('early', 'game', 0, 12)]
  assert.strictEqual(overlapCluster(blocks, 'late')[0].id, 'early')
})

t('empty day lays out to nothing', () => {
  assert.deepStrictEqual(layoutLanes([]), [])
  assert.deepStrictEqual(overlapCluster([], 'x'), [])
})

t('every piece stays inside its block and covers it exactly once', () => {
  const blocks = [
    b('a', 'game', 0, 20), b('b', 'dgg', 4, 10), b('c', 'anime', 8, 14), b('d', 'walk', 30, 40),
  ]
  for (const block of blocks) {
    const mine = layoutLanes(blocks)
      .filter((p) => p.block.id === block.id)
      .sort((x, y) => x.from - y.from)
    assert.strictEqual(mine[0].from, block.startSlot, `${block.id} starts late`)
    assert.strictEqual(mine[mine.length - 1].to, block.endSlot, `${block.id} ends early`)
    for (let i = 1; i < mine.length; i++) {
      assert.strictEqual(mine[i].from, mine[i - 1].to, `${block.id} has a gap or overlap`)
    }
  }
})

// --- painting a stretch that runs past midnight ---------------------------

/** compact view of spans: "date start-end" */
const spans = (list) => list.map((s) => `${s.date} ${s.startSlot}-${s.endSlot}`)

t('a stretch inside one day is one span', () => {
  assert.deepEqual(
    spans(paintSpans('2026-08-26', 60, '2026-08-26', 89)),
    ['2026-08-26 60-90'],
  )
})

t('a single slot is one span one slot long', () => {
  assert.deepEqual(
    spans(paintSpans('2026-08-26', 60, '2026-08-26', 60)),
    ['2026-08-26 60-61'],
  )
})

t('dragged backwards inside a day reads the same stretch', () => {
  assert.deepEqual(
    paintSpans('2026-08-26', 89, '2026-08-26', 60),
    paintSpans('2026-08-26', 60, '2026-08-26', 89),
  )
})

t('a stretch onto the next day is cut at midnight', () => {
  // 23:00 through to 07:00, which is what sleep actually looks like
  assert.deepEqual(
    spans(paintSpans('2026-08-26', 138, '2026-08-27', 41)),
    ['2026-08-26 138-144', '2026-08-27 0-42'],
  )
})

t('dragged back from the next day is the same two spans', () => {
  assert.deepEqual(
    paintSpans('2026-08-27', 41, '2026-08-26', 138),
    paintSpans('2026-08-26', 138, '2026-08-27', 41),
  )
})

t('the days in the middle of a long stretch are whole', () => {
  assert.deepEqual(
    spans(paintSpans('2026-08-26', 100, '2026-08-29', 20)),
    ['2026-08-26 100-144', '2026-08-27 0-144', '2026-08-28 0-144', '2026-08-29 0-21'],
  )
})

t('every span is a real stretch, and they join end to end', () => {
  const list = paintSpans('2026-08-26', 138, '2026-08-28', 41)
  for (const s of list) {
    assert.ok(s.endSlot > s.startSlot, s.date + ' is empty')
    assert.ok(s.startSlot >= 0 && s.endSlot <= SLOTS_PER_DAY, s.date + ' leaves the day')
  }
  for (let i = 1; i < list.length; i++) {
    assert.equal(list[i - 1].endSlot, SLOTS_PER_DAY, 'runs to midnight')
    assert.equal(list[i].startSlot, 0, 'picks up at midnight')
  }
})

t('a stretch ending at midnight itself does not open an empty day', () => {
  // released on the last slot of the day it started on
  assert.deepEqual(
    spans(paintSpans('2026-08-26', 138, '2026-08-26', 143)),
    ['2026-08-26 138-144'],
  )
})

// --- meeting your own tag, and choosing a height while sliding ------------

t('sliding a block until it touches the same tag merges them', () => {
  const day = [b('a', 'youtube', 60, 72), b('b', 'youtube', 90, 102)]
  // b slid back so it starts exactly where a ends
  const after = applyResize(day, 'b', 72, 84)
  assert.equal(after.length, 1)
  assert.deepEqual([after[0].startSlot, after[0].endSlot], [60, 84])
})

t('overlapping the same tag merges too', () => {
  const day = [b('a', 'youtube', 60, 72), b('b', 'youtube', 90, 102)]
  const after = applyResize(day, 'b', 66, 78)
  assert.equal(after.length, 1)
  assert.deepEqual([after[0].startSlot, after[0].endSlot], [60, 78])
})

t('a different tag brought alongside is left alone', () => {
  const day = [b('a', 'youtube', 60, 72), b('b', 'music', 90, 102)]
  assert.equal(applyResize(day, 'b', 72, 84).length, 2)
})

t('dragging an edge into the same tag merges it as well', () => {
  const day = [b('a', 'youtube', 60, 72), b('b', 'youtube', 90, 102)]
  const after = applyResize(day, 'a', 60, 90) // a stretched out to meet b
  assert.equal(after.length, 1)
  assert.deepEqual([after[0].startSlot, after[0].endSlot], [60, 102])
})

t('merging keeps what was written on both', () => {
  const day = [b('a', 'youtube', 60, 72, 'first'), b('b', 'youtube', 90, 102, 'second')]
  const after = applyResize(day, 'b', 72, 84)
  assert.equal(after.length, 1)
  assert.ok(after[0].note.includes('first') && after[0].note.includes('second'))
})

t('slid onto the upper half, a block lands on top', () => {
  const day = [b('a', 'dgg', 60, 90), b('b', 'music', 0, 20)]
  const after = applyResize(day, 'b', 66, 78, { slot: 66, lane: 0 })
  assert.equal(layoutLanes(after).find((p) => p.block.id === 'b').lane, 0)
})

t('slid onto the lower half, the same block lands underneath', () => {
  const day = [b('a', 'dgg', 60, 90), b('b', 'music', 0, 20)]
  const after = applyResize(day, 'b', 66, 78, { slot: 66, lane: 1 })
  assert.equal(layoutLanes(after).find((p) => p.block.id === 'b').lane, 1)
})

t('dragging an edge still cannot change the height', () => {
  const day = [b('a', 'dgg', 60, 90), b('b', 'music', 66, 78)]
  const before = layoutLanes(day).find((p) => p.block.id === 'b').lane
  const after = applyResize(day, 'b', 66, 84)
  assert.equal(layoutLanes(after).find((p) => p.block.id === 'b').lane, before)
})

// --- games: two Game blocks are not always the same thing -----------------

const g = (id, name, startSlot, endSlot, cover = '') =>
  ({ ...b(id, 'game', startSlot, endSlot), game: name, cover })

t('two stretches of the same game still fold together', () => {
  const day = [g('a', 'Elden Ring', 60, 72), g('c', 'Elden Ring', 74, 90)]
  const after = applyResize(day, 'c', 72, 90)
  assert.equal(after.length, 1)
  assert.deepStrictEqual([after[0].startSlot, after[0].endSlot, after[0].game],
    [60, 90, 'Elden Ring'])
})

t('two different games do not, however much they touch', () => {
  // The reason the merge asks about more than the tag: finishing one game and
  // starting another is two things, and they are both tagged Game.
  const day = [g('a', 'Elden Ring', 60, 72), g('c', 'Hades', 72, 84)]
  const after = applyResize(day, 'c', 70, 84)
  assert.equal(after.length, 2)
  assert.deepStrictEqual(after.map((x) => x.game).sort(), ['Elden Ring', 'Hades'])
})

t('a game nobody has named does not fold into a named one', () => {
  // There is no way to know it was the same game, and guessing would put a
  // name on time that was not spent there.
  const day = [g('a', 'Elden Ring', 60, 72), b('c', 'game', 72, 84)]
  const after = applyResize(day, 'c', 72, 90)
  assert.equal(after.length, 2)
})

t('two unnamed Game blocks still fold together, as they always did', () => {
  const after = applyResize([b('a', 'game', 60, 72), b('c', 'game', 74, 84)], 'c', 70, 84)
  assert.equal(after.length, 1)
})

t('naming a block says what it was', () => {
  const after = setGame([b('a', 'game', 60, 72)], 'a', { name: 'Hades', cover: 'hades-1.jpg' })
  assert.deepStrictEqual([after[0].game, after[0].cover], ['Hades', 'hades-1.jpg'])
})

t('naming a block folds it into the same game beside it', () => {
  const day = [g('a', 'Hades', 60, 72), b('c', 'game', 72, 84)]
  const after = setGame(day, 'c', { name: 'Hades', cover: 'hades-1.jpg' })
  assert.equal(after.length, 1)
  assert.deepStrictEqual([after[0].id, after[0].startSlot, after[0].endSlot], ['a', 60, 84])
})

t('taking the name back off leaves the block where it was', () => {
  const after = setGame([g('a', 'Hades', 60, 72, 'hades-1.jpg')], 'a', null)
  assert.equal(after.length, 1)
  assert.deepStrictEqual([after[0].game, after[0].cover, after[0].startSlot], ['', '', 60])
})

t('the game and its cover survive the round trip', () => {
  const written = serialise([g('a', 'Elden Ring', 60, 72, 'elden-ring-326243.jpg')])
  assert.deepStrictEqual(written, [{
    tag: 'game', start: '10:00', end: '12:00',
    game: 'Elden Ring', cover: 'elden-ring-326243.jpg',
  }])
  const back = deserialise(written)
  assert.deepStrictEqual([back[0].game, back[0].cover], ['Elden Ring', 'elden-ring-326243.jpg'])
})

t('a cover with no game is not written — it would mean nothing on its own', () => {
  assert.deepStrictEqual(serialise([g('a', '', 60, 72, 'stray.jpg')]),
    [{ tag: 'game', start: '10:00', end: '12:00' }])
})

t('a day written before any of this reads back with no game', () => {
  const back = deserialise([{ tag: 'game', start: '10:00', end: '12:00' }])
  assert.deepStrictEqual([back[0].game, back[0].cover], ['', ''])
})

// --- anime: the same again, plus which episodes ---------------------------

const a = (id, show, startSlot, endSlot, episodes = [], cover = '') =>
  ({ ...b(id, 'anime', startSlot, endSlot), show, episodes, cover })

t('two stretches of the same show fold together', () => {
  const day = [a('a', 'Frieren', 120, 126, [1]), a('c', 'Frieren', 128, 138, [2])]
  const after = applyResize(day, 'c', 126, 138)
  assert.equal(after.length, 1)
  assert.deepStrictEqual([after[0].startSlot, after[0].endSlot, after[0].show],
    [120, 138, 'Frieren'])
})

t('and the episodes join up rather than one evening losing half of itself', () => {
  const day = [a('a', 'Frieren', 120, 126, [1, 2]), a('c', 'Frieren', 128, 138, [3])]
  const after = applyResize(day, 'c', 126, 138)
  assert.deepStrictEqual(after[0].episodes, [1, 2, 3])
})

t('two different shows do not fold, however much they touch', () => {
  const day = [a('a', 'Frieren', 120, 126, [1]), a('c', 'Dandadan', 126, 132, [1])]
  const after = applyResize(day, 'c', 124, 132)
  assert.equal(after.length, 2)
})

t('a show nobody has named does not fold into a named one', () => {
  const day = [a('a', 'Frieren', 120, 126, [1]), a('c', '', 126, 132)]
  const after = applyResize(day, 'c', 126, 138)
  assert.equal(after.length, 2)
})

t('naming a block says what was watched, and which of it', () => {
  const day = [a('a', '', 120, 132)]
  const after = setShow(day, 'a', { name: 'Frieren', cover: 'frieren-154587.jpg', episodes: [7, 5, 6] })
  assert.deepStrictEqual(
    [after[0].show, after[0].cover, after[0].episodes],
    ['Frieren', 'frieren-154587.jpg', [5, 6, 7]],
  )
})

t('changing to another show drops the episodes with it', () => {
  // Episode 7 of one thing is not episode 7 of another, and carrying the
  // numbers across would be a quiet lie about the evening.
  const day = [a('a', 'Frieren', 120, 132, [5, 6, 7])]
  const after = setShow(day, 'a', { name: 'Dandadan', cover: '', episodes: [] })
  assert.deepStrictEqual([after[0].show, after[0].episodes], ['Dandadan', []])
})

t('taking the show back off leaves the block where it was', () => {
  const day = [a('a', 'Frieren', 120, 132, [5])]
  const after = setShow(day, 'a', null)
  assert.equal(after.length, 1)
  assert.deepStrictEqual(
    [after[0].show, after[0].episodes, after[0].startSlot, after[0].endSlot],
    ['', [], 120, 132],
  )
})

t('the show, its episodes and its cover survive the round trip', () => {
  const written = serialise([a('a', 'Frieren', 120, 132, [5, 6, 7], 'frieren-154587.jpg')])
  assert.deepStrictEqual(written, [{
    tag: 'anime', start: '20:00', end: '22:00',
    show: 'Frieren', episodes: [5, 6, 7], cover: 'frieren-154587.jpg',
  }])
  const back = deserialise(written)
  assert.deepStrictEqual([back[0].show, back[0].episodes], ['Frieren', [5, 6, 7]])
})

t('episodes with no show are not written — they would number nothing', () => {
  assert.deepStrictEqual(serialise([a('a', '', 120, 132, [5, 6])]),
    [{ tag: 'anime', start: '20:00', end: '22:00' }])
})

t('a day written before any of this reads back with no show', () => {
  const back = deserialise([{ tag: 'anime', start: '20:00', end: '22:00' }])
  assert.deepStrictEqual([back[0].show, back[0].episodes], ['', []])
})

// --- snipping, and what a cut survives -------------------------------------

const span = (x) => `${x.id ?? '?'} ${x.startSlot}-${x.endSlot}`
/** [start, end] of each block, earliest first: list order is only stacking. */
const times = (list) => list.map((x) => [x.startSlot, x.endSlot]).sort((p, q) => p[0] - q[0])

t('a snipped hour is two half hours, side by side', () => {
  const day = [a('w', 'Frieren', 120, 126, [3, 4])]
  const after = snipBlock(day, 'w', 123)
  assert.equal(after.length, 2)
  assert.deepStrictEqual(after.map((x) => [x.startSlot, x.endSlot, x.show]), [[120, 123, 'Frieren'], [123, 126, 'Frieren']])
  assert.deepStrictEqual(after.map((x) => x.episodes), [[3, 4], [3, 4]], 'both halves keep all of what it was')
  assert.equal(after[0].id, 'w', 'the first half is the block it was')
  assert.notEqual(after[1].id, 'w', 'and the second is a block of its own')
  assert.ok(after[0].episodes !== after[1].episodes, 'each with its own list, so saying one does not say both')
})

t('a snip at either end, or outside the block, cuts nothing', () => {
  const day = [b('w', 'walk', 10, 20)]
  for (const at of [10, 20, 5, 30]) assert.strictEqual(snipBlock(day, 'w', at), day)
})

t('the second half stacks where the block did', () => {
  const day = [b('top', 'music', 0, 30), b('w', 'walk', 10, 20), b('low', 'food', 0, 30)]
  const after = snipBlock(day, 'w', 15)
  assert.deepStrictEqual(after.map((x) => x.tag), ['music', 'walk', 'walk', 'food'])
})

t('two halves survive a save and reload, and stay two', () => {
  const day = snipBlock([b('w', 'anime', 120, 126)], 'w', 123)
  const back = deserialise(serialise(day))
  assert.equal(back.length, 2)
  assert.deepStrictEqual([...cutsOf(back)], ['anime||@123'])
})

t('dragging the outer edge of one half leaves the cut where it is', () => {
  const day = snipBlock([b('w', 'anime', 120, 126)], 'w', 123)
  const after = applyResize(day, 'w', 114, 123)
  assert.deepStrictEqual(times(after), [[114, 123], [123, 126]])
})

t('dragging the cut itself moves it, and the other half follows', () => {
  const day = snipBlock([b('w', 'anime', 120, 126)], 'w', 123)
  const later = applyResize(day, 'w', 120, 125)
  assert.deepStrictEqual(times(later), [[120, 125], [125, 126]])
  const earlier = applyResize(day, day[1].id, 121, 126)
  assert.deepStrictEqual(times(earlier), [[120, 121], [121, 126]])
})

t('but never so far that the other half is gone', () => {
  const day = snipBlock([b('w', 'anime', 120, 126)], 'w', 123)
  const after = applyResize(day, 'w', 120, 140)
  assert.deepStrictEqual(times(after), [[120, 125], [125, 126]])
})

t('sliding one half up or down a lane keeps the cut', () => {
  const day = [b('m', 'music', 100, 140), ...snipBlock([b('w', 'anime', 120, 126)], 'w', 123)]
  const after = applyResize(day, 'w', 120, 123, { slot: 121, lane: 0 })
  assert.equal(after.filter((x) => x.tag === 'anime').length, 2)
})

t('saying which episodes each half was keeps them halves', () => {
  const day = snipBlock([a('w', 'Frieren', 120, 126, [3, 4])], 'w', 123)
  const once = setShow(day, 'w', { name: 'Frieren', episodes: [3] })
  const twice = setShow(once, day[1].id, { name: 'Frieren', episodes: [4] })
  assert.deepStrictEqual(twice.map((x) => x.episodes), [[3], [4]])
})

t('painting up to a cut grows that half and leaves the other', () => {
  const day = snipBlock([b('w', 'anime', 120, 126)], 'w', 123)
  const after = applyPaint(day, b('p', 'anime', 114, 123))
  assert.deepStrictEqual(after.map((x) => [x.startSlot, x.endSlot]), [[114, 123], [123, 126]])
})

t('painting across a cut heals it, with nothing written twice', () => {
  const day = snipBlock([b('w', 'anime', 120, 126, 'with Sam')], 'w', 123)
  const after = applyPaint(day, b('p', 'anime', 122, 124))
  assert.equal(after.length, 1)
  assert.deepStrictEqual([after[0].startSlot, after[0].endSlot, after[0].note], [120, 126, 'with Sam'])
})

t('a stretch brought up against a half from elsewhere still joins it', () => {
  const day = [...snipBlock([b('w', 'anime', 120, 126)], 'w', 123), b('x', 'anime', 130, 136)]
  const after = applyResize(day, 'x', 126, 136)
  assert.deepStrictEqual(after.map((x) => [x.startSlot, x.endSlot]), [[120, 123], [123, 136]])
})

t('a cut edge knows its other half, and an ordinary edge has none', () => {
  const day = snipBlock([b('w', 'anime', 120, 126)], 'w', 123)
  assert.equal(cutPartner(day, 'w', 'end')?.id, day[1].id)
  assert.equal(cutPartner(day, 'w', 'start'), null)
})

// --- moving and pasting several blocks at once ---------------------------

t('blocks moved together all go the same way', () => {
  const byDate = { d1: [b('x', 'walk', 10, 20), b('y', 'food', 30, 33), b('z', 'game', 50, 60)] }
  const out = moveBlocks(byDate, [{ date: 'd1', id: 'x' }, { date: 'd1', id: 'y' }], { slots: 6 })
  assert.deepStrictEqual(out.d1.map(span), ['x 16-26', 'y 36-39', 'z 50-60'])
})

t('a group slid against midnight stops there as a whole', () => {
  const byDate = { d1: [b('x', 'walk', 100, 120), b('y', 'food', 130, 140)] }
  const out = moveBlocks(byDate, [{ date: 'd1', id: 'x' }, { date: 'd1', id: 'y' }], { slots: 30 })
  assert.deepStrictEqual(out.d1.map(span), ['x 104-124', 'y 134-144'])
})

t('two halves moved together stay two halves', () => {
  const byDate = { d1: snipBlock([b('w', 'anime', 120, 126)], 'w', 123) }
  const picks = byDate.d1.map((x) => ({ date: 'd1', id: x.id }))
  const out = moveBlocks(byDate, picks, { slots: -12 })
  assert.deepStrictEqual(out.d1.map((x) => [x.startSlot, x.endSlot]), [[108, 111], [111, 114]])
})

t('a moved block that lands on the same thing joins it', () => {
  const byDate = { d1: [b('x', 'walk', 10, 20), b('y', 'walk', 30, 40)] }
  const out = moveBlocks(byDate, [{ date: 'd1', id: 'y' }], { slots: -10 })
  assert.deepStrictEqual(out.d1.map(span), ['x 10-30'])
})

t('blocks can be moved to another day, and leave the one they were on', () => {
  const byDate = {
    '2026-10-01': [b('x', 'walk', 10, 20), b('k', 'food', 0, 5)],
    '2026-10-02': [b('m', 'music', 0, 50)],
  }
  const out = moveBlocks(byDate, [{ date: '2026-10-01', id: 'x' }], { days: 1, slots: 0 })
  assert.deepStrictEqual(out['2026-10-01'].map(span), ['k 0-5'])
  assert.deepStrictEqual(out['2026-10-02'].map(span), ['m 0-50', 'x 10-20'])
})

t('a day they cannot land on stops the whole move', () => {
  const byDate = { '2026-10-01': [b('x', 'walk', 10, 20)] }
  assert.strictEqual(moveBlocks(byDate, [{ date: '2026-10-01', id: 'x' }], { days: 1 }), null)
})

t('a pasted group keeps its spacing, starting where it is put', () => {
  const items = [
    { at: 60, slots: 6, tag: 'walk', note: '', game: '', show: '', episodes: [], cover: '' },
    { at: 72, slots: 3, tag: 'food', note: 'soup', game: '', show: '', episodes: [], cover: '' },
  ]
  const { days, placed } = pasteBlocks({ '2026-10-02': [] }, items, '2026-10-02', 90)
  assert.deepStrictEqual(days['2026-10-02'].map((x) => [x.tag, x.startSlot, x.endSlot, x.note]),
    [['walk', 90, 96, ''], ['food', 102, 105, 'soup']])
  assert.equal(placed.length, 2)
})

t('a pasted group carries on past midnight into the next day', () => {
  const items = [
    { at: 130, slots: 6, tag: 'game', note: '', game: '', show: '', episodes: [], cover: '' },
    { at: 160, slots: 12, tag: 'sleep', note: '', game: '', show: '', episodes: [], cover: '' },
  ]
  const { days } = pasteBlocks({ '2026-10-02': [], '2026-10-03': [] }, items, '2026-10-02', 120)
  assert.deepStrictEqual(days['2026-10-02'].map((x) => [x.startSlot, x.endSlot]), [[120, 126]])
  assert.deepStrictEqual(days['2026-10-03'].map((x) => [x.startSlot, x.endSlot]), [[6, 18]])
})

// --- A block steps up or down in two, never through a thin neck ---

/** Every block's top and bottom at one moment, as drawn: { id: [top, bottom] }. */
const edgesAt = (pieces, slot) => {
  const here = pieces.filter((p) => p.from <= slot && p.to > slot)
    .sort((x, y) => x.lane / x.lanes - y.lane / y.lanes)
  return Object.fromEntries(here.map((p, i) => [p.block.id,
    [p.lane / p.lanes, here[i + 1] ? here[i + 1].lane / here[i + 1].lanes : 1]]))
}

/** Whether any block has both edges move the same way at once anywhere. */
const pinched = (pieces) => {
  // Two bands of a block that meet in less than half the thinner one, either
  // side by side or with ten minutes of the whole bar between them.
  const thin = ([a1, a2], [b1, b2]) => ((b1 < a1 && b2 < a2) || (b1 > a1 && b2 > a2))
    && Math.min(a2, b2) - Math.max(a1, b1) < Math.min(a2 - a1, b2 - b1) / 2 - 1e-9
  for (let slot = 1; slot < SLOTS_PER_DAY; slot++) {
    const was = edgesAt(pieces, slot - 1)
    const now = edgesAt(pieces, slot)
    const next = edgesAt(pieces, slot + 1)
    for (const id of Object.keys(now)) {
      if (!was[id]) continue
      if (thin(was[id], now[id])) return `${id} at slot ${slot}`
      const column = now[id][0] === 0 && now[id][1] === 1
      if (column && next[id] && thin(was[id], next[id])) return `${id} round slot ${slot}`
    }
  }
  return null
}

t('when the top block stops, the middle one rises before the bottom one does', () => {
  // Three thirds become two halves at 12. Youtube takes the top of the bar at
  // once, and the grey block under it follows ten minutes later — so Youtube
  // is never squeezed into the sliver where its old third and new half meet.
  const day = [b('p', 'anime', 0, 12), b('y', 'youtube', 0, 24), b('g', 'game', 0, 24)]
  assert.deepStrictEqual(seen(day, 'y'), ['0-12 0.3333333333333333..0.6666666666666666',
    '12-13 0..0.6666666666666666', '13-24 0..0.5'])
  assert.deepStrictEqual(seen(day, 'g'), ['0-13 0.6666666666666666..1', '13-24 0.5..1'])
  assert.strictEqual(pinched(layoutLanes(day)), null)
})

t('when a block arrives on top, the bottom one makes way first', () => {
  const day = [b('p', 'anime', 12, 24), b('y', 'youtube', 0, 24), b('g', 'game', 0, 24)]
  assert.deepStrictEqual(seen(day, 'y'), ['0-11 0..0.5', '11-12 0..0.6666666666666666',
    '12-24 0.3333333333333333..0.6666666666666666'])
  assert.deepStrictEqual(seen(day, 'g'), ['0-11 0.5..1', '11-24 0.6666666666666666..1'])
  assert.strictEqual(pinched(layoutLanes(day)), null)
})

t('a block slipped in between pushes the one under it down without a neck', () => {
  const day = [b('a', 'anime', 0, 24), b('x', 'walk', 12, 24), b('y', 'youtube', 0, 24), b('g', 'game', 0, 24)]
  assert.strictEqual(pinched(layoutLanes(day)), null)
})

t('four deep losing its top steps down the bar without a neck', () => {
  const day = [b('p', 'anime', 0, 12), b('r', 'reading', 0, 24), b('y', 'youtube', 0, 24), b('g', 'game', 0, 24)]
  assert.strictEqual(pinched(layoutLanes(day)), null)
})

t('a ten-minute block on top leaves no neck either side of it', () => {
  const day = [b('m', 'food', 12, 13), b('y', 'youtube', 0, 24), b('g', 'game', 0, 24)]
  assert.strictEqual(pinched(layoutLanes(day)), null)
})

t('the block under it ending as one arrives on top makes a staircase, not a neck', () => {
  // DGG in the top half, the grey under it stops, and something arrives on
  // top: DGG has to end up in the bottom half. Grey gives up half its room
  // for its last ten minutes, and the new block takes only part of its room
  // for its first ten, so DGG goes down in steps.
  const same = [b('p', 'anime', 12, 24), b('d', 'dgg', 0, 24), b('g', 'game', 0, 12)]
  assert.deepStrictEqual(seen(same, 'd'), ['0-11 0..0.5', '11-12 0..0.75',
    '12-13 0.3333333333333333..1', '13-24 0.5..1'])
  assert.strictEqual(pinched(layoutLanes(same)), null)
})

t('ten minutes alone between the two is a step in the middle, not a column', () => {
  const later = [b('p', 'anime', 13, 24), b('d', 'dgg', 0, 24), b('g', 'game', 0, 12)]
  assert.deepStrictEqual(seen(later, 'd'), ['0-11 0..0.5', '11-12 0..0.75', '12-13 0..1',
    '13-14 0.25..1', '14-24 0.5..1'])
  assert.deepStrictEqual(seen(later, 'g'), ['0-11 0.5..1', '11-12 0.75..1'])
  assert.deepStrictEqual(seen(later, 'p'), ['13-14 0..0.25', '14-24 0..0.5'])
  assert.strictEqual(pinched(layoutLanes(later)), null)
  // And the other way round, climbing.
  const up = [b('p', 'anime', 0, 12), b('d', 'dgg', 0, 24), b('g', 'game', 13, 24)]
  assert.strictEqual(pinched(layoutLanes(up)), null)
})

t('half an hour alone in between is left as it is', () => {
  const day = [b('p', 'anime', 15, 24), b('d', 'dgg', 0, 24), b('g', 'game', 0, 12)]
  assert.deepStrictEqual(seen(day, 'd'), ['0-12 0..0.5', '12-15 0..1', '15-24 0.5..1'])
})

t('the step changes nothing where only one edge moves', () => {
  // The bottom block of three stopping: the others simply grow into the room
  // (ten minutes late, as they always did — the shelf after a block).
  const day = [b('p', 'anime', 0, 24), b('y', 'youtube', 0, 24), b('g', 'game', 0, 12)]
  assert.deepStrictEqual(shape(layoutLanes(day)),
    ['g 0-12 2/3', 'p 0-13 0/3', 'p 13-24 0/2', 'y 0-13 1/3', 'y 13-24 1/2'])
})

t('deeper always stacks over shallower, even counted in different lanes', () => {
  const day = [b('p', 'anime', 0, 12), b('y', 'youtube', 0, 24), b('g', 'game', 0, 24)]
  const pieces = layoutLanes(day)
  for (let slot = 0; slot < 24; slot++) {
    const here = pieces.filter((p) => p.from <= slot && p.to > slot)
      .sort((x, y) => x.lane / x.lanes - y.lane / y.lanes)
    for (let i = 1; i < here.length; i++) assert.ok(here[i].z > here[i - 1].z, `slot ${slot}`)
  }
})

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
