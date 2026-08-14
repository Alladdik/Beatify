import React, { useState, useRef, useEffect, useCallback } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { fileUrl } from '../api';
import { Play, Pause, SkipBack, SkipForward, X, Music2, ChevronDown } from 'lucide-react';

const STORAGE_KEY = 'beatify-mini-player-pos';
const W = 268;
const H_FULL = 142;
const H_MINI = 64;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function getInitialPos() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) {
      const p = JSON.parse(s);
      return {
        x: clamp(p.x, 0, window.innerWidth  - W),
        y: clamp(p.y, 0, window.innerHeight - H_FULL),
      };
    }
  } catch {}
  return { x: clamp(window.innerWidth - W - 24, 0, window.innerWidth - W), y: clamp(window.innerHeight - 200, 0, window.innerHeight - H_FULL) };
}

function formatTime(s) {
  if (!s || isNaN(s)) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export default function FloatingMiniPlayer({ onClose }) {
  const { currentTrack, isPlaying, togglePlay, next, prev, progress, duration, seek } = usePlayerStore();
  const [pos,       setPos]       = useState(getInitialPos);
  const [collapsed, setCollapsed] = useState(false);
  const dragging  = useRef(false);
  const offset    = useRef({ x: 0, y: 0 });
  const posRef    = useRef(pos);
  const spinRef   = useRef(null);
  const spinAngle = useRef(0);
  const rafRef    = useRef(null);

  useEffect(() => { posRef.current = pos; }, [pos]);

  // Smooth album art rotation
  useEffect(() => {
    const el = spinRef.current;
    if (!el) return;
    const tick = () => {
      if (isPlaying) {
        spinAngle.current = (spinAngle.current + 0.18) % 360;
        el.style.transform = `rotate(${spinAngle.current}deg)`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]);

  // Drag
  const onMouseDown = useCallback((e) => {
    if (e.target.closest('button') || e.target.closest('.mp-seek')) return;
    dragging.current = true;
    offset.current = { x: e.clientX - posRef.current.x, y: e.clientY - posRef.current.y };
    e.preventDefault();
  }, []);

  // Touch drag
  const onTouchStart = useCallback((e) => {
    if (e.target.closest('button') || e.target.closest('.mp-seek')) return;
    const t = e.touches[0];
    dragging.current = true;
    offset.current = { x: t.clientX - posRef.current.x, y: t.clientY - posRef.current.y };
  }, []);

  useEffect(() => {
    const H = collapsed ? H_MINI : H_FULL;
    const onMove = (e) => {
      if (!dragging.current) return;
      const cx = e.clientX ?? e.touches?.[0]?.clientX;
      const cy = e.clientY ?? e.touches?.[0]?.clientY;
      if (cx == null) return;
      setPos({
        x: clamp(cx - offset.current.x, 0, window.innerWidth  - W),
        y: clamp(cy - offset.current.y, 0, window.innerHeight - H),
      });
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(posRef.current)); } catch {}
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend',  onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend',  onUp);
    };
  }, [collapsed]);

  if (!currentTrack) return null;

  const cover = currentTrack.isExternal
    ? currentTrack.thumbnail
    : currentTrack.coverPath ? fileUrl('covers', currentTrack.coverPath) : null;

  const pct = duration > 0 ? (progress / duration) * 100 : 0;

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    seek(ratio * duration);
  };

  // Progress ring (SVG)
  const R = 28, CIRC = 2 * Math.PI * R;

  return (
    <>
      <style>{`
        @keyframes mpBarUp   { from { height: 3px;  } to { height: 14px; } }
        @keyframes mpBarDown { from { height: 14px; } to { height: 3px;  } }
        .mp-ctrl-btn { transition: background 0.15s, transform 0.15s; }
        .mp-ctrl-btn:hover { background: rgba(255,255,255,0.10) !important; transform: scale(1.12); }
        .mp-ctrl-btn:active { transform: scale(0.9); }
        .mp-play-btn:hover { filter: brightness(1.15); transform: scale(1.08) !important; }
        .mp-play-btn:active { transform: scale(0.93) !important; }
        .mp-seek { cursor: pointer; }
        .mp-seek:hover .mp-seek-fill { background: #30d158 !important; }
        .mp-seek:hover .mp-seek-thumb { opacity: 1 !important; }
      `}</style>

      <div
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        style={{
          position: 'fixed', left: pos.x, top: pos.y,
          zIndex: 9990,
          width: W,
          background: 'rgba(10, 10, 18, 0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 20,
          boxShadow: '0 28px 72px rgba(0,0,0,0.80), 0 0 0 1px rgba(255,255,255,0.04) inset',
          backdropFilter: 'blur(32px)',
          WebkitBackdropFilter: 'blur(32px)',
          cursor: 'grab',
          userSelect: 'none',
          overflow: 'hidden',
          transition: 'height 0.28s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* Header bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 10px 6px',
          borderBottom: collapsed ? 'none' : '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            color: 'rgba(255,255,255,0.35)',
          }}>
            {/* Playing bars indicator */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 14 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 3, borderRadius: 2,
                  background: isPlaying ? '#30d158' : 'rgba(255,255,255,0.2)',
                  animation: isPlaying ? `mpBarUp 0.7s ease-in-out ${i * 0.2}s infinite alternate` : `mpBarDown 0.3s ease forwards`,
                  height: isPlaying ? undefined : 3,
                }} />
              ))}
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              Міні-плеєр
            </span>
          </div>

          <div style={{ display: 'flex', gap: 0 }}>
            <button
              className="mp-ctrl-btn"
              onClick={() => setCollapsed(p => !p)}
              title={collapsed ? 'Розгорнути' : 'Згорнути'}
              style={{
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                padding: '2px 5px', borderRadius: 8,
              }}
            >
              <ChevronDown size={13} style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s' }} />
            </button>
            <button
              className="mp-ctrl-btn"
              onClick={onClose}
              title="Закрити"
              style={{
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)',
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                padding: '2px 5px', borderRadius: 8,
              }}
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Collapsed: compact horizontal row */}
        {collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px 10px' }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.07)' }}>
              {cover
                ? <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Music2 size={14} color="rgba(255,255,255,0.3)" /></div>
              }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentTrack.title}</div>
            </div>
            <Controls isPlaying={isPlaying} onPrev={prev} onPlay={togglePlay} onNext={next} size="sm" />
          </div>
        )}

        {/* Expanded body */}
        {!collapsed && (
          <div style={{ padding: '12px 14px 14px' }}>
            {/* Album art + info row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              {/* Rotating cover with SVG ring */}
              <div style={{ position: 'relative', flexShrink: 0, width: 64, height: 64 }}>
                <svg width={64} height={64} style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
                  <circle cx={32} cy={32} r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={3} />
                  <circle cx={32} cy={32} r={R}
                    fill="none" stroke="#30d158" strokeWidth={3}
                    strokeLinecap="round"
                    strokeDasharray={CIRC}
                    strokeDashoffset={CIRC - (pct / 100) * CIRC}
                    transform="rotate(-90 32 32)"
                    style={{ transition: 'stroke-dashoffset 0.25s linear' }}
                  />
                </svg>
                <div style={{
                  position: 'absolute', inset: 5,
                  borderRadius: '50%', overflow: 'hidden',
                  background: 'rgba(255,255,255,0.06)',
                  boxShadow: isPlaying ? '0 0 18px rgba(48,209,88,0.35)' : '0 4px 14px rgba(0,0,0,0.55)',
                  transition: 'box-shadow 0.4s ease',
                }}>
                  <div ref={spinRef} style={{ width: '100%', height: '100%' }}>
                    {cover
                      ? <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#1a1a2e,#2d1b4e)' }}>
                          <Music2 size={18} color="rgba(255,255,255,0.3)" />
                        </div>
                    }
                  </div>
                </div>
              </div>

              {/* Track info */}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#fff', lineHeight: 1.3 }}>
                  {currentTrack.title}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {currentTrack.artistName}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatTime(progress)}
                  </span>
                  <div
                    className="mp-seek"
                    onClick={handleSeek}
                    style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.10)', borderRadius: 2, position: 'relative', cursor: 'pointer' }}
                  >
                    <div
                      className="mp-seek-fill"
                      style={{ height: '100%', background: 'rgba(255,255,255,0.6)', borderRadius: 2, width: `${pct}%`, transition: 'width 0.25s linear', position: 'relative' }}
                    >
                      <div
                        className="mp-seek-thumb"
                        style={{ position: 'absolute', right: -5, top: '50%', transform: 'translateY(-50%)', width: 10, height: 10, borderRadius: '50%', background: '#fff', opacity: 0, transition: 'opacity 0.15s', boxShadow: '0 2px 6px rgba(0,0,0,0.4)' }}
                      />
                    </div>
                  </div>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatTime(duration)}
                  </span>
                </div>
              </div>
            </div>

            {/* Controls */}
            <Controls isPlaying={isPlaying} onPrev={prev} onPlay={togglePlay} onNext={next} size="md" />
          </div>
        )}
      </div>
    </>
  );
}

function Controls({ isPlaying, onPrev, onPlay, onNext, size = 'md' }) {
  const sm = size === 'sm';
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: sm ? 6 : 10 }}>
      <button
        className="mp-ctrl-btn"
        onClick={onPrev} title="Попередній"
        style={{
          background: 'rgba(255,255,255,0.07)', border: 'none',
          borderRadius: '50%', width: sm ? 30 : 36, height: sm ? 30 : 36,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: '#fff', flexShrink: 0,
        }}
      >
        <SkipBack size={sm ? 13 : 15} />
      </button>

      <button
        className="mp-play-btn"
        onClick={onPlay}
        title={isPlaying ? 'Пауза' : 'Відтворити'}
        style={{
          background: isPlaying ? '#30d158' : '#fff',
          border: 'none', borderRadius: '50%',
          width: sm ? 34 : 42, height: sm ? 34 : 42,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          color: '#000', flexShrink: 0,
          boxShadow: isPlaying ? '0 4px 18px rgba(48,209,88,0.45)' : '0 4px 14px rgba(255,255,255,0.22)',
          transition: 'background 0.2s, box-shadow 0.2s',
        }}
      >
        {isPlaying
          ? <Pause size={sm ? 13 : 16} />
          : <Play  size={sm ? 13 : 16} style={{ marginLeft: 2 }} />
        }
      </button>

      <button
        className="mp-ctrl-btn"
        onClick={onNext} title="Наступний"
        style={{
          background: 'rgba(255,255,255,0.07)', border: 'none',
          borderRadius: '50%', width: sm ? 30 : 36, height: sm ? 30 : 36,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: '#fff', flexShrink: 0,
        }}
      >
        <SkipForward size={sm ? 13 : 15} />
      </button>
    </div>
  );
}
