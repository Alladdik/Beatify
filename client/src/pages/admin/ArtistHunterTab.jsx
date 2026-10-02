import { useState } from 'react';
import { Search, Download, CheckSquare, Square, Loader2, Music2, X, Check, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api';
import { useDownloadQueueStore } from '../../store/downloadQueueStore';
import { enqueueAndStart } from '../../lib/downloadManager';

function formatDur(s) {
  if (!s) return '';
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export default function ArtistHunterTab() {
  const [query, setQuery]       = useState('');
  const [platform, setPlatform] = useState('youtube');
  const [results, setResults]   = useState(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(new Set());

  // Global persistent queue
  const { queue, isRunning, abort, clearFinished } = useDownloadQueueStore();

  // Map queue by id for fast lookup
  const queueMap = Object.fromEntries(queue.map(t => [t.id, t]));

  const search = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setResults(null);
    setSelected(new Set());
    try {
      const res = await api.get('/download/artistsearch', {
        params: { name: query.trim(), platform, limit: 200 },
      });
      setResults(res.data);
      // Auto-select all tracks not already queued/done
      const alreadyQueued = new Set(queue.map(t => t.id));
      setSelected(new Set(res.data.tracks.filter(t => !alreadyQueued.has(t.id)).map(t => t.id)));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Помилка пошуку');
    } finally {
      setSearching(false);
    }
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const tracks = results?.tracks || [];
  const selectAll   = () => setSelected(new Set(tracks.filter(t => !queueMap[t.id]?.status || queueMap[t.id]?.status === 'failed').map(t => t.id)));
  const deselectAll = () => setSelected(new Set());

  const handleDownload = () => {
    if (!results || selected.size === 0) return;
    const toEnqueue = tracks
      .filter(t => selected.has(t.id))
      .map(t => ({
        id:         t.id,
        url:        t.webpage_url,
        title:      t.title,
        artistName: t.artist || query,
        coverUrl:   t.thumbnail || null,
      }));
    enqueueAndStart(toEnqueue);
    setSelected(new Set());
    toast.success(`Додано ${toEnqueue.length} треків до черги завантаження`);
  };

  // Global queue stats
  const pending    = queue.filter(t => t.status === 'pending').length;
  const downloading = queue.filter(t => t.status === 'downloading').length;
  const done       = queue.filter(t => t.status === 'done').length;
  const failed     = queue.filter(t => t.status === 'failed').length;
  const currentItem = queue.find(t => t.status === 'downloading');

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#a855f7,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
            🎤
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Artist Hunter</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Знайди та скачай всю дискографію виконавця</p>
          </div>
        </div>
      </div>

      {/* Global queue status bar — always visible when queue has items */}
      {queue.length > 0 && (
        <div style={{ marginBottom: 20, padding: '14px 18px', background: isRunning ? 'color-mix(in oklab, var(--accent) 7%, transparent)' : 'color-mix(in oklab, var(--fg) 3%, transparent)', border: `1px solid ${isRunning ? 'color-mix(in oklab, var(--accent) 20%, transparent)' : 'color-mix(in oklab, var(--fg) 8%, transparent)'}`, borderRadius: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isRunning ? 10 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {isRunning && <Loader2 size={15} color="var(--accent)" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />}
              <div style={{ display: 'flex', gap: 14, fontSize: 13 }}>
                {(pending + downloading) > 0 && (
                  <span style={{ color: 'var(--text-secondary)' }}>
                    <b style={{ color: 'var(--fg)' }}>{pending + downloading}</b> очікує
                  </span>
                )}
                {done > 0 && (
                  <span style={{ color: 'var(--accent)' }}>
                    <b>{done}</b> готово
                  </span>
                )}
                {failed > 0 && (
                  <span style={{ color: 'var(--danger)' }}>
                    <b>{failed}</b> помилок
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {isRunning && (
                <button onClick={abort}
                  style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: 'var(--danger)', color: 'var(--fg)', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <X size={12} /> Зупинити
                </button>
              )}
              <button onClick={clearFinished}
                style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid color-mix(in oklab, var(--fg) 10%, transparent)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Trash2 size={12} /> Очистити
              </button>
            </div>
          </div>

          {/* Progress bar + current track */}
          {isRunning && queue.length > 0 && (
            <>
              <div style={{ height: 4, background: 'color-mix(in oklab, var(--fg) 8%, transparent)', borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{
                  height: '100%',
                  transform: `scaleX(${queue.length > 0 ? (done + failed) / queue.length : 0})`, transformOrigin: 'left',
                  background: 'var(--accent)', borderRadius: 2, transition: 'transform 0.4s'
                }} />
              </div>
              {currentItem && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {currentItem.title}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Search form */}
      <form onSubmit={search} style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Введіть ім'я виконавця... (напр. Eminem, The Weeknd)"
            style={{ width: '100%', paddingLeft: 42, paddingRight: 16, height: 48, borderRadius: 14, border: '1.5px solid color-mix(in oklab, var(--fg) 10%, transparent)', background: 'color-mix(in oklab, var(--fg) 4%, transparent)', color: 'var(--fg)', fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />
        </div>

        {/* Platform selector */}
        <div style={{ display: 'flex', border: '1.5px solid color-mix(in oklab, var(--fg) 10%, transparent)', borderRadius: 14, overflow: 'hidden' }}>
          {[{ id: 'youtube', label: '▶ YouTube' }, { id: 'soundcloud', label: 'SC' }].map(p => (
            <button key={p.id} type="button" onClick={() => setPlatform(p.id)}
              style={{ padding: '0 16px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: platform === p.id ? 'var(--accent)' : 'transparent', color: platform === p.id ? '#000' : 'color-mix(in oklab, var(--fg) 60%, transparent)', transition: 'all 0.15s' }}>
              {p.label}
            </button>
          ))}
        </div>

        <button type="submit" disabled={searching || !query.trim()}
          style={{ padding: '0 28px', height: 48, borderRadius: 14, border: 'none', background: searching ? 'color-mix(in oklab, var(--fg) 8%, transparent)' : 'var(--accent)', color: searching ? 'var(--text-muted)' : '#000', fontWeight: 800, fontSize: 15, cursor: searching ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
          {searching ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={16} />}
          {searching ? 'Шукаю...' : 'Знайти'}
        </button>
      </form>

      {/* Results */}
      {results && (
        <>
          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '12px 16px', background: 'color-mix(in oklab, var(--fg) 3%, transparent)', borderRadius: 12, border: '1px solid color-mix(in oklab, var(--fg) 7%, transparent)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{tracks.length} треків знайдено</span>
              <span style={{ fontSize: 12, color: 'var(--accent)' }}>{selected.size} вибрано</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={selectAll}   style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid color-mix(in oklab, var(--fg) 10%, transparent)', background: 'transparent', color: 'color-mix(in oklab, var(--fg) 70%, transparent)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Вибрати всі</button>
              <button onClick={deselectAll} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid color-mix(in oklab, var(--fg) 10%, transparent)', background: 'transparent', color: 'color-mix(in oklab, var(--fg) 70%, transparent)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Зняти всі</button>
              <button onClick={handleDownload} disabled={selected.size === 0}
                style={{ padding: '8px 20px', borderRadius: 10, border: 'none', background: selected.size === 0 ? 'color-mix(in oklab, var(--fg) 8%, transparent)' : 'var(--accent)', color: selected.size === 0 ? 'var(--text-muted)' : '#000', fontWeight: 700, fontSize: 13, cursor: selected.size === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Download size={14} /> Завантажити {selected.size > 0 ? `(${selected.size})` : ''}
              </button>
            </div>
          </div>

          {/* Track list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {tracks.map((track, i) => {
              const q           = queueMap[track.id];
              const isDone      = q?.status === 'done';
              const isFailed    = q?.status === 'failed';
              const isLoading   = q?.status === 'downloading';
              const isQueued    = q?.status === 'pending';
              const isSelected  = selected.has(track.id);

              return (
                <div key={track.id || i}
                  onClick={() => !isDone && !isQueued && !isLoading && toggleSelect(track.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                    borderRadius: 10,
                    background: isDone   ? 'color-mix(in oklab, var(--accent) 6%, transparent)'
                              : isFailed ? 'color-mix(in oklab, var(--danger) 6%, transparent)'
                              : isLoading ? 'color-mix(in oklab, var(--accent) 4%, transparent)'
                              : isQueued  ? 'color-mix(in oklab, var(--fg) 3%, transparent)'
                              : isSelected ? 'color-mix(in oklab, var(--fg) 5%, transparent)' : 'transparent',
                    border: `1px solid ${
                      isDone   ? 'color-mix(in oklab, var(--accent) 18%, transparent)'
                    : isFailed ? 'color-mix(in oklab, var(--danger) 18%, transparent)'
                    : isLoading ? 'color-mix(in oklab, var(--accent) 12%, transparent)'
                    : isSelected ? 'color-mix(in oklab, var(--fg) 8%, transparent)' : 'transparent'
                    }`,
                    cursor: isDone || isQueued || isLoading ? 'default' : 'pointer',
                    opacity: isDone ? 0.65 : 1,
                    transition: 'all 0.1s',
                  }}>

                  {/* Status icon */}
                  <div style={{ flexShrink: 0, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isDone    ? <Check    size={15} color="var(--accent)" />
                    : isFailed  ? <X        size={15} color="var(--danger)" />
                    : isLoading ? <Loader2  size={15} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />
                    : isQueued  ? <Loader2  size={15} color="color-mix(in oklab, var(--fg) 20%, transparent)" />
                    : isSelected ? <CheckSquare size={15} color="var(--accent)" />
                    : <Square size={15} color="color-mix(in oklab, var(--fg) 25%, transparent)" />}
                  </div>

                  {/* Index */}
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 28, textAlign: 'right' }}>{i + 1}</span>

                  {/* Thumbnail */}
                  <div style={{ width: 40, height: 40, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: 'color-mix(in oklab, var(--fg) 6%, transparent)' }}>
                    {track.thumbnail
                      ? <img src={track.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Music2 size={14} color="var(--text-muted)" /></div>
                    }
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isDone ? 'var(--accent)' : '#fff' }}>
                      {track.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {track.artist || query} {track.album ? `• ${track.album}` : ''}
                    </div>
                  </div>

                  {/* Duration */}
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{formatDur(track.duration)}</span>

                  {/* Status label */}
                  {isDone    && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>Готово</span>}
                  {isFailed  && <span style={{ fontSize: 11, color: 'var(--danger)',      fontWeight: 700, flexShrink: 0 }}>✗ Помилка</span>}
                  {isLoading  && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>↓ Завантаж...</span>}
                  {isQueued   && <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>в черзі</span>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Empty state */}
      {!results && !searching && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎤</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>Знайди виконавця</h3>
          <p style={{ fontSize: 14, maxWidth: 360, margin: '0 auto' }}>
            Введіть ім'я виконавця — отримаєш всі треки та зможеш завантажити їх одним кліком.<br />
            <b style={{ color: 'var(--accent)' }}>Завантаження не зупиняється при переході на інші сторінки.</b>
          </p>
        </div>
      )}
    </div>
  );
}
