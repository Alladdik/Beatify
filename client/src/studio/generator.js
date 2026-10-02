// Algorithmic composer. Not a neural network: a seeded, rule-based generator that writes chord progressions,
// bass, melody and drums from genre templates. The same seed always gives the same song.

import {
  NOTE_NAMES, SCALES, degreeToMidi, chordFromDegree, mulberry32, hashSeed, clamp, randomSeed,
} from './music';
import {
  GENRES, STEPS_PER_BAR, newTrack, newPattern, emptyLanes, defaultMixer,
} from './presets';

// ── Progressions as scale degrees (0 = tonic). One chord per bar unless noted. ─────────────────────
const PROGRESSIONS = {
  minor:   [[0, 5, 2, 6], [0, 3, 6, 2], [0, 5, 3, 4], [0, 6, 5, 6], [0, 2, 5, 6], [0, 3, 0, 4]],
  major:   [[0, 4, 5, 3], [0, 5, 3, 4], [0, 3, 4, 3], [0, 2, 3, 4], [5, 3, 0, 4], [0, 4, 3, 4]],
  dorian:  [[0, 3, 0, 6], [0, 1, 3, 0], [0, 3, 6, 3], [0, 6, 3, 0]],
  phrygian:[[0, 1, 0, 6], [0, 1, 6, 1], [0, 6, 5, 1]],
  lydian:  [[0, 1, 0, 4], [0, 4, 1, 0], [0, 1, 5, 4]],
  mixolydian: [[0, 6, 3, 0], [0, 6, 4, 0], [0, 3, 6, 3]],
  pentMinor: [[0, 5, 2, 6], [0, 3, 6, 2]],
  pentMajor: [[0, 4, 5, 3], [0, 5, 3, 4]],
  harmMinor: [[0, 3, 4, 0], [0, 5, 3, 4], [0, 3, 6, 4]],
};

// ── Drum patterns: 16 steps, values are velocities. `r` randomises ghost notes. ────────────────────
const L = (s) => s.split('').map((c) => (c === 'x' ? 1 : c === 'o' ? 0.6 : c === '.' ? 0 : 0.35));
const DRUMS = {
  lofi: {
    kick:  [L('x.......x.o.....'), L('x.....o.x.......'), L('x.......x..o..o.')],
    snare: [L('....x.......x...')],
    clap:  [L('................')],
    hatC:  [L('x.x.x.x.x.x.x.x.'), L('x.xox.x.x.xox.x.')],
    hatO:  [L('..............x.'), L('................')],
    rim:   [L('...........o....'), L('................')],
  },
  trap: {
    kick:  [L('x......x..x.....'), L('x.....x...x..o..'), L('x........xx.....')],
    snare: [L('........x.......')],
    clap:  [L('........x.......')],
    hatC:  [L('xxxxxxxxxxxxxxxx'), L('x.x.xxx.x.x.xx.x'), L('xxx.xxx.xxx.xx.x')],
    hatO:  [L('......x.......x.'), L('..........x.....')],
    tom:   [L('................')],
    crash: [L('x...............')],
  },
  house: {
    kick:  [L('x...x...x...x...')],
    snare: [L('................')],
    clap:  [L('....x.......x...')],
    hatC:  [L('..x...x...x...x.'), L('x.x.x.x.x.x.x.x.')],
    hatO:  [L('..x...x...x...x.')],
    rim:   [L('..x....x..x....x'), L('................')],
  },
  synthwave: {
    kick:  [L('x...x...x...x...'), L('x..ox...x..ox...')],
    snare: [L('....x.......x...')],
    clap:  [L('....x.......x...')],
    hatC:  [L('x.x.x.x.x.x.x.x.'), L('xxxxxxxxxxxxxxxx')],
    tom:   [L('..............x.')],
    crash: [L('x...............')],
  },
  ambient: {
    kick:  [L('x...............'), L('x.......o.......')],
    snare: [L('................')],
    hatC:  [L('....x.......x...'), L('................')],
    rim:   [L('......o.......o.')],
  },
  pop: {
    kick:  [L('x.......x.x.....'), L('x..o....x.......')],
    snare: [L('....x.......x...')],
    clap:  [L('....x.......x...')],
    hatC:  [L('x.x.x.x.x.x.x.x.'), L('xxxxxxxxxxxxxxxx')],
    hatO:  [L('..............x.')],
  },
  dnb: {
    kick:  [L('x.........x.....'), L('x.........x...o.'), L('x.....o...x.....')],
    snare: [L('....x.......x...'), L('....x.......x..o')],
    hatC:  [L('x.x.x.x.x.x.x.x.'), L('xxxxxxxxxxxxxxxx')],
    hatO:  [L('..x...x...x...x.')],
    crash: [L('x...............')],
  },
  chill: {
    kick:  [L('x.......x..o....'), L('x.....o.x.......')],
    snare: [L('....x.......x...')],
    clap:  [L('................')],
    hatC:  [L('x.x.x.x.x.x.x.x.'), L('..x...x...x...x.')],
    hatO:  [L('..............x.')],
    rim:   [L('...o.......o....')],
  },
};

const INSTR_BY_GENRE = {
  lofi:      { chords: 'keys',  melody: 'pluck', bass: 'bass',   arp: 'bell' },
  trap:      { chords: 'pad',   melody: 'bell',  bass: 'sub808', arp: 'pluck' },
  house:     { chords: 'keys',  melody: 'lead',  bass: 'bass',   arp: 'pluck' },
  synthwave: { chords: 'pad',   melody: 'lead',  bass: 'bass',   arp: 'pluck' },
  ambient:   { chords: 'pad',   melody: 'bell',  bass: 'sub808', arp: 'bell' },
  pop:       { chords: 'keys',  melody: 'lead',  bass: 'bass',   arp: 'pluck' },
  dnb:       { chords: 'pad',   melody: 'lead',  bass: 'bass',   arp: 'pluck' },
  chill:     { chords: 'keys',  melody: 'pluck', bass: 'bass',   arp: 'bell' },
};

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const range = (rng, [a, b]) => Math.round(a + rng() * (b - a));
const weighted = (rng, items) => {
  const total = items.reduce((s, i) => s + i[1], 0);
  let r = rng() * total;
  for (const [v, w] of items) { if ((r -= w) <= 0) return v; }
  return items[0][0];
};

function rootMidi(key, octave) { return 12 * (octave + 1) + NOTE_NAMES.indexOf(key); }

// ── Drums ─────────────────────────────────────────────────────────────────────
function writeDrums(rng, genre, bars, { intensity = 1, fill = true, minimal = false } = {}) {
  const steps = bars * STEPS_PER_BAR;
  const lanes = emptyLanes(steps);
  const tpl = DRUMS[genre] ?? DRUMS.pop;
  if (minimal) {
    for (let b = 0; b < bars; b++) { lanes.kick[b * 16] = 0.8; if (b % 2 === 1) lanes.hatC[b * 16 + 8] = 0.4; }
    return lanes;
  }
  for (let b = 0; b < bars; b++) {
    for (const lane of Object.keys(tpl)) {
      const pat = pick(rng, tpl[lane]);
      for (let i = 0; i < 16; i++) {
        let v = pat[i];
        if (v > 0 && lane === 'hatC') v *= 0.55 + 0.45 * rng();                           // human hat velocities
        if (v > 0 && lane !== 'crash') v = clamp(v * (0.88 + 0.12 * rng()) * intensity, 0.2, 1);
        if (lane === 'crash' && b % 4 !== 0) v = 0;
        lanes[lane][b * 16 + i] = v;
      }
    }
    // ghost notes and small variations
    if (rng() < 0.35 && lanes.snare) lanes.snare[b * 16 + 14] = 0.3;
    if (rng() < 0.3 && lanes.kick) lanes.kick[b * 16 + pick(rng, [6, 10, 11, 14])] = 0.55;
    if (fill && b === bars - 1) {                                                       // fill in the last bar
      const f = pick(rng, [[12, 13, 14, 15], [13, 14, 15], [10, 12, 14, 15]]);
      f.forEach((s, i) => { lanes.snare[b * 16 + s] = 0.45 + i * 0.14; if (lanes.tom && rng() < 0.4) lanes.tom[b * 16 + s] = 0.6; });
      if (lanes.hatC) for (let s = 12; s < 16; s++) lanes.hatC[b * 16 + s] = 0;
    }
  }
  return lanes;
}

// ── Chords ────────────────────────────────────────────────────────────────────
function writeChords(rng, p, progression, { style, octave }) {
  const notes = [];
  const base = rootMidi(p.key, octave);
  progression.forEach((deg, bar) => {
    const seventh = ['lofi', 'chill', 'house', 'synthwave'].includes(p.genre) || rng() < 0.3;
    const ninth = p.genre === 'lofi' && rng() < 0.35;
    const chord = chordFromDegree(base, p.scale, deg, { seventh, ninth });
    // keep voicings compact: fold top notes down when the chord climbs too high
    const voiced = chord.map((n, i) => (i >= 3 && n > base + 19 ? n - 12 : n));
    const t0 = bar * 16;
    if (style === 'sustain') voiced.forEach((n) => notes.push({ t: t0, d: 16, p: n, v: 0.6 }));
    else if (style === 'stabs') {
      const hits = pick(rng, [[0, 6, 10], [0, 3, 8, 11], [0, 8], [2, 6, 10, 14]]);
      hits.forEach((h) => voiced.forEach((n) => notes.push({ t: t0 + h, d: 3, p: n, v: 0.55 + rng() * 0.2 })));
    } else if (style === 'offbeat') {
      [2, 6, 10, 14].forEach((h) => voiced.forEach((n) => notes.push({ t: t0 + h, d: 2, p: n, v: 0.6 })));
    } else { // 'comp' — two chord hits per bar with a gentle push
      [0, pick(rng, [6, 7, 10])].forEach((h, i) => voiced.forEach((n) => notes.push({ t: t0 + h, d: i === 0 ? 6 : 8, p: n, v: 0.55 + rng() * 0.15 })));
    }
  });
  return notes;
}

// ── Bass ──────────────────────────────────────────────────────────────────────
function writeBass(rng, p, progression, { octave }) {
  const notes = [];
  const base = rootMidi(p.key, octave);
  const g = p.genre;
  progression.forEach((deg, bar) => {
    const root = degreeToMidi(base, p.scale, deg);
    const fifth = degreeToMidi(base, p.scale, deg + 4);
    const oct = root + 12;
    const t0 = bar * 16;
    if (g === 'trap' || g === 'ambient') {
      notes.push({ t: t0, d: g === 'trap' ? pick(rng, [6, 8, 12]) : 16, p: root, v: 0.95 });
      if (g === 'trap' && rng() < 0.7) notes.push({ t: t0 + pick(rng, [10, 11]), d: 4, p: rng() < 0.5 ? root : fifth, v: 0.8 });
      if (g === 'trap' && rng() < 0.4) notes.push({ t: t0 + 14, d: 2, p: root, v: 0.7 });
    } else if (g === 'house') {
      [2, 6, 10, 14].forEach((h) => notes.push({ t: t0 + h, d: 2, p: h === 14 && rng() < 0.4 ? fifth : root, v: 0.85 }));
    } else if (g === 'dnb') {
      [0, 3, 6, 10, 12].forEach((h, i) => notes.push({ t: t0 + h, d: i % 2 ? 2 : 3, p: i === 2 ? fifth : root, v: 0.85 }));
    } else if (g === 'synthwave') {
      for (let s = 0; s < 16; s += 2) notes.push({ t: t0 + s, d: 2, p: s % 8 === 6 ? oct : root, v: 0.75 });
    } else if (g === 'pop') {
      [0, 4, 8, 11].forEach((h, i) => notes.push({ t: t0 + h, d: i === 3 ? 4 : 3, p: i === 3 ? fifth : root, v: 0.8 }));
    } else { // lofi / chill — relaxed, behind the beat
      notes.push({ t: t0, d: 6, p: root, v: 0.85 });
      notes.push({ t: t0 + 8, d: 4, p: rng() < 0.5 ? root : fifth, v: 0.7 });
      if (rng() < 0.5) notes.push({ t: t0 + 12, d: 3, p: oct, v: 0.6 });
    }
  });
  return notes;
}

// ── Melody ────────────────────────────────────────────────────────────────────
const RHYTHMS = [
  [0, 3, 6, 8, 11],       // syncopated
  [0, 4, 8, 12],          // quarter notes
  [0, 2, 4, 6, 8, 10, 12], // steady eighths
  [0, 6, 8, 14],          // sparse
  [0, 3, 4, 7, 10, 12],
  [2, 6, 10, 13],         // off-beat
];

function writeMelody(rng, p, progression, { octave, density = 1, register = 0 }) {
  const notes = [];
  const base = rootMidi(p.key, octave) + register;
  const motifRhythm = pick(rng, RHYTHMS);
  // motif = scale-degree offsets relative to the chord root
  const motif = motifRhythm.map(() => weighted(rng, [[0, 3], [1, 3], [2, 4], [-1, 2], [3, 2], [4, 2], [-2, 1]]));
  let last = 0;

  progression.forEach((chordDeg, bar) => {
    const variation = bar % 4; // call → answer → call → resolve
    const t0 = bar * 16;
    const rhythm = variation === 3 ? motifRhythm.filter((_, i) => i % 2 === 0 || rng() < 0.4) : motifRhythm;
    rhythm.forEach((h, i) => {
      if (rng() > 0.82 + density * 0.15 - (variation === 1 ? 0.18 : 0)) return; // leave room to breathe
      const strong = h % 4 === 0;
      let deg;
      if (strong) deg = chordDeg + pick(rng, [0, 2, 4]);                                  // chord tones on strong beats
      else deg = chordDeg + motif[i % motif.length] + (variation === 1 ? 1 : 0) + (variation === 2 ? -1 : 0);
      // stepwise motion is the default; occasional leaps
      if (Math.abs(deg - last) > 4 && rng() < 0.7) deg = last + Math.sign(deg - last) * pick(rng, [1, 2]);
      last = deg;
      const nextH = rhythm[i + 1] ?? 16;
      const len = clamp(Math.min(nextH - h, pick(rng, [1, 2, 2, 3, 4, 6])), 1, 8);
      notes.push({ t: t0 + h, d: len, p: degreeToMidi(base, p.scale, deg), v: 0.62 + rng() * 0.3 });
    });
    // resolve: the last bar of a phrase lands on tonic/fifth
    if (bar === progression.length - 1) {
      const land = pick(rng, [0, 0, 4, 2]);
      notes.push({ t: t0 + 12, d: 4, p: degreeToMidi(base, p.scale, land), v: 0.8 });
    }
  });
  // remove overlaps on the same step
  const seen = new Set();
  return notes.filter((nt) => { const k = nt.t; if (seen.has(k)) return false; seen.add(k); return true; })
    .map((nt) => ({ ...nt, p: clamp(nt.p, 36, 96) }));
}

function writeArp(rng, p, progression, { octave }) {
  const notes = [];
  const base = rootMidi(p.key, octave);
  const dir = pick(rng, ['up', 'updown', 'skip']);
  progression.forEach((deg, bar) => {
    const chord = chordFromDegree(base, p.scale, deg, { seventh: rng() < 0.4 });
    const seq = dir === 'up' ? [...chord, chord[0] + 12] : dir === 'updown' ? [...chord, chord[1] + 12, ...chord.slice().reverse().slice(1)] : [chord[0], chord[2], chord[1], chord[2] + 0, chord[0] + 12, chord[1]];
    for (let s = 0; s < 16; s += 2) {
      if (rng() < 0.12) continue;
      notes.push({ t: bar * 16 + s, d: 2, p: seq[(s / 2) % seq.length], v: 0.45 + rng() * 0.2 });
    }
  });
  return notes;
}

// ── Public API ────────────────────────────────────────────────────────────────
export function pickProgression(rng, scale, bars) {
  const pool = PROGRESSIONS[scale] ?? PROGRESSIONS.minor;
  const base = pick(rng, pool);
  const out = [];
  for (let i = 0; i < bars; i++) out.push(base[i % base.length]);
  if (bars >= 8) { out[bars - 1] = pick(rng, [4, 4, 6, 5]); }                         // turn-around into the loop
  return out;
}

/**
 * Compose a whole project.
 * opts: { genre, key, scale, bpm, bars, seed, name }
 */
export function generateProject(opts = {}) {
  const genreId = GENRES[opts.genre] ? opts.genre : 'lofi';
  const g = GENRES[genreId];
  const seed = opts.seed || randomSeed();
  const rng = mulberry32(hashSeed(`${seed}|${genreId}|${opts.key ?? ''}|${opts.scale ?? ''}`));

  const key = opts.key ?? pick(rng, NOTE_NAMES);
  const scale = opts.scale ?? pick(rng, g.scale);
  const bpm = opts.bpm ?? range(rng, g.bpm);
  const bars = opts.bars ?? 4;
  const inst = INSTR_BY_GENRE[genreId];

  const tracks = [
    newTrack(inst.chords, 'Акорди'),
    newTrack(inst.melody, 'Мелодія'),
    newTrack(inst.bass, 'Бас'),
    newTrack(inst.arp, 'Арпеджіо'),
  ];
  const [chords, melody, bass, arp] = tracks;
  // gentle stereo image
  melody.mixer.pan = -0.12; arp.mixer.pan = 0.2; chords.mixer.pan = 0.05;

  const prog = pickProgression(rng, scale, bars);
  const ctxP = { genre: genreId, key, scale };

  const chordStyle = { lofi: 'comp', trap: 'sustain', house: 'offbeat', synthwave: 'sustain', ambient: 'sustain', pop: 'comp', dnb: 'sustain', chill: 'comp' }[genreId];
  const mk = (variant) => {
    const pat = newPattern(bars, variant, tracks.map((t) => t.id));
    const lift = variant === 'B';
    const calm = variant === 'C';
    pat.lanes = writeDrums(rng, genreId, bars, { intensity: lift ? 1.08 : 1, fill: !calm, minimal: calm });
    pat.notes[chords.id] = writeChords(rng, ctxP, prog, { style: lift && genreId !== 'ambient' ? (chordStyle === 'sustain' ? 'stabs' : chordStyle) : chordStyle, octave: inst.chords === 'pad' ? 3 : 4 });
    pat.notes[bass.id] = calm ? writeBass(rng, ctxP, prog, { octave: 2 }).filter((_, i) => i % 3 === 0) : writeBass(rng, ctxP, prog, { octave: genreId === 'trap' ? 1 : 2 });
    pat.notes[melody.id] = writeMelody(rng, ctxP, prog, { octave: 5, density: lift ? 1.2 : calm ? 0.4 : 0.9, register: lift ? 7 : 0 });
    pat.notes[arp.id] = calm || genreId === 'trap' && !lift ? [] : (rng() < 0.75 ? writeArp(rng, ctxP, prog, { octave: 5 }) : []);
    return pat;
  };

  const A = mk('A');
  const B = mk('B');
  const C = mk('C');
  const patterns = [A, B, C];
  const song = [C.id, A.id, A.id, B.id, A.id, B.id, B.id, C.id];

  const kit = g.kit;
  const swing = g.swing;
  return {
    v: 2,
    id: opts.id ?? null,
    name: opts.name || `${g.label} · ${key} ${SCALES[scale].label.toLowerCase()}`,
    bpm,
    swing,
    key,
    scale,
    bars,
    seed,
    genre: genreId,
    master: { volume: 0.85, reverb: genreId === 'ambient' ? 0.4 : 0.2, delay: genreId === 'ambient' || genreId === 'synthwave' ? 0.24 : 0.12 },
    drums: { kit, mixer: { volume: genreId === 'ambient' ? 0.5 : 0.8, pan: 0, mute: false, solo: false, reverb: 0.1, delay: 0 } },
    tracks,
    patterns,
    song,
    active: A.id,
    mode: 'pattern',
  };
}

/** Rewrite only one part of the active pattern, keeping everything else (and the same chords). */
export function regeneratePart(project, part, newSeed = randomSeed()) {
  const rng = mulberry32(hashSeed(`${project.seed}|${part}|${newSeed}`));
  const pat = project.patterns.find((x) => x.id === project.active) ?? project.patterns[0];
  const ctxP = { genre: project.genre, key: project.key, scale: project.scale };
  const bars = project.bars;
  const prog = pickProgression(mulberry32(hashSeed(`${project.seed}|prog`)), project.scale, bars);

  const byRole = (ins) => project.tracks.find((t) => ins.includes(t.inst));
  const next = { ...pat, lanes: { ...pat.lanes }, notes: { ...pat.notes } };

  if (part === 'drums') next.lanes = writeDrums(rng, project.genre, bars, {});
  const melodyTrack = project.tracks[1] ?? byRole(['lead', 'pluck', 'bell']);
  const chordTrack = project.tracks[0] ?? byRole(['pad', 'keys']);
  const bassTrack = project.tracks[2] ?? byRole(['bass', 'sub808']);
  if (part === 'melody' && melodyTrack) next.notes[melodyTrack.id] = writeMelody(rng, ctxP, prog, { octave: 5, density: 0.9, register: 0 });
  if (part === 'chords' && chordTrack) next.notes[chordTrack.id] = writeChords(rng, ctxP, prog, { style: pick(rng, ['comp', 'sustain', 'stabs']), octave: chordTrack.inst === 'pad' ? 3 : 4 });
  if (part === 'bass' && bassTrack) next.notes[bassTrack.id] = writeBass(rng, ctxP, prog, { octave: project.genre === 'trap' ? 1 : 2 });

  return { ...project, patterns: project.patterns.map((x) => (x.id === pat.id ? next : x)) };
}

export { defaultMixer };
