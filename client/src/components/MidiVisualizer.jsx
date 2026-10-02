import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Piano } from 'lucide-react';

const isBlack = (n) => [1, 3, 6, 8, 10].includes(n % 12);
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (n) => `${NAMES[n % 12]}${Math.floor(n / 12) - 1}`;

function MidiPiano({ active }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    const W = canvas.width, H = canvas.height;
    const cs = getComputedStyle(canvas);
    const acc = cs.getPropertyValue('--accent').trim() || '#a897ff';
    const white = cs.getPropertyValue('--fg').trim();
    const ink = cs.getPropertyValue('--bg').trim();

    const notes = Array.from({ length: 88 }, (_, i) => i + 21);
    const whites = notes.filter((n) => !isBlack(n));
    const ww = W / whites.length;
    ctx.clearRect(0, 0, W, H);
    whites.forEach((n, i) => {
      ctx.fillStyle = active.has(n) ? acc : white;
      ctx.globalAlpha = active.has(n) ? 1 : 0.9;
      ctx.fillRect(i * ww + 0.5, 0, ww - 1, H);
    });
    ctx.globalAlpha = 1;
    whites.forEach((n, i) => {
      const nx = n + 1;
      if (!isBlack(nx) || nx > 108) return;
      ctx.fillStyle = active.has(nx) ? acc : ink;
      ctx.fillRect(i * ww + ww - ww * 0.3, 0, ww * 0.6, H * 0.62);
    });
  }, [active]);
  return <canvas ref={ref} style={{ width: '100%', height: 92, display: 'block', border: '1px solid var(--line-2)', color: 'var(--accent)' }} />;
}

// MIDI keyboard monitor: shows which keys are down on any connected controller.
export default function MidiVisualizer({ onClose }) {
  const [devices, setDevices] = useState([]);
  const [active, setActive] = useState(new Set());
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);

  const onMsg = useCallback((e) => {
    const [status, note, vel] = e.data;
    const type = status & 0xf0;
    if (type === 0x90 && vel > 0) {
      setActive((p) => new Set(p).add(note));
      setHistory((p) => [...p.slice(-23), note]);
    } else if (type === 0x80 || (type === 0x90 && vel === 0)) {
      setActive((p) => { const n = new Set(p); n.delete(note); return n; });
    }
  }, []);

  useEffect(() => {
    if (!navigator.requestMIDIAccess) { setError('Цей браузер не підтримує Web MIDI. Скористайтеся Chrome, Edge або Beatify для ПК.'); return; }
    let access;
    const sync = () => {
      const names = [];
      access.inputs.forEach((i) => { i.onmidimessage = onMsg; names.push(i.name); });
      setDevices(names);
    };
    navigator.requestMIDIAccess().then((a) => { access = a; sync(); a.onstatechange = sync; })
      .catch((err) => setError(`Доступ до MIDI заборонено: ${err.message}`));
    return () => { if (access) { access.inputs.forEach((i) => { i.onmidimessage = null; }); access.onstatechange = null; } };
  }, [onMsg]);

  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide" role="dialog" aria-label="MIDI-клавіатура">
        <div className="modal-head">
          <span className="h2" style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Piano size={20} /> MIDI-клавіатура</span>
          <button className="ibtn" onClick={onClose} aria-label="Закрити"><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
          {error ? <div className="note err">{error}</div>
            : devices.length === 0 ? <div className="note">Підключіть MIDI-клавіатуру до комп’ютера — вона з’явиться тут.</div>
            : <div className="chips">{devices.map((d) => <span key={d} className="chip on">{d}</span>)}</div>}
          <MidiPiano active={active} />
          <div style={{ minHeight: 28, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[...active].map((n) => <span key={n} className="tag accent">{noteName(n)}</span>)}
          </div>
          {history.length > 0 && (
            <div>
              <div className="label" style={{ marginBottom: 8 }}>Останні ноти</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{history.map((n, i) => <span key={i} className="tag">{noteName(n)}</span>)}</div>
            </div>
          )}
          <p className="muted" style={{ fontSize: '0.8rem' }}>Хочете не лише дивитись, а й грати та записувати? Відкрийте «Студію» — там цей самий пристрій керує синтезатором.</p>
        </div>
      </div>
    </div>
  );
}
