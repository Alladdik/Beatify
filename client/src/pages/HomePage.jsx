import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Play, Shuffle, X, Share } from 'lucide-react';
import toast from 'react-hot-toast';
import { discoverApi, tracksApi, albumsApi, errMsg } from '../api';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import { fileUrl } from '../lib/config';
import { greeting, formatCount, pluralUk } from '../lib/format';
import Tile, { TrackTile } from '../components/Tile';
import Cover, { Collage } from '../components/ui/Cover';
import TrackList from '../components/TrackRow';
import { Section, Shelf, EmptyState, SkeletonShelf, SkeletonRows } from '../components/Section';

const hours = (minutes) => {
  const h = Math.round(minutes / 60);
  return `${h} ${pluralUk(h, ['година', 'години', 'годин'])} музики`;
};

function IosInstallNote() {
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('beatify_ios_note') === '1'; } catch { return false; } });
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  if (!ios || standalone || hidden) return null;
  return (
    <div className="note" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Share size={18} className="accent" style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>Щоб слухати як у застосунку: натисніть «Поділитися» у Safari і виберіть «На початковий екран».</span>
      <button className="ibtn sm" aria-label="Сховати" onClick={() => { try { localStorage.setItem('beatify_ios_note', '1'); } catch { /* private mode */ } setHidden(true); }}><X size={16} /></button>
    </div>
  );
}

export function MixTile({ mix }) {
  const [busy, setBusy] = useState(false);
  const covers = (mix.covers || []).map((c) => fileUrl('covers', c));
  const play = async (e) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await discoverApi.mix(mix.id);
      usePlayerStore.getState().playQueue(res.data.tracks, 0);
    } catch (err) { toast.error(errMsg(err, 'Мікс поки порожній')); }
    finally { setBusy(false); }
  };
  return (
    <Tile
      to={`/mix/${encodeURIComponent(mix.id)}`}
      art={<Collage covers={covers} title={mix.title} />}
      title={mix.title}
      sub={mix.subtitle}
      onPlay={play}
    />
  );
}

export default function HomePage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);

  const home = useQuery({ queryKey: ['home', user?.id ?? 0], queryFn: () => discoverApi.home().then((r) => r.data), staleTime: 120_000 });
  const albums = useQuery({ queryKey: ['albums'], queryFn: () => albumsApi.getAll().then((r) => r.data) });
  const all = useQuery({ queryKey: ['tracks-all'], queryFn: () => tracksApi.getAll(1, 500).then((r) => r.data) });

  const d = home.data;
  const tracks = all.data ?? [];
  const firstName = user?.name?.split(' ')[0];
  const empty = !home.isLoading && d && d.stats.tracks === 0;

  const playFirstMix = async () => {
    const m = d?.mixes?.[0];
    if (m) {
      try { const res = await discoverApi.mix(m.id); usePlayerStore.getState().playQueue(res.data.tracks, 0); return; } catch { /* fall back */ }
    }
    if (tracks.length) usePlayerStore.getState().playQueue(tracks, 0);
  };
  const shuffleAll = () => {
    if (!tracks.length) return;
    const list = [...tracks];
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    usePlayerStore.getState().playQueue(list, 0);
    usePlayerStore.setState({ isShuffle: true });
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="display">{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
        {d && (
          <div className="page-meta">
            <span>{formatCount(d.stats.tracks)} {pluralUk(d.stats.tracks, ['трек', 'треки', 'треків'])}</span>
            <span>{d.stats.artists} {pluralUk(d.stats.artists, ['виконавець', 'виконавці', 'виконавців'])}</span>
            <span>{hours(d.stats.minutes)}</span>
          </div>
        )}
        <div className="page-actions">
          <button className="btn primary lg" onClick={playFirstMix} disabled={!d && !tracks.length}><Play size={18} fill="currentColor" /> {user ? 'Слухати мікс дня' : 'Слухати'}</button>
          <button className="btn lg" onClick={shuffleAll} disabled={!tracks.length}><Shuffle size={18} /> Перемішати все</button>
        </div>
      </header>

      <IosInstallNote />

      {home.isError && (
        <div className="note err" role="alert">
          {errMsg(home.error, 'Не вдалося завантажити головну')}{' '}
          <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => home.refetch()}>Спробувати знову</button>
        </div>
      )}

      {empty && (
        <EmptyState
          title="У каталозі ще немає музики"
          text="Адміністратор може додати треки у розділі «Адмінка» — завантаження файлів, імпорт зі Spotify, YouTube та SoundCloud."
          action={user?.role === 'admin' ? <button className="btn primary" onClick={() => navigate('/admin')}>Додати музику</button> : <Link className="btn" to="/studio">Створити свою музику в студії</Link>}
        />
      )}

      {home.isLoading && <SkeletonShelf />}

      {d?.recent?.length > 0 && (
        <Section title="Продовжити" to="/history" more="Історія">
          <Shelf>{d.recent.map((t) => <TrackTile key={t.id} track={t} queue={d.recent} />)}</Shelf>
        </Section>
      )}

      {d?.mixes?.length > 0 && (
        <Section title={user ? 'Ваші міксі' : 'Міксі'}>
          <Shelf wide>{d.mixes.map((m) => <MixTile key={m.id} mix={m} />)}</Shelf>
        </Section>
      )}

      {d?.because && (
        <Section title={`Бо ви слухали ${d.because.artist.name}`} to={`/artist/${d.because.artist.id}`} more="До виконавця">
          <Shelf>{d.because.tracks.map((t) => <TrackTile key={t.id} track={t} queue={d.because.tracks} />)}</Shelf>
        </Section>
      )}

      {d?.artists?.length > 0 && (
        <Section title={user ? 'Ваші виконавці' : 'Виконавці'} to="/library?tab=artists">
          <Shelf>
            {d.artists.map((a) => (
              <Tile
                key={a.id} to={`/artist/${a.id}`} round
                art={<Collage covers={(a.covers || []).map((c) => fileUrl('covers', c))} title={a.name} round />}
                title={a.name} sub={`${a.trackCount} ${pluralUk(a.trackCount, ['трек', 'треки', 'треків'])}`}
              />
            ))}
          </Shelf>
        </Section>
      )}

      {d?.newReleases?.length > 0 && (
        <Section title="Нове в каталозі">
          <Shelf>{d.newReleases.map((t) => <TrackTile key={t.id} track={t} queue={d.newReleases} />)}</Shelf>
        </Section>
      )}

      {d?.trending?.length > 0 && (
        <Section title="Зараз слухають">
          <TrackList tracks={d.trending.slice(0, 10)} showAlbum={false} header={false} />
        </Section>
      )}

      {albums.data?.length > 0 && (
        <Section title="Альбоми">
          <Shelf>
            {albums.data.slice(0, 16).map((a) => (
              <Tile key={a.id} to={`/album/${a.id}`} art={<Cover src={fileUrl('covers', a.coverPath)} title={a.title} />} title={a.title} sub={`${a.artistName} · ${a.year}`} />
            ))}
          </Shelf>
        </Section>
      )}

      {tracks.length > 0 && (
        <Section title={`Усі треки · ${tracks.length}`}>
          <TrackList tracks={showAll ? tracks : tracks.slice(0, 20)} />
          {tracks.length > 20 && (
            <button className="btn" style={{ alignSelf: 'center' }} onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Показати менше' : `Показати ще ${tracks.length - 20}`}
            </button>
          )}
        </Section>
      )}
      {all.isLoading && <SkeletonRows />}
    </div>
  );
}
