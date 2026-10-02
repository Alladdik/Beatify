import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Heart, ListPlus, Play, Volume2, VolumeX, ChevronDown } from 'lucide-react';
import { discoverApi, tracksApi } from '../api';
import { streamUrl, coverUrl } from '../lib/config';
import { usePlayerStore } from '../store/playerStore';
import { useUiStore } from '../store/uiStore';
import { useLikesStore, useIsLiked } from '../store/likesStore';
import { useAuthStore } from '../store/authStore';
import Cover from '../components/ui/Cover';
import { useCoverTint } from '../hooks/useAccent';

const PREVIEW_SECONDS = 20;

function FeedItem({ track, active, muted, onDone, index }) {
  const tint = useCoverTint(coverUrl(track));
  const liked = useIsLiked(track);
  const toggleLike = useLikesStore((s) => s.toggle);
  const user = useAuthStore((s) => s.user);
  const openMenu = useUiStore((s) => s.openTrackMenu);
  const [progress, setProgress] = useState(0);
  const audio = useRef(null);

  // One short preview per card: starts near the hook, plays ~20 s, then hands over to the next card
  useEffect(() => {
    if (!active) { setProgress(0); return; }
    const a = new Audio(streamUrl(track.id));
    audio.current = a;
    a.volume = 0.8;
    a.muted = muted;
    let startAt = 0;
    const onMeta = () => {
      startAt = a.duration > 70 ? a.duration * 0.28 : 0;
      a.currentTime = startAt;
      a.play().catch(() => {});
    };
    const onTime = () => {
      const p = Math.min(1, (a.currentTime - startAt) / PREVIEW_SECONDS);
      setProgress(p);
      if (p >= 1 || a.ended) { a.pause(); onDone(); }
    };
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('ended', onDone);
    return () => {
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('ended', onDone);
      a.pause(); a.removeAttribute('src'); a.load();
      audio.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, track.id]);

  useEffect(() => { if (audio.current) audio.current.muted = muted; }, [muted]);

  const playFull = () => {
    audio.current?.pause();
    usePlayerStore.getState().playQueue([track], 0);
  };

  return (
    <article className="feed-item tint" style={tint} data-index={index} aria-label={`${track.title} — ${track.artistName}`}>
      <div className="feed-art"><Cover track={track} lazy={false} /></div>
      <div className="feed-info">
        <h2 className="feed-title">{track.title}</h2>
        <p className="feed-artist">{track.artistName}</p>
        <div className="feed-progress" aria-hidden="true"><i style={{ width: `${progress * 100}%` }} /></div>
        <div className="feed-actions">
          <button className="btn primary lg" onClick={playFull}><Play size={18} fill="currentColor" /> Слухати повністю</button>
          {user && <button className={`btn lg icon ${liked ? 'on' : ''}`} onClick={() => toggleLike(track)} aria-pressed={liked} aria-label="Вподобати"><Heart size={18} fill={liked ? 'currentColor' : 'none'} /></button>}
          {user && <button className="btn lg icon" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openMenu(track, r.left, r.bottom + 6); }} aria-label="Додати до плейлиста"><ListPlus size={18} /></button>}
        </div>
      </div>
    </article>
  );
}

export default function DiscoveryPage() {
  const user = useAuthStore((s) => s.user);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(false);
  const feed = useRef(null);

  // Hand the sound over to previews while this page is open
  useEffect(() => { const s = usePlayerStore.getState(); if (s.isPlaying) s.pause(); }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['discoveryFeed', user?.id ?? 0],
    staleTime: Infinity,
    queryFn: async () => {
      const [fresh, all] = await Promise.all([
        discoverApi.mix('fresh').then((r) => r.data.tracks).catch(() => []),
        tracksApi.getAll(1, 500).then((r) => r.data),
      ]);
      const seen = new Set(fresh.map((t) => t.id));
      const rest = all.filter((t) => !seen.has(t.id) && t.mediaType !== 'video');
      for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
      return [...fresh, ...rest].slice(0, 80);
    },
  });
  const tracks = useMemo(() => data ?? [], [data]);

  // Which card is on screen
  useEffect(() => {
    const root = feed.current;
    if (!root || !tracks.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting && e.intersectionRatio > 0.6) setActive(+e.target.dataset.index); });
    }, { root, threshold: [0.6] });
    root.querySelectorAll('.feed-item').forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [tracks]);

  const goTo = useCallback((i) => {
    const el = feed.current?.querySelector(`[data-index="${i}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  const next = useCallback(() => goTo(Math.min(tracks.length - 1, active + 1)), [goTo, active, tracks.length]);

  if (isLoading) return <div className="feed"><div className="feed-item"><div className="skel" style={{ width: 'min(60vh, 70vw)', aspectRatio: '1' }} /></div></div>;
  if (!tracks.length) return <div className="page"><h1 className="display">Відкриття</h1><p className="muted">У каталозі поки немає треків для добірки.</p></div>;

  return (
    <div className="feed-wrap">
      <div className="feed" ref={feed} tabIndex={0} aria-label="Стрічка відкриттів: гортайте, щоб слухати наступне">
        {tracks.map((t, i) => <FeedItem key={t.id} track={t} index={i} active={i === active} muted={muted} onDone={next} />)}
      </div>
      <div className="feed-tools">
        <button className="ibtn lg" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Увімкнути звук' : 'Вимкнути звук'}>{muted ? <VolumeX size={22} /> : <Volume2 size={22} />}</button>
        <span className="mono muted" style={{ fontSize: '0.7rem' }}>{active + 1} / {tracks.length}</span>
        <button className="ibtn lg" onClick={next} aria-label="Наступний"><ChevronDown size={24} /></button>
      </div>
    </div>
  );
}
