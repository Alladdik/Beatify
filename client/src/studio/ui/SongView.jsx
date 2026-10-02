import { Plus, Copy, Trash2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useStudio } from '../store';

export default function SongView() {
  const project = useStudio((s) => s.project);
  const st = useStudio.getState();
  const nameOf = (id) => project.patterns.find((p) => p.id === id)?.name ?? '?';
  const secondsPerPattern = (60 / project.bpm) * 4 * project.bars;
  const total = project.song.length * secondsPerPattern;

  return (
    <section className="song" aria-label="Структура пісні">
      <div className="studio-toolbar">
        <span className="label">Режим відтворення</span>
        <div className="chips">
          <button className={`chip ${project.mode === 'pattern' ? 'on' : ''}`} onClick={() => st.setMode('pattern')}>Один патерн</button>
          <button className={`chip ${project.mode === 'song' ? 'on' : ''}`} onClick={() => st.setMode('song')} disabled={!project.song.length}>Уся пісня</button>
        </div>
        {project.song.length > 0 && <span className="mono muted" style={{ marginLeft: 'auto', fontSize: '0.75rem' }}>{Math.floor(total / 60)}:{String(Math.round(total % 60)).padStart(2, '0')}</span>}
      </div>

      <div className="song-block">
        <div className="label">Патерни — натисніть, щоб редагувати</div>
        <div className="chips">
          {project.patterns.map((p) => (
            <span key={p.id} className="pat">
              <button className={`chip pat-name ${project.active === p.id ? 'on' : ''}`} onClick={() => st.setActive(p.id)}>{p.name}</button>
              <button className="ibtn sm" onClick={() => st.songAdd(p.id)} aria-label={`Додати ${p.name} у пісню`} title="Додати у пісню"><Plus size={14} /></button>
              {project.patterns.length > 1 && <button className="ibtn sm" onClick={() => st.removePattern(p.id)} aria-label={`Видалити патерн ${p.name}`}><Trash2 size={13} /></button>}
            </span>
          ))}
          <button className="btn sm" onClick={() => st.addPattern(false)}><Plus size={14} /> Новий</button>
          <button className="btn sm" onClick={() => st.addPattern(true)}><Copy size={14} /> Дублювати</button>
        </div>
      </div>

      <div className="song-block">
        <div className="label">Порядок у пісні</div>
        {project.song.length === 0 ? (
          <p className="muted" style={{ fontSize: '0.85rem' }}>Поки порожньо. Додайте патерни кнопкою «+» — вони зіграють по черзі, кожен {project.bars} такти.</p>
        ) : (
          <div className="song-line">
            {project.song.map((id, i) => (
              <div key={`${id}-${i}`} className="song-cell">
                <button className="ibtn sm" onClick={() => st.songMove(i, Math.max(0, i - 1))} disabled={i === 0} aria-label="Лівіше"><ChevronLeft size={14} /></button>
                <button className="song-pat" onClick={() => st.setActive(id)}>{nameOf(id)}</button>
                <button className="ibtn sm" onClick={() => st.songMove(i, Math.min(project.song.length - 1, i + 1))} disabled={i === project.song.length - 1} aria-label="Правіше"><ChevronRight size={14} /></button>
                <button className="ibtn sm" onClick={() => st.songRemove(i)} aria-label="Прибрати"><X size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
