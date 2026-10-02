import React, { Suspense, lazy, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from './store/authStore';
import { useUiStore } from './store/uiStore';
import { useDeviceStore } from './store/deviceStore';
import './store/themeStore';
import './store/likesStore';
import { useGlobalAccent } from './hooks/useAccent';
import { useShortcuts } from './hooks/useShortcuts';
import { useElectron } from './hooks/useElectron';
import Rail from './components/Rail';
import TabBar from './components/TabBar';
import TitleBar from './components/TitleBar';
import Dock from './components/Dock';
import Player from './components/Player';
import Overlays from './components/Overlays';
import GlobalDownloadIndicator from './components/GlobalDownloadIndicator';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import MiniPlayerPage from './pages/MiniPlayerPage';
import { needsServerSetup } from './lib/config';
import ServerSetup from './pages/ServerSetup';

// Heavy or rarely-visited routes are split out of the first bundle
const HomePage = lazy(() => import('./pages/HomePage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const ArtistPage = lazy(() => import('./pages/ArtistPage'));
const AlbumPage = lazy(() => import('./pages/AlbumPage'));
const PlaylistPage = lazy(() => import('./pages/PlaylistPage'));
const LikedPage = lazy(() => import('./pages/LikedPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const OfflinePage = lazy(() => import('./pages/OfflinePage'));
const StatsPage = lazy(() => import('./pages/StatsPage'));
const ListenTogetherPage = lazy(() => import('./pages/ListenTogetherPage'));
const MusicQuizPage = lazy(() => import('./pages/MusicQuizPage'));
const KaraokePage = lazy(() => import('./pages/KaraokePage'));
const StudioPage = lazy(() => import('./pages/StudioPage'));
const DiscoveryPage = lazy(() => import('./pages/DiscoveryPage'));
const LibraryPage = lazy(() => import('./pages/LibraryPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const MorePage = lazy(() => import('./pages/MorePage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const TrackSharePage = lazy(() => import('./pages/TrackSharePage'));
const MixPage = lazy(() => import('./pages/MixPage'));

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } },
});

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, isAuthenticated } = useAuthStore();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (adminOnly && user?.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

function PageLoader() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '60vh', color: 'var(--fg-3)' }} role="status" aria-label="Завантаження">
      <Loader2 className="spin" size={26} />
    </div>
  );
}

class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[ui]', error, info?.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page narrow">
        <div className="empty">
          <div className="h1">Щось зламалось</div>
          <p>Сторінка не змогла завантажитись. Музика не зупинилась — можна перейти на іншу сторінку або перезавантажити застосунок.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn primary" onClick={() => this.setState({ error: null })}>Спробувати знову</button>
            <button className="btn" onClick={() => { window.location.href = '/'; }}>На головну</button>
          </div>
          <pre className="mono muted" style={{ fontSize: '0.7rem', whiteSpace: 'pre-wrap' }}>{String(this.state.error?.message || this.state.error)}</pre>
        </div>
      </div>
    );
  }
}

function ScrollToTop({ sheet }) {
  const { pathname } = useLocation();
  useEffect(() => { sheet.current?.scrollTo({ top: 0, behavior: 'instant' }); }, [pathname, sheet]);
  return null;
}

function AppLayout() {
  const sheet = useRef(null);
  const token = useAuthStore((s) => s.token);
  const dockOpen = useUiStore((s) => !!s.dockTab);

  useGlobalAccent();
  useShortcuts();
  useElectron();

  // Handoff: register this device once signed in
  useEffect(() => {
    if (token) useDeviceStore.getState().connect();
    else useDeviceStore.getState().disconnect();
  }, [token]);

  return (
    <div className={`app ${dockOpen ? 'has-dock' : ''}`}>
      <a href="#main" className="skip">До змісту</a>
      <TitleBar />
      <Rail />
      <main className="sheet" id="main" ref={sheet} tabIndex={-1}>
        <ScrollToTop sheet={sheet} />
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/discovery" element={<DiscoveryPage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/artist/:id" element={<ArtistPage />} />
              <Route path="/album/:id" element={<AlbumPage />} />
              <Route path="/track/:id" element={<TrackSharePage />} />
              <Route path="/mix/:id" element={<MixPage />} />
              <Route path="/playlist/:id" element={<ProtectedRoute><PlaylistPage /></ProtectedRoute>} />
              <Route path="/liked" element={<ProtectedRoute><LikedPage /></ProtectedRoute>} />
              <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
              <Route path="/offline" element={<OfflinePage />} />
              <Route path="/stats" element={<ProtectedRoute><StatsPage /></ProtectedRoute>} />
              <Route path="/listen-together" element={<ProtectedRoute><ListenTogetherPage /></ProtectedRoute>} />
              <Route path="/quiz" element={<ProtectedRoute><MusicQuizPage /></ProtectedRoute>} />
              <Route path="/karaoke" element={<ProtectedRoute><KaraokePage /></ProtectedRoute>} />
              <Route path="/studio" element={<StudioPage />} />
              <Route path="/more" element={<MorePage />} />
              <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      <Dock />
      <Player />
      <TabBar />
      <GlobalDownloadIndicator />
      <Overlays />
    </div>
  );
}

function SyncAuth() {
  const syncFromStorage = useAuthStore((s) => s.syncFromStorage);
  const verifyToken = useAuthStore((s) => s.verifyToken);
  useEffect(() => {
    verifyToken();
    syncFromStorage();
    const onFocus = () => syncFromStorage();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [syncFromStorage, verifyToken]);
  return null;
}

// Bypass ngrok browser-warning page for <audio> requests in PWA standalone mode
if (window.location.hostname.includes('ngrok')) {
  document.cookie = 'ngrok-skip-browser-warning=true; path=/; SameSite=Lax';
}

export default function App() {
  // Electron's frameless mini window loads the same bundle with #miniplayer
  if (window.location.hash === '#miniplayer') return <MiniPlayerPage />;
  if (needsServerSetup) return <ServerSetup />;

  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <SyncAuth />
        <Toaster
          position="top-center"
          containerStyle={{ top: 'calc(var(--titlebar-h) + 12px)' }}
          toastOptions={{
            duration: 3200,
            style: {
              background: 'var(--bg-1)', color: 'var(--fg)', border: '1px solid var(--line-2)',
              borderRadius: 'var(--r-2)', fontSize: '0.85rem', boxShadow: 'var(--shadow-pop)', padding: '10px 14px',
            },
            success: { iconTheme: { primary: 'var(--accent)', secondary: 'var(--on-accent)' } },
            error: { iconTheme: { primary: 'var(--danger)', secondary: 'var(--bg)' } },
          }}
        />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/*" element={<AppLayout />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
