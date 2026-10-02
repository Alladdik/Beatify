import { useEffect, useRef, useState, useCallback } from 'react';
import { Circle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStudio, ensureEngine } from '../store';
import { INSTRUMENTS, activePattern } from '../presets';
import { isBlackKey, noteName } from '../music';

// Computer keyboard as a piano (FL-style typing keyboard): home row = white keys, row above = black keys.
const KEYMAP = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16,
};

/**
 * Plays the selected track live from: the computer keyboard, a MIDI controller, or the on-screen keys.
 * When recording + playing, notes are quantised to the 1/16 grid and written into the active pattern.
 */
export function useLiveInput(octaveShift) {
  const held = useRef(new Map()); // key → { h, startStep, index, t0 }

  const noteOn = useCallback((midi, vel = 0.85) => {
    const st = useStudio.getState();
    if (st.selected === 'drums') return;
    const e = ensureEngine(); e.setProject(st.project);
    if (held.current.has(midi)) return;
    const h = e.liveNote(st.selected, midi, vel);
    const entry = { h, t0: e.ctx.currentTime, index: -1, step: -1 };
    if (st.recording && st.playing) {
      const total = st.project.bars * 16;
      const cur = e.currentStep();
      const stepDur = e.stepDur();
      // current step plus how far we are into it → nearest 16th
      const step = Math.max(0, Math.round(((cur < 0 ? 0 : cur) % total)) % total);
      entry.step = step;
      const pat = activePattern(st.project);
      entry.index = (pat.notes[st.selected] ?? []).length;
      st.addNote(st.selected, { t: step, d: 1, p: midi, v: vel }, { history: false });
      entry.stepDur = stepDur;
    }
    held.current.set(midi, entry);
  }, []);

  const noteOff = useCallback((midi) => {
    const entry = held.current.get(midi);
    if (!entry) return;
    held.current.delete(midi);
    const e = ensureEngine();
    entry.h.stop(e.ctx.currentTime);
    if (entry.index >= 0) {
      const st = useStudio.getState();
      const total = st.project.bars * 16;
      const dur = Math.max(1, Math.round((e.ctx.currentTime - entry.t0) / entry.stepDur));
      st.updateNote(st.selected, entry.index, { d: Math.min(dur, total - entry.step) });
    }
  }, []);

  useEffect(() => {
    const base = () => 12 * ((INSTRUMENTS[useStudio.getState().project.tracks.find((t) => t.id === useStudio.getState().selected)?.inst]?.octave ?? 4) + 1) + octaveShift * 12;
    const typing = (el) => !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
    const down = (ev) => {
      if (ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey || typing(ev.target)) return;
      const k = ev.key.toLowerCase();
      if (k in KEYMAP) { ev.preventDefault(); noteOn(base() + KEYMAP[k]); }
    };
    const up = (ev) => { const k = ev.key.toLowerCase(); if (k in KEYMAP) noteOff(base() + KEYMAP[k]); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [noteOn, noteOff, octaveShift]);

  // MIDI controller
  const [midiName, setMidiName] = useState('');
  useEffect(() => {
    if (!navigator.requestMIDIAccess) return;
    let access;
    const onMsg = (m) => {
      const [status, note, vel] = m.data;
      const t = status & 0xf0;
      if (t === 0x90 && vel > 0) noteOn(note, vel / 127);
      else if (t === 0x80 || (t === 0x90 && vel === 0)) noteOff(note);
    };
    const sync = () => { const names = []; access.inputs.forEach((i) => { i.onmidimessage = onMsg; names.push(i.name); }); setMidiName(names.join(', ')); };
    navigator.requestMIDIAccess().then((a) => { access = a; sync(); a.onstatechange = sync; }).catch(() => {});
    return () => { if (access) { access.inputs.forEach((i) => { i.onmidimessage = null; }); access.onstatechange = null; } };
  }, [noteOn, noteOff]);

  return { noteOn, noteOff, midiName };
}

/** Two-octave on-screen keyboard (works with touch). */
export default function OnScreenKeys({ octaveShift, noteOn, noteOff }) {
  const selected = useStudio((s) => s.selected);
  const inst = useStudio((s) => s.project.tracks.find((t) => t.id === s.selected)?.inst);
  const base = 12 * ((INSTRUMENTS[inst]?.octave ?? 4) + 1) + octaveShift * 12;
  const keys = Array.from({ length: 25 }, (_, i) => base + i);
  const whites = keys.filter((k) => !isBlackKey(k));
  const down = useRef(new Set());

  if (selected === 'drums') return <div className="note" style={{ margin: '0 var(--s-4)' }}>Для барабанів використовуйте сітку. Оберіть мелодичну доріжку, щоб грати на клавішах.</div>;

  const press = (k) => (e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); down.current.add(k); noteOn(k); };
  const release = (k) => () => { if (down.current.delete(k)) noteOff(k); };

  return (
    <div className="osk" role="group" aria-label="Клавіатура">
      {whites.map((k) => {
        const blackAfter = keys.includes(k + 1) && isBlackKey(k + 1) ? k + 1 : null;
        return (
          <div key={k} className="osk-w" onPointerDown={press(k)} onPointerUp={release(k)} onPointerCancel={release(k)} onPointerLeave={release(k)}>
            <span className="mono osk-label">{k % 12 === 0 ? noteName(k) : ''}</span>
            {blackAfter && <i className="osk-b" onPointerDown={(e) => { e.stopPropagation(); press(blackAfter)(e); }} onPointerUp={(e) => { e.stopPropagation(); release(blackAfter)(); }} onPointerCancel={release(blackAfter)} onPointerLeave={release(blackAfter)} />}
          </div>
        );
      })}
    </div>
  );
}

export function RecButton() {
  const recording = useStudio((s) => s.recording);
  return (
    <button
      className={`btn icon rec ${recording ? 'on' : ''}`} aria-pressed={recording}
      aria-label={recording ? 'Вимкнути запис нот' : 'Записувати ноти під час відтворення'}
      title="Запис нот: грайте на клавіатурі, MIDI або екранних клавішах під час відтворення"
      onClick={() => { const on = !recording; useStudio.getState().setRecording(on); if (on) { toast('Запис ввімкнено: натисніть Play і грайте'); } }}
    ><Circle size={16} fill="currentColor" /></button>
  );
}
