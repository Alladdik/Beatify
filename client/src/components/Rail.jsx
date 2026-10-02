import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  House, Search, Compass, Library, Users, MicVocal, Gamepad2, Piano, CloudDownload,
  Heart, Plus, Sun, Moon, Monitor, Shield, LogOut, Download, Command, LogIn, Loader2, Link2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Cover from './ui/Cover';
import { LogoMark } from './ui/Logo';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { useUiStore } from '../store/uiStore';
import { useOfflineStore } from '../store/offlineStore';
import { useImportStore } from '../store/importStore';
import { useInstallStore } from '../store/installStore';
import { useTogetherStore } from '../store/togetherStore';
import { useLikesStore } from '../store/likesStore';
import { useMyPlaylists, usePlaylistActions } from '../hooks/useLibrary';
import { fileUrl } from '../lib/config';

const navCls = ({ isActive }) => `nav-item ${isActive ? 'active' : ''}`;

export default function Rail() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: playlists = [] } = useMyPlaylists();
  const { create } = usePlaylistActions();
  const likedCount = useLikesStore((s) => s.ids.size);
  const room = useTogetherStore((s) => s.room);
  const offlineCount = useOfflineStore((s) => Object.keys(s.downloadedTracks).length);
  const { pref, cycle } = useThemeStore();
  const openCmd = useUiStore((s) => s.openCmd);
  const { isImporting, progress, playlistInfo } = useImportStore();
  const installed = useInstallStore((s) => s.installed);
  const install = useInstallStore((s) => s.install);

  const ThemeIcon = pref === 'light' ? Sun : pref === 'dark' ? Moon : Monitor;
  const themeLabel = pref === 'light' ? 'Світла тема' : pref === 'dark' ? 'Темна тема' : 'Тема як у системі';
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);

  const newPlaylist = async () => {
    const pl = await create(`Мій плейлист #${playlists.length + 1}`);
    if (pl) { toast.success('Плейлист створено'); navigate(`/playlist/${pl.id}`); }
  };

  return (
    <aside className="rail" aria-label="Навігація">
      <Link to="/" className="brand" aria-label="Beatify — на головну">
        <span style={{ color: 'var(--accent-text)', display: 'inline-flex' }}><LogoMark size={28} /></span>
        <span className="brand-word">Beatify</span>
      </Link>

      <button className="rail-cmd" onClick={openCmd} title="Швидкий пошук і команди" aria-label="Швидкий пошук і команди">
        <Command size={16} /><span>Команди</span>
        <span className="kbd">{mac ? '⌘' : 'Ctrl'} K</span>
      </button>

      <div className="rail-scroll">
      <nav className="nav">
        <NavLink to="/" end className={navCls} title="Головна"><House size={19} /><span>Головна</span></NavLink>
        <NavLink to="/search" className={navCls} title="Пошук"><Search size={19} /><span>Пошук</span></NavLink>
        <NavLink to="/discovery" className={navCls} title="Відкриття"><Compass size={19} /><span>Відкриття</span></NavLink>
        <NavLink to="/library" className={navCls} title="Бібліотека"><Library size={19} /><span>Бібліотека</span></NavLink>
      </nav>

      <div className="rail-group">
        <span className="label">Слухай і грай</span>
        <NavLink to="/listen-together" className={navCls} title="Слухати разом"><Users size={19} /><span>Слухати разом</span>{room && <span className="count">{room}</span>}</NavLink>
        <NavLink to="/studio" className={navCls} title="Студія"><Piano size={19} /><span>Студія</span></NavLink>
        <NavLink to="/karaoke" className={navCls} title="Караоке"><MicVocal size={19} /><span>Караоке</span></NavLink>
        <NavLink to="/quiz" className={navCls} title="Вікторина"><Gamepad2 size={19} /><span>Вікторина</span></NavLink>
        <NavLink to="/offline" className={navCls} title="Офлайн">
          <CloudDownload size={19} /><span>Офлайн</span>
          {offlineCount > 0 && <span className="count">{offlineCount}</span>}
        </NavLink>
      </div>

      <div className="rail-lib">
        <div className="rail-lib-head">
          <span className="label">Плейлисти</span>
          {user && <button className="ibtn sm" onClick={newPlaylist} aria-label="Створити плейлист"><Plus size={16} /></button>}
        </div>

        {isImporting && (
          <div className="note" style={{ margin: '0 0 8px', padding: '8px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem' }}>
              <Loader2 size={13} className="spin accent" />
              <span className="trunc">{playlistInfo?.name || 'Імпорт зі Spotify…'}</span>
              <span className="mono muted" style={{ marginLeft: 'auto' }}>{progress.current}/{progress.total}</span>
            </div>
          </div>
        )}

        <div className="rail-lib-list">
          {user ? (
            <>
              <NavLink to="/liked" className={({ isActive }) => `lib-item ${isActive ? 'active' : ''}`}>
                <Cover title="♥" style={{ '--cv': 'var(--accent)' }}><span className="cover-ph" style={{ color: 'var(--on-accent)', background: 'var(--accent)' }}><Heart size={16} fill="currentColor" /></span></Cover>
                <span className="lib-item-text"><span className="lib-item-name">Вподобані</span><span className="lib-item-sub mono">{likedCount}</span></span>
              </NavLink>
              {playlists.map((pl) => (
                <NavLink key={pl.id} to={`/playlist/${pl.id}`} className={`lib-item ${location.pathname === `/playlist/${pl.id}` ? 'active' : ''}`}>
                  <Cover src={fileUrl('covers', pl.coverPath)} title={pl.title} />
                  <span className="lib-item-text">
                    <span className="lib-item-name trunc">{pl.title}</span>
                    <span className="lib-item-sub trunc">{pl.trackCount} {pl.userId !== user.id ? `· ${pl.userName}` : 'треків'}</span>
                  </span>
                </NavLink>
              ))}
              {playlists.length === 0 && <p className="muted" style={{ fontSize: '0.8rem', padding: '4px 10px' }}>Створіть перший плейлист — натисніть «+».</p>}
            </>
          ) : (
            <div style={{ padding: '4px 10px' }}>
              <p className="muted" style={{ fontSize: '0.8rem', marginBottom: 12 }}>Увійдіть, щоб зберігати вподобані та плейлисти.</p>
              <Link to="/login" className="btn sm">Увійти</Link>
            </div>
          )}
        </div>
      </div>
      </div>

      <div className="rail-foot">
        {!installed && (
          <button className="rail-install" onClick={install} title="Встановити Beatify як застосунок з ярликом на робочому столі">
            <Download size={17} /><span>Ярлик на робочий стіл</span>
          </button>
        )}
        <div className="rail-tools">
          <button className="tool" onClick={cycle} title={themeLabel} aria-label={themeLabel}><ThemeIcon size={17} /></button>
          {user?.canImport && user?.role !== 'admin' && (
            <NavLink to="/import" className={({ isActive }) => `tool ${isActive ? 'active' : ''}`} title="Імпорт за посиланням" aria-label="Імпорт за посиланням"><Link2 size={17} /></NavLink>
          )}
          {user?.role === 'admin' && (
            <NavLink to="/admin" className={({ isActive }) => `tool ${isActive ? 'active' : ''}`} title="Адмінка" aria-label="Адмінка"><Shield size={17} /></NavLink>
          )}
        </div>
        {user ? (
          <div className="rail-user">
            <Link to="/profile" className="user-chip" title="Профіль">
              <span className="avatar">{user.avatarPath ? <img src={fileUrl('avatars', user.avatarPath)} alt="" /> : (user.name?.[0] || '?').toUpperCase()}</span>
              <span className="user-chip-text">
                <span className="user-chip-name trunc">{user.name}</span>
                <span className="user-chip-role">{user.role === 'admin' ? 'Адміністратор' : user.artistId ? 'Виконавець' : 'Слухач'}</span>
              </span>
            </Link>
            <button className="ibtn" onClick={() => { logout(); navigate('/login'); }} aria-label="Вийти" title="Вийти"><LogOut size={17} /></button>
          </div>
        ) : (
          <NavLink to="/login" className={navCls}><LogIn size={19} /><span>Увійти</span></NavLink>
        )}
      </div>
    </aside>
  );
}
