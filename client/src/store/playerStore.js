import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import toast from 'react-hot-toast';
import { tracksApi, externalSearchApi, discoverApi } from '../api';
import { useAuthStore } from './authStore';
import { useOfflineStore } from './offlineStore';
import { isExternal, normalizeExternal, trackKey } from '../lib/tracks';

// Single audio element — module-level singleton, never serialized to localStorage
const _audio = new Audio();
_audio.crossOrigin = "anonymous";

// ── Background audio keep-alive ───────────────────────────────────────────────
// iOS suspends AudioContext when PWA goes to background.
// Resume it on every visibility/focus/pageshow event and periodically while playing.
function _resumeCtx() {
  // Safari reports 'interrupted' (not 'suspended') after a call, Siri or a screen lock
  if (_audioCtx && (_audioCtx.state === 'suspended' || _audioCtx.state === 'interrupted')) {
    _audioCtx.resume().catch(() => {});
  }
}

// iPhone/iPad (incl. iPadOS posing as a Mac). On iOS the page keeps playing with the screen off
// only when audio is a real "playback" session; Web Audio on a locked phone is the fragile part.
const IS_IOS = typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

// Tells Safari this is music (plays with the silent switch on and keeps going when locked / backgrounded).
function _setAudioSession() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* older Safari / other browsers */ }
}
_setAudioSession();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') _resumeCtx();
});
document.addEventListener('focus',    _resumeCtx);
document.addEventListener('touchstart', _resumeCtx, { passive: true });
window.addEventListener('pageshow',   _resumeCtx);

// Poll every 800ms while a track is playing — catches iOS silent suspension
setInterval(() => {
  if (_audioCtx && _audioCtx.state === 'suspended' && !_audio.paused) {
    _audioCtx.resume().catch(() => {});
  }
}, 800);

// 10-band graphic EQ — standard ISO octave centers
export const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_BAND_COUNT = EQ_FREQS.length;

let _audioCtx = null;
let _filters  = [];
let _analyser = null;

let _dryGain = null;
let _wetGain = null;
let _reverbNode = null;
let _panner = null;
let _pannerAngle = 0;
let _panner2 = null;
let _pannerLPFilter = null;
let _pannerHPFilter = null;
let _pannerLPGain = null;
let _pannerHPGain = null;
let _panner2Angle = 0;
let _autoEqInterval = null;

let _effectsAnimationId = null;
let _flutterAngle = 0;

let _effectChainInNode = null;
let _pathNormalGain = null;

// Karaoke Path nodes
let _pathKaraokeGain = null;
let _karaokeLowPass = null;
let _karaokeHighPass = null;
let _karaokeMidHP = null;
let _karaokeMidLP = null;
let _karaokeSplitter = null;
let _karaokeInvertL = null;
let _karaokeInvertR = null;
let _karaokeMerger = null;
let _karaokeSumGain = null;

// Lo-Fi Path nodes
let _pathLofiGain = null;
let _lofiLowPass = null;
let _lofiHighPass = null;
let _lofiCrackleGain = null;
let _lofiOutGain = null;
let _crackleSource = null;

// Sub-Bass and Vocal Boost Filter nodes
let _subBassFilter      = null;
let _bassRumble2Filter  = null; // secondary 80Hz warmth for rumble mode
let _vocalBoostFilter1  = null; // low-shelf mud cut at 300Hz
let _vocalBoostFilter2  = null; // peaking presence at 2.5kHz
let _vocalBoostFilter3  = null; // high-shelf air at 10kHz
let _crystalAirFilter   = null; // high-shelf +3dB at 8kHz for Crystal mode
let _crystalWarmFilter  = null; // low-shelf +2dB at 80Hz for Crystal mode
let _nightcoreShelf     = null; // high-shelf for nightcore sparkle

function createReverbBuffer(ctx, duration, decay) {
  const sampleRate = ctx.sampleRate;
  const length     = sampleRate * duration;
  const impulse    = ctx.createBuffer(2, length, sampleRate);
  const left       = impulse.getChannelData(0);
  const right      = impulse.getChannelData(1);

  let lpL = 0, lpR = 0;
  let apR = 0; // all-pass state for decorrelation

  // Early reflection tap offsets in samples (room modes ~5–30ms)
  const erTaps = [
    Math.floor(0.005 * sampleRate),
    Math.floor(0.011 * sampleRate),
    Math.floor(0.019 * sampleRate),
    Math.floor(0.029 * sampleRate)
  ];
  const erGains = [0.7, 0.55, 0.4, 0.28];

  const buf = new Float32Array(length * 2); // temp scratch for early reflections

  for (let i = 0; i < length; i++) {
    const percent = i / length;

    // Exponential envelope shaping
    const env = Math.pow(1 - percent, decay) * Math.exp(-percent * 3.5);

    const rawL = (Math.random() * 2 - 1) * env;
    const rawR = (Math.random() * 2 - 1) * env; // truly independent per-channel

    // All-pass decorrelation: adds a 0.3ms delay on right channel's random seed
    // so left/right diffuse fields diverge for a wider stereo field
    apR = rawR * 0.5 + apR * 0.5;

    // Air absorption: progressive low-pass that tightens as tail progresses
    // coefficient slides from 0.26 (transparent) → 0.06 (muffled) at full tail
    const lpCoeff = 0.26 - percent * 0.20;
    lpL = rawL * lpCoeff + lpL * (1 - lpCoeff);
    lpR = apR  * lpCoeff + lpR * (1 - lpCoeff);

    buf[i * 2]     = lpL;
    buf[i * 2 + 1] = lpR;
  }

  // Add early reflections on top (discrete room echoes)
  for (let t = 0; t < erTaps.length; t++) {
    const tapOffset = erTaps[t];
    const g = erGains[t];
    for (let i = tapOffset; i < length; i++) {
      buf[i * 2]     += buf[(i - tapOffset) * 2] * g * 0.3;
      buf[i * 2 + 1] += buf[(i - tapOffset) * 2 + 1] * g * 0.3;
    }
  }

  // Normalize peak to avoid clipping
  let peak = 0;
  for (let i = 0; i < length * 2; i++) peak = Math.max(peak, Math.abs(buf[i]));
  const norm = peak > 0.001 ? 0.85 / peak : 1;

  for (let i = 0; i < length; i++) {
    left[i]  = buf[i * 2]     * norm;
    right[i] = buf[i * 2 + 1] * norm;
  }

  return impulse;
}

function createCrackleBuffer(ctx, duration) {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * duration;
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  
  let lastOut = 0.0;
  for (let i = 0; i < length; i++) {
    const noise = (Math.random() * 2 - 1);
    const filteredNoise = noise * 0.15 + lastOut * 0.85;
    lastOut = filteredNoise;
    
    let pop = 0;
    if (Math.random() < 0.00008) {
      pop = (Math.random() * 2 - 1) * 0.6;
    }
    
    data[i] = filteredNoise * 0.08 + pop;
  }
  return buffer;
}

function playCrackle() {
  if (!_audioCtx || _crackleSource) return;
  _crackleSource = _audioCtx.createBufferSource();
  _crackleSource.buffer = createCrackleBuffer(_audioCtx, 4.0);
  _crackleSource.loop = true;
  _crackleSource.connect(_lofiCrackleGain);
  _crackleSource.start(0);
}

function stopCrackle() {
  if (_crackleSource) {
    try {
      _crackleSource.stop();
    } catch { /* already stopped */ }
    _crackleSource.disconnect();
    _crackleSource = null;
  }
}

function startEffectsAnimation() {
  if (_effectsAnimationId) return;
  const update = () => {
    const state = usePlayerStore.getState();
    const { is8DActive, isLofiActive, isDouble8DActive, isNightcoreActive } = state;
    
    if (!_audioCtx || (!is8DActive && !isLofiActive && !isDouble8DActive)) {
      _effectsAnimationId = null;
      if (_audio && !isNightcoreActive) _audio.playbackRate = 1.0;
      return;
    }
    
    // ─── 8D Panning: non-linear speed + figure-8 elevation ───────────────────
    if (is8DActive && _panner) {
      // Non-linear speed: slightly faster at back (head shadowing effect realism)
      const speedMod = 1.0 + 0.3 * Math.abs(Math.cos(_pannerAngle));
      _pannerAngle += 0.010 * speedMod;

      const r = 3.5;
      const x = Math.sin(_pannerAngle) * r;
      const z = Math.cos(_pannerAngle) * r;
      // Figure-8 Y elevation — sound lifts in front, dips behind
      const y = Math.sin(_pannerAngle * 2) * 0.65;

      if (_panner.positionX) {
        _panner.positionX.setValueAtTime(x, _audioCtx.currentTime);
        _panner.positionY.setValueAtTime(y, _audioCtx.currentTime);
        _panner.positionZ.setValueAtTime(z, _audioCtx.currentTime);
      } else if (typeof _panner.setPosition === 'function') {
        _panner.setPosition(x, y, z);
      }

      // Subtle Doppler: very slightly modulate playbackRate as source swings
      // Sound source moving toward listener = slightly faster reading = higher pitch
      const dopplerShift = 1.0 + Math.sin(_pannerAngle) * 0.004;
      if (_audio && !isLofiActive && !isDouble8DActive) _audio.playbackRate = dopplerShift;
    }

    // ─── Double 8D: bass clockwise (slow, wide), treble counter-clockwise (faster, tighter) ──
    if (isDouble8DActive && _panner && _panner2) {
      // Bass orbits slow and wide for physical presence
      _pannerAngle  += 0.008;
      // Highs orbit faster in opposite direction for envelopment
      _panner2Angle -= 0.016;

      const rBass   = 4.0; // bass wider
      const rTreble = 3.0; // highs tighter

      const x1 = Math.sin(_pannerAngle)  * rBass;
      const z1 = Math.cos(_pannerAngle)  * rBass;
      const y1 = Math.sin(_pannerAngle * 1.5) * 0.4;

      const x2 = Math.sin(_panner2Angle) * rTreble;
      const z2 = Math.cos(_panner2Angle) * rTreble;
      const y2 = Math.sin(_panner2Angle * 2.5) * 0.3;

      if (_panner.positionX) {
        _panner.positionX.setValueAtTime(x1, _audioCtx.currentTime);
        _panner.positionY.setValueAtTime(y1, _audioCtx.currentTime);
        _panner.positionZ.setValueAtTime(z1, _audioCtx.currentTime);
        _panner2.positionX.setValueAtTime(x2, _audioCtx.currentTime);
        _panner2.positionY.setValueAtTime(y2, _audioCtx.currentTime);
        _panner2.positionZ.setValueAtTime(z2, _audioCtx.currentTime);
      } else if (typeof _panner.setPosition === 'function') {
        _panner.setPosition(x1, y1, z1);
        _panner2.setPosition(x2, y2, z2);
      }
    }
    
    // ─── Lo-Fi Tape Flutter ────────────────────────────────────────────────────
    if (isLofiActive && _audio) {
      _flutterAngle += 0.06;
      // Multi-frequency flutter: primary slow wow + secondary faster flutter
      const wow     = Math.sin(_flutterAngle * 0.7) * 0.003;
      const flutter = Math.sin(_flutterAngle * 4.5) * 0.001;
      _audio.playbackRate = 1.0 + wow + flutter;
    } else if (_audio && !is8DActive && !isNightcoreActive) {
      _audio.playbackRate = 1.0;
    }

    _effectsAnimationId = requestAnimationFrame(update);
  };
  _effectsAnimationId = requestAnimationFrame(update);
}

// ─── Manual placement ───────────────────────────────────────────────────────
// `pos` is normalised: x/z inside the unit disk (z < 0 = in front of the head),
// h in [-1, 1] (below / above). The whole disk is usable — the radius is the
// distance from the head, so the sound can sit right at the ear or far away.
const MANUAL_REACH = 6;     // metres at the edge of the pad
const MANUAL_HEIGHT = 3;    // metres at the top / bottom of the height slider
const MANUAL_MIN_DIST = 0.35; // HRTF collapses to mono at exactly 0

function manualWorldPosition(pos) {
  let x = pos.x * MANUAL_REACH;
  let z = pos.z * MANUAL_REACH;
  const y = (pos.h || 0) * MANUAL_HEIGHT;
  const d = Math.hypot(x, y, z);
  if (d < MANUAL_MIN_DIST) {
    if (d === 0) { z = -MANUAL_MIN_DIST; } else { const k = MANUAL_MIN_DIST / d; x *= k; z *= k; }
  }
  return { x, y: y, z };
}

function applyManualPanner(pos, tc = 0.05) {
  if (!_panner || !_audioCtx) return;
  const { x, y, z } = manualWorldPosition(pos);
  if (_panner.positionX) {
    _panner.positionX.setTargetAtTime(x, _audioCtx.currentTime, tc);
    _panner.positionY.setTargetAtTime(y, _audioCtx.currentTime, tc);
    _panner.positionZ.setTargetAtTime(z, _audioCtx.currentTime, tc);
  } else if (typeof _panner.setPosition === 'function') {
    _panner.setPosition(x, y, z);
  }
}

export function getPannerPosition() {
  return {
    x: Math.sin(_pannerAngle),
    z: Math.cos(_pannerAngle),
    active: !!(_effectsAnimationId && usePlayerStore.getState().is8DActive)
  };
}

function startAutoEq() {
  if (_autoEqInterval) return;
  const data = new Uint8Array(_analyser.frequencyBinCount);
  // Analyser bin ranges per EQ band (fftSize 512 → ~93.75Hz/bin at 48kHz)
  const binRanges = [
    [0, 0],     // 31Hz
    [1, 1],     // 62Hz
    [1, 2],     // 125Hz
    [2, 4],     // 250Hz
    [4, 8],     // 500Hz
    [8, 15],    // 1kHz
    [16, 30],   // 2kHz
    [31, 60],   // 4kHz
    [61, 120],  // 8kHz
    [121, 200], // 16kHz
  ];
  _autoEqInterval = setInterval(() => {
    const state = usePlayerStore.getState();
    if (!_analyser || !state.isAutoEqActive) { stopAutoEq(); return; }

    _analyser.getByteFrequencyData(data);

    const bands = binRanges.map(([s, e]) => getAverageVolume(data, s, e));

    const rms = Math.sqrt(bands.reduce((s, v) => s + v*v, 0) / bands.length);
    if (rms < 4) return; // silence gate

    // Fletcher-Munson inspired loudness contour
    // Boosts bass/treble at low volumes, flattens at loud volumes
    const loudnessNorm = Math.min(1, rms / 80);
    const contour = [
      4.5 - loudnessNorm * 2,   // 31Hz sub-bass: boost more at low volume
      3.5 - loudnessNorm * 1.5, // 62Hz
      2.0 - loudnessNorm * 1,   // 125Hz bass
      0.5,                       // 250Hz
      -0.5,                      // 500Hz mids: slightly recessed (natural)
      -0.5,                      // 1kHz
      1.5,                       // 2kHz presence
      2.5,                       // 4kHz: always present
      4.0 - loudnessNorm * 1,   // 8kHz
      5.0 - loudnessNorm * 1.5  // 16kHz: air
    ];

    // Compute correction: how much the band deviates from balanced
    const avg = bands.reduce((a, b) => a+b, 0) / bands.length;
    targetGains = bands.map((vol, i) => {
      const ratio = avg / (vol + 1);
      let correction = Math.log2(ratio) * 5.5;
      correction = Math.max(-7, Math.min(9, correction));
      return correction + contour[i];
    });

    // Slow-attack, fast-release — more musical
    targetGains.forEach((target, i) => {
      if (!_filters[i]) return;
      const cur = _filters[i].gain.value;
      const diff = target - cur;
      // Attack slower (0.08), release faster (0.25)
      const alpha = diff > 0 ? 0.08 : 0.22;
      _filters[i].gain.setValueAtTime(cur + diff * alpha, _audioCtx.currentTime);
    });
  }, 60); // 60ms = fast enough to be reactive
}

let targetGains = new Array(EQ_BAND_COUNT).fill(0);

function getAverageVolume(array, start, end) {
  let sum = 0;
  for (let i = start; i <= end; i++) {
    sum += array[i];
  }
  return sum / (end - start + 1);
}

function stopAutoEq() {
  if (_autoEqInterval) {
    clearInterval(_autoEqInterval);
    _autoEqInterval = null;
  }
}

function applyAudioEffects(state) {
  if (!_audioCtx) return;

  const {
    is8DActive, isPerfectAudioActive, reverbWet, isAutoEqActive,
    isLofiActive, isKaraokeActive, isSubBassActive, isVocalBoostActive,
    isDouble8DActive, isBassRumbleActive, isNightcoreActive
  } = state;

  const now = _audioCtx.currentTime;
  const T = 0.06; // smoothing time constant

  // ─── 1. Reverb Wet/Dry ─────────────────────────────────────────────────────
  // Each mode has a natural wet setting; user slider adjusts relative to that
  let targetWet = reverbWet;
  if (is8DActive && targetWet < 0.32) targetWet = 0.32;      // 8D needs space
  if (isDouble8DActive && targetWet < 0.38) targetWet = 0.38; // wider space
  if (isPerfectAudioActive && targetWet < 0.10) targetWet = 0.10;
  if (isLofiActive && targetWet < 0.20) targetWet = 0.20;    // room of vinyl

  const dryLevel = Math.max(0.25, 1.0 - targetWet * 0.55);
  if (_wetGain && _dryGain) {
    _wetGain.gain.setTargetAtTime(targetWet, now, T);
    _dryGain.gain.setTargetAtTime(dryLevel, now, T);
  }

  // ─── 2. Route Path Switching ────────────────────────────────────────────────
  if (isLofiActive) {
    _pathNormalGain.gain.setTargetAtTime(0, now, T);
    _pathKaraokeGain.gain.setTargetAtTime(0, now, T);
    _pathLofiGain.gain.setTargetAtTime(1, now, T);
    playCrackle();
    _lofiCrackleGain.gain.setTargetAtTime(0.14, now, T); // subtle crackle
  } else if (isKaraokeActive) {
    _pathNormalGain.gain.setTargetAtTime(0, now, T);
    _pathKaraokeGain.gain.setTargetAtTime(1, now, T);
    _pathLofiGain.gain.setTargetAtTime(0, now, T);
    _lofiCrackleGain.gain.setTargetAtTime(0, now, T);
    stopCrackle();
  } else {
    _pathNormalGain.gain.setTargetAtTime(1, now, T);
    _pathKaraokeGain.gain.setTargetAtTime(0, now, T);
    _pathLofiGain.gain.setTargetAtTime(0, now, T);
    _lofiCrackleGain.gain.setTargetAtTime(0, now, T);
    stopCrackle();
  }

  // ─── 3. Animation Loop ──────────────────────────────────────────────────────
  if (is8DActive || isDouble8DActive || isLofiActive) {
    startEffectsAnimation();
  } else if (_audio && !isNightcoreActive) {
    _audio.playbackRate = 1.0;
  }

  // ─── 4. Double 8D Crossover Routing ────────────────────────────────────────
  if (_pannerLPGain && _pannerHPGain) {
    if (isDouble8DActive) {
      // Split at 500Hz — bass (0–500Hz) clockwise, highs (500Hz+) counter-clockwise
      _pannerLPFilter.frequency.setTargetAtTime(500, now, 0.15);
      _pannerHPFilter.frequency.setTargetAtTime(500, now, 0.15);
      _pannerLPGain.gain.setTargetAtTime(1.0, now, T);
      _pannerHPGain.gain.setTargetAtTime(0.88, now, T); // slightly less to balance
    } else {
      _pannerLPFilter.frequency.setTargetAtTime(22000, now, 0.15);
      _pannerHPFilter.frequency.setTargetAtTime(22000, now, 0.15);
      _pannerLPGain.gain.setTargetAtTime(1.0, now, T);
      _pannerHPGain.gain.setTargetAtTime(0.0, now, T);
    }
  }

  // ─── 4b. Center Panner if spatial inactive ──────────────────────────────────
  if (_panner) {
    // Free placement lets the sound sit far away; a gentler rolloff keeps "far" audible.
    _panner.rolloffFactor = state.isManualPanning ? 0.45 : 1;
  }
  if (!is8DActive && !isDouble8DActive && _panner) {
    if (state.isManualPanning && state.manualPos) {
      applyManualPanner(state.manualPos, 0.08);
    } else {
      const setP = (p, x, y, z) => {
        if (p.positionX) {
          p.positionX.setTargetAtTime(x, now, 0.08);
          p.positionY.setTargetAtTime(y, now, 0.08);
          p.positionZ.setTargetAtTime(z, now, 0.08);
        } else if (typeof p.setPosition === 'function') {
          p.setPosition(x, y, z);
        }
      };
      setP(_panner, 0, 0, 1);
      if (_panner2) setP(_panner2, 0, 0, -1);
    }
  }

  // ─── 5. SUB-BASS (50Hz precise peaking) ─────────────────────────────────────
  if (_subBassFilter) {
    if (isSubBassActive) {
      // Tight, focused 50Hz punch
      _subBassFilter.frequency.setTargetAtTime(50, now, 0.1);
      _subBassFilter.Q.setTargetAtTime(1.4, now, 0.1);
      _subBassFilter.gain.setTargetAtTime(10.0, now, T);
    } else if (isBassRumbleActive) {
      // Deep rumble — lower center, wider Q for chesty thump
      _subBassFilter.frequency.setTargetAtTime(42, now, 0.1);
      _subBassFilter.Q.setTargetAtTime(0.8, now, 0.1);
      _subBassFilter.gain.setTargetAtTime(13.5, now, T);
    } else {
      _subBassFilter.gain.setTargetAtTime(0, now, T);
    }
  }

  // ─── 5b. BASS RUMBLE Secondary — 80Hz body warmth ───────────────────────────
  if (_bassRumble2Filter) {
    if (isBassRumbleActive) {
      _bassRumble2Filter.frequency.setTargetAtTime(80, now, 0.1);
      _bassRumble2Filter.Q.setTargetAtTime(1.0, now, 0.1);
      _bassRumble2Filter.gain.setTargetAtTime(7.0, now, T); // body warmth
    } else if (isSubBassActive) {
      // Sub-bass also gets a mild 80Hz body fill
      _bassRumble2Filter.gain.setTargetAtTime(3.0, now, T);
    } else {
      _bassRumble2Filter.gain.setTargetAtTime(0, now, T);
    }
  }

  // ─── 6. VOCAL PRESENCE — 3-band surgical chain ──────────────────────────────
  if (_vocalBoostFilter1 && _vocalBoostFilter2 && _vocalBoostFilter3) {
    if (isVocalBoostActive) {
      // Cut mud/boxiness below 300Hz
      _vocalBoostFilter1.gain.setTargetAtTime(-5.0, now, T);
      // Boost intelligibility/presence at 2.5kHz
      _vocalBoostFilter2.frequency.setTargetAtTime(2500, now, 0.1);
      _vocalBoostFilter2.Q.setTargetAtTime(0.85, now, 0.1);
      _vocalBoostFilter2.gain.setTargetAtTime(5.5, now, T);
      // Add air/sparkle at 10kHz
      _vocalBoostFilter3.gain.setTargetAtTime(3.0, now, T);
    } else {
      _vocalBoostFilter1.gain.setTargetAtTime(0, now, T);
      _vocalBoostFilter2.gain.setTargetAtTime(0, now, T);
      _vocalBoostFilter3.gain.setTargetAtTime(0, now, T);
    }
  }

  // ─── 7. CRYSTAL — Hi-Fi Enhancement ─────────────────────────────────────────
  if (_crystalWarmFilter && _crystalAirFilter) {
    if (isPerfectAudioActive) {
      // Gentle warmth at 80Hz (makes music feel full and rich)
      _crystalWarmFilter.gain.setTargetAtTime(2.5, now, T);
      // Air shelf at 8kHz (makes music breathe, open, hi-fi)
      _crystalAirFilter.gain.setTargetAtTime(3.0, now, T);
    } else {
      _crystalWarmFilter.gain.setTargetAtTime(0, now, T);
      _crystalAirFilter.gain.setTargetAtTime(0, now, T);
    }
  }

  // ─── 8. NIGHTCORE — +25% speed + anime sparkle shelf ────────────────────────
  if (_nightcoreShelf) {
    if (isNightcoreActive) {
      _nightcoreShelf.gain.setTargetAtTime(3.5, now, T); // bright, anime-like highs
      if (!isLofiActive && _audio) _audio.playbackRate = 1.25;
    } else {
      _nightcoreShelf.gain.setTargetAtTime(0, now, T);
      if (!isLofiActive && !is8DActive && !isDouble8DActive && _audio) _audio.playbackRate = 1.0;
    }
  }

  // ─── 9. AUTO-EQ ─────────────────────────────────────────────────────────────
  if (isAutoEqActive) {
    startAutoEq();
  } else {
    stopAutoEq();
    applyEqBands(state.eqBands);
  }
}


function initAudioContext() {
  if (_audioCtx) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  _audioCtx = new AudioContext();

  // Auto-resume if iOS suspends the context while audio is playing
  _audioCtx.addEventListener('statechange', () => {
    if ((_audioCtx.state === 'suspended' || _audioCtx.state === 'interrupted') && !_audio.paused) {
      _audioCtx.resume().catch(() => {});
    }
  });

  const source = _audioCtx.createMediaElementSource(_audio);

  _analyser = _audioCtx.createAnalyser();
  _analyser.fftSize = 512;
  _analyser.smoothingTimeConstant = 0.78;

  _filters = EQ_FREQS.map((freq, i) => {
    const filter = _audioCtx.createBiquadFilter();
    filter.type = i === 0 ? 'lowshelf' : i === EQ_FREQS.length - 1 ? 'highshelf' : 'peaking';
    filter.frequency.value = freq;
    filter.Q.value = (i === 0 || i === EQ_FREQS.length - 1) ? 0.7 : 1.1;
    filter.gain.value = 0;
    return filter;
  });

  source.connect(_filters[0]);
  for (let i = 0; i < _filters.length - 1; i++) {
    _filters[i].connect(_filters[i + 1]);
  }

  // Sub-Bass peaking filter (50Hz, tight Q)
  _subBassFilter = _audioCtx.createBiquadFilter();
  _subBassFilter.type = 'peaking';
  _subBassFilter.frequency.value = 50;
  _subBassFilter.Q.value = 1.2;
  _subBassFilter.gain.value = 0.0;

  // Bass Rumble secondary — 80Hz body warmth
  _bassRumble2Filter = _audioCtx.createBiquadFilter();
  _bassRumble2Filter.type = 'peaking';
  _bassRumble2Filter.frequency.value = 80;
  _bassRumble2Filter.Q.value = 1.0;
  _bassRumble2Filter.gain.value = 0.0;

  // Vocal Presence — 3-band surgical chain
  // Band 1: low-shelf cut at 300Hz to remove mud/boxiness
  _vocalBoostFilter1 = _audioCtx.createBiquadFilter();
  _vocalBoostFilter1.type = 'lowshelf';
  _vocalBoostFilter1.frequency.value = 300;
  _vocalBoostFilter1.gain.value = 0.0;

  // Band 2: peaking presence boost at 2.5kHz (attack, intelligibility)
  _vocalBoostFilter2 = _audioCtx.createBiquadFilter();
  _vocalBoostFilter2.type = 'peaking';
  _vocalBoostFilter2.frequency.value = 2500;
  _vocalBoostFilter2.Q.value = 0.9;
  _vocalBoostFilter2.gain.value = 0.0;

  // Band 3: high-shelf air at 10kHz (sparkle, openness)
  _vocalBoostFilter3 = _audioCtx.createBiquadFilter();
  _vocalBoostFilter3.type = 'highshelf';
  _vocalBoostFilter3.frequency.value = 10000;
  _vocalBoostFilter3.gain.value = 0.0;

  // Crystal mode — Hi-Fi stereo enhancement
  // Warm low-shelf at 80Hz
  _crystalWarmFilter = _audioCtx.createBiquadFilter();
  _crystalWarmFilter.type = 'lowshelf';
  _crystalWarmFilter.frequency.value = 80;
  _crystalWarmFilter.gain.value = 0.0;

  // Air high-shelf at 8kHz
  _crystalAirFilter = _audioCtx.createBiquadFilter();
  _crystalAirFilter.type = 'highshelf';
  _crystalAirFilter.frequency.value = 8000;
  _crystalAirFilter.gain.value = 0.0;

  // Nightcore high-shelf sparkle at 6kHz
  _nightcoreShelf = _audioCtx.createBiquadFilter();
  _nightcoreShelf.type = 'highshelf';
  _nightcoreShelf.frequency.value = 6000;
  _nightcoreShelf.gain.value = 0.0;

  // Connect in series: EQ -> Sub-Bass -> RumbleLow -> Vocal1 -> Vocal2 -> Vocal3
  //                       -> Crystal Warm -> Crystal Air -> Nightcore Shelf
  _filters[_filters.length - 1].connect(_subBassFilter);
  _subBassFilter.connect(_bassRumble2Filter);
  _bassRumble2Filter.connect(_vocalBoostFilter1);
  _vocalBoostFilter1.connect(_vocalBoostFilter2);
  _vocalBoostFilter2.connect(_vocalBoostFilter3);
  _vocalBoostFilter3.connect(_crystalWarmFilter);
  _crystalWarmFilter.connect(_crystalAirFilter);
  _crystalAirFilter.connect(_nightcoreShelf);

  const eqOutNode = _nightcoreShelf;

  // Create effects chain input summing node
  _effectChainInNode = _audioCtx.createGain();

  // --- PATH 1: Normal ---
  _pathNormalGain = _audioCtx.createGain();
  _pathNormalGain.gain.value = 1.0;
  eqOutNode.connect(_pathNormalGain);
  _pathNormalGain.connect(_effectChainInNode);

  // --- PATH 2: Karaoke Vocal Cancellation ---
  _pathKaraokeGain = _audioCtx.createGain();
  _pathKaraokeGain.gain.value = 0.0;

  // Crossover Low Band (Bass, Kick drum, sub-bass below 180Hz in stereo)
  _karaokeLowPass = _audioCtx.createBiquadFilter();
  _karaokeLowPass.type = 'lowpass';
  _karaokeLowPass.frequency.value = 180;

  // Crossover High Band (Cymbals, hi-hats, reverb sparkle above 8500Hz in stereo)
  _karaokeHighPass = _audioCtx.createBiquadFilter();
  _karaokeHighPass.type = 'highpass';
  _karaokeHighPass.frequency.value = 8500;

  // Mid Band Filters (Vocals live here: 180Hz to 8500Hz)
  _karaokeMidHP = _audioCtx.createBiquadFilter();
  _karaokeMidHP.type = 'highpass';
  _karaokeMidHP.frequency.value = 180;

  _karaokeMidLP = _audioCtx.createBiquadFilter();
  _karaokeMidLP.type = 'lowpass';
  _karaokeMidLP.frequency.value = 8500;

  // Splitter & Merger for mid-band subtraction
  _karaokeSplitter = _audioCtx.createChannelSplitter(2);
  _karaokeMerger = _audioCtx.createChannelMerger(2);

  // Inverter nodes to cancel center frequencies
  _karaokeInvertL = _audioCtx.createGain();
  _karaokeInvertL.gain.value = -1.0;

  _karaokeInvertR = _audioCtx.createGain();
  _karaokeInvertR.gain.value = -1.0;

  // Summing gain for combining crossover bands
  _karaokeSumGain = _audioCtx.createGain();
  _karaokeSumGain.gain.value = 0.9; // Keep overall amplitude clean

  // 1. Connect Bass (Lowpass) straight to summation
  eqOutNode.connect(_karaokeLowPass);
  _karaokeLowPass.connect(_karaokeSumGain);

  // 2. Connect Treble (Highpass) straight to summation
  eqOutNode.connect(_karaokeHighPass);
  _karaokeHighPass.connect(_karaokeSumGain);

  // 3. Connect Mid band to phase cancellation matrix
  eqOutNode.connect(_karaokeMidHP);
  _karaokeMidHP.connect(_karaokeMidLP);
  _karaokeMidLP.connect(_karaokeSplitter);

  // Connection logic:
  // Left Output = Mid_L - Mid_R
  // Right Output = Mid_R - Mid_L
  
  // Mid_L (splitter output 0) -> Left Output (merger input 0)
  _karaokeSplitter.connect(_karaokeMerger, 0, 0);
  // -Mid_L (splitter output 0 via invertL) -> Right Output (merger input 1)
  _karaokeSplitter.connect(_karaokeInvertL, 0);
  _karaokeInvertL.connect(_karaokeMerger, 0, 1);

  // Mid_R (splitter output 1) -> Right Output (merger input 1)
  _karaokeSplitter.connect(_karaokeMerger, 1, 1);
  // -Mid_R (splitter output 1 via invertR) -> Left Output (merger input 0)
  _karaokeSplitter.connect(_karaokeInvertR, 1);
  _karaokeInvertR.connect(_karaokeMerger, 0, 0);

  // Connect merger back to output summing node
  _karaokeMerger.connect(_karaokeSumGain);

  _karaokeSumGain.connect(_pathKaraokeGain);
  _pathKaraokeGain.connect(_effectChainInNode);

  // --- PATH 3: Lo-Fi Vinyl Tape ---
  _pathLofiGain = _audioCtx.createGain();
  _pathLofiGain.gain.value = 0.0;

  _lofiLowPass = _audioCtx.createBiquadFilter();
  _lofiLowPass.type = 'lowpass';
  _lofiLowPass.frequency.value = 3400; // Warmer cut-off — like a 70s tape deck
  _lofiLowPass.Q.value = 0.5;          // Gentle slope, not brick-wall

  _lofiHighPass = _audioCtx.createBiquadFilter();
  _lofiHighPass.type = 'highpass';
  _lofiHighPass.frequency.value = 260; // Remove sub-rumble but keep warmth

  _lofiCrackleGain = _audioCtx.createGain();
  _lofiCrackleGain.gain.value = 0.0;

  _lofiOutGain = _audioCtx.createGain();

  eqOutNode.connect(_lofiLowPass);
  _lofiLowPass.connect(_lofiHighPass);
  _lofiHighPass.connect(_lofiOutGain);
  _lofiCrackleGain.connect(_lofiOutGain);

  _lofiOutGain.connect(_pathLofiGain);
  _pathLofiGain.connect(_effectChainInNode);

  // --- Post-Path Effects (Reverb & Panner) ---
  _dryGain = _audioCtx.createGain();
  _wetGain = _audioCtx.createGain();
  _reverbNode = _audioCtx.createConvolver();
  // 2.8s reverb — longer tail with smoother decay (was 2.2)
  _reverbNode.buffer = createReverbBuffer(_audioCtx, 2.8, 1.8);

  _effectChainInNode.connect(_dryGain);
  _effectChainInNode.connect(_reverbNode);
  _reverbNode.connect(_wetGain);

  // Create crossover filters for panner splitting
  _pannerLPFilter = _audioCtx.createBiquadFilter();
  _pannerLPFilter.type = 'lowpass';
  _pannerLPFilter.frequency.setValueAtTime(22000, _audioCtx.currentTime);

  _pannerHPFilter = _audioCtx.createBiquadFilter();
  _pannerHPFilter.type = 'highpass';
  _pannerHPFilter.frequency.setValueAtTime(22000, _audioCtx.currentTime);

  _pannerLPGain = _audioCtx.createGain();
  _pannerLPGain.gain.setValueAtTime(1.0, _audioCtx.currentTime);

  _pannerHPGain = _audioCtx.createGain();
  _pannerHPGain.gain.setValueAtTime(0.0, _audioCtx.currentTime);

  _panner = _audioCtx.createPanner();
  _panner.panningModel = 'HRTF';
  _panner.distanceModel = 'inverse';
  _panner.refDistance = 1;
  _panner.maxDistance = 10000;
  _panner.rolloffFactor = 1;
  _panner.coneInnerAngle = 360;
  _panner.coneOuterAngle = 360;

  _panner2 = _audioCtx.createPanner();
  _panner2.panningModel = 'HRTF';
  _panner2.distanceModel = 'inverse';
  _panner2.refDistance = 1;
  _panner2.maxDistance = 10000;
  _panner2.rolloffFactor = 1;
  _panner2.coneInnerAngle = 360;
  _panner2.coneOuterAngle = 360;

  if (_panner.positionX) {
    _panner.positionX.setValueAtTime(0, _audioCtx.currentTime);
    _panner.positionY.setValueAtTime(0, _audioCtx.currentTime);
    _panner.positionZ.setValueAtTime(1, _audioCtx.currentTime);
    _panner2.positionX.setValueAtTime(0, _audioCtx.currentTime);
    _panner2.positionY.setValueAtTime(0, _audioCtx.currentTime);
    _panner2.positionZ.setValueAtTime(-1, _audioCtx.currentTime);
  } else {
    _panner.setPosition(0, 0, 1);
    _panner2.setPosition(0, 0, -1);
  }

  _dryGain.connect(_pannerLPFilter);
  _wetGain.connect(_pannerLPFilter);

  _dryGain.connect(_pannerHPFilter);
  _wetGain.connect(_pannerHPFilter);

  _pannerLPFilter.connect(_pannerLPGain);
  _pannerLPGain.connect(_panner);
  _panner.connect(_analyser);

  _pannerHPFilter.connect(_pannerHPGain);
  _pannerHPGain.connect(_panner2);
  _panner2.connect(_analyser);

  _analyser.connect(_audioCtx.destination);

  // Apply persisted EQ & effects
  setTimeout(() => {
    const state = usePlayerStore.getState();
    applyEqBands(state.eqBands);
    applyAudioEffects(state);
  }, 0);
}

/** Exposes the AnalyserNode for visualizers */
export function getAnalyser() { return _analyser; }

const applyEqBands = (bands) => {
  if (!_audioCtx || !_filters.length) return;
  const state = usePlayerStore.getState();
  bands.forEach((val, i) => {
    if (_filters[i]) {
      let gain = val;
      if (state.isPerfectAudioActive) {
        // Studio-grade mastering curve:
        // Sub-bass warmth, bass body, slight mid-scoop, presence lift, air shelf
        const crystalCurve = [3.5, 3.0, 1.8, 0.5, -1.0, -0.8, 1.0, 2.5, 3.5, 4.5];
        gain += crystalCurve[i] ?? 0;
      }
      _filters[i].gain.setValueAtTime(gain, _audioCtx.currentTime);
    }
  });
};


// ═══════════════════════════════════════════════════════════════════════════
// Playback store — queue, transport, persistence. Audio events are wired once,
// here, so playback never depends on a component being mounted.
// ═══════════════════════════════════════════════════════════════════════════

// Debounced localStorage writer so rapid progress updates don't thrash disk
let _saveTimer = null;
const debouncedStorage = {
  getItem:    (key) => localStorage.getItem(key),
  removeItem: (key) => localStorage.removeItem(key),
  setItem:    (key, value) => {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => { try { localStorage.setItem(key, value); } catch { /* quota */ } }, 800);
  },
};

let _playToken = 0;           // invalidates stale async loads when the user skips quickly
let _loggedPlay = false;      // play counted once per listen (≥30 s or half the track)
let _consecutiveErrors = 0;
const _played = new Set();    // shuffle: keys already heard in this pass
const _history = [];          // shuffle: indices to walk back through
let _objectUrl = null;

function _revokeObjectUrl() {
  if (_objectUrl) { URL.revokeObjectURL(_objectUrl); _objectUrl = null; }
}

async function _resolveSource(track) {
  // Offline copy (Electron file, Capacitor file, or IndexedDB blob) wins over the network
  const offline = await useOfflineStore.getState().resolveAudioUrl(track.id);
  if (offline) {
    if (offline.startsWith('blob:')) { _revokeObjectUrl(); _objectUrl = offline; }
    return offline;
  }
  return tracksApi.streamUrl(track.id);
}

// Stream URL of the next online track, resolved ahead of time: after `ended` with the screen off
// a network round-trip before play() can cost us the browser's permission to start audio.
const _prefetched = new Map();
let _prefetchingFor = null;
function _prefetchNext() {
  const { queue, queueIndex, isShuffle } = usePlayerStore.getState();
  if (isShuffle) return;
  const idx = queueIndex + 1;
  const nxt = queue[idx];
  if (!nxt || !isExternal(nxt)) return;
  const key = trackKey(nxt, idx);
  if (_prefetched.has(key) || _prefetchingFor === key) return;
  _prefetchingFor = key;
  _resolveExternal(nxt).then((u) => _prefetched.set(key, u)).catch(() => {}).finally(() => { _prefetchingFor = null; });
}

async function _resolveExternal(track) {
  const url = track.externalUrl || track.webpage_url;
  const res = await externalSearchApi.getPreviewUrl(url);
  return res.data.streamUrl;
}

// Plain <audio> keeps playing with the screen off everywhere. Routing it through Web Audio (EQ, 8D, reverb)
// is what iOS may silence on lock — so on iPhone the graph is only built when an effect is actually in use.
function _effectsWanted() {
  const s = usePlayerStore.getState();
  return !!(s.is8DActive || s.isPerfectAudioActive || s.isAutoEqActive || s.isLofiActive || s.isKaraokeActive ||
    s.isSubBassActive || s.isVocalBoostActive || s.isDouble8DActive || s.isBassRumbleActive || s.isNightcoreActive ||
    s.isManualPanning || s.eqBands.some((v) => v !== 0));
}

// iOS only lets a media element start when play() runs inside the tap itself. External tracks first wait for the
// server to resolve a stream URL (seconds), by then the tap is long gone and play() is refused — so the element is
// claimed up front with a silent loop, then pointed at the real source once it is known.
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
let _claimed = false;
function _claimElement() {
  _claimed = true;
  _audio.loop = true;
  _audio.src = SILENT_WAV;
  _audio.play().catch(() => {});
}
function _releaseElement() {
  if (!_claimed) return;
  _claimed = false;
  _audio.loop = false;
}

function _prepareContext() {
  _setAudioSession();
  if (!IS_IOS || _effectsWanted()) initAudioContext();
  _resumeCtx();
}

export const usePlayerStore = create(
  persist(
    (set, get) => ({
      currentTrack: null,
      queue:        [],
      queueIndex:   0,
      isPlaying:    false,
      isBuffering:  false,
      volume:       0.8,
      progress:     0,
      duration:     0,
      isShuffle:    false,
      repeat:       'off',          // 'off' | 'all' | 'one'
      isRadio:      false,
      eqBands:      new Array(EQ_BAND_COUNT).fill(0),
      is8DActive:           false,
      isPerfectAudioActive: false,
      isAutoEqActive:       false,
      isLofiActive:         false,
      isKaraokeActive:      false,
      isSubBassActive:      false,
      isVocalBoostActive:   false,
      isDouble8DActive:     false,
      isBassRumbleActive:   false,
      isNightcoreActive:    false,
      reverbWet:            0.15,
      isManualPanning:      false,
      manualPos:            { x: 0, z: -0.4, h: 0 },
      activePreset:         'none',
      sleepTimer:        null,
      sleepTimerMinutes: 0,
      sleepAtEnd:        false,
      audio:        _audio, // excluded from persistence via partialize

      // ── Core: load + play the item at `index` of `queue` ────────────────────
      playQueue: async (queue, index = 0, { restore = false } = {}) => {
        const track = queue?.[index];
        if (!track) return;
        const token = ++_playToken;
        _prepareContext();
        _loggedPlay = false;
        _audio.volume = get().volume;

        set({
          currentTrack: track, queue, queueIndex: index,
          progress: 0, duration: track.duration || 0, isBuffering: true, isPlaying: true,
        });

        try {
          let src;
          if (isExternal(track)) {
            if (!restore && !_prefetched.has(trackKey(track, index))) _claimElement();
            src = _prefetched.get(trackKey(track, index)) ?? await _resolveExternal(track);
            _prefetched.delete(trackKey(track, index));
          } else {
            const cached = useOfflineStore.getState().isDownloaded(track.id);
            if (cached && !restore) _claimElement();
            src = cached ? await _resolveSource(track) : tracksApi.streamUrl(track.id);
          }
          if (token !== _playToken) return; // user already moved on
          _releaseElement();
          _audio.src = src;
          if (restore) return;
          await _audio.play();
          _consecutiveErrors = 0;
        } catch (err) {
          if (token !== _playToken) return;
          _releaseElement();
          if (err?.name === 'NotAllowedError') {
            set({ isPlaying: false, isBuffering: false });
            toast('Натисніть ▶, щоб почати відтворення');
            return;
          }
          if (err?.name === 'AbortError') return;
          get()._onPlaybackError(err);
        }
      },

      setTrack: (track, queue = [], index = 0) => {
        const q = queue.length ? queue : [track];
        const i = queue.length ? index : 0;
        return get().playQueue(q, i);
      },
      playTrack: (track, queue = [], index = 0) => get().setTrack(track, queue, index),

      setQueue: (tracks, startId) => {
        const index = tracks.findIndex((t) => t.id === startId);
        return get().playQueue(tracks, index >= 0 ? index : 0);
      },

      playExternal: (item, queue, index) => {
        const t = normalizeExternal(item);
        return get().playQueue(queue?.length ? queue : [t], queue?.length ? index : 0);
      },

      // Kept for DeviceSync / legacy callers: play an already-resolved stream URL
      playExternalUrl: (streamUrl, meta, queue = [], index = 0) => {
        _prepareContext();
        _playToken++;
        _loggedPlay = false;
        _audio.src = streamUrl;
        _audio.volume = get().volume;
        _audio.play().catch(() => {});
        const t = normalizeExternal({ ...meta, externalUrl: meta.externalUrl });
        set({ currentTrack: t, queue: queue.length ? queue : [t], queueIndex: index, isPlaying: true, progress: 0, duration: meta.duration || 0 });
      },

      togglePlay: () => {
        _prepareContext();
        if (!get().currentTrack) return;
        if (_audio.paused) {
          if (!_audio.src) { get().playQueue(get().queue, get().queueIndex); return; }
          _audio.play().catch(() => {});
        } else {
          _audio.pause();
        }
      },

      pause: () => { _audio.pause(); },

      next: async ({ auto = false } = {}) => {
        const { queue, queueIndex, isShuffle, repeat, currentTrack } = get();
        if (!queue.length) return;

        // Radio: keep the queue topped up
        if (get().isRadio && queue.length - queueIndex <= 3) get()._topUpRadio();

        let idx;
        if (isShuffle && queue.length > 1) {
          _played.add(trackKey(currentTrack, queueIndex));
          let pool = queue.map((t, i) => i).filter((i) => !_played.has(trackKey(queue[i], i)));
          if (!pool.length) {
            if (repeat === 'all' || !auto) { _played.clear(); _played.add(trackKey(currentTrack, queueIndex)); pool = queue.map((_, i) => i).filter((i) => i !== queueIndex); }
            else { _audio.pause(); _audio.currentTime = 0; set({ isPlaying: false, progress: 0 }); return; }
          }
          idx = pool[Math.floor(Math.random() * pool.length)];
          _history.push(queueIndex);
        } else {
          idx = queueIndex + 1;
          if (idx >= queue.length) {
            if (repeat === 'all' || !auto) idx = 0;
            else { _audio.pause(); _audio.currentTime = 0; set({ isPlaying: false, progress: 0 }); return; }
          }
        }
        return get().playQueue(queue, idx);
      },

      prev: async () => {
        const { queue, queueIndex, isShuffle, repeat } = get();
        if (_audio.currentTime > 3 || !queue.length) { _audio.currentTime = 0; set({ progress: 0 }); return; }
        let idx;
        if (isShuffle && _history.length) idx = _history.pop();
        else idx = queueIndex - 1 < 0 ? (repeat === 'all' ? queue.length - 1 : 0) : queueIndex - 1;
        return get().playQueue(queue, idx);
      },

      _onPlaybackError: (err) => {
        console.error('[player]', err);
        _consecutiveErrors += 1;
        set({ isBuffering: false });
        const { queue, queueIndex } = get();
        if (_consecutiveErrors <= 3 && queue.length > 1 && queueIndex < queue.length - 1) {
          toast.error('Трек недоступний — пропускаю');
          get().next({ auto: true });
        } else {
          set({ isPlaying: false });
          toast.error('Не вдалося відтворити трек');
        }
      },

      _topUpRadio: async () => {
        const { currentTrack, queue } = get();
        if (!currentTrack || get()._radioBusy) return;
        set({ _radioBusy: true });
        try {
          let more = [];
          if (currentTrack.id != null) {
            const res = await discoverApi.similar(currentTrack.id, 10);
            more = Array.isArray(res.data) ? res.data : [];
          }
          if (more.length < 3) {
            const seed = currentTrack.id ?? null;
            if (seed != null) {
              const res = await externalSearchApi.radio(seed, 6);
              more = more.concat((Array.isArray(res.data) ? res.data : []).map(normalizeExternal));
            }
          }
          const have = new Set(queue.map((t, i) => trackKey(t, i)));
          const fresh = more.filter((t, i) => !have.has(trackKey(t, i)));
          if (fresh.length) set((s) => ({ queue: [...s.queue, ...fresh] }));
        } catch { /* radio is best-effort */ }
        finally { set({ _radioBusy: false }); }
      },

      setVolume: (vol) => { _audio.volume = vol; set({ volume: vol }); },
      seek:      (time) => { if (Number.isFinite(time)) { _audio.currentTime = Math.max(0, time); set({ progress: Math.max(0, time) }); } },

      toggleShuffle: () => { _played.clear(); _history.length = 0; set((s) => ({ isShuffle: !s.isShuffle })); },
      cycleRepeat:   () => set((s) => ({ repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off' })),
      setProgress:   (progress) => set({ progress }),
      setDuration:   (duration) => set({ duration }),
      setIsPlaying:  (isPlaying) => set({ isPlaying }),

      // ── Queue manipulation ──────────────────────────────────────────────────
      addToQueue: (track) => { set((s) => ({ queue: s.queue.length ? [...s.queue, track] : [track] })); return true; },
      addToQueueNext: (track) => {
        set((s) => {
          if (!s.queue.length) return { queue: [track], queueIndex: 0 };
          const q = [...s.queue];
          q.splice(s.queueIndex + 1, 0, track);
          return { queue: q };
        });
      },
      addBulkToQueue: (tracks) => set((s) => ({ queue: [...s.queue, ...tracks] })),
      removeFromQueue: (index) => set((s) => {
        const q = s.queue.filter((_, i) => i !== index);
        const qi = index < s.queueIndex ? s.queueIndex - 1 : Math.min(s.queueIndex, Math.max(0, q.length - 1));
        return { queue: q, queueIndex: qi };
      }),
      moveInQueue: (from, to) => set((s) => {
        if (from === to) return {};
        const q = [...s.queue];
        const [item] = q.splice(from, 1);
        q.splice(to, 0, item);
        let qi = s.queueIndex;
        if (from === qi) qi = to;
        else if (from < qi && to >= qi) qi -= 1;
        else if (from > qi && to <= qi) qi += 1;
        return { queue: q, queueIndex: qi };
      }),
      clearUpcoming: () => set((s) => ({ queue: s.queue.slice(0, s.queueIndex + 1) })),
      shuffleQueue: () => {
        const { queue, queueIndex } = get();
        if (queue.length < 2) return;
        const current = queue[queueIndex];
        const rest = queue.filter((_, i) => i !== queueIndex);
        for (let i = rest.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [rest[i], rest[j]] = [rest[j], rest[i]];
        }
        set({ queue: [current, ...rest], queueIndex: 0 });
      },

      // ── Sound ───────────────────────────────────────────────────────────────
      toggle8D: () => {
        initAudioContext();
        const val = !get().is8DActive;
        set({ is8DActive: val, isManualPanning: false, activePreset: 'custom' });
        applyAudioEffects(get());
      },
      togglePerfectAudio: () => {
        initAudioContext();
        set({ isPerfectAudioActive: !get().isPerfectAudioActive, activePreset: 'custom' });
        applyEqBands(get().eqBands);
        applyAudioEffects(get());
      },
      toggleAutoEq: () => {
        initAudioContext();
        set({ isAutoEqActive: !get().isAutoEqActive, activePreset: 'custom' });
        applyAudioEffects(get());
      },
      toggleLofi: () => {
        initAudioContext();
        const val = !get().isLofiActive;
        set({ isLofiActive: val, isKaraokeActive: val ? false : get().isKaraokeActive, activePreset: 'custom' });
        applyAudioEffects(get());
      },
      toggleKaraoke: () => {
        initAudioContext();
        const val = !get().isKaraokeActive;
        set({ isKaraokeActive: val, isLofiActive: val ? false : get().isLofiActive, activePreset: 'custom' });
        applyAudioEffects(get());
      },
      toggleSubBass: () => { initAudioContext(); set({ isSubBassActive: !get().isSubBassActive, activePreset: 'custom' }); applyAudioEffects(get()); },
      toggleVocalBoost: () => { initAudioContext(); set({ isVocalBoostActive: !get().isVocalBoostActive, activePreset: 'custom' }); applyAudioEffects(get()); },
      toggleDouble8D: () => {
        initAudioContext();
        const val = !get().isDouble8DActive;
        set({ isDouble8DActive: val, is8DActive: val ? false : get().is8DActive, isManualPanning: val ? false : get().isManualPanning, activePreset: 'custom' });
        applyAudioEffects(get());
      },
      toggleBassRumble: () => { initAudioContext(); set({ isBassRumbleActive: !get().isBassRumbleActive, activePreset: 'custom' }); applyAudioEffects(get()); },
      toggleNightcore: () => { initAudioContext(); set({ isNightcoreActive: !get().isNightcoreActive, activePreset: 'custom' }); applyAudioEffects(get()); },

      setPreset: (presetName) => {
        initAudioContext();
        const off = {
          is8DActive: false, isPerfectAudioActive: false, isAutoEqActive: false,
          isLofiActive: false, isKaraokeActive: false, isSubBassActive: false,
          isVocalBoostActive: false, isDouble8DActive: false, isBassRumbleActive: false,
          isNightcoreActive: false, reverbWet: 0.15, isManualPanning: false,
        };
        const presets = {
          none: off,
          concert: { ...off, is8DActive: true, isPerfectAudioActive: true, isAutoEqActive: true, isSubBassActive: true, reverbWet: 0.58 },
          club:    { ...off, isPerfectAudioActive: true, isAutoEqActive: true, isVocalBoostActive: true, isBassRumbleActive: true, reverbWet: 0.22 },
          retro:   { ...off, isLofiActive: true, reverbWet: 0.4 },
          karaoke: { ...off, isPerfectAudioActive: true, isKaraokeActive: true, isSubBassActive: true, reverbWet: 0.2 },
        };
        set({ activePreset: presetName, ...(presets[presetName] || off) });
        applyAudioEffects(get());
      },

      // x, z: anywhere inside the unit disk (z < 0 = front); h: -1..1 (below..above).
      // Pass only the axes that changed — the rest keep their value.
      setPannerPositionManual: (x, z, h) => {
        initAudioContext();
        const prev = get().manualPos;
        let nx = x ?? prev.x, nz = z ?? prev.z;
        const d = Math.hypot(nx, nz);
        if (d > 1) { nx /= d; nz /= d; }
        const manualPos = { x: nx, z: nz, h: Math.max(-1, Math.min(1, h ?? prev.h)) };
        const wasManual = get().isManualPanning;
        set({ manualPos, is8DActive: false, isDouble8DActive: false, isManualPanning: true, activePreset: 'custom' });
        // first placement: let the effects pass drop 8D rotation and reset the crossover
        if (!wasManual) applyAudioEffects(get());
        applyManualPanner(manualPos);
      },

      resetPanner: () => {
        initAudioContext();
        set({ isManualPanning: false, manualPos: { x: 0, z: -0.4, h: 0 } });
        applyAudioEffects(get());
      },

      setReverbWet: (wet) => { initAudioContext(); set({ reverbWet: wet }); applyAudioEffects(get()); },

      setEqBand: (index, value) => {
        initAudioContext();
        const bands = [...get().eqBands];
        bands[index] = value;
        applyEqBands(bands);
        set({ eqBands: bands });
      },
      setEqBands: (bands) => { initAudioContext(); applyEqBands(bands); set({ eqBands: bands }); },

      // ── Sleep timer ─────────────────────────────────────────────────────────
      setSleepTimer: (minutes) => {
        if (minutes === 'end') set({ sleepTimer: null, sleepTimerMinutes: 0, sleepAtEnd: true });
        else if (!minutes) set({ sleepTimer: null, sleepTimerMinutes: 0, sleepAtEnd: false });
        else set({ sleepTimer: Date.now() + minutes * 60000, sleepTimerMinutes: minutes, sleepAtEnd: false });
      },
      clearSleepTimer: () => set({ sleepTimer: null, sleepTimerMinutes: 0, sleepAtEnd: false }),

      // ── Radio ───────────────────────────────────────────────────────────────
      toggleRadio: () => {
        const on = !get().isRadio;
        set({ isRadio: on });
        if (on) get()._topUpRadio();
      },

      updateCurrentTrack: (updates) =>
        set((s) => ({ currentTrack: s.currentTrack ? { ...s.currentTrack, ...updates } : null })),
    }),
    {
      name:    'beatify-player',
      storage: debouncedStorage,
      version: 3,
      migrate: (persisted, version) => {
        if (!persisted) return persisted;
        if (persisted.eqBands?.length === 5) {
          const [b60, b230, b910, b3600, b14000] = persisted.eqBands;
          persisted.eqBands = [b60, b60, b230, b230, b910, b910, b3600, b3600, b14000, b14000];
        } else if (!Array.isArray(persisted.eqBands) || persisted.eqBands.length !== EQ_BAND_COUNT) {
          persisted.eqBands = new Array(EQ_BAND_COUNT).fill(0);
        }
        if (version < 3) {
          persisted.repeat = persisted.isRepeat ? 'one' : 'off';
          delete persisted.isRepeat;
        }
        return persisted;
      },
      partialize: (s) => ({
        currentTrack: s.currentTrack,
        queue:        s.queue,
        queueIndex:   s.queueIndex,
        volume:       s.volume,
        isShuffle:    s.isShuffle,
        repeat:       s.repeat,
        isRadio:      s.isRadio,
        progress:     s.progress,
        eqBands:      s.eqBands,
        is8DActive:           s.is8DActive,
        isPerfectAudioActive: s.isPerfectAudioActive,
        isAutoEqActive:       s.isAutoEqActive,
        isLofiActive:         s.isLofiActive,
        isKaraokeActive:      s.isKaraokeActive,
        isSubBassActive:      s.isSubBassActive,
        isVocalBoostActive:   s.isVocalBoostActive,
        isDouble8DActive:     s.isDouble8DActive,
        isBassRumbleActive:   s.isBassRumbleActive,
        isNightcoreActive:    s.isNightcoreActive,
        reverbWet:            s.reverbWet,
        isManualPanning:      s.isManualPanning,
        manualPos:            s.manualPos,
        activePreset:         s.activePreset,
      }),
      // After hydration: put the last track back on the element (paused — browsers
      // block autoplay without a gesture, and a resumed session should not blast sound).
      onRehydrateStorage: () => (state) => {
        _audio.volume = state?.volume ?? 0.8;
        if (!state?.currentTrack) return;
        const seekTo = state.progress ?? 0;
        if (isExternal(state.currentTrack)) return; // stream URLs expire — resolve on play

        const track = state.currentTrack;
        const src = tracksApi.streamUrl(track.id);
        _audio.src = src;
        _audio.preload = 'metadata';
        if (seekTo > 0) {
          _audio.addEventListener('loadedmetadata', () => { try { _audio.currentTime = seekTo; } catch { /* not seekable yet */ } }, { once: true });
        }
        queueMicrotask(() => usePlayerStore.setState({ isPlaying: false }));
      },
    }
  )
);

// ── Audio element events (registered once for the app's lifetime) ─────────────
_audio.addEventListener('timeupdate', () => {
  const s = usePlayerStore.getState();
  const t = _audio.currentTime;
  usePlayerStore.setState({ progress: t });

  // Count a play once the listener has really listened
  if (!_loggedPlay && s.currentTrack?.id != null && (t >= 30 || (_audio.duration > 0 && t >= _audio.duration * 0.5))) {
    _loggedPlay = true;
    if (useAuthStore.getState().token) tracksApi.logPlay(s.currentTrack.id, Math.round(t)).catch(() => {});
  }

  if (_audio.duration > 0 && _audio.duration - t < 25) _prefetchNext();

  // Sleep timer
  if (s.sleepTimer && Date.now() >= s.sleepTimer) {
    _audio.pause();
    usePlayerStore.getState().clearSleepTimer();
    toast('Таймер сну: відтворення зупинено');
  }
});
_audio.addEventListener('durationchange', () => {
  if (Number.isFinite(_audio.duration) && _audio.duration > 0) usePlayerStore.setState({ duration: _audio.duration });
});
_audio.addEventListener('play',    () => usePlayerStore.setState({ isPlaying: true }));
_audio.addEventListener('pause',   () => usePlayerStore.setState({ isPlaying: false }));
_audio.addEventListener('waiting', () => usePlayerStore.setState({ isBuffering: true }));
_audio.addEventListener('playing', () => usePlayerStore.setState({ isBuffering: false, isPlaying: true }));
_audio.addEventListener('canplay', () => usePlayerStore.setState({ isBuffering: false }));
_audio.addEventListener('ended', () => {
  if (_claimed) return;
  const s = usePlayerStore.getState();
  if (s.repeat === 'one') { _audio.currentTime = 0; _audio.play().catch(() => {}); return; }
  if (s.sleepAtEnd) { s.clearSleepTimer(); usePlayerStore.setState({ isPlaying: false }); toast('Таймер сну: трек завершено'); return; }
  s.next({ auto: true });
});
_audio.addEventListener('error', () => {
  if (_claimed || !_audio.src || _audio.src === window.location.href) return;
  const s = usePlayerStore.getState();
  if (s.currentTrack) s._onPlaybackError(_audio.error || new Error('audio error'));
});
