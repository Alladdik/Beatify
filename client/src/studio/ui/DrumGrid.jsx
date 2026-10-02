import { memo } from 'react';
import { Volume2, Eraser } from 'lucide-react';
import { useStudio, ensureEngine } from '../store';
import { DRUM_LANES, activePattern, KITS } from '../presets';

const VELS = [0.4, 0.65, 0.85, 1];

const Cell = memo(function Cell({ lane, i, vel, onDown, onEnter, onCtx }) {
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
function down(e, lane, i, vel) {
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
function enter(e, lane, i) {
  if (!paint || e.buttons !== 1) return;
  useStudio.getState().paintDrum(lane, i, paint.on);
}
function ctxMenu(e, lane, i, vel) {
  e.preventDefault();
  if (vel === 0) return;
  const next = VELS[(VELS.findIndex((v) => Math.abs(v - vel) < 0.05) + 1) % VELS.length];
  const st = useStudio.getState();
  st.checkpoint();
  st.setDrumVel(lane, i, next);
}

export default function DrumGrid() {
  const project = useStudio((s) => s.project);
  const pat = activePattern(project);
  const total = project.bars * 16;
  const kit = project.drums.kit;
  const { clearLane, setKit } = useStudio.getState();

  return (
    <section className="grid-wrap" aria-label="Барабани">
      <div className="studio-toolbar">
        <span className="label">Набір</span>
        <div className="chips">
          {Object.entries(KITS).map(([id, k]) => <button key={id} className={`chip ${kit === id ? 'on' : ''}`} onClick={() => setKit(id)}>{k.label}</button>)}
        </div>
        <span className="muted" style={{ fontSize: '0.75rem', marginLeft: 'auto' }}>Клік — крок · протягніть — малювати · правий клік — гучність</span>
      </div>
      <div className="seq" style={{ '--steps': total }}>
        <div className="seq-names">
          {DRUM_LANES.map((l) => (
            <div key={l.id} className="seq-name">
              <button className="ibtn sm" onClick={() => { const e = ensureEngine(); e.setProject(project); e.liveDrum(l.id); }} aria-label={`Прослухати: ${l.name}`}><Volume2 size={14} /></button>
              <span className="trunc">{l.name}</span>
              <button className="ibtn sm hover-only" onClick={() => clearLane(l.id)} aria-label={`Очистити: ${l.name}`}><Eraser size={13} /></button>
            </div>
          ))}
        </div>
        <div className="seq-scroll">
          <div className="seq-rows">
            <Playhead total={total} />
            {DRUM_LANES.map((l) => (
              <div key={l.id} className="seq-row">
                {pat.lanes[l.id].map((vel, i) => (
                  <Cell key={i} lane={l.id} i={i} vel={vel} onDown={down} onEnter={enter} onCtx={ctxMenu} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
