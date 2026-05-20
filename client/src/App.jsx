import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import { usePlayerStore } from './store/playerStore';
import { useAlbumColor } from './hooks/useAlbumColor';
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
      : currentTrack.coverPath
        ? `http://localhost:5000/uploads/covers/${currentTrack.coverPath}`
        : null
    : null;

  const color = useAlbumColor(cover);

  useEffect(() => {
    const root = document.documentElement;
    const { r, g, b } = color ?? { r: 48, g: 209, b: 88 };
    root.style.setProperty('--alb-c1', `rgba(${r},${g},${b},0.11)`);
    root.style.setProperty('--alb-c2', `rgba(${r},${g},${b},0.07)`);
    root.style.setProperty('--alb-c3', `rgba(${r},${g},${b},0.05)`);
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

function AppLayout() {
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

  return (
    <div className="app-layout">
      <DynamicBackground />
      <TitleBar />
      <Sidebar />
      <Routes>
        <Route path="/" element={<HomePage />} />
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
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          Головна
        </NavLink>
        <NavLink to="/search" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          Пошук
        </NavLink>
        <NavLink to="/liked" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
          Улюблене
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
          Історія
        </NavLink>
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
