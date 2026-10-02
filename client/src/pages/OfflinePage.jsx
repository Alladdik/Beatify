import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, WifiOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useOfflineStore } from '../store/offlineStore';
import { isElectron, isNative } from '../lib/config';
import { tracksLabel } from '../lib/format';
import TrackList from '../components/TrackRow';
import { PlayActions } from '../components/DetailHead';
import { EmptyState } from '../components/Section';

function fmtBytes(b) {
  if (!b) return '0 МБ';
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} КБ`;
  if (b < 1024 ** 3) return `${(b / 1024 / 1024).toFixed(1)} МБ`;
  return `${(b / 1024 ** 3).toFixed(2)} ГБ`;
}

export default function OfflinePage() {
  const downloaded = useOfflineStore((s) => s.downloadedTracks);
  const clearAll = useOfflineStore((s) => s.clearAll);
  const [online, setOnline] = useState(navigator.onLine);
  const [quota, setQuota] = useState(null);

  const entries = Object.entries(downloaded);
  const tracks = entries.map(([id, e]) => ({ ...e.metadata, id: Number(id) })).sort((a, b) => (downloaded[b.id]?.downloadedAt ?? 0) - (downloaded[a.id]?.downloadedAt ?? 0));
  const bytes = entries.reduce((a, [, e]) => a + (e.size || 0), 0);

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setQuota(e)).catch(() => {});
  }, [downloaded]);

  const where = isElectron ? 'на диску комп’ютера' : isNative ? 'у пам’яті застосунку' : 'у сховищі браузера';

  const wipe = async () => {
    if (!window.confirm('Видалити всі офлайн-треки з цього пристрою?')) return;
    await clearAll();
    toast.success('Офлайн-бібліотеку очищено');
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="display">Офлайн</h1>
        <div className="page-meta">
          <span>{tracksLabel(tracks.length)}</span>
          {bytes > 0 && <span>{fmtBytes(bytes)}</span>}
          {quota?.quota && <span>вільно {fmtBytes(quota.quota - (quota.usage || 0))}</span>}
          <span style={{ color: online ? undefined : 'var(--warn)' }}>{online ? 'є мережа' : 'без мережі'}</span>
        </div>
        <PlayActions tracks={tracks}>
          {tracks.length > 0 && <button className="btn lg danger" onClick={wipe}><Trash2 size={18} /> Видалити все</button>}
        </PlayActions>
      </header>

      {!online && <div className="note warn"><WifiOff size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 8 }} />Мережі немає — граємо збережене. Усе інше з’явиться, щойно повернеться зв’язок.</div>}

      {tracks.length === 0 ? (
        <EmptyState
          title="Нічого не збережено"
          text={`Відкрийте меню «…» біля треку й оберіть «Зберегти офлайн». Файли лежать ${where} і грають без інтернету.`}
          action={<Link className="btn primary" to="/">До каталогу</Link>}
        />
      ) : (
        <TrackList tracks={tracks} />
      )}
    </div>
  );
}
