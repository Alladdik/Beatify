import { Grid3x3, Piano, ListMusic, Play, X } from 'lucide-react';
import { useStudio } from '../store';

const STEPS = [
  { icon: Grid3x3, title: 'Намалюйте ритм', text: 'У вікні «Канали» клікайте по квадратиках — це кроки барабанів. Протягніть мишею, щоб малювати швидко.', panel: 'rack' },
  { icon: Piano, title: 'Додайте інструмент і ноти', text: 'У «Браузері» клікніть інструмент — зʼявиться новий канал. Клік по каналу відкриває «Піано-ролл»: клік — нота, тягніть край — довжина.', panel: 'roll' },
  { icon: Play, title: 'Грайте і слухайте', text: 'Пробіл — старт і стоп. BPM, тональність і лад — угорі. Червона кнопка записує ноти з клавіатури чи MIDI.', panel: null },
  { icon: ListMusic, title: 'Складіть пісню', text: 'Робіть кілька патернів (A, B, C), у «Плейлісті» розставте їх по черзі, а «Експорт» збереже WAV.', panel: 'playlist' },
];

/** First-visit guide. Each step opens the window it talks about. */
export default function QuickStart({ onClose }) {
  return (
    <div className="quick-start" role="region" aria-label="Швидкий старт">
      <div className="quick-start-head">
        <div>
          <div className="label">Швидкий старт</div>
          <div className="qs-title">Як зробити трек за 4 кроки</div>
        </div>
        <button className="ibtn" onClick={onClose} aria-label="Сховати підказку"><X size={16} /></button>
      </div>
      <ol className="qs-steps">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <button className="qs-step" onClick={() => { if (s.panel) { useStudio.getState().togglePanel(s.panel, true); document.querySelector(`[data-panel="${s.panel}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }} data-hint={s.panel ? 'Клік — показати це вікно' : undefined}>
              <span className="qs-num">{i + 1}</span>
              <s.icon size={18} className="qs-ico" />
              <span className="qs-body"><b>{s.title}</b><span>{s.text}</span></span>
            </button>
          </li>
        ))}
      </ol>
      <div className="quick-start-foot">
        <button className="btn sm primary" onClick={onClose}>Зрозуміло, почати</button>
        <span className="muted" style={{ fontSize: '0.75rem' }}>Повернути цю підказку можна кнопкою «?» угорі.</span>
      </div>
    </div>
  );
}
