# Working on this project

A personal day tracker. One horizontal bar per day; paint a tag across it and
that stretch of time is logged. Runs entirely on the machine it is installed
on. `README.md` explains what it does and how it is put together — read it
before changing anything.

## The rules that matter

**The vault is someone's real diary.** Days live as one Markdown note per day
in an Obsidian vault, and the log is a fenced ` ```daily-log ` block inside
each note. The app reads and writes **only that block**. Everything else in
the file — their prose, their links, their headings — must survive
byte-for-byte. `server/fence.js` is the only place that knows how, and
`server/store.js` is the only thing that writes.

**Never repair the vault while the app is open**, and copy the notes somewhere
safe before any change that sweeps across more than one day. Two blocks were
lost that way once; the backup was the only reason they came back.

**A day that cannot be parsed is never overwritten.** If someone hand-edited
the block into something invalid, the app says so and refuses to write. Keep
it that way.

**No accounts, no cloud, no telemetry.** The only things that leave the
machine are the cover and metadata lookups (RAWG, Steam, SteamGridDB,
AniList), and a single button that sends anime progress to AniList. Nothing is
ever sent without a press.

**Secrets live in `config.json`, which is gitignored.** It holds API keys and
an AniList token that is effectively a password to someone's account. Never
commit it, never paste its contents anywhere, never add a key to an example
file or a test.

## The thing to design for

It has to be effortless. If logging a day takes more than about fifteen
seconds the whole thing stops being used. Prefer fewer clicks to more options,
and don't add features nobody asked for.

## Designing holidays

Feast days, birthdays and the anniversary are designed per theme, to a high
standard, and tested running in a separate copy of the app. Before working on
any of them, read and follow `docs/holiday-design.md`.

## Layout

```
electron/  desktop wrapper; runs the server in-process
server/    Express API; reads and writes the fenced block
src/       React frontend
src/styles/tokens.css   all colours, spacing and type sizes
```

## Before you say you're done

```bash
npm test
```

Covers the fence read/write, the store's validation, the block layout logic,
and the cover and rewatch decisions. Add to it when you change any of them —
especially anything that decides what gets written to a note.

`npm run app` runs the desktop app; `npm run package` builds an installer.
