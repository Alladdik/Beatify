const { app, BrowserWindow, ipcMain, nativeTheme, screen, protocol, net, globalShortcut, Tray, Menu, nativeImage, session } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

const isDev = process.argv.includes('--dev') || !app.isPackaged;
nativeTheme.themeSource = 'dark';

function createSplash() {
  const splash = new BrowserWindow({
    width: 380, height: 300,
    frame: false, transparent: true,
    resizable: false, center: true,
    alwaysOnTop: true, skipTaskbar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  splash.loadFile(path.join(__dirname, 'splash.html'));
  return splash;
}

function createMainWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  const win = new BrowserWindow({
    width: Math.min(1440, width),
    height: Math.min(900, height),
    minWidth: 960, minHeight: 640,
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 14 },
    backgroundColor: '#08080f',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  });

  if (process.platform === 'win32') {
    try { win.setBackgroundMaterial('acrylic'); } catch (_) {}
  }

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../client/dist/index.html'));
  }

  return win;
}

function downloadFile(fileUrl, destPath) {
  return new Promise((resolve, reject) => {
    const mod = fileUrl.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    mod.get(fileUrl, (res) => {
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(destPath, () => {});
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => { file.close(); fs.unlink(destPath, () => {}); reject(err); });
  });
}

app.whenReady().then(() => {
  // ── Grant microphone / camera / media permissions ─────────────────────────
  // Without this Electron silently denies getUserMedia with no dialog shown.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const granted = ['media', 'microphone', 'camera', 'audioCapture', 'desktopCapture'].includes(permission);
    callback(granted);
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return ['media', 'microphone', 'camera', 'audioCapture'].includes(permission);
  });

  // Serve offline files via local:// protocol
  protocol.handle('local', (request) => {
    const urlPath = request.url.slice('local://'.length);
    const offlineDir = path.join(app.getPath('userData'), 'offline');
    const filePath = path.join(offlineDir, urlPath);
    return net.fetch(`file://${filePath}`);
  });

  const splash = createSplash();
  const win = createMainWindow();

  win.once('ready-to-show', () => {
    splash.destroy();
    win.show();
    win.focus();
  });

  setTimeout(() => {
    if (!win.isVisible()) { splash.destroy(); win.show(); }
  }, 8000);

  // Window controls
  ipcMain.handle('win:minimize',    (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
  ipcMain.handle('win:maximize',    (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w) return;
    w.isMaximized() ? w.unmaximize() : w.maximize();
  });
  ipcMain.handle('win:close',       (e) => BrowserWindow.fromWebContents(e.sender)?.close());
  ipcMain.handle('win:isMaximized', (e) => BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false);

  win.on('maximize',   () => win.webContents.send('win:maximizeChange', true));
  win.on('unmaximize', () => win.webContents.send('win:maximizeChange', false));

  // ── Media keys ──────────────────────────────────────────────────────────────
  globalShortcut.register('MediaPlayPause',     () => win.webContents.send('media:playpause'));
  globalShortcut.register('MediaNextTrack',     () => win.webContents.send('media:next'));
  globalShortcut.register('MediaPreviousTrack', () => win.webContents.send('media:prev'));
  globalShortcut.register('MediaStop',          () => win.webContents.send('media:stop'));

  // ── Mini Player window ───────────────────────────────────────────────────────
  let miniWin = null;

  function createMiniPlayer() {
    if (miniWin && !miniWin.isDestroyed()) { miniWin.show(); return; }
    miniWin = new BrowserWindow({
      width: 340, height: 96,
      frame: false, transparent: true, alwaysOnTop: true,
      resizable: false, skipTaskbar: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false,
      },
    });
    const url = isDev
      ? 'http://localhost:5173/#miniplayer'
      : `file://${path.join(__dirname, '../client/dist/index.html')}#miniplayer`;
    miniWin.loadURL(url);
    // Position: bottom-right corner
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
    miniWin.setPosition(sw - 360, sh - 120);
  }

  ipcMain.handle('miniPlayer:show', () => { win.minimize(); createMiniPlayer(); });
  ipcMain.handle('miniPlayer:hide', () => {
    if (miniWin && !miniWin.isDestroyed()) { miniWin.close(); miniWin = null; }
    win.restore(); win.focus();
  });
  ipcMain.handle('miniPlayer:move', (_, { x, y }) => {
    if (miniWin && !miniWin.isDestroyed()) miniWin.setPosition(x, y);
  });

  // Forward player state to mini window
  ipcMain.handle('player:setState', (_, state) => {
    if (miniWin && !miniWin.isDestroyed()) miniWin.webContents.send('player:state', state);
  });
  // Mini player controls → relay to main window
  ipcMain.handle('miniPlayer:control', (_, cmd) => win.webContents.send(`media:${cmd}`));

  app.on('before-quit', () => globalShortcut.unregisterAll());

  // Offline download
  ipcMain.handle('offline:download', async (_, { trackId, streamUrl, coverUrl, ext }) => {
    const offlineDir = path.join(app.getPath('userData'), 'offline');
    const tracksDir  = path.join(offlineDir, 'tracks');
    const coversDir  = path.join(offlineDir, 'covers');
    fs.mkdirSync(tracksDir, { recursive: true });
    fs.mkdirSync(coversDir, { recursive: true });

    const audioExt  = ext || '.mp3';
    const audioFile = `${trackId}${audioExt}`;
    const audioPath = path.join(tracksDir, audioFile);

    await downloadFile(streamUrl, audioPath);

    let coverFile = null;
    if (coverUrl) {
      const coverExt  = path.extname(coverUrl) || '.jpg';
      coverFile = `${trackId}${coverExt}`;
      try { await downloadFile(coverUrl, path.join(coversDir, coverFile)); } catch { coverFile = null; }
    }

    return {
      audioUrl:  `local://tracks/${audioFile}`,
      coverUrl:  coverFile ? `local://covers/${coverFile}` : null,
      audioPath,
    };
  });

  // Remove offline track
  ipcMain.handle('offline:remove', (_, { trackId }) => {
    const offlineDir = path.join(app.getPath('userData'), 'offline');
    ['tracks', 'covers'].forEach(dir => {
      ['.mp3', '.mp4', '.wav', '.flac', '.ogg', '.jpg', '.png', '.webp', '.jpeg'].forEach(ext => {
        const f = path.join(offlineDir, dir, `${trackId}${ext}`);
        try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* ignore */ }
      });
    });
    return { ok: true };
  });

  // Get offline storage info
  ipcMain.handle('offline:info', () => {
    const offlineDir = path.join(app.getPath('userData'), 'offline');
    const tracksDir  = path.join(offlineDir, 'tracks');
    let totalBytes = 0;
    let fileCount  = 0;
    try {
      if (fs.existsSync(tracksDir)) {
        for (const f of fs.readdirSync(tracksDir)) {
          try { totalBytes += fs.statSync(path.join(tracksDir, f)).size; fileCount++; } catch { /* skip */ }
        }
      }
    } catch { /* ignore */ }
    return { totalBytes, fileCount, offlineDir };
  });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });
