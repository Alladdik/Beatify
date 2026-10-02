import { useEffect, useRef } from 'react';
import { subscribeMeter } from '../lib/meter';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** meter levels → axis values. Shared by the title and its live readout so they never disagree. */
export function axesFromMeter(m, range) {
  const lv = Math.min(1, m.level * 1.7);
  const bs = Math.min(1, m.bass * 1.5);
  return {
    wght: Math.round(range.wght[0] + (range.wght[1] - range.wght[0]) * lv),
    wdth: +(range.wdth[0] + (range.wdth[1] - range.wdth[0]) * bs).toFixed(1),
  };
}

/**
 * The signature interaction: type that breathes with the audio.
 * Writes the variable-font axes straight to the element (no React renders).
 *   wght follows overall loudness, wdth follows the bass.
 *
 * ref   → attach to the text element
 * range → { wght: [min, max], wdth: [min, max] }
 */
export function useAudioAxes(range = { wght: [440, 700], wdth: [96, 112] }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const [w0, w1] = range.wght;
    const [d0, d1] = range.wdth;
    if (reduced()) {
      el.style.fontVariationSettings = `'wght' ${(w0 + w1) / 2}, 'wdth' ${(d0 + d1) / 2}`;
      return;
    }
    const unsub = subscribeMeter((m) => {
      const a = axesFromMeter(m, range);
      el.style.fontVariationSettings = `'wght' ${a.wght}, 'wdth' ${a.wdth}`;
    });
    return () => { unsub(); el.style.fontVariationSettings = ''; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.wght[0], range.wght[1], range.wdth[0], range.wdth[1]]);

  return ref;
}
