import { useRef, useState } from 'react';
import { formatTime } from '../lib/format';

/** Seekable hairline. Drag, tap, or use ←/→. Reports seconds via onSeek on release. */
export default function Scrubber({ progress, duration, onSeek, className = 'scrub', disabled = false, label = 'Перемотка' }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(null);   // fraction while dragging (drives the visuals)
  const dragRef = useRef(null);             // same value, readable synchronously: a quick tap ends before React re-renders
  const [hover, setHover] = useState(null); // fraction under the pointer

  const frac = (e) => {
    const r = ref.current.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };

  const start = (f) => { dragRef.current = f; setDrag(f); };
  const stop = () => { dragRef.current = null; setDrag(null); };

  const down = (e) => {
    if (disabled || !duration) return;
    ref.current.setPointerCapture?.(e.pointerId);
    start(frac(e));
  };
  const move = (e) => {
    if (disabled) return;
    const f = frac(e);
    setHover(f);
    if (dragRef.current !== null) start(f);
  };
  const up = (e) => {
    if (dragRef.current === null) return;
    const f = frac(e);
    stop();
    onSeek(f * duration);
  };

  const shown = drag ?? (duration ? Math.min(1, progress / duration) : 0);
  const pct = `${(shown * 100).toFixed(2)}%`;

  return (
    <div
      ref={ref}
      className={`${className} ${drag !== null ? 'drag' : ''}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={stop}
      onPointerLeave={() => setHover(null)}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration || 0)}
      aria-valuenow={Math.round(progress || 0)}
      aria-valuetext={`${formatTime(progress)} з ${formatTime(duration)}`}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); onSeek(Math.min(duration, progress + 5)); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); onSeek(Math.max(0, progress - 5)); }
      }}
    >
      <div className="scrub-fill" style={{ width: pct }} />
      <div className="scrub-thumb" style={{ left: pct }} />
      {hover !== null && drag === null && duration > 0 && (
        <span className="scrub-tip" style={{ left: `${hover * 100}%` }}>{formatTime(hover * duration)}</span>
      )}
    </div>
  );
}
