import { Link } from 'react-router-dom';
import { Play, Pause } from 'lucide-react';
import Cover, { Collage } from './ui/Cover';
import { usePlayerStore } from '../store/playerStore';
import { sameTrack } from '../lib/tracks';

/** Cover + two lines. `to` navigates; the play button plays `onPlay`. */
export default function Tile({ to, onClick, art, title, sub, round = false, playing = false, onPlay, className = '' }) {
  const Wrapper = to ? Link : 'button';
  const wrapProps = to ? { to } : { type: 'button', onClick };
  return (
    <div className={`tile ${round ? 'round' : ''} ${playing ? 'playing' : ''} ${className}`}>
      <Wrapper className="tile-link" {...wrapProps} style={{ display: 'block', width: '100%', textAlign: 'inherit' }}>
        <div className="tile-art">{art}</div>
        <div className="tile-title">{title}</div>
        {sub && <div className="tile-sub">{sub}</div>}
      </Wrapper>
      {onPlay && (
        <button className="playbtn sm tile-play" onClick={onPlay} aria-label={playing ? 'Пауза' : `Відтворити: ${title}`}>
          {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" style={{ marginLeft: 1 }} />}
        </button>
      )}
    </div>
  );
}

/** Tile for a single library track. */
export function TrackTile({ track, queue }) {
  const active = usePlayerStore((s) => sameTrack(s.currentTrack, track));
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const play = () => {
    const s = usePlayerStore.getState();
    if (active) { s.togglePlay(); return; }
    const list = queue?.length ? queue : [track];
    s.playQueue(list, Math.max(0, list.findIndex((t) => sameTrack(t, track))));
  };
  return (
    <Tile
      onClick={play}
      art={<Cover track={track} />}
      title={track.title}
      sub={track.artistName}
      playing={active && isPlaying}
      onPlay={(e) => { e.stopPropagation(); play(); }}
    />
  );
}

export { Collage };
