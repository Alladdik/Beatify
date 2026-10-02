import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, X, ChevronUp, ChevronDown, Check, Loader2 } from 'lucide-react';
import { useDownloadQueueStore } from '../store/downloadQueueStore';

// Admin-side import queue progress, docked above the player.
export default function GlobalDownloadIndicator() {
  const { queue, isRunning, abort } = useDownloadQueueStore();
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  const total = queue.length;
  const done = queue.filter((t) => t.status === 'done').length;
  const failed = queue.filter((t) => t.status === 'failed').length;
  const current = queue.find((t) => t.status === 'downloading');
  const finished = done + failed;
  const pct = total > 0 ? Math.round((finished / total) * 100) : 0;

  if (total === 0 || (!isRunning && !expanded && finished === total)) return null;

  return (
    <div className="dl-indicator">
      <div className="dl-head">
        {isRunning ? <Loader2 size={15} className="spin accent" /> : <Check size={15} className="accent" />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 560 }}>{isRunning ? 'Завантаження…' : 'Завантаження завершено'}</div>
          <div className="mono muted" style={{ fontSize: '0.68rem' }}>{done}/{total} · {failed > 0 ? `${failed} помилок` : `${pct}%`}</div>
        </div>
        <button className="ibtn sm" onClick={() => navigate('/admin')} aria-label="Відкрити адмінку"><Download size={14} /></button>
        <button className="ibtn sm" onClick={() => setExpanded((p) => !p)} aria-label={expanded ? 'Згорнути' : 'Розгорнути'}>{expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button>
        {isRunning && <button className="ibtn sm" onClick={abort} aria-label="Зупинити"><X size={14} /></button>}
      </div>
      <div className="dl-bar"><div style={{ transform: `scaleX(${pct / 100})` }} /></div>
      {current && <div className="trunc muted" style={{ padding: '6px 14px 8px', fontSize: '0.72rem' }}>↓ {current.title}</div>}
      {expanded && (
        <div style={{ maxHeight: 200, overflowY: 'auto', padding: '4px 8px 8px', borderTop: '1px solid var(--line)' }}>
          {[...queue].reverse().slice(0, 20).map((item) => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', fontSize: '0.75rem' }}>
              <span style={{ width: 14, display: 'grid', placeItems: 'center' }}>
                {item.status === 'done' && <Check size={12} className="accent" />}
                {item.status === 'failed' && <X size={12} style={{ color: 'var(--danger)' }} />}
                {item.status === 'downloading' && <Loader2 size={12} className="spin accent" />}
                {item.status === 'pending' && <span style={{ width: 5, height: 5, background: 'var(--fg-4)' }} />}
              </span>
              <span className="trunc" style={{ color: item.status === 'failed' ? 'var(--danger)' : item.status === 'pending' ? 'var(--fg-3)' : 'var(--fg)' }}>{item.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
