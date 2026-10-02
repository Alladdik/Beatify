import { useEffect, useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, X } from 'lucide-react';
import Cover from '../components/ui/Cover';
import { coverUrl } from '../lib/config';

// Electron mini window — rendered when the URL hash is #miniplayer. Mirrors the main window's state.
export default function MiniPlayerPage() {
  const [track, setTrack] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const api = window.electronAPI;

  useEffect(() => {
    document.documentElement.dataset.theme = 'dark';
    document.body.style.background = 'transparent';
    if (!api) return;
    return api.onPlayerState((s) => {
      if (s?.currentTrack) setTrack(s.currentTrack);
      setPlaying(!!s?.isPlaying);
      setProgress(s?.progress ?? 0);
      setDuration(s?.duration ?? 0);
    });
  }, [api]);

  const ctl = (cmd) => api?.miniPlayerControl(cmd);
  const pct = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;

  return (
    <div className="mini-win">
      <Cover src={coverUrl(track)} title={track?.title} style={{ width: 72, borderRadius: 0 }} lazy={false} />
      <div className="mini-win-body">
        <div className="mini-win-text">
          <div className="trunc" style={{ fontWeight: 560, fontSize: '0.9rem' }}>{track?.title || 'Нічого не грає'}</div>
          <div className="trunc" style={{ fontSize: '0.78rem', opacity: 0.6 }}>{track?.artistName || ''}</div>
        </div>
        <div className="mini-win-ctl">
          <button onClick={() => ctl('prev')} aria-label="Попередній"><SkipBack size={16} fill="currentColor" /></button>
          <button className="main" onClick={() => ctl('playpause')} aria-label={playing ? 'Пауза' : 'Відтворити'}>
            {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" style={{ marginLeft: 1 }} />}
          </button>
          <button onClick={() => ctl('next')} aria-label="Наступний"><SkipForward size={16} fill="currentColor" /></button>
          <button className="close" onClick={() => api?.hideMiniPlayer()} aria-label="Закрити"><X size={15} /></button>
        </div>
      </div>
      <div className="mini-win-bar"><div style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
