import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { usePlayerStore } from '../store/playerStore';
import { playlistsApi } from '../api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useImportStore } from '../store/importStore';
import {
  Home, Search, Sparkles, Heart, Clock, BarChart2, Users, Gamepad2,
  Plus, Music2, LogOut, User, Shield, WifiOff, Loader2, ListMusic,
  ChevronRight, Mic,
} from 'lucide-react';
import { useOfflineStore } from '../store/offlineStore';
import toast from 'react-hot-toast';

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const { currentTrack } = usePlayerStore();
  const offlineCount = useOfflineStore(s => Object.keys(s.downloadedTracks).length);
  const isElectron = !!window.electronAPI;
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const { isImporting, progress, playlistInfo } = useImportStore();
  const [filter, setFilter] = useState('all'); // 'all' | 'playlists' | 'saved'

  const { data: playlists = [] } = useQuery({
    queryKey: ['myPlaylists'],
    queryFn: () => playlistsApi.getAll().then(r => r.data),
    enabled: !!user,
    retry: false,
  });

  const createPlaylist = async () => {
    try {
      const res = await playlistsApi.create({ title: `Мій плейлист #${playlists.length + 1}`, description: '', isPublic: false });
      qc.invalidateQueries(['myPlaylists']);
      navigate(`/playlist/${res.data.id}`);
      toast.success('Плейлист створено!');
    } catch { toast.error('Помилка'); }
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  const isActive = (path) => location.pathname === path;

  return (
    <div className="sidebar">

      {/* ── Logo ── */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <Music2 size={20} />
        </div>
        <span>Beatify</span>
      </div>

      {/* ── Top nav: Home / Search / Discovery ── */}
      <div className="sb-top-nav">
        <NavLink to="/" className={({ isActive }) => `sb-nav-btn ${isActive ? 'active' : ''}`} end>
          <Home size={20} /> Головна
        </NavLink>
        <NavLink to="/search" className={({ isActive }) => `sb-nav-btn ${isActive ? 'active' : ''}`}>
          <Search size={20} /> Пошук
        </NavLink>
        <NavLink to="/discovery" className={({ isActive }) => `sb-nav-btn ${isActive ? 'active' : ''}`}>
          <Sparkles size={20} /> Discovery
        </NavLink>
      </div>

      {/* ── Library panel ── */}
      <div className="sb-library">

        {/* Library header */}
        <div className="sb-lib-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ListMusic size={20} style={{ color: 'var(--text-muted)' }} />
            <span className="sb-lib-title">Бібліотека</span>
          </div>
          {user && (
            <button className="sb-lib-add" onClick={createPlaylist} title="Створити плейлист">
              <Plus size={16} />
            </button>
          )}
        </div>

        {/* Filter chips */}
        {user && (
          <div className="sb-chips">
            <button className={`sb-chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Все</button>
            <button className={`sb-chip ${filter === 'playlists' ? 'active' : ''}`} onClick={() => setFilter('playlists')}>Плейлисти</button>
            <button className={`sb-chip ${filter === 'saved' ? 'active' : ''}`} onClick={() => setFilter('saved')}>Збережені</button>
          </div>
        )}

        {/* Spotify import progress */}
        {isImporting && (
          <div className="sb-import-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Loader2 size={14} style={{ animation: 'spin 1.5s linear infinite', color: 'var(--accent)' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>Spotify імпорт</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {playlistInfo?.name || 'Завантаження...'}
            </div>
            <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--accent)', width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`, transition: 'width 0.3s' }} />
            </div>
          </div>
        )}

        {/* Scrollable list */}
        <div className="sb-lib-list">

          {/* Pinned items — shown in 'all' and 'saved' filters */}
          {user && filter !== 'playlists' && (
            <>
              <NavLink to="/liked" className="sb-lib-item">
                <div className="sb-lib-item-cover" style={{ background: 'linear-gradient(135deg,#450af5,#c4efd9)' }}>
                  <Heart size={14} color="#fff" fill="#fff" />
                </div>
                <div className="sb-lib-item-info">
                  <div className="sb-lib-item-name" style={{ color: isActive('/liked') ? 'var(--accent)' : undefined }}>Вподобані треки</div>
                  <div className="sb-lib-item-sub">Плейліст</div>
                </div>
              </NavLink>

              <NavLink to="/history" className="sb-lib-item">
                <div className="sb-lib-item-cover" style={{ background: 'linear-gradient(135deg,#1e3a5f,#2d6a4f)' }}>
                  <Clock size={14} color="#fff" />
                </div>
                <div className="sb-lib-item-info">
                  <div className="sb-lib-item-name" style={{ color: isActive('/history') ? 'var(--accent)' : undefined }}>Історія</div>
                  <div className="sb-lib-item-sub">Нещодавно зіграно</div>
                </div>
              </NavLink>

              <NavLink to="/stats" className="sb-lib-item">
                <div className="sb-lib-item-cover" style={{ background: 'linear-gradient(135deg,#3d0c45,#6a1e8e)' }}>
                  <BarChart2 size={14} color="#fff" />
                </div>
                <div className="sb-lib-item-info">
                  <div className="sb-lib-item-name" style={{ color: isActive('/stats') ? 'var(--accent)' : undefined }}>Статистика</div>
                  <div className="sb-lib-item-sub">Твоя активність</div>
                </div>
              </NavLink>

              {/* Separator before playlists */}
              {playlists.length > 0 && (
                <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '6px 0' }} />
              )}
            </>
          )}

          {/* User playlists — shown in 'all' and 'playlists' filters */}
          {user && filter !== 'saved' && playlists.map(pl => (
            <div
              key={pl.id}
              className={`sb-lib-item ${location.pathname === `/playlist/${pl.id}` ? 'active' : ''}`}
              onClick={() => navigate(`/playlist/${pl.id}`)}
            >
              <div className="sb-lib-item-cover" style={{ background: 'linear-gradient(135deg, rgba(29,185,84,0.4), rgba(99,102,241,0.4))' }}>
                <Music2 size={14} color="rgba(255,255,255,0.8)" />
              </div>
              <div className="sb-lib-item-info">
                <div className="sb-lib-item-name" style={{ color: location.pathname === `/playlist/${pl.id}` ? 'var(--accent)' : undefined }}>
                  {pl.title}
                </div>
                <div className="sb-lib-item-sub">Плейліст</div>
              </div>
            </div>
          ))}

          {/* Empty state */}
          {user && playlists.length === 0 && filter !== 'saved' && (
            <div style={{ padding: '16px 12px', textAlign: 'center' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 4px' }}>Плейлистів поки немає</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>Створи свій перший плейліст</p>
              <button onClick={createPlaylist} style={{ padding: '8px 16px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Створити плейліст
              </button>
            </div>
          )}

          {!user && (
            <div style={{ padding: '16px 12px' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 4px' }}>Створюй плейлисти</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>Увійди, щоб бачити свої плейлисти</p>
              <button onClick={() => navigate('/login')} style={{ padding: '8px 16px', borderRadius: 20, border: 'none', background: '#fff', color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Увійти
              </button>
            </div>
          )}
        </div>

      </div>

      {/* ── Extra nav: icon row ── */}
      {user && (
        <div className="sb-extra-row">
          <NavLink to="/listen-together" className={({ isActive }) => `sb-extra-btn ${isActive ? 'active' : ''}`} title="Слухати разом">
            <Users size={17} />
          </NavLink>
          <NavLink to="/quiz" className={({ isActive }) => `sb-extra-btn ${isActive ? 'active' : ''}`} title="Вікторина">
            <Gamepad2 size={17} />
          </NavLink>
          <NavLink to="/karaoke" className={({ isActive }) => `sb-extra-btn ${isActive ? 'active' : ''}`} title="Karaoke Studio">
            <Mic size={17} />
          </NavLink>
          {isElectron && (
            <NavLink to="/offline" className={({ isActive }) => `sb-extra-btn ${isActive ? 'active' : ''}`} title="Офлайн">
              <WifiOff size={17} />
              {offlineCount > 0 && <span className="sb-extra-badge">{offlineCount}</span>}
            </NavLink>
          )}
        </div>
      )}

      {/* ── Bottom: user row ── */}
      <div className="sb-bottom">
        {user?.role === 'admin' && (
          <NavLink to="/admin" className={({ isActive }) => `sb-bottom-btn ${isActive ? 'active' : ''}`}>
            <Shield size={16} />
            <span>Адмін</span>
          </NavLink>
        )}
        {user ? (
          <div className="sb-user-row" onClick={() => navigate('/profile')} title="Профіль">
            <div className="sb-user-avatar">
              {user.name?.charAt(0).toUpperCase()}
            </div>
            <span className="sb-user-name">{user.name}</span>
            <button className="sb-user-logout" onClick={e => { e.stopPropagation(); handleLogout(); }} title="Вийти">
              <LogOut size={15} />
            </button>
          </div>
        ) : (
          <NavLink to="/login" className="sb-bottom-btn">
            <User size={16} /> <span>Увійти</span>
          </NavLink>
        )}
      </div>

    </div>
  );
}
