import React, { useState } from 'react';
import { spotifyApi, downloadApi } from '../../api';
import { useQueryClient } from '@tanstack/react-query';
import { Search, Download, Loader2, Music, CheckCircle2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

import { useImportStore } from '../../store/importStore';

export default function SpotifyImportTab() {
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const [clientId, setClientId] = useState(localStorage.getItem('spotify_client_id') || '');
  const [clientSecret, setClientSecret] = useState(localStorage.getItem('spotify_client_secret') || '');
  
  const [loading, setLoading] = useState(false);
  
  const { playlistInfo: playlist, isImporting: importing, progress, results, setPlaylistInfo, startImport, reset } = useImportStore();

  const handleFetch = async () => {
    if (!url || !clientId || !clientSecret) return toast.error('Заповніть всі поля');
    localStorage.setItem('spotify_client_id', clientId);
    localStorage.setItem('spotify_client_secret', clientSecret);
    
    setLoading(true);
    reset();
    try {
      const res = await spotifyApi.getPlaylist(url, clientId, clientSecret);
      setPlaylistInfo(res.data);
      toast.success('Плейлист знайдено!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Помилка отримання плейлиста');
    } finally {
      setLoading(false);
    }
  };

  const handleImportAll = async () => {
    if (!playlist || !playlist.tracks.length) return;
    await startImport(playlist.tracks, qc);
    toast.success(`Імпорт завершено!`);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      {/* Left: Configuration */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="admin-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg,#1db954,#15803d)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Music size={18} color="#fff" />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Spotify Імпорт</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Імпорт плейлистів зі Spotify</p>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Spotify API Client ID</label>
            <input className="form-input" value={clientId} onChange={e => setClientId(e.target.value)} placeholder="Вставте Client ID..." />
          </div>
          
          <div className="form-group">
            <label className="form-label">Spotify API Client Secret</label>
            <input className="form-input" type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)} placeholder="Вставте Client Secret..." />
          </div>
          
          <div className="form-group">
            <label className="form-label">URL Плейлиста</label>
            <input className="form-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://open.spotify.com/playlist/..." />
          </div>

          <button
            className="btn btn-secondary w-full"
            onClick={handleFetch}
            disabled={loading}
            style={{ justifyContent: 'center', marginTop: 8 }}
          >
            {loading ? <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Search size={16} />}
            {loading ? 'Аналізуємо...' : 'Отримати список треків'}
          </button>
          
          <div style={{ marginTop: 24, padding: '12px 14px', background: 'rgba(29,185,84,0.08)', border: '1px solid rgba(29,185,84,0.2)', borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>💡 Як отримати API ключі?</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              1. Перейдіть на <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" style={{color: 'var(--accent)'}}>developer.spotify.com</a><br />
              2. Створіть новий застосунок (Create App)<br />
              3. Скопіюйте Client ID та Client Secret та вставте їх сюди.
            </div>
          </div>
        </div>
      </div>

      {/* Right: Results */}
      <div>
        <div className="admin-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '600px' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>
            Список треків
            {playlist && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)', fontWeight: 'normal' }}>({playlist.total} треків)</span>}
          </h3>

          {!playlist && !loading && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Вставте URL та натисніть Отримати список
            </div>
          )}

          {playlist && (
            <>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{playlist.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Власник: {playlist.owner}</div>
              </div>
              
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {playlist.tracks.map((t, i) => {
                  const result = results.find(r => r.track.title === t.title && r.track.artist === t.artist);
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px', background: 'var(--bg-hover)', borderRadius: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 20 }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.artist}</div>
                      </div>
                      {result && result.status === 'success' && <CheckCircle2 size={16} color="var(--accent)" />}
                      {result && result.status === 'error' && <AlertCircle size={16} color="#ef4444" title={result.error} />}
                      {!result && importing && progress.current === i + 1 && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                    </div>
                  );
                })}
              </div>

              {importing ? (
                <div style={{ padding: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                    <span>Завантаження...</span>
                    <span>{progress.current} / {progress.total}</span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--accent)', width: `${(progress.current / progress.total) * 100}%`, transition: 'width 0.3s' }} />
                  </div>
                </div>
              ) : (
                <button
                  className="btn btn-primary w-full"
                  onClick={handleImportAll}
                  disabled={importing || results.length > 0}
                  style={{ justifyContent: 'center' }}
                >
                  <Download size={16} /> Імпортувати всі треки
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
