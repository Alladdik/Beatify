import { useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { useUiStore } from '../store/uiStore';
import { useLikesStore } from '../store/likesStore';
import { useThemeStore } from '../store/themeStore';

export const SHORTCUTS = [
  ['Space', 'Пауза / відтворення'],
  ['← →', 'Перемотка ±10 с'],
  ['↑ ↓', 'Гучність'],
  ['N / P', 'Наступний / попередній'],
  ['M', 'Вимкнути звук'],
  ['S', 'Перемішати'],
  ['R', 'Повтор'],
  ['L', 'Вподобати поточний'],
  ['Q', 'Черга'],
  ['T', 'Текст пісні'],
  ['E', 'Панель звуку'],
  ['F', 'Повний екран'],
  ['Ctrl K', 'Швидкий пошук і команди'],
  ['?', 'Ця підказка'],
];

const typing = (el) => !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e) => {
      const ui = useUiStore.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ui.toggleCmd(); return; }
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.body.dataset.studio === '1') return; // the studio owns the keyboard while it is open
      const p = usePlayerStore.getState();
      const seek = (d) => p.seek(Math.min(p.audio.duration || 0, Math.max(0, p.audio.currentTime + d)));

      switch (e.key) {
        case ' ': e.preventDefault(); p.togglePlay(); break;
        case 'ArrowRight': e.preventDefault(); seek(10); break;
        case 'ArrowLeft': e.preventDefault(); seek(-10); break;
        case 'ArrowUp': e.preventDefault(); p.setVolume(Math.min(1, +(p.volume + 0.05).toFixed(2))); break;
        case 'ArrowDown': e.preventDefault(); p.setVolume(Math.max(0, +(p.volume - 0.05).toFixed(2))); break;
        case 'n': case 'N': p.next(); break;
        case 'p': case 'P': case 'b': case 'B': p.prev(); break;
        case 'm': case 'M': p.setVolume(p.volume > 0 ? 0 : 0.8); break;
        case 's': case 'S': p.toggleShuffle(); break;
        case 'r': case 'R': p.cycleRepeat(); break;
        case 'l': case 'L': if (p.currentTrack?.id != null) useLikesStore.getState().toggle(p.currentTrack); break;
        case 'q': case 'Q': ui.toggleDock('queue'); break;
        case 't': case 'T': ui.toggleDock('lyrics'); break;
        case 'e': case 'E': ui.toggleDock('sound'); break;
        case 'f': case 'F': if (p.currentTrack) (ui.nowPlayingOpen ? ui.closeNowPlaying() : ui.openNowPlaying()); break;
        case '?': ui.toggleShortcuts(); break;
        case 'Escape':
          if (ui.nowPlayingOpen) ui.closeNowPlaying();
          else if (ui.shortcutsOpen) ui.toggleShortcuts();
          break;
        case 'D': if (e.shiftKey) useThemeStore.getState().cycle(); break;
        default:
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
