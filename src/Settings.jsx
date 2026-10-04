import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PREVIEW_CHOICES, setFeastPreview, useFeastPreview } from './feastPreview.js'
import { getIconSets, refillCovers } from './api.js'
import TagIcon from './TagIcon.jsx'
import TagEditor from './TagEditor.jsx'
import SetupPanel from './SetupPanel.jsx'
import BirthdayEditor from './BirthdayEditor.jsx'
import { pieceLook, runeSpans } from './blockLooks.js'
import {
  BAR_WIDTH, NO_LIMIT, CHIP_LOOKS, BLOCK_LOOKS, LABEL_STYLES, DEFAULTS, THEMES,
} from './appearance.js'

// How many tags a tag-box look is shown with. Enough to see the colours
// against each other, few enough that five looks fit down one panel.
const SAMPLE_TAGS = 3

const TABS = [
  { id: 'tags', name: 'Tags' },
  { id: 'look', name: 'Look' },
  { id: 'birthdays', name: 'Birthdays' },
  { id: 'setup', name: 'Setup' },
]
// The tab last looked at, for as long as the app is open: closing the panel
// to try something and opening it again should land back where you were.
let lastTab = 'tags'

/**
 * The settings panel: a column down the right of the window, so the days
 * stay in view beside it and every change can be seen as it is made rather
 * than pictured.
 *
 * Nothing here is saved by a button. Each choice takes effect the moment it
 * is made and is kept from then on; closing the panel is only closing it.
 */
export default function Settings({
  appearance, onChange, tags, onClose, onTagsSaved, onPictureChanged, onResetRows, onCoversFound, openOn = null,
}) {
  const [tab, setTab] = useState(() => {
    if (openOn) lastTab = openOn
    return lastTab
  })
  const pick = (id) => { lastTab = id; setTab(id) }

  // A press anywhere beside the panel puts it away, so a change made at the
  // foot of it doesn't mean scrolling back up for the cross. That press only
  // closes: it is not also a click on whatever was under it, or putting the
  // panel away could paint, move or open something on a day by accident.
  // The gear is left to do its own toggling.
  useEffect(() => {
    const onDown = (e) => {
      if (e.button !== 0 || !(e.target instanceof Element)) return
      if (e.target.closest('.settings, .gear')) return
      e.stopPropagation()
      e.preventDefault()
      const swallow = (c) => { c.stopPropagation(); c.preventDefault() }
      window.addEventListener('click', swallow, true)
      // The click a press turns into arrives straight after it is let go;
      // past that, nothing is swallowed.
      const release = () => setTimeout(() => window.removeEventListener('click', swallow, true), 0)
      window.addEventListener('pointerup', release, { capture: true, once: true })
      onClose()
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [onClose])

  return (
    <aside className="settings" aria-label="Settings">
      <div className="settingshead">
        <h2>Settings</h2>
        <button type="button" className="settingsclose" onClick={onClose} aria-label="Close settings">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="settingstabs" role="tablist">
        {TABS.map((one) => (
          <button
            key={one.id}
            type="button"
            role="tab"
            aria-selected={tab === one.id}
            className={tab === one.id ? 'on' : ''}
            onClick={() => pick(one.id)}
          >
            {one.name}
          </button>
        ))}
      </div>

      {tab === 'tags' && (
        <TagEditor
          tags={tags}
          iconSet={appearance.iconSet}
          onSaved={onTagsSaved}
          onPictureChanged={onPictureChanged}
        />
      )}
      {tab === 'look' && (
        <Look
          appearance={appearance}
          onChange={onChange}
          tags={tags}
          onResetRows={onResetRows}
          onCoversFound={onCoversFound}
        />
      )}
      {tab === 'birthdays' && <BirthdayEditor />}
      {tab === 'setup' && <SetupPanel />}
    </aside>
  )
}

function Look({ appearance, onChange, tags, onResetRows, onCoversFound }) {
  const [sets, setSets] = useState(null)
  const [coverNote, setCoverNote] = useState('')
  const [looking, setLooking] = useState(false)
  const [rowsNote, setRowsNote] = useState('')

  // Asked each time the tab opens, so a set dropped into the icon folder
  // while the app is running shows up the next time you look.
  useEffect(() => {
    let alive = true
    getIconSets()
      .then((body) => { if (alive) setSets(body.sets ?? []) })
      .catch(() => { if (alive) setSets([]) })
    return () => { alive = false }
  }, [])

  const set = (key) => (value) => onChange({ ...appearance, [key]: value })
  const sample = tags.filter((tag) => !tag.hidden).slice(0, SAMPLE_TAGS)
  const width = appearance.barWidth

  async function lookForCovers() {
    setLooking(true)
    setCoverNote('')
    try {
      const { filled, ready } = await refillCovers()
      setCoverNote(!ready
        ? 'Looking games up needs a RAWG key first — it goes in under Setup.'
        : filled.length === 0
        ? 'Nothing new yet — every game without a cover still has none to find.'
        : `Found ${filled.length}: ${filled.join(', ')}.`)
      if (filled.length > 0) onCoversFound()
    } catch (err) {
      setCoverNote(err.message)
    } finally {
      setLooking(false)
    }
  }

  // What a preview bar is painted with: the first few real tags, at the
  // shares a day might plausibly have them in.
  const barTags = tags.filter((tag) => !tag.hidden).slice(0, 5)
  const shares = [34, 12, 22, 9, 23]

  return (
    <>
      <section className="settingsgroup">
        <h3>Theme</h3>
        <p className="settingsnote">The whole look of the app. Tag colours stay the same in every one.</p>
        <div className="choicelist">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={`choice${appearance.theme === theme.id ? ' on' : ''}`}
              aria-pressed={appearance.theme === theme.id}
              onClick={() => set('theme')(theme.id)}
            >
              {/* A little room in that theme: it sets its own names, so
                  everything in here wears it whatever the page is wearing. */}
              <span className="themepreview" data-theme={theme.id} aria-hidden="true">
                <span className="tp-title">The Chronicle</span>
                <span className="tp-rule" />
                <span className="tp-bar">
                  {barTags.map((tag, i) => (
                    <span key={tag.id} style={{ flex: shares[i], background: tag.colour }} />
                  ))}
                </span>
                <span className="tp-row">
                  {barTags.slice(0, 2).map((tag) => (
                    <span key={tag.id} className="tp-chip" style={{ '--chip': tag.colour }}>{tag.name}</span>
                  ))}
                  <span className="tp-pill">Day</span>
                </span>
              </span>
              <span className="choicename">{theme.name}</span>
              <span className="choicenote">{theme.note}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="settingsgroup">
        <h3>Bar width</h3>
        <p className="settingsnote">How wide the days may get. The bar never grows past the window.</p>
        <div className="widthrow">
          <input
            type="range"
            min={BAR_WIDTH.min}
            max={BAR_WIDTH.max}
            step={BAR_WIDTH.step}
            value={width}
            onChange={(e) => set('barWidth')(Number(e.target.value))}
            aria-label="Bar width"
          />
          <span className="widthvalue">{width >= NO_LIMIT ? 'No limit' : `${width} px`}</span>
        </div>
        {width !== DEFAULTS.barWidth && (
          <button type="button" className="settingsreset" onClick={() => set('barWidth')(DEFAULTS.barWidth)}>
            Back to {DEFAULTS.barWidth} px
          </button>
        )}
      </section>

      <section className="settingsgroup">
        <h3>Row height</h3>
        <p className="settingsnote">Ctrl+scroll over the days makes rows taller or shorter. This puts both views back.</p>
        <button
          type="button"
          className="settingsbutton"
          onClick={() => { onResetRows(); setRowsNote('Back to the usual height.') }}
        >
          Reset row heights
        </button>
        {rowsNote && <p className="keymessage">{rowsNote}</p>}
      </section>

      <section className="settingsgroup">
        <h3>Tag icons</h3>
        <p className="settingsnote">
          Each folder inside the tag-icons folder is a set. A tag a set has no picture for keeps its usual one.
        </p>
        {sets === null && <p className="settingsnote">Looking for sets…</p>}
        <div className="choicelist">
          {(sets ?? []).map((one) => (
            <button
              key={one.name || '(usual)'}
              type="button"
              className={`choice${appearance.iconSet === one.name ? ' on' : ''}`}
              aria-pressed={appearance.iconSet === one.name}
              onClick={() => set('iconSet')(one.name)}
            >
              <span className="choicename">
                {one.name || 'Current icons'}
                <span className="choicecount">{one.covers} of {one.of}</span>
              </span>
              <span className="setpreview">
                {one.preview.map((tag) => (
                  <img key={tag.id} src={tag.image} alt="" title={tag.name} />
                ))}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="settingsgroup">
        <h3>Tag boxes</h3>
        <p className="settingsnote">The row of tags under each day. The last one in each sample is armed.</p>
        <div className="choicelist">
          {CHIP_LOOKS.map((look) => (
            <button
              key={look.id}
              type="button"
              className={`choice${appearance.chipLook === look.id ? ' on' : ''}`}
              aria-pressed={appearance.chipLook === look.id}
              onClick={() => set('chipLook')(look.id)}
            >
              <span className="choicename">{look.name}</span>
              <span className="choicenote">{look.note}</span>
              <span className="chipsample">
                {sample.map((tag, i) => (
                  <span
                    key={tag.id}
                    className={`chip${i === sample.length - 1 ? ' armed' : ''}`}
                    data-look={look.id}
                    style={{ '--chip': tag.colour }}
                  >
                    <TagIcon tag={tag} />
                    {tag.name}
                  </span>
                ))}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="settingsgroup">
        <h3>Blocks on the bar</h3>
        <p className="settingsnote">Each sample has one block laid over another, so you can see how a look steps around it.</p>
        <div className="choicelist">
          {BLOCK_LOOKS.map((look) => (
            <button
              key={look.id}
              type="button"
              className={`choice${appearance.blockLook === look.id ? ' on' : ''}`}
              aria-pressed={appearance.blockLook === look.id}
              onClick={() => set('blockLook')(look.id)}
            >
              <span className="choicename">{look.name}</span>
              <span className="choicenote">{look.note}</span>
              <BlockSample look={look.id} tags={tags.filter((tag) => !tag.hidden)} />
            </button>
          ))}
        </div>
        <Toggle
          on={appearance.keepPauses}
          onFlip={() => set('keepPauses')(!appearance.keepPauses)}
          label="Show short pauses as gaps"
          note="Off, a block rises to fill the bar whenever there is room above it, even for ten minutes. On, a ten-minute pause in something above it is left as a gap and the block stays where it is."
        />
      </section>

      <section className="settingsgroup">
        <h3>Labels on the bar</h3>
        <div className="choicelist">
          {LABEL_STYLES.map((style) => (
            <button
              key={style.id}
              type="button"
              className={`choice${appearance.labels === style.id ? ' on' : ''}`}
              aria-pressed={appearance.labels === style.id}
              onClick={() => set('labels')(style.id)}
            >
              <span className="choicename">{style.name}</span>
              <span className="choicenote">{style.note}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="settingsgroup">
        <h3>Covers</h3>
        <Toggle
          on={appearance.covers}
          onFlip={() => set('covers')(!appearance.covers)}
          label="Game and anime covers on the bar"
          note="Off, a named block wears its tag's icon on the bar. The card in its note keeps the cover."
        />
        <p className="settingsnote">
          Games without a cover are looked for again by themselves every few hours. To look right now:
        </p>
        <button type="button" className="settingsbutton" onClick={lookForCovers} disabled={looking}>
          {looking ? 'Looking…' : 'Look for missing covers now'}
        </button>
        {coverNote && <p className="keymessage">{coverNote}</p>}
      </section>

      <section className="settingsgroup">
        <h3>Shortcut hints</h3>
        <Toggle
          on={appearance.hints}
          onFlip={() => set('hints')(!appearance.hints)}
          label="The line of shortcuts above the days"
          note="What to do while a tag is armed is still said there either way."
        />
      </section>

      <FeastTrial />
    </>
  )
}

/**
 * Trying a feast day: today pretends to be the feast picked, so its look can
 * be seen without waiting for it. Only until the app is closed.
 */
function FeastTrial() {
  const tried = useFeastPreview()
  return (
    <section className="settingsgroup">
      <h3>Try a feast day</h3>
      <p className="settingsnote">
        Today dresses as the day you pick, so you can see how it looks. Nothing is
        saved, and it goes back to normal when the app is closed.
      </p>
      <select
        className="feastpick"
        value={tried ?? ''}
        onChange={(e) => setFeastPreview(e.target.value)}
      >
        <option value="">Off — today is today</option>
        {PREVIEW_CHOICES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
    </section>
  )
}

function Toggle({ on, onFlip, label, note }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`toggle${on ? ' on' : ''}`} onClick={onFlip}>
      <span className="toggletrack" aria-hidden="true"><span className="toggleknob" /></span>
      <span className="toggletext">
        <span className="choicename">{label}</span>
        {note && <span className="choicenote">{note}</span>}
      </span>
    </button>
  )
}

/**
 * A short bar in one block look: one block on its own, then a second with a
 * third laid over its end — cut into pieces exactly as the real bar cuts it,
 * so the sample shows the joins as well as the ends.
 */
function BlockSample({ look, tags }) {
  const [a, b, c] = unlike(tags.map((tag) => tag.colour), ['#7b8fd6', '#d68a5c', '#5fb38a'])
  // Measured, for the runes: they are laid out in whole pixels, as on the bar.
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const track = ref.current
    if (!track) return undefined
    const watch = new ResizeObserver(() => setWidth(track.clientWidth))
    watch.observe(track)
    return () => watch.disconnect()
  }, [])
  // In percent of the bar, as layoutLanes would hand them over.
  const blocks = { a: [2, 30], b: [33, 80], c: [58, 97] }
  const pieces = [
    { id: 'a', tag: a, from: 2, to: 30, top: 0, lanes: 1, index: 0 },
    { id: 'b', tag: b, from: 33, to: 58, top: 0, lanes: 1, index: 0 },
    { id: 'b', tag: b, from: 58, to: 80, top: 0, lanes: 2, index: 1 },
    { id: 'c', tag: c, from: 58, to: 80, top: 1, lanes: 2, index: 0 },
    { id: 'c', tag: c, from: 80, to: 97, top: 0, lanes: 1, index: 1 },
  ]
  const px = (percent) => Math.round((percent / 100) * width)
  return (
    <span className="blocksample" data-blocks={look}>
      <span className="sampletrack" ref={ref}>
        <span className="blocks">
          {pieces.map((p) => {
            const mine = pieces.filter((q) => q.id === p.id)
            const start = p.index > 0
            const end = p.index < mine.length - 1
            const { vars, stepStart, stepEnd } = pieceLook(p, mine[p.index - 1], mine[p.index + 1])
            const [runes] = look === 'grimoire' && width
              ? runeSpans(px(blocks[p.id][0]), px(blocks[p.id][1]), px(p.from), px(p.to))
              : []
            return (
              <span
                key={`${p.id}${p.index}`}
                className={`block settled${start ? ' joined-start' : ''}${end ? ' joined-end' : ''}`
                  + `${stepStart ? ' step-start' : ''}${stepEnd ? ' step-end' : ''}${runes ? ' runes' : ''}`}
                style={{
                  left: `${p.from}%`,
                  width: `${p.to - p.from}%`,
                  top: p.top ? `${(p.top / p.lanes) * 100}%` : 'var(--block-inset)',
                  bottom: 'var(--block-inset)',
                  zIndex: p.top,
                  '--tag': p.tag,
                  '--x': `${px(p.from)}px`,
                  ...vars,
                  ...(runes && {
                    '--runes-l': `${runes.left}px`,
                    '--runes-r': `${runes.right}px`,
                    '--runes-shift': `${runes.shift}px`,
                  }),
                }}
              />
            )
          })}
        </span>
      </span>
    </span>
  )
}

/**
 * Three of the colours that are easy to tell apart, topped up from `spare`.
 * Tag colours are oklch(); the spares are hex. Anything else is passed over.
 */
function unlike(colours, spare) {
  const hue = (colour) => {
    const lch = String(colour).match(/^oklch\(\s*[\d.]+%?\s+[\d.]+\s+([\d.]+)/i)
    if (lch) return Number(lch[1])
    if (!/^#[0-9a-f]{6}$/i.test(colour)) return null
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16) / 255)
    const max = Math.max(r, g, b)
    const d = max - Math.min(r, g, b)
    if (!d) return 0
    const h = max === r ? (g - b) / d : max === g ? 2 + (b - r) / d : 4 + (r - g) / d
    return (h * 60 + 360) % 360
  }
  const apart = (x, y) => { const d = Math.abs(hue(x) - hue(y)); return Math.min(d, 360 - d) > 60 }
  const picked = []
  for (const colour of colours) {
    if (hue(colour) !== null && picked.every((p) => apart(p, colour))) picked.push(colour)
    if (picked.length === 3) return picked
  }
  return [...picked, ...spare.filter((s) => picked.every((p) => apart(p, s)))].slice(0, 3)
}
