import React, { useEffect, useState } from 'react';
import { useOfflineStore } from '../store/offlineStore';
import { usePlayerStore } from '../store/playerStore';
import { WifiOff, Music, Trash2, CloudDownload, HardDrive, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

function fmt(s) {
  if (!s) return '0:00';
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function fmtBytes(bytes) {
  if (!bytes) return '0 MB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function OfflinePage() {
  const { downloadedTracks, removeTrack, clearAll, getStats } = useOfflineStore();
  const { setTrack, currentTrack } = usePlayerStore();
  const [storageInfo, setStorageInfo] = useState(null);
  const isElectron = !!window.electronAPI;

  const tracks = Object.entries(downloadedTracks).map(([id, entry]) => ({ ...entry.metadata, _offlineEntry: entry, id: Number(id) }));
  const stats = getStats();

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getOfflineInfo().then(setStorageInfo).catch(() => {});
    }
  }, [downloadedTracks]);

  const handlePlay = (track) => {
    const offlineTracks = tracks;
    const idx = offlineTracks.findIndex(t => t.id === track.id);
    setTrack(track, offlineTracks, idx >= 0 ? idx : 0);
  };

  const handleRemove = async (trackId) => {
    await removeTrack(trackId);
    toast.success('Видалено з офлайн-бібліотеки');
  };

  const handleClearAll = async () => {
    if (!confirm('Видалити всі офлайн-треки? Файли будуть видалені з диска.')) return;
    await clearAll();
    setStorageInfo(null);
    toast.success('Офлайн-бібліотеку очищено');
  };

  return (
    <div className="main-content"><div style={{ padding: '32px 32px 100px' }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 12,
            background: 'linear-gradient(135deg, #0a84ff, #0040a0)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <WifiOff size={28} color="white" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Офлайн-бібліотека</h1>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>
              {stats.count} треків · {storageInfo ? fmtBytes(storageInfo.totalBytes) : ''}
            </p>
          </div>
        </div>

        {stats.count > 0 && (
          <button
            className="btn"
            onClick={handleClearAll}
            style={{ marginLeft: 'auto', gap: 8, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>
            <Trash2 size={14} />
            Очистити все
          </button>
        )}
      </div>

      {!isElectron && (
        <div style={{ padding: '20px 24px', background: 'rgba(255,160,0,0.1)', border: '1px solid rgba(255,160,0,0.3)', borderRadius: 12, marginBottom: 24 }}>
          <p style={{ margin: 0, fontSize: 14, color: '#ffa000' }}>
            ⚠️ Офлайн-режим доступний лише у Electron-додатку Beatify. В браузері завантаження треків не підтримується.
          </p>
        </div>
      )}

      {tracks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-muted)' }}>
          <CloudDownload size={64} style={{ opacity: 0.3, marginBottom: 16 }} />
          <p style={{ fontSize: 18, marginBottom: 8 }}>Немає офлайн-треків</p>
          <p style={{ fontSize: 14 }}>
            Натисніть <CloudDownload size={14} style={{ verticalAlign: 'middle' }} /> у плеєрі, щоб зберегти трек для офлайн-відтворення
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {tracks.map((track) => {
            const isPlaying = currentTrack?.id === track.id;
            const cover = track._offlineEntry?.coverUrl || null;

            return (
              <div
                key={track.id}
                className={`track-row ${isPlaying ? 'active' : ''}`}
                onClick={() => handlePlay(track)}>

                <div className="track-cover" style={{ position: 'relative' }}>
                  {cover ? (
                    <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Music size={20} color="var(--text-muted)" />
                    </div>
                  )}
                  <div style={{ position: 'absolute', bottom: 2, right: 2, width: 12, height: 12, borderRadius: '50%', background: '#0a84ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <WifiOff size={7} color="white" />
                  </div>
                </div>

                <div className="track-info">
                  <div className="track-meta">
                    <div className="track-title">{track.title}</div>
                    <div className="track-artist">
                      {track.artistName}
                      {track.albumTitle && ` · ${track.albumTitle}`}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
                  {new Date(track._offlineEntry?.downloadedAt).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })}
                </div>

                <div className="track-duration">{fmt(track.duration)}</div>

                <button
                  className="like-btn"
                  onClick={(e) => { e.stopPropagation(); handleRemove(track.id); }}
                  title="Видалити з офлайн">
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div></div>
  );
}
