import { Trash2, Piano as PianoIcon } from 'lucide-react';
import { useStudio } from '../store';
import { INSTRUMENTS, activePattern } from '../presets';
import Panel from './Panel';
import PianoRoll from './PianoRoll';

/** Piano roll window: edits the notes of the channel selected in the Channel Rack. */
export default function RollPanel() {
  const project = useStudio((s) => s.project);
  const selected = useStudio((s) => s.selected);
  const track = project.tracks.find((t) => t.id === selected);
  const pattern = activePattern(project);
  const st = useStudio.getState();

  const tools = track && (
    <>
      <select className="select roll-select" value={selected} onChange={(e) => st.select(e.target.value)} aria-label="Канал, який редагується" data-hint="Який канал зараз редагується">
        {project.tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <select className="select roll-select" value={track.inst} onChange={(e) => st.setInst(track.id, e.target.value)} aria-label="Інструмент каналу" data-hint="Звук цього каналу: можна поміняти інструмент, ноти лишаються">
        {Object.entries(INSTRUMENTS).map(([id, i]) => <option key={id} value={id}>{i.label}</option>)}
      </select>
      <button className="ibtn sm" onClick={() => { if (window.confirm(`Видалити канал «${track.name}»?`)) st.removeTrack(track.id); }} aria-label={`Видалити канал ${track.name}`} data-hint="Видалити цей канал разом з нотами"><Trash2 size={14} /></button>
    </>
  );

  return (
    <Panel id="roll" title="Піано-ролл" sub={track ? `${track.name} · патерн ${pattern.name}` : 'ноти інструмента'} tools={tools}
      hint="Піано-ролл: клавіші ліворуч — висота нот, ліворуч→праворуч — час. Клік — нова нота, тягніть — перемістити, правий клік — стерти">
      {track ? (
        <PianoRoll key={`${selected}-${pattern.id}`} />
      ) : (
        <div className="spanel-empty">
          <PianoIcon size={26} />
          <p><b>Тут редагуються ноти.</b> Барабани малюються кроками у вікні «Канали». Щоб писати мелодію, бас чи акорди — оберіть інструментальний канал або додайте його.</p>
          <div className="chips">
            {project.tracks.slice(0, 3).map((t) => <button key={t.id} className="btn sm" onClick={() => st.select(t.id)}>Редагувати «{t.name}»</button>)}
            <button className="btn sm primary" onClick={() => st.addTrack('keys')}>+ Додати клавіші</button>
          </div>
        </div>
      )}
    </Panel>
  );
}
