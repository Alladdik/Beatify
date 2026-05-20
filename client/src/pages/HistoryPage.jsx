import React, { useEffect, useMemo, useRef } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { tracksApi, fileUrl } from '../api';
import { usePlayerStore } from '../store/playerStore';
import { Clock, Heart, Music, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const PAGE_SIZE = 30;

function formatTime(seconds) {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatPlayedAt(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'щойно';
  if (mins < 60) return `${mins} хв тому`;
  if (hours < 24) return `${hours} год тому`;
  if (days === 1) return 'вчора';
  if (days < 7) return `${days} дні(в) тому`;
  return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
}

function groupByDate(entries) {
  const groups = {};
  for (const entry of entries) {
    const date = new Date(entry.playedAt);
    const diffDays = Math.floor((Date.now() - date) / 86400000);
    let label;
    if (diffDays === 0) label = 'Сьогодні';
    else if (diffDays === 1) label = 'Вчора';
    else label = date.toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
    if (!groups[label]) groups[label] = [];
    groups[label].push(entry);
  }
  return Object.entries(groups);
}

export default function HistoryPage() {
  const qc = useQueryClient();
  const sentinelRef = useRef(null);

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ['history'],
    queryFn: ({ pageParam = 0 }) =>
      tracksApi.getHistory(PAGE_SIZE, pageParam).then(r => r.data),
    getNextPageParam: (lastPage) => {
      const next = lastPage.offset + lastPage.limit;
      return next < lastPage.total ? next : undefined;
    },
    initialPageParam: 0,
    retry: false,
  });

  const entries = useMemo(() => data?.pages.flatMap(p => p.items ?? []) ?? [], [data]);
  const total   = data?.pages[0]?.total ?? 0;
  const grouped = useMemo(() => groupByDate(entries), [entries]);
  const allTracks = useMemo(() => entries.map(e => e.track).filter(Boolean), [entries]);

  const { currentTrack, setQueue } = usePlayerStore();

  const handlePlay = (track) => setQueue(allTracks, track.id);

  const handleLike = async (track) => {
    try {
      await tracksApi.like(track.id);
      qc.invalidateQueries({ queryKey: ['history'] });
      toast.success(track.isLiked ? 'Видалено з вподобаних' : 'Додано до вподобаних');
    } catch { toast.error('Помилка'); }
  };

  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage(); },
      { threshold: 0.1 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <div className="main-content">
        <div style={{ padding: '32px 32px 100px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 64, borderRadius: 8 }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="main-content">
      <div style={{ padding: '32px 32px 100px' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 56, height: 56, borderRadius: 12, background: 'linear-gradient(135deg, #1db954, #158a3e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={28} color="white" />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Історія прослуховувань</h1>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>
                {entries.length} з {total} прослуховувань
              </p>
            </div>
          </div>
        </div>

        {entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-muted)' }}>
            <Music size={64} style={{ opacity: 0.3, marginBottom: 16 }} />
            <p style={{ fontSize: 18, marginBottom: 8 }}>Ще нічого не прослухано</p>
            <p style={{ fontSize: 14 }}>Почніть слухати музику — і вона з'явиться тут</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {grouped.map(([label, dayEntries]) => (
              <div key={label}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                  {label}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {dayEntries.map((entry) => {
                    const track = entry.track;
                    if (!track) return null;
                    const isPlaying = currentTrack?.id === track.id && !currentTrack?.isExternal;
                    const cover = track.coverPath ? fileUrl('covers', track.coverPath) : null;
                    return (
                      <div key={entry.historyId} className={`track-row ${isPlaying ? 'active' : ''}`} onClick={() => handlePlay(track)}>
                        <div className="track-cover">
                          {cover
                            ? <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Music size={20} color="var(--text-muted)" /></div>}
                        </div>
                        <div className="track-info">
                          <div className="track-meta">
                            <div className="track-title">{track.title}</div>
                            <div className="track-artist">{track.artistName}{track.albumTitle && ` · ${track.albumTitle}`}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0, minWidth: 72, textAlign: 'right' }}>{formatPlayedAt(entry.playedAt)}</div>
                        <div className="track-duration">{formatTime(track.duration)}</div>
                        <button className={`like-btn ${track.isLiked ? 'liked' : ''}`} onClick={(e) => { e.stopPropagation(); handleLike(track); }}>
                          <Heart size={16} fill={track.isLiked ? 'currentColor' : 'none'} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <div ref={sentinelRef} style={{ height: 1 }} />

            {isFetchingNextPage && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                <Loader2 size={24} style={{ animation: 'spin 1.5s linear infinite', color: 'var(--accent)' }} />
              </div>
            )}

            {!hasNextPage && entries.length > 0 && (
              <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 13, color: 'var(--text-muted)' }}>
                Показано всі {total} прослуховувань
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
