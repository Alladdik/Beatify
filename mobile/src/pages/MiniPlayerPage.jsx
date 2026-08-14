import React, { useEffect, useState, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, X, Music2, Heart } from 'lucide-react';

// ── Electron Mini Player — renders when URL hash = #miniplayer ────────────────
// Window is typically ~310 × 88 px, always-on-top, frameless, transparent
export default function MiniPlayerPage() {
  const [track,   setTrack]   = useState(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume,  setVolume]  = useState(1);
  const [hovered, setHovered] = useState(false);
  const isElectron = !!window.electronAPI;
  const spinRef = useRef(null);
  const spinAngle = useRef(0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!isElectron) return;
    const unsub = window.electronAPI.onPlayerState(state => {
      if (state?.currentTrack) setTrack(state.currentTrack);
      setPlaying(state?.isPlaying ?? false);
      setProgress(state?.progress ?? 0);
      setDuration(state?.duration  ?? 0);
      setVolume(state?.volume ?? 1);
    });
    return unsub;
  }, []);

  // Rotate album art while playing
  useEffect(() => {
    const el = spinRef.current;
    if (!el) return;
    const tick = () => {
      if (playing) {
        spinAngle.current = (spinAngle.current + 0.15) % 360;
        el.style.transform = `rotate(${spinAngle.current}deg)`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing]);

  const control = (cmd) => {
    if (isElectron) window.electronAPI.miniPlayerControl(cmd);
  };

  const cover = track?.isExternal
    ? track.thumbnail
    : track?.coverPath
      ? `http://${window.location.hostname}:5000/uploads/covers/${track.coverPath}`
      : null;

  const pct = duration > 0 ? (progress / duration) * 100 : 0;

  // SVG progress ring params
  const R = 26, CIRC = 2 * Math.PI * R;
  const strokeDash = CIRC;
  const strokeOffset = CIRC - (pct / 100) * CIRC;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%', height: '100vh',
        background: 'rgba(10, 10, 18, 0.94)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.10)',
        display: 'flex', alignItems: 'center', gap: 0,
        color: '#fff',
        userSelect: 'none',
        overflow: 'hidden',
        position: 'relative',
        WebkitAppRegion: 'drag',
        boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
      }}
    >
      {/* Album art with progress ring */}
      <div style={{
        position: 'relative', flexShrink: 0,
        width: 68, height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        WebkitAppRegion: 'drag',
      }}>
        {/* Progress ring SVG */}
        <svg width={60} height={60} style={{ position: 'absolute', zIndex: 2, pointerEvents: 'none' }}>
          <circle cx={30} cy={30} r={R}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={3}
          />
          <circle cx={30} cy={30} r={R}
            fill="none"
            stroke="#30d158"
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={strokeDash}
            strokeDashoffset={strokeOffset}
            transform="rotate(-90 30 30)"
            style={{ transition: 'stroke-dashoffset 0.25s linear' }}
          />
        </svg>

        {/* Cover art (rotates when playing) */}
        <div style={{
          width: 48, height: 48, borderRadius: '50%', overflow: 'hidden',
          background: 'rgba(255,255,255,0.07)',
          boxShadow: playing ? '0 0 16px rgba(48,209,88,0.35)' : '0 4px 16px rgba(0,0,0,0.5)',
          transition: 'box-shadow 0.4s ease',
          flexShrink: 0,
        }}>
          <div ref={spinRef} style={{ width: '100%', height: '100%' }}>
            {cover
              ? <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#1a1a2e,#2d1b4e)' }}>
                  <Music2 size={18} color="rgba(255,255,255,0.4)" />
                </div>
            }
          </div>
        </div>
      </div>

      {/* Track info */}
      <div style={{
        flex: 1, minWidth: 0, padding: '0 8px',
        WebkitAppRegion: 'drag',
        overflow: 'hidden',
      }}>
        <div style={{
          fontSize: 12, fontWeight: 700, lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: '#fff',
        }}>
          {track?.title || 'Нічого не грає'}
        </div>
        <div style={{
          fontSize: 11, marginTop: 2,
          color: 'rgba(255,255,255,0.5)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {track?.artistName || ''}
        </div>
        {/* Mini progress bar */}
        <div style={{
          marginTop: 6, height: 2,
          background: 'rgba(255,255,255,0.1)',
          borderRadius: 2, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', background: '#30d158',
            width: `${pct}%`,
            transition: 'width 0.25s linear',
            borderRadius: 2,
          }} />
        </div>
      </div>

      {/* Controls */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 2,
          padding: '0 10px 0 4px',
          flexShrink: 0,
          WebkitAppRegion: 'no-drag',
          opacity: hovered ? 1 : 0.85,
          transition: 'opacity 0.2s',
        }}
      >
        <MpBtn onClick={() => control('prev')} title="Попередній">
          <SkipBack size={13} />
        </MpBtn>

        <button
          onClick={() => control('playpause')}
          title={playing ? 'Пауза' : 'Відтворити'}
          style={{
            background: playing ? '#30d158' : 'rgba(255,255,255,0.18)',
            border: 'none', color: playing ? '#000' : '#fff',
            cursor: 'pointer',
            width: 32, height: 32, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            transition: 'background 0.2s, transform 0.15s',
            boxShadow: playing ? '0 0 12px rgba(48,209,88,0.5)' : 'none',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          {playing
            ? <Pause size={13} />
            : <Play  size={13} style={{ marginLeft: 1 }} />
          }
        </button>

        <MpBtn onClick={() => control('next')} title="Наступний">
          <SkipForward size={13} />
        </MpBtn>

        <MpBtn
          onClick={() => isElectron && window.electronAPI.hideMiniPlayer()}
          title="Закрити"
          style={{ marginLeft: 4, opacity: 0.45 }}
          hoverOpacity={1}
        >
          <X size={12} />
        </MpBtn>
      </div>
    </div>
  );
}

function MpBtn({ onClick, title, children, style = {}, hoverOpacity }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: 'none', border: 'none', color: '#fff',
        cursor: 'pointer', padding: 5, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        borderRadius: 8, transition: 'background 0.15s, transform 0.15s',
        flexShrink: 0,
        ...style,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.10)';
        e.currentTarget.style.transform = 'scale(1.12)';
        if (hoverOpacity) e.currentTarget.style.opacity = String(hoverOpacity);
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'none';
        e.currentTarget.style.transform = 'scale(1)';
        if (hoverOpacity) e.currentTarget.style.opacity = String(style.opacity ?? 1);
      }}
    >
      {children}
    </button>
  );
}
