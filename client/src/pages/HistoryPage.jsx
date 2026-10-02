import { useEffect, useMemo, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { tracksApi } from '../api';
import { timeAgo, pluralUk } from '../lib/format';
import { TrackRow } from '../components/TrackRow';
import { PlayActions } from '../components/DetailHead';
import { SkeletonRows, EmptyState } from '../components/Section';

const PAGE = 40;

function dayLabel(iso) {
  const d = new Date(iso);
  const diff = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (diff === 0) return 'Сьогодні';
  if (diff === 1) return 'Вчора';
  return d.toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function HistoryPage() {
  const sentinel = useRef(null);
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ['history'],
    queryFn: ({ pageParam = 0 }) => tracksApi.getHistory(PAGE, pageParam).then((r) => r.data),
    getNextPageParam: (last) => (last.offset + last.limit < last.total ? last.offset + last.limit : undefined),
    initialPageParam: 0,
    retry: false,
  });

  const entries = useMemo(() => data?.pages.flatMap((p) => p.items ?? []) ?? [], [data]);
  const total = data?.pages[0]?.total ?? 0;
  const tracks = useMemo(() => entries.map((e) => e.track).filter(Boolean), [entries]);
  const groups = useMemo(() => {
    const g = [];
    entries.forEach((e) => {
      const label = dayLabel(e.playedAt);
      if (!g.length || g[g.length - 1].label !== label) g.push({ label, items: [] });
      g[g.length - 1].items.push(e);
    });
    return g;
  }, [entries]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver((ents) => { if (ents[0].isIntersecting && !isFetchingNextPage) fetchNextPage(); }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="display">Історія</h1>
        <div className="page-meta"><span>{total} {pluralUk(total, ['прослуховування', 'прослуховування', 'прослуховувань'])}</span></div>
        <PlayActions tracks={tracks} />
      </header>

      {isLoading ? <SkeletonRows /> : entries.length === 0 ? (
        <EmptyState title="Історія порожня" text="Усе, що ви слухаєте, зберігається тут — щоб до улюбленого можна було повернутись." action={<Link className="btn primary" to="/">Знайти, що послухати</Link>} />
      ) : (
        <div className="rows no-album">
          {groups.map((g) => (
            <section key={g.label}>
              <div className="rows-day label">{g.label}</div>
              {g.items.map((e, i) => (
                <TrackRow key={e.historyId} track={e.track} index={i} queue={tracks} showAlbum={false}
                  extraAction={<span className="mono muted hover-hide" style={{ fontSize: '0.68rem', padding: '0 8px' }}>{timeAgo(e.playedAt)}</span>} />
              ))}
            </section>
          ))}
          <div ref={sentinel} style={{ height: 1 }} />
          {isFetchingNextPage && <div style={{ display: 'grid', placeItems: 'center', padding: 24 }}><Loader2 className="spin muted" /></div>}
        </div>
      )}
    </div>
  );
}
