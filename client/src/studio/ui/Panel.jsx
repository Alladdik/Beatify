import { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { useStudio } from '../store';

/**
 * One window of the FL-style workspace. The header says what the window is for (title + one line),
 * the body is whatever the window edits. Click the title to fold it, × to close (the toolbar buttons bring it back).
 */
export default function Panel({ id, title, sub, hint, tools, className = '', bodyClass = '', children }) {
  const [folded, setFolded] = useState(false);
  return (
    <section className={`spanel ${folded ? 'folded' : ''} ${className}`} aria-label={title} data-hint={hint} data-panel={id}>
      <header className="spanel-head">
        <button className="spanel-fold" onClick={() => setFolded((f) => !f)} aria-expanded={!folded} data-hint="Клік — згорнути або розгорнути вікно">
          <ChevronDown size={14} className="spanel-chev" />
          <span className="spanel-title">{title}</span>
        </button>
        {sub && <span className="spanel-sub">{sub}</span>}
        <div className="spanel-tools">{tools}</div>
        {id && <button className="ibtn sm" onClick={() => useStudio.getState().togglePanel(id, false)} aria-label={`Закрити: ${title}`} data-hint="Закрити вікно (повернути можна кнопкою зверху)"><X size={14} /></button>}
      </header>
      {!folded && <div className={`spanel-body ${bodyClass}`}>{children}</div>}
    </section>
  );
}
