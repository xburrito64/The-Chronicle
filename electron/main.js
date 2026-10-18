import { app, BrowserWindow, Menu, shell, dialog, screen, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import updater from 'electron-updater'
import { createApp } from '../server/app.js'
import { readJson } from '../server/config.js'
import { newTagsFor, iconsToAdd } from './carry.js'

const { autoUpdater } = updater

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, '..')

/**
 * Settings live in the user's app-data folder rather than inside the
 * installed program, so they can still be edited after installation. On
 * first run they are copied from the versions in the project.
 */
const settingsDir = app.getPath('userData')
// Where the settings were kept before the app was renamed to The Chronicle.
const formerSettingsDir = path.join(app.getPath('appData'), 'Daily Documentation')
// The page is served from this port, so that it is always the same page to
// the browser inside the window — and what it keeps, the look you picked
// among it, is still there next time. A port picked fresh each start was a
// new page every time, and the look went back to the default with it. Only
// if something else already has this port is another one taken, for that
// run.
const DESKTOP_PORT = 47863
const configFile = path.join(settingsDir, 'config.json')
const tagsFile = path.join(settingsDir, 'tags.json')
const tagIconsDir = path.join(settingsDir, 'tag-icons')

/**
 * The app was called Daily Documentation, and its settings were kept in a
 * folder of that name. The first time it starts as The Chronicle they are
 * copied across — the settings, the tags, the birthdays, the tag pictures —
 * so nothing has to be set up again. Copied, not moved: the old folder stays
 * where it was, as it was, and can be deleted by hand once all is well.
 */
function carryOverFromFormerName() {
  if (fs.existsSync(configFile) || !fs.existsSync(path.join(formerSettingsDir, 'config.json'))) return
  fs.mkdirSync(settingsDir, { recursive: true })
  for (const name of ['config.json', 'tags.json', 'tags.previous.json', 'birthdays.json', 'birthdays.previous.json']) {
    const from = path.join(formerSettingsDir, name)
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(settingsDir, name))
  }
  const icons = path.join(formerSettingsDir, 'tag-icons')
  if (fs.existsSync(icons)) fs.cpSync(icons, tagIconsDir, { recursive: true })
}

function seedSettings() {
  carryOverFromFormerName()
  fs.mkdirSync(settingsDir, { recursive: true })

  // config.json is kept out of git, so fall back to the example. An
  // installer only ever carries the example (see "files" in package.json):
  // the real one holds API keys and an AniList token, and an installer is
  // something handed to other people.
  const configSource = ['config.json', 'config.example.json']
    .map((name) => path.join(projectRoot, name))
    .find((file) => fs.existsSync(file))

  if (!fs.existsSync(configFile)) {
    if (configSource) fs.copyFileSync(configSource, configFile)
  } else if (configSource) {
    addMissingSettings(configSource)
  }

  if (!fs.existsSync(tagsFile)) {
    const source = path.join(projectRoot, 'tags.json')
    if (fs.existsSync(source)) fs.copyFileSync(source, tagsFile)
  }

  // Somewhere to drop tag images, with the instructions alongside them.
  fs.mkdirSync(tagIconsDir, { recursive: true })
  const readme = path.join(tagIconsDir, 'README.md')
  const readmeSource = path.join(projectRoot, 'tag-icons', 'README.md')
  if (!fs.existsSync(readme) && fs.existsSync(readmeSource)) {
    fs.copyFileSync(readmeSource, readme)
  }

  // A version that brings new tags or new icons brings them to an install
  // that already has its own copies too. Neither step is worth refusing to
  // start over, so a failure is only noted.
  try { addNewTags() } catch (err) { console.error('could not add the new tags:', err.message) }
  try { addShippedIcons() } catch (err) { console.error('could not add the new icons:', err.message) }
}

/**
 * Tags this version ships that the installed list has never been offered.
 *
 * The installed list is yours — renamed, recoloured, reordered in the app —
 * so it is never rewritten, only added to, and each new tag is offered once:
 * a tag you then delete stays deleted. Which have been offered is kept in a
 * small file beside the list. See carry.js for the rest.
 */
function addNewTags() {
  const source = path.join(projectRoot, 'tags.json')
  if (!fs.existsSync(source) || !fs.existsSync(tagsFile)) return
  const offeredFile = path.join(settingsDir, 'tags.offered.json')
  const offered = fs.existsSync(offeredFile) ? readJson(offeredFile) : null
  const { tags, offered: nowOffered, added } = newTagsFor(readJson(tagsFile), readJson(source), offered)
  if (added.length > 0) {
    fs.copyFileSync(tagsFile, path.join(settingsDir, 'tags.previous.json'))
    const tmp = `${tagsFile}.tmp-${process.pid}`
    fs.writeFileSync(tmp, `[\n${tags.map((tag) => `  ${JSON.stringify(tag)}`).join(',\n')}\n]\n`, 'utf8')
    fs.renameSync(tmp, tagsFile)
  }
  fs.writeFileSync(offeredFile, `${JSON.stringify(nowOffered)}\n`, 'utf8')
}

/**
 * The icon pictures this version ships, copied into the settings folder
 * wherever that tag has no picture there yet. A picture already there — one
 * you chose in the app, or one an earlier version brought — is never touched.
 */
function addShippedIcons() {
  const shipped = path.join(projectRoot, 'tag-icons')
  if (!fs.existsSync(shipped)) return
  for (const { from, to } of iconsToAdd(shipped, tagIconsDir)) {
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(from, to)
  }
}

/**
 * Give the installed settings any setting a newer version has added.
 *
 * The copy in the settings folder is made once and then belongs to whoever
 * is using it, which is what makes it editable — and also means a setting
 * introduced later would never appear in it. Somewhere to put a key is no
 * use if the file you are meant to put it in has never heard of it.
 *
 * Only ever adds. Anything already there keeps whatever it was set to, so
 * this can't quietly move the vault or undo a line that was typed in by hand.
 */
function addMissingSettings(source) {
  let current, wanted
  try {
    current = readJson(configFile)
    wanted = readJson(source)
  } catch {
    return // not ours to repair; the real read will report it properly
  }

  const added = Object.keys(wanted).filter((key) => !(key in current))
  if (added.length === 0) return
  for (const key of added) current[key] = wanted[key]
  fs.writeFileSync(configFile, `${JSON.stringify(current, null, 2)}\n`)
}

function startServer() {
  const config = readJson(configFile)
  const server = createApp({
    vaultDailyDir: config.vaultDailyDir,
    tagsFile,
    tagIconsDir,
    // Read again each time it is wanted, not captured here — the settings
    // file is something you edit with the app open.
    rawgKey: () => { try { return readJson(configFile).rawgKey } catch { return '' } },
    settingsFile: configFile,
    staticDir: path.join(projectRoot, 'dist'),
  })
  const listen = (port) => new Promise((resolve, reject) => {
    const listener = server.listen(port, '127.0.0.1', () => resolve(listener))
    listener.once('error', reject)
  })
  // Its own port if it is free; any free one if not (port 0 lets the system
  // choose), so the app still starts beside whatever has taken it.
  return listen(DESKTOP_PORT).catch((err) => {
    if (err.code !== 'EADDRINUSE') throw err
    return listen(0)
  })
}

function buildMenu(reload) {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'The Chronicle',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: reload },
        {
          label: 'Open settings folder',
          click: () => shell.openPath(settingsDir),
        },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
  ]))
}

/**
 * New versions, from the app's releases on GitHub.
 *
 * Asked once, a few seconds after the window opens: "is there a newer one?"
 * — a single request for a version number, with nothing about you or your
 * days in it. Nothing is downloaded until Install is pressed, and nothing is
 * installed until Restart is. The page draws all of it; this only answers
 * and carries out what it is asked.
 *
 * Only in the installed app. Running from the project folder there is no
 * installer to replace and nothing to update.
 */
function watchForUpdates(window) {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = updateLog()
  // The page is told everything, in one shape, and draws what it is told.
  const tell = (state) => { if (!window.isDestroyed()) window.webContents.send('daily:update', state) }

  autoUpdater.on('update-available', (info) => tell({
    state: 'available',
    version: info.version,
    notes: plainNotes(info.releaseNotes),
  }))
  autoUpdater.on('download-progress', (p) => tell({ state: 'downloading', percent: Math.round(p.percent ?? 0) }))
  autoUpdater.on('update-downloaded', (info) => tell({ state: 'ready', version: info.version }))
  autoUpdater.on('error', (err) => tell({ state: 'error', message: err?.message ?? String(err) }))

  ipcMain.handle('daily:update-download', () => autoUpdater.downloadUpdate().catch(() => {}))
  // Quietly, and open again afterwards: the installer runs without asking
  // its questions a second time, into the folder the app is already in.
  //
  // The app closes first, and the installer is only started a few seconds
  // after it has gone. Started straight away — the usual way — it begins by
  // taking the old version's files out of the folder while Windows is still
  // letting go of them, cannot move them, gives up without a word, and opens
  // the old version again: the update simply doesn't happen. Tested both
  // ways on the real installer; the pause is the difference.
  //
  // Handed to Windows to start (cmd's `start`) rather than started from
  // here, so it is not the app's own child and does not go when the app
  // does.
  ipcMain.handle('daily:update-install', () => {
    const installer = autoUpdater.installerPath
    if (!installer || !fs.existsSync(installer)) return autoUpdater.quitAndInstall(true, true)
    autoUpdater.logger.info(`Handing over to ${installer}`)
    // ping is the one way to wait in cmd without a window to wait in; nine
    // of them is about eight seconds. `start` takes an empty title first, so
    // the quoted path is what it runs. Written out whole and passed as it is:
    // left to quote each part itself, Node escapes quotes in a way cmd does
    // not read.
    const wait = 'ping -n 9 127.0.0.1 >nul'
    spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/c', `${wait} & start "" "${installer}" --updated /S --force-run`], {
      detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true,
    }).unref()
    // Long enough for the banner to say what is about to happen.
    setTimeout(() => app.quit(), 1500)
    return true
  })

  setTimeout(() => { autoUpdater.checkForUpdates().catch(() => {}) }, 5000)
}

/**
 * What the updater did, written to updater.log in the settings folder — on
 * this machine only, for working out an update that didn't take. Started
 * afresh once it grows past a couple of hundred kilobytes.
 */
function updateLog() {
  const file = path.join(settingsDir, 'updater.log')
  const write = (level) => (...parts) => {
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > 200_000) fs.writeFileSync(file, '')
      fs.appendFileSync(file, `${new Date().toISOString()} ${level} ${parts.map(String).join(' ')}\n`)
    } catch { /* a log that can't be written is not worth stopping for */ }
  }
  return { info: write('info'), warn: write('warn'), error: write('error'), debug: write('debug') }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' }

/**
 * GitHub sends a release's notes as HTML. The page shows them as plain lines
 * — a list item a line of its own, a heading a line of its own — so nothing
 * from outside is ever put into the page as markup.
 */
function plainNotes(notes) {
  const text = Array.isArray(notes) ? notes.map((n) => n?.note ?? '').join('\n') : String(notes ?? '')
  return text
    .replace(/<\/(p|li|h\d|div)>|<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#?\w+);/g, (whole, name) => ENTITIES[name] ?? whole)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 40)
}

/** A window of this size, or as much of it as the screen actually has. */
function fitToScreen(width, height) {
  const { workAreaSize } = screen.getPrimaryDisplay()
  return {
    width: Math.min(width, workAreaSize.width - 40),
    height: Math.min(height, workAreaSize.height - 40),
  }
}

async function main() {
  let listener
  try {
    seedSettings()
    listener = await startServer()
  } catch (err) {
    dialog.showErrorBox(
      'The Chronicle could not start',
      `${err.message}\n\nSettings folder:\n${settingsDir}`,
    )
    app.quit()
    return
  }

  const { port } = listener.address()

  // build/icon.ico if it has been added; Electron's default until then.
  const iconFile = path.join(projectRoot, 'build', 'icon.ico')

  const window = new BrowserWindow({
    // Wide by default: the bar is the app, and an hour is easier to aim at
    // when the day has room. Clamped to the screen so a smaller one still
    // gets a window it can move.
    ...fitToScreen(2000, 1150),
    minWidth: 900,
    minHeight: 600,
    ...(fs.existsSync(iconFile) ? { icon: iconFile } : {}),
    backgroundColor: '#17130f', // matches the page, so no white flash on open
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(here, 'preload.cjs'),
    },
  })

  buildMenu(() => window.reload())

  // What preload.cjs lets the page ask for. The folder window opens on top of
  // this one, where the current vault is; restarting is the only way a newly
  // chosen vault takes over, since the server is started with it.
  ipcMain.handle('daily:pick-folder', async (_event, start) => {
    const picked = await dialog.showOpenDialog(window, {
      title: 'Choose the folder your day notes are in',
      properties: ['openDirectory'],
      ...(start && fs.existsSync(start) ? { defaultPath: start } : {}),
    })
    return picked.canceled ? '' : picked.filePaths[0] ?? ''
  })
  ipcMain.handle('daily:restart', () => {
    app.relaunch()
    app.exit(0)
  })
  watchForUpdates(window)
  window.once('ready-to-show', () => window.show())
  window.loadURL(`http://127.0.0.1:${port}`)

  // Links to anywhere else open in the real browser, not in this window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Closing the window stops the server with it — the whole point of this
  // wrapper is that there is nothing left running afterwards.
  app.on('window-all-closed', () => {
    listener.close()
    app.quit()
  })
}

// One copy at a time; a second launch focuses the window that already exists.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows()
    if (window) {
      if (window.isMinimized()) window.restore()
      window.focus()
    }
  })
  app.whenReady().then(main)
}
