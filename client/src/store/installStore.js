import { create } from 'zustand';
import toast from 'react-hot-toast';
import { isElectron, isNative } from '../lib/config';

// Chrome fires `beforeinstallprompt` once, early — long before React mounts a button.
// This store registers the listeners at import time (main.jsx imports it first) and keeps
// the event so any component can offer "install" later.

const standalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches ||
   window.matchMedia?.('(display-mode: window-controls-overlay)').matches ||
   window.navigator.standalone === true);

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);

export const useInstallStore = create((set, get) => ({
  event: null,
  installed: isElectron || isNative || standalone(),

  install: async () => {
    const { event } = get();
    if (event) {
      event.prompt();
      const { outcome } = await event.userChoice;
      // the event is single-use either way
      set({ event: null, ...(outcome === 'accepted' ? { installed: true } : {}) });
      return;
    }
    // Chrome has no prompt to give (dismissed earlier, or another browser): show the manual way.
    toast(
      isIOS
        ? 'Safari: кнопка «Поділитися» → «На початковий екран».'
        : 'Chrome / Edge: меню ⋮ → «Збереження та поширення» → «Встановити Beatify» (або «Створити ярлик»).',
      { duration: 9000, icon: '📌' },
    );
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    useInstallStore.setState({ event: e });
  });
  window.addEventListener('appinstalled', () => {
    useInstallStore.setState({ event: null, installed: true });
    toast.success('Beatify встановлено — ярлик уже на робочому столі / в меню «Пуск»');
  });
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', (e) => {
    if (e.matches) useInstallStore.setState({ installed: true });
  });
}
