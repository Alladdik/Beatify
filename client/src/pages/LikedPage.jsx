import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { tracksApi } from '../api';
import { formatTotalDuration, tracksLabel } from '../lib/format';
import { useLikesStore } from '../store/likesStore';
import TrackList from '../components/TrackRow';
import { PlayActions } from '../components/DetailHead';
import { SkeletonRows, EmptyState } from '../components/Section';

const SORTS = [['recent', 'Нещодавно додані'], ['title', 'Назва'], ['artist', 'Виконавець']];

export default function LikedPage() {
  const likedIds = useLikesStore((s) => s.ids);
  const { data = [], isLoading } = useQuery({ queryKey: ['liked'], queryFn: () => tracksApi.getLiked().then((r) => r.data) });
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('recent');

  // A track un-liked elsewhere disappears immediately, without waiting for a refetch
  const tracks = useMemo(() => {
    let list = data.filter((t) => likedIds.size === 0 || likedIds.has(t.id));
    const ql = q.trim().toLowerCase();
    if (ql) list = list.filter((t) => `${t.title} ${t.artistName} ${t.albumTitle ?? ''}`.toLowerCase().includes(ql));
    if (sort === 'title') list = [...list].sort((a, b) => a.title.localeCompare(b.title, 'uk'));
    if (sort === 'artist') list = [...list].sort((a, b) => a.artistName.localeCompare(b.artistName, 'uk'));
    return list;
  }, [data, likedIds, q, sort]);

  const total = data.reduce((s, t) => s + (t.duration || 0), 0);

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="display">Вподобані</h1>
        <div className="page-meta"><span>{tracksLabel(data.length)}</span>{total > 0 && <span>{formatTotalDuration(total)}</span>}</div>
        <PlayActions tracks={tracks} />
      </header>

      {data.length > 4 && (
        <div className="toolbar">
          <div className="search-field"><Search size={16} /><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Шукати серед вподобаних" aria-label="Фільтр" /></div>
          <div className="chips">{SORTS.map(([id, label]) => <button key={id} className={`chip ${sort === id ? 'on' : ''}`} onClick={() => setSort(id)}>{label}</button>)}</div>
        </div>
      )}

      {isLoading ? <SkeletonRows /> : data.length === 0 ? (
        <EmptyState title="Тут поки порожньо" text="Натисніть на сердечко біля треку — і він з’явиться тут." action={<Link className="btn primary" to="/search">Знайти музику</Link>} />
      ) : tracks.length === 0 ? (
        <p className="muted">Нічого не знайдено за «{q}».</p>
      ) : (
        <TrackList tracks={tracks} />
      )}
    </div>
  );
}
