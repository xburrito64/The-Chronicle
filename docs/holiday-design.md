# Designing holidays for a theme

How feast days, birthdays and the anniversary are to be designed in The
Chronicle — for any theme, by anyone (person or agent) doing the work. The
owner of this app wants every theme's holidays to be **among the best things
in the app**: beautiful, surprising, fun to stumble on, and well made in every
detail. Read this before starting, and check the work against it before
calling it done.

Starlit (`src/scenes/Festive.jsx`, `StarScene.jsx`) and Black Hours
(`src/scenes/HoursFeasts.jsx`, `HoursFeastBars.jsx`, `HoursDays.jsx`,
`HoursSkies.jsx`) are the two finished examples. Study both. Do not copy
either.

---

## What a "holiday" is here

- **The festivals** in `src/scenes/festivals.js`: Christmas Eve, the four
  Sundays of Advent, Halloween, Easter, St. Nicholas, Valentine's Day,
  Carnival, New Year's Eve, New Year's Day, the Perseids, the Geminids,
  Midsummer, the Longest Night. Some move every year (Easter, Advent,
  Carnival, the solstices). Their dates are shared by every theme; only the
  look belongs to the theme.
- **Birthdays**, from Settings → Birthdays: someone else's or your own, with
  or without a birth year (with a year the name says which one — "Mum's
  52nd birthday"), and possibly several on one day.
- **The anniversary** of the first day anything was logged.
- **Two at once** happens: Advent's second Sunday is St. Nicholas in 2026, a
  birthday can fall on Halloween. The first one leads; the others join in
  (`festival.also`). Design so that combinations still look intended.

---

## What every holiday needs, in every theme

### 1. In the list, all year round

Wherever the day appears in the list — weeks ahead or years back — it must be
recognisably that holiday at a glance.

- **The day's heading**: the date treated specially, a small mark or painting
  beside it that is that holiday's own, and its name. Black Hours, for
  example, writes the Latin calendar name in red beside a margin painting.
- **The bar**: this is where the first Black Hours attempt failed — small
  corner decorations that all looked alike were "barely visible and too
  samey". The bar needs:
  - a **ground** under the blocks, showing through wherever the day is empty
    (a pattern, a wash of colour, a starfield) — different for each holiday;
  - **large pieces at the ends** of the bar, the full height of it, over the
    blocks *and* their names, covers and icons — the owner wants the
    painting in front of everything on the bar (only the grab strips stay
    above it). So leave room: keep the pieces to the ends and edges, and
    let the middle of the bar, where names usually sit, show through;
  - on holidays where it suits, something **across the whole bar** (rays,
    streaks of falling stars, flags, a scroll with a name).
- **The Overview row** (a few pixels tall): at least a coloured date and a
  tinted ground, so feast days stand out when scanning months.

### 2. On the day itself

The whole page joins in. This is the part people remember.

- **A greeting** shortly after the app opens: the holiday's picture, its name
  and a line of its own, in the theme's voice. It goes away on its own after
  several seconds, and on a click.
- **A scene that is that holiday's alone**, made of the theme's own materials
  — not a generic effect recoloured. Aim for several layers:
  - something ambient over the whole page (falling, rising, drifting,
    twinkling);
  - at least one **living** element that moves with purpose (bats that
    scatter from the pointer, fireflies drawn to it, a juggling fool, a star
    whose rays turn, fireworks);
  - **a painted presence** at the edges of the window (a garland along the
    top, lilies along the foot, roses up the sides, a figure in a corner);
  - a change of **light** (dawn, moonlight, candlelight, ember glow, dark).
- **Logging feedback**: whatever the theme does when a block is painted
  (Starlit's spell, Black Hours' gold leaf) takes the holiday's form on that
  day's bar (snow crystals, hearts, petals, coins).

### 3. Fun mechanics, for certain holidays

Some holidays should be **played with**, not only looked at. Every theme
should have a handful of these, spread across the year, each fitting the
holiday and the theme. Examples already built:

| Holiday | Mechanic |
|---|---|
| Easter | five eggs hidden about the page; each one found bursts, finding all five brings a reward and a message; remembered for the day |
| New Year's Eve | fireworks that grow more frequent towards midnight, the last ten seconds counted down across the page, the new year proclaimed at midnight |
| New Year's Day | the old year's page turning over when the app first opens that day |
| Halloween | creatures that react to the pointer (flee it, wave at it) |
| St. Nicholas | something to press that spills treats |
| Longest Night | the page in darkness, lit only around the pointer |
| Midsummer | fireflies drawn to the pointer |
| Birthdays | a fanfare with the person's name and age |
| Anniversary | a moment of ceremony (a seal pressed, stars falling) |

Mechanics that take a day to unfold (the countdown, the page turn) **must
also play when the day is being tried** (see QA below), so they can be seen
without waiting a year.

---

## The quality bar

- **Unique to the theme.** Ask: what would this holiday look like if it
  happened *inside this theme's world*? Black Hours is a medieval book of
  hours, so its holidays are red-letter days with Latin names, margin
  paintings, a skull for the Office of the Dead, St Lawrence's gridiron for
  the Perseids. Starlit is a grimoire, so its holidays are spells, auroras,
  enchanted skies. A new theme must find its own equivalent of every one.
- **Distinct from each other.** Lay all the holidays of a theme side by side:
  no two may look alike. Vary the colour, the shape, the motion, the place on
  the page.
- **Big enough to notice.** Decoration that is technically there but easy to
  miss has failed. When in doubt, larger and bolder — then check it does not
  get in the way.
- **Crafted.** Proper shading, outlines and highlights in the theme's style;
  sizes that hold up at every zoom; nothing blurry, clipped or misaligned.
  Animations eased and paced, not jittery or frantic.
- **Fun.** Little surprises are encouraged: the snail in Black Hours wears a
  jester's cap at Carnival and a flower crown on your birthday.

## What it must never do

- Get in the way of logging. It is one day a year, but the app is used all
  that day. Decorations let clicks through (`pointer-events: none`) unless
  they are something to press. Bar pieces sit in front of block names, so
  keep them to the ends and edges and leave most names clear. Big overlays
  (greetings, fanfares, seals) go away by themselves within a few seconds.
- Change how the app behaves. Holidays change how it looks, never what it
  does (the owner's standing rule: "fix how it looks, not what it does").
- Send anything anywhere, or save anything beyond small per-day state in
  `localStorage` for a mechanic (eggs found, page already turned).
- Affect other themes. A holiday look is scoped to its theme.

---

## How it is built

- **Dates and names**: `festivals.js` (shared). A theme's own data about each
  holiday (names in its voice, colours, which effects) goes in a small pure
  module with tests, like `scenes/hoursFeasts.js`.
- **Today's festival**: always through `useTodaysFestival()` in
  `src/feastPreview.js`, never `festivalOf(todayISO())` directly, so that
  trying a day out works. A tried festival carries `preview: true`.
- **The list**: `src/DayRow.jsx` draws each day; it already passes the
  festival in for Starlit and Black Hours.
- **Motion**: canvases on the shared clock, `runLoop` in `scenes/loop.js`.
  Respect `stillness()` (reduced motion): draw once or not at all. The page
  pauses CSS animations while the window is in the background (`.resting`);
  that is wanted.
- **Canvases**: size them to the window at `devicePixelRatio` capped at 2.
  Draw what does not move once (on resize), not every frame.
- **Layers** (z-index): the page background 0, the content 1, things over the
  content 21–26, the theme frame 24, greetings 40, fanfares 45, full-screen
  moments 50–60. A wrapper around a day's pieces uses `display: contents` so
  each piece stacks among the page's own layers (`.app > *` makes every direct
  child its own layer otherwise).
- **Tests**: whatever is logic (names, ages, which day, what is chosen) gets a
  test in `npm test`. Everything visual gets the QA below.

---

## How to work

1. **Plan the whole year first.** Before drawing anything, write down for the
   theme: each holiday's idea, its colours, its bar, its day-of scene and
   which holidays get a mechanic. This is how they stay distinct from one
   another.
2. **Then build and finish one holiday at a time**, fully — list, bar, day,
   mechanic — and QA it before moving on. Starlit was made one holiday after
   another and came out better than a version made all at once.
3. **Show the owner screenshots** of each finished holiday rather than asking
   them to go and look. Keep explanations simple and non-technical.
4. **Commit; the owner pushes.**

---

## QA: test the real thing, in a separate copy of the app

The owner wants good QA without having to look at everything themselves. So
every design is tested **running**, in a separate copy of the app, and
iterated until it is right.

### The test copy

- A scratch folder (never inside the real vault, never the real
  `%APPDATA%\The Chronicle`) with **made-up** daily notes — a few days, some
  full, some empty, today included — and its own `tags.json`, `config.json`
  and `birthdays.json` (include a made-up birthday with a year and one
  without).
- A small server script that calls `createApp` from `server/app.js` with
  those paths, `staticDir` set to the project's `dist`, `refillCovers: false`,
  on a free port (5298 has been used).
- Run it through a temporary entry in `.claude/launch.json` and
  `preview_start`; restore `launch.json` afterwards. `npm run build` and
  reload to see each change.
- The test copy keeps its own settings, so switching themes or trying days in
  it never touches the owner's app.

### Seeing a holiday

Settings → Look → **Try a feast day** makes today any holiday, in every
theme, until the app closes. From a script, set the `.feastpick` select's
value and dispatch a `change` event.

### When the browser pane is hidden

The pane is often in the background, and then:

- `requestAnimationFrame` never fires, so canvases stay blank. In the page,
  replace it with a timer
  (`window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 33)`)
  and remount the scene by trying the day again.
- The app pauses CSS animations while unfocused; inject
  `.resting * { animation-play-state: running !important }`.
- Screenshots can still catch fades at their first frame. To judge how
  something looks, briefly force it visible (`animation: none; opacity: 1`).
- Say so in the report if something could only be seen frozen, not running.

### The checklist, for every holiday

- [ ] The day's heading, in the Day view: on today and on another day.
- [ ] The bar: on an empty day and a full day, at a small and a large row
      height; names on blocks still readable.
- [ ] The Overview row.
- [ ] The greeting appears, reads well, and goes away.
- [ ] The day-of scene: every layer present, nothing clipped, at a wide and
      a narrow window.
- [ ] The mechanic, end to end (find every egg; see the countdown reach
      midnight; press every purse).
- [ ] Nothing important covered; clicks still reach the blocks and buttons
      underneath.
- [ ] Two holidays at once (e.g. 2026-12-06, Advent and St. Nicholas).
- [ ] Birthdays: someone else's with a year, without one, your own, a long
      name.
- [ ] Reduced motion: still looks right, nothing moves.
- [ ] The other themes are unaffected.
- [ ] `npm test` passes, `npm run build` succeeds.

### Done means

Every box above ticked; screenshots sent to the owner; anything not seen
running said plainly; the installed app updated (see the project's install
steps) and committed.
