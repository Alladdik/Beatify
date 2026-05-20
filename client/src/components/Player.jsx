import React, { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import { useOfflineStore } from '../store/offlineStore';
import { fileUrl, externalSearchApi, tracksApi } from '../api';
import FullscreenPlayer from './FullscreenPlayer';
import MidiVisualizer from './MidiVisualizer';
import DeviceSyncPanel from './DeviceSyncPanel';
import FloatingMiniPlayer from './FloatingMiniPlayer';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Shuffle, Repeat, Video, X, Heart, Music2, ListMusic, GripVertical, MoreHorizontal, MicVocal, Radio, Maximize2, CloudDownload, MonitorPlay, Keyboard, ArrowLeftRight, Timer, CheckCircle2, PictureInPicture2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function formatTime(s) {
  if (!s || isNaN(s)) return '0:00';
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

function parseLRC(lrc) {
  if (!lrc) return [];
  const lines = lrc.split('\n');
  const parsed = [];
  const timeRegex = /\[(\d{2}):(\d{2}(?:\.\d{2,3})?)\]/g;

  lines.forEach(line => {
    let match;
    const times = [];
    while ((match = timeRegex.exec(line)) !== null) {
      const min = parseInt(match[1], 10);
      const sec = parseFloat(match[2]);
      times.push(min * 60 + sec);
    }
    // Remove timestamps and metadata tags like [ar:Artist]
    const text = line.replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, '').replace(/\[[a-zA-Z]+:[^\]]*\]/g, '').trim();
    if (!text) return;

    if (times.length > 0) {
      times.forEach(t => parsed.push({ time: t, text }));
    } else {
      parsed.push({ time: 0, text }); // Lines without timestamp play at the start
    }
  });

  parsed.sort((a, b) => a.time - b.time);
  return parsed;
}

// ── Video Modal ───────────────────────────────────────────────────────────────
function VideoModal({ track, onClose }) {
  const { audio, isPlaying, togglePlay } = usePlayerStore();
  const videoRef = useRef(null);

  // Sync video with global audio time when opened (in case user opened mid-track)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // Use the same src as the audio element but let the video control its own time
    // They share the same stream URL, so video becomes the primary control
    v.volume = audio.volume;
    audio.pause();
    v.play().catch(() => {});
    return () => {
      // When closing, resume audio from video position
      audio.currentTime = v.currentTime;
      if (isPlaying) audio.play().catch(() => {});
    };
  }, []);

  const streamUrl = `http://localhost:5000/api/tracks/${track.id}/stream`;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 1000,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{ position: 'absolute', top: 20, right: 20 }}>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: 40, height: 40, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={20} />
        </button>
      </div>
      <div style={{ marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{track.title}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{track.artistName}</div>
      </div>
      <video
        ref={videoRef}
        src={streamUrl}
        controls
        autoPlay
        style={{ maxWidth: '90vw', maxHeight: '75vh', borderRadius: 12, background: '#000' }}
      />
    </div>
  );
}

// ── Lyrics Panel ─────────────────────────────────────────────────────────────
function LyricsPanel({ track, onClose }) {
  const { updateCurrentTrack, progress } = usePlayerStore();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [foundLyrics, setFoundLyrics] = useState('');
  const containerRef = useRef(null);

  const parsedLyrics = React.useMemo(() => parseLRC(track.lyrics || foundLyrics), [track.lyrics, foundLyrics]);
  const isSynced = parsedLyrics.length > 0 && parsedLyrics.some(line => line.time > 0);

  let activeIndex = -1;
  if (isSynced && progress !== undefined) {
    for (let i = 0; i < parsedLyrics.length; i++) {
      if (progress >= parsedLyrics[i].time) {
        activeIndex = i;
      } else {
        break;
      }
    }
  }

  useEffect(() => {
    if (activeIndex >= 0 && containerRef.current) {
      const activeEl = containerRef.current.querySelector(`[data-index="${activeIndex}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeIndex]);

  const [searchOptions, setSearchOptions] = useState([]);

  const searchLyrics = async () => {
    setLoading(true);
    setSearchOptions([]);
    try {
      const res = await externalSearchApi.fetchLyrics(track.artistName, track.title);
      if (res.data?.found) {
        if (res.data.options) {
          setSearchOptions(res.data.options);
        } else if (res.data.lyrics) {
          setFoundLyrics(res.data.lyrics);
        }
      } else {
        toast.error('Текст не знайдено');
      }
    } catch (e) {
      toast.error('Помилка пошуку');
    } finally {
      setLoading(false);
    }
  };

  const saveLyrics = async () => {
    try {
      const formData = new FormData();
      formData.append('Lyrics', foundLyrics);
      await tracksApi.update(track.id, formData);
      updateCurrentTrack({ lyrics: foundLyrics });
      setFoundLyrics('');
      toast.success('Текст збережено');
    } catch (e) {
      toast.error('Помилка збереження');
    }
  };

  return (
    <div style={{
      position: 'fixed', bottom: 'var(--player-height)', right: 0, width: 340, height: '60vh',
      background: 'var(--bg-elevated)', borderLeft: '1px solid var(--border)', borderTop: '1px solid var(--border)',
      borderRadius: '16px 0 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column', zIndex: 50
    }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Текст пісні</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{track.title}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
      </div>
      <div ref={containerRef} style={{ flex: 1, overflowY: 'auto', padding: '20px', lineHeight: 1.9, fontSize: 15, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', fontWeight: 400, scrollBehavior: 'smooth' }}>
        {track.lyrics || foundLyrics ? (
          <div>
            {!track.lyrics && foundLyrics && (
              <div style={{ marginBottom: 16 }}>
                <button style={{
                  background: 'var(--accent)', color: '#fff', border: 'none', padding: '8px 16px',
                  borderRadius: 20, fontWeight: 600, cursor: 'pointer', width: '100%'
                }} onClick={saveLyrics}>
                  Зберегти текст
                </button>
              </div>
            )}
            <div style={{ paddingBottom: '30vh' }}>
              {parsedLyrics.map((line, idx) => {
                const isActive = idx === activeIndex;
                return (
                  <div
                    key={idx}
                    data-index={idx}
                    style={{
                      opacity: isSynced ? (isActive ? 1 : 0.5) : 1,
                      color: isSynced && isActive ? 'var(--text-primary)' : 'inherit',
                      fontWeight: isSynced && isActive ? 600 : 'inherit',
                      transformOrigin: 'left center',
                      transform: isSynced && isActive ? 'scale(1.02)' : 'none',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                  >
                    {line.text || <br />}
                  </div>
                );
              })}
            </div>
          </div>
        ) : searchOptions.length > 0 ? (
          <div>
            <div style={{ marginBottom: 16, fontWeight: 600 }}>Знайдено кілька варіантів:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {searchOptions.map((opt, i) => (
                <div key={i} style={{ padding: 12, background: 'var(--bg-hover)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{opt.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{opt.artist}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, background: opt.isSynced ? 'rgba(29,185,84,0.2)' : 'rgba(255,255,255,0.1)', color: opt.isSynced ? 'var(--accent)' : 'var(--text-muted)', padding: '2px 6px', borderRadius: 4 }}>
                      {opt.isSynced ? 'Синхронізований' : 'Звичайний'}
                    </span>
                    <button style={{ background: 'var(--text-primary)', color: '#000', border: 'none', padding: '4px 12px', borderRadius: 12, cursor: 'pointer', fontWeight: 600, fontSize: 12 }} onClick={() => { setFoundLyrics(opt.lyrics); setSearchOptions([]); }}>
                      Вибрати
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', marginTop: 40 }}>
            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 16 }}>Текст пісні відсутній</div>
            {user?.role === 'admin' && !track.isExternal && (
              <button style={{
                background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border)',
                padding: '8px 16px', borderRadius: 20, fontWeight: 500, cursor: 'pointer'
              }} onClick={searchLyrics} disabled={loading}>
                {loading ? 'Шукаю...' : 'Шукати в інтернеті'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Queue Panel ───────────────────────────────────────────────────────────────
function SortableQueueItem({ track, index, isCurrent, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: track.id ?? `ext-${index}` });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const cover = track.isExternal
    ? track.thumbnail
    : track.coverPath ? `http://localhost:5000/uploads/covers/${track.coverPath}` : null;

  return (
    <div ref={setNodeRef} style={{ ...style, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
      background: isCurrent ? 'rgba(29,185,84,0.08)' : 'transparent',
      borderLeft: isCurrent ? '2px solid var(--accent)' : '2px solid transparent',
      transition: 'background 0.15s' }}>
      <button {...attributes} {...listeners}
        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'grab', padding: '2px 0', display: 'flex', flexShrink: 0 }}>
        <GripVertical size={16} />
      </button>
      <div style={{ width: 36, height: 36, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: 'var(--bg-elevated)' }}>
        {cover ? <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Music2 size={14} color="var(--text-muted)" /></div>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: isCurrent ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isCurrent ? 'var(--accent)' : 'var(--text-primary)' }}>{track.title}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.artistName}</div>
      </div>
      <button onClick={() => onRemove(index)}
        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, display: 'flex', opacity: 0.6, flexShrink: 0 }}
        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
        onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}>
        <X size={14} />
      </button>
    </div>
  );
}

function QueuePanel({ onClose }) {
  const { queue, queueIndex, currentTrack, shuffleQueue, addBulkToQueue } = usePlayerStore();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [radioLoading, setRadioLoading] = useState(false);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = queue.findIndex((t, i) => (t.id ?? `ext-${i}`) === active.id);
    const newIdx = queue.findIndex((t, i) => (t.id ?? `ext-${i}`) === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const newQueue = arrayMove(queue, oldIdx, newIdx);
    const newCurrentIdx = newQueue.findIndex(t => t.id === currentTrack?.id);
    usePlayerStore.setState({ queue: newQueue, queueIndex: newCurrentIdx >= 0 ? newCurrentIdx : queueIndex });
  };

  const handleRemove = (index) => {
    const newQueue = queue.filter((_, i) => i !== index);
    const newIdx = index < queueIndex ? queueIndex - 1 : index === queueIndex ? Math.min(queueIndex, newQueue.length - 1) : queueIndex;
    usePlayerStore.setState({ queue: newQueue, queueIndex: Math.max(0, newIdx) });
  };

  const handleRadio = async () => {
    if (!currentTrack?.id || radioLoading) return;
    setRadioLoading(true);
    try {
      const res = await externalSearchApi.radio(currentTrack.id, 8);
      const tracks = Array.isArray(res.data) ? res.data : [];
      if (!tracks.length) { toast('Немає схожих треків'); return; }
      addBulkToQueue(tracks);
      toast.success(`➕ Додано ${tracks.length} схожих треків`);
    } catch { toast.error('Помилка радіо'); }
    finally { setRadioLoading(false); }
  };

  const items = queue.map((t, i) => t.id ?? `ext-${i}`);

  // Separate: now playing + upcoming
  const upNext = queue.slice(queueIndex + 1);
  const played  = queue.slice(0, queueIndex);

  return (
    <div style={{
      position: 'fixed', bottom: 'var(--player-height)', right: 0, width: 340, height: '70vh',
      background: 'rgba(14,14,22,0.97)', backdropFilter: 'blur(40px)',
      borderLeft: '1px solid rgba(255,255,255,0.08)', borderTop: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '20px 0 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column', zIndex: 50,
      boxShadow: '-8px -8px 40px rgba(0,0,0,0.5)',
      animation: 'slideInRight 0.28s cubic-bezier(0.2,0.8,0.2,1)',
    }}>

      {/* Header */}
      <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ListMusic size={16} color="var(--accent)" /> Черга
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 2 }}>{queue.length} треків</span>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.07)', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', width: 28, height: 28, borderRadius: '50%', alignItems: 'center', justifyContent: 'center', transition: 'all 0.18s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
            <X size={14} />
          </button>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Shuffle queue */}
          <button
            onClick={() => { shuffleQueue(); toast('🔀 Чергу перемішано'); }}
            disabled={queue.length < 2}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)', color: queue.length < 2 ? 'var(--text-muted)' : 'var(--text-secondary)',
              fontSize: 12, fontWeight: 700, cursor: queue.length < 2 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'all 0.18s',
            }}
            onMouseEnter={e => { if (queue.length >= 2) { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff'; }}}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = queue.length < 2 ? 'var(--text-muted)' : 'var(--text-secondary)'; }}
          >
            <Shuffle size={13} /> Перемішати
          </button>

          {/* Radio / add similar */}
          <button
            onClick={handleRadio}
            disabled={!currentTrack?.id || radioLoading}
            title="Додати схожі треки"
            style={{
              flex: 1, padding: '8px 0', borderRadius: 10,
              border: '1px solid rgba(29,185,84,0.3)',
              background: 'rgba(29,185,84,0.08)', color: radioLoading ? 'var(--text-muted)' : 'var(--accent)',
              fontSize: 12, fontWeight: 700, cursor: (!currentTrack?.id || radioLoading) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'all 0.18s',
            }}
            onMouseEnter={e => { if (currentTrack?.id && !radioLoading) e.currentTarget.style.background = 'rgba(29,185,84,0.15)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(29,185,84,0.08)'; }}
          >
            {radioLoading
              ? <><div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Радіо...</>
              : <><Radio size={13} /> Радіо</>
            }
          </button>
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {queue.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 12 }}>
            <ListMusic size={36} style={{ opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: 14 }}>Черга порожня</p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 200 }}>Натисни «Радіо» щоб автоматично підібрати схожі треки</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items} strategy={verticalListSortingStrategy}>
              {/* Now playing */}
              {currentTrack && (
                <div style={{ padding: '10px 16px 4px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--accent)' }}>
                  ▶ Зараз грає
                </div>
              )}
              {queue.map((track, i) => {
                if (i === queueIndex - 1 && queueIndex > 0) {
                  return (
                    <React.Fragment key={`sep-${i}`}>
                      <SortableQueueItem key={track.id ?? `ext-${i}`} track={track} index={i} isCurrent={false} onRemove={handleRemove} />
                      <div style={{ padding: '6px 16px 2px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', marginTop: 4 }}>
                        ↓ Далі в черзі
                      </div>
                    </React.Fragment>
                  );
                }
                return (
                  <SortableQueueItem
                    key={track.id ?? `ext-${i}`}
                    track={track}
                    index={i}
                    isCurrent={i === queueIndex}
                    onRemove={handleRemove}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Footer */}
      {queue.length > 0 && (
        <div style={{ padding: '10px 16px 14px', borderTop: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, display: 'flex', gap: 8 }}>
          <button onClick={() => usePlayerStore.setState({ queue: [], queueIndex: 0 })}
            style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontWeight: 600, transition: 'all 0.18s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}>
            Очистити чергу
          </button>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      ` }} />
    </div>
  );
}

// ── More Menu ────────────────────────────────────────────────────────────────
function MoreMenu({ currentTrack, isPlaying, isRadio, toggleRadio, isVideo, showLyrics, setShowLyrics, showVideo, setShowVideo, showMidi, setShowMidi, showDeviceSync, setShowDeviceSync, showFullscreen, setShowFullscreen, showMiniPlayer, setShowMiniPlayer, isElectron, isDownloaded, isDownloading, downloadTrack }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const items = [];

  if (currentTrack) {
    items.push({
      icon: <MicVocal size={15} />,
      label: 'Текст пісні',
      active: showLyrics,
      action: () => { setShowLyrics(p => !p); setOpen(false); }
    });
    if (isVideo) items.push({
      icon: <Video size={15} />,
      label: 'Відео',
      active: showVideo,
      action: () => { setShowVideo(p => !p); setOpen(false); }
    });
    items.push({
      icon: <Radio size={15} />,
      label: isRadio ? 'Радіо: увімк.' : 'Радіо',
      active: isRadio,
      action: () => { toggleRadio(); setOpen(false); }
    });
    items.push({
      icon: <Maximize2 size={15} />,
      label: 'Повноекранний',
      active: showFullscreen,
      action: () => { setShowFullscreen(true); setOpen(false); }
    });
  }

  // Mini player — available in browser too (not just Electron)
  items.push({
    icon: <PictureInPicture2 size={15} />,
    label: 'Міні-плеєр',
    active: showMiniPlayer,
    action: () => {
      if (isElectron && window.electronAPI?.showMiniPlayer) {
        window.electronAPI.showMiniPlayer();
      } else {
        setShowMiniPlayer(p => !p);
      }
      setOpen(false);
    }
  });

  if (isElectron && currentTrack && !currentTrack.isExternal) {
    items.push({
      icon: isDownloaded(currentTrack.id) ? <CheckCircle2 size={15} /> : <CloudDownload size={15} />,
      label: isDownloaded(currentTrack.id) ? 'Завантажено' : 'Офлайн',
      active: isDownloaded(currentTrack.id),
      action: () => { downloadTrack(currentTrack); setOpen(false); }
    });
  }

  items.push({
    icon: <Keyboard size={15} />,
    label: 'MIDI',
    active: showMidi,
    action: () => { setShowMidi(p => !p); setOpen(false); }
  });

  items.push({
    icon: <ArrowLeftRight size={15} />,
    label: 'Передача пристрою',
    active: showDeviceSync,
    action: () => { setShowDeviceSync(p => !p); setOpen(false); }
  });

  const { sleepTimer, sleepTimerMinutes, setSleepTimer, clearSleepTimer } = usePlayerStore();
  const [sleepSub, setSleepSub] = useState(false);
  const SLEEP_OPTIONS = [5, 10, 15, 30, 45, 60];
  const [sleepRemaining, setSleepRemaining] = useState('');
  useEffect(() => {
    if (!sleepTimer) { setSleepRemaining(''); return; }
    const tick = () => {
      const diff = sleepTimer - Date.now();
      if (diff <= 0) { setSleepRemaining(''); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
      setSleepRemaining(`${m}:${s}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sleepTimer]);

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        className="btn-icon"
        onClick={() => setOpen(p => !p)}
        title="Більше"
        style={{ color: open ? 'var(--accent)' : undefined }}
      >
        <MoreHorizontal size={18} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 10px)', right: 0,
          width: 230, background: 'rgba(14,14,22,0.98)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14,
          boxShadow: '0 20px 56px rgba(0,0,0,0.7)', overflow: 'hidden',
          backdropFilter: 'blur(24px)', zIndex: 300,
          animation: 'eqIn 0.15s ease',
        }}>
          {/* Sleep timer section */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '4px 0' }}
              onClick={() => setSleepSub(p => !p)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ display: 'flex', color: sleepTimer ? 'var(--accent)' : 'rgba(255,255,255,0.5)', width: 20, justifyContent: 'center' }}>
                  <Timer size={15} />
                </span>
                <span style={{ fontSize: 13, fontWeight: 500, color: sleepTimer ? 'var(--accent)' : 'var(--text-primary)' }}>
                  Таймер сну {sleepRemaining ? `(${sleepRemaining})` : ''}
                </span>
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{sleepSub ? '▲' : '▼'}</span>
            </div>
            {sleepSub && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                {SLEEP_OPTIONS.map(m => (
                  <button key={m} onClick={() => { setSleepTimer(m); setSleepSub(false); }}
                    style={{ padding: '4px 10px', borderRadius: 8, border: sleepTimerMinutes === m && sleepTimer ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)', background: sleepTimerMinutes === m && sleepTimer ? 'rgba(29,185,84,0.15)' : 'rgba(255,255,255,0.05)', color: sleepTimerMinutes === m && sleepTimer ? 'var(--accent)' : 'var(--text-primary)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                    {m}хв
                  </button>
                ))}
                {sleepTimer && (
                  <button onClick={() => { clearSleepTimer(); setSleepSub(false); }}
                    style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                    <X size={11} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Action items */}
          {items.map((item, i) => (
            <button key={i} onClick={item.action}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', background: item.active ? 'rgba(29,185,84,0.08)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s' }}
              onMouseEnter={e => e.currentTarget.style.background = item.active ? 'rgba(29,185,84,0.15)' : 'rgba(255,255,255,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = item.active ? 'rgba(29,185,84,0.08)' : 'transparent'}
            >
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, color: item.active ? 'var(--accent)' : 'rgba(255,255,255,0.55)', flexShrink: 0 }}>{item.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: item.active ? 'var(--accent)' : 'var(--text-primary)', flex: 1 }}>{item.label}</span>
              {item.active && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Player ───────────────────────────────────────────────────────────────
export default function Player() {
  const {
    currentTrack, isPlaying, volume, progress, duration,
    isShuffle, isRepeat, isRadio, audio,
    togglePlay, next, prev, setVolume, seek,
    toggleShuffle, toggleRepeat, toggleRadio,
    setProgress, setDuration, setIsPlaying,
    sleepTimer, clearSleepTimer,
  } = usePlayerStore();

  const [showVideo, setShowVideo] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showMidi, setShowMidi] = useState(false);
  const [showDeviceSync, setShowDeviceSync] = useState(false);
  const [showMiniPlayer, setShowMiniPlayer] = useState(false);
  const [liked, setLiked] = useState(false);

  const { user } = useAuthStore();
  const { isDownloaded, isDownloading, downloadTrack } = useOfflineStore();
  const isElectron = !!window.electronAPI;

  useEffect(() => {
    const a = audio;
    const onTime = () => {
      setProgress(a.currentTime);
      // Sleep timer check
      const { sleepTimer: st, clearSleepTimer: clearST } = usePlayerStore.getState();
      if (st && Date.now() >= st) {
        a.pause();
        clearST();
      }
    };
    const onDur  = () => setDuration(a.duration);
    const onEnd  = async () => {
      if (isRepeat) { a.currentTime = 0; a.play(); return; }
      // Radio mode: fetch more tracks if near end of queue
      const { isRadio: radio, queue, queueIndex, currentTrack: ct } = usePlayerStore.getState();
      if (radio && queue.length - queueIndex <= 2 && ct?.id) {
        try {
          const { externalSearchApi: esApi } = await import('../api');
          const res = await esApi.radio(ct.id, 5);
          const newTracks = Array.isArray(res.data) ? res.data : [];
          if (newTracks.length) {
            usePlayerStore.setState(s => ({ queue: [...s.queue, ...newTracks] }));
          }
        } catch {}
      }
      next();
    };
    const onPlay  = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    a.addEventListener('timeupdate', onTime);
    a.addEventListener('durationchange', onDur);
    a.addEventListener('ended', onEnd);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('durationchange', onDur);
      a.removeEventListener('ended', onEnd);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
    };
  }, [audio, isRepeat, next, setDuration, setIsPlaying, setProgress]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          seek(Math.min(audio.currentTime + 10, duration));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seek(Math.max(audio.currentTime - 10, 0));
          break;
        case 'KeyM':
          e.preventDefault();
          setVolume(volume > 0 ? 0 : 0.8);
          break;
        case 'KeyN':
          e.preventDefault();
          next();
          break;
        case 'KeyB':
          e.preventDefault();
          prev();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, next, prev, seek, setVolume, audio, duration, volume]);

  // Sync state to Electron mini player
  useEffect(() => {
    if (!window.electronAPI?.setPlayerState) return;
    window.electronAPI.setPlayerState({ currentTrack, isPlaying, progress, volume }).catch?.(() => {});
  }, [currentTrack?.id, isPlaying]);

  const handleSeek = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * duration);
  };

  const cover = currentTrack?.isExternal
    ? currentTrack.thumbnail
    : (currentTrack?.coverPath ? fileUrl('covers', currentTrack.coverPath) : null);
  const isVideo = currentTrack?.mediaType === 'video' && !currentTrack?.isExternal;

  // Sync liked state when track changes
  useEffect(() => {
    setLiked(currentTrack?.isLiked ?? false);
  }, [currentTrack?.id]);

  const handleLike = async (e) => {
    e.stopPropagation();
    if (!user || !currentTrack?.id || currentTrack.isExternal) return;
    try {
      await tracksApi.like(currentTrack.id);
      setLiked(p => !p);
    } catch {}
  };

  return (
    <>
      {showVideo && currentTrack && isVideo && (
        <VideoModal track={currentTrack} onClose={() => setShowVideo(false)} />
      )}
      {showLyrics && currentTrack && (
        <LyricsPanel track={currentTrack} onClose={() => setShowLyrics(false)} />
      )}
      {showFullscreen && currentTrack && !showVideo && (
        <FullscreenPlayer onClose={() => setShowFullscreen(false)} />
      )}
      {showQueue && (
        <QueuePanel onClose={() => setShowQueue(false)} />
      )}
      {showMidi && (
        <MidiVisualizer onClose={() => setShowMidi(false)} />
      )}
      {showDeviceSync && (
        <DeviceSyncPanel onClose={() => setShowDeviceSync(false)} />
      )}
      {showMiniPlayer && currentTrack && (
        <FloatingMiniPlayer onClose={() => setShowMiniPlayer(false)} />
      )}

      <div className="player-bar" style={{ zIndex: showFullscreen ? 0 : 100 }}>

        {/* ── LEFT: cover + info + like ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <div
            className="player-track"
            onClick={() => { if (currentTrack) setShowFullscreen(true); }}
            style={{ cursor: currentTrack ? 'pointer' : 'default', minWidth: 0, flex: 1 }}
            title="Розгорнути плеєр"
          >
            {cover
              ? <img src={cover} alt="" className="player-cover" />
              : <div className="player-cover" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)' }}>
                  {isVideo ? <Video size={22} color="var(--text-muted)" /> : <Music2 size={22} color="var(--text-muted)" />}
                </div>
            }
            {currentTrack ? (
              <div className="player-track-info" style={{ minWidth: 0 }}>
                <div className="player-track-name">
                  {currentTrack.title}
                  {currentTrack.source === 'soundcloud' && (
                    <span style={{ marginLeft: 5, fontSize: 9, background: 'rgba(255,85,0,0.18)', color: '#ff7733', padding: '1px 5px', borderRadius: 4, fontWeight: 700, verticalAlign: 'middle' }}>SC</span>
                  )}
                  {currentTrack.source === 'youtube' && (
                    <span style={{ marginLeft: 5, fontSize: 9, background: 'rgba(255,0,0,0.18)', color: '#ff5555', padding: '1px 5px', borderRadius: 4, fontWeight: 700, verticalAlign: 'middle' }}>YT</span>
                  )}
                  {isVideo && (
                    <span style={{ marginLeft: 5, fontSize: 9, background: 'rgba(168,85,247,0.18)', color: 'var(--purple)', padding: '1px 5px', borderRadius: 4, fontWeight: 700, verticalAlign: 'middle' }}>VID</span>
                  )}
                </div>
                <div className="player-track-artist">{currentTrack.artistName}</div>
              </div>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>Виберіть трек</span>
            )}
          </div>

          {/* Like button */}
          {currentTrack && user && !currentTrack.isExternal && (
            <button
              className="btn-icon"
              onClick={handleLike}
              title={liked ? 'Прибрати з вподобаних' : 'Додати до вподобаних'}
              style={{ flexShrink: 0, color: liked ? 'var(--accent)' : 'var(--text-muted)', transition: 'color 0.2s, transform 0.15s' }}
            >
              <Heart size={17} fill={liked ? 'var(--accent)' : 'none'} />
            </button>
          )}
        </div>

        {/* Mobile quick controls */}
        <div className="mobile-player-controls" style={{ display: 'none' }}>
          <button className="btn-icon" onClick={(e) => { e.stopPropagation(); togglePlay(); }}>
            {isPlaying ? <Pause size={24} color="#fff" /> : <Play size={24} color="#fff" />}
          </button>
        </div>

        {/* ── CENTER: transport + seekbar ── */}
        <div className="player-controls">
          <div className="player-btns">
            <button className="btn-icon" onClick={toggleShuffle} title="Перемішати" style={{ color: isShuffle ? 'var(--accent)' : undefined }}>
              <Shuffle size={15} />
            </button>
            <button className="btn-icon" onClick={prev} title="Попередній">
              <SkipBack size={19} />
            </button>
            <button className="player-btn-main" onClick={togglePlay}>
              {isPlaying ? <Pause size={19} /> : <Play size={19} style={{ marginLeft: 2 }} />}
            </button>
            <button className="btn-icon" onClick={next} title="Наступний">
              <SkipForward size={19} />
            </button>
            <button className="btn-icon" onClick={toggleRepeat} title="Повтор" style={{ color: isRepeat ? 'var(--accent)' : undefined }}>
              <Repeat size={15} />
            </button>
          </div>
          <div className="progress-bar-wrap">
            <span>{formatTime(progress)}</span>
            <div className="progress-bar" onClick={handleSeek}>
              <div className="progress-fill" style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }} />
            </div>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* ── RIGHT: More menu + queue + volume ── */}
        <div className="player-right">
          <MoreMenu
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            isRadio={isRadio}
            toggleRadio={async () => {
              toggleRadio();
              if (!isRadio && currentTrack?.id) {
                try {
                  const res = await externalSearchApi.radio(currentTrack.id, 6);
                  const newTracks = Array.isArray(res.data) ? res.data : [];
                  if (newTracks.length) {
                    usePlayerStore.setState(s => ({ queue: [...s.queue, ...newTracks] }));
                    toast.success(`📻 Радіо: додано ${newTracks.length} схожих треків`);
                  }
                } catch { toast.error('Радіо: не вдалося знайти схожі треки'); }
              } else if (isRadio) {
                toast('Радіо вимкнено', { icon: '📻' });
              }
            }}
            isVideo={isVideo}
            showLyrics={showLyrics}
            setShowLyrics={setShowLyrics}
            showVideo={showVideo}
            setShowVideo={setShowVideo}
            showMidi={showMidi}
            setShowMidi={setShowMidi}
            showDeviceSync={showDeviceSync}
            setShowDeviceSync={setShowDeviceSync}
            showFullscreen={showFullscreen}
            setShowFullscreen={setShowFullscreen}
            showMiniPlayer={showMiniPlayer}
            setShowMiniPlayer={setShowMiniPlayer}
            isElectron={isElectron}
            isDownloaded={isDownloaded}
            isDownloading={isDownloading}
            downloadTrack={downloadTrack}
          />

          <button
            className="btn-icon"
            onClick={() => setShowQueue(p => !p)}
            title="Черга"
            style={{ color: showQueue ? 'var(--accent)' : undefined }}
          >
            <ListMusic size={16} />
          </button>

          {/* Divider */}
          <div className="player-right-divider" />

          {/* Volume */}
          <div className="volume-controls">
            <button className="btn-icon" onClick={() => setVolume(volume > 0 ? 0 : 0.8)}>
              {volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
            <input
              type="range" className="slider volume-slider"
              min="0" max="1" step="0.01"
              value={volume} onChange={e => setVolume(+e.target.value)}
              style={{
                background: `linear-gradient(to right, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.75) ${volume * 100}%, rgba(255,255,255,0.12) ${volume * 100}%, rgba(255,255,255,0.12) 100%)`
              }}
            />
          </div>
        </div>

      </div>
    </>
  );
}
