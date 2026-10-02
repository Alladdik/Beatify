import { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Play, Pause, SkipBack, SkipForward, Volume1, Volume2, VolumeX, Shuffle, Repeat, Repeat1, Heart,
  MicVocal, ListMusic, SlidersHorizontal, Cast, MoreHorizontal, Maximize2, PictureInPicture2, Radio,
  Timer, CloudDownload, CheckCircle2, Piano, Keyboard, Video, Check, Loader2, Music2,
} from 'lucide-react';
import Cover from './ui/Cover';
import Popover from './ui/Popover';
import Scrubber from './Scrubber';
import { usePlayerStore } from '../store/playerStore';
import { useUiStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { useOfflineStore } from '../store/offlineStore';
import { useLikesStore, useIsLiked } from '../store/likesStore';
import { useAudioAxes } from '../hooks/useAudioAxes';
import { useMediaSession } from '../hooks/useMediaSession';
import { formatTime } from '../lib/format';
import { isExternal, sourceLabel } from '../lib/tracks';

const SLEEP = [5, 15, 30, 45, 60];

function ConnectedScrubber(props) {
  const progress = usePlayerStore((s) => s.progress);
  const duration = usePlayerStore((s) => s.duration);
  const seek = usePlayerStore((s) => s.seek);
  return <Scrubber progress={progress} duration={duration} onSeek={seek} {...props} />;
}

export function Times() {
  const progress = usePlayerStore((s) => s.progress);
  const duration = usePlayerStore((s) => s.duration);
  return (
    <div className="player-time">
      <span>{formatTime(progress)}</span><span className="sep">/</span><span>{formatTime(duration)}</span>
    </div>
  );
}

export function RepeatButton({ className = 'ibtn' }) {
  const repeat = usePlayerStore((s) => s.repeat);
  const cycle = usePlayerStore((s) => s.cycleRepeat);
  const label = repeat === 'off' ? 'Повтор: вимкнено' : repeat === 'all' ? 'Повтор: усі' : 'Повтор: один трек';
  return (
    <button className={`${className} ${repeat !== 'off' ? 'on' : ''}`} onClick={cycle} aria-label={label} title={label} aria-pressed={repeat !== 'off'}>
      {repeat === 'one' ? <Repeat1 size={17} /> : <Repeat size={17} />}
    </button>
  );
}

export function ShuffleButton({ className = 'ibtn' }) {
  const on = usePlayerStore((s) => s.isShuffle);
  const toggle = usePlayerStore((s) => s.toggleShuffle);
  return (
    <button className={`${className} ${on ? 'on' : ''}`} onClick={toggle} aria-label="Перемішати" title="Перемішати (S)" aria-pressed={on}>
      <Shuffle size={17} />
    </button>
  );
}

export function PlayPause({ size = 'md' }) {
  const playing = usePlayerStore((s) => s.isPlaying);
  const buffering = usePlayerStore((s) => s.isBuffering);
  const toggle = usePlayerStore((s) => s.togglePlay);
  const has = usePlayerStore((s) => !!s.currentTrack);
  const cls = size === 'lg' ? 'playbtn lg' : size === 'sm' ? 'playbtn sm' : 'playbtn';
  const iconSize = size === 'lg' ? 28 : size === 'sm' ? 17 : 21;
  return (
    <button className={cls} onClick={toggle} disabled={!has} aria-label={playing ? 'Пауза' : 'Відтворити'} title={playing ? 'Пауза (Space)' : 'Відтворити (Space)'}>
      {buffering && playing ? <Loader2 size={iconSize} className="spin" />
        : playing ? <Pause size={iconSize} fill="currentColor" />
        : <Play size={iconSize} fill="currentColor" style={{ marginLeft: 2 }} />}
    </button>
  );
}

export function LikeButton({ track, className = 'ibtn', size = 18 }) {
  const liked = useIsLiked(track);
  const toggle = useLikesStore((s) => s.toggle);
  const user = useAuthStore((s) => s.user);
  if (!track || isExternal(track) || !user) return null;
  return (
    <button className={`${className} ${liked ? 'on' : ''}`} onClick={() => toggle(track)} aria-pressed={liked} aria-label={liked ? 'Прибрати з вподобаних' : 'Вподобати'} title="Вподобати (L)">
      <Heart size={size} fill={liked ? 'currentColor' : 'none'} />
    </button>
  );
}

function VolumeControl() {
  const volume = usePlayerStore((s) => s.volume);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const Icon = volume === 0 ? VolumeX : volume < 0.45 ? Volume1 : Volume2;
  return (
    <div className="vol">
      <button className="ibtn" onClick={() => setVolume(volume > 0 ? 0 : 0.8)} aria-label={volume > 0 ? 'Вимкнути звук' : 'Увімкнути звук'} title="Звук (M)"><Icon size={18} /></button>
      <input
        type="range" className="slider" min="0" max="1" step="0.01" value={volume}
        aria-label="Гучність" style={{ '--p': `${volume * 100}%` }}
        onChange={(e) => setVolume(+e.target.value)}
      />
    </div>
  );
}

function SleepRemaining() {
  const sleepTimer = usePlayerStore((s) => s.sleepTimer);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!sleepTimer) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sleepTimer]);
  if (!sleepTimer) return null;
  const left = Math.max(0, sleepTimer - now);
  return <span className="mono">{Math.floor(left / 60000)}:{String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}</span>;
}

function MoreMenu({ track }) {
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  const ui = useUiStore();
  const { sleepTimer, sleepAtEnd, sleepTimerMinutes, setSleepTimer, isRadio, toggleRadio } = usePlayerStore();
  const offline = useOfflineStore();
  const ext = isExternal(track);
  const downloaded = track && !ext && offline.isDownloaded(track.id);
  const downloading = track && !ext && offline.isDownloading(track.id);
  const isVideo = track?.mediaType === 'video' && !ext;
  const run = (fn) => () => { setOpen(false); fn(); };
  const sleepOn = !!sleepTimer || sleepAtEnd;

  return (
    <>
      <button ref={btn} className={`ibtn ${open ? 'on' : ''}`} onClick={() => setOpen((o) => !o)} aria-label="Більше" aria-haspopup="menu" aria-expanded={open}>
        <MoreHorizontal size={19} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={btn.current} align="end" placement="top" width={268}>
        {track && <button className="menu-item" onClick={run(ui.openNowPlaying)}><Maximize2 size={16} /> На весь екран <span className="kbd">F</span></button>}
        <button className="menu-item" onClick={run(() => (window.electronAPI?.showMiniPlayer ? window.electronAPI.showMiniPlayer() : ui.setMiniPlayer(!ui.miniPlayerOpen)))}><PictureInPicture2 size={16} /> Міні-плеєр</button>
        {isVideo && <button className="menu-item" onClick={run(() => ui.setVideo(true))}><Video size={16} /> Дивитись відео</button>}
        {track && !ext && <button className={`menu-item ${isRadio ? 'on' : ''}`} onClick={run(toggleRadio)}><Radio size={16} /> Радіо: схожі треки {isRadio && <Check size={14} style={{ marginLeft: 'auto' }} />}</button>}
        {track && !ext && (
          <button className="menu-item" disabled={downloading} onClick={run(() => (downloaded ? offline.removeTrack(track.id) : offline.downloadTrack(track)))}>
            {downloading ? <Loader2 size={16} className="spin" /> : downloaded ? <CheckCircle2 size={16} className="accent" /> : <CloudDownload size={16} />}
            {downloaded ? 'Збережено офлайн' : downloading ? 'Завантаження…' : 'Зберегти офлайн'}
          </button>
        )}
        <div className="menu-sep" />
        <div className="menu-head" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Timer size={16} className={sleepOn ? 'accent' : 'muted'} />
          <span className="label" style={{ flex: 1 }}>Таймер сну</span>
          <span className="accent" style={{ fontSize: '0.75rem' }}><SleepRemaining />{sleepAtEnd && 'до кінця треку'}</span>
        </div>
        <div className="chips" style={{ padding: '0 12px 10px' }}>
          {SLEEP.map((m) => (
            <button key={m} className={`chip ${sleepTimerMinutes === m && sleepTimer ? 'on' : ''}`} onClick={() => { setSleepTimer(m); setOpen(false); }}>{m} хв</button>
          ))}
          <button className={`chip ${sleepAtEnd ? 'on' : ''}`} onClick={() => { setSleepTimer('end'); setOpen(false); }}>до кінця треку</button>
          {sleepOn && <button className="chip" onClick={() => { setSleepTimer(0); setOpen(false); }}>Вимкнути</button>}
        </div>
        <div className="menu-sep" />
        <button className="menu-item" onClick={run(() => ui.setMidi(true))}><Piano size={16} /> MIDI-клавіатура</button>
        <button className="menu-item" onClick={run(ui.toggleShortcuts)}><Keyboard size={16} /> Гарячі клавіші <span className="kbd">?</span></button>
      </Popover>
    </>
  );
}

export default function Player() {
  useMediaSession();
  const track = usePlayerStore((s) => s.currentTrack);
  const next = usePlayerStore((s) => s.next);
  const prev = usePlayerStore((s) => s.prev);
  const dockTab = useUiStore((s) => s.dockTab);
  const toggleDock = useUiStore((s) => s.toggleDock);
  const openNowPlaying = useUiStore((s) => s.openNowPlaying);
  const sound = usePlayerStore((s) =>
    s.is8DActive || s.isPerfectAudioActive || s.isAutoEqActive || s.isLofiActive || s.isKaraokeActive || s.isSubBassActive ||
    s.isVocalBoostActive || s.isDouble8DActive || s.isBassRumbleActive || s.isNightcoreActive || s.eqBands.some((v) => v !== 0));
  const titleRef = useAudioAxes({ wght: [470, 700], wdth: [96, 110] });

  // Phone gestures on the mini-player: swipe sideways = skip, swipe up = open
  const touch = useRef(null);
  const onTouchStart = (e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e) => {
    const s = touch.current; touch.current = null;
    if (!s || !track) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? next : prev)();
    else if (dy < -36 && Math.abs(dy) > Math.abs(dx)) openNowPlaying();
  };

  const tag = sourceLabel(track);

  return (
    <footer className="player" aria-label="Плеєр">
      <ConnectedScrubber disabled={!track} />

      <div
        className="player-track"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {track ? (
          <>
            <button className="cover-btn" onClick={openNowPlaying} aria-label="Відкрити на весь екран">
              <Cover track={track} lazy={false} />
            </button>
            <div className="player-meta">
              <button onClick={openNowPlaying} className="player-title" ref={titleRef} style={{ textAlign: 'left' }} title={track.title}>
                {track.title}
              </button>
              <div className="player-artist">
                {tag && <span className={`src ${track.source === 'soundcloud' ? 'sc' : track.source === 'youtube' ? 'yt' : 'exp'}`} style={{ marginRight: 6 }}>{tag}</span>}
                {track.artistId ? <Link to={`/artist/${track.artistId}`}>{track.artistName}</Link> : track.artistName}
              </div>
            </div>
            <span className="hide-m"><LikeButton track={track} /></span>
          </>
        ) : (
          <>
            <div className="cover" style={{ width: 52 }}><span className="cover-ph" style={{ '--cv': 'var(--fg-4)' }}><Music2 size={22} /></span></div>
            <div className="player-meta">
              <span className="player-title muted">Нічого не грає</span>
              <span className="player-artist">Оберіть трек, щоб почати</span>
            </div>
          </>
        )}
      </div>

      <div className="player-center">
        <div className="transport">
          <span className="hide-m"><ShuffleButton /></span>
          <button className="ibtn hide-m" onClick={prev} disabled={!track} aria-label="Попередній" title="Попередній (P)"><SkipBack size={20} fill="currentColor" /></button>
          <PlayPause />
          <button className="ibtn" onClick={() => next()} disabled={!track} aria-label="Наступний" title="Наступний (N)"><SkipForward size={20} fill="currentColor" /></button>
          <span className="hide-m"><RepeatButton /></span>
        </div>
        <Times />
      </div>

      <div className="player-right">
        <button className={`ibtn ${dockTab === 'lyrics' ? 'on' : ''}`} onClick={() => toggleDock('lyrics')} aria-label="Текст пісні" title="Текст (T)" aria-pressed={dockTab === 'lyrics'}><MicVocal size={18} /></button>
        <button className={`ibtn ${dockTab === 'queue' ? 'on' : ''}`} onClick={() => toggleDock('queue')} aria-label="Черга" title="Черга (Q)" aria-pressed={dockTab === 'queue'}><ListMusic size={18} /></button>
        <button className={`ibtn ${dockTab === 'sound' || sound ? 'on' : ''}`} onClick={() => toggleDock('sound')} aria-label="Звук" title="Звук (E)" aria-pressed={dockTab === 'sound'}><SlidersHorizontal size={18} /></button>
        <button className={`ibtn ${dockTab === 'devices' ? 'on' : ''}`} onClick={() => toggleDock('devices')} aria-label="Пристрої" title="Передати на інший пристрій" aria-pressed={dockTab === 'devices'}><Cast size={18} /></button>
        <MoreMenu track={track} />
        <VolumeControl />
      </div>
    </footer>
  );
}
