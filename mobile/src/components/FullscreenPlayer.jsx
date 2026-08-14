import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { usePlayerStore, getAnalyser } from '../store/playerStore';
import { useAlbumColor } from '../hooks/useAlbumColor';
import { fileUrl } from '../api';
import AudioEffectsModal from './AudioEffectsModal';

// ─── Waveform Seekbar ─────────────────────────────────────────────────────────
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function strToSeed(str) {
  if (!str) return 12345;
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 12345;
}

// ─── Audio Visualizer ─────────────────────────────────────────────────────────
function AudioVisualizer({ coverSrc, isPlaying }) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  const color     = useAlbumColor(coverSrc);
  const colorStr  = color ? `${color.r},${color.g},${color.b}` : '255,255,255';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const BAR_COUNT = 60;
    let animating = true;

    // Smooth bar heights with decay when paused
    const heights = new Array(BAR_COUNT).fill(0);

    const draw = () => {
      if (!animating) return;
      const analyser = getAnalyser();
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (analyser) {
        const bufLen = analyser.frequencyBinCount; // 256
        const data   = new Uint8Array(bufLen);
        analyser.getByteFrequencyData(data);

        // Map 256 bins → BAR_COUNT bars (use only lower 60% of spectrum)
        const usableBins = Math.floor(bufLen * 0.6);
        for (let i = 0; i < BAR_COUNT; i++) {
          const bin = Math.floor((i / BAR_COUNT) * usableBins);
          const target = (data[bin] / 255) * h;
          // Smooth: fast rise, slow fall
          heights[i] = target > heights[i]
            ? target
            : heights[i] * 0.88 + target * 0.12;
        }
      } else {
        // Decay all bars when no analyser
        for (let i = 0; i < BAR_COUNT; i++) heights[i] *= 0.9;
      }

      const gap  = 3;
      const barW = (w - gap * (BAR_COUNT - 1)) / BAR_COUNT;

      for (let i = 0; i < BAR_COUNT; i++) {
        const barH = Math.max(3, heights[i]);
        const x    = i * (barW + gap);
        const y    = h - barH;
        const r    = Math.min(barW / 2, 4);

        const grad = ctx.createLinearGradient(0, h, 0, y);
        grad.addColorStop(0,   `rgba(${colorStr},0.30)`);
        grad.addColorStop(0.5, `rgba(${colorStr},0.70)`);
        grad.addColorStop(1,   `rgba(${colorStr},1.00)`);
        ctx.fillStyle = grad;

        ctx.beginPath();
        if (barH > r * 2) {
          ctx.moveTo(x + r, y);
          ctx.lineTo(x + barW - r, y);
          ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
          ctx.lineTo(x + barW, h);
          ctx.lineTo(x, h);
          ctx.lineTo(x, y + r);
          ctx.quadraticCurveTo(x, y, x + r, y);
        } else {
          ctx.rect(x, y, barW, barH);
        }
        ctx.closePath();
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => { animating = false; if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [colorStr]);

  return (
    <canvas
      ref={canvasRef}
      width={400} height={64}
      style={{ width: '100%', height: 64, display: 'block', borderRadius: 10, opacity: 0.9 }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function WaveformSeekbar({ progress, duration, onSeek, trackTitle }) {
  const canvasRef = useRef(null);
  const [hoverX, setHoverX] = useState(null);
  const barsCount = 120;

  // Generate stable bar heights from seed
  const bars = useMemo(() => {
    const rand = seededRandom(strToSeed(trackTitle));
    return Array.from({ length: barsCount }, () => 0.2 + rand() * 0.8);
  }, [trackTitle]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const progressFraction = duration > 0 ? progress / duration : 0;
    const progressX = progressFraction * w;
    const hoverFraction = hoverX !== null ? hoverX / w : null;

    const barW = Math.max(1, w / barsCount - 1);
    const gap = w / barsCount;

    for (let i = 0; i < barsCount; i++) {
      const x = i * gap;
      const barH = bars[i] * h;
      const y = (h - barH) / 2;
      const centerX = x + barW / 2;

      // Hover highlight
      if (hoverFraction !== null && Math.abs(centerX - hoverX) < gap * 1.5) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
      } else if (centerX <= progressX) {
        ctx.fillStyle = '#ffffff';
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
      }

      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 2);
      ctx.fill();
    }

    // Divider line at progress
    if (progressX > 0 && progressX < w) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(progressX, 0);
      ctx.lineTo(progressX, h);
      ctx.stroke();
    }

    // Hover line
    if (hoverX !== null) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hoverX, 0);
      ctx.lineTo(hoverX, h);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [bars, progress, duration, hoverX, barsCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      draw();
    });
    ro.observe(canvas);
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    draw();
    return () => ro.disconnect();
  }, [draw]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Pointer-based scrubbing — supports both mouse drag and touch drag
  const scrubbingRef = useRef(false);

  const xFromEvent = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return Math.min(rect.width, Math.max(0, e.clientX - rect.left));
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    scrubbingRef.current = true;
    canvasRef.current.setPointerCapture?.(e.pointerId);
    setHoverX(xFromEvent(e));
  };
  const handlePointerMove = (e) => {
    if (scrubbingRef.current || e.pointerType === 'mouse') setHoverX(xFromEvent(e));
  };
  const handlePointerUp = (e) => {
    if (!scrubbingRef.current) return;
    scrubbingRef.current = false;
    const rect = canvasRef.current.getBoundingClientRect();
    onSeek((xFromEvent(e) / rect.width) * (duration || 0));
    if (e.pointerType !== 'mouse') setHoverX(null);
  };
  const handlePointerLeave = () => { if (!scrubbingRef.current) setHoverX(null); };

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { scrubbingRef.current = false; setHoverX(null); }}
      onPointerLeave={handlePointerLeave}
      style={{ width: '100%', height: 56, cursor: 'pointer', display: 'block', touchAction: 'none' }}
    />
  );
}

// ─── Unique SVG icons ─────────────────────────────────────────────────────────
const IcoClose   = () => <svg width="26" height="26" viewBox="0 0 26 26" fill="none"><circle cx="13" cy="13" r="12" stroke="currentColor" strokeOpacity=".25" strokeWidth="1.5"/><path d="M9 9l8 8M17 9l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
const IcoPrev    = () => <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M5 4v14M17 4L8 11l9 7V4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const IcoNext    = () => <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M17 4v14M5 4l9 7-9 7V4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const IcoPlay    = () => <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M7 4l12 7-12 7V4z" fill="currentColor"/></svg>;
const IcoPause   = () => <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="5" y="3" width="4" height="16" rx="1.5" fill="currentColor"/><rect x="13" y="3" width="4" height="16" rx="1.5" fill="currentColor"/></svg>;
const IcoShuffle = () => <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 4h3l8 10h3M16 4h-3l-2-2.5M16 14h-3l-2 2.5M2 14h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const IcoRepeat  = () => <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 8V5h12v3M3 10v3h12v-3M6 4l-3 2.5M12 14l3-2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const IcoEq      = () => <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><circle cx="7" cy="6" r="2" fill="currentColor"/><circle cx="13" cy="10" r="2" fill="currentColor"/><circle cx="8" cy="14" r="2" fill="currentColor"/></svg>;
const IcoSparkles = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
  </svg>
);

const IcoHeart = ({ fill }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
  </svg>
);

// ─── EQ Presets — 10 ISO bands: 31 62 125 250 500 1k 2k 4k 8k 16k ─────────────
const EQ_PRESETS = [
  { label: 'Стандарт',     icon: '⊙', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { label: 'Extreme Bass', icon: '◉', bands: [12, 11, 8, 4, 1, -1, -2, -3, -4, -4] },
  { label: 'Баси',         icon: '◈', bands: [7, 6, 5, 3, 1, 0, -1, -1, -2, -2] },
  { label: 'Вокал',        icon: '◇', bands: [-3, -2, -1, 0, 2, 4, 4, 3, 1, 0] },
  { label: 'Поп',          icon: '✦', bands: [-1, 0, 2, 3, 4, 4, 2, 0, -1, -1] },
  { label: 'Рок',          icon: '⬡', bands: [5, 4, 2, 0, -1, -1, 1, 3, 4, 5] },
  { label: 'Електронна',   icon: '▲', bands: [6, 5, 3, 0, -1, 1, 2, 3, 4, 5] },
  { label: 'Хіп-хоп',      icon: '◆', bands: [8, 7, 4, 2, -1, -1, 1, 2, 3, 3] },
  { label: 'Джаз',         icon: '◎', bands: [4, 3, 1, 2, -1, -1, 0, 2, 3, 4] },
  { label: 'Класика',      icon: '✧', bands: [4, 3, 2, 1, 0, 0, -1, 2, 3, 4] },
  { label: 'Акустика',     icon: '♪', bands: [3, 3, 2, 1, 1, 1, 2, 3, 3, 2] },
  { label: 'Нічний',       icon: '◐', bands: [-4, -2, 1, 3, 4, 4, 3, 2, 1, 0] },
];

// ─── LRC parser ──────────────────────────────────────────────────────────────
function parseLRC(lrc) {
  if (!lrc) return [];
  const parsed = [];
  const re = /\[(\d{2}):(\d{2}(?:\.\d+)?)\]/g;
  lrc.split('\n').forEach(line => {
    let m; const times = [];
    while ((m = re.exec(line)) !== null) times.push(+m[1] * 60 + parseFloat(m[2]));
    const text = line.replace(/\[\d{2}:\d{2}(?:\.\d+)?\]/g, '').replace(/\[[a-zA-Z]+:[^\]]*\]/g, '').trim();
    if (!text) return;
    if (times.length) times.forEach(t => parsed.push({ time: t, text }));
    else parsed.push({ time: 0, text });
  });
  return parsed.sort((a, b) => a.time - b.time);
}

function formatTime(s) {
  if (!s || isNaN(s)) return '0:00';
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

// ─── EQ vertical slider — pointer-based, works equally well with touch ────────
function EqSlider({ value, onChange, label }) {
  const trackRef = useRef(null);
  const draggingRef = useRef(false);

  const valueFromEvent = (e) => {
    const r = trackRef.current.getBoundingClientRect();
    const frac = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    return Math.round((frac * 24 - 12) * 2) / 2; // -12..+12 dB, step 0.5
  };

  const onPointerDown = (e) => {
    e.preventDefault();
    draggingRef.current = true;
    trackRef.current.setPointerCapture?.(e.pointerId);
    onChange(valueFromEvent(e));
  };
  const onPointerMove = (e) => {
    if (!draggingRef.current) return;
    onChange(valueFromEvent(e));
  };
  const onPointerUp = () => { draggingRef.current = false; };

  const pct = ((value + 12) / 24) * 100;
  const clr = value > 0 ? 'var(--accent)' : value < 0 ? '#f87171' : 'rgba(255,255,255,0.25)';

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: value !== 0 ? clr : 'var(--text-muted)', textAlign: 'center', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {value > 0 ? `+${value}` : value}
      </div>
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ position: 'relative', height: 130, width: '100%', maxWidth: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'ns-resize', touchAction: 'none' }}
      >
        <div style={{ position: 'absolute', width: 3, height: '100%', borderRadius: 2, background: 'rgba(255,255,255,0.07)', pointerEvents: 'none' }}/>
        <div style={{ position: 'absolute', width: 3, borderRadius: 2, background: clr, bottom: value >= 0 ? '50%' : undefined, top: value < 0 ? '50%' : undefined, height: `${Math.abs(value) / 12 * 50}%`, transition: 'height 0.06s', pointerEvents: 'none' }}/>
        <div style={{ position: 'absolute', top: `calc(${100 - pct}% - 8px)`, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: `0 0 0 2.5px ${clr}, 0 2px 8px rgba(0,0,0,0.5)`, pointerEvents: 'none', transition: 'top 0.05s' }}/>
      </div>
      <div style={{ fontSize: 9.5, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</div>
    </div>
  );
}

// ─── EQ Modal — 10-band graphic equalizer ─────────────────────────────────────
function EqModal({ onClose }) {
  const { eqBands, setEqBand, setEqBands } = usePlayerStore();
  const [draft, setDraft] = useState([...eqBands]);
  const [activePreset, setActivePreset] = useState(null);
  const [saved, setSaved] = useState(false);

  const LABELS = ['31', '62', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];
  const N = LABELS.length;

  const handleLive = (i, val) => {
    const next = [...draft]; next[i] = val;
    setDraft(next); setActivePreset(null);
    setEqBand(i, val);
  };

  const handleSave = () => {
    setEqBands(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  // Curve geometry: N points across 424 viewBox units
  const stepX = 424 / (N - 1);

  return (
    <div className="sheet-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)', animation: 'eqIn 0.22s ease' }}>
      <div className="sheet-card" onClick={e => e.stopPropagation()} style={{ width: 560, maxWidth: '94vw', maxHeight: '90dvh', overflowY: 'auto', background: 'rgba(16,16,16,0.97)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, padding: '24px 22px 20px', boxShadow: '0 32px 80px rgba(0,0,0,0.8)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(29,185,84,0.15)', border: '1px solid rgba(29,185,84,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}><IcoEq /></div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Еквалайзер</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>10 смуг · 31Гц–16кГц</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 38, height: 38, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Presets — horizontal scroll strip, comfortable on phones */}
        <div className="eq-presets-strip" style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
          {EQ_PRESETS.map((p, idx) => {
            const on = activePreset === idx;
            return (
              <button key={p.label} onClick={() => { setDraft([...p.bands]); setActivePreset(idx); setEqBands(p.bands); }}
                style={{ padding: '7px 13px', borderRadius: 100, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, border: on ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)', background: on ? 'rgba(29,185,84,0.18)' : 'rgba(255,255,255,0.04)', color: on ? 'var(--accent)' : 'rgba(255,255,255,0.65)', transition: 'all 0.15s' }}>
                {p.icon} {p.label}
              </button>
            );
          })}
        </div>

        {/* SVG curve */}
        <div style={{ height: 44, marginBottom: 10 }}>
          <svg width="100%" height="44" viewBox="0 0 424 44" preserveAspectRatio="none">
            <line x1="0" y1="22" x2="424" y2="22" stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>
            <polyline points={draft.map((v, i) => `${i * stepX},${22 - (v / 12) * 18}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            {draft.map((v, i) => <circle key={i} cx={i * stepX} cy={22 - (v / 12) * 18} r="3" fill="var(--accent)" />)}
          </svg>
        </div>

        {/* 10 vertical sliders */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 18 }}>
          {LABELS.map((label, i) => (
            <EqSlider key={i} value={draft[i] ?? 0} onChange={(v) => handleLive(i, v)} label={label} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { const zeros = new Array(N).fill(0); setDraft(zeros); setActivePreset(0); setEqBands(zeros); }}
            style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.65)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Скинути
          </button>
          <button onClick={handleSave}
            style={{ flex: 2, padding: '12px 0', borderRadius: 12, border: 'none', background: saved ? 'rgba(29,185,84,0.25)' : 'var(--accent)', color: saved ? 'var(--accent)' : '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.3s' }}>
            {saved ? 'Збережено ✓' : 'Зберегти'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function FullscreenPlayer({ onClose, liked, onLike }) {
  const {
    currentTrack, eqBands, progress, duration, isPlaying, isShuffle, isRepeat,
    togglePlay, next, prev, seek, toggleShuffle, toggleRepeat,
    is8DActive, isPerfectAudioActive, isAutoEqActive, isLofiActive, isKaraokeActive, isSubBassActive, isVocalBoostActive,
    isDouble8DActive, isBassRumbleActive, isNightcoreActive,
  } = usePlayerStore();

  const [showEq, setShowEq] = useState(false);
  const [showEffects, setShowEffects] = useState(false);
  const lyricsRef = useRef(null);

  // ── Mobile swipe gestures: down on header/cover = close, left/right on cover = track ──
  const swipeRef = useRef(null);
  const onSwipeStart = (e) => {
    const t = e.touches[0];
    swipeRef.current = { x: t.clientX, y: t.clientY };
  };
  const makeSwipeEnd = (allowHorizontal) => (e) => {
    const s = swipeRef.current;
    if (!s) return;
    swipeRef.current = null;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (dy > 70 && dy > Math.abs(dx) * 1.5) {
      onClose();
    } else if (allowHorizontal && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) next(); else prev();
    }
  };

  const parsedLyrics = useMemo(() => parseLRC(currentTrack?.lyrics), [currentTrack?.lyrics]);
  const isSynced = parsedLyrics.some(l => l.time > 0);

  let activeIndex = -1;
  if (isSynced) for (let i = 0; i < parsedLyrics.length; i++) {
    if (progress >= parsedLyrics[i].time) activeIndex = i; else break;
  }

  useEffect(() => {
    if (activeIndex >= 0 && lyricsRef.current) {
      lyricsRef.current.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIndex]);

  if (!currentTrack) return null;

  const cover = currentTrack.isExternal
    ? currentTrack.thumbnail
    : currentTrack.coverPath ? fileUrl('covers', currentTrack.coverPath) : null;

  const eqActive = eqBands.some(v => v !== 0);

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', animation: 'slideUp 0.3s cubic-bezier(0.2,0.8,0.2,1)' }}>

        {/* Blurred background */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: cover ? `url(${cover})` : undefined, backgroundColor: 'var(--bg-base)', backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(80px) brightness(0.35) saturate(1.5)', transform: 'scale(1.2)', zIndex: -1 }}/>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.55) 100%)', zIndex: -1 }}/>

        {/* Header */}
        <div className="fs-header" onTouchStart={onSwipeStart} onTouchEnd={makeSwipeEnd(false)}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <button onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)', transition: 'background 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.16)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.09)'}>
            <IcoClose />
          </button>

          <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {currentTrack.isExternal ? (currentTrack.source === 'soundcloud' ? '☁ SoundCloud' : '▶ YouTube') : '♪ Бібліотека'}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Audio Effects Button */}
            <button onClick={() => setShowEffects(v => !v)}
              style={{
                background: showEffects ? 'var(--accent)' : 'rgba(255,255,255,0.09)',
                border: showEffects ? 'none' : '1px solid rgba(255,255,255,0.1)',
                color: showEffects ? '#000' : '#fff',
                width: 44, height: 44, borderRadius: '50%',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                backdropFilter: 'blur(10px)', transition: 'all 0.2s', position: 'relative'
              }}
              title="Ефекти звуку (8D, Авто-EQ)">
              <IcoSparkles />
              {(is8DActive || isPerfectAudioActive || isAutoEqActive || isLofiActive || isKaraokeActive || isSubBassActive || isVocalBoostActive || isDouble8DActive || isBassRumbleActive || isNightcoreActive) && !showEffects && (
                <span style={{ position: 'absolute', top: 9, right: 9, width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', border: '1.5px solid rgba(0,0,0,0.4)' }}/>
              )}
            </button>

            {/* EQ Button */}
            <button onClick={() => setShowEq(v => !v)}
              style={{ background: showEq ? 'var(--accent)' : 'rgba(255,255,255,0.09)', border: showEq ? 'none' : '1px solid rgba(255,255,255,0.1)', color: showEq ? '#000' : '#fff', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)', transition: 'all 0.2s', position: 'relative' }}
              title="Еквалайзер">
              <IcoEq />
              {eqActive && !showEq && <span style={{ position: 'absolute', top: 9, right: 9, width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', border: '1.5px solid rgba(0,0,0,0.4)' }}/>}
            </button>
          </div>
        </div>

        {/* Main: two columns */}
        <div className="fs-player">

          {/* LEFT: cover + title + controls */}
          <div className="fs-left">
            <div className="fs-cover" onTouchStart={onSwipeStart} onTouchEnd={makeSwipeEnd(true)}
              style={{ transition: 'transform 0.4s cubic-bezier(0.4,0,0.2,1)', transform: isPlaying ? 'scale(1.02)' : 'scale(0.96)' }}>
              {cover
                ? <img src={cover} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#1a1a2e,#16213e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="80" height="80" viewBox="0 0 80 80" fill="none"><circle cx="40" cy="40" r="38" stroke="rgba(255,255,255,0.08)" strokeWidth="2"/><circle cx="40" cy="40" r="12" fill="rgba(255,255,255,0.12)"/></svg>
                  </div>
              }
            </div>

            <div className="fs-info-wrap" style={{ width: '100%', maxWidth: 400, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div className="fs-info-text" style={{ textAlign: 'left', minWidth: 0, flex: 1 }}>
                <h1 className="fs-title" style={{ fontWeight: 800, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.02em' }}>{currentTrack.title}</h1>
                <p className="fs-artist" style={{ color: 'rgba(255,255,255,0.6)', margin: '8px 0 0', fontWeight: 500 }}>{currentTrack.artistName}</p>
              </div>
              {!currentTrack.isExternal && (
                <button
                  onClick={onLike}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: liked ? 'var(--accent)' : 'rgba(255,255,255,0.5)',
                    cursor: 'pointer',
                    padding: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'transform 0.15s, color 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <IcoHeart fill={liked ? 'var(--accent)' : 'none'} />
                </button>
              )}
            </div>

            {/* Audio Visualizer */}
            <div className="fs-viz-wrap" style={{ width: '100%', maxWidth: 400 }}>
              <AudioVisualizer coverSrc={cover} isPlaying={isPlaying} />
            </div>

            {/* Waveform Seek bar */}
            <div style={{ width: '100%', maxWidth: 400, marginTop: 10 }}>
              <WaveformSeekbar
                progress={progress}
                duration={duration}
                onSeek={seek}
                trackTitle={currentTrack?.title}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.4)', fontVariantNumeric: 'tabular-nums', marginTop: 6 }}>
                <span>{formatTime(progress)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="fs-controls" style={{ display: 'flex', alignItems: 'center' }}>
              <button onClick={toggleShuffle}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: isShuffle ? 'var(--accent)' : 'rgba(255,255,255,0.45)', padding: 8, borderRadius: 10, transition: 'color 0.2s', display: 'flex' }}>
                <IcoShuffle />
              </button>

              <button onClick={prev}
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}>
                <IcoPrev />
              </button>

              <button onClick={togglePlay}
                style={{ width: 72, height: 72, borderRadius: '50%', background: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#000', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', transition: 'transform 0.12s' }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.07)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                {isPlaying ? <IcoPause /> : <IcoPlay />}
              </button>

              <button onClick={next}
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}>
                <IcoNext />
              </button>

              <button onClick={toggleRepeat}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: isRepeat ? 'var(--accent)' : 'rgba(255,255,255,0.45)', padding: 8, borderRadius: 10, transition: 'color 0.2s', display: 'flex' }}>
                <IcoRepeat />
              </button>
            </div>

            {/* Bottom Utility controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: 400, marginTop: 14, padding: '0 8px', color: 'rgba(255,255,255,0.45)' }}>
              <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex' }} title="Пристрої">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
              </button>
              
              <button
                onClick={() => {
                  const container = document.querySelector('.fs-lyrics');
                  if (container) {
                    container.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
                className="fs-mobile-lyrics-btn"
                style={{
                  background: 'rgba(255,255,255,0.12)',
                  border: 'none',
                  borderRadius: 12,
                  padding: '5px 12px',
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'none'
                }}
              >
                Текст пісні
              </button>

              <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex' }} title="Черга відтворення">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="17" x2="21" y1="10" y2="10"/><line x1="17" x2="21" y1="14" y2="14"/><path d="M4 6h10c1.1 0 2 .9 2 2v8c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V8c0-1.1.9-2 2-2z"/></svg>
              </button>
            </div>
          </div>

          {/* RIGHT: lyrics — original bordered card */}
          <div className="fs-lyrics">
            <div style={{ padding: '20px 28px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>
              Текст пісні{isSynced ? ' · синхронізовано' : ''}
            </div>
            <div ref={lyricsRef} style={{ flex: 1, overflowY: 'auto', padding: '28px 28px 50vh 28px', scrollBehavior: 'smooth' }}>
              {parsedLyrics.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {parsedLyrics.map((line, idx) => {
                    const isActive = idx === activeIndex;
                    return (
                      <div key={idx} data-index={idx} onClick={() => isSynced && seek(line.time)}
                        style={{
                          fontSize: 26,
                          lineHeight: 1.6,
                          fontWeight: 700,
                          cursor: isSynced ? 'pointer' : 'default',
                          opacity: isSynced ? (isActive ? 1 : 0.3) : 0.85,
                          transform: isSynced && isActive ? 'scale(1.02)' : 'scale(1)',
                          transformOrigin: 'left center',
                          transition: 'opacity 0.4s ease, transform 0.4s ease',
                          color: '#fff',
                          textShadow: isActive ? '0 0 20px rgba(255,255,255,0.3)' : 'none',
                        }}>
                        {line.text}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'rgba(255,255,255,0.2)' }}>
                  <svg width="48" height="48" viewBox="0 0 48 48" fill="none"><path d="M20 12h16M20 20h12M20 28h8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><rect x="8" y="8" width="32" height="32" rx="6" stroke="currentColor" strokeWidth="2"/></svg>
                  <p style={{ fontSize: 15, margin: 0 }}>Текст пісні відсутній</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ height: 24, flexShrink: 0 }} />
      </div>

      {showEq && <EqModal onClose={() => setShowEq(false)} />}
      {showEffects && <AudioEffectsModal onClose={() => setShowEffects(false)} />}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes slideUp { from { transform:translateY(100%);opacity:0 } to { transform:translateY(0);opacity:1 } }
        @keyframes eqIn { from { opacity:0;transform:scale(0.95) } to { opacity:1;transform:scale(1) } }
      `}}/>
    </>
  );
}
