import { useState } from 'react';
import { downloadApi, artistsApi } from '../../api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Link2, Search, CheckCircle2, AlertCircle, Loader2, Disc, Music } from 'lucide-react';
import toast from 'react-hot-toast';

const PLATFORMS = [
  { name: 'YouTube Music', color: '#ff0000', icon: '🎵', example: 'https://music.youtube.com/playlist?list=...' },
  { name: 'YouTube',       color: '#ff0000', icon: '▶️', example: 'https://youtube.com/playlist?list=...' },
  { name: 'SoundCloud',    color: '#ff5500', icon: '☁️', example: 'https://soundcloud.com/artist/sets/album' },
  { name: 'Spotify',       color: 'var(--accent-text)', icon: '🎧', example: 'https://open.spotify.com/album/...' },
];

export default function DownloadTab() {
  const qc = useQueryClient();
  const [downloadMode, setDownloadMode] = useState('single'); // 'single' | 'playlist'
  const [url, setUrl] = useState('');
  
  // Single mode state
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({ title: '', artistName: '', artistId: '', albumId: '', genre: '' });

  // Playlist mode state
  const [playlistInfo, setPlaylistInfo] = useState(null);
  const [playlistForm, setPlaylistForm] = useState({ albumTitle: '', artistName: '', artistId: '', genre: '' });

  const [fetchLoading, setFetchLoading] = useState(false);
  const [dlLoading, setDlLoading] = useState(false);
  const [dlStatus, setDlStatus] = useState(null);
  const [error, setError] = useState('');

  const { data: artists = [] } = useQuery({ queryKey: ['artists'], queryFn: () => artistsApi.getAll().then(r => r.data) });


  const handleFetchInfo = async () => {
    if (!url.trim()) return toast.error('Введіть URL');
    setFetchLoading(true);
    setInfo(null);
    setPlaylistInfo(null);
    setError('');
    setDlStatus(null);

    try {
      if (downloadMode === 'playlist') {
        const res = await downloadApi.getPlaylistInfo(url.trim());
        const d = res.data;
        setPlaylistInfo(d);
        setPlaylistForm(p => ({
          ...p,
          albumTitle: d.title || '',
          artistName: d.artist || '',
        }));
        toast.success(`Знайдено альбом: ${d.title} (${d.totalTracks} треків)!`);
      } else {
        const res = await downloadApi.getInfo(url.trim());
        const d = res.data;
        setInfo(d);
        setForm(p => ({
          ...p,
          title: d.title || '',
          artistName: d.artist || '',
        }));
        toast.success('Інформацію отримано!');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Не вдалось отримати інформацію. Перевірте URL.';
      setError(msg);
      toast.error(msg);
    } finally {
      setFetchLoading(false);
    }
  };

  const handleDownloadSingle = async () => {
    if (!info) return toast.error('Спочатку отримайте інформацію');
    if (!form.title.trim()) return toast.error('Введіть назву треку');
    setDlLoading(true);
    setDlStatus(null);
    try {
      const payload = {
        url: url.trim(),
        title: form.title,
        artistName: form.artistId ? undefined : form.artistName,
        artistId: form.artistId ? parseInt(form.artistId) : undefined,
        albumId: form.albumId ? parseInt(form.albumId) : undefined,
        genre: form.genre || undefined,
      };
      await downloadApi.download(payload);
      qc.invalidateQueries(['allTracks']);
      qc.invalidateQueries(['trending']);
      qc.invalidateQueries(['newReleases']);
      setDlStatus('success');
      toast.success(`"${form.title}" завантажено до бібліотеки!`);
      setUrl(''); setInfo(null); setForm({ title: '', artistName: '', artistId: '', albumId: '', genre: '' });
    } catch (err) {
      const msg = err.response?.data?.message || 'Помилка завантаження';
      setDlStatus('error');
      setError(msg);
      toast.error(msg);
    } finally {
      setDlLoading(false);
    }
  };

  const handleDownloadPlaylist = async () => {
    if (!playlistInfo) return toast.error('Спочатку отримайте інформацію про альбом');
    setDlLoading(true);
    setDlStatus(null);
    try {
      const payload = {
        url: url.trim(),
        albumTitle: playlistForm.albumTitle || playlistInfo.title,
        artistName: playlistForm.artistId ? undefined : playlistForm.artistName,
        artistId: playlistForm.artistId ? parseInt(playlistForm.artistId) : undefined,
        genre: playlistForm.genre || undefined,
      };
      const res = await downloadApi.downloadPlaylist(payload);
      qc.invalidateQueries(['allTracks']);
      qc.invalidateQueries(['albums']);
      qc.invalidateQueries(['artists']);
      setDlStatus('success');
      toast.success(res.data.message || 'Альбом успішно скачано!');
      setUrl(''); setPlaylistInfo(null);
    } catch (err) {
      const msg = err.response?.data?.message || 'Помилка завантаження альбому';
      setDlStatus('error');
      setError(msg);
      toast.error(msg);
    } finally {
      setDlLoading(false);
    }
  };

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleFetchInfo(); };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 24 }}>

      {/* Left: URL input + form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Mode Switch Tabs */}
        <div style={{ display: 'flex', gap: 8, background: 'var(--bg-hover)', padding: 4, borderRadius: 12 }}>
          <button
            onClick={() => { setDownloadMode('single'); setInfo(null); setPlaylistInfo(null); setError(''); }}
            style={{
              flex: 1, padding: '8px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
              background: downloadMode === 'single' ? 'var(--accent)' : 'transparent',
              color: downloadMode === 'single' ? '#000' : 'var(--text-muted)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
            }}
          >
            <Music size={15} /> Окремий трек
          </button>
          <button
            onClick={() => { setDownloadMode('playlist'); setInfo(null); setPlaylistInfo(null); setError(''); }}
            style={{
              flex: 1, padding: '8px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
              background: downloadMode === 'playlist' ? 'var(--accent)' : 'transparent',
              color: downloadMode === 'playlist' ? '#000' : 'var(--text-muted)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
            }}
          >
            <Disc size={15} /> Повний альбом / Плейлист
          </button>
        </div>

        {/* URL Input Card */}
        <div className="admin-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg,#ff0000,#ff5500)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Download size={18} color="#fff" />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
                {downloadMode === 'playlist' ? 'Завантаження Альбому / Плейлиста' : 'Імпорт з URL'}
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                {downloadMode === 'playlist'
                  ? 'YouTube Playlist, Album, SoundCloud Sets та Spotify альбоми'
                  : 'YouTube, SoundCloud, Spotify та 1000+ сайтів'}
              </p>
            </div>
          </div>

          {/* URL field */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Link2 size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="form-input"
                style={{ paddingLeft: 38 }}
                placeholder={downloadMode === 'playlist' ? "Вставте посилання на плейлист/альбом..." : "Вставте посилання на трек..."}
                value={url}
                onChange={e => { setUrl(e.target.value); setInfo(null); setPlaylistInfo(null); setError(''); setDlStatus(null); }}
                onKeyDown={handleKeyDown}
              />
            </div>
            <button
              className="btn btn-secondary"
              onClick={handleFetchInfo}
              disabled={fetchLoading || !url.trim()}
              style={{ flexShrink: 0, gap: 6 }}
            >
              {fetchLoading
                ? <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
                : <Search size={16} />}
              {fetchLoading ? 'Сканування...' : 'Перевірити'}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'color-mix(in oklab, var(--danger) 10%, transparent)', border: '1px solid color-mix(in oklab, var(--danger) 30%, transparent)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, color: 'var(--danger)', fontSize: 13 }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              {error}
            </div>
          )}

          {/* Single track preview */}
          {downloadMode === 'single' && info && (
            <div style={{ background: 'var(--bg-hover)', borderRadius: 10, padding: 14, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {info.thumbnail && (
                <img src={info.thumbnail} alt="" style={{ width: 64, height: 64, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{info.artist} {info.duration ? `• ${Math.floor(info.duration / 60)}:${(info.duration % 60).toString().padStart(2, '0')}` : ''}</div>
                <span className="pill green" style={{ fontSize: 11 }}>Трек розпізнано</span>
              </div>
            </div>
          )}

          {/* Playlist preview */}
          {downloadMode === 'playlist' && playlistInfo && (
            <div style={{ background: 'var(--bg-hover)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                {playlistInfo.coverUrl && (
                  <img src={playlistInfo.coverUrl} alt="" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover' }} />
                )}
                <div>
                  <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{playlistInfo.title}</h4>
                  <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    Виконавець: {playlistInfo.artist} • {playlistInfo.totalTracks} треків
                  </p>
                </div>
              </div>

              {/* Playlist track items scroll */}
              <div style={{ maxHeight: 160, overflowY: 'auto', background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 8 }}>
                {playlistInfo.tracks?.map((t, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 6px', borderBottom: '1px solid color-mix(in oklab, var(--fg) 5%, transparent)' }}>
                    <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{idx + 1}. {t.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Single track form */}
          {downloadMode === 'single' && info && (
            <>
              <div className="form-group">
                <label className="form-label">Назва треку *</label>
                <input className="form-input" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Виконавець</label>
                  <select className="form-select" value={form.artistId} onChange={e => setForm(p => ({ ...p, artistId: e.target.value }))}>
                    <option value="">+ Новий виконавець</option>
                    {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                {!form.artistId && (
                  <div className="form-group">
                    <label className="form-label">Ім'я виконавця</label>
                    <input className="form-input" value={form.artistName} onChange={e => setForm(p => ({ ...p, artistName: e.target.value }))} />
                  </div>
                )}
              </div>

              <button
                className="btn btn-primary w-full"
                style={{ justifyContent: 'center', marginTop: 8 }}
                onClick={handleDownloadSingle}
                disabled={dlLoading}
              >
                {dlLoading
                  ? <><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> Завантаження...</>
                  : <><Download size={16} /> Додати трек до бібліотеки</>
                }
              </button>
            </>
          )}

          {/* Playlist form */}
          {downloadMode === 'playlist' && playlistInfo && (
            <>
              <div className="form-group">
                <label className="form-label">Назва Альбому *</label>
                <input className="form-input" value={playlistForm.albumTitle} onChange={e => setPlaylistForm(p => ({ ...p, albumTitle: e.target.value }))} />
              </div>

              <div className="form-group">
                <label className="form-label">Виконавець *</label>
                <input className="form-input" value={playlistForm.artistName} onChange={e => setPlaylistForm(p => ({ ...p, artistName: e.target.value }))} />
              </div>

              <button
                className="btn btn-primary w-full"
                style={{ justifyContent: 'center', marginTop: 8 }}
                onClick={handleDownloadPlaylist}
                disabled={dlLoading}
              >
                {dlLoading
                  ? <><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> Скачування альбому ({playlistInfo.totalTracks} треків)...</>
                  : <><Disc size={16} /> Завантажити весь альбом</>
                }
              </button>
            </>
          )}

          {dlStatus === 'success' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, color: 'var(--accent)', fontSize: 13 }}>
              <CheckCircle2 size={16} /> Успішно додано до вашої медіатеки!
            </div>
          )}
        </div>
      </div>

      {/* Right: Info & Platforms */}
      <div>
        <div className="admin-card">
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Підтримувані платформи</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {PLATFORMS.map(p => (
              <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-hover)', borderRadius: 8, border: `1px solid color-mix(in oklab, var(--fg) 4%, transparent)` }}>
                <span style={{ fontSize: 20 }}>{p.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{p.example}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
