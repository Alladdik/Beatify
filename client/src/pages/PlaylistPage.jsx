import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { playlistsApi, tracksApi, fileUrl } from '../api';
import { TrackRow } from '../components/TrackComponents';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import { Play, Pause, Edit2, Trash2, Music2, Lock, Globe, GripVertical } from 'lucide-react';
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

function SortableTrackRow({ track, index, queue, isOwner, onRemove }) {
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
      {isOwner && (
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
      {isOwner && (
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
  const hubRef = useRef(null);

  useEffect(() => {
    if (!id) return;
    const hub = new signalR.HubConnectionBuilder()
      .withUrl('http://localhost:5000/hubs/collaborative', {
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

  // Sync localTracks when fresh data arrives (but not while user is dragging)
  React.useEffect(() => {
    if (fetchedTracks.length > 0 || localTracks === null) {
      setLocalTracks(fetchedTracks);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchedTracks]);

  // Use localTracks if available (after drag), else fetched
  const tracks = localTracks ?? fetchedTracks;

  const isOwner = user && pl && user.id === pl.userId;

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
      <div style={{ background: 'linear-gradient(135deg, #4a0e8f, #7c3aed, #4338ca)', padding: '48px 32px 32px', display: 'flex', alignItems: 'flex-end', gap: 24 }}>
        <div style={{ width: 200, height: 200, background: 'rgba(0,0,0,0.3)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Music2 size={80} color="rgba(255,255,255,0.6)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8, opacity: 0.7 }}>Плейлист</div>
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
              {pl?.description && <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 8, fontSize: 14 }}>{pl.description}</p>}
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, opacity: 0.7 }}>
            {pl?.isPublic ? <Globe size={14} /> : <Lock size={14} />}
            <span>{pl?.userName}</span> • <span>{tracks.length} треків</span>
          </div>
          {viewers.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Зараз переглядають:</span>
              {viewers.slice(0, 5).map((v, i) => (
                <div key={i} title={v.name}
                  style={{ width: 28, height: 28, borderRadius: '50%', background: `hsl(${(v.name?.charCodeAt(0) || 65) * 137 % 360},60%,50%)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', border: '2px solid var(--bg-base)' }}>
                  {(v.name?.[0] || '?').toUpperCase()}
                </div>
              ))}
              {viewers.length > 5 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>+{viewers.length - 5}</span>}
            </div>
          )}
        </div>
      </div>

      <div className="content-body" style={{ paddingTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <button className="btn-play-large" onClick={handlePlay}>
            {isPlayingThis ? <Pause size={24} /> : <Play size={24} />}
          </button>
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
            <p>Плейлист порожній. Додай треки з пошуку!</p>
          </div>
        ) : isOwner ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={tracks.map(t => String(t.id))} strategy={verticalListSortingStrategy}>
              <div className="track-list" style={{ paddingLeft: 28 }}>
                {tracks.map((t, i) => (
                  <SortableTrackRow
                    key={t.id}
                    track={t}
                    index={i}
                    queue={tracks}
                    isOwner={isOwner}
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
