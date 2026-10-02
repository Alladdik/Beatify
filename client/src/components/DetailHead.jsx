import { Play, Pause, Shuffle } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { sameTrack } from '../lib/tracks';

/** Cover on the left, title + facts + actions on the right; the page wears the cover's colour. */
export default function DetailHead({ art, title, meta = [], children, tint }) {
  return (
    <header className="detail-head tint" style={tint}>
      <div className="detail-art">{art}</div>
      <div className="page-head">
        <h1 className="h1 clamp-2">{title}</h1>
        {meta.filter(Boolean).length > 0 && <div className="page-meta">{meta.filter(Boolean).map((m, i) => <span key={i}>{m}</span>)}</div>}
        {children}
      </div>
    </header>
  );
}

/** Play / pause the whole list; shuffle starts it in random order. */
export function PlayActions({ tracks, onPlay, children }) {
  const playingHere = usePlayerStore((s) => s.isPlaying && tracks.some((t) => sameTrack(t, s.currentTrack)));
  const play = () => {
    if (!tracks.length) return;
    const s = usePlayerStore.getState();
    if (tracks.some((t) => sameTrack(t, s.currentTrack))) { s.togglePlay(); return; }
    onPlay ? onPlay() : s.playQueue(tracks, 0);
  };
  const shuffle = () => {
    if (!tracks.length) return;
    const list = [...tracks];
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    usePlayerStore.getState().playQueue(list, 0);
    usePlayerStore.setState({ isShuffle: true });
  };
  return (
    <div className="page-actions">
      <button className="btn primary lg" onClick={play} disabled={!tracks.length}>
        {playingHere ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />} {playingHere ? 'Пауза' : 'Слухати'}
      </button>
      <button className="btn lg" onClick={shuffle} disabled={tracks.length < 2}><Shuffle size={18} /> Перемішати</button>
      {children}
    </div>
  );
}
