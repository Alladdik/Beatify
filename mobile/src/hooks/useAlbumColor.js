import { useState, useEffect } from 'react';

/**
 * Extracts the dominant (most frequent) mid-brightness color
 * from an image URL using an off-screen Canvas.
 * Returns { r, g, b } or null.
 */
async function extractDominantColor(src) {
  if (!src) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const SIZE = 80;
        const canvas = document.createElement('canvas');
        canvas.width = SIZE; canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

        // Quantize into 32-step buckets, skip near-black/white pixels
        const buckets = new Map();
        for (let i = 0; i < data.length; i += 4) {
          const [r, g, b, a] = [data[i], data[i+1], data[i+2], data[i+3]];
          if (a < 100) continue;
          const lum = 0.299*r + 0.587*g + 0.114*b;
          if (lum < 22 || lum > 230) continue;

          const qr = Math.round(r / 32) * 32;
          const qg = Math.round(g / 32) * 32;
          const qb = Math.round(b / 32) * 32;
          const key = (qr << 16) | (qg << 8) | qb;
          buckets.set(key, (buckets.get(key) || 0) + 1);
        }

        let maxCount = 0, bestKey = null;
        for (const [k, c] of buckets) {
          if (c > maxCount) { maxCount = c; bestKey = k; }
        }

        if (bestKey !== null) {
          const r = (bestKey >> 16) & 0xFF;
          const g = (bestKey >> 8)  & 0xFF;
          const b =  bestKey        & 0xFF;
          // Boost saturation slightly so muted colors look more vivid
          const max = Math.max(r,g,b), min = Math.min(r,g,b);
          const sat = max === 0 ? 0 : (max - min) / max;
          const boost = sat < 0.25 ? 1.4 : 1; // boost low-saturation colors
          resolve({
            r: Math.min(255, Math.round(r * boost)),
            g: Math.min(255, Math.round(g * boost)),
            b: Math.min(255, Math.round(b * boost)),
          });
        } else {
          resolve(null);
        }
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * React hook — returns { r, g, b } dominant color or null.
 * Re-runs whenever `src` changes.
 */
export function useAlbumColor(src) {
  const [color, setColor] = useState(null);

  useEffect(() => {
    if (!src) { setColor(null); return; }
    let cancelled = false;
    extractDominantColor(src).then(c => { if (!cancelled) setColor(c); });
    return () => { cancelled = true; };
  }, [src]);

  return color;
}
