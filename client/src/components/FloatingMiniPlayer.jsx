import React, { useState, useRef, useEffect, useCallback } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { fileUrl } from '../api';
import { Play, Pause, SkipBack, SkipForward, X, Music2, ChevronDown, GripHorizontal } from 'lucide-react';

const STORAGE_KEY = 'beatify-mini-player-pos';

function getInitialPos() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) {
      const p = JSON.parse(s);
      // Clamp to visible area
      return {
        x: Math.max(0, Math.min(window.innerWidth - 260, p.x)),
        y: Math.max(0, Math.min(window.innerHeight - 120, p.y)),
      };
    }
  } catch {}
  return { x: Math.max(0, window.innerWidth - 290), y: Math.max(0, window.innerHeight - 180) };
}

export default function FloatingMiniPlayer({ onClose }) {
  const { currentTrack, isPlaying, togglePlay, next, prev } = usePlayerStore();
  const [pos, setPos]           = useState(getInitialPos);
  const [collapsed, setCollapsed] = useState(false);
  const dragging  = useRef(false);
  const offset    = useRef({ x: 0, y: 0 });
  const posRef    = useRef(pos);

  // Keep posRef in sync
  useEffect(() => { posRef.current = pos; }, [pos]);

  const cover = currentTrack?.isExternal
    ? currentTrack.thumbnail
    : currentTrack?.coverPath ? fileUrl('covers', currentTrack.coverPath) : null;

  const onMouseDown = useCallback((e) => {
    // Don't start drag on button clicks
    if (e.target.closest('button')) return;
    dragging.current = true;
    offset.current = { x: e.clientX - posRef.current.x, y: e.clientY - posRef.current.y };
    e.preventDefault();
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return;
      const x = Math.max(0, Math.min(window.innerWidth  - 260, e.clientX - offset.current.x));
      const y = Math.max(0, Math.min(window.innerHeight - 80,  e.clientY - offset.current.y));
      setPos({ x, y });
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      const p = posRef.current;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {}
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, []);

  if (!currentTrack) return null;

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: 'fixed',
        left: pos.x,
        top:  pos.y,
        zIndex: 9990,
        width: 256,
        background: 'rgba(12,12,20,0.97)',
        border: '1px solid rgba(255,255,255,0.13)',
        borderRadius: 18,
        boxShadow: '0 24px 64px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.04)',
        backdropFilter: 'blur(28px)',
        cursor: dragging.current ? 'grabbing' : 'grab',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Drag indicator + header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.3)' }}>
          <GripHorizontal size={14} />
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)' }}>
            Міні-плеєр
          </span>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <button
            onClick={() => setCollapsed(p => !p)}
            title={collapsed ? 'Розгорнути' : 'Згорнути'}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px 4px', borderRadius: 6 }}
          >
            <ChevronDown size={13} style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>
          <button
            onClick={onClose}
            title="Закрити"
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px 4px', borderRadius: 6 }}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Cover + info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 12px 10px' }}>
            {/* Album art */}
            <div style={{ width: 46, height: 46, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.07)', position: 'relative' }}>
              {cover
                ? <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Music2 size={18} color="rgba(255,255,255,0.3)" />
                  </div>
              }
              {/* Playing indicator overlay */}
              {isPlaying && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(29,185,84,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 16 }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{
                        width: 3, borderRadius: 2, background: 'var(--accent)',
                        animation: `mpBar 0.75s ease-in-out ${i * 0.2}s infinite alternate`,
                      }} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Text */}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#fff', lineHeight: 1.3 }}>
                {currentTrack.title}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                {currentTrack.artistName}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '2px 12px 14px' }}>
            <button
              onClick={prev}
              title="Попередній"
              style={{ background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: '50%', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', flexShrink: 0 }}
            >
              <SkipBack size={14} />
            </button>

            <button
              onClick={togglePlay}
              title={isPlaying ? 'Пауза' : 'Відтворити'}
              style={{ background: 'var(--accent)', border: 'none', borderRadius: '50%', width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#000', flexShrink: 0, boxShadow: '0 4px 16px rgba(29,185,84,0.4)' }}
            >
              {isPlaying
                ? <Pause size={16} />
                : <Play  size={16} style={{ marginLeft: 2 }} />
              }
            </button>

            <button
              onClick={next}
              title="Наступний"
              style={{ background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: '50%', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', flexShrink: 0 }}
            >
              <SkipForward size={14} />
            </button>
          </div>
        </>
      )}

      <style>{`
        @keyframes mpBar {
          from { height: 4px; }
          to   { height: 15px; }
        }
      `}</style>
    </div>
  );
}
