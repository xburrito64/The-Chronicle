import { useEffect, useState } from 'react'

// Only the desktop app can update itself; in a browser tab there is no such
// thing, and this draws nothing.
const desktop = typeof window !== 'undefined' ? window.daily : undefined
const SKIPPED = 'daily-documenter:update-skipped'

const skipped = () => { try { return localStorage.getItem(SKIPPED) ?? '' } catch { return '' } }

/**
 * A new version, said where it can't be missed: a banner under the title,
 * with what is new and a button to install it. Nothing is fetched until
 * Install is pressed, and nothing replaces the running app until Restart is.
 *
 * "Not now" puts that version away for good; the next one is news again.
 */
export default function UpdateBanner() {
  const [news, setNews] = useState(null) // { state, version, notes, percent, message }
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!desktop?.onUpdate) return undefined
    return desktop.onUpdate((next) => setNews((was) => ({ ...was, ...next })))
  }, [])

  if (!news || !news.version) return null
  if (news.state === 'available' && skipped() === news.version) return null

  const notes = news.notes ?? []

  return (
    <div className="banner update" role="status">
      <div className="updateline">
        <span className="updatemark" aria-hidden="true">✦</span>
        <span className="updatewords">
          {news.state === 'restarting'
            ? <>Updating to <b>{news.version}</b> — The Chronicle will close and open again by itself in about half a minute.</>
            : news.state === 'ready'
            ? <>Version <b>{news.version}</b> is ready — restart to start using it.</>
            : news.state === 'downloading'
              ? <>Downloading version <b>{news.version}</b>… {news.percent ?? 0}%</>
              : news.state === 'error'
                ? <>Version <b>{news.version}</b> couldn't be downloaded — {news.message}</>
                : <>The Chronicle <b>{news.version}</b> is out.</>}
        </span>

        {news.state === 'downloading' && (
          <span className="updatebar" aria-hidden="true"><i style={{ width: `${news.percent ?? 0}%` }} /></span>
        )}

        <span className="updatebuttons">
          {notes.length > 0 && news.state !== 'downloading' && news.state !== 'restarting' && (
            <button type="button" className="updatelink" aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? 'Hide what’s new' : 'What’s new'}
            </button>
          )}
          {(news.state === 'available' || news.state === 'error') && (
            <>
              <button
                type="button"
                className="updatelink"
                onClick={() => {
                  try { localStorage.setItem(SKIPPED, news.version) } catch { /* only a convenience */ }
                  setNews(null)
                }}
              >
                Not now
              </button>
              <button
                type="button"
                className="bannerbutton"
                onClick={() => {
                  setNews((was) => ({ ...was, state: 'downloading', percent: 0 }))
                  desktop.downloadUpdate()
                }}
              >
                {news.state === 'error' ? 'Try again' : 'Install'}
              </button>
            </>
          )}
          {news.state === 'ready' && (
            <button
              type="button"
              className="bannerbutton"
              onClick={() => {
                setNews((was) => ({ ...was, state: 'restarting' }))
                desktop.installUpdate()
              }}
            >
              Restart
            </button>
          )}
        </span>
      </div>

      {open && notes.length > 0 && (
        // The notes' headings and list items, as plain lines: an item is
        // drawn with its mark, anything else as a heading over them.
        <div className="updatenotes">
          {notes.map((line, i) => (line.startsWith('•')
            ? <p key={i} className="updatenote">{line.replace(/^•\s*/, '')}</p>
            : <p key={i} className="updatehead">{line}</p>))}
        </div>
      )}
    </div>
  )
}
