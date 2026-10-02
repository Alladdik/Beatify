import { useState } from 'react';
import { Plus, X, Drum } from 'lucide-react';
import { useStudio } from '../store';
import { INSTRUMENTS } from '../presets';
import Popover from '../../components/ui/Popover';

export default function TrackList() {
  const project = useStudio((s) => s.project);
  const selected = useStudio((s) => s.selected);
  const [menu, setMenu] = useState(null);
  const st = useStudio.getState();

  return (
    <aside className="tracks" aria-label="Доріжки">
      <div className="tracks-head">
        <span className="label">Доріжки</span>
        <button className="ibtn sm" onClick={(e) => setMenu(e.currentTarget)} aria-label="Додати доріжку" aria-haspopup="menu"><Plus size={16} /></button>
      </div>

      <div className={`track ${selected === 'drums' ? 'on' : ''}`} onClick={() => st.select('drums')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && st.select('drums')}>
        <Drum size={16} className="track-ico" />
        <div className="track-text"><span className="trunc track-name">Барабани</span><span className="muted trunc track-sub">секвенсор</span></div>
        <button className={`chip sm ${project.drums.mixer.mute ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); st.setMixer('drums', { mute: !project.drums.mixer.mute }, { history: true }); }} aria-label="Заглушити барабани">M</button>
        <button className={`chip sm ${project.drums.mixer.solo ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); st.setMixer('drums', { solo: !project.drums.mixer.solo }, { history: true }); }} aria-label="Соло барабанів">S</button>
      </div>

      {project.tracks.map((t) => (
        <div key={t.id} className={`track ${selected === t.id ? 'on' : ''}`} onClick={() => st.select(t.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && st.select(t.id)}>
          <span className="track-ico mono">♪</span>
          <div className="track-text">
            <input className="track-name-input trunc" value={t.name} onChange={(e) => st.renameTrack(t.id, e.target.value)} onFocus={() => st.select(t.id)} aria-label="Назва доріжки" maxLength={24} />
            <select className="track-inst" value={t.inst} onFocus={() => st.select(t.id)} onChange={(e) => st.setInst(t.id, e.target.value)} aria-label="Інструмент">
              {Object.entries(INSTRUMENTS).map(([id, i]) => <option key={id} value={id}>{i.label}</option>)}
            </select>
          </div>
          <button className={`chip sm ${t.mixer.mute ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); st.setMixer(t.id, { mute: !t.mixer.mute }, { history: true }); }} aria-label={`Заглушити: ${t.name}`}>M</button>
          <button className={`chip sm ${t.mixer.solo ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); st.setMixer(t.id, { solo: !t.mixer.solo }, { history: true }); }} aria-label={`Соло: ${t.name}`}>S</button>
          <button className="ibtn sm hover-only" onClick={(e) => { e.stopPropagation(); if (window.confirm(`Видалити доріжку «${t.name}»?`)) st.removeTrack(t.id); }} aria-label={`Видалити: ${t.name}`}><X size={14} /></button>
        </div>
      ))}

      <Popover open={!!menu} onClose={() => setMenu(null)} anchor={menu} width={220}>
        {Object.entries(INSTRUMENTS).map(([id, i]) => (
          <button key={id} className="menu-item" onClick={() => { st.addTrack(id); setMenu(null); }}>
            <span style={{ flex: 1 }}>{i.label}</span><span className="muted" style={{ fontSize: '0.72rem' }}>{i.desc}</span>
          </button>
        ))}
      </Popover>
    </aside>
  );
}
