import { create } from 'zustand';

const KEY = 'beatify_theme';
const THEMES = ['system', 'dark', 'light'];

function read() {
  try {
    const v = localStorage.getItem(KEY);
    return THEMES.includes(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

function resolve(pref) {
  if (pref !== 'system') return pref;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function apply(pref) {
  const root = document.documentElement;
  root.dataset.theme = pref;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolve(pref) === 'light' ? '#f4f4f6' : '#0c0c10');
}

export const useThemeStore = create((set, get) => ({
  pref: read(),
  setPref: (pref) => {
    try { localStorage.setItem(KEY, pref); } catch { /* storage blocked */ }
    apply(pref);
    set({ pref });
  },
  cycle: () => {
    const next = THEMES[(THEMES.indexOf(get().pref) + 1) % THEMES.length];
    get().setPref(next);
  },
}));

// Apply immediately and follow the OS while on "system"
apply(read());
window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => {
  if (useThemeStore.getState().pref === 'system') apply('system');
});
