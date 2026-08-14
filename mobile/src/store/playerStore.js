import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { tracksApi, apiBase } from '../api';

function getOfflineAudioUrl(trackId) {
  try {
    const raw = localStorage.getItem('beatify-offline');
    if (!raw) return null;
    const state = JSON.parse(raw);
    return state?.state?.downloadedTracks?.[String(trackId)]?.audioUrl ?? null;
  } catch {
    return null;
  }
}

// Single audio element — module-level singleton, never serialized to localStorage
const _audio = new Audio();
_audio.crossOrigin = "anonymous";

// ── Background audio keep-alive ───────────────────────────────────────────────
// iOS suspends AudioContext when PWA goes to background.
// Resume it on every visibility/focus/pageshow event and periodically while playing.
function _resumeCtx() {
  if (_audioCtx && _audioCtx.state === 'suspended') {
    _audioCtx.resume().catch(() => {});
  }
}

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
  let apL = 0, apR = 0; // all-pass state for decorrelation

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
    } catch {}
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
  if (!is8DActive && !isDouble8DActive && _panner) {
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
    if (_audioCtx.state === 'suspended' && !_audio.paused) {
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

// Auto-fetch lyrics in background when a track starts playing
async function autoFetchLyrics(track) {
  if (track?.lyrics) return;
  const title = track?.title || '';
  const artist = track?.artistName || track?.artist || '';
  if (!title) return;
  try {
    const { externalSearchApi } = await import('../api');
    // Use the base URL since we're in store
    const res = await fetch(
      `${apiBase}/externalsearch/fetchlyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`,
      { headers: { 'Content-Type': 'application/json' } }
    );
    if (!res.ok) return;
    const data = await res.json();
    if (!data?.found || !data?.lyrics) return;

    const curr = usePlayerStore.getState().currentTrack;
    const isSame = track.id
      ? curr?.id === track.id
      : curr?.externalUrl === track.externalUrl;
    if (!isSame) return;

    usePlayerStore.setState(s => ({
      currentTrack: s.currentTrack ? { ...s.currentTrack, lyrics: data.lyrics } : null
    }));

    // Save to backend for local tracks
    if (track.id && !track.isExternal) {
      const token = (() => { try { const raw = localStorage.getItem('beatify-auth'); return raw ? JSON.parse(raw)?.state?.token : null; } catch { return null; } })();
      if (token) {
        const fd = new FormData();
        fd.append('Lyrics', data.lyrics);
        fetch(`${apiBase}/tracks/${track.id}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        }).catch(() => {});
      }
    }
  } catch {}
}

// Debounced localStorage writer so rapid progress updates don't thrash disk
let _saveTimer = null;
const debouncedStorage = {
  getItem:    (key) => localStorage.getItem(key),
  removeItem: (key) => localStorage.removeItem(key),
  setItem:    (key, value) => {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => localStorage.setItem(key, value), 800);
  },
};

async function fetchRadioTracks(trackId) {
  try {
    const { externalSearchApi } = await import('../api');
    const res = await externalSearchApi.radio(trackId, 5);
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}

export const usePlayerStore = create(
  persist(
    (set, get) => ({
      currentTrack: null,
      queue:        [],
      queueIndex:   0,
      isPlaying:    false,
      volume:       0.8,
      progress:     0,
      duration:     0,
      isShuffle:    false,
      isRepeat:     false,
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
      activePreset:         'none',
      sleepTimer:        null,
      sleepTimerMinutes: 0,
      audio:        _audio, // excluded from persistence via partialize

      setTrack: (track, queue = [], index = 0) => {
        initAudioContext();
        if (_audioCtx && _audioCtx.state === 'suspended') _audioCtx.resume();
        const offlineUrl = getOfflineAudioUrl(track.id);
        _audio.src = offlineUrl || tracksApi.streamUrl(track.id);
        _audio.volume = get().volume;
        _audio.play().catch(() => {});
        set({ currentTrack: track, queue, queueIndex: index, isPlaying: true, progress: 0, duration: 0 });
        tracksApi.logPlay(track.id).catch(() => {});
        // Auto-fetch lyrics after brief delay so playback starts first
        setTimeout(() => autoFetchLyrics(track), 2000);
      },

      playTrack: (track, queue = [], index = 0) => get().setTrack(track, queue, index),

      setQueue: (tracks, startId) => {
        const index = tracks.findIndex(t => t.id === startId);
        const idx = index >= 0 ? index : 0;
        get().setTrack(tracks[idx], tracks, idx);
      },

      playExternalUrl: (streamUrl, meta, queue = [], index = 0) => {
        initAudioContext();
        if (_audioCtx && _audioCtx.state === 'suspended') _audioCtx.resume();
        _audio.src = streamUrl;
        _audio.volume = get().volume;
        _audio.play().catch(() => {});
        set({
          currentTrack: {
            id: null, isExternal: true,
            externalUrl: meta.externalUrl,
            title: meta.title,
            artistName: meta.artistName,
            thumbnail: meta.thumbnail,
            coverPath: null,
            source: meta.source,
            duration: meta.duration,
            mediaType: 'audio',
            lyrics: null,
          },
          queue: queue, queueIndex: index, isPlaying: true, progress: 0, duration: 0,
        });
        // Auto-fetch lyrics for external tracks
        const exMeta = { title: meta.title, artistName: meta.artistName, externalUrl: meta.externalUrl, id: null, isExternal: true };
        setTimeout(() => autoFetchLyrics(exMeta), 2000);
      },

      togglePlay: () => {
        initAudioContext();
        if (_audioCtx && _audioCtx.state === 'suspended') _audioCtx.resume();
        const { isPlaying } = get();
        if (isPlaying) {
          _audio.pause();
          set({ isPlaying: false });
        } else {
          _audio.play().catch(() => {});
          set({ isPlaying: true });
        }
      },

      next: async () => {
        const { queue, queueIndex, isShuffle, currentTrack } = get();
        if (!queue.length) return;
        const idx = isShuffle
          ? Math.floor(Math.random() * queue.length)
          : (queueIndex + 1) % queue.length;
        
        const nextTrack = queue[idx];
        if (nextTrack.isExternal || nextTrack.source) {
          try {
            const { externalSearchApi } = await import('../api');
            const res = await externalSearchApi.getPreviewUrl(nextTrack.webpage_url || nextTrack.externalUrl);
            get().playExternalUrl(res.data.streamUrl, {
              title: nextTrack.title,
              artistName: nextTrack.artist || nextTrack.artistName || 'Unknown',
              thumbnail: nextTrack.thumbnail,
              externalUrl: nextTrack.webpage_url || nextTrack.externalUrl,
              source: nextTrack.source,
              duration: nextTrack.duration,
            }, queue, idx);
          } catch (e) { console.error(e); }
        } else {
          get().setTrack(nextTrack, queue, idx);
        }
      },

      prev: async () => {
        const { queue, queueIndex, currentTrack } = get();
        if (_audio.currentTime > 3) { _audio.currentTime = 0; return; }
        if (!queue.length) return;
        const idx = (queueIndex - 1 + queue.length) % queue.length;
        
        const prevTrack = queue[idx];
        if (prevTrack.isExternal || prevTrack.source) {
          try {
            const { externalSearchApi } = await import('../api');
            const res = await externalSearchApi.getPreviewUrl(prevTrack.webpage_url || prevTrack.externalUrl);
            get().playExternalUrl(res.data.streamUrl, {
              title: prevTrack.title,
              artistName: prevTrack.artist || prevTrack.artistName || 'Unknown',
              thumbnail: prevTrack.thumbnail,
              externalUrl: prevTrack.webpage_url || prevTrack.externalUrl,
              source: prevTrack.source,
              duration: prevTrack.duration,
            }, queue, idx);
          } catch (e) { console.error(e); }
        } else {
          get().setTrack(prevTrack, queue, idx);
        }
      },

      setVolume: (vol) => { _audio.volume = vol; set({ volume: vol }); },
      seek:      (time) => { _audio.currentTime = time; set({ progress: time }); },

      toggleShuffle: () => set((s) => ({ isShuffle: !s.isShuffle })),
      toggleRepeat:  () => set((s) => ({ isRepeat:  !s.isRepeat  })),
      setProgress:   (progress) => set({ progress }),
      setDuration:   (duration) => set({ duration }),
      setIsPlaying:  (isPlaying) => set({ isPlaying }),

      // ── Queue manipulation ──────────────────────────────────────────────────
      addToQueue: (track) => {
        set(s => ({ queue: [...s.queue, track] }));
        return true;
      },

      addToQueueNext: (track) => {
        set(s => {
          const newQ = [...s.queue];
          newQ.splice(s.queueIndex + 1, 0, track);
          return { queue: newQ };
        });
      },

      addBulkToQueue: (tracks) => {
        set(s => ({ queue: [...s.queue, ...tracks] }));
      },

      shuffleQueue: () => {
        const { queue, queueIndex } = get();
        if (queue.length < 2) return;
        const current = queue[queueIndex];
        const rest = queue.filter((_, i) => i !== queueIndex);
        const shuffled = rest.sort(() => Math.random() - 0.5);
        set({ queue: [current, ...shuffled], queueIndex: 0 });
      },

      toggle8D: () => {
        initAudioContext();
        const val = !get().is8DActive;
        set({ is8DActive: val, isManualPanning: false, activePreset: 'custom' });
        applyAudioEffects(get());
      },

      togglePerfectAudio: () => {
        initAudioContext();
        const val = !get().isPerfectAudioActive;
        set({ isPerfectAudioActive: val, activePreset: 'custom' });
        applyEqBands(get().eqBands);
        applyAudioEffects(get());
      },

      toggleAutoEq: () => {
        initAudioContext();
        const val = !get().isAutoEqActive;
        set({ isAutoEqActive: val, activePreset: 'custom' });
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

      toggleSubBass: () => {
        initAudioContext();
        set({ isSubBassActive: !get().isSubBassActive, activePreset: 'custom' });
        applyAudioEffects(get());
      },

      toggleVocalBoost: () => {
        initAudioContext();
        set({ isVocalBoostActive: !get().isVocalBoostActive, activePreset: 'custom' });
        applyAudioEffects(get());
      },

      toggleDouble8D: () => {
        initAudioContext();
        const val = !get().isDouble8DActive;
        set({ isDouble8DActive: val, is8DActive: val ? false : get().is8DActive, activePreset: 'custom' });
        applyAudioEffects(get());
      },

      toggleBassRumble: () => {
        initAudioContext();
        set({ isBassRumbleActive: !get().isBassRumbleActive, activePreset: 'custom' });
        applyAudioEffects(get());
      },

      toggleNightcore: () => {
        initAudioContext();
        set({ isNightcoreActive: !get().isNightcoreActive, activePreset: 'custom' });
        applyAudioEffects(get());
      },

      setPreset: (presetName) => {
        initAudioContext();
        const presets = {
          none: {
            is8DActive: false, isPerfectAudioActive: false, isAutoEqActive: false,
            isLofiActive: false, isKaraokeActive: false, isSubBassActive: false,
            isVocalBoostActive: false, isDouble8DActive: false, isBassRumbleActive: false,
            isNightcoreActive: false, reverbWet: 0.15, isManualPanning: false
          },
          concert: {
            // Arena 8D — orbiting + huge reverb + sub + auto eq
            is8DActive: true, isPerfectAudioActive: true, isAutoEqActive: true,
            isLofiActive: false, isKaraokeActive: false, isSubBassActive: true,
            isVocalBoostActive: false, isDouble8DActive: false, isBassRumbleActive: false,
            isNightcoreActive: false, reverbWet: 0.58, isManualPanning: false
          },
          club: {
            // Cyber Club — bass rumble + vocal clarity + auto eq
            is8DActive: false, isPerfectAudioActive: true, isAutoEqActive: true,
            isLofiActive: false, isKaraokeActive: false, isSubBassActive: false,
            isVocalBoostActive: true, isDouble8DActive: false, isBassRumbleActive: true,
            isNightcoreActive: false, reverbWet: 0.22, isManualPanning: false
          },
          retro: {
            // Lo-Fi Cafe — vintage vinyl tape
            is8DActive: false, isPerfectAudioActive: false, isAutoEqActive: false,
            isLofiActive: true, isKaraokeActive: false, isSubBassActive: false,
            isVocalBoostActive: false, isDouble8DActive: false, isBassRumbleActive: false,
            isNightcoreActive: false, reverbWet: 0.40, isManualPanning: false
          },
          karaoke: {
            // Karaoke — stereo-preserving vocal cancellation + sub bass
            is8DActive: false, isPerfectAudioActive: true, isAutoEqActive: false,
            isLofiActive: false, isKaraokeActive: true, isSubBassActive: true,
            isVocalBoostActive: false, isDouble8DActive: false, isBassRumbleActive: false,
            isNightcoreActive: false, reverbWet: 0.20, isManualPanning: false
          }
        };
        const settings = presets[presetName] || presets.none;
        set({
          activePreset: presetName,
          ...settings
        });
        applyAudioEffects(get());
      },

      setPannerPositionManual: (x, z) => {
        initAudioContext();
        set({ is8DActive: false, isManualPanning: true, activePreset: 'custom' });
        
        // Update local panner angle so if they toggle 8D back on, it starts from where they left it
        _pannerAngle = Math.atan2(x, z);
        
        if (_panner) {
          const distance = Math.sqrt(x*x + z*z) || 1;
          const targetX = (x / distance) * 3.5;
          const targetZ = (z / distance) * 3.5;
          
          if (_panner.positionX) {
            _panner.positionX.setTargetAtTime(targetX, _audioCtx.currentTime, 0.05);
            _panner.positionY.setTargetAtTime(0, _audioCtx.currentTime, 0.05);
            _panner.positionZ.setTargetAtTime(targetZ, _audioCtx.currentTime, 0.05);
          } else if (typeof _panner.setPosition === 'function') {
            _panner.setPosition(targetX, 0, targetZ);
          }
        }
      },

      setReverbWet: (wet) => {
        initAudioContext();
        set({ reverbWet: wet });
        applyAudioEffects(get());
      },

      setEqBand: (index, value) => {
        initAudioContext();
        const newBands = [...get().eqBands];
        newBands[index] = value;
        applyEqBands(newBands);
        set({ eqBands: newBands });
      },

      setEqBands: (bands) => {
        initAudioContext();
        applyEqBands(bands);
        set({ eqBands: bands });
      },

      // Sleep timer
      setSleepTimer: (minutes) => {
        if (!minutes) {
          set({ sleepTimer: null, sleepTimerMinutes: 0 });
        } else {
          set({ sleepTimer: Date.now() + minutes * 60000, sleepTimerMinutes: minutes });
        }
      },
      clearSleepTimer: () => set({ sleepTimer: null, sleepTimerMinutes: 0 }),

      // Radio mode
      toggleRadio: () => set((s) => ({ isRadio: !s.isRadio })),

      // Patch the currentTrack object in-place (e.g. after saving lyrics)
      updateCurrentTrack: (updates) =>
        set((s) => ({ currentTrack: s.currentTrack ? { ...s.currentTrack, ...updates } : null })),
    }),
    {
      name:    'beatify-player',
      storage: debouncedStorage,
      version: 2,
      migrate: (persisted) => {
        // v1 → v2: EQ expanded from 5 bands [60,230,910,3600,14000]
        // to 10 ISO bands — spread each old band across its two new neighbours
        if (persisted?.eqBands?.length === 5) {
          const [b60, b230, b910, b3600, b14000] = persisted.eqBands;
          persisted.eqBands = [b60, b60, b230, b230, b910, b910, b3600, b3600, b14000, b14000];
        } else if (!Array.isArray(persisted?.eqBands) || persisted.eqBands.length !== EQ_BAND_COUNT) {
          if (persisted) persisted.eqBands = new Array(EQ_BAND_COUNT).fill(0);
        }
        return persisted;
      },
      // Only persist these fields — audio element and isPlaying are intentionally excluded
      partialize: (s) => ({
        currentTrack: s.currentTrack,
        queue:        s.queue,
        queueIndex:   s.queueIndex,
        isPlaying:    s.isPlaying,
        volume:       s.volume,
        isShuffle:    s.isShuffle,
        isRepeat:     s.isRepeat,
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
        activePreset:         s.activePreset,
      }),
      // After hydration: restore audio source + seek position
      onRehydrateStorage: () => (state) => {
        _audio.volume = state?.volume ?? 0.8;
        if (!state?.currentTrack) return;
        
        // Wait for user interaction to initAudioContext, but we can restore EQ bands later when it's initialized.
        // Or we just rely on setEqBand calls, but we need to apply them on first play.
        // We will call applyEqBands inside initAudioContext by reading from localStorage directly or state.
        
        const seekTo = state.progress ?? 0;
        
        const applyState = () => {
          if (seekTo > 0) _audio.currentTime = seekTo;
          if (state.isPlaying) {
            initAudioContext();
            _audio.play().catch(() => { usePlayerStore.setState({ isPlaying: false }); });
            if (_audioCtx && _audioCtx.state === 'suspended') _audioCtx.resume().catch(()=>{});
          }
        };

        if (!state.currentTrack.isExternal) {
          const offlineUrl = getOfflineAudioUrl(state.currentTrack.id);
          _audio.src = offlineUrl || tracksApi.streamUrl(state.currentTrack.id);
          if (_audio.readyState >= 1) {
            applyState();
          } else {
            _audio.addEventListener('loadedmetadata', applyState, { once: true });
          }
        } else {
          // External URLs expire quickly, so we reset playback to paused and do not restore the URL
          usePlayerStore.setState({ isPlaying: false });
        }
      },
    }
  )
);
