// Cover → accent. The playing cover's hue and chroma become the UI accent;
// lightness is fixed per theme in tokens.css, so contrast never depends on the art.

function srgbToLinear(v) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function rgbToOklch(r, g, b) {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(a, bb);
  let h = (Math.atan2(bb, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c: C, h };
}

const cache = new Map(); // url → { h, c } | null
const inflight = new Map();

/** Resolves { h, c } (OKLCH hue + clamped chroma) or null for grey / unreadable art. */
export function coverTint(src) {
  if (!src) return Promise.resolve(null);
  if (cache.has(src)) return Promise.resolve(cache.get(src));
  if (inflight.has(src)) return inflight.get(src);

  const p = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      try {
        const SIZE = 48;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = SIZE;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

        const BINS = 24;
        const wSum = new Float32Array(BINS);
        const cSum = new Float32Array(BINS);
        const x = new Float32Array(BINS);
        const y = new Float32Array(BINS);
        let total = 0;

        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue;
          const { l, c, h } = rgbToOklch(data[i], data[i + 1], data[i + 2]);
          if (l < 0.18 || l > 0.97 || c < 0.04) continue;
          const bin = Math.floor((h / 360) * BINS) % BINS;
          const w = c * c; // chromatic pixels count more than muddy ones
          wSum[bin] += w; cSum[bin] += c * w; total += w;
          x[bin] += Math.cos((h * Math.PI) / 180) * w;
          y[bin] += Math.sin((h * Math.PI) / 180) * w;
        }

        let best = -1, bestW = 0;
        for (let b = 0; b < BINS; b++) if (wSum[b] > bestW) { bestW = wSum[b]; best = b; }
        if (best < 0 || total < 0.5) { resolve(null); return; }

        let h = (Math.atan2(y[best], x[best]) * 180) / Math.PI;
        if (h < 0) h += 360;
        const c = Math.min(0.19, Math.max(0.085, cSum[best] / wSum[best]));
        resolve({ h: Math.round(h), c: Number(c.toFixed(3)) });
      } catch {
        resolve(null); // canvas tainted (no CORS) — keep default accent
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  }).then((res) => {
    cache.set(src, res);
    inflight.delete(src);
    return res;
  });

  inflight.set(src, p);
  return p;
}

/** Stable hue from a string — covers without art get their own colour. */
export function hueFromString(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}
