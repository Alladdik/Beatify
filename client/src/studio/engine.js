// Beatify Studio audio engine — pure Web Audio, no samples. Everything is synthesised.
// The same engine drives live playback (AudioContext + lookahead scheduler) and bounce-to-WAV (OfflineAudioContext).

import { midiToFreq } from './music';
import { KITS, STEPS_PER_BAR } from './presets';

const LOOKAHEAD = 0.14;   // seconds scheduled ahead of the clock
const TICK_MS = 28;

function makeImpulse(ctx, seconds = 2.4, decay = 2.2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, decay);
      lp += ((Math.random() * 2 - 1) - lp) * (0.35 - (i / len) * 0.25); // air absorption: tail gets darker
      d[i] = lp * env * 2.2;
    }
  }
  return buf;
}

function makeNoise(ctx, seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function softClipCurve(amount = 2.2) {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * amount) / Math.tanh(amount); }
  return c;
}

export class StudioEngine {
  constructor(ctx) {
    this.ctx = ctx;
    this.project = null;
    this.buses = new Map();
    this.noise = makeNoise(ctx);
    this.clipCurve = softClipCurve();
    this.metronome = false;

    // ── master chain ──
    this.masterIn = ctx.createGain();
    this.masterGain = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -9; this.comp.knee.value = 10; this.comp.ratio.value = 5;
    this.comp.attack.value = 0.004; this.comp.release.value = 0.12;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024; this.analyser.smoothingTimeConstant = 0.8;
    this.masterIn.connect(this.masterGain); this.masterGain.connect(this.comp); this.comp.connect(this.analyser); this.analyser.connect(ctx.destination);

    // ── send effects ──
    this.reverbIn = ctx.createGain();
    this.reverb = ctx.createConvolver(); this.reverb.buffer = makeImpulse(ctx);
    this.reverbOut = ctx.createGain();
    this.reverbIn.connect(this.reverb); this.reverb.connect(this.reverbOut); this.reverbOut.connect(this.masterIn);

    this.delayIn = ctx.createGain();
    this.delay = ctx.createDelay(2);
    this.delayFb = ctx.createGain(); this.delayFb.gain.value = 0.38;
    this.delayTone = ctx.createBiquadFilter(); this.delayTone.type = 'lowpass'; this.delayTone.frequency.value = 3200;
    this.delayOut = ctx.createGain();
    this.delayIn.connect(this.delay); this.delay.connect(this.delayTone); this.delayTone.connect(this.delayFb); this.delayFb.connect(this.delay);
    this.delayTone.connect(this.delayOut); this.delayOut.connect(this.masterIn);

    // realtime transport
    this.timer = null;
    this.nextStepTime = 0;
    this.nextStep = 0;
    this.queue = [];
    this.cur = -1;
    this.startTime = 0;
    this.playing = false;
    this.onStep = null;
  }

  // ── project / mixer ────────────────────────────────────────────────────────
  setProject(p) {
    this.project = p;
    this.applyMixer();
  }

  stepDur() { return 60 / (this.project?.bpm ?? 100) / 4; }
  totalSteps() { return (this.project?.bars ?? 4) * STEPS_PER_BAR; }

  bus(id) {
    let b = this.buses.get(id);
    if (!b) {
      const ctx = this.ctx;
      b = { in: ctx.createGain(), pan: ctx.createStereoPanner(), sendR: ctx.createGain(), sendD: ctx.createGain() };
      b.in.connect(b.pan); b.pan.connect(this.masterIn);
      b.pan.connect(b.sendR); b.sendR.connect(this.reverbIn);
      b.pan.connect(b.sendD); b.sendD.connect(this.delayIn);
      this.buses.set(id, b);
    }
    return b;
  }

  applyMixer(instant = false) {
    const p = this.project; if (!p) return;
    const t = this.ctx.currentTime;
    const set = (param, v) => { if (instant) param.value = v; else param.setTargetAtTime(v, t, 0.02); };
    const strips = [{ id: 'drums', mixer: p.drums.mixer }, ...p.tracks.map((tr) => ({ id: tr.id, mixer: tr.mixer }))];
    const anySolo = strips.some((s) => s.mixer.solo);
    for (const s of strips) {
      const b = this.bus(s.id);
      const audible = !s.mixer.mute && (!anySolo || s.mixer.solo);
      set(b.in.gain, audible ? s.mixer.volume : 0);
      set(b.pan.pan, s.mixer.pan);
      set(b.sendR.gain, s.mixer.reverb);
      set(b.sendD.gain, s.mixer.delay);
    }
    set(this.masterGain.gain, p.master.volume);
    set(this.reverbOut.gain, p.master.reverb * 1.4);
    set(this.delayOut.gain, p.master.delay * 1.2);
    set(this.delay.delayTime, Math.min(1.9, (60 / p.bpm) * 0.75)); // dotted eighth
  }

  // ── drum voices ────────────────────────────────────────────────────────────
  noiseSrc(t, dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur);
    return s;
  }

  env(g, t, a, peak, decay, floor = 0.0008) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(floor, t + a + decay);
  }

  drum(lane, t, vel, kitId = 'standard') {
    const ctx = this.ctx;
    const kit = KITS[kitId] ?? KITS.standard;
    const out = this.bus('drums').in;
    const v = Math.max(0.05, vel);

    if (lane === 'kick') {
      const k = kit.kick;
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(k.f0, t);
      o.frequency.exponentialRampToValueAtTime(k.f1, t + 0.06);
      o.frequency.exponentialRampToValueAtTime(Math.max(28, k.f1 * 0.7), t + k.decay);
      const g = ctx.createGain(); this.env(g, t, 0.002, v * 1.0, k.decay);
      const sh = ctx.createWaveShaper(); sh.curve = this.clipCurve;
      o.connect(g); g.connect(sh); sh.connect(out);
      o.start(t); o.stop(t + k.decay + 0.05);
      // beater click
      const n = this.noiseSrc(t, 0.02);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400;
      const cg = ctx.createGain(); this.env(cg, t, 0.001, v * k.click, 0.012);
      n.connect(hp); hp.connect(cg); cg.connect(out);
    } else if (lane === 'snare') {
      const s = kit.snare;
      const n = this.noiseSrc(t, s.decay + 0.05);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.7;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
      const ng = ctx.createGain(); this.env(ng, t, 0.001, v * 0.9 * s.noise, s.decay);
      n.connect(bp); bp.connect(hp); hp.connect(ng); ng.connect(out);
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(s.tone * 1.6, t); o.frequency.exponentialRampToValueAtTime(s.tone, t + 0.04);
      const og = ctx.createGain(); this.env(og, t, 0.001, v * 0.55, 0.11);
      o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.16);
    } else if (lane === 'clap') {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.1;
      bp.connect(out);
      [0, 0.011, 0.023, 0.036].forEach((off, i) => {
        const n = this.noiseSrc(t + off, 0.2);
        const g = ctx.createGain(); this.env(g, t + off, 0.001, v * (i === 3 ? 0.9 : 0.55), i === 3 ? 0.17 : 0.025);
        n.connect(g); g.connect(bp);
      });
    } else if (lane === 'hatC' || lane === 'hatO' || lane === 'crash') {
      const dec = lane === 'hatC' ? kit.hat.decay : lane === 'hatO' ? 0.26 : 1.4;
      const hpF = lane === 'crash' ? 4800 : kit.hat.hp;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = hpF;
      const g = ctx.createGain(); this.env(g, t, 0.001, v * (lane === 'crash' ? 0.5 : 0.42), dec);
      hp.connect(g); g.connect(out);
      const n = this.noiseSrc(t, dec + 0.05); n.connect(hp);
      if (lane !== 'crash') {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 10200; bp.Q.value = 1.6;
        bp.connect(g);
        [263, 400, 421, 474, 587, 845].forEach((f) => {
          const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f * 1.1;
          const og = ctx.createGain(); og.gain.value = 0.045 * v; o.connect(og); og.connect(bp); o.start(t); o.stop(t + dec + 0.05);
        });
      }
    } else if (lane === 'tom') {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(95, t + 0.2);
      const g = ctx.createGain(); this.env(g, t, 0.002, v * 0.85, 0.32);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.4);
    } else if (lane === 'rim') {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 820;
      const g = ctx.createGain(); this.env(g, t, 0.001, v * 0.32, 0.03);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 600;
      o.connect(hp); hp.connect(g); g.connect(out); o.start(t); o.stop(t + 0.06);
    }
  }

  // ── melodic voices ─────────────────────────────────────────────────────────
  /** Plays a note on instrument `inst`; returns { stop(time) } so held keys can be released. */
  note(inst, midi, t, dur, vel, busId, held = false) {
    const ctx = this.ctx;
    const f = midiToFreq(midi);
    const out = this.bus(busId).in;
    const v = Math.max(0.05, Math.min(1, vel));
    const end = t + Math.max(0.05, dur);
    const nodes = []; // oscillators to stop on release
    const master = ctx.createGain(); master.connect(out);

    const osc = (type, freq, detune = 0) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
      o.start(t); nodes.push(o); return o;
    };
    const lp = (freq, q = 0.8) => { const b = ctx.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = freq; b.Q.value = q; return b; };

    let release = 0.15;
    const ampADSR = (a, d, s, r, peak) => {
      master.gain.setValueAtTime(0.0001, t);
      master.gain.linearRampToValueAtTime(peak * v, t + a);
      master.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * v * s), t + a + d);
      release = r;
      if (!held) {
        master.gain.setValueAtTime(Math.max(0.0002, peak * v * s), Math.max(t + a + d, end));
        master.gain.exponentialRampToValueAtTime(0.0002, Math.max(t + a + d, end) + r);
      }
    };

    switch (inst) {
      case 'lead': {
        const flt = lp(2400, 1.2);
        flt.frequency.setValueAtTime(7000, t); flt.frequency.exponentialRampToValueAtTime(1900, t + 0.35);
        const a = osc('sawtooth', f, 7), b = osc('square', f, -7), c = osc('sawtooth', f * 2, 0);
        [a, b].forEach((o) => { const g = ctx.createGain(); g.gain.value = 0.38; o.connect(g); g.connect(flt); });
        const cg = ctx.createGain(); cg.gain.value = 0.1; c.connect(cg); cg.connect(flt);
        flt.connect(master);
        ampADSR(0.01, 0.16, 0.7, 0.16, 0.5);
        break;
      }
      case 'pluck': {
        const flt = lp(4000, 2);
        flt.frequency.setValueAtTime(6200, t); flt.frequency.exponentialRampToValueAtTime(420, t + 0.3);
        const a = osc('sawtooth', f, 4), b = osc('triangle', f * 2, 0);
        const ga = ctx.createGain(); ga.gain.value = 0.55; a.connect(ga); ga.connect(flt);
        const gb = ctx.createGain(); gb.gain.value = 0.35; b.connect(gb); gb.connect(flt);
        flt.connect(master);
        ampADSR(0.003, 0.5, 0.0005 / 0.6, 0.06, 0.62);
        break;
      }
      case 'pad': {
        const flt = lp(1500, 0.5);
        flt.frequency.setValueAtTime(700, t); flt.frequency.linearRampToValueAtTime(2000, t + Math.min(1.2, dur));
        [-13, 0, 13].forEach((dt) => { const o = osc('sawtooth', f, dt); const g = ctx.createGain(); g.gain.value = 0.2; o.connect(g); g.connect(flt); });
        const sub = osc('sine', f / 2); const sg = ctx.createGain(); sg.gain.value = 0.16; sub.connect(sg); sg.connect(flt);
        flt.connect(master);
        ampADSR(0.45, 0.4, 0.8, 1.1, 0.5);
        break;
      }
      case 'keys': {
        const car = osc('sine', f), mod = osc('sine', f * 2);
        const mg = ctx.createGain(); mg.gain.setValueAtTime(f * 1.6, t); mg.gain.exponentialRampToValueAtTime(f * 0.12, t + 0.7);
        mod.connect(mg); mg.connect(car.frequency);
        const tine = osc('sine', f * 6); const tg = ctx.createGain(); this.env(tg, t, 0.002, 0.07, 0.15); tine.connect(tg); tg.connect(master);
        car.connect(master);
        ampADSR(0.004, 0.9, 0.18, 0.35, 0.65);
        break;
      }
      case 'bass': {
        const flt = lp(900, 1.5);
        flt.frequency.setValueAtTime(1500, t); flt.frequency.exponentialRampToValueAtTime(220, t + 0.22);
        const a = osc('sawtooth', f), b = osc('sine', f);
        const ga = ctx.createGain(); ga.gain.value = 0.45; a.connect(ga); ga.connect(flt);
        const gb = ctx.createGain(); gb.gain.value = 0.7; b.connect(gb);
        const sh = ctx.createWaveShaper(); sh.curve = this.clipCurve;
        flt.connect(master); gb.connect(master);
        master.disconnect(); master.connect(sh); sh.connect(out);
        ampADSR(0.006, 0.18, 0.75, 0.09, 0.85);
        break;
      }
      case 'sub808': {
        const o = osc('sine', f);
        o.frequency.setValueAtTime(f * 2.4, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
        const sh = ctx.createWaveShaper(); sh.curve = this.clipCurve;
        o.connect(master); master.disconnect(); master.connect(sh); sh.connect(out);
        ampADSR(0.004, Math.max(0.5, dur), 0.35, 0.18, 1.0);
        break;
      }
      case 'bell': {
        const car = osc('sine', f), mod = osc('sine', f * 3.5);
        const mg = ctx.createGain(); mg.gain.setValueAtTime(f * 3, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 1.4);
        mod.connect(mg); mg.connect(car.frequency);
        const h = osc('sine', f * 5.4); const hg = ctx.createGain(); this.env(hg, t, 0.002, 0.08, 0.5); h.connect(hg); hg.connect(master);
        car.connect(master);
        ampADSR(0.002, 1.6, 0.0005, 0.4, 0.5);
        break;
      }
      case 'organ': {
        [[1, 0.5], [2, 0.38], [3, 0.2], [4, 0.14], [6, 0.08]].forEach(([m, lvl]) => { const o = osc('sine', f * m); const g = ctx.createGain(); g.gain.value = lvl; o.connect(g); g.connect(master); });
        ampADSR(0.012, 0.05, 0.9, 0.09, 0.5);
        break;
      }
      default: {
        const o = osc('triangle', f); o.connect(master); ampADSR(0.01, 0.1, 0.7, 0.1, 0.5);
      }
    }

    const stopAt = (time) => {
      const relEnd = time + release + 0.05;
      if (held) {
        master.gain.cancelScheduledValues(time);
        master.gain.setValueAtTime(Math.max(0.0002, master.gain.value), time);
        master.gain.exponentialRampToValueAtTime(0.0002, time + release);
      }
      nodes.forEach((o) => { try { o.stop(relEnd); } catch { /* already stopped */ } });
    };
    if (!held) stopAt(Math.max(t + 0.05, end));
    return { stop: stopAt };
  }

  click(t, accent) {
    const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = accent ? 1760 : 1180;
    const g = this.ctx.createGain(); this.env(g, t, 0.001, accent ? 0.28 : 0.16, 0.035);
    o.connect(g); g.connect(this.masterIn); o.start(t); o.stop(t + 0.06);
  }

  // ── sequencing ─────────────────────────────────────────────────────────────
  /** Which pattern is audible at global step `g` (song mode walks the arrangement). */
  patternAt(g) {
    const p = this.project;
    if (p.mode === 'song' && p.song.length) {
      const idx = Math.floor(g / this.totalSteps()) % p.song.length;
      return p.patterns.find((x) => x.id === p.song[idx]) ?? p.patterns[0];
    }
    return p.patterns.find((x) => x.id === p.active) ?? p.patterns[0];
  }

  songLengthSteps() {
    const p = this.project;
    return (p.mode === 'song' && p.song.length ? p.song.length : 1) * this.totalSteps();
  }

  swingOffset(localStep) {
    const sw = this.project.swing || 0;
    return localStep % 2 === 1 ? sw * this.stepDur() * 0.5 : 0;
  }

  scheduleStep(g, t, { includeMetronome = true } = {}) {
    const p = this.project;
    const total = this.totalSteps();
    const local = g % total;
    const pat = this.patternAt(g);
    const sd = this.stepDur();
    const when = t + this.swingOffset(local);

    for (const [lane, arr] of Object.entries(pat.lanes)) {
      const vel = arr[local];
      if (vel > 0) this.drum(lane, when, vel * (0.9 + Math.random() * 0.1), p.drums.kit);
    }
    for (const tr of p.tracks) {
      const list = pat.notes[tr.id];
      if (!list) continue;
      for (const n of list) if (Math.floor(n.t) === local) this.note(tr.inst, n.p, t + (n.t - local) * sd + this.swingOffset(local), n.d * sd, n.v ?? 0.8, tr.id);
    }
    if (includeMetronome && this.metronome && local % 4 === 0) this.click(t, local % 16 === 0);
  }

  // ── realtime transport ─────────────────────────────────────────────────────
  async start(fromStep = 0) {
    if (this.playing) return;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.applyMixer();
    this.playing = true;
    this.nextStep = fromStep;
    this.nextStepTime = this.ctx.currentTime + 0.06;
    this.queue = [];
    this.cur = -1;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  tick() {
    if (!this.playing) return;
    const lenSteps = this.songLengthSteps();
    while (this.nextStepTime < this.ctx.currentTime + LOOKAHEAD) {
      const g = this.nextStep % lenSteps;
      this.scheduleStep(g, this.nextStepTime);
      this.queue.push({ g, time: this.nextStepTime });
      this.nextStepTime += this.stepDur();
      this.nextStep++;
    }
  }

  stop() {
    this.playing = false;
    clearInterval(this.timer); this.timer = null;
    // silence everything that was already scheduled
    this.queue = [];
    const t = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setTargetAtTime(0, t, 0.015);
    setTimeout(() => { if (!this.playing) this.applyMixer(); }, 260);
  }

  /** Step currently under the playhead (global, in the song). Call from a rAF loop. */
  currentStep() {
    if (!this.playing) return -1;
    const now = this.ctx.currentTime;
    while (this.queue.length && this.queue[0].time <= now) this.cur = this.queue.shift().g;
    return this.cur;
  }

  /** Audition a note from the piano roll, the on-screen keys, the computer keyboard or a MIDI controller. */
  liveNote(trackId, midi, vel = 0.85) {
    const tr = this.project?.tracks.find((t) => t.id === trackId);
    if (!tr) return { stop() {} };
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.note(tr.inst, midi, this.ctx.currentTime + 0.002, 8, vel, tr.id, true);
  }

  liveDrum(lane, vel = 0.9) {
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.drum(lane, this.ctx.currentTime + 0.002, vel, this.project?.drums.kit);
  }

  dispose() {
    this.stop();
    try { this.ctx.close(); } catch { /* offline contexts can't close */ }
  }
}

// ── bounce ─────────────────────────────────────────────────────────────────
export async function renderProject(project, { loops = 2, tail = 2.5, sampleRate = 44100, onProgress } = {}) {
  const bars = project.bars;
  const stepDur = 60 / project.bpm / 4;
  const total = bars * STEPS_PER_BAR;
  const songSteps = (project.mode === 'song' && project.song.length ? project.song.length : 1) * total;
  const steps = songSteps * Math.max(1, loops);
  const seconds = steps * stepDur + tail;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const eng = new StudioEngine(ctx);
  eng.project = project;
  eng.applyMixer(true);

  for (let g = 0; g < steps; g++) {
    eng.scheduleStep(g % songSteps, 0.05 + g * stepDur, { includeMetronome: false });
    if (onProgress && g % 64 === 0) onProgress(g / steps * 0.4);
  }
  const buffer = await ctx.startRendering();
  onProgress?.(0.85);
  return buffer;
}

/** AudioBuffer → 16-bit PCM WAV Blob, peak-normalised to −0.5 dBFS. */
export function audioBufferToWav(buffer, { normalize = true } = {}) {
  const ch = buffer.numberOfChannels;
  const len = buffer.length;
  const data = Array.from({ length: ch }, (_, c) => buffer.getChannelData(c));
  let peak = 0;
  for (const d of data) for (let i = 0; i < len; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  const gain = normalize && peak > 0 ? 0.944 / peak : 1;

  const ab = new ArrayBuffer(44 + len * ch * 2);
  const v = new DataView(ab);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, buffer.sampleRate, true); v.setUint32(28, buffer.sampleRate * ch * 2, true);
  v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, len * ch * 2, true);
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i] * gain));
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}
