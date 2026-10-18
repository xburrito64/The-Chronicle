import { useEffect, useState } from 'react'
import { getSetup, saveKey, saveVault, getAnilist } from './api.js'

// The desktop app lends the page a folder picker and a restart; in a browser
// tab (development) there is neither, and the folder is typed instead.
const desktop = typeof window !== 'undefined' ? window.daily : undefined

const KEYS = [
  {
    which: 'rawgKey',
    name: 'RAWG',
    what: 'Finding games by name.',
    where: 'https://rawg.io/apikey',
    whereText: 'rawg.io/apikey',
  },
  {
    which: 'steamGridKey',
    name: 'SteamGridDB',
    what: 'Covers for games Steam has none for. Sign in there with Steam, then Preferences → API.',
    where: 'https://www.steamgriddb.com/profile/preferences/api',
    whereText: 'steamgriddb.com',
  },
]

/**
 * Where the notes are and the keys for looking games up — the two things
 * that used to mean opening the settings file by hand.
 *
 * A key is never shown once saved, only whether there is one. Saving checks
 * it with the site first, so a key that doesn't work is turned away while it
 * can still be explained rather than sitting in the file looking fine.
 */
export default function SetupPanel() {
  const [setup, setSetup] = useState(null)
  const [problem, setProblem] = useState('')
  const [vaultNote, setVaultNote] = useState('')
  const [typedVault, setTypedVault] = useState('')
  const [anilist, setAnilist] = useState(null)

  const load = () => getSetup().then(setSetup).catch((err) => setProblem(err.message))

  useEffect(() => {
    load()
    getAnilist().then(setAnilist).catch(() => setAnilist(null))
  }, [])

  async function chooseFolder(dir) {
    if (!dir) return
    try {
      const saved = await saveVault(dir)
      setProblem('')
      setVaultNote(saved.notes === 0
        ? 'No day notes in that folder yet — the first day you log will start them.'
        : `${saved.notes} day ${saved.notes === 1 ? 'note' : 'notes'} there.`)
      load()
    } catch (err) {
      setProblem(err.message)
    }
  }

  if (!setup) return <p className="settingsnote">{problem || 'Reading the settings…'}</p>

  return (
    <div className="setup">
      {problem && <p className="settingsproblem" role="alert">{problem}</p>}

      <section className="settingsgroup">
        <h3>Your notes</h3>
        <p className="settingsnote">The folder your day notes live in — usually the Daily folder of your Obsidian vault.</p>
        <code className="vaultpath">{setup.vault}</code>
        {setup.nextVault && (
          <div className="vaultnext">
            <p className="settingsnote">
              Switches to <strong>{setup.nextVault}</strong> the next time the app starts.
              {vaultNote && ` ${vaultNote}`}
            </p>
            {desktop
              ? <button type="button" className="settingsbutton" onClick={() => desktop.restart()}>Restart now</button>
              : <p className="settingsnote">Close the app and start it again to switch.</p>}
          </div>
        )}
        {desktop ? (
          <button
            type="button"
            className="settingsbutton"
            onClick={async () => chooseFolder(await desktop.pickFolder(setup.nextVault || setup.vault))}
          >
            Choose a different folder…
          </button>
        ) : (
          <form className="keyrow" onSubmit={(e) => { e.preventDefault(); chooseFolder(typedVault) }}>
            <input
              type="text"
              placeholder="C:/Vaults/YourVault/Daily"
              value={typedVault}
              onChange={(e) => setTypedVault(e.target.value)}
            />
            <button type="submit" className="settingsbutton" disabled={!typedVault.trim()}>Use</button>
          </form>
        )}
      </section>

      <section className="settingsgroup">
        <h3>Game lookups</h3>
        <p className="settingsnote">
          Free keys, each for one job. Everything else in the app works without them.
        </p>
        {KEYS.map((key) => (
          <KeyField key={key.which} {...key} saved={setup.keys?.[key.which]} onSaved={load} />
        ))}
      </section>

      <section className="settingsgroup">
        <h3>Series and films</h3>
        <p className="settingsnote">
          Looked up on TMDB, for the Series and Movie tags. One free key from your TMDB account —
          either the API key or the longer read access token works.
        </p>
        <KeyField
          which="tmdbKey"
          name="TMDB"
          what="Finding series and films, their seasons, episodes and posters."
          where="https://www.themoviedb.org/settings/api"
          whereText="themoviedb.org/settings/api"
          saved={setup.keys?.tmdbKey}
          onSaved={load}
        />
        {/* TMDB asks for this wherever its data is used. */}
        <p className="settingsnote small">
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
      </section>

      <section className="settingsgroup">
        <h3>AniList</h3>
        <p className="settingsnote">
          {anilist?.connected
            ? `Connected as ${anilist.user?.name ?? 'you'}. Watched episodes can be sent from any anime card.`
            : 'Not connected. Anime works without it; to send watched episodes to your account, connect from the button on any anime card.'}
        </p>
      </section>
    </div>
  )
}

function KeyField({ which, name, what, where, whereText, saved, onSaved }) {
  const [value, setValue] = useState('')
  const [state, setState] = useState({ busy: false, message: '', bad: false })

  async function submit(key) {
    setState({ busy: true, message: key ? 'Checking it with the site…' : '', bad: false })
    try {
      await saveKey(which, key)
      setValue('')
      setState({ busy: false, message: key ? 'Works — saved.' : 'Removed.', bad: false })
      onSaved()
    } catch (err) {
      setState({ busy: false, message: err.message, bad: true })
    }
  }

  return (
    <div className="keyfield">
      <div className="keyhead">
        <span className="keyname">{name}</span>
        <span className={`keystate${saved ? ' set' : ''}`}>{saved ? 'Saved' : 'Not set'}</span>
      </div>
      <p className="settingsnote small">
        {what} Get one at <a href={where} target="_blank" rel="noreferrer">{whereText}</a>.
      </p>
      <form className="keyrow" onSubmit={(e) => { e.preventDefault(); submit(value.trim()) }}>
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={saved ? 'Paste a new key to replace it' : 'Paste the key here'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={`${name} key`}
        />
        <button type="submit" className="settingsbutton" disabled={state.busy || !value.trim()}>
          {state.busy ? 'Checking…' : 'Save'}
        </button>
      </form>
      {saved && !value && (
        <button type="button" className="settingsreset" onClick={() => submit('')} disabled={state.busy}>
          Remove this key
        </button>
      )}
      {state.message && (
        <p className={`keymessage${state.bad ? ' bad' : ''}`} role={state.bad ? 'alert' : undefined}>{state.message}</p>
      )}
    </div>
  )
}
