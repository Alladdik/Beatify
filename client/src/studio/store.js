import { create } from 'zustand';
import toast from 'react-hot-toast';
import {
  emptyProject, resizeProject, activePattern, newTrack, newPattern, newId, STEPS_PER_BAR, DRUM_LANES, emptyLanes,
} from './presets';
import { generateProject, regeneratePart } from './generator';
import { StudioEngine, renderProject, audioBufferToWav } from './engine';
import { randomSeed } from './music';

const DRAFT_KEY = 'beatify_studio_draft';
const LIB_KEY = 'beatify_studio_projects';
const PANELS_KEY = 'beatify_studio_panels';

// FL-style workspace: which panels are open. Phones start with the essentials only.
function loadPanels() {
  const narrow = typeof window !== 'undefined' && window.innerWidth < 860;
  const def = { browser: !narrow, rack: true, roll: true, playlist: false, mixer: false };
  try { return { ...def, ...JSON.parse(localStorage.getItem(PANELS_KEY)) }; } catch { return def; }
}

// ── one engine for the page's lifetime (created on the first user gesture) ────────────────────────
let engine = null;
export function ensureEngine() {
  if (!engine) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    engine = new StudioEngine(new Ctx());
    engine.setProject(useStudio.getState().project);
  }
  return engine;
}
export const getEngine = () => engine;
export function disposeEngine() { engine?.dispose(); engine = null; }

function loadDraft() {
  try {
    const p = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (p?.v === 2 && p.patterns?.length) return p;
  } catch { /* none */ }
  return null;
}

export const readLibrary = () => { try { return JSON.parse(localStorage.getItem(LIB_KEY)) || []; } catch { return []; } };
const writeLibrary = (list) => { try { localStorage.setItem(LIB_KEY, JSON.stringify(list.slice(0, 40))); } catch { toast.error('Недостатньо місця в сховищі браузера'); } };

const HISTORY = 80;
const patchActive = (p, fn) => ({ ...p, patterns: p.patterns.map((x) => (x.id === p.active ? fn(x) : x)) });

const INITIAL_PROJECT = loadDraft() ?? generateProject({ genre: 'lofi', seed: randomSeed() });

export const useStudio = create((set, get) => ({
  project: INITIAL_PROJECT,
  past: [],
  future: [],
  playing: false,
  step: -1,
  selected: INITIAL_PROJECT.tracks[1]?.id ?? INITIAL_PROJECT.tracks[0]?.id ?? 'drums', // 'drums' | track id — open on a melodic channel so the Piano roll shows notes at once
  tool: 'draw',               // 'draw' | 'erase'
  snap: 1,                    // steps (1 = 1/16)
  recording: false,
  metronome: false,
  view: 'editor',             // legacy; the workspace now uses `panels`
  panels: loadPanels(),       // { browser, rack, roll, playlist, mixer }
  rendering: 0,               // 0 idle, 0–1 progress
  loop: 2,

  // ── history ─────────────────────────────────────────────────────────────
  /** Replace the project, remembering the old one for undo. */
  commit: (fn) => {
    const prev = get().project;
    const next = typeof fn === 'function' ? fn(prev) : fn;
    if (next === prev) return;
    set((s) => ({ project: next, past: [...s.past.slice(-HISTORY + 1), prev], future: [] }));
    engine?.setProject(next);
  },
  /** Live update (slider drags): no history entry; call checkpoint() on pointer-down first. */
  live: (fn) => {
    const next = fn(get().project);
    set({ project: next });
    engine?.setProject(next);
  },
  checkpoint: () => set((s) => ({ past: [...s.past.slice(-HISTORY + 1), s.project], future: [] })),
  undo: () => {
    const { past, project } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set((s) => ({ project: prev, past: s.past.slice(0, -1), future: [project, ...s.future] }));
    engine?.setProject(prev);
  },
  redo: () => {
    const { future, project } = get();
    if (!future.length) return;
    const next = future[0];
    set((s) => ({ project: next, future: s.future.slice(1), past: [...s.past, project] }));
    engine?.setProject(next);
  },

  // ── transport ───────────────────────────────────────────────────────────
  play: async (fromStart = false) => {
    const e = ensureEngine();
    e.setProject(get().project);
    e.metronome = get().metronome;
    if (e.playing) { e.stop(); await new Promise((r) => setTimeout(r, 30)); }
    await e.start(fromStart ? 0 : 0);
    set({ playing: true });
  },
  stop: () => { engine?.stop(); set({ playing: false, step: -1 }); },
  togglePlay: () => (get().playing ? get().stop() : get().play()),
  setMetronome: (on) => { if (engine) engine.metronome = on; set({ metronome: on }); },
  setStep: (step) => set({ step }),

  // ── project-level ───────────────────────────────────────────────────────
  setName: (name) => get().commit((p) => ({ ...p, name })),
  setBpm: (bpm) => get().commit((p) => ({ ...p, bpm: Math.max(40, Math.min(220, Math.round(bpm) || 100)) })),
  setSwing: (swing) => get().live((p) => ({ ...p, swing })),
  setKey: (key) => get().commit((p) => ({ ...p, key })),
  setScale: (scale) => get().commit((p) => ({ ...p, scale })),
  setBars: (bars) => get().commit((p) => resizeProject(p, bars)),
  setKit: (kit) => get().commit((p) => ({ ...p, drums: { ...p.drums, kit } })),
  setMaster: (patch) => get().live((p) => ({ ...p, master: { ...p.master, ...patch } })),
  newEmpty: () => { get().stop(); set({ project: emptyProject(), past: [], future: [], selected: 'drums' }); engine?.setProject(get().project); },
  generate: (opts) => {
    const wasPlaying = get().playing;
    const next = generateProject(opts);
    set((s) => ({ project: { ...next, id: s.project.id }, past: [...s.past.slice(-HISTORY + 1), s.project], future: [], selected: next.tracks[1]?.id ?? 'drums' }));
    engine?.setProject(get().project);
    if (wasPlaying) get().play();
  },
  regenerate: (part) => get().commit((p) => regeneratePart(p, part, randomSeed())),
  open: (project) => { get().stop(); set({ project, past: [], future: [], selected: 'drums' }); engine?.setProject(project); },

  // ── drum lane editing ───────────────────────────────────────────────────
  toggleDrum: (lane, i, vel = 0.85) => get().commit((p) => patchActive(p, (pt) => {
    const arr = [...pt.lanes[lane]];
    arr[i] = arr[i] > 0 ? 0 : vel;
    return { ...pt, lanes: { ...pt.lanes, [lane]: arr } };
  })),
  paintDrum: (lane, i, on, vel = 0.85) => get().live((p) => patchActive(p, (pt) => {
    if ((pt.lanes[lane][i] > 0) === on) return pt;
    const arr = [...pt.lanes[lane]]; arr[i] = on ? vel : 0;
    return { ...pt, lanes: { ...pt.lanes, [lane]: arr } };
  })),
  setDrumVel: (lane, i, vel) => get().live((p) => patchActive(p, (pt) => {
    const arr = [...pt.lanes[lane]]; arr[i] = vel;
    return { ...pt, lanes: { ...pt.lanes, [lane]: arr } };
  })),
  clearLane: (lane) => get().commit((p) => patchActive(p, (pt) => ({ ...pt, lanes: { ...pt.lanes, [lane]: new Array(pt.lanes[lane].length).fill(0) } }))),

  // ── note editing (active pattern) ───────────────────────────────────────
  addNote: (trackId, note, { history = true } = {}) => {
    const fn = (p) => patchActive(p, (pt) => ({ ...pt, notes: { ...pt.notes, [trackId]: [...(pt.notes[trackId] ?? []), note] } }));
    return history ? get().commit(fn) : get().live(fn);
  },
  updateNote: (trackId, index, patch) => get().live((p) => patchActive(p, (pt) => {
    const list = [...(pt.notes[trackId] ?? [])];
    if (!list[index]) return pt;
    list[index] = { ...list[index], ...patch };
    return { ...pt, notes: { ...pt.notes, [trackId]: list } };
  })),
  removeNote: (trackId, index) => get().commit((p) => patchActive(p, (pt) => ({ ...pt, notes: { ...pt.notes, [trackId]: (pt.notes[trackId] ?? []).filter((_, i) => i !== index) } }))),
  clearTrackNotes: (trackId) => get().commit((p) => patchActive(p, (pt) => ({ ...pt, notes: { ...pt.notes, [trackId]: [] } }))),
  transposeTrack: (trackId, semis) => get().commit((p) => patchActive(p, (pt) => ({ ...pt, notes: { ...pt.notes, [trackId]: (pt.notes[trackId] ?? []).map((n) => ({ ...n, p: Math.max(0, Math.min(127, n.p + semis)) })) } }))),

  // ── tracks / mixer ──────────────────────────────────────────────────────
  select: (id) => set({ selected: id }),
  setTool: (tool) => set({ tool }),
  setSnap: (snap) => set({ snap }),
  setView: (view) => set({ view }),
  togglePanel: (id, on) => {
    const panels = { ...get().panels, [id]: on ?? !get().panels[id] };
    set({ panels });
    try { localStorage.setItem(PANELS_KEY, JSON.stringify(panels)); } catch { /* quota */ }
  },
  setLoop: (loop) => set({ loop }),
  setRecording: (recording) => set({ recording }),
  addTrack: (inst) => {
    const t = newTrack(inst);
    get().commit((p) => ({ ...p, tracks: [...p.tracks, t], patterns: p.patterns.map((pt) => ({ ...pt, notes: { ...pt.notes, [t.id]: [] } })) }));
    set({ selected: t.id });
  },
  removeTrack: (id) => {
    get().commit((p) => ({ ...p, tracks: p.tracks.filter((t) => t.id !== id), patterns: p.patterns.map((pt) => { const n = { ...pt.notes }; delete n[id]; return { ...pt, notes: n }; }) }));
    if (get().selected === id) set({ selected: 'drums' });
  },
  setInst: (id, inst) => get().commit((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === id ? { ...t, inst } : t)) })),
  renameTrack: (id, name) => get().commit((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === id ? { ...t, name } : t)) })),
  setMixer: (id, patch, { history = false } = {}) => {
    const fn = (p) => (id === 'drums'
      ? { ...p, drums: { ...p.drums, mixer: { ...p.drums.mixer, ...patch } } }
      : { ...p, tracks: p.tracks.map((t) => (t.id === id ? { ...t, mixer: { ...t.mixer, ...patch } } : t)) });
    return history ? get().commit(fn) : get().live(fn);
  },

  // ── patterns & song ─────────────────────────────────────────────────────
  setActive: (id) => { get().commit((p) => ({ ...p, active: id })); },
  addPattern: (copy = false) => {
    const p = get().project;
    const name = String.fromCharCode(65 + p.patterns.length);
    const src = activePattern(p);
    const np = copy
      ? { ...JSON.parse(JSON.stringify(src)), id: newId('p'), name }
      : newPattern(p.bars, name, p.tracks.map((t) => t.id));
    get().commit((pr) => ({ ...pr, patterns: [...pr.patterns, np], active: np.id }));
  },
  removePattern: (id) => get().commit((p) => {
    if (p.patterns.length < 2) return p;
    const patterns = p.patterns.filter((x) => x.id !== id);
    return { ...p, patterns, song: p.song.filter((s) => s !== id), active: p.active === id ? patterns[0].id : p.active };
  }),
  clearPattern: () => get().commit((p) => patchActive(p, (pt) => ({ ...pt, lanes: emptyLanes(p.bars * STEPS_PER_BAR), notes: Object.fromEntries(p.tracks.map((t) => [t.id, []])) }))),
  songAdd: (id) => get().commit((p) => ({ ...p, song: [...p.song, id] })),
  songRemove: (i) => get().commit((p) => ({ ...p, song: p.song.filter((_, k) => k !== i) })),
  songMove: (i, to) => get().commit((p) => { const s = [...p.song]; const [x] = s.splice(i, 1); s.splice(to, 0, x); return { ...p, song: s }; }),
  setMode: (mode) => get().commit((p) => ({ ...p, mode })),

  // ── library ─────────────────────────────────────────────────────────────
  saveLocal: () => {
    const p = get().project;
    const id = p.id ?? newId('prj');
    const saved = { ...p, id, savedAt: Date.now() };
    set({ project: saved });
    const lib = readLibrary().filter((x) => x.id !== id);
    writeLibrary([saved, ...lib]);
    toast.success('Проєкт збережено на цьому пристрої');
    return saved;
  },

  // ── export ──────────────────────────────────────────────────────────────
  bounce: async () => {
    const { project, loop } = get();
    set({ rendering: 0.02 });
    try {
      const buffer = await renderProject(project, { loops: loop, onProgress: (v) => set({ rendering: Math.max(0.02, v) }) });
      const blob = audioBufferToWav(buffer);
      set({ rendering: 1 });
      setTimeout(() => set({ rendering: 0 }), 400);
      return { blob, seconds: buffer.duration };
    } catch (e) {
      set({ rendering: 0 });
      toast.error(`Не вдалося зібрати аудіо: ${e.message}`);
      return null;
    }
  },
}));

// Autosave the working draft
let saveTimer = null;
useStudio.subscribe((s, prev) => {
  if (s.project === prev.project) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(useStudio.getState().project)); } catch { /* quota */ } }, 900);
});

export { DRUM_LANES };
