import { randomSeed } from './music';

export const STEPS_PER_BAR = 16;

export const DRUM_LANES = [
  { id: 'kick', name: 'Бас-бочка' },
  { id: 'snare', name: 'Малий барабан' },
  { id: 'clap', name: 'Клеп' },
  { id: 'hatC', name: 'Хет закритий' },
  { id: 'hatO', name: 'Хет відкритий' },
  { id: 'tom', name: 'Том' },
  { id: 'rim', name: 'Рім' },
  { id: 'crash', name: 'Тарілка' },
];

export const KITS = {
  standard: { label: 'Стандарт', kick: { f0: 150, f1: 48, decay: 0.38, click: 0.35 }, snare: { tone: 190, noise: 0.9, decay: 0.2 }, hat: { hp: 7500, decay: 0.045 } },
  trap808: { label: 'Trap 808', kick: { f0: 110, f1: 38, decay: 0.9, click: 0.15 }, snare: { tone: 210, noise: 0.7, decay: 0.16 }, hat: { hp: 9000, decay: 0.03 } },
  lofi: { label: 'Lo-Fi пил', kick: { f0: 130, f1: 52, decay: 0.3, click: 0.2 }, snare: { tone: 170, noise: 0.6, decay: 0.24 }, hat: { hp: 5200, decay: 0.06 } },
  house: { label: 'House', kick: { f0: 160, f1: 50, decay: 0.34, click: 0.45 }, snare: { tone: 200, noise: 1, decay: 0.17 }, hat: { hp: 8200, decay: 0.05 } },
  electro: { label: 'Electro', kick: { f0: 180, f1: 55, decay: 0.28, click: 0.55 }, snare: { tone: 230, noise: 0.8, decay: 0.14 }, hat: { hp: 10000, decay: 0.035 } },
};

// Instruments are recipes the engine knows how to build.
export const INSTRUMENTS = {
  lead:  { label: 'Лід',       desc: 'Яскравий пилкоподібний', vol: 0.55, reverb: 0.22, delay: 0.22, octave: 5 },
  pluck: { label: 'Щипок',     desc: 'Короткий щипок',          vol: 0.62, reverb: 0.2,  delay: 0.2,  octave: 5 },
  pad:   { label: 'Пад',       desc: 'М’який широкий',          vol: 0.42, reverb: 0.4,  delay: 0.1,  octave: 4 },
  keys:  { label: 'Клавіші',   desc: 'Електропіано (FM)',        vol: 0.55, reverb: 0.26, delay: 0.12, octave: 4 },
  bass:  { label: 'Бас',       desc: 'Круглий синтбас',          vol: 0.75, reverb: 0.02, delay: 0,    octave: 2 },
  sub808:{ label: '808',       desc: 'Довгий саб',               vol: 0.85, reverb: 0,    delay: 0,    octave: 1 },
  bell:  { label: 'Дзвіночки', desc: 'Скляні FM-дзвони',         vol: 0.4,  reverb: 0.5,  delay: 0.3,  octave: 6 },
  organ: { label: 'Орган',     desc: 'Гармонійний орган',        vol: 0.4,  reverb: 0.28, delay: 0.05, octave: 4 },
};

export const GENRES = {
  lofi:      { label: 'Lo-Fi',       bpm: [70, 88],   scale: ['minor', 'dorian'],     kit: 'lofi',     swing: 0.28, mood: 'тепло й сонно' },
  trap:      { label: 'Trap',        bpm: [130, 150], scale: ['minor', 'phrygian'],   kit: 'trap808',  swing: 0,    mood: 'темно й важко' },
  house:     { label: 'House',       bpm: [120, 126], scale: ['minor', 'dorian'],     kit: 'house',    swing: 0.05, mood: 'танцювально' },
  synthwave: { label: 'Synthwave',   bpm: [96, 112],  scale: ['minor', 'harmMinor'],  kit: 'electro',  swing: 0,    mood: 'неонова ностальгія' },
  ambient:   { label: 'Ambient',     bpm: [60, 78],   scale: ['lydian', 'major'],     kit: 'lofi',     swing: 0,    mood: 'простір і спокій' },
  pop:       { label: 'Pop',         bpm: [100, 124], scale: ['major', 'mixolydian'], kit: 'standard', swing: 0,    mood: 'світло й співуче' },
  dnb:       { label: 'Drum & Bass', bpm: [170, 176], scale: ['minor', 'dorian'],     kit: 'electro',  swing: 0,    mood: 'швидко й нервово' },
  chill:     { label: 'Chill',       bpm: [84, 98],   scale: ['pentMinor', 'dorian'], kit: 'standard', swing: 0.12, mood: 'легко й плавно' },
};

export const defaultMixer = (inst = 'lead') => ({
  volume: INSTRUMENTS[inst]?.vol ?? 0.6,
  pan: 0,
  mute: false,
  solo: false,
  reverb: INSTRUMENTS[inst]?.reverb ?? 0.2,
  delay: INSTRUMENTS[inst]?.delay ?? 0.1,
});

let idc = 0;
export const newId = (p = 't') => `${p}${Date.now().toString(36)}${(idc++).toString(36)}`;

export const emptyLanes = (steps) => Object.fromEntries(DRUM_LANES.map((l) => [l.id, new Array(steps).fill(0)]));

export function newTrack(inst = 'lead', name) {
  return { id: newId(), name: name ?? INSTRUMENTS[inst].label, inst, mixer: defaultMixer(inst) };
}

export function newPattern(bars, name, trackIds = []) {
  return { id: newId('p'), name, lanes: emptyLanes(bars * STEPS_PER_BAR), notes: Object.fromEntries(trackIds.map((id) => [id, []])) };
}

/**
 * Project model
 *  tracks    – instruments with their mixer strips (global)
 *  patterns  – drum lanes + notes per track (A, B, C …) — each `bars` long
 *  song      – ordered pattern ids; `mode: 'song'` plays them in sequence, `'pattern'` loops the active one
 */
export function emptyProject() {
  const tracks = [newTrack('lead', 'Мелодія'), newTrack('pad', 'Акорди'), newTrack('bass', 'Бас')];
  const bars = 4;
  const pat = newPattern(bars, 'A', tracks.map((t) => t.id));
  return {
    v: 2,
    id: null,
    name: 'Без назви',
    bpm: 100,
    swing: 0,
    key: 'C',
    scale: 'minor',
    bars,
    seed: randomSeed(),
    genre: 'lofi',
    master: { volume: 0.85, reverb: 0.2, delay: 0.14 },
    drums: { kit: 'standard', mixer: { volume: 0.8, pan: 0, mute: false, solo: false, reverb: 0.1, delay: 0 } },
    tracks,
    patterns: [pat],
    song: [],
    active: pat.id,
    mode: 'pattern',
  };
}

/** Grow or trim every pattern when the loop length changes. */
export function resizeProject(p, bars) {
  const steps = bars * STEPS_PER_BAR;
  return {
    ...p,
    bars,
    patterns: p.patterns.map((pt) => {
      const lanes = {};
      for (const l of DRUM_LANES) {
        const old = pt.lanes[l.id] ?? [];
        lanes[l.id] = Array.from({ length: steps }, (_, i) => (old.length ? old[i % old.length] : 0)); // repeat existing bars when growing
      }
      const notes = {};
      for (const [tid, list] of Object.entries(pt.notes)) {
        notes[tid] = list.filter((n) => n.t < steps).map((n) => ({ ...n, d: Math.min(n.d, steps - n.t) }));
      }
      return { ...pt, lanes, notes };
    }),
  };
}

export const activePattern = (p) => p.patterns.find((x) => x.id === p.active) ?? p.patterns[0];
