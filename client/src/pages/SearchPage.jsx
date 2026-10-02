import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, X, Clock, Loader2, Play, Lock } from 'lucide-react';
import { searchApi, externalSearchApi, tracksApi, errMsg } from '../api';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import { fileUrl } from '../lib/config';
import { normalizeExternal } from '../lib/tracks';
import { pluralUk } from '../lib/format';
import Tile from '../components/Tile';
import Cover, { Collage } from '../components/ui/Cover';
import TrackList from '../components/TrackRow';
import SaveButton from '../components/SaveButton';
import { canSaveToLibrary } from '../lib/saveTrack';
import { Section, Shelf, EmptyState, SkeletonRows } from '../components/Section';

const TABS = [
  ['all', 'Усе'],
  ['local', 'Бібліотека'],
  ['youtube', 'YouTube'],
  ['soundcloud', 'SoundCloud'],
  ['lyrics', 'Тексти'],
];
const RECENT_KEY = 'beatify_recent_searches';

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

const readRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; } };
const pushRecent = (q) => {
  try {
    const next = [q, ...readRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* private mode */ }
};

function Mark({ text = '', query = '' }) {
  const i = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + query.length)}</mark>{text.slice(i + query.length)}</>;
}

function ExternalBlock({ source, q, enabled, limit = 10 }) {
  const user = useAuthStore((s) => s.user);
  const label = source === 'soundcloud' ? 'SoundCloud' : 'YouTube Music';
  const { data, isFetching, isError, error } = useQuery({
    queryKey: ['ext', source, q, limit],
    queryFn: () => externalSearchApi.search(q, source, limit).then((r) => r.data.map(normalizeExternal)),
    enabled: enabled && !!user && q.length >= 2,
    staleTime: 10 * 60_000,
    retry: false,
  });

  if (!user) {
    return (
      <div className="note" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Lock size={16} className="muted" />
        <span>Пошук на {label} доступний після входу. <Link to="/login" className="accent">Увійти</Link></span>
      </div>
    );
  }
  if (isFetching && !data) return <SkeletonRows n={4} />;
  if (isError) return <div className="note err">{errMsg(error, `Не вдалося шукати на ${label}`)}</div>;
  if (!data?.length) return <p className="muted" style={{ fontSize: '0.9rem' }}>На {label} нічого не знайшлося.</p>;
  return (
    <>
      {!canSaveToLibrary(user) && (
        <div className="note" style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <Lock size={16} className="muted" style={{ flexShrink: 0 }} />
          <span>Слухати можна одразу. Щоб <b>зберігати треки на сервер</b>, попросіть адміністратора увімкнути вам «Імпорт за посиланням» (Адмінка → Користувачі).</span>
        </div>
      )}
      <TrackList tracks={data} showAlbum={false} header={false} renderExtra={(t) => <SaveButton track={t} />} />
    </>
  );
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [input, setInput] = useState(params.get('q') ?? '');
  const tab = params.get('tab') ?? 'all';
  const q = useDebounced(input.trim(), 320);
  const field = useRef(null);
  const [recent, setRecent] = useState(readRecent);

  useEffect(() => { field.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (q) next.set('q', q); else next.delete('q');
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  useEffect(() => { if (q.length >= 2) { pushRecent(q); setRecent(readRecent()); } }, [q]);

  const setTab = (t) => { const n = new URLSearchParams(params); n.set('tab', t); setParams(n, { replace: true }); };

  const local = useQuery({
    queryKey: ['search-local', q],
    queryFn: () => searchApi.search(q).then((r) => r.data),
    enabled: q.length >= 1 && (tab === 'all' || tab === 'local'),
    staleTime: 60_000,
  });
  const lyrics = useQuery({
    queryKey: ['search-lyrics', q],
    queryFn: () => externalSearchApi.searchLyrics(q).then((r) => r.data),
    enabled: q.length >= 3 && tab === 'lyrics',
  });
  const browse = useQuery({
    queryKey: ['search-browse'],
    queryFn: () => tracksApi.getTrending().then((r) => r.data),
    enabled: !q,
  });

  const lr = local.data;
  const noLocal = lr && !lr.tracks?.length && !lr.artists?.length && !lr.albums?.length && !lr.playlists?.length;
  const top = useMemo(() => {
    if (!lr) return null;
    const ql = q.toLowerCase();
    const a = lr.artists?.find((x) => x.name.toLowerCase() === ql) ?? lr.artists?.find((x) => x.name.toLowerCase().startsWith(ql));
    return a ? { kind: 'artist', a } : lr.tracks?.[0] ? { kind: 'track', t: lr.tracks[0] } : lr.artists?.[0] ? { kind: 'artist', a: lr.artists[0] } : null;
  }, [lr, q]);

  const playTop = () => { if (top?.kind === 'track') usePlayerStore.getState().playQueue(lr.tracks, 0); };

  return (
    <div className="page">
      <header className="page-head">
        <div className="search-hero">
          <Search size={28} aria-hidden="true" />
          <input
            ref={field} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setInput(''); }}
            placeholder="Що слухаємо?" aria-label="Пошук" enterKeyHint="search" autoComplete="off" spellCheck="false"
          />
          {input && (
            <button className="ibtn lg" onClick={() => { setInput(''); field.current?.focus(); }} aria-label="Очистити"><X size={22} /></button>
          )}
        </div>
        <div className="tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
      </header>

      {!q && (
        <>
          {recent.length > 0 && (
            <Section title="Недавні запити" right={<button className="btn ghost sm" onClick={() => { try { localStorage.removeItem(RECENT_KEY); } catch { /* */ } setRecent([]); }}>Очистити</button>}>
              <div className="chips">
                {recent.map((r) => (
                  <button key={r} className="chip" onClick={() => setInput(r)}><Clock size={13} /> {r}</button>
                ))}
              </div>
            </Section>
          )}
          <Section title="Зараз слухають">
            {browse.isLoading ? <SkeletonRows n={5} /> : <TrackList tracks={(browse.data ?? []).slice(0, 8)} showAlbum={false} header={false} />}
          </Section>
          <p className="muted" style={{ fontSize: '0.85rem', maxWidth: '60ch' }}>
            Шукайте в бібліотеці Beatify, на YouTube Music і SoundCloud одним запитом — або за рядком із тексту пісні.
            {!user && <> <Link to="/login" className="accent">Увійдіть</Link>, щоб бачити результати з інтернету.</>}
          </p>
        </>
      )}

      {q && (tab === 'all' || tab === 'local') && (
        <>
          {local.isFetching && !lr && <SkeletonRows />}
          {noLocal && tab === 'local' && (
            <EmptyState title={`У бібліотеці немає «${q}»`} text="Спробуйте YouTube або SoundCloud — вкладки вгорі."
              action={<div className="chips"><button className="chip" onClick={() => setTab('youtube')}>YouTube</button><button className="chip" onClick={() => setTab('soundcloud')}>SoundCloud</button></div>} />
          )}

          {tab === 'all' && top && (
            <Section title="Найкращий збіг">
              {top.kind === 'artist' ? (
                <Link to={`/artist/${top.a.id}`} className="top-hit">
                  <Collage covers={(top.a.covers || []).map((c) => fileUrl('covers', c))} title={top.a.name} round className="top-art" />
                  <div><div className="h1" style={{ fontSize: 'clamp(1.6rem,1rem+2vw,2.6rem)' }}><Mark text={top.a.name} query={q} /></div><div className="muted">Виконавець · {top.a.trackCount} {pluralUk(top.a.trackCount, ['трек', 'треки', 'треків'])}</div></div>
                </Link>
              ) : (
                <div className="top-hit" role="button" tabIndex={0} onClick={playTop} onKeyDown={(e) => e.key === 'Enter' && playTop()}>
                  <Cover track={top.t} className="top-art" lazy={false} />
                  <div style={{ minWidth: 0 }}>
                    <div className="h1 clamp-2" style={{ fontSize: 'clamp(1.6rem,1rem+2vw,2.6rem)' }}><Mark text={top.t.title} query={q} /></div>
                    <div className="muted">Трек · {top.t.artistName}</div>
                  </div>
                  <span className="playbtn" aria-hidden="true"><Play size={20} fill="currentColor" style={{ marginLeft: 2 }} /></span>
                </div>
              )}
            </Section>
          )}

          {lr?.tracks?.length > 0 && <Section title="Треки"><TrackList tracks={lr.tracks} header={false} /></Section>}
          {lr?.artists?.length > 0 && (
            <Section title="Виконавці">
              <Shelf>{lr.artists.map((a) => <Tile key={a.id} to={`/artist/${a.id}`} round art={<Collage covers={(a.covers || []).map((c) => fileUrl('covers', c))} title={a.name} round />} title={a.name} sub={`${a.trackCount} ${pluralUk(a.trackCount, ['трек', 'треки', 'треків'])}`} />)}</Shelf>
            </Section>
          )}
          {lr?.albums?.length > 0 && (
            <Section title="Альбоми">
              <Shelf>{lr.albums.map((a) => <Tile key={a.id} to={`/album/${a.id}`} art={<Cover src={fileUrl('covers', a.coverPath)} title={a.title} />} title={a.title} sub={`${a.artistName} · ${a.year}`} />)}</Shelf>
            </Section>
          )}
          {lr?.playlists?.length > 0 && (
            <Section title="Плейлисти">
              <Shelf>{lr.playlists.map((p) => <Tile key={p.id} to={`/playlist/${p.id}`} art={<Cover src={fileUrl('covers', p.coverPath)} title={p.title} />} title={p.title} sub={`${p.userName} · ${p.trackCount}`} />)}</Shelf>
            </Section>
          )}

          {tab === 'all' && (
            <>
              <Section title="YouTube Music" right={local.isFetching ? <Loader2 size={15} className="spin muted" /> : null}><ExternalBlock source="youtube" q={q} enabled limit={6} /></Section>
              <Section title="SoundCloud"><ExternalBlock source="soundcloud" q={q} enabled limit={6} /></Section>
            </>
          )}
        </>
      )}

      {q && tab === 'youtube' && <Section title="YouTube Music"><ExternalBlock source="youtube" q={q} enabled limit={16} /></Section>}
      {q && tab === 'soundcloud' && <Section title="SoundCloud"><ExternalBlock source="soundcloud" q={q} enabled limit={16} /></Section>}

      {tab === 'lyrics' && (
        <Section title="Пошук за текстом пісні">
          {q.length < 3 ? <p className="muted">Введіть щонайменше 3 символи — знайдемо рядок у текстах треків бібліотеки.</p>
            : lyrics.isFetching ? <SkeletonRows n={3} />
            : !lyrics.data?.length ? <p className="muted">Рядок «{q}» не знайдено. Шукаємо лише серед треків, для яких уже є текст.</p>
            : lyrics.data.map((t) => {
              const line = (t.lyricsSnippet || '').split('\n').map((l) => l.replace(/\[[\d:.]+\]/g, '').trim()).find((l) => l.toLowerCase().includes(q.toLowerCase())) || '';
              return (
                <button key={t.id} className="lyric-hit" onClick={() => usePlayerStore.getState().playQueue([{ ...t, artistName: t.artistName }], 0)}>
                  <Cover src={fileUrl('covers', t.coverPath)} title={t.title} style={{ width: 48 }} />
                  <span style={{ minWidth: 0, textAlign: 'left' }}>
                    <span className="trunc" style={{ display: 'block', fontWeight: 560 }}>{t.title} <span className="muted" style={{ fontWeight: 400 }}>— {t.artistName}</span></span>
                    <span className="clamp-2 dim" style={{ fontSize: '0.9rem' }}>«<Mark text={line} query={q} />»</span>
                  </span>
                  <Play size={18} />
                </button>
              );
            })}
        </Section>
      )}

      {q && tab === 'all' && noLocal && !local.isFetching && (
        <p className="muted" style={{ fontSize: '0.85rem' }}>У бібліотеці за «{q}» нічого — дивіться результати з інтернету вище. <button className="accent" onClick={() => navigate('/studio')} style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>Або створіть щось своє в студії</button>.</p>
      )}
    </div>
  );
}
