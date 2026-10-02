// One shared rAF loop that reads the AnalyserNode and publishes band levels (0–1).
// Components subscribe; the loop runs only while somebody listens AND audio is playing.
import { getAnalyser, usePlayerStore } from '../store/playerStore';

const subs = new Set();
let raf = null;
let data = null;
const level = { bass: 0, mid: 0, treble: 0, level: 0, playing: false };

function avg(arr, a, b) {
  let s = 0;
  for (let i = a; i <= b; i++) s += arr[i];
  return s / (b - a + 1) / 255;
}

function tick() {
  const analyser = getAnalyser();
  const playing = usePlayerStore.getState().isPlaying;
  level.playing = playing;
  if (analyser && playing) {
    if (!data || data.length !== analyser.frequencyBinCount) data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    // fftSize 512 @ 48k → ~94 Hz / bin
    const bass = avg(data, 0, 3);
    const mid = avg(data, 4, 24);
    const treble = avg(data, 25, 100);
    // fast attack, slow release
    const f = (cur, next) => (next > cur ? cur + (next - cur) * 0.55 : cur + (next - cur) * 0.12);
    level.bass = f(level.bass, bass);
    level.mid = f(level.mid, mid);
    level.treble = f(level.treble, treble);
    level.level = f(level.level, bass * 0.5 + mid * 0.35 + treble * 0.15);
  } else {
    level.bass *= 0.9; level.mid *= 0.9; level.treble *= 0.9; level.level *= 0.9;
  }
  subs.forEach((fn) => fn(level));
  raf = requestAnimationFrame(tick);
}

export function subscribeMeter(fn) {
  subs.add(fn);
  if (!raf) raf = requestAnimationFrame(tick);
  return () => {
    subs.delete(fn);
    if (!subs.size && raf) { cancelAnimationFrame(raf); raf = null; }
  };
}
