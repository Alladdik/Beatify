import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Headphones, Heart, ListMusic, Compass, Mic, Upload, X, Check, Piano, Sun, Moon, Monitor, Keyboard,
  LogOut, CloudOff, Server, Crown, Loader2, Sparkles, Flame, Disc3,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi, usersApi, tracksApi, statsApi, errMsg } from '../api';
import { useAuthStore } from '../store/authStore';
import { usePlayerStore } from '../store/playerStore';
import { useThemeStore } from '../store/themeStore';
import { useUiStore } from '../store/uiStore';
import { useOfflineStore } from '../store/offlineStore';
import { useLikesStore } from '../store/likesStore';
import { useMyPlaylists } from '../hooks/useLibrary';
import { fileUrl, isNative, getServerUrl, setServerUrl } from '../lib/config';
import { formatCount, formatTime, pluralUk } from '../lib/format';
import Cover from '../components/ui/Cover';
import Tile from '../components/Tile';
import TrackList from '../components/TrackRow';
import { Section, Shelf, EmptyState } from '../components/Section';

const GENRES = ['Pop', 'Rock', 'Hip-Hop', 'R&B', 'Electronic', 'Lo-Fi', 'Ambient', 'Jazz', 'Classical', 'Indie', 'Metal', 'Folk', 'Other'];

function audioDuration(file) {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => { resolve(Math.round(a.duration) || 0); URL.revokeObjectURL(a.src); };
    a.onerror = () => resolve(0);
    a.src = URL.createObjectURL(file);
  });
}

function UploadModal({ onClose, onDone, initialFile }) {
  const [title, setTitle] = useState(initialFile ? initialFile.name.replace(/\.[^.]+$/, '') : '');
  const [genre, setGenre] = useState('Pop');
  const [file, setFile] = useState(initialFile ?? null);
  const [cover, setCover] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [drag, setDrag] = useState(false);
  const input = useRef(null);
  const preview = cover ? URL.createObjectURL(cover) : null;

  const pick = (f) => {
    if (!f) return;
    if (!f.type.startsWith('audio/') && !/\.(mp3|wav|flac|m4a|ogg|opus|aac)$/i.test(f.name)) { toast.error('Потрібен аудіофайл'); return; }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file || !title.trim()) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('Title', title.trim());
      fd.append('Genre', genre);
      fd.append('Duration', String(await audioDuration(file)));
      fd.append('mediaFile', file);
      if (cover) fd.append('coverFile', cover);
      await tracksApi.uploadMine(fd, (ev) => ev.total && setPct(Math.round((ev.loaded / ev.total) * 100)));
      toast.success('Трек опубліковано');
      onDone?.();
      onClose();
    } catch (err) {
      toast.error(errMsg(err, 'Не вдалося опублікувати'));
    } finally { setBusy(false); }
  };

  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="modal" onSubmit={submit} role="dialog" aria-label="Випустити трек">
        <div className="modal-head"><span className="h2">Випустити трек</span><button type="button" className="ibtn" onClick={onClose} aria-label="Закрити"><X size={18} /></button></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          <div
            className={`drop ${drag ? 'over' : ''} ${file ? 'has' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
            onClick={() => input.current?.click()} role="button" tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
          >
            <input ref={input} type="file" accept="audio/*" hidden onChange={(e) => pick(e.target.files[0])} />
            {file ? <><Check size={20} className="accent" /><div><div className="trunc" style={{ fontWeight: 560 }}>{file.name}</div><div className="mono muted" style={{ fontSize: '0.7rem' }}>{(file.size / 1024 / 1024).toFixed(1)} МБ</div></div></>
              : <><Upload size={22} className="muted" /><div><div style={{ fontWeight: 560 }}>Перетягніть аудіо сюди</div><div className="muted" style={{ fontSize: '0.8rem' }}>або натисніть, щоб вибрати · mp3, wav, flac, m4a, ogg</div></div></>}
          </div>
          <div className="field"><label htmlFor="up-title">Назва</label><input id="up-title" className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} required /></div>
          <div className="field"><label htmlFor="up-genre">Жанр</label><select id="up-genre" className="select" value={genre} onChange={(e) => setGenre(e.target.value)}>{GENRES.map((g) => <option key={g}>{g}</option>)}</select></div>
          <div className="field">
            <label>Обкладинка</label>
            <label className="drop sm">
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => setCover(e.target.files[0])} />
              {preview ? <img src={preview} alt="" style={{ width: 44, height: 44, objectFit: 'cover' }} /> : <Disc3 size={22} className="muted" />}
              <span className="muted" style={{ fontSize: '0.85rem' }}>{cover ? cover.name : 'Вибрати зображення (необов’язково)'}</span>
            </label>
          </div>
          {busy && <div className="feed-progress" style={{ maxWidth: 'none' }}><i style={{ width: `${pct}%` }} /></div>}
        </div>
        <div className="modal-foot"><button type="button" className="btn" onClick={onClose} disabled={busy}>Скасувати</button><button className="btn primary" disabled={busy || !file || !title.trim()}>{busy ? <><Loader2 size={15} className="spin" /> {pct}%</> : 'Опублікувати'}</button></div>
      </form>
    </div>
  );
}

const ACHIEVEMENTS = (u, stats, pls, liked) => [
  { id: 'first', icon: Headphones, label: 'Перший крок', desc: 'Прослухати першу пісню', done: (stats?.totalPlays ?? 0) >= 1 },
  { id: 'fan50', icon: Flame, label: 'Меломан', desc: '50 прослуховувань', done: (stats?.totalPlays ?? 0) >= 50 },
  { id: 'fan500', icon: Flame, label: 'Невпинний', desc: '500 прослуховувань', done: (stats?.totalPlays ?? 0) >= 500 },
  { id: 'coll', icon: ListMusic, label: 'Колекціонер', desc: 'Зібрати 5 плейлистів', done: pls >= 5 },
  { id: 'heart', icon: Heart, label: 'Фанат', desc: '20 вподобаних треків', done: liked >= 20 },
  { id: 'explorer', icon: Compass, label: 'Дослідник', desc: '20 різних треків', done: (stats?.uniqueTracks ?? 0) >= 20 },
  { id: 'artist', icon: Mic, label: 'Виконавець', desc: 'Стати виконавцем', done: !!u?.artistId },
  { id: 'admin', icon: Crown, label: 'Адміністратор', desc: 'Керувати каталогом', done: u?.role === 'admin' },
];

const TABS = [['overview', 'Огляд'], ['artist', 'Виконавець'], ['settings', 'Налаштування']];

export default function ProfilePage() {
  const { user, token, login, logout } = useAuthStore();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [saving, setSaving] = useState(false);
  const [upload, setUpload] = useState(false);
  const [server, setServer] = useState(getServerUrl());
  const { pref, setPref } = useThemeStore();
  const toggleShortcuts = useUiStore((s) => s.toggleShortcuts);
  const likedCount = useLikesStore((s) => s.ids.size);
  const clearOffline = useOfflineStore((s) => s.clearAll);
  const { data: playlists = [] } = useMyPlaylists();
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => statsApi.get().then((r) => r.data), enabled: !!user });
  const mine = useQuery({
    queryKey: ['myArtistTracks', user?.artistId],
    queryFn: () => tracksApi.getAllAdmin().then((r) => r.data.filter((t) => t.artistId === user.artistId)),
    enabled: !!user?.artistId,
  });

  if (!user) return null;
  const ach = ACHIEVEMENTS(user, stats.data, playlists.length, likedCount);
  const earned = ach.filter((a) => a.done).length;

  const refreshMe = async () => { const { data } = await authApi.me(); login(token, data); return data; };

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await usersApi.updateMe({ name: name.trim(), email: email.trim() });
      login(token, data);
      toast.success('Збережено');
    } catch (err) { toast.error(errMsg(err, 'Не вдалося зберегти')); }
    finally { setSaving(false); }
  };

  const becomeArtist = async () => {
    if (!window.confirm('Стати виконавцем? Ви зможете випускати власні треки в каталог.')) return;
    try { await usersApi.becomeArtist(); await refreshMe(); toast.success('Тепер ви виконавець'); setTab('artist'); }
    catch (err) { toast.error(errMsg(err, 'Не вдалося')); }
  };

  const themes = [['system', Monitor, 'Як у системі'], ['dark', Moon, 'Темна'], ['light', Sun, 'Світла']];

  return (
    <div className="page">
      <header className="page-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-5)', flexWrap: 'wrap' }}>
          <span className="avatar" style={{ width: 88, height: 88, fontSize: '2.2rem', fontWeight: 300 }}>{user.avatarPath ? <img src={fileUrl('avatars', user.avatarPath)} alt="" /> : (user.name?.[0] || '?').toUpperCase()}</span>
          <div style={{ minWidth: 0 }}>
            <h1 className="display clamp-2" style={{ fontSize: 'var(--t-h1)' }}>{user.name}</h1>
            <div className="page-meta">
              <span>{user.role === 'admin' ? 'Адміністратор' : user.artistId ? 'Виконавець' : 'Слухач'}</span>
              <span>{user.email}</span>
              <span>{earned}/{ach.length} досягнень</span>
            </div>
          </div>
        </div>
        <div className="tabs" role="tablist">
          {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>{label}</button>)}
        </div>
      </header>

      {tab === 'overview' && (
        <>
          <p className="facts">
            <span><b>{formatCount(stats.data?.totalPlays ?? 0)}</b>{pluralUk(stats.data?.totalPlays ?? 0, ['прослуховування', 'прослуховування', 'прослуховувань'])}</span>
            <span><b>{likedCount}</b>вподобаних</span>
            <span><b>{playlists.length}</b>плейлистів</span>
            <Link to="/stats" className="accent" style={{ marginLeft: 'auto' }}>Уся статистика →</Link>
          </p>

          <Section title="Досягнення">
            <div className="rows no-album">
              {ach.map((a) => (
                <div key={a.id} className="row" style={{ opacity: a.done ? 1 : 0.5, cursor: 'default' }}>
                  <div className="row-idx"><a.icon size={18} className={a.done ? 'accent' : 'muted'} /></div>
                  <div className="row-main"><div className="row-text"><div className="row-title">{a.label}</div><div className="row-sub">{a.desc}</div></div></div>
                  <span />
                  <div className="row-time">{a.done ? <Check size={16} className="accent" /> : '—'}</div>
                </div>
              ))}
            </div>
          </Section>

          {playlists.length > 0 && (
            <Section title="Мої плейлисти" to="/library">
              <Shelf>{playlists.map((p) => <Tile key={p.id} to={`/playlist/${p.id}`} art={<Cover src={fileUrl('covers', p.coverPath)} title={p.title} />} title={p.title} sub={`${p.trackCount} треків`} />)}</Shelf>
            </Section>
          )}

          {stats.data?.topTracks?.length > 0 && (
            <Section title="Улюблене">
              <TrackList tracks={stats.data.topTracks.slice(0, 5).map((t) => ({ ...t, artistName: t.artistName }))} showAlbum={false} header={false} />
            </Section>
          )}
        </>
      )}

      {tab === 'artist' && (
        !user.artistId ? (
          <EmptyState
            title="Станьте виконавцем"
            text="Випускайте власні треки: завантажуйте готові файли або створюйте музику прямо в студії Beatify. Ваша сторінка виконавця з’явиться в каталозі."
            action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="btn primary lg" onClick={becomeArtist}><Mic size={18} /> Стати виконавцем</button><Link to="/studio" className="btn lg"><Piano size={18} /> Спробувати студію</Link></div>}
          />
        ) : (
          <>
            <div className="page-actions" style={{ marginTop: 0 }}>
              <button className="btn primary lg" onClick={() => setUpload(true)}><Upload size={18} /> Випустити трек</button>
              <Link to="/studio" className="btn lg"><Piano size={18} /> Створити в студії</Link>
              <Link to={`/artist/${user.artistId}`} className="btn lg">Моя сторінка</Link>
            </div>
            <Section title={`Мої треки · ${mine.data?.length ?? 0}`}>
              {mine.data?.length ? (
                <div className="rows no-album">
                  {mine.data.map((t, i) => (
                    <div key={t.id} className="row" onDoubleClick={() => usePlayerStore.getState().playQueue(mine.data, i)}>
                      <div className="row-idx"><span className="n">{i + 1}</span></div>
                      <div className="row-main"><Cover track={t} className="row-art" /><div className="row-text"><div className="row-title"><span className="trunc">{t.title}</span></div><div className="row-sub">{formatCount(t.playCount)} {pluralUk(t.playCount, ['прослуховування', 'прослуховування', 'прослуховувань'])}</div></div></div>
                      <span />
                      <div className="row-time">{formatTime(t.duration)}</div>
                    </div>
                  ))}
                </div>
              ) : <p className="muted">Ви ще не випустили жодного треку.</p>}
            </Section>
          </>
        )
      )}

      {tab === 'settings' && (
        <div className="page narrow" style={{ padding: 0, gap: 'var(--s-6)', animation: 'none' }}>
          <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
            <h2 className="h2">Акаунт</h2>
            <div className="field"><label htmlFor="pf-name">Ім’я</label><input id="pf-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></div>
            <div className="field"><label htmlFor="pf-email">Email</label><input id="pf-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><button className="btn primary" disabled={saving || (name === user.name && email === user.email)}>{saving ? <Loader2 size={15} className="spin" /> : 'Зберегти'}</button></div>
          </form>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
            <h2 className="h2">Вигляд</h2>
            <div className="chips">{themes.map(([id, Icon, label]) => <button key={id} className={`chip ${pref === id ? 'on' : ''}`} onClick={() => setPref(id)}><Icon size={14} /> {label}</button>)}</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
            <h2 className="h2">Застосунок</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" onClick={toggleShortcuts}><Keyboard size={16} /> Гарячі клавіші</button>
              <button className="btn" onClick={async () => { if (window.confirm('Видалити всі офлайн-треки з цього пристрою?')) { await clearOffline(); toast.success('Офлайн очищено'); } }}><CloudOff size={16} /> Очистити офлайн</button>
              <button className="btn" onClick={() => { if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).then(() => { caches?.keys().then((ks) => ks.forEach((k) => caches.delete(k))); toast.success('Кеш очищено — перезавантажую'); setTimeout(() => window.location.reload(), 700); }); }}><Sparkles size={16} /> Скинути кеш</button>
            </div>
          </div>

          {(isNative || server) && (
            <form onSubmit={(e) => { e.preventDefault(); setServerUrl(server); }} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
              <h2 className="h2">Сервер</h2>
              <div className="field"><label htmlFor="srv">Адреса Beatify</label><input id="srv" className="input" value={server} onChange={(e) => setServer(e.target.value)} placeholder="https://music.example.com" inputMode="url" /></div>
              <div><button className="btn"><Server size={16} /> Змінити сервер</button></div>
            </form>
          )}

          {!user.artistId && <div className="note" style={{ display: 'flex', gap: 12, alignItems: 'center' }}><Mic size={18} className="accent" /><span style={{ flex: 1 }}>Хочете випускати власні треки?</span><button className="btn sm" onClick={becomeArtist}>Стати виконавцем</button></div>}

          <div><button className="btn danger" onClick={() => { logout(); navigate('/login'); }}><LogOut size={16} /> Вийти з акаунта</button></div>
        </div>
      )}

      {upload && <UploadModal onClose={() => setUpload(false)} onDone={() => qc.invalidateQueries({ queryKey: ['myArtistTracks'] })} />}
    </div>
  );
}

export { UploadModal };
