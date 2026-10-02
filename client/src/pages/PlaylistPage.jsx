import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Trash2, Share2, Users, Globe, Lock, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { playlistsApi, discoverApi, errMsg } from '../api';
import { buildHub, signalR } from '../lib/hubs';
import { fileUrl } from '../lib/config';
import { formatTotalDuration, tracksLabel } from '../lib/format';
import { useAuthStore } from '../store/authStore';
import { useCoverTint } from '../hooks/useAccent';
import { Collage } from '../components/ui/Cover';
import DetailHead, { PlayActions } from '../components/DetailHead';
import { TrackRow, RowsHead } from '../components/TrackRow';
import { Section, SkeletonRows, EmptyState } from '../components/Section';

function SortableRow({ track, index, queue, canEdit, context }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: String(track.id), disabled: !canEdit });
  const grip = canEdit ? (
    <button className="ibtn sm hover-only desk" style={{ cursor: 'grab', touchAction: 'none' }} aria-label="Перетягнути" {...attributes} {...listeners}><GripVertical size={16} /></button>
  ) : null;
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, position: 'relative', zIndex: isDragging ? 5 : undefined }}>
      <TrackRow track={track} index={index} queue={queue} context={context} extraAction={grip} />
    </div>
  );
}

function EditModal({ pl, onClose, onSave }) {
  const [title, setTitle] = useState(pl.title);
  const [desc, setDesc] = useState(pl.description || '');
  const [isPublic, setPublic] = useState(pl.isPublic);
  const [collab, setCollab] = useState(pl.isCollaborative);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    await onSave({ title: title.trim(), description: desc.trim(), isPublic: isPublic || collab, isCollaborative: collab });
    setBusy(false);
  };
  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit} role="dialog" aria-label="Редагувати плейлист">
        <div className="modal-head"><span className="h2">Редагувати плейлист</span><button type="button" className="ibtn" onClick={onClose} aria-label="Закрити"><X size={18} /></button></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          <div className="field"><label htmlFor="pl-title">Назва</label><input id="pl-title" className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} autoFocus /></div>
          <div className="field"><label htmlFor="pl-desc">Опис</label><textarea id="pl-desc" className="textarea" value={desc} maxLength={500} onChange={(e) => setDesc(e.target.value)} /></div>
          <label className="mode"><span className="mode-text"><span className="mode-name">Публічний</span><span className="mode-note">Його можна знайти в пошуку й відкрити за посиланням</span></span><span className="switch"><input type="checkbox" checked={isPublic || collab} disabled={collab} onChange={(e) => setPublic(e.target.checked)} /><i /></span></label>
          <label className="mode"><span className="mode-text"><span className="mode-name">Спільний</span><span className="mode-note">Усі, хто увійшов, можуть додавати й прибирати треки</span></span><span className="switch"><input type="checkbox" checked={collab} onChange={(e) => setCollab(e.target.checked)} /><i /></span></label>
        </div>
        <div className="modal-foot"><button type="button" className="btn" onClick={onClose}>Скасувати</button><button className="btn primary" disabled={busy || !title.trim()}>Зберегти</button></div>
      </form>
    </div>
  );
}

export default function PlaylistPage() {
  const { id } = useParams();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useState(null);
  const [viewers, setViewers] = useState([]);
  const hub = useRef(null);

  const pl = useQuery({ queryKey: ['playlist', id], queryFn: () => playlistsApi.getById(id).then((r) => r.data), retry: false });
  const fetched = useQuery({ queryKey: ['playlistTracks', id], queryFn: () => playlistsApi.getTracks(id).then((r) => r.data), retry: false });

  useEffect(() => { setOrder(null); }, [fetched.data]);
  const tracks = order ?? fetched.data ?? [];
  const p = pl.data;
  const isOwner = !!user && !!p && user.id === p.userId;
  const canEdit = isOwner || (!!user && !!p?.isCollaborative);
  const covers = useMemo(() => [...new Set(tracks.map((t) => t.coverPath).filter(Boolean))].slice(0, 4).map((c) => fileUrl('covers', c)), [tracks]);
  const tint = useCoverTint(covers[0]);
  const total = tracks.reduce((s, t) => s + (t.duration || 0), 0);

  // Live presence + remote edits
  useEffect(() => {
    if (!id) return;
    const h = buildHub('collaborative');
    hub.current = h;
    h.on('ViewersUpdated', (list) => setViewers(list || []));
    h.on('PlaylistChanged', () => {
      qc.invalidateQueries({ queryKey: ['playlistTracks', id] });
      qc.invalidateQueries({ queryKey: ['playlist', id] });
    });
    h.start().then(() => h.invoke('JoinPlaylist', String(id), user?.name || 'Гість')).catch(() => {});
    return () => { h.invoke('LeavePlaylist', String(id)).catch(() => {}).finally(() => h.stop()); };
  }, [id, qc, user?.name]);

  const notify = () => {
    if (hub.current?.state === signalR.HubConnectionState.Connected) hub.current.invoke('PlaylistChanged', String(id), 'tracksChanged', {}).catch(() => {});
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const from = tracks.findIndex((t) => String(t.id) === active.id);
    const to = tracks.findIndex((t) => String(t.id) === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(tracks, from, to);
    setOrder(next);
    try { await playlistsApi.reorder(id, next.map((t) => t.id)); notify(); }
    catch { toast.error('Не вдалося зберегти порядок'); setOrder(null); }
  };

  const removeTrack = async (track) => {
    try {
      await playlistsApi.removeTrack(id, track.id);
      qc.invalidateQueries({ queryKey: ['playlistTracks', id] });
      qc.invalidateQueries({ queryKey: ['myPlaylists'] });
      notify();
      toast.success('Прибрано з плейлиста');
    } catch (e) { toast.error(errMsg(e, 'Не вдалося прибрати')); }
  };

  const save = async (data) => {
    try {
      await playlistsApi.update(id, data);
      qc.invalidateQueries({ queryKey: ['playlist', id] });
      qc.invalidateQueries({ queryKey: ['myPlaylists'] });
      setEditing(false);
      toast.success('Збережено');
    } catch (e) { toast.error(errMsg(e, 'Не вдалося зберегти')); }
  };

  const remove = async () => {
    if (!window.confirm(`Видалити плейлист «${p.title}»? Треки в бібліотеці залишаться.`)) return;
    try {
      await playlistsApi.delete(id);
      qc.invalidateQueries({ queryKey: ['myPlaylists'] });
      toast.success('Плейлист видалено');
      navigate('/library');
    } catch (e) { toast.error(errMsg(e, 'Не вдалося видалити')); }
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: p.title, url });
      else { await navigator.clipboard.writeText(url); toast.success(p.isPublic ? 'Посилання скопійовано' : 'Скопійовано. Плейлист приватний — зробіть його публічним, щоб інші відкрили.'); }
    } catch { /* cancelled */ }
  };

  // Smart suggestions based on what is already in the playlist
  const seed = tracks.length ? tracks[tracks.length - 1].id : null;
  const suggestions = useQuery({
    queryKey: ['plSuggest', id, seed],
    queryFn: () => discoverApi.similar(seed, 14).then((r) => r.data),
    enabled: canEdit && seed != null,
    staleTime: 5 * 60_000,
  });
  const inList = new Set(tracks.map((t) => t.id));
  const sugg = (suggestions.data ?? []).filter((t) => !inList.has(t.id)).slice(0, 6);
  const addSuggested = async (t) => {
    try {
      await playlistsApi.addTrack(id, t.id);
      qc.invalidateQueries({ queryKey: ['playlistTracks', id] });
      qc.invalidateQueries({ queryKey: ['myPlaylists'] });
      notify();
    } catch (e) { toast.error(errMsg(e, 'Не вдалося додати')); }
  };

  if (pl.isError) return <div className="page"><EmptyState title="Плейлист недоступний" text="Він приватний, видалений або посилання неправильне." action={<Link className="btn" to="/library">До бібліотеки</Link>} /></div>;

  const context = { playlistId: id, canEdit, onRemove: removeTrack };

  return (
    <div className="tint" style={tint}>
      <DetailHead
        tint={tint}
        art={<Collage covers={covers} title={p?.title} />}
        title={p?.title ?? ' '}
        meta={[
          p && (p.isPublic ? <span key="v" style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><Globe size={12} /> Публічний</span> : <span key="v" style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><Lock size={12} /> Приватний</span>),
          p?.isCollaborative && <span key="c" style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><Users size={12} /> Спільний</span>,
          p?.userName,
          tracksLabel(tracks.length),
          total > 0 && formatTotalDuration(total),
        ]}
      >
        {p?.description && <p className="page-lede">{p.description}</p>}
        <PlayActions tracks={tracks}>
          <button className="btn lg icon" onClick={share} aria-label="Поділитися"><Share2 size={18} /></button>
          {isOwner && <button className="btn lg icon" onClick={() => setEditing(true)} aria-label="Редагувати"><Pencil size={18} /></button>}
          {isOwner && <button className="btn lg icon danger" onClick={remove} aria-label="Видалити"><Trash2 size={18} /></button>}
        </PlayActions>
        {viewers.length > 1 && (
          <div className="page-meta" aria-live="polite">
            <span>Зараз тут:</span>
            {viewers.slice(0, 5).map((v, i) => <span key={i} className="avatar" style={{ width: 24, height: 24, fontSize: '0.7rem' }} title={v.name}>{(v.name?.[0] || '?').toUpperCase()}</span>)}
          </div>
        )}
      </DetailHead>

      <div className="page" style={{ paddingTop: 'var(--s-6)' }}>
        {fetched.isLoading ? <SkeletonRows /> : tracks.length === 0 ? (
          <EmptyState title="Плейлист порожній" text={canEdit ? 'Додайте треки через меню «…» біля будь-якої пісні або знайдіть їх у пошуку.' : 'Автор ще не додав треки.'} action={canEdit && <Link className="btn primary" to="/search">Знайти музику</Link>} />
        ) : canEdit ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={tracks.map((t) => String(t.id))} strategy={verticalListSortingStrategy}>
              <div className="rows"><RowsHead />{tracks.map((t, i) => <SortableRow key={t.id} track={t} index={i} queue={tracks} canEdit context={context} />)}</div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="rows"><RowsHead />{tracks.map((t, i) => <TrackRow key={t.id} track={t} index={i} queue={tracks} context={context} />)}</div>
        )}

        {canEdit && sugg.length > 0 && (
          <Section title="Підібрано для цього плейлиста">
            <div className="rows no-album">
              {sugg.map((t, i) => (
                <TrackRow key={t.id} track={t} index={i} queue={sugg} showAlbum={false}
                  extraAction={<button className="ibtn sm" onClick={() => addSuggested(t)} aria-label={`Додати «${t.title}»`}><Plus size={17} /></button>} />
              ))}
            </div>
          </Section>
        )}
      </div>

      {editing && p && <EditModal pl={p} onClose={() => setEditing(false)} onSave={save} />}
    </div>
  );
}
