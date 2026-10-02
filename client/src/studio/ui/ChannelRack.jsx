import { memo, useState } from 'react';
import { Volume2, Eraser, Plus, Drum } from 'lucide-react';
import { useStudio, ensureEngine } from '../store';
import { DRUM_LANES, INSTRUMENTS, activePattern } from '../presets';
import Popover from '../../components/ui/Popover';
import Panel from './Panel';
import { Cell, Playhead, down, enter, ctxMenu } from './DrumGrid';

/** Bar numbers above the grid, so "where am I in the loop" is never a guess. */
const Ruler = memo(function Ruler({ total }) {
  const marks = [];
  for (let i = 0; i < total; i += 4) marks.push(i);
  return (
    <div className="seq-row ruler" aria-hidden="true">
      {marks.map((i) => (
        <span key={i} className={`ruler-mark ${i % 16 === 0 ? 'bar' : ''}`} style={{ width: 4 * 30 }}>{i % 16 === 0 ? i / 16 + 1 : `${Math.floor(i / 16) + 1}.${(i % 16) / 4 + 1}`}</span>
      ))}
    </div>
  );
});

/** Mini piano-roll preview of a channel's notes, aligned to the same step grid. */
const NotePreview = memo(function NotePreview({ notes }) {
  if (!notes.length) return null;
  let lo = 127, hi = 0;
  for (const n of notes) { if (n.p < lo) lo = n.p; if (n.p > hi) hi = n.p; }
  const span = Math.max(7, hi - lo);
  return notes.map((n, i) => (
    <i key={i} className="nb" style={{ left: n.t * 30 + 2, width: Math.max(5, n.d * 30 - 4), top: `${6 + (1 - (n.p - lo) / span) * 24}px`, opacity: 0.5 + 0.5 * (n.v ?? 0.8) }} />
  ));
});

/**
 * Channel Rack — every sound of the song in one grid.
 * Drum lanes are step buttons; instrument channels show their notes (click one to edit them in the Piano roll).
 */
export default function ChannelRack() {
  const project = useStudio((s) => s.project);
  const selected = useStudio((s) => s.selected);
  const [menu, setMenu] = useState(null);
  const pat = activePattern(project);
  const total = project.bars * 16;
  const st = useStudio.getState();

  const pick = (id) => { st.select(id); if (id !== 'drums') st.togglePanel('roll', true); };

  return (
    <Panel id="rack" title="Канали" sub="барабани кроками · інструменти нотами" hint="Канали: тут увесь ритм. Клік по квадратику — крок барабана. Клік по каналу інструмента — ноти в Піано-ролі" className="rack-panel"
      tools={<button className="btn sm" onClick={(e) => setMenu(e.currentTarget)} aria-haspopup="menu" data-hint="Додати новий канал з інструментом"><Plus size={14} /> Канал</button>}>
      <div className="seq" style={{ '--steps': total }}>
        <div className="seq-names">
          <div className="seq-name ruler-name"><span className="label">Крок / такт</span></div>

          <div className="seq-group"><Drum size={12} /> Барабани <span className="muted">· клікайте по квадратах</span></div>
          {DRUM_LANES.map((l) => (
            <div key={l.id} className="seq-name" data-hint={`${l.name}: кнопка ліворуч — прослухати звук. Праворуч у сітці — на яких кроках він грає`}>
              <button className="ibtn sm" onClick={() => { const e = ensureEngine(); e.setProject(project); e.liveDrum(l.id); }} aria-label={`Прослухати: ${l.name}`}><Volume2 size={14} /></button>
              <span className="trunc">{l.name}</span>
              <button className="ibtn sm hover-only" onClick={() => st.clearLane(l.id)} aria-label={`Очистити: ${l.name}`} data-hint="Стерти всі кроки цього рядка"><Eraser size={13} /></button>
            </div>
          ))}

          <div className="seq-group">Інструменти <span className="muted">· клік → ноти</span></div>
          {project.tracks.map((t) => (
            <div key={t.id} className={`seq-name ch ${selected === t.id ? 'on' : ''}`} onClick={() => pick(t.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && pick(t.id)}
              data-hint={`Канал «${t.name}» (${INSTRUMENTS[t.inst]?.label}). Клік — вибрати й редагувати ноти в Піано-ролі. M — заглушити, S — соло`}>
              <button className={`chip sm ${t.mixer.mute ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); st.setMixer(t.id, { mute: !t.mixer.mute }, { history: true }); }} aria-pressed={t.mixer.mute} aria-label={`Заглушити: ${t.name}`} data-hint="M (Mute) — вимкнути звук каналу">M</button>
              <button className={`chip sm ${t.mixer.solo ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); st.setMixer(t.id, { solo: !t.mixer.solo }, { history: true }); }} aria-pressed={t.mixer.solo} aria-label={`Соло: ${t.name}`} data-hint="S (Solo) — слухати лише цей канал">S</button>
              <span className="ch-text"><span className="trunc ch-name">{t.name}</span><span className="trunc ch-inst">{INSTRUMENTS[t.inst]?.label}</span></span>
            </div>
          ))}
          {project.tracks.length === 0 && <div className="seq-empty">Немає інструментів</div>}
        </div>

        <div className="seq-scroll" data-hint="Клік — увімкнути/вимкнути крок. Протягніть — малювати. Правий клік по кроку — змінити гучність. Лінії позначають долі й такти">
          <div className="seq-rows">
            <Playhead total={total} />
            <Ruler total={total} />
            <div className="seq-group seq-group-fill" />
            {DRUM_LANES.map((l) => (
              <div key={l.id} className="seq-row">
                {pat.lanes[l.id].map((vel, i) => (
                  <Cell key={i} lane={l.id} i={i} vel={vel} onDown={down} onEnter={enter} onCtx={ctxMenu} />
                ))}
              </div>
            ))}
            <div className="seq-group seq-group-fill" />
            {project.tracks.map((t) => (
              <div key={t.id} className={`seq-row ch-row ${selected === t.id ? 'on' : ''}`} onClick={() => pick(t.id)} onDoubleClick={() => pick(t.id)}>
                <div className="ch-grid" aria-hidden="true" />
                <NotePreview notes={pat.notes[t.id] ?? []} />
              </div>
            ))}
            {project.tracks.length === 0 && <div className="seq-row" />}
          </div>
        </div>
      </div>

      <Popover open={!!menu} onClose={() => setMenu(null)} anchor={menu} width={240}>
        {Object.entries(INSTRUMENTS).map(([id, i]) => (
          <button key={id} className="menu-item" onClick={() => { st.addTrack(id); st.togglePanel('roll', true); setMenu(null); }}>
            <span style={{ flex: 1 }}>{i.label}</span><span className="muted" style={{ fontSize: '0.72rem' }}>{i.desc}</span>
          </button>
        ))}
      </Popover>
    </Panel>
  );
}
