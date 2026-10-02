// Music theory helpers shared by the generator, the piano roll and the engine.

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const KEYS = NOTE_NAMES;

export const SCALES = {
  minor:      { label: 'Мінор',            steps: [0, 2, 3, 5, 7, 8, 10] },
  major:      { label: 'Мажор',            steps: [0, 2, 4, 5, 7, 9, 11] },
  dorian:     { label: 'Дорійський',       steps: [0, 2, 3, 5, 7, 9, 10] },
  phrygian:   { label: 'Фрігійський',      steps: [0, 1, 3, 5, 7, 8, 10] },
  lydian:     { label: 'Лідійський',       steps: [0, 2, 4, 6, 7, 9, 11] },
  mixolydian: { label: 'Міксолідійський',  steps: [0, 2, 4, 5, 7, 9, 10] },
  pentMinor:  { label: 'Пентатоніка мінор', steps: [0, 3, 5, 7, 10] },
  pentMajor:  { label: 'Пентатоніка мажор', steps: [0, 2, 4, 7, 9] },
  harmMinor:  { label: 'Гармонічний мінор', steps: [0, 2, 3, 5, 7, 8, 11] },
  chromatic:  { label: 'Хроматика',        steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
};

export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const noteName = (m) => `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
export const isBlackKey = (m) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);

/** Pitch classes (0–11) belonging to a key + scale. */
export function scalePitchClasses(key, scale) {
  const root = typeof key === 'number' ? key : NOTE_NAMES.indexOf(key);
  return new Set((SCALES[scale]?.steps ?? SCALES.minor.steps).map((s) => (root + s) % 12));
}

export const inScale = (midi, key, scale) => scalePitchClasses(key, scale).has(((midi % 12) + 12) % 12);

/** MIDI note of scale degree `deg` (0-based, may be negative / > length) in the octave of `rootMidi`. */
export function degreeToMidi(rootMidi, scale, deg) {
  const steps = SCALES[scale]?.steps ?? SCALES.minor.steps;
  const n = steps.length;
  const oct = Math.floor(deg / n);
  const idx = ((deg % n) + n) % n;
  return rootMidi + steps[idx] + oct * 12;
}

/** Triad / seventh chord on scale degree, built by stacking scale thirds. */
export function chordFromDegree(rootMidi, scale, deg, { seventh = false, ninth = false } = {}) {
  const tones = [0, 2, 4];
  if (seventh) tones.push(6);
  if (ninth) tones.push(8);
  return tones.map((t) => degreeToMidi(rootMidi, scale, deg + t));
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Deterministic PRNG so a seed reproduces a song. */
export function mulberry32(seedNum) {
  let a = seedNum >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) { h ^= String(str).charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const randomSeed = () => Math.random().toString(36).slice(2, 8).toUpperCase();
