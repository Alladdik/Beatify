import { memo } from 'react';
import { useStudio, ensureEngine } from '../store';

const VELS = [0.4, 0.65, 0.85, 1];

export const Cell = memo(function Cell({ lane, i, vel, onDown, onEnter, onCtx }) {
  const on = vel > 0;
  return (
    <button
      type="button"
      className={`sq ${on ? 'on' : ''} ${i % 16 === 0 ? 'bar' : i % 4 === 0 ? 'beat' : ''}`}
      style={on ? { '--v': vel } : undefined}
      onPointerDown={(e) => onDown(e, lane, i, vel)}
      onPointerEnter={(e) => onEnter(e, lane, i)}
      onContextMenu={(e) => onCtx(e, lane, i, vel)}
      aria-pressed={on}
      aria-label={`${lane} крок ${i + 1}`}
      tabIndex={-1}
    />
  );
});

export function Playhead({ total, className = '' }) {
  const step = useStudio((s) => s.step);
  const mode = useStudio((s) => s.project.mode);
  const song = useStudio((s) => s.project.song);
  const active = useStudio((s) => s.project.active);
  if (step < 0) return null;
  const local = step % total;
  if (mode === 'song' && song.length) {
    const idx = Math.floor(step / total) % song.length;
    if (song[idx] !== active) return null;
  }
  return <span className={`playhead ${className}`} style={{ '--i': local }} aria-hidden="true" />;
}


// Stable, module-level handlers keep the 500+ memoised cells from re-rendering on every edit.
let paint = null;
export function down(e, lane, i, vel) {
  if (e.button === 2) return;
  e.preventDefault();
  const st = useStudio.getState();
  st.checkpoint();
  const turnOn = vel === 0;
  paint = { on: turnOn };
  st.paintDrum(lane, i, turnOn);
  if (turnOn) { const eng = ensureEngine(); eng.setProject(useStudio.getState().project); eng.liveDrum(lane, 0.85); }
  const up = () => { paint = null; window.removeEventListener('pointerup', up); };
  window.addEventListener('pointerup', up);
}
export function enter(e, lane, i) {
  if (!paint || e.buttons !== 1) return;
  useStudio.getState().paintDrum(lane, i, paint.on);
}
export function ctxMenu(e, lane, i, vel) {
  e.preventDefault();
  if (vel === 0) return;
  const next = VELS[(VELS.findIndex((v) => Math.abs(v - vel) < 0.05) + 1) % VELS.length];
  const st = useStudio.getState();
  st.checkpoint();
  st.setDrumVel(lane, i, next);
}
