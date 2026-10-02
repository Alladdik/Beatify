import { useEffect, useRef, useState, useCallback } from 'react';
import { RotateCcw } from 'lucide-react';
import { usePlayerStore, getAnalyser, getPannerPosition, EQ_FREQS } from '../../store/playerStore';

// ── Real spectrum (reads the actual AnalyserNode) ──────────────────────────────
export function Spectrum({ height = 64, bars = 56 }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    let data;
    const heights = new Float32Array(bars);
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const an = getAnalyser();
      const playing = usePlayerStore.getState().isPlaying;
      if (an && playing) {
        if (!data || data.length !== an.frequencyBinCount) data = new Uint8Array(an.frequencyBinCount);
        an.getByteFrequencyData(data);
        const usable = Math.floor(data.length * 0.62);
        for (let i = 0; i < bars; i++) {
          // log-ish spread so bass isn't squeezed into two bars
          const bin = Math.min(usable - 1, Math.floor(Math.pow(i / bars, 1.6) * usable));
          const t = (data[bin] / 255) * h;
          heights[i] = t > heights[i] ? t : heights[i] * 0.86 + t * 0.14;
        }
      } else {
        for (let i = 0; i < bars; i++) heights[i] *= 0.88;
      }
      const style = getComputedStyle(canvas);
      ctx.fillStyle = style.color;
      const gap = Math.max(2, w / bars * 0.28);
      const bw = (w - gap * (bars - 1)) / bars;
      for (let i = 0; i < bars; i++) {
        const bh = Math.max(2, heights[i]);
        ctx.fillRect(i * (bw + gap), h - bh, bw, bh);
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [bars]);
  return <canvas ref={ref} aria-hidden="true" style={{ width: '100%', height, display: 'block', color: 'var(--accent)' }} />;
}

// ── Spatial pad: drag anywhere to place the sound — near, far, left, right, front, back ──
function Orbit() {
  const dot = useRef(null);
  const box = useRef(null);
  const { setPannerPositionManual, is8DActive, isManualPanning, isDouble8DActive } = usePlayerStore();
  const [drag, setDrag] = useState(false);
  const active = is8DActive || isManualPanning || isDouble8DActive;

  useEffect(() => {
    let raf; let cx = 0, cy = 0;
    const loop = () => {
      const el = dot.current;
      const bx = box.current;
      if (el && bx) {
        const st = usePlayerStore.getState();
        let nx = 0, nz = 0;
        if (st.isManualPanning) { nx = st.manualPos.x; nz = st.manualPos.z; }
        else if (st.is8DActive || st.isDouble8DActive) { const p = getPannerPosition(); nx = p.x; nz = p.z; }
        const r = bx.clientWidth / 2 - 9;
        cx = cx * 0.7 + nx * r * 0.3; cy = cy * 0.7 + nz * r * 0.3;
        el.style.transform = `translate(calc(-50% + ${cx}px), calc(-50% + ${cy}px))`;
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, []);

  const place = useCallback((e) => {
    const r = box.current.getBoundingClientRect();
    const reach = r.width / 2 - 9;
    setPannerPositionManual((e.clientX - (r.left + r.width / 2)) / reach, (e.clientY - (r.top + r.height / 2)) / reach);
  }, [setPannerPositionManual]);

  const onKey = (e) => {
    const st = usePlayerStore.getState();
    const step = e.shiftKey ? 0.2 : 0.05;
    const dir = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!dir) return;
    e.preventDefault();
    setPannerPositionManual(st.manualPos.x + dir[0], st.manualPos.z + dir[1]);
  };

  return (
    <div
      ref={box}
      className={`orbit ${active ? 'on' : ''} ${drag ? 'drag' : ''}`}
      onPointerDown={(e) => { setDrag(true); e.currentTarget.setPointerCapture(e.pointerId); place(e); }}
      onPointerMove={(e) => drag && place(e)}
      onPointerUp={() => setDrag(false)}
      onPointerCancel={() => setDrag(false)}
      onKeyDown={onKey}
      tabIndex={0}
      role="application"
      aria-label="Положення звуку: ближче, далі, ліворуч, праворуч, спереду, ззаду. Перетягніть точку або користуйтеся стрілками."
    >
      <i className="orbit-ring" />
      <i className="orbit-h" /><i className="orbit-v" />
      <b className="orbit-tag t">спереду</b><b className="orbit-tag b">ззаду</b>
      <b className="orbit-tag l">Л</b><b className="orbit-tag r">П</b>
      <span className="orbit-head" />
      <span ref={dot} className="orbit-dot" />
    </div>
  );
}

function Placement() {
  const isManualPanning = usePlayerStore((s) => s.isManualPanning);
  const is8DActive = usePlayerStore((s) => s.is8DActive);
  const isDouble8DActive = usePlayerStore((s) => s.isDouble8DActive);
  const manualPos = usePlayerStore((s) => s.manualPos);
  const setPos = usePlayerStore((s) => s.setPannerPositionManual);
  const reset = usePlayerStore((s) => s.resetPanner);

  const dist = Math.hypot(manualPos.x, manualPos.z) * 6;
  const h = manualPos.h * 3;
  const fmt = (v) => v.toFixed(1).replace('.', ',');

  return (
    <div>
      <div className="label">Положення звуку</div>
      <p className="muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
        {is8DActive ? 'Обертається навколо голови (потрібні навушники).'
          : isDouble8DActive ? 'Бас і верхи крутяться в різні боки.'
          : isManualPanning ? 'Звук закріплено там, де ви його поставили.'
          : 'Перетягніть точку куди завгодно: центр — біля вуха, край — далеко.'}
      </p>
      {isManualPanning && (
        <>
          <div className="mono muted" style={{ fontSize: '0.72rem', marginTop: 6 }}>
            відстань {fmt(dist)} м · висота {h > 0 ? '+' : ''}{fmt(h)} м
          </div>
          <label className="axis inline" style={{ marginTop: 8 }}>
            <span className="axis-name">Висота</span>
            <span className="axis-val">{manualPos.h > 0 ? '↑' : manualPos.h < 0 ? '↓' : '·'} {Math.round(Math.abs(manualPos.h) * 100)}</span>
            <input type="range" className="slider" min="-1" max="1" step="0.01" value={manualPos.h}
              aria-label="Висота звуку" style={{ '--p': `${((manualPos.h + 1) / 2) * 100}%` }}
              onChange={(e) => setPos(undefined, undefined, +e.target.value)}
              onDoubleClick={() => setPos(undefined, undefined, 0)} />
          </label>
          <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={reset}><RotateCcw size={13} /> Скинути</button>
        </>
      )}
    </div>
  );
}

// ── Modes ──────────────────────────────────────────────────────────────────────
const GROUPS = [
  { title: 'Простір', items: [
    { k: '8d', name: '8D', note: 'HRTF-орбіта навколо голови', on: 'is8DActive', fn: 'toggle8D' },
    { k: 'd8d', name: 'Double 8D', note: 'бас ↻ · верхи ↺', on: 'isDouble8DActive', fn: 'toggleDouble8D' },
  ] },
  { title: 'Тембр', items: [
    { k: 'crystal', name: 'Кристал', note: '+80 Гц тепло · +8 кГц повітря', on: 'isPerfectAudioActive', fn: 'togglePerfectAudio' },
    { k: 'auto', name: 'Авто-EQ', note: 'вирівнює спектр у реальному часі', on: 'isAutoEqActive', fn: 'toggleAutoEq' },
    { k: 'sub', name: 'Суб-бас', note: '50 Гц · +10 дБ · Q 1,4', on: 'isSubBassActive', fn: 'toggleSubBass' },
    { k: 'rumble', name: 'Bass Rumble', note: '42 Гц + 80 Гц · +13,5 / +7 дБ', on: 'isBassRumbleActive', fn: 'toggleBassRumble' },
    { k: 'vocal', name: 'Вокал', note: '−300 Гц · +2,5 кГц · +10 кГц', on: 'isVocalBoostActive', fn: 'toggleVocalBoost' },
  ] },
  { title: 'Характер', items: [
    { k: 'lofi', name: 'Lo-Fi', note: 'стрічка 70-х · 3,4 кГц · тріск', on: 'isLofiActive', fn: 'toggleLofi' },
    { k: 'nc', name: 'Nightcore', note: '+25 % швидкості · шельф 6 кГц', on: 'isNightcoreActive', fn: 'toggleNightcore' },
    { k: 'karaoke', name: 'Мінусовка', note: 'прибирає центр стереополя', on: 'isKaraokeActive', fn: 'toggleKaraoke' },
  ] },
];

const SCENES = [
  { id: 'none', label: 'Оригінал' },
  { id: 'concert', label: 'Арена 8D' },
  { id: 'club', label: 'Клуб' },
  { id: 'retro', label: 'Lo-Fi стрічка' },
  { id: 'karaoke', label: 'Мінусовка' },
];

const EQ_PRESETS = [
  ['Стандарт', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  ['Extreme Bass', [12, 11, 8, 4, 1, -1, -2, -3, -4, -4]],
  ['Баси', [7, 6, 5, 3, 1, 0, -1, -1, -2, -2]],
  ['Вокал', [-3, -2, -1, 0, 2, 4, 4, 3, 1, 0]],
  ['Поп', [-1, 0, 2, 3, 4, 4, 2, 0, -1, -1]],
  ['Рок', [5, 4, 2, 0, -1, -1, 1, 3, 4, 5]],
  ['Електроніка', [6, 5, 3, 0, -1, 1, 2, 3, 4, 5]],
  ['Хіп-хоп', [8, 7, 4, 2, -1, -1, 1, 2, 3, 3]],
  ['Джаз', [4, 3, 1, 2, -1, -1, 0, 2, 3, 4]],
  ['Класика', [4, 3, 2, 1, 0, 0, -1, 2, 3, 4]],
  ['Акустика', [3, 3, 2, 1, 1, 1, 2, 3, 3, 2]],
  ['Нічний', [-4, -2, 1, 3, 4, 4, 3, 2, 1, 0]],
];

const hz = (f) => (f >= 1000 ? `${f / 1000}k` : String(f));

function Equalizer() {
  const eqBands = usePlayerStore((s) => s.eqBands);
  const setEqBand = usePlayerStore((s) => s.setEqBand);
  const setEqBands = usePlayerStore((s) => s.setEqBands);
  const auto = usePlayerStore((s) => s.isAutoEqActive);
  const current = EQ_PRESETS.findIndex(([, b]) => b.every((v, i) => v === eqBands[i]));

  return (
    <div>
      <div className="chips" style={{ marginBottom: 14 }}>
        {EQ_PRESETS.map(([name, bands], i) => (
          <button key={name} className={`chip ${current === i ? 'on' : ''}`} onClick={() => setEqBands([...bands])}>{name}</button>
        ))}
      </div>
      <div className="eq" aria-label="10-смуговий еквалайзер" data-disabled={auto || undefined}>
        {EQ_FREQS.map((f, i) => (
          <label key={f} className="eq-band">
            <span className="mono eq-val">{eqBands[i] > 0 ? `+${eqBands[i]}` : eqBands[i]}</span>
            <input
              type="range" className="slider vert" min="-12" max="12" step="0.5"
              value={eqBands[i]} disabled={auto}
              style={{ '--p': `${((eqBands[i] + 12) / 24) * 100}%` }}
              aria-label={`${f} Гц`}
              onChange={(e) => setEqBand(i, +e.target.value)}
              onDoubleClick={() => setEqBand(i, 0)}
            />
            <span className="mono muted eq-hz">{hz(f)}</span>
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <span className="muted" style={{ fontSize: '0.75rem' }}>{auto ? 'Авто-EQ керує смугами сам' : 'Подвійний клік по смузі — скинути її'}</span>
        <button className="btn ghost sm" onClick={() => setEqBands(new Array(10).fill(0))}><RotateCcw size={13} /> Скинути</button>
      </div>
    </div>
  );
}

export default function SoundPanel({ compact = false }) {
  const s = usePlayerStore();
  const [tab, setTab] = useState('modes');
  const activeCount = GROUPS.flatMap((g) => g.items).filter((m) => s[m.on]).length;

  return (
    <div className="sound">
      <div className="sound-spectrum"><Spectrum height={compact ? 56 : 72} /></div>

      <div className="tabs" style={{ padding: '0 var(--s-4)' }} role="tablist">
        <button role="tab" aria-selected={tab === 'modes'} className={`tab ${tab === 'modes' ? 'on' : ''}`} onClick={() => setTab('modes')}>Режими{activeCount ? ` · ${activeCount}` : ''}</button>
        <button role="tab" aria-selected={tab === 'eq'} className={`tab ${tab === 'eq' ? 'on' : ''}`} onClick={() => setTab('eq')}>Еквалайзер</button>
      </div>

      <div className="sound-body">
        {tab === 'modes' ? (
          <>
            <div className="chips" style={{ marginBottom: 6 }}>
              {SCENES.map((sc) => (
                <button key={sc.id} className={`chip ${s.activePreset === sc.id ? 'on' : ''}`} onClick={() => s.setPreset(sc.id)}>{sc.label}</button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 'var(--s-4)', alignItems: 'center', padding: 'var(--s-4) 0' }}>
              <Orbit />
              <Placement />
            </div>

            {GROUPS.map((g) => (
              <div key={g.title} className="sound-group">
                <div className="label" style={{ padding: '8px 0' }}>{g.title}</div>
                {g.items.map((m) => (
                  <label key={m.k} className="mode">
                    <span className="mode-text"><span className="mode-name">{m.name}</span><span className="mode-note mono">{m.note}</span></span>
                    <span className="switch"><input type="checkbox" checked={!!s[m.on]} onChange={s[m.fn]} /><i /></span>
                  </label>
                ))}
              </div>
            ))}

            <div className="axis">
              <span className="axis-name">Концертна зала · reverb</span>
              <span className="axis-val">REVB {Math.round(s.reverbWet * 100)}</span>
              <input type="range" className="slider" min="0" max="0.8" step="0.01" value={s.reverbWet}
                aria-label="Reverb" style={{ '--p': `${(s.reverbWet / 0.8) * 100}%` }}
                onChange={(e) => s.setReverbWet(+e.target.value)} />
            </div>
          </>
        ) : (
          <Equalizer />
        )}
      </div>
    </div>
  );
}
