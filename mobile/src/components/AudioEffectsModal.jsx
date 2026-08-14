import React, { useEffect, useRef, useState, useCallback } from 'react';
import { usePlayerStore, getAnalyser, getPannerPosition } from '../store/playerStore';

/* ─── Mini Spectrum Visualizer ─────────────────────────────────────────────── */
function MiniVisualizer() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    const data = new Uint8Array(256);
    const colors = ['#0a84ff','#30d158','#bf5af2','#ff9f0a','#ff375f'];
    const draw = () => {
      const analyser = getAnalyser();
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      let bands = [0.15, 0.15, 0.15, 0.15, 0.15];
      if (analyser) {
        analyser.getByteFrequencyData(data);
        const avg = (s, e) => { let sum = 0; for (let i = s; i <= e; i++) sum += data[i]; return sum / (e-s+1); };
        bands = [avg(1,6)/255, avg(7,15)/255, avg(16,45)/255, avg(46,120)/255, avg(121,200)/255];
      }
      const gap = 4, barW = (w - gap * 4) / 5;
      bands.forEach((lvl, i) => {
        const h2 = Math.max(3, lvl * h);
        ctx.fillStyle = colors[i];
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(i*(barW+gap), h-h2, barW, h2, 3) : ctx.rect(i*(barW+gap), h-h2, barW, h2);
        ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={canvasRef} width={110} height={28} style={{ display: 'block' }} />;
}

/* ─── Draggable Spatial Orbit Visualizer ────────────────────────────────────── */
function SpatialOrbitVisualizer({ compact }) {
  const dotRef = useRef(null);
  const containerRef = useRef(null);
  const { setPannerPositionManual, is8DActive, isManualPanning, isDouble8DActive } = usePlayerStore();
  const [isDragging, setIsDragging] = useState(false);
  const size = compact ? 80 : 110;

  useEffect(() => {
    let raf;
    let curX = 0, curY = 0;
    const update = () => {
      const pos = getPannerPosition();
      const dot = dotRef.current;
      if (!dot) { raf = requestAnimationFrame(update); return; }
      let tX = 0, tY = 0, scale = 0.7, opacity = 0.25, glow = 'none';
      const active = pos.active || isManualPanning || isDouble8DActive;
      if (active) {
        const r = size * 0.38;
        tX = pos.x * r; tY = pos.z * r;
        const depth = (pos.z + 1) / 2;
        scale = 0.65 + depth * 0.6;
        opacity = 0.35 + depth * 0.65;
        glow = `0 0 ${8 + depth * 14}px var(--accent), 0 0 ${2 + depth * 5}px var(--accent)`;
      }
      curX = isDragging ? tX : curX * 0.82 + tX * 0.18;
      curY = isDragging ? tY : curY * 0.82 + tY * 0.18;
      dot.style.transform = `translate(calc(-50% + ${curX}px), calc(-50% + ${curY}px)) scale(${scale})`;
      dot.style.opacity = opacity;
      dot.style.boxShadow = glow;
      raf = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(raf);
  }, [isDragging, isManualPanning, isDouble8DActive, size]);

  const handleDrag = useCallback((e) => {
    const c = containerRef.current; if (!c) return;
    const r = c.getBoundingClientRect();
    const cx = r.left + r.width/2, cy = r.top + r.height/2;
    const px = e.touches ? e.touches[0].clientX : e.clientX;
    const py = e.touches ? e.touches[0].clientY : e.clientY;
    const dx = (px-cx)/(r.width/2), dy = (py-cy)/(r.height/2);
    const d = Math.sqrt(dx*dx+dy*dy) || 1;
    setPannerPositionManual(dx/(d>1?d:1), dy/(d>1?d:1));
  }, [setPannerPositionManual]);

  const onDown = (e) => {
    setIsDragging(true); handleDrag(e);
    const move = ev => handleDrag(ev);
    const up = () => { setIsDragging(false); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  };
  const onTouch = (e) => {
    setIsDragging(true); handleDrag(e);
    const move = ev => handleDrag(ev);
    const end = () => { setIsDragging(false); window.removeEventListener('touchmove', move); window.removeEventListener('touchend', end); };
    window.addEventListener('touchmove', move, { passive: true }); window.addEventListener('touchend', end);
  };

  const active = is8DActive || isManualPanning || isDouble8DActive;
  const accentColor = isDouble8DActive ? '#bf5af2' : 'var(--accent)';

  return (
    <div ref={containerRef} onMouseDown={onDown} onTouchStart={onTouch}
      title="Тягни для ручного просторового позиціонування!"
      style={{
        position: 'relative', width: size, height: size, borderRadius: '50%',
        border: active ? `1.5px dashed ${accentColor}` : '1px dashed rgba(255,255,255,0.12)',
        background: active ? `${accentColor}08` : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'grab', flexShrink: 0, transition: 'all 0.3s'
      }}>
      {active && <>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `1px solid ${accentColor}20`, animation: 'pRing 2.5s infinite linear' }} />
        <div style={{ position: 'absolute', inset: 16, borderRadius: '50%', border: `1px solid ${accentColor}12`, animation: 'pRing 2.5s infinite linear 1s' }} />
      </>}
      <svg width={size*0.36} height={size*0.36} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
        style={{ color: active ? accentColor : 'rgba(255,255,255,0.3)', transition: 'color 0.3s', pointerEvents: 'none' }}>
        <path d="M12 2a7 7 0 0 0-7 7v4a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V9a5 5 0 0 1 10 0v4a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V9a7 7 0 0 0-7-7z" fill="currentColor" fillOpacity="0.07"/>
        <path d="M5 14h2v2H5zM17 14h2v2h-2z" fill="currentColor"/>
        <path d="M4 14v-4a8 8 0 0 1 16 0v4" strokeWidth="1.8"/>
      </svg>
      <div ref={dotRef} style={{
        position: 'absolute', width: 11, height: 11, borderRadius: '50%',
        background: active ? accentColor : 'rgba(255,255,255,0.25)',
        top: '50%', left: '50%', pointerEvents: 'none',
        transition: 'background 0.3s'
      }} />
      <style>{`@keyframes pRing { 0%{transform:scale(.8);opacity:.7} 100%{transform:scale(1.5);opacity:0} }`}</style>
    </div>
  );
}

/* ─── iOS-style Switch ────────────────────────────────────────────────────── */
function IOSwitch({ active, onToggle, color = 'var(--accent)' }) {
  return (
    <div onClick={onToggle} style={{
      width: 40, height: 22, borderRadius: 11, flexShrink: 0,
      background: active ? color : 'rgba(255,255,255,0.1)',
      position: 'relative', cursor: 'pointer', transition: 'background 0.2s'
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 2, left: active ? 20 : 2,
        transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.35)'
      }} />
    </div>
  );
}

/* ─── Mode Card ─────────────────────────────────────────────────────────────── */
function ModeCard({ icon, label, sublabel, active, onToggle, accentBg, accentText, accentGlow }) {
  return (
    <button onClick={onToggle} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 5, padding: '10px 6px',
      borderRadius: 14, border: active ? `1.5px solid ${accentText}` : '1px solid rgba(255,255,255,0.06)',
      background: active ? accentBg : 'rgba(255,255,255,0.03)',
      cursor: 'pointer', transition: 'all 0.2s',
      boxShadow: active ? `0 0 18px ${accentGlow}` : 'none',
      transform: active ? 'scale(1.04)' : 'scale(1)',
      outline: 'none', minHeight: 72
    }}>
      <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>
      <span style={{ fontSize: 10, fontWeight: 750, color: active ? accentText : 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 1.2 }}>{label}</span>
      {sublabel && <span style={{ fontSize: 9, color: active ? `${accentText}aa` : 'rgba(255,255,255,0.35)', textAlign: 'center' }}>{sublabel}</span>}
    </button>
  );
}

/* ─── Main Modal ─────────────────────────────────────────────────────────────── */
export default function AudioEffectsModal({ onClose }) {
  const {
    is8DActive, isPerfectAudioActive, isAutoEqActive, isLofiActive, isKaraokeActive,
    isSubBassActive, isVocalBoostActive, isDouble8DActive, isBassRumbleActive, isNightcoreActive,
    reverbWet, isManualPanning, activePreset,
    toggle8D, togglePerfectAudio, toggleAutoEq, toggleLofi, toggleKaraoke,
    toggleSubBass, toggleVocalBoost, toggleDouble8D, toggleBassRumble, toggleNightcore,
    setPreset, setPannerPositionManual, setReverbWet
  } = usePlayerStore();

  const anyActive = is8DActive || isPerfectAudioActive || isAutoEqActive || isLofiActive ||
    isKaraokeActive || isSubBassActive || isVocalBoostActive || isDouble8DActive ||
    isBassRumbleActive || isNightcoreActive;

  const modes = [
    { key: '8d',      icon: '🌌', label: '8D Звук',      sublabel: 'HRTF Орбіта',       active: is8DActive,         onToggle: toggle8D,          bg: 'rgba(30,215,96,0.12)',  text: '#30d158', glow: '#30d15830' },
    { key: 'd8d',     icon: '🌀', label: 'Double 8D',    sublabel: 'Бас↺ Трела↻',       active: isDouble8DActive,   onToggle: toggleDouble8D,    bg: 'rgba(191,90,242,0.12)', text: '#bf5af2', glow: '#bf5af230' },
    { key: 'perf',    icon: '💎', label: 'Кристал',      sublabel: '+80Гц +8кГц повітря',active: isPerfectAudioActive,onToggle: togglePerfectAudio,bg: 'rgba(10,132,255,0.12)', text: '#0a84ff', glow: '#0a84ff30' },
    { key: 'aeq',     icon: '📊', label: 'Авто-EQ',      sublabel: 'Fletcher-Munson',    active: isAutoEqActive,     onToggle: toggleAutoEq,      bg: 'rgba(255,159,10,0.12)', text: '#ff9f0a', glow: '#ff9f0a30' },
    { key: 'bass',    icon: '🔊', label: 'Суб-Бас',      sublabel: '50Гц +10дБ Q:1.4',  active: isSubBassActive,    onToggle: toggleSubBass,     bg: 'rgba(255,55,95,0.12)',  text: '#ff375f', glow: '#ff375f30' },
    { key: 'rumble',  icon: '🌍', label: 'Bass Rumble',  sublabel: '42Гц+80Гц +20дБ',   active: isBassRumbleActive, onToggle: toggleBassRumble,  bg: 'rgba(255,69,0,0.12)',   text: '#ff4500', glow: '#ff450030' },
    { key: 'vocal',   icon: '🎤', label: 'Вокал',        sublabel: '-300Гц +2.5к +10к', active: isVocalBoostActive, onToggle: toggleVocalBoost,  bg: 'rgba(94,92,230,0.12)',  text: '#5e5ce6', glow: '#5e5ce630' },
    { key: 'karaoke', icon: '🎵', label: 'Мінусовка',    sublabel: 'L-R фаза скасув.',  active: isKaraokeActive,    onToggle: toggleKaraoke,     bg: 'rgba(100,210,255,0.12)',text: '#64d2ff', glow: '#64d2ff30' },
    { key: 'lofi',    icon: '📻', label: 'Lo-Fi',        sublabel: '70s Tape 3.4кГц',   active: isLofiActive,       onToggle: toggleLofi,        bg: 'rgba(255,149,0,0.12)',  text: '#ff9500', glow: '#ff950030' },
    { key: 'nc',      icon: '⚡', label: 'Nightcore',    sublabel: '+25% + 6кГц шелф',  active: isNightcoreActive,  onToggle: toggleNightcore,   bg: 'rgba(255,45,85,0.12)',  text: '#ff2d55', glow: '#ff2d5530' },
  ];

  const presets = [
    { id: 'none',    label: '⬜ Оригінал' },
    { id: 'concert', label: '🌌 Arena 8D' },
    { id: 'club',    label: '💣 Cyber Club' },
    { id: 'retro',   label: '📼 Lo-Fi Tape' },
    { id: 'karaoke', label: '🎤 Мінусовка' },
  ];

  return (
    <div className="sheet-overlay" onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 10002,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(18px)',
      animation: 'eqIn 0.22s ease'
    }}>
      <div className="sheet-card" onClick={e => e.stopPropagation()} style={{
        width: 420, maxWidth: '94vw',
        maxHeight: '90dvh',
        background: 'rgba(12,12,20,0.97)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 22, overflow: 'hidden',
        boxShadow: '0 28px 80px rgba(0,0,0,0.8)',
        color: '#fff', display: 'flex', flexDirection: 'column'
      }}>
        {/* ─── Header ─── */}
        <div style={{
          padding: '16px 18px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9,
              background: 'rgba(30,215,96,0.14)', border: '1px solid rgba(30,215,96,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)'
            }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 750, letterSpacing: '-0.3px' }}>Ідеальний Звук ✨</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>
                {anyActive ? `${modes.filter(m => m.active).length} режим${modes.filter(m=>m.active).length===1?'':'и'} активно` : 'Всі фільтри вимкнено'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MiniVisualizer />
            <button onClick={onClose} style={{
              width: 28, height: 28, borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)',
              color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* ─── Scrollable Body ─── */}
        <div style={{ overflowY: 'auto', padding: '14px 18px 18px', flex: 1,
          scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>

          {/* ─── Visualizer Row + Presets ─── */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', marginBottom: 14 }}>
            {/* Left: Orbital */}
            <div style={{
              background: 'rgba(255,255,255,0.02)', borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.04)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '12px 10px', gap: 6, flexShrink: 0
            }}>
              <SpatialOrbitVisualizer compact />
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'center' }}>
                {is8DActive ? '🌌 Орбіта' : isDouble8DActive ? '🌀 Double' : isManualPanning ? '📍 Ручний' : 'Тягни'}
              </div>
            </div>

            {/* Right: Presets */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>
                Швидкі сцени
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                {presets.map(p => {
                  const on = activePreset === p.id;
                  return (
                    <button key={p.id} onClick={() => setPreset(p.id)} style={{
                      padding: '7px 8px', borderRadius: 9, fontSize: 10, fontWeight: 700,
                      border: on ? '1.5px solid var(--accent)' : '1px solid rgba(255,255,255,0.06)',
                      background: on ? 'rgba(30,215,96,0.12)' : 'rgba(255,255,255,0.03)',
                      color: on ? 'var(--accent)' : 'rgba(255,255,255,0.65)',
                      cursor: 'pointer', textAlign: 'left',
                      boxShadow: on ? '0 0 10px rgba(30,215,96,0.2)' : 'none',
                      transition: 'all 0.18s', outline: 'none'
                    }}>
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ─── Mode Cards Grid ─── */}
          <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 9 }}>
            Аудіо режими
          </div>
          <div className="fx-modes-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 16 }}>
            {modes.map(m => (
              <ModeCard key={m.key} icon={m.icon} label={m.label} sublabel={m.sublabel}
                active={m.active} onToggle={m.onToggle}
                accentBg={m.bg} accentText={m.text} accentGlow={m.glow} />
            ))}
          </div>

          {/* ─── Reverb Slider ─── */}
          <div style={{
            background: 'rgba(255,255,255,0.02)', borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.04)', padding: '12px 14px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>🏟 Концертна зала (Reverb)</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>Ефект ехо реальної зали</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 750, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(reverbWet * 100)}%
              </span>
            </div>
            <div style={{ position: 'relative', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)' }}>
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: `${reverbWet / 0.8 * 100}%`, borderRadius: 2,
                background: 'linear-gradient(90deg, var(--accent), #0a84ff)',
                transition: 'width 0.05s'
              }} />
              <input type="range" min="0" max="0.8" step="0.01" value={reverbWet}
                onChange={e => setReverbWet(parseFloat(e.target.value))}
                style={{
                  position: 'absolute', inset: 0, width: '100%', height: '100%',
                  opacity: 0, cursor: 'pointer', margin: 0
                }} />
            </div>
          </div>

          {/* ─── Footer ─── */}
          <div style={{ textAlign: 'center', fontSize: 9, color: 'rgba(255,255,255,0.2)', marginTop: 14, fontWeight: 500, letterSpacing: '0.05em' }}>
            BEATIFY AUDIO DSP v3.0 · WEB AUDIO API
          </div>
        </div>
      </div>
    </div>
  );
}
