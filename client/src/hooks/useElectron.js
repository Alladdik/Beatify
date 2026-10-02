import { useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';

// Windows taskbar thumbnail buttons need real PNGs — draw them once on a canvas.
function drawIcon(draw, size = 20) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = ctx.strokeStyle = '#ffffff';
  draw(ctx, size);
  return c.toDataURL('image/png');
}

export function useElectron() {
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    if (api.thumbarInit) {
      api.thumbarInit({
        prev: drawIcon((ctx, s) => { ctx.fillRect(3, 4, 2.5, s - 8); ctx.beginPath(); ctx.moveTo(s - 4, 4); ctx.lineTo(7, s / 2); ctx.lineTo(s - 4, s - 4); ctx.fill(); }),
        play: drawIcon((ctx, s) => { ctx.beginPath(); ctx.moveTo(5, 3); ctx.lineTo(s - 3, s / 2); ctx.lineTo(5, s - 3); ctx.fill(); }),
        pause: drawIcon((ctx, s) => { ctx.fillRect(4, 3, 4.5, s - 6); ctx.fillRect(s - 8.5, 3, 4.5, s - 6); }),
        next: drawIcon((ctx, s) => { ctx.fillRect(s - 5.5, 4, 2.5, s - 8); ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(s - 7, s / 2); ctx.lineTo(4, s - 4); ctx.fill(); }),
      }).catch?.(() => {});
    }

    return api.onMediaKey?.((key) => {
      const s = usePlayerStore.getState();
      if (key === 'playpause' || key === 'stop') s.togglePlay();
      else if (key === 'next') s.next();
      else if (key === 'prev') s.prev();
    });
  }, []);
}
