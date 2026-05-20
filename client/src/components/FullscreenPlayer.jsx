import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { usePlayerStore, getAnalyser } from '../store/playerStore';
import { useAlbumColor } from '../hooks/useAlbumColor';
import { fileUrl } from '../api';

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

  const handleClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    onSeek((x / rect.width) * (duration || 0));
  };

  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    setHoverX(e.clientX - rect.left);
  };

  const handleMouseLeave = () => setHoverX(null);

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ width: '100%', height: 56, cursor: 'pointer', display: 'block' }}
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

// ─── EQ Presets ───────────────────────────────────────────────────────────────
const EQ_PRESETS = [
  { label: 'Стандарт',     icon: '⊙', bands: [0,  0,  0,  0,  0 ] },
  { label: 'Extreme Bass', icon: '◉', bands: [12, 8,  1, -2, -4 ] },
  { label: 'Баси',         icon: '◈', bands: [7,  5,  0, -1, -2 ] },
  { label: 'Вокал',        icon: '◇', bands: [-2, 0,  4,  3,  1 ] },
  { label: 'Поп',          icon: '✦', bands: [0,  2,  4,  2,  0 ] },
  { label: 'Рок',          icon: '⬡', bands: [5,  2, -1,  2,  5 ] },
  { label: 'Електронна',   icon: '▲', bands: [5,  3,  0,  3,  4 ] },
  { label: 'Джаз',         icon: '◎', bands: [3,  0,  2,  3,  1 ] },
  { label: 'Класика',      icon: '✧', bands: [4,  2,  0,  2,  4 ] },
  { label: 'Нічний',       icon: '◐', bands: [-3, 2,  5,  4,  2 ] },
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

// ─── EQ Modal ─────────────────────────────────────────────────────────────────
function EqModal({ onClose }) {
  const { eqBands, setEqBand, setEqBands } = usePlayerStore();
  const [draft, setDraft] = useState([...eqBands]);
  const [activePreset, setActivePreset] = useState(null);
  const [saved, setSaved] = useState(false);

  const FREQS  = [60, 230, 910, 3600, 14000];
  const LABELS = ['60', '230', '910', '3.6k', '14k'];

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

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)', animation: 'eqIn 0.22s ease' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 480, maxWidth: '94vw', background: 'rgba(16,16,16,0.97)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, padding: '28px 28px 24px', boxShadow: '0 32px 80px rgba(0,0,0,0.8)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(29,185,84,0.15)', border: '1px solid rgba(29,185,84,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}><IcoEq /></div>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Еквалайзер</span>
          </div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
          {EQ_PRESETS.map((p, idx) => {
            const on = activePreset === idx;
            return (
              <button key={p.label} onClick={() => { setDraft([...p.bands]); setActivePreset(idx); setEqBands(p.bands); }}
                style={{ padding: '5px 13px', borderRadius: 100, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: on ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)', background: on ? 'rgba(29,185,84,0.18)' : 'rgba(255,255,255,0.04)', color: on ? 'var(--accent)' : 'rgba(255,255,255,0.65)', transition: 'all 0.15s' }}>
                {p.icon} {p.label}
              </button>
            );
          })}
        </div>

        {/* SVG curve */}
        <div style={{ height: 44, marginBottom: 14 }}>
          <svg width="100%" height="44" viewBox="0 0 424 44" preserveAspectRatio="none">
            <line x1="0" y1="22" x2="424" y2="22" stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>
            <polyline points={draft.map((v, i) => `${i * 106},${22 - (v / 12) * 18}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            {draft.map((v, i) => <circle key={i} cx={i * 106} cy={22 - (v / 12) * 18} r="3.5" fill="var(--accent)" />)}
          </svg>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {FREQS.map((_, i) => {
            const val = draft[i];
            const pct = ((val + 12) / 24) * 100;
            const clr = val > 0 ? 'var(--accent)' : val < 0 ? '#f87171' : 'rgba(255,255,255,0.25)';
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: val !== 0 ? clr : 'var(--text-muted)', textAlign: 'center' }}>{val > 0 ? `+${val}` : val}</div>
                <div style={{ position: 'relative', height: 100, width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ position: 'absolute', width: 3, height: '100%', borderRadius: 2, background: 'rgba(255,255,255,0.07)' }}/>
                  <div style={{ position: 'absolute', width: 3, borderRadius: 2, background: clr, bottom: val >= 0 ? '50%' : undefined, top: val < 0 ? '50%' : undefined, height: `${Math.abs(val) / 12 * 50}%`, transition: 'height 0.08s' }}/>
                  <div style={{ position: 'absolute', top: `calc(${100 - pct}% - 7px)`, width: 14, height: 14, borderRadius: '50%', background: '#fff', boxShadow: `0 0 0 2.5px ${clr}`, pointerEvents: 'none', transition: 'top 0.05s' }}/>
                  <input type="range" min="-12" max="12" step="0.5" value={val} onChange={e => handleLive(i, parseFloat(e.target.value))} style={{ position: 'absolute', width: 100, height: 28, opacity: 0, cursor: 'ns-resize', transform: 'rotate(-90deg)' }}/>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{LABELS[i]}</div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setDraft([0,0,0,0,0]); setActivePreset(0); setEqBands([0,0,0,0,0]); }}
            style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.65)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Скинути
          </button>
          <button onClick={handleSave}
            style={{ flex: 2, padding: '10px 0', borderRadius: 12, border: 'none', background: saved ? 'rgba(29,185,84,0.25)' : 'var(--accent)', color: saved ? 'var(--accent)' : '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.3s' }}>
            {saved ? 'Збережено ✓' : 'Зберегти'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function FullscreenPlayer({ onClose }) {
  const {
    currentTrack, eqBands, progress, duration, isPlaying, isShuffle, isRepeat,
    togglePlay, next, prev, seek, toggleShuffle, toggleRepeat,
  } = usePlayerStore();

  const [showEq, setShowEq] = useState(false);
  const lyricsRef = useRef(null);

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
        <div style={{ padding: '28px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <button onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)', transition: 'background 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.16)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.09)'}>
            <IcoClose />
          </button>

          <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {currentTrack.isExternal ? (currentTrack.source === 'soundcloud' ? '☁ SoundCloud' : '▶ YouTube') : '♪ Бібліотека'}
          </div>

          <button onClick={() => setShowEq(v => !v)}
            style={{ background: showEq ? 'var(--accent)' : 'rgba(255,255,255,0.09)', border: showEq ? 'none' : '1px solid rgba(255,255,255,0.1)', color: showEq ? '#000' : '#fff', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)', transition: 'all 0.2s', position: 'relative' }}
            title="Еквалайзер">
            <IcoEq />
            {eqActive && !showEq && <span style={{ position: 'absolute', top: 9, right: 9, width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', border: '1.5px solid rgba(0,0,0,0.4)' }}/>}
          </button>
        </div>

        {/* Main: two columns */}
        <div className="fs-player">

          {/* LEFT: cover + title + controls */}
          <div className="fs-left">
            <div className="fs-cover" style={{ transition: 'transform 0.4s cubic-bezier(0.4,0,0.2,1)', transform: isPlaying ? 'scale(1.02)' : 'scale(0.96)' }}>
              {cover
                ? <img src={cover} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#1a1a2e,#16213e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="80" height="80" viewBox="0 0 80 80" fill="none"><circle cx="40" cy="40" r="38" stroke="rgba(255,255,255,0.08)" strokeWidth="2"/><circle cx="40" cy="40" r="12" fill="rgba(255,255,255,0.12)"/></svg>
                  </div>
              }
            </div>

            <div style={{ width: '100%', maxWidth: 400, marginTop: 28, textAlign: 'center' }}>
              <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.02em' }}>{currentTrack.title}</h1>
              <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.6)', margin: '8px 0 0', fontWeight: 500 }}>{currentTrack.artistName}</p>
            </div>

            {/* Audio Visualizer */}
            <div style={{ width: '100%', maxWidth: 400, marginTop: 20 }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 20 }}>
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

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes slideUp { from { transform:translateY(100%);opacity:0 } to { transform:translateY(0);opacity:1 } }
        @keyframes eqIn { from { opacity:0;transform:scale(0.95) } to { opacity:1;transform:scale(1) } }
      `}}/>
    </>
  );
}
