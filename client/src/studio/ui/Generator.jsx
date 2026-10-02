import { useState } from 'react';
import { Dices, Wand2, X, RefreshCw } from 'lucide-react';
import { useStudio } from '../store';
import { GENRES } from '../presets';
import { KEYS, SCALES, randomSeed } from '../music';

export default function Generator({ onClose }) {
  const project = useStudio((s) => s.project);
  const [genre, setGenre] = useState(project.genre ?? 'lofi');
  const [key, setKey] = useState('auto');
  const [scale, setScale] = useState('auto');
  const [bpm, setBpm] = useState(0);
  const [bars, setBars] = useState(project.bars);
  const [seed, setSeed] = useState(randomSeed());
  const g = GENRES[genre];

  const run = (newSeed = seed) => {
    useStudio.getState().generate({
      genre, seed: newSeed, bars,
      key: key === 'auto' ? undefined : key,
      scale: scale === 'auto' ? undefined : scale,
      bpm: bpm || undefined,
    });
    onClose?.();
  };

  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal wide" role="dialog" aria-label="Генератор музики">
        <div className="modal-head">
          <span className="h2" style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Wand2 size={20} /> Генератор музики</span>
          <button className="ibtn" onClick={onClose} aria-label="Закрити"><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
          <p className="muted" style={{ fontSize: '0.9rem', maxWidth: '62ch' }}>
            Генератор пише акорди, бас, мелодію й барабани за законами обраного стилю та складає з них композицію з трьох патернів.
            Це алгоритм, а не нейромережа: той самий «зерно» завжди дає ту саму пісню. Усе можна редагувати.
          </p>

          <div>
            <div className="label" style={{ marginBottom: 8 }}>Стиль</div>
            <div className="chips">
              {Object.entries(GENRES).map(([id, gg]) => <button key={id} className={`chip ${genre === id ? 'on' : ''}`} onClick={() => { setGenre(id); setBpm(0); }}>{gg.label}</button>)}
            </div>
            <p className="muted" style={{ fontSize: '0.8rem', marginTop: 8 }}>{g.mood} · {g.bpm[0]}–{g.bpm[1]} BPM</p>
          </div>

          <div className="split" style={{ gap: 'var(--s-4)' }}>
            <div className="field"><label htmlFor="g-key">Тональність</label>
              <select id="g-key" className="select" value={key} onChange={(e) => setKey(e.target.value)}><option value="auto">Випадкова</option>{KEYS.map((k) => <option key={k}>{k}</option>)}</select></div>
            <div className="field"><label htmlFor="g-scale">Лад</label>
              <select id="g-scale" className="select" value={scale} onChange={(e) => setScale(e.target.value)}><option value="auto">За стилем</option>{Object.entries(SCALES).filter(([id]) => id !== 'chromatic').map(([id, s]) => <option key={id} value={id}>{s.label}</option>)}</select></div>
          </div>

          <div className="axis" style={{ borderBottom: 0 }}>
            <span className="axis-name">Темп</span><span className="axis-val">{bpm ? `${bpm} BPM` : 'авто'}</span>
            <input type="range" className="slider" min="0" max="200" step="1" value={bpm} style={{ '--p': `${(bpm / 200) * 100}%` }} onChange={(e) => { const v = +e.target.value; setBpm(v === 0 ? 0 : Math.max(50, v)); }} aria-label="Темп" />
          </div>

          <div className="split" style={{ gap: 'var(--s-4)' }}>
            <div>
              <div className="label" style={{ marginBottom: 8 }}>Довжина патерна</div>
              <div className="chips">{[2, 4, 8].map((b) => <button key={b} className={`chip ${bars === b ? 'on' : ''}`} onClick={() => setBars(b)}>{b} такти</button>)}</div>
            </div>
            <div className="field"><label htmlFor="g-seed">Зерно</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input id="g-seed" className="input mono" value={seed} onChange={(e) => setSeed(e.target.value.toUpperCase().slice(0, 12))} maxLength={12} />
                <button className="btn icon" onClick={() => setSeed(randomSeed())} aria-label="Нове зерно"><Dices size={18} /></button>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-foot" style={{ justifyContent: 'space-between' }}>
          <button className="btn" onClick={() => { const s = randomSeed(); setSeed(s); run(s); }}><Dices size={16} /> Здивуй мене</button>
          <button className="btn primary lg" onClick={() => run()}><Wand2 size={18} /> Згенерувати</button>
        </div>
      </div>
    </div>
  );
}

/** Rewrite one part of the active pattern without touching the rest. */
export function RegenBar() {
  const parts = [['drums', 'Ритм'], ['bass', 'Бас'], ['chords', 'Акорди'], ['melody', 'Мелодія']];
  return (
    <div className="chips" aria-label="Перегенерувати частину">
      <span className="label" style={{ alignSelf: 'center', marginRight: 4 }}>Переписати</span>
      {parts.map(([id, label]) => <button key={id} className="chip" onClick={() => useStudio.getState().regenerate(id)}><RefreshCw size={12} /> {label}</button>)}
    </div>
  );
}
