// The few things the page needs from the desktop that a web page cannot do
// for itself: Windows' own "choose a folder" window, starting the app again
// so a newly chosen vault is the one it opens, and new versions — hearing
// that one is out, fetching it, and restarting into it.
//
// Nothing else crosses over. The page still has no way to read files or run
// anything; it can only ask for these, by name.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('daily', {
  pickFolder: (start) => ipcRenderer.invoke('daily:pick-folder', String(start ?? '')),
  restart: () => ipcRenderer.invoke('daily:restart'),
  // Called with { state, ... } whenever there is news; answers a function
  // that stops listening.
  onUpdate: (listener) => {
    const handler = (_event, state) => listener(state)
    ipcRenderer.on('daily:update', handler)
    return () => ipcRenderer.removeListener('daily:update', handler)
  },
  downloadUpdate: () => ipcRenderer.invoke('daily:update-download'),
  installUpdate: () => ipcRenderer.invoke('daily:update-install'),
})
