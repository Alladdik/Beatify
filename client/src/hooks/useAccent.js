import { useEffect, useState } from 'react';
import { coverTint } from '../lib/color';
import { usePlayerStore } from '../store/playerStore';
import { coverUrl } from '../lib/config';

const DEFAULT = { h: 292, c: 0.13 };

/** App-wide: writes the playing cover's hue/chroma to :root so the whole UI follows the music. */
export function useGlobalAccent() {
  const cover = usePlayerStore((s) => coverUrl(s.currentTrack));

  useEffect(() => {
    let live = true;
    const root = document.documentElement;
    coverTint(cover).then((t) => {
      if (!live) return;
      const { h, c } = t ?? DEFAULT;
      root.style.setProperty('--accent-h', String(h));
      root.style.setProperty('--accent-c', String(c));
    });
    return () => { live = false; };
  }, [cover]);
}

/** Page-local: returns a style object for a `.tint` element wearing this cover's colour. */
export function useCoverTint(src) {
  const [tint, setTint] = useState(null);
  useEffect(() => {
    let live = true;
    if (!src) { setTint(null); return; }
    coverTint(src).then((t) => { if (live) setTint(t); });
    return () => { live = false; };
  }, [src]);
  return tint ? { '--accent-h': tint.h, '--accent-c': tint.c } : undefined;
}
