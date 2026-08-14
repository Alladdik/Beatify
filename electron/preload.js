const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize:    () => ipcRenderer.invoke('win:minimize'),
  maximize:    () => ipcRenderer.invoke('win:maximize'),
  close:       () => ipcRenderer.invoke('win:close'),
  isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
  platform:    process.platform,
  onMaximizeChange: (cb) => {
    const handler = (_, val) => cb(val);
    ipcRenderer.on('win:maximizeChange', handler);
    return () => ipcRenderer.removeListener('win:maximizeChange', handler);
  },

  // Offline storage
  downloadOffline: (opts) => ipcRenderer.invoke('offline:download', opts),
  removeOffline:   (opts) => ipcRenderer.invoke('offline:remove', opts),
  getOfflineInfo:  ()     => ipcRenderer.invoke('offline:info'),

  // Media key callbacks
  onMediaKey: (cb) => {
    const events = ['media:playpause','media:next','media:prev','media:stop'];
    const handlers = events.map(ev => {
      const h = (_, ...args) => cb(ev.replace('media:',''), ...args);
      ipcRenderer.on(ev, h);
      return { ev, h };
    });
    return () => handlers.forEach(({ ev, h }) => ipcRenderer.removeListener(ev, h));
  },
  // Mini player
  showMiniPlayer:    () => ipcRenderer.invoke('miniPlayer:show'),
  hideMiniPlayer:    () => ipcRenderer.invoke('miniPlayer:hide'),
  miniPlayerControl: (cmd) => ipcRenderer.invoke('miniPlayer:control', cmd),
  setPlayerState:    (state) => ipcRenderer.invoke('player:setState', state),
  thumbarInit:       (icons) => ipcRenderer.invoke('thumbar:init', icons),
  thumbarSetState:   (playing) => ipcRenderer.invoke('thumbar:setState', playing),
  onPlayerState: (cb) => {
    const h = (_, state) => cb(state);
    ipcRenderer.on('player:state', h);
    return () => ipcRenderer.removeListener('player:state', h);
  },
});
