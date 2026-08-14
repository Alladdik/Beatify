import React from 'react';
import { fileUrl } from '../api';
import { usePlayerStore } from '../store/playerStore';
import { tracksApi } from '../api';
import { Play, Pause, Heart, Music, MoreHorizontal, ListPlus, X } from 'lucide-react';
import { playlistsApi } from '../api';
import { useAuthStore } from '../store/authStore';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

function formatTime(s) {
  if (!s) return '0:00';
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export function TrackRow({ track, index, queue, onLikeChange }) {
  const { currentTrack, isPlaying, setTrack, togglePlay } = usePlayerStore();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isActive = currentTrack?.id === track.id;

  const handlePlay = (e) => {
    e.stopPropagation();
    if (isActive) togglePlay();
    else setTrack(track, queue || [track], queue ? queue.findIndex(t => t.id === track.id) : 0);
  };

  const [showPlaylistMenu, setShowPlaylistMenu] = React.useState(false);
  const [playlists, setPlaylists] = React.useState([]);

  const handleLike = async (e) => {
    e.stopPropagation();
    if (!user) { toast.error('Увійдіть для вподобань'); return; }
    try {
      await tracksApi.like(track.id);
      qc.invalidateQueries(['liked']);
      qc.invalidateQueries(['tracks']);
      if (onLikeChange) onLikeChange();
    } catch { toast.error('Помилка'); }
  };

  const openPlaylistMenu = async (e) => {
    e.stopPropagation();
    if (!user) { toast.error('Увійдіть для додавання в плейліст'); return; }
    try {
      const res = await playlistsApi.getAll();
      setPlaylists(res.data);
      setShowPlaylistMenu(true);
    } catch (err) { toast.error('Не вдалося завантажити плейлісти'); }
  };

  const handleAddToPlaylist = async (e, playlistId) => {
    e.stopPropagation();
    try {
      await playlistsApi.addTrack(playlistId, track.id);
      toast.success('Додано до плейліста');
      setShowPlaylistMenu(false);
    } catch (err) { toast.error('Помилка або вже є в плейлісті'); }
  };

  const cover = track.coverPath ? fileUrl('covers', track.coverPath) : null;

  return (
    <div className={`track-row ${isActive ? 'active' : ''}`} onDoubleClick={handlePlay} style={{ position: 'relative' }}>
      <div className="track-num">
        {isActive && isPlaying
          ? <div className="eq-bars"><div className="eq-bar"/><div className="eq-bar"/><div className="eq-bar"/></div>
          : <span>{index + 1}</span>
        }
        <button className="track-play-btn btn-icon" style={{ width: 28, height: 28 }} onClick={handlePlay}>
          {isActive && isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>
      </div>
      <div className="track-info">
        {cover
          ? <img src={cover} alt="" className="track-cover" />
          : <div className="track-cover" style={{ background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Music size={16} color="var(--text-muted)" /></div>
        }
        <div className="track-meta">
          <div className="track-title">{track.title}</div>
          <div className="track-artist">{track.artistName}</div>
        </div>
      </div>
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{track.albumTitle || '—'}</span>
      
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn-icon" onClick={openPlaylistMenu} title="Додати до плейліста">
          <ListPlus size={16} color="var(--text-muted)" />
        </button>
        <button className={`like-btn ${track.isLiked ? 'liked' : ''}`} onClick={handleLike}>
          <Heart size={16} fill={track.isLiked ? 'var(--accent)' : 'none'} />
        </button>
      </div>

      <span className="track-duration">{formatTime(track.duration)}</span>

      {showPlaylistMenu && (
        <div style={{
          position: 'absolute', right: 80, top: 40, background: 'var(--bg-elevated)', 
          border: '1px solid var(--border)', borderRadius: 8, padding: 8, zIndex: 10,
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)', width: 200
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Додати до...</span>
            <X size={14} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setShowPlaylistMenu(false); }} />
          </div>
          <div style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {playlists.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>Немає плейлістів</div>}
            {playlists.map(p => (
              <button key={p.id} onClick={(e) => handleAddToPlaylist(e, p.id)} style={{
                background: 'transparent', border: 'none', color: 'var(--text-secondary)', 
                textAlign: 'left', padding: '6px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 13
              }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                {p.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TrackCard({ track, queue, onClick }) {
  const { currentTrack, isPlaying, setTrack, togglePlay } = usePlayerStore();
  const isActive = currentTrack?.id === track.id;
  const cover = track.coverPath ? fileUrl('covers', track.coverPath) : null;

  const handlePlay = (e) => {
    e.stopPropagation();
    if (isActive) togglePlay();
    else setTrack(track, queue || [track], queue ? queue.findIndex(t => t.id === track.id) : 0);
  };

  return (
    <div className="card" onClick={onClick}>
      {cover
        ? <img src={cover} alt="" className="card-cover" />
        : <div className="card-cover" style={{ background: 'linear-gradient(135deg, var(--bg-elevated), var(--bg-hover))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Music size={32} color="var(--text-muted)" /></div>
      }
      <div className="card-title">{track.title}</div>
      <div className="card-sub">{track.artistName}</div>
      <button className="card-play" onClick={handlePlay}>
        {isActive && isPlaying ? <Pause size={20} /> : <Play size={20} />}
      </button>
    </div>
  );
}
