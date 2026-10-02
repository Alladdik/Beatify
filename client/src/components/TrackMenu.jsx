import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ListEnd, ListPlus, Heart, HeartOff, Disc3, User, Radio, Share2, CloudDownload, CloudOff,
  ExternalLink, Trash2, Plus, ChevronRight, ChevronLeft, ListStart, Library,
} from 'lucide-react';
import Popover from './ui/Popover';
import Cover from './ui/Cover';
import { useUiStore } from '../store/uiStore';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import { useLikesStore, useIsLiked } from '../store/likesStore';
import { useOfflineStore } from '../store/offlineStore';
import { useMyPlaylists, usePlaylistActions } from '../hooks/useLibrary';
import { useIsMobile } from '../hooks/useMedia';
import { isExternal, shareUrl } from '../lib/tracks';
import { externalSearchApi, errMsg } from '../api';

// A single, global track menu: right-click a row, tap "…", or long-press. Opened via useUiStore.openTrackMenu.
export default function TrackMenu() {
  const menu = useUiStore((s) => s.trackMenu);
  const close = useUiStore((s) => s.closeTrackMenu);
  const mobile = useIsMobile();

  if (!menu) return null;
  const body = <MenuBody menu={menu} close={close} mobile={mobile} />;

  if (mobile) {
    return (
      <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && close()}>
        <div className="modal" role="dialog" aria-label="Дії з треком">{body}</div>
      </div>
    );
  }
  return (
    <Popover open onClose={close} point={{ x: menu.x, y: menu.y }} width={264}>
      {body}
    </Popover>
  );
}

function MenuBody({ menu, close, mobile }) {
  const { track, context = {} } = menu;
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const ext = isExternal(track);
  const liked = useIsLiked(track);
  const toggleLike = useLikesStore((s) => s.toggle);
  const { addToQueue, addToQueueNext } = usePlayerStore.getState();
  const offline = useOfflineStore();
  const downloaded = !ext && offline.isDownloaded(track.id);
  const { data: playlists = [] } = useMyPlaylists();
  const { create, addTrack } = usePlaylistActions();
  const [view, setView] = useState('main'); // 'main' | 'playlists'
  const [newName, setNewName] = useState('');
  const mine = playlists.filter((p) => p.userId === user?.id || p.isCollaborative);

  useEffect(() => { setView('main'); }, [track]);

  const run = (fn) => async () => { close(); await fn(); };

  const share = async () => {
    const url = shareUrl(track);
    const data = { title: track.title, text: `${track.title} — ${track.artistName}`, url };
    try {
      if (navigator.share && mobile) await navigator.share(data);
      else { await navigator.clipboard.writeText(url); toast.success('Посилання скопійовано'); }
    } catch { /* cancelled */ }
  };

  const startRadio = async () => {
    if (ext) { toast('Радіо доступне для треків бібліотеки'); return; }
    const s = usePlayerStore.getState();
    await s.playQueue([track], 0);
    usePlayerStore.setState({ isRadio: true });
    s._topUpRadio();
    toast.success('Радіо за треком запущено');
  };

  const saveToLibrary = async () => {
    const t = toast.loading('Зберігаю в бібліотеку…');
    try {
      await externalSearchApi.save({ url: track.externalUrl, title: track.title, artistName: track.artistName, coverUrl: track.thumbnail });
      toast.success('Збережено в бібліотеку', { id: t });
    } catch (e) {
      toast.error(errMsg(e, 'Не вдалося зберегти'), { id: t });
    }
  };

  const head = (
    <div className="menu-head" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: mobile ? '16px 20px' : '8px 12px 10px' }}>
      <Cover track={track} style={{ width: mobile ? 48 : 36 }} />
      <div style={{ minWidth: 0 }}>
        <div className="trunc" style={{ fontWeight: 560 }}>{track.title}</div>
        <div className="trunc muted" style={{ fontSize: '0.8rem' }}>{track.artistName}</div>
      </div>
    </div>
  );

  if (view === 'playlists') {
    return (
      <div>
        <button className="menu-item" onClick={() => setView('main')}><ChevronLeft size={16} /> Додати до плейліста</button>
        <div className="menu-sep" />
        <div style={{ maxHeight: mobile ? '40vh' : 240, overflowY: 'auto' }}>
          {mine.length === 0 && <div className="muted" style={{ padding: '8px 12px', fontSize: '0.8rem' }}>Плейлистів ще немає</div>}
          {mine.map((p) => (
            <button key={p.id} className="menu-item" onClick={run(() => addTrack(p, track))}>
              <Library size={16} /> <span className="trunc">{p.title}</span>
              <span className="mono muted" style={{ marginLeft: 'auto', fontSize: '0.68rem' }}>{p.trackCount}</span>
            </button>
          ))}
        </div>
        <div className="menu-sep" />
        <form
          style={{ display: 'flex', gap: 6, padding: '4px 6px 6px' }}
          onSubmit={async (e) => {
            e.preventDefault();
            const title = newName.trim() || `Мій плейлист #${mine.length + 1}`;
            close();
            const pl = await create(title, track.id);
            if (pl) { toast.success(`«${pl.title}» створено`); navigate(`/playlist/${pl.id}`); }
          }}
        >
          <input className="input" style={{ height: 36 }} placeholder="Новий плейлист" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button className="btn primary icon sm" aria-label="Створити"><Plus size={16} /></button>
        </form>
      </div>
    );
  }

  return (
    <div>
      {head}
      <div className="menu-sep" />
      <button className="menu-item" onClick={run(() => { addToQueueNext(track); toast.success('Зіграє наступним'); })}><ListStart size={16} /> Відтворити наступним</button>
      <button className="menu-item" onClick={run(() => { addToQueue(track); toast.success('Додано до черги'); })}><ListEnd size={16} /> Додати до черги</button>
      {!ext && user && (
        <>
          <button className="menu-item" onClick={() => toggleLike(track).then(close)}>
            {liked ? <HeartOff size={16} /> : <Heart size={16} />} {liked ? 'Прибрати з вподобаних' : 'Вподобати'}
          </button>
          <button className="menu-item" onClick={() => setView('playlists')}>
            <ListPlus size={16} /> Додати до плейліста <ChevronRight size={14} style={{ marginLeft: 'auto' }} />
          </button>
        </>
      )}
      {context.playlistId && context.canEdit && (
        <button className="menu-item danger" onClick={run(() => context.onRemove?.(track))}><Trash2 size={16} /> Прибрати з цього плейліста</button>
      )}
      <div className="menu-sep" />
      {!ext && track.artistId && <button className="menu-item" onClick={run(() => navigate(`/artist/${track.artistId}`))}><User size={16} /> Перейти до виконавця</button>}
      {!ext && track.albumId && <button className="menu-item" onClick={run(() => navigate(`/album/${track.albumId}`))}><Disc3 size={16} /> Перейти до альбому</button>}
      {!ext && <button className="menu-item" onClick={run(startRadio)}><Radio size={16} /> Радіо за треком</button>}
      <button className="menu-item" onClick={run(share)}><Share2 size={16} /> Поділитися</button>
      {!ext && (
        downloaded
          ? <button className="menu-item" onClick={run(() => offline.removeTrack(track.id))}><CloudOff size={16} /> Видалити з офлайну</button>
          : <button className="menu-item" onClick={run(() => offline.downloadTrack(track))}><CloudDownload size={16} /> Зберегти офлайн</button>
      )}
      {ext && track.externalUrl && (
        <>
          <a className="menu-item" href={track.externalUrl} target="_blank" rel="noreferrer noopener" onClick={close}><ExternalLink size={16} /> Відкрити на {track.source === 'soundcloud' ? 'SoundCloud' : 'YouTube'}</a>
          {(user?.role === 'admin' || user?.canImport) && <button className="menu-item" onClick={run(saveToLibrary)}><CloudDownload size={16} /> Зберегти в бібліотеку</button>}
        </>
      )}
    </div>
  );
}
