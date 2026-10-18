# Tag icons

Drop an image in this folder and the matching tag uses it instead of its
emoji. Tags without an image here keep their emoji, so you can replace them
one at a time — nothing breaks in between.

## Naming

**The filename must be the tag's `id`, exactly as written in `tags.json`.**
Not its display name. Ids are lowercase and use hyphens:

| Tag              | id              | File to add          |
| ---------------- | --------------- | -------------------- |
| Sleep            | `sleep`         | `sleep.svg`          |
| Reading          | `reading`       | `reading.svg`        |
| Anything Else?   | `anything-else` | `anything-else.svg`  |

Current ids, ready to copy:

```
sleep  bed  game  shower  reading  walk  anime  series  movie
youtube  music  food  cleaning  documenting  research  planning  anything-else
```

A tag you add yourself in the settings gets an id from its name; the tag
editor shows it.

Capitals don't matter — `Anime.gif` works as well as `anime.gif`. The rest of
the name does: a typo isn't an error, the tag just quietly keeps its emoji. If
an icon doesn't show up, check the spelling against `tags.json` first.

## Format

**`.svg` is best.** It stays sharp at any size, and the icon is drawn small
in the bar but large on the chips.

Also accepted, in the order they're looked for:
`.svg`, `.png`, `.webp`, `.gif`, `.jpg`, `.jpeg`. If you somehow have both
`sleep.svg` and `sleep.png`, the `.svg` wins.

**Animated GIFs play**, and so do animated WebP files — wherever that icon is
drawn, so on the chip, the block and the note at once. Nothing to switch on.
A GIF can only make a pixel fully transparent or not at all, so anything with
soft edges shows a fringe of whatever colour it was saved against; animated
WebP has proper transparency and is the better choice if the shape isn't
blocky.

## Size and shape

- **Square.** Nothing is stretched — a wider image is fitted inside a square
  and the leftover space stays empty, so a 64×32 picture draws at 16×8 and
  ends up half the size it could have been.
- **SVG:** any size, as long as the `viewBox` is square. `0 0 24 24` is typical.
- **PNG and friends:** **64×64 or larger.** It's displayed at 16 pixels, but
  bigger source images stay crisp on high-resolution screens. Below 32×32 will
  look rough.
- **Transparent background.** A white or black square will look like a sticker
  glued onto the coloured block.

## Making one bigger

If an icon comes out looking small next to the others — usually because it
isn't square — give that tag an `iconScale` in `tags.json`:

```json
{ "id": "anything-else", "name": "Anything Else?", "colour": "#cb4d80", "icon": "❓", "iconScale": 2 }
```

`1` is normal and is what every tag gets without asking. `2` is the largest
allowed, and is right for a picture twice as wide as it is tall: it fills the
row's full height instead of half of it. Anything above 2 is treated as 2, so
an icon can never grow out of the row it sits in.

It applies wherever that tag is drawn, emoji included, and only to that tag.

## How it will look

The same image is used in three places, so it needs to work in all of them:

- on the coloured block in the bar, small — around 16 pixels
- on the tag chip under each day, same size
- in the note panel when a block is open

Blocks are mid-dark colours and chips are a tinted version of the same colour,
so **a light or white icon reads well in both**. A dark icon will disappear
against the darker tags like Sleep.

Simple, solid shapes beat fine detail. At 16 pixels, thin lines vanish.

## Sets

A folder in here is a **set**: a second look for the same tags, named after
the folder. The settings panel (the gear at the top right) lists every set,
with a few of its pictures, and switches between them with one click.

Inside a set the naming is exactly the same as above — one file per tag,
named after its id. A set doesn't have to be complete: a tag the set has no
picture for keeps the one it has out here, so a half-drawn set is still worth
trying. Anything in the folder that isn't named after a tag, like a sheet
showing the whole set at once, is simply ignored.

The loose files in this folder are the set called *Current icons*.

## After adding one

Refresh the app — no restart needed.

If you are running the **installed** app, this folder is the one inside
`%APPDATA%\The Chronicle\`, not the one in the project. The app's menu
has *Open settings folder*, which takes you straight there.
