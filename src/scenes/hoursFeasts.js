// The feasts of Black Hours: the same days as festivals.js, written the way
// a book of hours wrote its calendar. There, the great feasts were the
// red-letter days — their names in red, or in gold, among the black — and each
// had its own little painting in the margin. Here each festival keeps its
// calendar name in Latin, the colours its initial is painted in, the plant
// its border grows on the day (and its bar is sprigged with all year), what
// falls across the page on the day itself, and a line for the head of the
// page.
//
// How it all looks is HoursFeasts.jsx and themes.css; when the days fall is
// festivals.js, shared with Starlit.

const LAPIS = '#27458f'
const VERMILION = '#c8352a'
const MALACHITE = '#2d6a43'
const VELLUM = '#f1ead8'
const GOLD = '#d6b05a'
const SABLE = '#141217'
const VIOLET = '#5b2f78'
const ROSE = '#c9718a'

const ROMAN = ['I', 'II', 'III', 'IV']
const ORDINAL_WORDS = [
  'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
  'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth',
  'eighteenth', 'nineteenth', 'twentieth',
]
/** "twenty-first", "forty-second" … for a year of someone's life. */
export function ordinalWord(n) {
  if (n >= 1 && n <= 20) return ORDINAL_WORDS[n - 1]
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
  const t = Math.floor(n / 10)
  const u = n % 10
  if (n < 100 && u === 0) return `${tens[t].slice(0, -1)}ieth`
  if (n < 100) return `${tens[t]}-${ORDINAL_WORDS[u - 1]}`
  const last = n % 10
  return `${n}${last === 1 && n % 100 !== 11 ? 'st' : last === 2 && n % 100 !== 12 ? 'nd' : last === 3 && n % 100 !== 13 ? 'rd' : 'th'}`
}

/**
 * Each feast.
 *
 *   latin    its name in the calendar; a function where it depends on which
 *            (the Sundays of Advent) — given the festival
 *   ground   the colours its day's initial is painted on, quartered like arms
 *   border   the plant of its border and its sprigs: `leaf` (ivy, holly,
 *            laurel, thorn), `paint` for the leaves (null is gold leaf; a
 *            colour, or 'silver', or 'motley' for every colour in turn),
 *            `bloom` for what flowers on it (flower, berry, rose, lily, star,
 *            bezant), and its `hues`; `edge` outlines painted leaves in a
 *            colour other than ink
 *   sky      what falls, rises or shines across the page on the day itself;
 *            null for a feast whose day brings a moving sky of its own
 *            (HoursSkies.jsx: bats, falling stars, fireflies)
 *   line     a few words for the head of the page on the day; a function
 *            where it depends on the festival
 */
export const FEASTS = {
  'christmas-eve': {
    latin: 'Vigilia Nativitatis',
    ground: [LAPIS, VELLUM],
    border: { leaf: 'holly', paint: MALACHITE, bloom: 'berry', hues: [VERMILION] },
    sky: 'snow',
    line: 'gold falls like snow on the eve of the Nativity',
  },
  advent: {
    latin: (f) => `Dominica ${ROMAN[(f.nth ?? 1) - 1]} Adventus`,
    // Violet for Advent, and rose for its third Sunday, the one of rejoicing.
    ground: (f) => (f.nth === 3 ? [ROSE, VIOLET] : [VIOLET, LAPIS]),
    border: { leaf: 'laurel', paint: MALACHITE, bloom: 'berry', hues: [VERMILION] },
    sky: 'embers',
    line: (f) => [
      'the first candle is lit',
      'two candles burn',
      'three candles burn; rejoice',
      'all four candles burn; the feast is near',
    ][(f.nth ?? 1) - 1],
  },
  halloween: {
    latin: 'Vigilia Omnium Sanctorum',
    ground: [SABLE, VERMILION],
    // Black thorns, edged in red so they show on the black page.
    border: { leaf: 'thorn', paint: SABLE, edge: VERMILION, bloom: 'berry', hues: [VERMILION] },
    sky: null,
    line: 'the Office of the Dead is read tonight',
  },
  easter: {
    latin: 'Pascha',
    ground: [VELLUM, GOLD],
    border: { leaf: 'ivy', paint: null, bloom: 'lily', hues: [VELLUM] },
    sky: 'petals',
    line: 'lilies in every margin; the morning is risen',
  },
  'st-nicholas': {
    latin: 'Sancti Nicolai',
    ground: [VERMILION, GOLD],
    border: { leaf: 'ivy', paint: null, bloom: 'bezant', hues: [GOLD] },
    sky: 'coins',
    line: 'three purses of gold, left in the night',
  },
  valentines: {
    latin: 'Sancti Valentini',
    ground: [VERMILION, ROSE],
    border: { leaf: 'ivy', paint: MALACHITE, bloom: 'rose', hues: [VERMILION, ROSE] },
    sky: 'hearts',
    line: 'roses in the margins, for every heart',
  },
  carnival: {
    latin: 'Carnisprivium',
    // Motley, quartered.
    ground: [LAPIS, VERMILION, MALACHITE, GOLD],
    border: { leaf: 'ivy', paint: 'motley', bloom: 'flower', hues: [LAPIS, VERMILION, MALACHITE] },
    sky: 'confetti',
    line: 'the fools are loose in the margins',
  },
  'new-years-eve': {
    latin: 'Sancti Silvestri',
    ground: [SABLE, LAPIS],
    border: { leaf: 'ivy', paint: null, bloom: 'star', hues: [GOLD] },
    sky: 'embers',
    line: 'the last leaf of the year',
  },
  'new-year': {
    latin: 'Kalendae Ianuariae',
    ground: [LAPIS, VELLUM],
    border: { leaf: 'laurel', paint: null, bloom: 'star', hues: [GOLD] },
    sky: 'stars',
    line: 'a new year, a fresh quire',
  },
  perseids: {
    latin: 'Lacrimae Sancti Laurentii',
    ground: [SABLE, GOLD],
    border: { leaf: 'ivy', paint: null, bloom: 'star', hues: [GOLD] },
    sky: null,
    line: 'the tears of St Lawrence are falling',
  },
  geminids: {
    latin: 'Stellae Geminorum',
    ground: [SABLE, LAPIS],
    border: { leaf: 'ivy', paint: 'silver', bloom: 'star', hues: ['#c9d4f2'] },
    sky: null,
    line: 'the Twins let fall their stars',
  },
  'longest-night': {
    latin: 'Solstitium Hiemale',
    ground: [SABLE, '#8f8b99'],
    border: { leaf: 'ivy', paint: 'silver', bloom: 'star', hues: ['#d8d5de'] },
    sky: 'stars',
    line: 'the longest night; keep the candle lit',
  },
  midsummer: {
    latin: 'Solstitium Aestivum',
    ground: [GOLD, MALACHITE],
    border: { leaf: 'ivy', paint: MALACHITE, bloom: 'flower', hues: ['#f0c43a'] },
    sky: null,
    line: "St John's fires burn on the shortest night",
  },
  birthday: {
    latin: 'Dies Natalis',
    ground: [VERMILION, LAPIS],
    border: { leaf: 'ivy', paint: MALACHITE, bloom: 'flower', hues: [VERMILION, LAPIS, VELLUM] },
    sky: 'confetti',
    line: (f) => {
      if (f.self) return f.age ? `your ${ordinalWord(f.age + 1)} year begins` : 'the day of your birth'
      return f.age ? `${f.person} is ${f.age} today` : `${f.person}'s day of birth`
    },
  },
  anniversary: {
    latin: 'Anniversarium',
    ground: [GOLD],
    border: { leaf: 'laurel', paint: null, bloom: 'bezant', hues: [GOLD], allGold: true },
    sky: 'stars',
    line: (f) => `${f.nth} ${f.nth === 1 ? 'year' : 'years'} of this book`,
  },
}

const ask = (value, festival) => (typeof value === 'function' ? value(festival) : value)

/** The Black Hours side of a festival from festivals.js, or null for one it does not keep. */
export function feastOf(festival) {
  const feast = festival && FEASTS[festival.id]
  if (!feast) return null
  return {
    id: festival.id,
    latin: ask(feast.latin, festival),
    ground: ask(feast.ground, festival),
    border: feast.border,
    sky: feast.sky,
    line: ask(feast.line, festival),
  }
}
