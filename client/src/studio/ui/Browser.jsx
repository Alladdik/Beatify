import { Wand2, FolderOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStudio } from '../store';
import { INSTRUMENTS, KITS, GENRES } from '../presets';
import Panel from './Panel';

/** Left column of the workspace: everything you can add to the project. */
export default function Browser({ onOpenProjects, onOpenGenerator }) {
  const kit = useStudio((s) => s.project.drums.kit);
  const st = useStudio.getState();

  return (
    <Panel id="browser" title="Браузер" sub="що додати в проєкт" hint="Браузер: звідси додаються інструменти, набори барабанів і готові заготовки" className="browser" bodyClass="browser-body">
      <div className="bsec">
        <div className="bsec-title">Інструменти <span className="muted">клік — новий канал</span></div>
        {Object.entries(INSTRUMENTS).map(([id, i]) => (
          <button key={id} className="bitem" data-hint={`Додати канал «${i.label}» — ${i.desc.toLowerCase()}. Він зʼявиться в «Каналах», а ноти ставляться в Піано-ролі`}
            onClick={() => { st.addTrack(id); st.togglePanel('roll', true); toast(`Канал «${i.label}» додано — малюйте ноти в Піано-ролі`, { icon: '🎹' }); }}>
            <span className="bitem-name">{i.label}</span><span className="bitem-desc">{i.desc}</span>
          </button>
        ))}
      </div>

      <div className="bsec">
        <div className="bsec-title">Набір барабанів <span className="muted">звук ритму</span></div>
        <div className="chips">
          {Object.entries(KITS).map(([id, k]) => (
            <button key={id} className={`chip sm ${kit === id ? 'on' : ''}`} onClick={() => st.setKit(id)} data-hint={`Набір барабанів «${k.label}» — міняє тембр бочки, малого й хетів`}>{k.label}</button>
          ))}
        </div>
      </div>

      <div className="bsec">
        <div className="bsec-title">Заготовки за стилем <span className="muted">клік — нова композиція</span></div>
        <div className="chips">
          {Object.entries(GENRES).map(([id, g]) => (
            <button key={id} className="chip sm" data-hint={`Скласти заготовку в стилі ${g.label} (${g.mood}). Поточну роботу можна повернути Ctrl+Z`}
              onClick={() => { st.generate({ genre: id }); toast.success(`${g.label}: заготовку створено. Ctrl+Z поверне попереднє`); }}>{g.label}</button>
          ))}
        </div>
        <button className="btn sm" style={{ marginTop: 8, width: '100%' }} onClick={onOpenGenerator} data-hint="Генератор із тонкими налаштуваннями: тональність, лад, темп, зерно"><Wand2 size={14} /> Генератор…</button>
      </div>

      <div className="bsec">
        <div className="bsec-title">Файли</div>
        <button className="btn sm" style={{ width: '100%' }} onClick={onOpenProjects} data-hint="Збережені на цьому пристрої проєкти"><FolderOpen size={14} /> Мої проєкти</button>
      </div>
    </Panel>
  );
}
