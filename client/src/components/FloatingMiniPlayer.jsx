import { useState, useRef, useEffect } from 'react';
import { X, SkipBack, SkipForward, Maximize2 } from 'lucide-react';
import Cover from './ui/Cover';
import Scrubber from './Scrubber';
import { PlayPause } from './Player';
import { usePlayerStore } from '../store/playerStore';
import { useUiStore } from '../store/uiStore';

const KEY = 'beatify-mini-pos';
const W = 296;
const H = 132;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function initialPos() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    if (p) return { x: clamp(p.x, 8, window.innerWidth - W - 8), y: clamp(p.y, 8, window.innerHeight - H - 8) };
  } catch { /* first run */ }
  return { x: window.innerWidth - W - 24, y: window.innerHeight - H - 110 };
}

// A draggable always-on-top card inside the app — the browser/PWA stand-in for the desktop mini window.
export default function FloatingMiniPlayer({ onClose }) {
  const track = usePlayerStore((s) => s.currentTrack);
  const progress = usePlayerStore((s) => s.progress);
  const duration = usePlayerStore((s) => s.duration);
  const { next, prev, seek } = usePlayerStore.getState();
  const openNowPlaying = useUiStore((s) => s.openNowPlaying);
  const [pos, setPos] = useState(initialPos);
  const drag = useRef(null);

  useEffect(() => {
    const move = (e) => {
      if (!drag.current) return;
      setPos({ x: clamp(e.clientX - drag.current.dx, 8, window.innerWidth - W - 8), y: clamp(e.clientY - drag.current.dy, 8, window.innerHeight - H - 8) });
    };
    const up = () => {
      if (!drag.current) return;
      drag.current = null;
      setPos((p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* quota */ } return p; });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, []);

  if (!track) return null;

  return (
    <div className="mini-float" style={{ left: pos.x, top: pos.y, width: W }} role="dialog" aria-label="Міні-плеєр">
      <div
        className="mini-grip"
        onPointerDown={(e) => { if (e.target.closest('button')) return; drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }; }}
      >
        <Cover track={track} lazy={false} style={{ width: 52 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="trunc" style={{ fontWeight: 560, fontSize: '0.9rem' }}>{track.title}</div>
          <div className="trunc muted" style={{ fontSize: '0.78rem' }}>{track.artistName}</div>
        </div>
        <button className="ibtn sm" onClick={openNowPlaying} aria-label="На весь екран"><Maximize2 size={15} /></button>
        <button className="ibtn sm" onClick={onClose} aria-label="Закрити міні-плеєр"><X size={16} /></button>
      </div>
      <div style={{ position: 'relative', height: 14, margin: '0 12px' }}>
        <Scrubber className="scrub inline" progress={progress} duration={duration} onSeek={seek} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, paddingBottom: 10 }}>
        <button className="ibtn" onClick={prev} aria-label="Попередній"><SkipBack size={18} fill="currentColor" /></button>
        <PlayPause size="sm" />
        <button className="ibtn" onClick={() => next()} aria-label="Наступний"><SkipForward size={18} fill="currentColor" /></button>
      </div>
    </div>
  );
}
