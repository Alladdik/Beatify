import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { usePlayerStore } from '../store/playerStore';
import { playlistsApi, fileUrl } from '../api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useImportStore } from '../store/importStore';
import {
  Home, Search, Sparkles, Heart, Clock, BarChart2, Users, Gamepad2,
  Plus, Music2, LogOut, User, Shield, WifiOff, Loader2, ListMusic,
  ChevronRight, Mic, Download, X
} from 'lucide-react';
import { BeatifyLogo, NowPlayingBars } from './Icons';
import { useOfflineStore } from '../store/offlineStore';
import toast from 'react-hot-toast';

export default function Sidebar({ isOpen, onClose, deferredPrompt, onInstall }) {
  const { user, logout } = useAuthStore();
  const { currentTrack, isPlaying } = usePlayerStore();
  const offlineCount = useOfflineStore(s => Object.keys(s.downloadedTracks || {}).length);
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
      if (onClose) onClose();
      toast.success('Плейлист створено!');
    } catch { toast.error('Помилка'); }
  };

  const handleLogout = () => { logout(); navigate('/login'); if (onClose) onClose(); };

  const isActive = (path) => location.pathname === path;

  return (
    <div className={`sidebar ${isOpen ? 'open' : ''}`}>

      {/* Close button for Mobile drawer */}
      <button
        className="mobile-sidebar-close"
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 14,
          right: 14,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#fff',
          width: 36,
          height: 36,
          borderRadius: '50%',
          display: 'none',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 100
        }}
      >
        <X size={18} />
      </button>

      {/* ── Logo Header ── */}
      <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BeatifyLogo size={38} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="sidebar-logo-title" style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #ffffff 30%, #10b981 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Beatify
            </span>
            <span style={{ fontSize: 9, fontWeight: 800, color: '#10b981', letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.9 }}>
              MUSIC STREAMING
            </span>
          </div>
        </div>
      </div>

      {/* ── Top nav: Home / Search / Discovery ── */}
      <div className="sb-top-nav">
        <NavLink to="/" onClick={onClose} className={({ isActive }) => `sb-nav-btn ${isActive ? 'active' : ''}`} end>
          <Home size={20} /> Головна
        </NavLink>
        <NavLink to="/search" onClick={onClose} className={({ isActive }) => `sb-nav-btn ${isActive ? 'active' : ''}`}>
          <Search size={20} /> Пошук
        </NavLink>
        <NavLink to="/discovery" onClick={onClose} className={({ isActive }) => `sb-nav-btn ${isActive ? 'active' : ''}`}>
          <Sparkles size={20} /> Discovery
        </NavLink>
      </div>

      {/* ── Library panel ── */}
      <div className="sb-library">

        {/* Library header */}
        <div className="sb-lib-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ListMusic size={18} style={{ color: 'var(--text-muted)' }} />
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
              <NavLink to="/liked" onClick={onClose} className="sb-lib-item">
                <div className="sb-lib-item-cover" style={{ background: 'linear-gradient(135deg,#6366f1,#10b981)', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)' }}>
                  <Heart size={15} color="#fff" fill="#fff" />
                </div>
                <div className="sb-lib-item-info">
                  <div className="sb-lib-item-name" style={{ color: isActive('/liked') ? 'var(--accent)' : undefined }}>Вподобані треки</div>
                  <div className="sb-lib-item-sub">Плейліст</div>
                </div>
              </NavLink>

              <NavLink to="/history" onClick={onClose} className="sb-lib-item">
                <div className="sb-lib-item-cover" style={{ background: 'linear-gradient(135deg,#0f766e,#06b6d4)', boxShadow: '0 4px 12px rgba(6, 182, 212, 0.3)' }}>
                  <Clock size={15} color="#fff" />
                </div>
                <div className="sb-lib-item-info">
                  <div className="sb-lib-item-name" style={{ color: isActive('/history') ? 'var(--accent)' : undefined }}>Історія</div>
                  <div className="sb-lib-item-sub">Нещодавно зіграно</div>
                </div>
              </NavLink>

              <NavLink to="/stats" onClick={onClose} className="sb-lib-item">
                <div className="sb-lib-item-cover" style={{ background: 'linear-gradient(135deg,#7c3aed,#c084fc)', boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)' }}>
                  <BarChart2 size={15} color="#fff" />
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
              onClick={() => { navigate(`/playlist/${pl.id}`); if (onClose) onClose(); }}
            >
              <div className="sb-lib-item-cover" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.3), rgba(99,102,241,0.3))', border: '1px solid rgba(255,255,255,0.1)' }}>
                <Music2 size={15} color="rgba(255,255,255,0.9)" />
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
              <button onClick={() => { navigate('/login'); if (onClose) onClose(); }} style={{ padding: '8px 16px', borderRadius: 20, border: 'none', background: '#fff', color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Увійти
              </button>
            </div>
          )}
        </div>

      </div>

      {/* ── Extra nav: icon row ── */}
      {user && (
        <div className="sb-extra-row">
          <NavLink to="/listen-together" onClick={onClose} className={({ isActive }) => `sb-extra-btn ${isActive ? 'active' : ''}`} title="Слухати разом">
            <Users size={17} />
          </NavLink>
          <NavLink to="/quiz" onClick={onClose} className={({ isActive }) => `sb-extra-btn ${isActive ? 'active' : ''}`} title="Вікторина">
            <Gamepad2 size={17} />
          </NavLink>
          <NavLink to="/karaoke" onClick={onClose} className={({ isActive }) => `sb-extra-btn ${isActive ? 'active' : ''}`} title="Karaoke Studio">
            <Mic size={17} />
          </NavLink>
          {isElectron && (
            <NavLink to="/offline" onClick={onClose} className={({ isActive }) => `sb-extra-btn ${isActive ? 'active' : ''}`} title="Офлайн">
              <WifiOff size={17} />
              {offlineCount > 0 && <span className="sb-extra-badge">{offlineCount}</span>}
            </NavLink>
          )}
        </div>
      )}

      {/* ── Bottom: user row ── */}
      <div className="sb-bottom">
        {deferredPrompt && (
          <button
            onClick={() => { onInstall(); if (onClose) onClose(); }}
            className="sb-bottom-btn install-btn animate-pulse"
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(6,182,212,0.18))',
              border: '1px solid rgba(16,185,129,0.35)',
              color: 'var(--accent)',
              borderRadius: 12,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              marginBottom: 12,
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            <Download size={16} />
            <span>Встановити додаток</span>
          </button>
        )}

        {user?.role === 'admin' && (
          <NavLink to="/admin" onClick={onClose} className={({ isActive }) => `sb-bottom-btn ${isActive ? 'active' : ''}`} style={{ marginBottom: 6 }}>
            <Shield size={16} />
            <span>Адмін</span>
          </NavLink>
        )}
        {user ? (
          <div
            className="sb-user-row"
            onClick={() => { navigate('/profile'); if (onClose) onClose(); }}
            title="Профіль"
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div
                className="sb-user-avatar"
                style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)', border: '2px solid #10b981', boxShadow: '0 0 12px rgba(16, 185, 129, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#09090b', fontWeight: 800, fontSize: 14 }}
              >
                {user.avatarPath ? (
                  <img src={fileUrl('avatars', user.avatarPath)} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  user.name?.charAt(0).toUpperCase()
                )}
              </div>
              <span style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: '#10b981', border: '2px solid #09090b', boxShadow: '0 0 6px #10b981' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sb-user-name" style={{ fontSize: 13, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{user.role || 'Слухач'}</div>
            </div>
            <button
              className="sb-user-logout"
              onClick={e => { e.stopPropagation(); handleLogout(); }}
              title="Вийти"
              style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, padding: 6, color: '#a1a1aa', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <NavLink to="/login" onClick={onClose} className="sb-bottom-btn">
            <User size={16} /> <span>Увійти</span>
          </NavLink>
        )}
      </div>

    </div>
  );
}
