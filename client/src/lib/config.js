// Single source of truth for where the backend lives.
//
//  • Vite dev server (5173/5174/4173)  → backend on :5000 of the same host
//  • Served by the backend / nginx / Caddy → same origin (works behind HTTPS, any port)
//  • Capacitor / file:// shells         → user-configured server URL (Профіль → Сервер)
//
// Nothing else in the app may build a backend URL by hand.

const DEV_PORTS = new Set(['5173', '5174', '4173']);
const SERVER_KEY = 'beatify_server_url';

export const isNative = !!(typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.());
export const isElectron = !!(typeof window !== 'undefined' && window.electronAPI);

function readCustomServer() {
  try {
    const v = localStorage.getItem(SERVER_KEY);
    return v ? v.replace(/\/+$/, '') : null;
  } catch {
    return null;
  }
}

function resolveOrigin() {
  const custom = readCustomServer();
  if (custom) return custom;

  const { protocol, hostname, port, origin } = window.location;
  if (protocol === 'file:' || !hostname) return 'http://localhost:5000';
  if (DEV_PORTS.has(port)) return `${protocol}//${hostname}:5000`;
  if (isNative) return ''; // native shell with no server configured yet
  return origin;
}

export const API_ORIGIN = resolveOrigin();
export const API_URL = `${API_ORIGIN}/api`;
export const needsServerSetup = isNative && !API_ORIGIN;

export function setServerUrl(url) {
  const clean = (url || '').trim().replace(/\/+$/, '');
  try {
    if (clean) localStorage.setItem(SERVER_KEY, clean);
    else localStorage.removeItem(SERVER_KEY);
  } catch { /* storage blocked */ }
  window.location.reload();
}

export const getServerUrl = () => readCustomServer() ?? '';

export const hubUrl = (name) => `${API_ORIGIN}/hubs/${name}`;

export const fileUrl = (type, fileName) =>
  fileName ? `${API_ORIGIN}/uploads/${type}/${fileName}` : null;

export const coverUrl = (track) => {
  if (!track) return null;
  if (track.isExternal || (!track.coverPath && track.thumbnail)) return track.thumbnail ?? null;
  return fileUrl('covers', track.coverPath);
};

export const streamUrl = (id) => `${API_URL}/tracks/${id}/stream`;
