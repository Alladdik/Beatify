import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { playlistsApi, fileUrl } from '../api';
import { TrackRow } from '../components/TrackComponents';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import { Play, Pause, Edit2, Trash2, Music2, Lock, Globe, GripVertical, Users, Share2, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import * as signalR from '@microsoft/signalr';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableTrackRow({ track, index, queue, canEdit, onRemove }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: String(track.id) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
  };

  return (
    <div ref={setNodeRef} style={style}>
      {canEdit && (
        <div
          {...attributes}
          {...listeners}
          style={{
            position: 'absolute',
            left: -24,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-muted)',
            cursor: 'grab',
            display: 'flex',
            alignItems: 'center',
            padding: 4,
            zIndex: 1,
          }}
          title="Перетягнути"
        >
          <GripVertical size={16} />
        </div>
      )}
      <TrackRow track={track} index={index} queue={queue} />
      {canEdit && (
        <button
          onClick={() => onRemove(track.id)}
          style={{
            position: 'absolute',
            right: 80,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            opacity: 0,
          }}
          className="remove-track-btn"
          title="Видалити"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export default function PlaylistPage() {
  const { id } = useParams();
  const { user } = useAuthStore();
  const { currentTrack, isPlaying, setTrack, togglePlay } = usePlayerStore();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [localTracks, setLocalTracks] = useState(null);
  const [viewers, setViewers] = useState([]);
  const [copied, setCopied] = useState(false);
  const hubRef = useRef(null);

  useEffect(() => {
    if (!id) return;
    const hub = new signalR.HubConnectionBuilder()
      .withUrl(`http://${window.location.hostname}:5000/hubs/collaborative`, {
        skipNegotiation: true,
        transport: signalR.HttpTransportType.WebSockets,
      })
      .withAutomaticReconnect()
      .build();
    hubRef.current = hub;

    hub.on('ViewersUpdated', (list) => setViewers(list || []));
    hub.on('PlaylistChanged', () => {
      qc.invalidateQueries(['playlist', id]);
      qc.invalidateQueries(['playlistTracks', id]);
    });

    hub.start().then(() => {
      hub.invoke('JoinPlaylist', id, user?.name || 'Гість').catch(console.error);
    }).catch(console.error);

    return () => {
      hub.invoke('LeavePlaylist', id).catch(() => {}).finally(() => hub.stop());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const { data: pl, isLoading: plLoading } = useQuery({
    queryKey: ['playlist', id],
    queryFn: () => playlistsApi.getById(id).then(r => r.data),
  });

  const { data: fetchedTracks = [], isLoading: tracksLoading } = useQuery({
    queryKey: ['playlistTracks', id],
    queryFn: () => playlistsApi.getTracks(id).then(r => r.data),
  });

  React.useEffect(() => {
    if (fetchedTracks.length > 0 || localTracks === null) {
      setLocalTracks(fetchedTracks);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchedTracks]);

  const tracks = localTracks ?? fetchedTracks;
  const isOwner = user && pl && user.id === pl.userId;
  const canEdit = isOwner || pl?.isCollaborative;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tracks.findIndex(t => String(t.id) === active.id);
    const newIndex = tracks.findIndex(t => String(t.id) === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(tracks, oldIndex, newIndex);
    setLocalTracks(reordered);

    try {
      await playlistsApi.reorder(id, reordered.map(t => t.id));
    } catch {
      toast.error('Не вдалося зберегти порядок');
      setLocalTracks(fetchedTracks);
    }
  };

  const handlePlay = () => {
    if (!tracks.length) return;
    if (currentTrack && tracks.some(t => t.id === currentTrack.id)) togglePlay();
    else setTrack(tracks[0], tracks, 0);
  };

  const handleDelete = async () => {
    if (!confirm('Видалити плейлист?')) return;
    await playlistsApi.delete(id);
    qc.invalidateQueries(['myPlaylists']);
    navigate('/');
    toast.success('Плейлист видалено');
  };

  const handleSaveEdit = async () => {
    if (!editTitle.trim()) return;
    await playlistsApi.update(id, { title: editTitle, description: editDesc });
    qc.invalidateQueries(['playlist', id]);
    qc.invalidateQueries(['myPlaylists']);
    setEditing(false);
    toast.success('Плейлист оновлено');
  };

  const handleToggleCollaborative = async () => {
    if (!isOwner) return;
    const newVal = !pl.isCollaborative;
    await playlistsApi.update(id, { isCollaborative: newVal });
    qc.invalidateQueries(['playlist', id]);
    toast.success(newVal ? '🤝 Спільний доступ увімкнено! Друзі можуть додавати треки.' : '🔒 Спільний доступ вимкнено.');
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    toast.success('🔗 Посилання на спільний плейлист скопійовано!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRemoveTrack = async (trackId) => {
    await playlistsApi.removeTrack(id, trackId);
    qc.invalidateQueries(['playlistTracks', id]);
    qc.invalidateQueries(['playlist', id]);
    setLocalTracks(null);
    toast.success('Трек видалено з плейлиста');
    if (hubRef.current?.state === signalR.HubConnectionState.Connected) {
      hubRef.current.invoke('PlaylistChanged', id, 'tracksChanged', {}).catch(() => {});
    }
  };

  if (plLoading) return (
    <div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
    </div>
  );

  const isPlayingThis = currentTrack && tracks.some(t => t.id === currentTrack.id) && isPlaying;

  return (
    <div className="main-content">
      <div style={{ background: 'linear-gradient(135deg, #10b981, #06b6d4, #4338ca)', padding: '48px 32px 32px', display: 'flex', alignItems: 'flex-end', gap: 24 }}>
        <div style={{ width: 200, height: 200, background: 'rgba(0,0,0,0.3)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
          <Music2 size={80} color="rgba(255,255,255,0.7)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', background: 'rgba(255,255,255,0.2)', padding: '3px 10px', borderRadius: 100 }}>
              Плейлист
            </span>
            {pl?.isCollaborative && (
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', background: 'linear-gradient(135deg,#10b981,#06b6d4)', color: '#000', padding: '3px 10px', borderRadius: 100, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Users size={12} /> Спільний Плейлист
              </span>
            )}
          </div>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 8, maxWidth: 400 }}>
              <input className="form-input" value={editTitle} onChange={e => setEditTitle(e.target.value)} style={{ fontSize: 24, fontWeight: 700, height: 44 }} placeholder="Назва плейліста" autoFocus />
              <textarea className="form-input" value={editDesc} onChange={e => setEditDesc(e.target.value)} style={{ height: 80, fontSize: 14, resize: 'none' }} placeholder="Опис плейліста" />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={handleSaveEdit}>Зберегти</button>
                <button className="btn btn-secondary" onClick={() => setEditing(false)}>Скасувати</button>
              </div>
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: 40, fontWeight: 900, marginBottom: 8, lineHeight: 1 }}>{pl?.title}</h1>
              {pl?.description && <p style={{ color: 'rgba(255,255,255,0.8)', marginBottom: 8, fontSize: 14 }}>{pl.description}</p>}
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, opacity: 0.8 }}>
            {pl?.isPublic ? <Globe size={14} /> : <Lock size={14} />}
            <span>Автор: <strong>{pl?.userName}</strong></span> • <span>{tracks.length} треків</span>
          </div>

          {/* Real-time viewers */}
          {viewers.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Онлайн разом:</span>
              {viewers.slice(0, 5).map((v, i) => (
                <div key={i} title={v.name}
                  style={{ width: 28, height: 28, borderRadius: '50%', background: `hsl(${(v.name?.charCodeAt(0) || 65) * 137 % 360},60%,50%)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', border: '2px solid rgba(0,0,0,0.5)', boxShadow: '0 0 8px rgba(0,0,0,0.3)' }}>
                  {(v.name?.[0] || '?').toUpperCase()}
                </div>
              ))}
              {viewers.length > 5 && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>+{viewers.length - 5}</span>}
            </div>
          )}
        </div>
      </div>

      <div className="content-body" style={{ paddingTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
          <button className="btn-play-large" onClick={handlePlay}>
            {isPlayingThis ? <Pause size={24} /> : <Play size={24} />}
          </button>

          {/* Share link button */}
          <button
            className="btn btn-secondary"
            onClick={handleCopyLink}
            style={{ fontSize: 13, padding: '8px 16px', gap: 6, borderRadius: 20 }}
          >
            {copied ? <Check size={16} color="#10b981" /> : <Share2 size={16} />}
            {copied ? 'Скопійовано!' : 'Поділитися плейлистом'}
          </button>

          {/* Toggle collaborative mode button for owner */}
          {isOwner && (
            <button
              className={`btn ${pl?.isCollaborative ? 'btn-primary' : 'btn-secondary'}`}
              onClick={handleToggleCollaborative}
              style={{ fontSize: 13, padding: '8px 16px', gap: 6, borderRadius: 20, background: pl?.isCollaborative ? 'linear-gradient(135deg,#10b981,#06b6d4)' : undefined, color: pl?.isCollaborative ? '#000' : undefined, fontWeight: 700 }}
              title="Дозволити друзям редагувати спільний плейлист"
            >
              <Users size={16} />
              {pl?.isCollaborative ? '🤝 Спільний доступ (увімкнено)' : '👥 Зробити спільним'}
            </button>
          )}

          {isOwner && (
            <>
              <button className="btn-icon" onClick={() => { setEditTitle(pl.title); setEditDesc(pl.description || ''); setEditing(true); }} title="Редагувати"><Edit2 size={18} /></button>
              <button className="btn-icon" onClick={handleDelete} title="Видалити" style={{ color: '#f87171' }}><Trash2 size={18} /></button>
            </>
          )}
        </div>

        {tracksLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div className="spinner" style={{ width: 32, height: 32 }} />
          </div>
        ) : tracks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
            <Music2 size={48} style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px' }}>Плейлист порожній</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{canEdit ? 'Шукайте пісні та додавайте їх у цей плейлист!' : 'Автор ще не додав треки.'}</p>
          </div>
        ) : canEdit ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={tracks.map(t => String(t.id))} strategy={verticalListSortingStrategy}>
              <div className="track-list" style={{ paddingLeft: 28 }}>
                {tracks.map((t, i) => (
                  <SortableTrackRow
                    key={t.id}
                    track={t}
                    index={i}
                    queue={tracks}
                    canEdit={canEdit}
                    onRemove={handleRemoveTrack}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="track-list">
            {tracks.map((t, i) => (
              <div key={t.id} style={{ position: 'relative' }}>
                <TrackRow track={t} index={i} queue={tracks} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
