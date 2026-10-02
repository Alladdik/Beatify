import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Play, Pause, Heart, MoreHorizontal } from 'lucide-react';
import Cover from './ui/Cover';
import { usePlayerStore } from '../store/playerStore';
import { useUiStore } from '../store/uiStore';
import { useLikesStore, useIsLiked } from '../store/likesStore';
import { useAuthStore } from '../store/authStore';
import { formatTime } from '../lib/format';
import { isExternal, sameTrack, sourceLabel } from '../lib/tracks';

/**
 * One track as a row. `queue` is the list it belongs to — clicking plays from here.
 * `context` is passed through to the track menu (playlist removal etc.).
 */
function TrackRowBase({ track, index = 0, queue, context, showAlbum = true, showCover = true, extraAction }) {
  const active = usePlayerStore((s) => sameTrack(s.currentTrack, track));
  const playing = usePlayerStore((s) => s.isPlaying);
  const user = useAuthStore((s) => s.user);
  const liked = useIsLiked(track);
  const toggleLike = useLikesStore((s) => s.toggle);
  const openMenu = useUiStore((s) => s.openTrackMenu);
  const ext = isExternal(track);
  const tag = sourceLabel(track);

  const play = (e) => {
    e?.stopPropagation();
    const s = usePlayerStore.getState();
    if (active) { s.togglePlay(); return; }
    const list = queue?.length ? queue : [track];
    const i = Math.max(0, list.findIndex((t) => sameTrack(t, track)));
    s.playQueue(list, i);
  };

  const onContext = (e) => {
    e.preventDefault();
    openMenu(track, e.clientX, e.clientY, context);
  };

  const onMore = (e) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    openMenu(track, r.left, r.bottom + 4, context);
  };

  const isTouch = () => window.matchMedia('(hover: none)').matches;

  return (
    <div
      className={`row ${active ? 'active' : ''}`}
      onDoubleClick={play}
      onContextMenu={onContext}
      data-track-id={track.id ?? undefined}
    >
      <div className="row-idx">
        {active && playing
          ? <span className="eqbars" aria-label="Грає"><i /><i /><i /></span>
          : <span className={`n ${active ? 'accent' : ''}`}>{index + 1}</span>}
        <button className="row-play" onClick={play} aria-label={active && playing ? 'Пауза' : 'Відтворити'}>
          {active && playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        </button>
      </div>

      <div className="row-main" onClick={() => isTouch() && play()} role="presentation">
        {showCover && <Cover track={track} className="row-art" />}
        <div className="row-text">
          <div className="row-title">
            <span className="trunc">{track.title}</span>
            {track.isExplicit && <span className="tag" title="Explicit">E</span>}
            {tag && <span className={`src ${track.source === 'soundcloud' ? 'sc' : track.source === 'youtube' ? 'yt' : 'exp'}`}>{tag}</span>}
          </div>
          <div className="row-sub">
            {track.artistId ? <Link to={`/artist/${track.artistId}`} onClick={(e) => e.stopPropagation()}>{track.artistName}</Link> : track.artistName}
          </div>
        </div>
      </div>

      {showAlbum && (
        <div className="row-album">
          {track.albumId ? <Link to={`/album/${track.albumId}`}>{track.albumTitle}</Link> : (track.albumTitle || '')}
        </div>
      )}

      <div className="row-actions">
        {extraAction}
        {!ext && user && (
          <button
            className={`ibtn sm ${liked ? 'on' : 'hover-only'}`}
            onClick={(e) => { e.stopPropagation(); toggleLike(track); }}
            aria-label={liked ? 'Прибрати з вподобаних' : 'Вподобати'}
            aria-pressed={liked}
          >
            <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
          </button>
        )}
        <button className="ibtn sm hover-only" onClick={onMore} aria-label="Більше дій">
          <MoreHorizontal size={18} />
        </button>
      </div>

      <div className="row-time">{formatTime(track.duration)}</div>
    </div>
  );
}

export const TrackRow = memo(TrackRowBase);

/** Header for a list of rows (hidden on phones by CSS). */
export function RowsHead({ showAlbum = true }) {
  return (
    <div className="rows-head">
      <span>#</span><span>Назва</span>{showAlbum && <span>Альбом</span>}<span /><span>Час</span>
    </div>
  );
}

/** A full list: <TrackList tracks=[…] /> */
export default function TrackList({ tracks, showAlbum = true, showCover = true, context, header = true, startIndex = 0, renderExtra }) {
  return (
    <div className={`rows ${showAlbum ? '' : 'no-album'}`}>
      {header && <RowsHead showAlbum={showAlbum} />}
      {tracks.map((t, i) => (
        <TrackRow
          key={t.id ?? t.key ?? `x${i}`}
          track={t}
          index={startIndex + i}
          queue={tracks}
          context={context}
          showAlbum={showAlbum}
          showCover={showCover}
          extraAction={renderExtra?.(t, i)}
        />
      ))}
    </div>
  );
}
