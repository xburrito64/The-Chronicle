# The Chronicle

A personal day tracker. One horizontal bar per day, 00:00 to 24:00. Pick a tag,
drag across the bar, and that stretch of time is logged. Runs locally, no
accounts, no cloud.

Days are stored in an Obsidian vault as one note per day, with the log kept in
a fenced code block so the rest of the note stays usable for normal writing:

````markdown
```daily-log
[{"tag":"sleep","start":"00:00","end":"08:20"},
 {"tag":"game","start":"09:20","end":"16:30","note":"HZD, finished the frozen wilds"}]
```
````

Everything outside that block is left byte-for-byte alone. Times are `HH:MM`
on ten-minute marks. If the JSON is hand-edited into something unparseable the
app says so and refuses to write over it.

## Installing

Download `The Chronicle Setup <version>.exe` from the
[Releases](https://github.com/xburrito64/The-Chronicle/releases) page and run
it. Windows only.

The installer isn't signed, so Windows may say *"Windows protected your PC"*
the first time. Click **More info**, then **Run anyway**.

On first start, open the settings (the gear at the top right) and go to
**Setup**: pick the folder your daily notes are in. That's all it needs. The
RAWG and SteamGridDB keys there are optional and only fetch game covers;
everything else works without them. It comes with a starter set of tags you can
rename, recolour, hide or add to under **Tags**.

## Running it

As a desktop app — its own window, no console, no browser:

```bash
npm run app
```

To build an installer instead (lands in `release/`):

```bash
npm run package
```

For development, with hot reload in a browser tab:

```bash
npm install
npm start
```

Then open http://localhost:5273. Only run one copy of the dev server at a
time — if it says the app is already running:

```bash
npm run stop
```

## Setup

**The installed app keeps its settings in `%APPDATA%/The Chronicle/`**,
not in the project folder, so they survive reinstalling. Both `config.json`
and `tags.json` live there, copied from the project versions the first time it
runs. The app's menu has *Open settings folder*.

In development the project's own `config.json` and `tags.json` are used.

Copy `config.example.json` to `config.json` and point it at your daily notes
folder. Use forward slashes:

```json
{
  "vaultDailyDir": "C:/Vaults/YourVault/Daily",
  "port": 5274,
  "rawgKey": "",
  "steamGridKey": "",
  "anilistClientId": "",
  "anilistToken": ""
}
```

`rawgKey` and `steamGridKey` are only for naming games, and the two `anilist`
lines only for sending anime progress to an account — see below. Leave any of them empty and
everything else works exactly as before; the box that needs one says so when
you open it. The AniList lines are written by the app itself, from a panel in
the note, rather than being something to go and edit. A setting added by a
later version is filled into the installed copy on next launch, so there is
always a line to put it on.

Tags live in `tags.json` — name, colour and icon. Edit and refresh; no restart
needed.

Most of this can be done from inside the app instead: the gear at the top
right opens the settings. **Tags** adds, renames, recolours, reorders and hides
tags and gives them pictures; **Look** has the bar width, icon sets, tag-box
styles, block looks (classic, mana crystal, grimoire, woven),
labels, covers and hints; **Setup** picks the vault folder and takes
the RAWG and SteamGridDB keys, checking each with its site before keeping it.
A tag's id never changes once it is made, which is why renaming one is safe
for every note that uses it — and a tag still used by any day can be hidden
but not deleted.

Fonts go in `public/fonts/`, the app icon in `build/`, and images to replace
the tag emoji in `tag-icons/`. Each of those folders has a README explaining
the format and naming.

## Using it

- **Day view** — one full-size bar per day, endlessly scrollable. Scroll up for
  the past, down into the future.
- **Overview** — the same days compressed, read-only, for spotting patterns,
  with totals per tag for whatever is on screen beside it, and what you played
  and watched over that stretch listed with their covers.
- **ctrl+scroll** resizes the rows. Each view remembers its own size.
- Click a block for its note, drag its edges to adjust the times, or use the
  red button to clear a whole day.
- Blocks may overlap: paint one over another and they share the bar's height
  for the stretch they have in common.

### Tools

Two tools sit at the right above the list. Each has a key, so switching is
one press:

- **Move and select** (`V` or `1`) — over a block, how the bar has always
  worked: click it for its note, drag it to move it, drag an edge to stretch
  it. Anywhere else, drag a box over blocks, across as many days as it reaches
  (shift-click adds or removes one). Then drag any of them to move them all,
  press Delete to remove them, or ctrl+c and ctrl+v to copy them to wherever
  the pointer is.
- **Snip** (`S` or `2`) — click a block to cut it in two where the line is.
  An hour of anime cut at the half hour is two half hours of the same show,
  side by side, and each can say its own episodes. Two of the same thing that
  touch would otherwise join into one; a cut keeps them apart, survives a
  reload (it is just two entries in the note), and moves if you drag the edge
  where they meet. Paint back across it and they are one block again.

### Games

A **Game** block can say which game. Open its note and a search box is there
beside it; type a name, pick it, and the block takes the game's name and its
cover art in place of the tag's own. Looking for a game and having found one
are the same box in the same place, so the panel keeps its shape.

The name is written into the note as plain text, so the day still reads
sensibly in Obsidian with nothing installed. The cover is *copied* into
`<your daily folder>/covers/` rather than linked, so it keeps working offline
and the vault stays self-contained. One file per game, however many days
mention it.

It takes three databases, because no one of them does the whole job. RAWG is
the search: nine hundred thousand games including everything that never came
to a PC. It has no cover art at all — what it has is key art, the wide picture
across the top of a store page. The cover itself comes from Steam, which has
one for every game it sells and asks for no key.

Steam cannot dress all of them. It never sold Minecraft, and a game it *does*
sell can still have no library art published yet, which is ordinary for
something just released. So a third place is asked, but only once Steam has
come back empty: [SteamGridDB](https://www.steamgriddb.com), where people
collect the covers for both cases at the size Steam uses. It wants a free key
in `steamGridKey` — sign in there with your Steam account, then Preferences →
API. Without one this ends where it used to: a name and no picture.

A game with no cover anywhere still keeps its name, which is the record.

A cover that was found stays found; a cover that was *not* found is believed
for five minutes and then asked about again. Steam does drop art it used to
serve, and one request going wrong should not turn into a picture that never
comes back until the app is closed. For the same reason a lookup that answers
with nothing falls back to whatever is already in the covers folder, and never
overwrites a cover already written down — a game's picture is only replaced by
a better one, never by a blank.

Opening a named Game block shows a card beside the note: the cover, what the
game is, and how long has gone into it across every day in the vault — not
just that session.

What a game *is* — its platforms, its genres, its year — is kept once per game
in `covers/games.json` rather than on every entry that mentions it. A day is a
record of what happened, and "Action, Platformer, PC" is not something that
happened; it would be the same forty lines of it in a year of playing one
game, in the file you actually read.

The platforms are the ones a game is **sold** on, which is not quite the same
as the one you played it on — nothing in either database knows that.

Genres start as the database's, which are coarse — there is no "FPS", only
"Action" — so they are yours to change. The pen in the corner of the card
turns on editing: genres become chips you can drop, a `+` appears to add your
own, up to six per game, and so do *Change* and *Remove* for the game itself.
Click it again and the card goes back to being something to read. Once you
have edited the genres nothing puts the database's back, including picking the
same game again.

Two Game blocks only merge into one when they are the same game — finishing
one and starting another is two things that happened.

The search needs a free key from [rawg.io/apikey](https://rawg.io/apikey) in
`rawgKey`. The fallback covers need one from SteamGridDB in `steamGridKey`,
and everything else works without it.

### Anime

The same idea, one database lighter. An **Anime** block asks which show, and
[AniList](https://anilist.co) answers without a key at all — the cover, the
genres, the year and the episode count all arrive together, so there is no
second site to fetch the picture from and nothing to sign up for.

It asks in three steps, because each one is only answerable once the one
before it is: which show, then which season of it, then which episodes. The
seasons are a real question rather than a field — AniList keeps every season
as its own record, joined to the last by a sequel link, so the list is a walk
along that chain. Films, recaps and side stories are related to a show without
being seasons of it, and are left out.

Only the episodes that have **aired** are offered. Eight of a twelve-episode
season out so far means eight boxes; there is no honest way to have watched
the ninth. Episodes already written down on some other day are underlined, so
a show you are part-way through opens where you left it rather than at one.

The note keeps the name and the numbers in plain text:

```json
{"tag":"anime","start":"19:00","end":"20:30",
 "show":"Frieren: Beyond Journey's End","episodes":[5,6,7]}
```

Two Anime blocks merge only when they are the same show, and when they do the
episodes join up — one evening in front of it, however it came to be two
stretches.

#### Sending it to AniList

The card has a button that marks the show watched up to the furthest episode
on the block. It is a button and never a consequence of typing: this is the
one thing in the app that leaves your machine.

An episode **behind** where AniList has you is two different things wearing
the same number, and which one it is depends on whether you finished the show.

On something you are part-way through, it is a day being filled in late:
episode 3 of a show you are twelve into is a record of a Tuesday, not a reason
to un-watch nine episodes. So it changes nothing, and says so.

On something you **finished**, it can only be a rewatch — there is no gap left
for the number to be filling — so it starts one by itself. The button says
*Rewatch · 1* rather than *AniList · 1* before you press it, so this is never
something you find out afterwards.

The circular arrow beside the button is for the case in between: watching
something again that you never finished, which nothing here could work out on
its own. It lights whenever the send would count as a rewatch, whether you
pressed it, or you had finished the show, or AniList already has one under
way — a switch that claimed otherwise would be lying about what the button
next to it is about to do.

Once a rewatch has started it is remembered, so the next evening of that show
already knows. Finishing it puts the show back to completed on AniList, adds
one to its tally of times through, and forgets the flag — there is nothing
left to carry.

Connecting takes one visit to AniList and two pastes. The button walks you
through it: make a client under
[your developer settings](https://anilist.co/settings/developer) with the
redirect URL `https://anilist.co/api/v2/oauth/pin`, paste the client id it
gives you, follow the link that appears, and paste the code that page shows
back. The code lasts a year. The app writes both into the settings file
itself and checks the code before keeping it, so a bad paste is refused while
it can still be explained rather than sitting in a file looking connected.

Nothing else in the app touches the network, and nothing is sent anywhere
without that button being pressed.

## Layout

```
electron/  desktop wrapper; runs the server in-process
server/    Express API; reads and writes the fenced block
src/       React frontend
src/styles/tokens.css   all colours, spacing and type sizes
```

```bash
npm test
```

covers the fence read/write and the block layout logic.

## License

MIT — see [LICENSE](LICENSE). Use it, change it, share it.

The fonts in `public/fonts/` belong to their authors and come under the SIL
Open Font License 1.1; see [public/fonts/OFL.txt](public/fonts/OFL.txt).
