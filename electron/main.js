const { app, BrowserWindow, ipcMain, nativeTheme, screen, protocol, net, globalShortcut, Tray, Menu, nativeImage, session } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

// local:// serves offline copies to the <audio> element. Without these privileges Chromium treats it as an
// opaque scheme: no streaming, no range requests, so saved tracks refuse to play or seek.
protocol.registerSchemesAsPrivileged([
  { scheme: 'local', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true } },
]);

// --dev  → load the Vite dev server (localhost:5173).
// otherwise → load the app straight from the .NET backend (localhost:5000),
//   which serves the built SPA (client/dist-web) on the same origin as the API.
//   Loading over http (not file://) makes window.location.hostname resolve to
//   "localhost", so every `http://<hostname>:5000` call in the client hits the
//   backend correctly — under file:// the hostname is empty and the API breaks.
const isDev      = process.argv.includes('--dev');
const SERVER_URL = 'http://localhost:5000';
const APP_URL    = isDev ? 'http://localhost:5173' : SERVER_URL;
nativeTheme.themeSource = 'system';  // the app has its own Lab / Plate themes and follows the OS by default
const APP_ICON = path.join(__dirname, 'icon-256.png');

function createSplash() {
  const splash = new BrowserWindow({
    width: 380, height: 300,
    frame: false, transparent: true,
    resizable: false, center: true,
    alwaysOnTop: true, skipTaskbar: true, icon: APP_ICON,
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
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0c0c10' : '#f4f4f6',
    icon: APP_ICON,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  });

  // Links to other sites open in the system browser, never inside the app window
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) && !url.startsWith(SERVER_URL) && !url.startsWith(APP_URL)) { require('electron').shell.openExternal(url); }
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(SERVER_URL) && !url.startsWith(APP_URL)) { e.preventDefault(); if (/^https?:\/\//i.test(url)) require('electron').shell.openExternal(url); }
  });

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

const EXT_BY_TYPE = {
  'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/aac': '.aac',
  'audio/webm': '.webm', 'audio/ogg': '.ogg', 'audio/opus': '.opus', 'audio/flac': '.flac', 'audio/wav': '.wav',
  'audio/x-wav': '.wav', 'video/mp4': '.mp4', 'video/webm': '.webm',
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
};

/**
 * Download to a temp file and move it into place only when complete, so a dropped connection never leaves a
 * half-file that looks saved. Follows redirects. Resolves { ext, size } (ext taken from the Content-Type).
 */
function downloadFile(fileUrl, destBase, { fallbackExt = '', redirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const tmp = `${destBase}.part`;
    const fail = (err) => { fs.unlink(tmp, () => {}); reject(err); };
    const mod = fileUrl.startsWith('https') ? https : http;

    const req = mod.get(fileUrl, { headers: { 'User-Agent': 'Beatify' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        const next = new URL(res.headers.location, fileUrl).toString();
        downloadFile(next, destBase, { fallbackExt, redirects: redirects - 1 }).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) { res.resume(); fail(new Error(`HTTP ${res.statusCode}`)); return; }

      const type = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (type.startsWith('text/') || type === 'application/json') { res.resume(); fail(new Error('сервер повернув не файл')); return; }
      const expected = Number(res.headers['content-length']) || 0;
      const ext = EXT_BY_TYPE[type] || fallbackExt;

      const file = fs.createWriteStream(tmp);
      let received = 0;
      res.on('data', (c) => { received += c.length; });
      res.on('error', (e) => { file.destroy(); fail(e); });
      res.on('aborted', () => { file.destroy(); fail(new Error('зʼєднання перервано')); });
      file.on('error', fail);
      file.on('finish', () => {
        if (!received || (expected && received < expected)) { fail(new Error('файл завантажено не повністю')); return; }
        // drop an older copy that has a different extension
        removeOfflineFiles(path.dirname(destBase), path.basename(destBase));
        fs.rename(tmp, `${destBase}${ext}`, (err) => (err ? fail(err) : resolve({ ext, size: received })));
      });
      res.pipe(file);
    });
    req.setTimeout(60000, () => req.destroy(new Error('сервер не відповідає')));
    req.on('error', fail);
  });
}

function removeOfflineFiles(dir, base) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return; }
  for (const n of names) {
    if (n.startsWith(`${base}.`) && !n.endsWith('.part')) { try { fs.unlinkSync(path.join(dir, n)); } catch { /* in use / gone */ } }
  }
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
    const u = new URL(request.url); // local://tracks/42.mp3 → host "tracks", path "/42.mp3"
    const offlineDir = path.join(app.getPath('userData'), 'offline');
    const filePath = path.normalize(path.join(offlineDir, decodeURIComponent(u.host + u.pathname)));
    if (!filePath.startsWith(offlineDir + path.sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(filePath).toString(), { headers: request.headers, bypassCustomProtocolHandlers: true });
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
  ipcMain.handle('offline:download', async (_, { trackId, streamUrl, coverUrl }) => {
    const id = String(trackId);
    if (!/^[\w-]+$/.test(id)) throw new Error('Некоректний ідентифікатор треку');
    const offlineDir = path.join(app.getPath('userData'), 'offline');
    const tracksDir  = path.join(offlineDir, 'tracks');
    const coversDir  = path.join(offlineDir, 'covers');
    fs.mkdirSync(tracksDir, { recursive: true });
    fs.mkdirSync(coversDir, { recursive: true });

    const audio = await downloadFile(streamUrl, path.join(tracksDir, id), { fallbackExt: '.mp3' });
    const audioFile = `${id}${audio.ext}`;

    let coverFile = null;
    if (coverUrl) {
      try {
        const cover = await downloadFile(coverUrl, path.join(coversDir, id), { fallbackExt: '.jpg' });
        coverFile = `${id}${cover.ext}`;
      } catch { coverFile = null; /* a missing cover must not fail the track */ }
    }

    return {
      audioUrl:  `local://tracks/${audioFile}`,
      coverUrl:  coverFile ? `local://covers/${coverFile}` : null,
      audioPath: path.join(tracksDir, audioFile),
      size:      audio.size,
    };
  });

  // Remove offline track (whatever extension it was saved with)
  ipcMain.handle('offline:remove', (_, { trackId }) => {
    const id = String(trackId);
    if (!/^[\w-]+$/.test(id)) return { ok: false };
    const offlineDir = path.join(app.getPath('userData'), 'offline');
    ['tracks', 'covers'].forEach((dir) => removeOfflineFiles(path.join(offlineDir, dir), id));
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
