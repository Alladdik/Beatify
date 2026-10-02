import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Pencil, Eraser, ArrowUp, ArrowDown } from 'lucide-react';
import { useStudio, ensureEngine } from '../store';
import { activePattern, INSTRUMENTS } from '../presets';
import { noteName, isBlackKey, scalePitchClasses, NOTE_NAMES } from '../music';
import { Playhead } from './DrumGrid';

const LOW = 24;   // C1
const HIGH = 96;  // C7
const ROWS = HIGH - LOW + 1;
const RH = 18;    // row height
const EDGE = 8;   // resize handle width

const cssVar = (el, name) => getComputedStyle(el).getPropertyValue(name).trim();

export default function PianoRoll() {
  const project = useStudio((s) => s.project);
  const selected = useStudio((s) => s.selected);
  const tool = useStudio((s) => s.tool);
  const snap = useStudio((s) => s.snap);
  const track = project.tracks.find((t) => t.id === selected);
  const pat = activePattern(project);
  const notes = useMemo(() => pat.notes[selected] ?? [], [pat, selected]);
  const total = project.bars * 16;

  const [cw, setCw] = useState(() => (window.innerWidth < 760 ? 22 : 30));
  const canvas = useRef(null);
  const scroller = useRef(null);
  const drag = useRef(null);
  const lastLen = useRef(2);
  const heard = useRef(null);
  const pcs = useMemo(() => scalePitchClasses(project.key, project.scale), [project.key, project.scale]);
  const rootPc = NOTE_NAMES.indexOf(project.key);

  const W = total * cw;
  const H = ROWS * RH;
  const yOf = (pitch) => (HIGH - pitch) * RH;

  // ── draw ──
  useEffect(() => {
    const c = canvas.current; if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = cssVar(c, '--bg-1'), line = cssVar(c, '--line'), line2 = cssVar(c, '--line-2');
    const accent = cssVar(c, '--accent'), accentSoft = cssVar(c, '--accent-soft'), on = cssVar(c, '--on-accent');
    g.clearRect(0, 0, W, H);

    for (let p = HIGH; p >= LOW; p--) {
      const y = yOf(p);
      const pc = p % 12;
      g.fillStyle = pc === rootPc && pcs.has(pc) ? accentSoft : pcs.has(pc) ? 'transparent' : 'rgba(127,127,127,0.07)';
      if (isBlackKey(p) && !pcs.has(pc)) g.fillStyle = 'rgba(127,127,127,0.11)';
      g.fillRect(0, y, W, RH);
      g.fillStyle = pc === 0 ? line2 : line; g.fillRect(0, y + RH - 1, W, 1);
    }
    for (let s = 0; s <= total; s++) {
      g.fillStyle = s % 16 === 0 ? line2 : s % 4 === 0 ? line : 'rgba(127,127,127,0.07)';
      g.fillRect(s * cw, 0, 1, H);
    }
    void bg;
    notes.forEach((n) => {
      const x = n.t * cw, y = yOf(n.p), w = Math.max(6, n.d * cw - 2);
      g.globalAlpha = 0.45 + 0.55 * (n.v ?? 0.8);
      g.fillStyle = accent; g.fillRect(x + 1, y + 1, w, RH - 2);
      g.globalAlpha = 1;
      g.fillStyle = on; g.fillRect(x + w - 2, y + 4, 2, RH - 8); // resize grip
      if (w > 34) { g.font = '10px "Martian Mono Variable", monospace'; g.fillStyle = on; g.fillText(noteName(n.p), x + 5, y + RH - 6); }
    });
  }, [notes, W, H, cw, total, pcs, rootPc]);

  // start the view near the notes (or the instrument's natural octave)
  useEffect(() => {
    const el = scroller.current; if (!el) return;
    const mid = notes.length ? Math.round(notes.reduce((s, n) => s + n.p, 0) / notes.length) : 12 * ((INSTRUMENTS[track?.inst]?.octave ?? 4) + 1) + 6;
    el.scrollTop = Math.max(0, yOf(mid) - el.clientHeight / 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const hear = useCallback((pitch) => {
    if (heard.current?.pitch === pitch) return;
    heard.current?.h.stop(ensureEngine().ctx.currentTime);
    const e = ensureEngine(); e.setProject(useStudio.getState().project);
    heard.current = { pitch, h: e.liveNote(selected, pitch, 0.8) };
    setTimeout(() => { if (heard.current?.pitch === pitch) { heard.current.h.stop(e.ctx.currentTime); heard.current = null; } }, 420);
  }, [selected]);

  const pos = (e) => {
    const r = canvas.current.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    return { x, y, step: x / cw, pitch: HIGH - Math.floor(y / RH) };
  };
  const hit = (x, y) => {
    const pitch = HIGH - Math.floor(y / RH);
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      if (n.p === pitch && x >= n.t * cw && x <= (n.t + n.d) * cw) return { i, n, edge: x > (n.t + n.d) * cw - EDGE };
    }
    return null;
  };
  const q = (v) => Math.floor(v / snap) * snap;

  const down = (e) => {
    if (!track) return;
    e.preventDefault();
    const { x, y, step, pitch } = pos(e);
    if (pitch < LOW || pitch > HIGH) return;
    const st = useStudio.getState();
    const h = hit(x, y);
    st.checkpoint();

    if (e.button === 2 || tool === 'erase' || e.altKey) {
      if (h) st.removeNote(selected, h.i);
      return;
    }
    if (h) {
      hear(h.n.p);
      drag.current = { mode: h.edge ? 'resize' : 'move', i: h.i, grabStep: step - h.n.t, startN: h.n };
    } else {
      const t = Math.max(0, Math.min(total - 1, q(step)));
      const note = { t, d: Math.min(lastLen.current, total - t), p: pitch, v: 0.8 };
      st.addNote(selected, note, { history: false });
      hear(pitch);
      drag.current = { mode: 'resize', i: (useStudio.getState().project.patterns.find((x) => x.id === useStudio.getState().project.active).notes[selected] ?? []).length - 1, startN: note, fresh: true };
    }
    canvas.current.setPointerCapture(e.pointerId);
  };

  const move = (e) => {
    const d = drag.current; if (!d) return;
    const { step, pitch } = pos(e);
    const st = useStudio.getState();
    if (d.mode === 'move') {
      const t = Math.max(0, Math.min(total - d.startN.d, q(step - d.grabStep + snap / 2)));
      const p = Math.max(LOW, Math.min(HIGH, pitch));
      st.updateNote(selected, d.i, { t, p });
      if (p !== d.startN.p) { hear(p); d.startN = { ...d.startN, p }; }
    } else {
      const base = notes[d.i]?.t ?? d.startN.t;
      const dur = Math.max(snap, Math.min(total - base, Math.round((step - base) / snap) * snap || snap));
      st.updateNote(selected, d.i, { d: dur });
      lastLen.current = dur;
    }
  };
  const up = () => { drag.current = null; };

  const keyRows = useMemo(() => Array.from({ length: ROWS }, (_, k) => HIGH - k), []);

  if (!track) return null;
  return (
    <section className="grid-wrap" aria-label={`Піано-ролл: ${track.name}`}>
      <div className="studio-toolbar">
        <div className="chips">
          <button className={`chip ${tool === 'draw' ? 'on' : ''}`} onClick={() => useStudio.getState().setTool('draw')}><Pencil size={13} /> Малювати</button>
          <button className={`chip ${tool === 'erase' ? 'on' : ''}`} onClick={() => useStudio.getState().setTool('erase')}><Eraser size={13} /> Гумка</button>
        </div>
        <div className="chips" aria-label="Крок сітки">
          {[[1, '1/16'], [2, '1/8'], [4, '1/4'], [0.5, '1/32']].map(([v, l]) => <button key={v} className={`chip mono ${snap === v ? 'on' : ''}`} onClick={() => useStudio.getState().setSnap(v)}>{l}</button>)}
        </div>
        <div className="chips">
          <button className="chip" onClick={() => useStudio.getState().transposeTrack(selected, 12)} title="Октава вгору"><ArrowUp size={13} /> 8va</button>
          <button className="chip" onClick={() => useStudio.getState().transposeTrack(selected, -12)} title="Октава вниз"><ArrowDown size={13} /> 8vb</button>
          <button className="chip" onClick={() => useStudio.getState().clearTrackNotes(selected)}>Очистити</button>
        </div>
        <div className="chips" style={{ marginLeft: 'auto' }}>
          <button className="chip mono" onClick={() => setCw((c) => Math.max(14, c - 4))} aria-label="Зменшити">−</button>
          <button className="chip mono" onClick={() => setCw((c) => Math.min(56, c + 4))} aria-label="Збільшити">+</button>
        </div>
      </div>

      <div className="roll" ref={scroller}>
        <div className="roll-inner" style={{ '--cw': `${cw}px`, '--rh': `${RH}px`, width: W + 56 }}>
          <div className="roll-row" style={{ height: H }}>
            <div className="roll-keys" style={{ height: H }}>
              {keyRows.map((p) => (
                <button
                  key={p}
                  className={`rk ${isBlackKey(p) ? 'black' : ''} ${p % 12 === 0 ? 'c' : ''}`}
                  style={{ height: RH }}
                  onPointerDown={() => hear(p)}
                  aria-label={noteName(p)}
                  tabIndex={-1}
                >{p % 12 === 0 ? noteName(p) : ''}</button>
              ))}
            </div>
            <div className="roll-stage" style={{ width: W, height: H }}>
              <canvas
                ref={canvas}
                style={{ width: W, height: H, touchAction: 'none', cursor: tool === 'erase' ? 'not-allowed' : 'crosshair' }}
                onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
                onContextMenu={(e) => e.preventDefault()}
              />
              <Playhead total={total} className="roll-ph" />
            </div>
          </div>
          <Velocity notes={notes} trackId={selected} cw={cw} total={total} />
        </div>
      </div>
    </section>
  );
}

/** Velocity bars under the roll: drag a bar to set how hard that note is played. Sticks to the bottom while scrolling. */
function Velocity({ notes, trackId, cw, total }) {
  const wrap = useRef(null);
  const dragging = useRef(null);
  const set = (e) => {
    const d = dragging.current; if (d == null) return;
    const r = wrap.current.getBoundingClientRect();
    const v = Math.max(0.1, Math.min(1, 1 - (e.clientY - r.top) / r.height));
    useStudio.getState().updateNote(trackId, d, { v: Math.round(v * 20) / 20 });
  };
  return (
    <div className="vel">
      <span className="label vel-label">Сила</span>
      <div
        ref={wrap} className="vel-inner" style={{ width: total * cw }}
        onPointerMove={set} onPointerUp={() => { dragging.current = null; }} onPointerLeave={() => { dragging.current = null; }}
      >
        {notes.map((n, i) => (
          <i
            key={i} className="vel-bar" style={{ left: n.t * cw + 1, width: Math.max(4, Math.min(10, cw - 4)), height: `${(n.v ?? 0.8) * 100}%` }}
            onPointerDown={(e) => { useStudio.getState().checkpoint(); dragging.current = i; e.currentTarget.setPointerCapture?.(e.pointerId); set(e); }}
          />
        ))}
      </div>
    </div>
  );
}
