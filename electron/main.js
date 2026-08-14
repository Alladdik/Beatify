const { app, BrowserWindow, ipcMain, nativeTheme, screen, protocol, net, globalShortcut, Tray, Menu, nativeImage, session } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');

// --dev  → load the Vite dev server (localhost:5173).
// otherwise → load the app straight from the .NET backend (localhost:5000),
//   which serves the built SPA (client/dist-web) on the same origin as the API.
//   Loading over http (not file://) makes window.location.hostname resolve to
//   "localhost", so every `http://<hostname>:5000` call in the client hits the
//   backend correctly — under file:// the hostname is empty and the API breaks.
const isDev      = process.argv.includes('--dev');
const SERVER_URL = 'http://localhost:5000';
const APP_URL    = isDev ? 'http://localhost:5173' : SERVER_URL;
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

  win.loadURL(APP_URL);

  return win;
}

// ── .NET backend process ──────────────────────────────────────────────────────
// The Electron shortcut owns the whole stack: it launches the backend itself,
// waits for it, and kills it on exit. Nothing has to be started by hand.
const SERVER_DIR = path.join(__dirname, '..', 'server');
let serverProc = null;

function resolveServerCmd() {
  const candidates = [
    path.join(SERVER_DIR, 'bin', 'Release', 'net10.0', 'BeatifyServer.exe'),
    path.join(SERVER_DIR, 'bin', 'Debug',   'net10.0', 'BeatifyServer.exe'),
  ];
  for (const exe of candidates) {
    if (fs.existsSync(exe)) return { cmd: exe, args: [] };
  }
  // Fallback: build & run through the SDK if no compiled exe is present.
  return { cmd: 'dotnet', args: ['run', '-c', 'Release', '--project', SERVER_DIR] };
}

function pingUrl(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => { res.resume(); resolve(true); });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => { req.destroy(); resolve(false); });
  });
}

async function startBackend() {
  // Already up (dev, or launched manually)? Don't spawn a second instance.
  if (await pingUrl(SERVER_URL)) return;
  const { cmd, args } = resolveServerCmd();
  try {
    // ASPNETCORE_CONTENTROOT (not --contentRoot) anchors config, the SPA path
    // (../client/dist-web) and uploads (wwwroot) to the project dir. Passing it
    // as an env var sidesteps command-line quoting issues with the space in
    // "D:\spotify clone".
    serverProc = spawn(cmd, args, {
      cwd: SERVER_DIR,
      windowsHide: true,
      stdio: 'ignore',
      env: { ...process.env, ASPNETCORE_CONTENTROOT: SERVER_DIR },
    });
    serverProc.on('error', (e) => console.error('[backend] failed to start:', e.message));
    serverProc.on('exit', () => { serverProc = null; });
  } catch (e) {
    console.error('[backend] spawn error:', e.message);
  }
}

function waitForUrl(url, timeoutMs = 25000) {
  const start = Date.now();
  return new Promise((resolve) => {
    (async function poll() {
      if (await pingUrl(url)) return resolve(true);
      if (Date.now() - start > timeoutMs) return resolve(false);
      setTimeout(poll, 400);
    })();
  });
}

function stopBackend() {
  if (serverProc && !serverProc.killed) {
    try { serverProc.kill(); } catch (_) {}
  }
  serverProc = null;
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

app.whenReady().then(async () => {
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

  // Bring up the backend (idempotent — skips if :5000 already answers), then
  // wait until the page we're about to load is reachable, so the window never
  // lands on a "connection refused" error page.
  startBackend();
  await waitForUrl(APP_URL, 25000);

  const win = createMainWindow();

  const reveal = () => {
    if (!splash.isDestroyed()) splash.destroy();
    if (!win.isDestroyed() && !win.isVisible()) { win.show(); win.focus(); }
  };
  win.once('ready-to-show', reveal);
  setTimeout(reveal, 8000);

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
    miniWin.loadURL(`${APP_URL}/#miniplayer`);
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

  // ── Windows Taskbar Thumbnail Toolbar ────────────────────────────────────────
  let _thumbIcons = null;
  let _thumbPlaying = false;

  function refreshThumbar() {
    if (process.platform !== 'win32' || !_thumbIcons || win.isDestroyed()) return;
    try {
      win.setThumbarButtons([
        {
          tooltip: 'Попередній трек',
          icon: _thumbIcons.prev,
          click: () => win.webContents.send('media:prev'),
        },
        {
          tooltip: _thumbPlaying ? 'Пауза' : 'Відтворити',
          icon: _thumbPlaying ? _thumbIcons.pause : _thumbIcons.play,
          click: () => win.webContents.send('media:playpause'),
        },
        {
          tooltip: 'Наступний трек',
          icon: _thumbIcons.next,
          click: () => win.webContents.send('media:next'),
        },
      ]);
    } catch (_) {}
  }

  // Renderer sends canvas-rendered icons (PNG data URLs) once on startup
  ipcMain.handle('thumbar:init', (_, icons) => {
    _thumbIcons = {
      prev:  nativeImage.createFromDataURL(icons.prev),
      play:  nativeImage.createFromDataURL(icons.play),
      pause: nativeImage.createFromDataURL(icons.pause),
      next:  nativeImage.createFromDataURL(icons.next),
    };
    refreshThumbar();
  });

  // Called whenever play state changes
  ipcMain.handle('thumbar:setState', (_, isPlaying) => {
    _thumbPlaying = isPlaying;
    refreshThumbar();
  });

  app.on('before-quit', () => { globalShortcut.unregisterAll(); stopBackend(); });

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

app.on('window-all-closed', () => { stopBackend(); if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });
