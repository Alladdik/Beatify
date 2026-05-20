import React, { useState } from 'react';
import { downloadApi, artistsApi, albumsApi, fileUrl } from '../../api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Link2, Search, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const PLATFORMS = [
  { name: 'YouTube Music', color: '#ff0000', icon: '🎵', example: 'https://music.youtube.com/watch?v=...' },
  { name: 'YouTube',       color: '#ff0000', icon: '▶️', example: 'https://youtube.com/watch?v=...' },
  { name: 'SoundCloud',    color: '#ff5500', icon: '☁️', example: 'https://soundcloud.com/artist/track' },
  { name: 'Spotify',       color: '#1db954', icon: '🎧', example: 'https://open.spotify.com/track/...' },
  { name: 'Deezer',        color: '#a238ff', icon: '🎶', example: 'https://deezer.com/track/...' },
  { name: 'Bandcamp',      color: '#1da0c3', icon: '🏷️', example: 'https://artist.bandcamp.com/track/...' },
  { name: 'Vimeo',         color: '#1ab7ea', icon: '🎞️', example: 'https://vimeo.com/...' },
  { name: 'TikTok',        color: '#ff0050', icon: '🎤', example: 'https://tiktok.com/@user/video/...' },
];

export default function DownloadTab() {
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({ title: '', artistName: '', artistId: '', albumId: '', genre: '' });
  const [fetchLoading, setFetchLoading] = useState(false);
  const [dlLoading, setDlLoading] = useState(false);
  const [dlStatus, setDlStatus] = useState(null); // 'success' | 'error'
  const [error, setError] = useState('');

  const { data: artists = [] } = useQuery({ queryKey: ['artists'], queryFn: () => artistsApi.getAll().then(r => r.data) });
  const { data: albums = [] } = useQuery({ queryKey: ['albums'], queryFn: () => albumsApi.getAll().then(r => r.data) });

  const filteredAlbums = albums.filter(a => !form.artistId || a.artistId === parseInt(form.artistId));

  const handleFetchInfo = async () => {
    if (!url.trim()) return toast.error('Введіть URL');
    setFetchLoading(true);
    setInfo(null);
    setError('');
    setDlStatus(null);
    try {
      const res = await downloadApi.getInfo(url.trim());
      const d = res.data;
      setInfo(d);
      setForm(p => ({
        ...p,
        title: d.title || '',
        artistName: d.artist || '',
      }));
      toast.success('Інформацію отримано!');
    } catch (err) {
      const msg = err.response?.data?.message || 'Не вдалось отримати інформацію. Перевірте URL.';
      setError(msg);
      toast.error(msg);
    } finally {
      setFetchLoading(false);
    }
  };

  const handleDownload = async () => {
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
      toast.success(`✅ "${form.title}" завантажено до бібліотеки!`);
      // Reset
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

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleFetchInfo(); };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

      {/* Left: URL input + form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* URL Input Card */}
        <div className="admin-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg,#ff0000,#ff5500)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Download size={18} color="#fff" />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Імпорт з URL</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>YouTube, SoundCloud, Spotify та 1000+ сайтів</p>
            </div>
          </div>

          {/* URL field */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Link2 size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="form-input"
                style={{ paddingLeft: 38 }}
                placeholder="Вставте посилання на трек..."
                value={url}
                onChange={e => { setUrl(e.target.value); setInfo(null); setError(''); setDlStatus(null); }}
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
              {fetchLoading ? 'Завантаження...' : 'Перевірити'}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, color: '#ef4444', fontSize: 13 }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              {error}
            </div>
          )}

          {/* Info preview */}
          {info && (
            <div style={{ background: 'var(--bg-hover)', borderRadius: 10, padding: 14, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {info.thumbnail && (
                <img src={info.thumbnail} alt="" style={{ width: 64, height: 64, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{info.artist} {info.duration ? `• ${Math.floor(info.duration / 60)}:${(info.duration % 60).toString().padStart(2, '0')}` : ''}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span className="pill green" style={{ fontSize: 11 }}>✅ Готово до завантаження</span>
                </div>
              </div>
            </div>
          )}

          {/* Fields - shown only after info fetch */}
          {info && (
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
                    <label className="form-label">Ім'я нового виконавця</label>
                    <input className="form-input" value={form.artistName} onChange={e => setForm(p => ({ ...p, artistName: e.target.value }))} placeholder={info.artist || 'Ім\'я виконавця'} />
                  </div>
                )}
                {form.artistId && (
                  <div className="form-group">
                    <label className="form-label">Альбом</label>
                    <select className="form-select" value={form.albumId} onChange={e => setForm(p => ({ ...p, albumId: e.target.value }))}>
                      <option value="">Без альбому</option>
                      {filteredAlbums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Жанр</label>
                <input className="form-input" value={form.genre} onChange={e => setForm(p => ({ ...p, genre: e.target.value }))} placeholder="Pop, Rock, Hip-Hop..." />
              </div>

              <button
                className="btn btn-primary w-full"
                style={{ justifyContent: 'center', marginTop: 4 }}
                onClick={handleDownload}
                disabled={dlLoading}
              >
                {dlLoading
                  ? <><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> Завантаження...</>
                  : <><Download size={16} /> Додати до бібліотеки</>
                }
              </button>

              {dlStatus === 'success' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, color: 'var(--accent)', fontSize: 13 }}>
                  <CheckCircle2 size={16} /> Трек успішно додано до бібліотеки!
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right: Supported platforms */}
      <div>
        <div className="admin-card">
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Підтримувані платформи</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {PLATFORMS.map(p => (
              <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-hover)', borderRadius: 8, border: `1px solid rgba(255,255,255,0.04)` }}>
                <span style={{ fontSize: 20 }}>{p.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{p.example}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16, padding: '12px 14px', background: 'rgba(29,185,84,0.08)', border: '1px solid rgba(29,185,84,0.2)', borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>💡 Підказка</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Вставте будь-яке посилання на трек. yt-dlp автоматично розпізнає платформу, завантажить аудіо у MP3 та обкладинку.
              <br /><br />
              Підтримується <strong style={{ color: 'var(--text-secondary)' }}>1000+ сайтів</strong> включно з плейлистами та альбомами.
            </div>
          </div>
        </div>

        {/* Usage tips */}
        <div className="admin-card" style={{ marginTop: 0 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>🔗 Приклади посилань</h3>
          {[
            { platform: 'YouTube Music', url: 'https://music.youtube.com/watch?v=dQw4w9WgXcQ' },
            { platform: 'SoundCloud', url: 'https://soundcloud.com/user/track-name' },
            { platform: 'YouTube', url: 'https://youtu.be/dQw4w9WgXcQ' },
          ].map(ex => (
            <div key={ex.platform} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{ex.platform}</div>
              <div
                onClick={() => setUrl(ex.url)}
                style={{ fontSize: 12, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'monospace', background: 'var(--bg-hover)', padding: '6px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Link2 size={11} /> {ex.url}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
