import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Heart, Clock, BarChart3, CloudDownload, Piano, Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { artistsApi, albumsApi, playlistsApi } from '../api';
import { fileUrl } from '../lib/config';
import { tracksLabel } from '../lib/format';
import { useAuthStore } from '../store/authStore';
import { useLikesStore } from '../store/likesStore';
import { useOfflineStore } from '../store/offlineStore';
import { useMyPlaylists, usePlaylistActions } from '../hooks/useLibrary';
import Cover, { Collage } from '../components/ui/Cover';
import Tile from '../components/Tile';
import { Section, EmptyState } from '../components/Section';

const TABS = [['playlists', 'Плейлисти'], ['artists', 'Виконавці'], ['albums', 'Альбоми']];

function QuickLink({ to, icon: Icon, title, sub }) {
  return (
    <Link to={to} className="quick">
      <Icon size={22} />
      <span><span className="quick-title">{title}</span><span className="quick-sub">{sub}</span></span>
    </Link>
  );
}

export default function LibraryPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'playlists';
  const [filter, setFilter] = useState('');
  const likedCount = useLikesStore((s) => s.ids.size);
  const offlineCount = useOfflineStore((s) => Object.keys(s.downloadedTracks).length);
  const { data: mine = [] } = useMyPlaylists();
  const { create } = usePlaylistActions();
  const pub = useQuery({ queryKey: ['publicPlaylists'], queryFn: () => playlistsApi.getPublic().then((r) => r.data), enabled: tab === 'playlists' });
  const artists = useQuery({ queryKey: ['artists'], queryFn: () => artistsApi.getAll().then((r) => r.data), enabled: tab === 'artists' });
  const albums = useQuery({ queryKey: ['albums'], queryFn: () => albumsApi.getAll().then((r) => r.data), enabled: tab === 'albums' });

  const others = (pub.data ?? []).filter((p) => !mine.some((m) => m.id === p.id));
  const ql = filter.trim().toLowerCase();
  const fArtists = useMemo(() => (artists.data ?? []).filter((a) => a.trackCount > 0 && a.name.toLowerCase().includes(ql)), [artists.data, ql]);
  const fAlbums = useMemo(() => (albums.data ?? []).filter((a) => `${a.title} ${a.artistName}`.toLowerCase().includes(ql)), [albums.data, ql]);

  const newPlaylist = async () => {
    const pl = await create(`Мій плейлист #${mine.length + 1}`);
    if (pl) { toast.success('Плейлист створено'); navigate(`/playlist/${pl.id}`); }
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="display">Бібліотека</h1>
        <div className="tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'on' : ''}`} onClick={() => { setFilter(''); setParams({ tab: id }, { replace: true }); }}>{label}</button>
          ))}
        </div>
      </header>

      {tab === 'playlists' && (
        <>
          <div className="quicks">
            {user && <QuickLink to="/liked" icon={Heart} title="Вподобані" sub={tracksLabel(likedCount)} />}
            {user && <QuickLink to="/history" icon={Clock} title="Історія" sub="Що ви слухали" />}
            {user && <QuickLink to="/stats" icon={BarChart3} title="Статистика" sub="Ваші виконавці й години" />}
            <QuickLink to="/offline" icon={CloudDownload} title="Офлайн" sub={offlineCount ? tracksLabel(offlineCount) : 'Слухайте без мережі'} />
            <QuickLink to="/studio" icon={Piano} title="Студія" sub="Створіть власну музику" />
          </div>

          {user ? (
            <Section title="Мої плейлисти" right={<button className="btn sm" onClick={newPlaylist}><Plus size={14} /> Новий</button>}>
              {mine.length === 0 ? <p className="muted">Плейлистів ще немає. Створіть перший — він з’явиться і в меню «Додати до плейліста».</p> : (
                <div className="grid">
                  {mine.map((p) => <Tile key={p.id} to={`/playlist/${p.id}`} art={<Cover src={fileUrl('covers', p.coverPath)} title={p.title} />} title={p.title} sub={`${tracksLabel(p.trackCount)}${p.userId !== user.id ? ` · ${p.userName}` : ''}`} />)}
                </div>
              )}
            </Section>
          ) : (
            <EmptyState title="Ваша бібліотека чекає" text="Увійдіть, щоб зберігати вподобані треки та збирати плейлисти." action={<Link className="btn primary" to="/login">Увійти</Link>} />
          )}

          {others.length > 0 && (
            <Section title="Публічні плейлисти">
              <div className="grid">{others.map((p) => <Tile key={p.id} to={`/playlist/${p.id}`} art={<Cover src={fileUrl('covers', p.coverPath)} title={p.title} />} title={p.title} sub={`${p.userName} · ${p.trackCount}`} />)}</div>
            </Section>
          )}
        </>
      )}

      {tab === 'artists' && (
        <>
          <div className="search-field" style={{ maxWidth: 360 }}><Search size={16} /><input className="input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Знайти виконавця" aria-label="Фільтр виконавців" /></div>
          <div className="grid" style={{ '--tile-min': '150px' }}>
            {fArtists.map((a) => <Tile key={a.id} to={`/artist/${a.id}`} round art={<Collage covers={(a.covers || []).map((c) => fileUrl('covers', c))} title={a.name} round />} title={a.name} sub={tracksLabel(a.trackCount)} />)}
          </div>
          {!artists.isLoading && fArtists.length === 0 && <p className="muted">Нічого не знайдено.</p>}
        </>
      )}

      {tab === 'albums' && (
        <>
          <div className="search-field" style={{ maxWidth: 360 }}><Search size={16} /><input className="input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Знайти альбом" aria-label="Фільтр альбомів" /></div>
          <div className="grid">
            {fAlbums.map((a) => <Tile key={a.id} to={`/album/${a.id}`} art={<Cover src={fileUrl('covers', a.coverPath)} title={a.title} />} title={a.title} sub={`${a.artistName} · ${a.year}`} />)}
          </div>
          {!albums.isLoading && fAlbums.length === 0 && <p className="muted">Альбомів поки немає.</p>}
        </>
      )}
    </div>
  );
}
