import { Plus, Copy, Trash2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useStudio } from '../store';
import Panel from './Panel';

/**
 * Playlist — the song as a row of pattern clips. Patterns (A, B, C…) are the building blocks;
 * the order below is what "whole song" playback plays, one after another.
 */
export default function SongView() {
  const project = useStudio((s) => s.project);
  const step = useStudio((s) => s.step);
  const st = useStudio.getState();
  const nameOf = (id) => project.patterns.find((p) => p.id === id)?.name ?? '?';
  const secondsPerPattern = (60 / project.bpm) * 4 * project.bars;
  const total = project.song.length * secondsPerPattern;
  const stepsPerPattern = project.bars * 16;
  const playingIdx = project.mode === 'song' && step >= 0 && project.song.length ? Math.floor(step / stepsPerPattern) % project.song.length : -1;

  return (
    <Panel id="playlist" title="Плейліст" sub="складіть із патернів цілу пісню" hint="Плейліст: патерни A, B, C — це шматочки пісні. Додайте їх у порядок і оберіть «Уся пісня»"
      tools={project.song.length > 0 && <span className="mono muted" style={{ fontSize: '0.75rem' }}>{Math.floor(total / 60)}:{String(Math.round(total % 60)).padStart(2, '0')}</span>}>
      <div className="song">
        <div className="song-block">
          <div className="label">1 · Патерни — шматочки пісні</div>
          <div className="chips">
            {project.patterns.map((p) => (
              <span key={p.id} className="pat">
                <button className={`chip pat-name ${project.active === p.id ? 'on' : ''}`} onClick={() => st.setActive(p.id)} data-hint={`Патерн ${p.name}: клік — редагувати його в «Каналах» і «Піано-ролі»`}>{p.name}</button>
                <button className="ibtn sm" onClick={() => st.songAdd(p.id)} aria-label={`Додати ${p.name} у пісню`} data-hint={`Додати патерн ${p.name} в кінець пісні`}><Plus size={14} /></button>
                {project.patterns.length > 1 && <button className="ibtn sm" onClick={() => st.removePattern(p.id)} aria-label={`Видалити патерн ${p.name}`} data-hint={`Видалити патерн ${p.name}`}><Trash2 size={13} /></button>}
              </span>
            ))}
            <button className="btn sm" onClick={() => st.addPattern(false)} data-hint="Порожній патерн: для нового куплету чи приспіву"><Plus size={14} /> Новий</button>
            <button className="btn sm" onClick={() => st.addPattern(true)} data-hint="Копія активного патерна — зручно робити варіації"><Copy size={14} /> Дублювати</button>
          </div>
        </div>

        <div className="song-block">
          <div className="label">2 · Порядок у пісні</div>
          {project.song.length === 0 ? (
            <p className="muted" style={{ fontSize: '0.85rem' }}>Поки порожньо. Натисніть «+» біля патерна — він стане блоком пісні. Кожен блок грає {project.bars} {project.bars === 1 ? 'такт' : 'такти'}.</p>
          ) : (
            <div className="song-line">
              {project.song.map((id, i) => (
                <div key={`${id}-${i}`} className={`song-cell ${playingIdx === i ? 'playing' : ''}`}>
                  <button className="ibtn sm" onClick={() => st.songMove(i, Math.max(0, i - 1))} disabled={i === 0} aria-label="Лівіше"><ChevronLeft size={14} /></button>
                  <button className="song-pat" onClick={() => st.setActive(id)} data-hint="Клік — відкрити цей патерн для редагування">
                    {nameOf(id)}<small className="mono">{i * project.bars + 1}–{(i + 1) * project.bars}</small>
                  </button>
                  <button className="ibtn sm" onClick={() => st.songMove(i, Math.min(project.song.length - 1, i + 1))} disabled={i === project.song.length - 1} aria-label="Правіше"><ChevronRight size={14} /></button>
                  <button className="ibtn sm" onClick={() => st.songRemove(i)} aria-label="Прибрати" data-hint="Прибрати блок з пісні (сам патерн залишиться)"><X size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="song-block">
          <div className="label">3 · Що грати</div>
          <div className="chips">
            <button className={`chip ${project.mode === 'pattern' ? 'on' : ''}`} onClick={() => st.setMode('pattern')} data-hint="Циклить лише активний патерн — для роботи над ним">Один патерн (цикл)</button>
            <button className={`chip ${project.mode === 'song' ? 'on' : ''}`} onClick={() => st.setMode('song')} disabled={!project.song.length} data-hint="Грає всі блоки пісні по черзі — як готовий трек">Уся пісня</button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
