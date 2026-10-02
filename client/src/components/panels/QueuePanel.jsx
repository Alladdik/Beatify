import { useState } from 'react';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X, Shuffle, Wand2, Trash2, ListPlus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Cover from '../ui/Cover';
import { usePlayerStore } from '../../store/playerStore';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { usePlaylistActions } from '../../hooks/useLibrary';
import { discoverApi, playlistsApi } from '../../api';
import { formatTime, tracksLabel } from '../../lib/format';
import { sourceLabel, isExternal } from '../../lib/tracks';

function QueueItem({ id, track, index, current, onPlay, onRemove, onMenu }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const tag = sourceLabel(track);
  return (
    <div
      ref={setNodeRef}
      className={`qitem ${current ? 'current' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onContextMenu={(e) => { e.preventDefault(); onMenu(track, e.clientX, e.clientY); }}
    >
      <button className="ibtn sm qgrip" {...attributes} {...listeners} aria-label="Перетягнути"><GripVertical size={15} /></button>
      <button className="qmain" onClick={() => onPlay(index)}>
        <Cover track={track} style={{ width: 38 }} />
        <span className="qtext">
          <span className="qtitle trunc">{track.title}</span>
          <span className="qsub trunc">{tag && <span className="src" style={{ marginRight: 6 }}>{tag}</span>}{track.artistName}</span>
        </span>
      </button>
      <span className="mono muted qtime">{formatTime(track.duration)}</span>
      <button className="ibtn sm" onClick={() => onRemove(index)} aria-label="Прибрати з черги"><X size={15} /></button>
    </div>
  );
}

export default function QueuePanel() {
  const { queue, queueIndex, currentTrack, playQueue, removeFromQueue, moveInQueue, shuffleQueue, clearUpcoming, addBulkToQueue } = usePlayerStore();
  const user = useAuthStore((s) => s.user);
  const openMenu = useUiStore((s) => s.openTrackMenu);
  const { create } = usePlaylistActions();
  const [busy, setBusy] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = queue.map((_, i) => `q${i}`);
  const upcomingStart = queueIndex + 1;
  const upcoming = queue.slice(upcomingStart);

  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    moveInQueue(+String(active.id).slice(1), +String(over.id).slice(1));
  };

  const addSimilar = async () => {
    if (!currentTrack || isExternal(currentTrack) || busy) { toast('Схожі треки шукаються за треком із бібліотеки'); return; }
    setBusy(true);
    try {
      const res = await discoverApi.similar(currentTrack.id, 10);
      const have = new Set(queue.map((t) => t.id));
      const fresh = (res.data || []).filter((t) => !have.has(t.id));
      if (!fresh.length) toast('Нових схожих треків не знайшлося');
      else { addBulkToQueue(fresh); toast.success(`Додано ${fresh.length} схожих`); }
    } catch { toast.error('Не вдалося підібрати схожі'); }
    finally { setBusy(false); }
  };

  const saveAsPlaylist = async () => {
    const lib = queue.filter((t) => t.id != null);
    if (!lib.length) return;
    const pl = await create(`Черга · ${new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })}`);
    if (!pl) return;
    await Promise.all(lib.map((t) => playlistsApi.addTrack(pl.id, t.id).catch(() => null)));
    toast.success(`Збережено: ${tracksLabel(lib.length)} у «${pl.title}»`);
  };

  if (!queue.length) {
    return (
      <div className="empty" style={{ padding: 'var(--s-5)' }}>
        <div className="h2">Черга порожня</div>
        <p>Увімкніть будь-який трек або додайте його через меню «…».</p>
      </div>
    );
  }

  return (
    <div className="queue">
      <div className="queue-actions">
        <button className="btn sm" onClick={shuffleQueue} disabled={queue.length < 2}><Shuffle size={14} /> Перемішати</button>
        <button className="btn sm" onClick={addSimilar} disabled={busy}>{busy ? <Loader2 size={14} className="spin" /> : <Wand2 size={14} />} Схожі</button>
        {user && <button className="btn sm" onClick={saveAsPlaylist}><ListPlus size={14} /> У плейлист</button>}
      </div>

      {currentTrack && (
        <section className="queue-sec">
          <div className="label">Зараз грає</div>
          <div className="qitem current">
            <span style={{ width: 30 }} />
            <div className="qmain" style={{ cursor: 'default' }}>
              <Cover track={currentTrack} style={{ width: 38 }} />
              <span className="qtext">
                <span className="qtitle trunc accent">{currentTrack.title}</span>
                <span className="qsub trunc">{currentTrack.artistName}</span>
              </span>
            </div>
            <span className="mono muted qtime">{formatTime(currentTrack.duration)}</span>
          </div>
        </section>
      )}

      <section className="queue-sec">
        <div className="queue-sec-head">
          <span className="label">Далі · {upcoming.length}</span>
          {upcoming.length > 0 && <button className="btn ghost sm" onClick={clearUpcoming}><Trash2 size={13} /> Очистити</button>}
        </div>
        {upcoming.length === 0 && <p className="muted" style={{ fontSize: '0.85rem', padding: '6px 0' }}>Більше нічого немає. Спробуйте «Схожі» або увімкніть радіо.</p>}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {upcoming.map((t, k) => {
              const i = upcomingStart + k;
              return <QueueItem key={ids[i]} id={ids[i]} track={t} index={i} onPlay={(idx) => playQueue(queue, idx)} onRemove={removeFromQueue} onMenu={openMenu} />;
            })}
          </SortableContext>
        </DndContext>
      </section>

      {queueIndex > 0 && (
        <section className="queue-sec">
          <div className="label">Раніше</div>
          {queue.slice(0, queueIndex).slice(-8).map((t, k, arr) => {
            const i = queueIndex - arr.length + k;
            return (
              <div key={`h${i}`} className="qitem">
                <span style={{ width: 30 }} />
                <button className="qmain" onClick={() => playQueue(queue, i)}>
                  <Cover track={t} style={{ width: 38 }} />
                  <span className="qtext"><span className="qtitle trunc">{t.title}</span><span className="qsub trunc">{t.artistName}</span></span>
                </button>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
