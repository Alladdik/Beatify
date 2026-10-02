import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, SlidersHorizontal, ListMusic, SkipBack, SkipForward, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Cover from './ui/Cover';
import Scrubber from './Scrubber';
import LyricsView from './panels/LyricsView';
import { Spectrum } from './panels/SoundPanel';
import { PlayPause, ShuffleButton, RepeatButton, LikeButton } from './Player';
import { usePlayerStore } from '../store/playerStore';
import { useUiStore } from '../store/uiStore';
import { useAudioAxes, axesFromMeter } from '../hooks/useAudioAxes';
import { subscribeMeter } from '../lib/meter';
import { formatTime } from '../lib/format';
import { isExternal, shareUrl } from '../lib/tracks';

const RANGE = { wght: [180, 820], wdth: [62, 138] };

// Live coordinates of the type axes — the same numbers that drive the title
function AxisReadout() {
  const ref = useRef(null);
  useEffect(() => subscribeMeter((m) => {
    const a = axesFromMeter(m, RANGE);
    if (ref.current) ref.current.textContent = `wght ${String(a.wght).padStart(3, '0')} · wdth ${a.wdth.toFixed(1)}`;
  }), []);
  return <span ref={ref} className="mono muted axis-readout" style={{ fontSize: '0.7rem' }}>wght 000 · wdth 000.0</span>;
}

function NpScrubber() {
  const progress = usePlayerStore((s) => s.progress);
  const duration = usePlayerStore((s) => s.duration);
  const seek = usePlayerStore((s) => s.seek);
  return (
    <div>
      <div style={{ position: 'relative', height: 14 }}>
        <Scrubber className="scrub inline" progress={progress} duration={duration} onSeek={seek} />
      </div>
      <div className="player-time" style={{ justifyContent: 'space-between', marginTop: 6 }}>
        <span>{formatTime(progress)}</span>
        <span>−{formatTime(Math.max(0, duration - progress))}</span>
      </div>
    </div>
  );
}

export default function NowPlaying() {
  const open = useUiStore((s) => s.nowPlayingOpen);
  const close = useUiStore((s) => s.closeNowPlaying);
  const toggleDock = useUiStore((s) => s.toggleDock);
  const openDock = useUiStore((s) => s.openDock);
  const track = usePlayerStore((s) => s.currentTrack);
  const next = usePlayerStore((s) => s.next);
  const prev = usePlayerStore((s) => s.prev);
  const titleRef = useAudioAxes(RANGE);

  const touch = useRef(null);
  const onTouchStart = (e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e) => {
    const s = touch.current; touch.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (dy > 90 && dy > Math.abs(dx) * 1.5) close();
    else if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? next : prev)();
  };

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    return () => { document.body.style.overflow = prevOverflow; };
  }, [open]);

  if (!open || !track) return null;

  const ext = isExternal(track);
  const share = async () => {
    const url = shareUrl(track);
    try {
      if (navigator.share) await navigator.share({ title: track.title, text: `${track.title} — ${track.artistName}`, url });
      else { await navigator.clipboard.writeText(url); toast.success('Посилання скопійовано'); }
    } catch { /* cancelled */ }
  };

  return (
    <div className="np" role="dialog" aria-label="Зараз грає">
      <div className="np-bar">
        <button className="ibtn lg" onClick={close} aria-label="Згорнути"><ChevronDown size={26} /></button>
        <div className="label" style={{ textAlign: 'center' }}>
          {ext ? (track.source === 'soundcloud' ? 'SoundCloud' : 'YouTube') : 'Моя бібліотека'}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="ibtn lg" onClick={() => { openDock('sound'); close(); }} aria-label="Звук"><SlidersHorizontal size={21} /></button>
          <button className="ibtn lg" onClick={() => { toggleDock('queue'); close(); }} aria-label="Черга"><ListMusic size={21} /></button>
        </div>
      </div>

      <div className="np-art" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <Cover track={track} lazy={false} />
      </div>

      <div className="np-side">
        <div>
          <h1 className="np-title" ref={titleRef} title={track.title}>{track.title}</h1>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14 }}>
            <div className="np-artist">
              {track.artistId ? <Link to={`/artist/${track.artistId}`} onClick={close}>{track.artistName}</Link> : track.artistName}
            </div>
            <AxisReadout />
          </div>
        </div>

        <div className="np-lyrics"><LyricsView track={track} large /></div>

        <div className="np-controls">
          <Spectrum height={36} bars={64} />
          <NpScrubber />
          <div className="np-transport">
            <ShuffleButton className="ibtn lg" />
            <button className="ibtn lg" onClick={prev} aria-label="Попередній"><SkipBack size={26} fill="currentColor" /></button>
            <PlayPause size="lg" />
            <button className="ibtn lg" onClick={() => next()} aria-label="Наступний"><SkipForward size={26} fill="currentColor" /></button>
            <RepeatButton className="ibtn lg" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
            <LikeButton track={track} className="ibtn lg" size={22} />
            <button className="ibtn lg" onClick={share} aria-label="Поділитися"><Share2 size={21} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
