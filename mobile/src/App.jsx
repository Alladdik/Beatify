import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import { usePlayerStore } from './store/playerStore';
import { useAlbumColor } from './hooks/useAlbumColor';
import { fileUrl } from './api';
import Sidebar from './components/Sidebar';
import Player from './components/Player';
import TitleBar from './components/TitleBar';
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import PlaylistPage from './pages/PlaylistPage';
import ArtistPage from './pages/ArtistPage';
import AlbumPage from './pages/AlbumPage';
import LikedPage from './pages/LikedPage';
import HistoryPage from './pages/HistoryPage';
import OfflinePage from './pages/OfflinePage';
import AdminPage from './pages/AdminPage';
import StatsPage from './pages/StatsPage';
import ListenTogetherPage from './pages/ListenTogetherPage';
import MusicQuizPage from './pages/MusicQuizPage';
import DiscoveryPage from './pages/DiscoveryPage';
import ProfilePage from './pages/ProfilePage';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import MiniPlayerPage from './pages/MiniPlayerPage';
import KaraokePage from './pages/KaraokePage';
import GlobalDownloadIndicator from './components/GlobalDownloadIndicator';
import './index.css';

// ── Dynamic background — updates CSS vars from album art ──────────────────────
function DynamicBackground() {
  const { currentTrack } = usePlayerStore();
  const cover = currentTrack
    ? currentTrack.isExternal
      ? currentTrack.thumbnail
      : fileUrl('covers', currentTrack.coverPath)
    : null;

  const color = useAlbumColor(cover);

  useEffect(() => {
    const root = document.documentElement;
    const { r, g, b } = color ?? { r: 32, g: 224, b: 112 };
    root.style.setProperty('--alb-c1', `rgba(${r},${g},${b},0.09)`);
    root.style.setProperty('--alb-c2', `rgba(${r},${g},${b},0.06)`);
    root.style.setProperty('--alb-c3', `rgba(${r},${g},${b},0.03)`);
  }, [color]);

  return null;
}


const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30000 } } });

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (adminOnly && user?.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

// ── Generate PNG icons via canvas and register Windows Thumbar ───────────────
function useThumbarIcons() {
  useEffect(() => {
    if (!window.electronAPI?.thumbarInit) return;

    function icon(draw, size = 20) {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      draw(ctx, size);
      return c.toDataURL('image/png');
    }

    const icons = {
      prev: icon((ctx, s) => {
        const m = s / 2;
        // Left bar
        ctx.fillRect(2, 3, 2.5, s - 6);
        // Left-pointing triangle
        ctx.beginPath();
        ctx.moveTo(s - 3, 3); ctx.lineTo(6, m); ctx.lineTo(s - 3, s - 3);
        ctx.closePath(); ctx.fill();
      }),
      play: icon((ctx, s) => {
        ctx.beginPath();
        ctx.moveTo(4, 2); ctx.lineTo(s - 2, s / 2); ctx.lineTo(4, s - 2);
        ctx.closePath(); ctx.fill();
      }),
      pause: icon((ctx, s) => {
        ctx.fillRect(3, 3, 5, s - 6);
        ctx.fillRect(s - 8, 3, 5, s - 6);
      }),
      next: icon((ctx, s) => {
        const m = s / 2;
        // Right bar
        ctx.fillRect(s - 4.5, 3, 2.5, s - 6);
        // Right-pointing triangle
        ctx.beginPath();
        ctx.moveTo(3, 3); ctx.lineTo(s - 6, m); ctx.lineTo(3, s - 3);
        ctx.closePath(); ctx.fill();
      }),
    };

    window.electronAPI.thumbarInit(icons).catch(() => {});
  }, []);
}

function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useThumbarIcons();

  useEffect(() => {
    if (!window.electronAPI) return;
    const unsub = window.electronAPI.onMediaKey((key) => {
      const s = usePlayerStore.getState();
      if (key === 'playpause') s.togglePlay();
      else if (key === 'next') s.next();
      else if (key === 'prev') s.prev();
      else if (key === 'stop') s.togglePlay();
    });
    return unsub;
  }, []);

  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  return (
    <div className={`app-layout ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <DynamicBackground />
      <TitleBar />
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            zIndex: 1000,
          }}
        />
      )}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} deferredPrompt={deferredPrompt} onInstall={handleInstallClick} />
      <Routes>
        <Route path="/" element={<HomePage deferredPrompt={deferredPrompt} onInstall={handleInstallClick} />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/artist/:id" element={<ArtistPage />} />
        <Route path="/album/:id" element={<AlbumPage />} />
        <Route path="/playlist/:id" element={<ProtectedRoute><PlaylistPage /></ProtectedRoute>} />
        <Route path="/liked" element={<ProtectedRoute><LikedPage /></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
        <Route path="/offline" element={<OfflinePage />} />
        <Route path="/stats" element={<ProtectedRoute><StatsPage /></ProtectedRoute>} />
        <Route path="/listen-together" element={<ProtectedRoute><ListenTogetherPage /></ProtectedRoute>} />
        <Route path="/quiz" element={<ProtectedRoute><MusicQuizPage /></ProtectedRoute>} />
        <Route path="/karaoke" element={<ProtectedRoute><KaraokePage /></ProtectedRoute>} />
        <Route path="/discovery" element={<DiscoveryPage />} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      <Player />
      <GlobalDownloadIndicator />
      {/* Mobile Navigation */}
      <nav className="mobile-nav">
        <NavLink to="/" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`} end>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>Головна</span>
        </NavLink>
        <NavLink to="/search" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <span>Пошук</span>
        </NavLink>
        <button
          onClick={() => setSidebarOpen(true)}
          className="mobile-nav-item"
          style={{ background: 'none', border: 'none', cursor: 'pointer', outline: 'none' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 5v14M6 5l2 14"/></svg>
          <span>Бібліотека</span>
        </button>
      </nav>
    </div>
  );
}

function SyncAuth() {
  const { syncFromStorage } = useAuthStore();
  useEffect(() => {
    syncFromStorage();
    const onFocus = () => syncFromStorage();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);
  return null;
}

// Bypass ngrok browser-warning page for <audio> src requests in PWA standalone mode
if (window.location.hostname.includes('ngrok')) {
  document.cookie = 'ngrok-skip-browser-warning=true; path=/; SameSite=Lax';
}

export default function App() {
  // Render standalone mini player when loaded with #miniplayer hash
  if (window.location.hash === '#miniplayer') {
    return <MiniPlayerPage />;
  }

  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <SyncAuth />
        <Toaster position="top-right" toastOptions={{
          style: { background: '#1a1a24', color: '#fff', border: '1px solid #27272a' },
          success: { iconTheme: { primary: '#1db954', secondary: '#000' } },
        }} />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/*" element={<AppLayout />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
