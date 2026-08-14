import React, { useState } from 'react';
import { useDownloadQueueStore } from '../store/downloadQueueStore';
import { Download, X, ChevronUp, ChevronDown, Check, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function GlobalDownloadIndicator() {
  const { queue, isRunning, abort } = useDownloadQueueStore();
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  const total    = queue.length;
  const done     = queue.filter(t => t.status === 'done').length;
  const failed   = queue.filter(t => t.status === 'failed').length;
  const pending  = queue.filter(t => t.status === 'pending').length;
  const current  = queue.find(t => t.status === 'downloading');
  const finished = done + failed;
  const pct      = total > 0 ? Math.round((finished / total) * 100) : 0;

  // Only show when there's something in the queue
  if (total === 0) return null;
  // Hide if everything is done and not expanded
  if (!isRunning && !expanded && finished === total) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(var(--player-height) + 16px)',
      left: 16,
      zIndex: 8000,
      width: expanded ? 320 : 260,
      background: 'rgba(14,14,22,0.97)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 16,
      boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
      backdropFilter: 'blur(24px)',
      overflow: 'hidden',
      transition: 'width 0.2s ease',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
        {isRunning
          ? <Loader2 size={15} color="var(--accent)" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
          : <Check    size={15} color="var(--accent)" style={{ flexShrink: 0 }} />
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
            {isRunning ? 'Завантаження...' : 'Завантаження завершено'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {done} / {total} · {failed > 0 ? `${failed} помилок` : `${pct}%`}
          </div>
        </div>

        {/* Go to admin */}
        <button onClick={() => navigate('/admin')} title="Відкрити Admin"
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: '2px 4px', borderRadius: 6 }}>
          <Download size={13} />
        </button>

        {/* Expand/collapse */}
        <button onClick={() => setExpanded(p => !p)}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: '2px 4px', borderRadius: 6 }}>
          {expanded ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>

        {/* Stop if running */}
        {isRunning && (
          <button onClick={abort} title="Зупинити"
            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', padding: '2px 4px', borderRadius: 6 }}>
            <X size={13} />
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', margin: '0 14px 0' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: failed > 0 && !isRunning
            ? 'linear-gradient(90deg, var(--accent), #ef4444)'
            : 'var(--accent)',
          borderRadius: 2,
          transition: 'width 0.4s ease',
        }} />
      </div>

      {/* Current track */}
      {current && (
        <div style={{ padding: '6px 14px 8px', fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          ↓ {current.title}
        </div>
      )}

      {/* Expanded: recent queue items */}
      {expanded && (
        <div style={{ maxHeight: 200, overflowY: 'auto', padding: '4px 6px 8px', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 4 }}>
          {[...queue].reverse().slice(0, 20).map(item => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 7 }}>
              <span style={{ flexShrink: 0, width: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {item.status === 'done'        && <Check   size={12} color="var(--accent)" />}
                {item.status === 'failed'       && <X       size={12} color="#ef4444" />}
                {item.status === 'downloading'  && <Loader2 size={12} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />}
                {item.status === 'pending'      && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />}
              </span>
              <span style={{
                flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: item.status === 'done' ? 'var(--accent)' : item.status === 'failed' ? '#ef4444' : item.status === 'downloading' ? '#fff' : 'var(--text-muted)',
              }}>
                {item.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
