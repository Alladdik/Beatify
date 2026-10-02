import { useEffect, useRef } from 'react';
import { useStudio, getEngine } from '../store';
import { INSTRUMENTS } from '../presets';

function Strip({ id, name, sub, mixer }) {
  const set = (patch) => useStudio.getState().setMixer(id, patch);
  const pre = () => useStudio.getState().checkpoint();
  return (
    <div className="strip">
      <div className="strip-head"><span className="trunc strip-name">{name}</span><span className="muted strip-sub trunc">{sub}</span></div>
      <div className="strip-btns">
        <button className={`chip sm ${mixer.mute ? 'on' : ''}`} onClick={() => useStudio.getState().setMixer(id, { mute: !mixer.mute }, { history: true })} aria-pressed={mixer.mute}>M</button>
        <button className={`chip sm ${mixer.solo ? 'on' : ''}`} onClick={() => useStudio.getState().setMixer(id, { solo: !mixer.solo }, { history: true })} aria-pressed={mixer.solo}>S</button>
      </div>
      <div className="strip-fader">
        <input type="range" className="slider vert" min="0" max="1" step="0.01" value={mixer.volume} style={{ '--p': `${mixer.volume * 100}%` }}
          onPointerDown={pre} onChange={(e) => set({ volume: +e.target.value })} aria-label={`Гучність: ${name}`} />
        <span className="mono muted strip-val">{Math.round(mixer.volume * 100)}</span>
      </div>
      <label className="strip-knob"><span className="label">Пан</span>
        <input type="range" className="slider" min="-1" max="1" step="0.05" value={mixer.pan} style={{ '--p': `${(mixer.pan + 1) * 50}%` }} onPointerDown={pre} onChange={(e) => set({ pan: +e.target.value })} aria-label={`Панорама: ${name}`} onDoubleClick={() => set({ pan: 0 })} />
      </label>
      <label className="strip-knob"><span className="label">Реверб</span>
        <input type="range" className="slider" min="0" max="1" step="0.01" value={mixer.reverb} style={{ '--p': `${mixer.reverb * 100}%` }} onPointerDown={pre} onChange={(e) => set({ reverb: +e.target.value })} aria-label={`Реверб: ${name}`} />
      </label>
      <label className="strip-knob"><span className="label">Ехо</span>
        <input type="range" className="slider" min="0" max="1" step="0.01" value={mixer.delay} style={{ '--p': `${mixer.delay * 100}%` }} onPointerDown={pre} onChange={(e) => set({ delay: +e.target.value })} aria-label={`Ехо: ${name}`} />
      </label>
    </div>
  );
}

function Meter() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const g = c.getContext('2d');
    let raf; let data;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const W = c.clientWidth * dpr, H = c.clientHeight * dpr;
      if (c.width !== W) c.width = W; if (c.height !== H) c.height = H;
      g.clearRect(0, 0, W, H);
      const an = getEngine()?.analyser;
      g.fillStyle = getComputedStyle(c).color;
      const bars = 40;
      if (!an) { for (let i = 0; i < bars; i++) { g.globalAlpha = 0.2; g.fillRect(i * (W / bars) + 1, H - 2, W / bars - 2, 2); } return; }
      if (!data || data.length !== an.frequencyBinCount) data = new Uint8Array(an.frequencyBinCount);
      an.getByteFrequencyData(data);
      g.globalAlpha = 1;
      for (let i = 0; i < bars; i++) {
        const bin = Math.min(data.length - 1, Math.floor(Math.pow(i / bars, 1.7) * data.length * 0.7));
        const h = Math.max(2, (data[bin] / 255) * H);
        g.fillRect(i * (W / bars) + 1, H - h, W / bars - 2, h);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="strip-meter" aria-hidden="true" />;
}

export default function Mixer() {
  const project = useStudio((s) => s.project);
  const m = project.master;
  const setMaster = (patch) => useStudio.getState().setMaster(patch);
  return (
    <section className="mixer" aria-label="Мікшер">
      <div className="strips">
        <Strip id="drums" name="Барабани" sub={project.drums.kit} mixer={project.drums.mixer} />
        {project.tracks.map((t) => <Strip key={t.id} id={t.id} name={t.name} sub={INSTRUMENTS[t.inst]?.label} mixer={t.mixer} />)}
        <div className="strip master">
          <div className="strip-head"><span className="strip-name">Мастер</span><span className="muted strip-sub">Лімітер</span></div>
          <Meter />
          <div className="strip-fader">
            <input type="range" className="slider vert" min="0" max="1" step="0.01" value={m.volume} style={{ '--p': `${m.volume * 100}%` }} onPointerDown={() => useStudio.getState().checkpoint()} onChange={(e) => setMaster({ volume: +e.target.value })} aria-label="Гучність мастера" />
            <span className="mono muted strip-val">{Math.round(m.volume * 100)}</span>
          </div>
          <label className="strip-knob"><span className="label">Реверб</span><input type="range" className="slider" min="0" max="1" step="0.01" value={m.reverb} style={{ '--p': `${m.reverb * 100}%` }} onPointerDown={() => useStudio.getState().checkpoint()} onChange={(e) => setMaster({ reverb: +e.target.value })} aria-label="Реверб мастера" /></label>
          <label className="strip-knob"><span className="label">Ехо</span><input type="range" className="slider" min="0" max="1" step="0.01" value={m.delay} style={{ '--p': `${m.delay * 100}%` }} onPointerDown={() => useStudio.getState().checkpoint()} onChange={(e) => setMaster({ delay: +e.target.value })} aria-label="Ехо мастера" /></label>
          <label className="strip-knob"><span className="label">Свінг</span><input type="range" className="slider" min="0" max="0.6" step="0.01" value={project.swing} style={{ '--p': `${(project.swing / 0.6) * 100}%` }} onPointerDown={() => useStudio.getState().checkpoint()} onChange={(e) => useStudio.getState().setSwing(+e.target.value)} aria-label="Свінг" /></label>
        </div>
      </div>
    </section>
  );
}
