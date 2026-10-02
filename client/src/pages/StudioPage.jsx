import { useEffect, useRef, useState } from 'react';
import {
  Play, Square, Undo2, Redo2, Wand2, Download, FolderOpen, FilePlus2, Metronome, Save, Keyboard as KbIcon, SlidersHorizontal, LayoutGrid, ListMusic,
} from 'lucide-react';
import { useStudio, getEngine, disposeEngine } from '../studio/store';
import { KEYS, SCALES } from '../studio/music';
import { usePlayerStore } from '../store/playerStore';
import TrackList from '../studio/ui/TrackList';
import DrumGrid from '../studio/ui/DrumGrid';
import PianoRoll from '../studio/ui/PianoRoll';
import Mixer from '../studio/ui/Mixer';
import SongView from '../studio/ui/SongView';
import Generator, { RegenBar } from '../studio/ui/Generator';
import ExportModal from '../studio/ui/ExportModal';
import ProjectsModal from '../studio/ui/ProjectsModal';
import OnScreenKeys, { useLiveInput, RecButton } from '../studio/ui/LiveInput';

function useTapTempo() {
  const taps = useRef([]);
  return () => {
    const now = performance.now();
    taps.current = [...taps.current.filter((t) => now - t < 2500), now];
    if (taps.current.length >= 3) {
      const gaps = taps.current.slice(1).map((t, i) => t - taps.current[i]);
      useStudio.getState().setBpm(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
    }
  };
}

function Transport() {
  const playing = useStudio((s) => s.playing);
  const metronome = useStudio((s) => s.metronome);
  const project = useStudio((s) => s.project);
  const canUndo = useStudio((s) => s.past.length > 0);
  const canRedo = useStudio((s) => s.future.length > 0);
  const st = useStudio.getState();
  const tap = useTapTempo();

  // Playhead loop — reads the engine's clock, writes the step only when it changes
  useEffect(() => {
    let raf; let last = -2;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const e = getEngine();
      const s = e?.playing ? e.currentStep() : -1;
      if (s !== last) { last = s; useStudio.getState().setStep(s); }
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, []);

  const play = () => {
    const wasPlaying = useStudio.getState().playing;
    if (!wasPlaying) usePlayerStore.getState().pause(); // the studio takes the speakers
    st.togglePlay();
  };

  return (
    <div className="transport-bar">
      <div className="tb-group">
        <button className="playbtn" onClick={play} aria-label={playing ? 'Стоп' : 'Грати'} title="Пробіл">
          {playing ? <Square size={18} fill="currentColor" /> : <Play size={20} fill="currentColor" style={{ marginLeft: 2 }} />}
        </button>
        <button className={`btn icon ${metronome ? 'on' : ''}`} onClick={() => st.setMetronome(!metronome)} aria-pressed={metronome} aria-label="Метроном" title="Метроном"><Metronome size={17} /></button>
        <RecButton />
      </div>

      <div className="tb-group">
        <label className="tb-field"><span className="label">BPM</span>
          <input className="input mono tb-bpm" type="number" min="40" max="220" value={project.bpm} onChange={(e) => st.setBpm(+e.target.value)} aria-label="Темп (BPM)" />
        </label>
        <button className="btn sm" onClick={tap} title="Натискайте в ритм">Tap</button>
        <label className="tb-field"><span className="label">Тон</span>
          <select className="select tb-sel" value={project.key} onChange={(e) => st.setKey(e.target.value)} aria-label="Тональність">{KEYS.map((k) => <option key={k}>{k}</option>)}</select>
        </label>
        <label className="tb-field"><span className="label">Лад</span>
          <select className="select tb-sel wide" value={project.scale} onChange={(e) => st.setScale(e.target.value)} aria-label="Лад">{Object.entries(SCALES).map(([id, s]) => <option key={id} value={id}>{s.label}</option>)}</select>
        </label>
        <label className="tb-field"><span className="label">Такти</span>
          <select className="select tb-sel" value={project.bars} onChange={(e) => st.setBars(+e.target.value)} aria-label="Довжина патерна">{[1, 2, 4, 8, 16].map((b) => <option key={b} value={b}>{b}</option>)}</select>
        </label>
      </div>

      <div className="tb-group tb-right">
        <button className="ibtn" onClick={st.undo} disabled={!canUndo} aria-label="Скасувати" title="Ctrl Z"><Undo2 size={18} /></button>
        <button className="ibtn" onClick={st.redo} disabled={!canRedo} aria-label="Повторити" title="Ctrl Shift Z"><Redo2 size={18} /></button>
      </div>
    </div>
  );
}

export default function StudioPage() {
  const view = useStudio((s) => s.view);
  const selected = useStudio((s) => s.selected);
  const project = useStudio((s) => s.project);
  const pattern = project.patterns.find((p) => p.id === project.active) ?? project.patterns[0];
  const [gen, setGen] = useState(false);
  const [exp, setExp] = useState(false);
  const [lib, setLib] = useState(false);
  const [keys, setKeys] = useState(false);
  const [octave, setOctave] = useState(0);
  const { noteOn, noteOff, midiName } = useLiveInput(octave);
  const st = useStudio.getState();

  // The studio owns Space / letters while it is open; the global player shortcuts step aside
  useEffect(() => {
    document.body.dataset.studio = '1';
    const onKey = (e) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable;
      if (typing) return;
      if (e.code === 'Space') { e.preventDefault(); if (!useStudio.getState().playing) usePlayerStore.getState().pause(); useStudio.getState().togglePlay(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? useStudio.getState().redo() : useStudio.getState().undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); useStudio.getState().redo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); useStudio.getState().saveLocal(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      delete document.body.dataset.studio;
      window.removeEventListener('keydown', onKey);
      useStudio.getState().stop();
      disposeEngine();
    };
  }, []);

  // keep the engine in step with the project
  useEffect(() => { getEngine()?.setProject(project); }, [project]);

  return (
    <div className="studio">
      <header className="studio-head">
        <div className="studio-title">
          <input className="studio-name" value={project.name} onChange={(e) => st.setName(e.target.value)} aria-label="Назва проєкту" maxLength={60} />
          <span className="mono muted studio-seed">зерно {project.seed}</span>
        </div>
        <div className="studio-actions">
          <button className="btn primary" onClick={() => setGen(true)}><Wand2 size={16} /> Генератор</button>
          <button className="btn" onClick={() => setLib(true)}><FolderOpen size={16} /> Проєкти</button>
          <button className="btn icon" onClick={() => st.saveLocal()} aria-label="Зберегти" title="Ctrl S"><Save size={16} /></button>
          <button className="btn icon" onClick={() => { if (window.confirm('Почати з порожнього проєкту? Незбережене буде втрачено.')) st.newEmpty(); }} aria-label="Порожній проєкт" title="Порожній проєкт"><FilePlus2 size={16} /></button>
          <button className="btn" onClick={() => setExp(true)}><Download size={16} /> Експорт</button>
        </div>
      </header>

      <Transport />

      <div className="studio-views">
        <div className="tabs" role="tablist">
          {[['editor', 'Редактор', LayoutGrid], ['mixer', 'Мікшер', SlidersHorizontal], ['song', 'Пісня', ListMusic]].map(([id, label, Icon]) => (
            <button key={id} role="tab" aria-selected={view === id} className={`tab ${view === id ? 'on' : ''}`} onClick={() => st.setView(id)}><Icon size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />{label}</button>
          ))}
        </div>
        <div className="pats" aria-label="Патерни">
          {project.patterns.map((p) => <button key={p.id} className={`chip sm ${project.active === p.id ? 'on' : ''}`} onClick={() => st.setActive(p.id)}>{p.name}</button>)}
          <button className="chip sm" onClick={() => st.addPattern(false)} aria-label="Новий патерн">+</button>
        </div>
        <RegenBar />
      </div>

      <div className="studio-body">
        {view === 'editor' && (
          <>
            <TrackList />
            <div className="studio-main">{selected === 'drums' || !project.tracks.some((t) => t.id === selected) ? <DrumGrid /> : <PianoRoll key={`${selected}-${pattern.id}`} />}</div>
          </>
        )}
        {view === 'mixer' && <div className="studio-main full"><Mixer /></div>}
        {view === 'song' && <div className="studio-main full"><SongView /></div>}
      </div>

      <footer className="studio-foot">
        <button className={`btn sm ${keys ? 'on' : ''}`} onClick={() => setKeys((k) => !k)} aria-pressed={keys}><KbIcon size={14} /> Клавіатура</button>
        {keys && (
          <div className="chips">
            <button className="chip sm" onClick={() => setOctave((o) => Math.max(-2, o - 1))} aria-label="Октава вниз">−</button>
            <span className="mono muted" style={{ alignSelf: 'center', fontSize: '0.72rem' }}>октава {octave >= 0 ? '+' : ''}{octave}</span>
            <button className="chip sm" onClick={() => setOctave((o) => Math.min(3, o + 1))} aria-label="Октава вгору">+</button>
          </div>
        )}
        <span className="muted" style={{ fontSize: '0.75rem', marginLeft: 'auto' }}>
          Грайте на клавішах A–L / W–P{midiName ? ` · MIDI: ${midiName}` : ' · можна підключити MIDI-клавіатуру'}
        </span>
      </footer>
      {keys && <OnScreenKeys octaveShift={octave} noteOn={noteOn} noteOff={noteOff} />}

      {gen && <Generator onClose={() => setGen(false)} />}
      {exp && <ExportModal onClose={() => setExp(false)} />}
      {lib && <ProjectsModal onClose={() => setLib(false)} />}
    </div>
  );
}
