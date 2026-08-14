import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X } from 'lucide-react';

// ── Piano keyboard helpers ────────────────────────────────────────────────────
function isBlack(semitone) {
  return [1, 3, 6, 8, 10].includes(semitone % 12);
}

function MidiPiano({ activeNotes }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    // Notes 21 (A0) to 108 (C8) = 88 keys total
    const allNotes = Array.from({ length: 88 }, (_, i) => i + 21);
    const whites = allNotes.filter(n => !isBlack(n % 12));
    const wW = W / whites.length;
    const wH = H;
    const bW = wW * 0.6;
    const bH = wH * 0.62;

    ctx.clearRect(0, 0, W, H);

    // Draw white keys
    whites.forEach((note, i) => {
      const x = i * wW;
      const active = activeNotes.has(note);
      ctx.fillStyle = active ? 'rgba(29,185,84,0.85)' : '#fff';
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.fillRect(x + 0.5, 0, wW - 1, wH);
      ctx.strokeRect(x + 0.5, 0, wW - 1, wH);
      if (active) {
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#1db954';
        ctx.fillRect(x + 0.5, 0, wW - 1, wH);
        ctx.shadowBlur = 0;
      }
    });

    // Draw black keys
    whites.forEach((note, i) => {
      const nextNote = note + 1;
      if (!isBlack(nextNote % 12) || nextNote > 108) return;
      const x = i * wW + wW - bW / 2;
      const active = activeNotes.has(nextNote);
      ctx.fillStyle = active ? '#1db954' : '#111';
      ctx.fillRect(x, 0, bW, bH);
      if (active) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#1db954';
        ctx.fillRect(x, 0, bW, bH);
        ctx.shadowBlur = 0;
      }
    });
  }, [activeNotes]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={100}
      style={{ width: '100%', height: 80, display: 'block', borderRadius: 8 }}
    />
  );
}

export default function MidiVisualizer({ onClose }) {
  const [devices, setDevices] = useState([]);
  const [activeNotes, setActiveNotes] = useState(new Set());
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState('');
  const [noteHistory, setNoteHistory] = useState([]);

  const handleMidiMessage = useCallback((event) => {
    const [status, note, velocity] = event.data;
    const type = status & 0xf0;
    if (type === 0x90 && velocity > 0) {
      // Note on
      setActiveNotes(prev => new Set([...prev, note]));
      setNoteHistory(prev => [...prev.slice(-15), { note, time: Date.now() }]);
      setTimeout(() => {
        setActiveNotes(prev => { const n = new Set(prev); n.delete(note); return n; });
      }, 2000);
    } else if (type === 0x80 || (type === 0x90 && velocity === 0)) {
      // Note off
      setActiveNotes(prev => { const n = new Set(prev); n.delete(note); return n; });
    }
  }, []);

  useEffect(() => {
    if (!navigator.requestMIDIAccess) {
      setSupported(false);
      setError('Web MIDI API не підтримується в цьому браузері. Спробуйте у Chrome або Electron.');
      return;
    }
    navigator.requestMIDIAccess().then(access => {
      const devList = [];
      access.inputs.forEach(input => {
        input.onmidimessage = handleMidiMessage;
        devList.push(input.name);
      });
      setDevices(devList);
      access.onstatechange = () => {
        const dl = [];
        access.inputs.forEach(input => {
          input.onmidimessage = handleMidiMessage;
          dl.push(input.name);
        });
        setDevices(dl);
      };
    }).catch(err => {
      setError(`MIDI доступ відхилено: ${err.message}`);
    });
  }, [handleMidiMessage]);

  const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const noteName = (n) => `${noteNames[n % 12]}${Math.floor(n / 12) - 1}`;

  return (
    <div style={{
      position: 'fixed', bottom: 'var(--player-height)', right: 0, width: 480, height: '70vh',
      background: 'var(--bg-elevated)', borderLeft: '1px solid var(--border)', borderTop: '1px solid var(--border)',
      borderRadius: '16px 0 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column', zIndex: 50,
      animation: 'slideInRight 0.22s cubic-bezier(0.2,0.8,0.2,1)',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          🎹 MIDI Візуалізатор
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
          <X size={18} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Devices */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 8 }}>MIDI Пристрої</div>
          {!supported ? (
            <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, fontSize: 13, color: '#ef4444' }}>{error}</div>
          ) : error ? (
            <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, fontSize: 13, color: '#ef4444' }}>{error}</div>
          ) : devices.length === 0 ? (
            <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🎹</span> Підключіть MIDI-клавіатуру до комп'ютера
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {devices.map((d, i) => (
                <div key={i} style={{ padding: '10px 14px', background: 'rgba(29,185,84,0.08)', border: '1px solid rgba(29,185,84,0.2)', borderRadius: 10, fontSize: 13, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>🟢</span> {d}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Piano */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 8 }}>Клавіатура</div>
          <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: 10, border: '1px solid var(--border)' }}>
            <MidiPiano activeNotes={activeNotes} />
          </div>
        </div>

        {/* Active notes */}
        {activeNotes.size > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[...activeNotes].map(n => (
              <span key={n} style={{ padding: '4px 10px', background: 'var(--accent)', color: '#000', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                {noteName(n)}
              </span>
            ))}
          </div>
        )}

        {/* Note history */}
        {noteHistory.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 8 }}>Останні ноти</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {noteHistory.map((n, i) => (
                <span key={i} style={{ padding: '3px 8px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                  {noteName(n.note)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
