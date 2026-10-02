import { useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { coverUrl } from '../lib/config';

// Lock-screen / Dynamic Island / media keys / Electron mini-player mirror.
export function useMediaSession() {
  const track = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const duration = usePlayerStore((s) => s.duration);
  const trackId = track?.id ?? track?.key;
  const cover = coverUrl(track);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !track) return;
    const abs = cover ? (cover.startsWith('http') ? cover : `${window.location.origin}${cover}`) : null;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title ?? '',
      artist: track.artistName ?? '',
      album: track.albumTitle ?? '',
      artwork: abs ? [96, 192, 256, 384, 512].map((n) => ({ src: abs, sizes: `${n}x${n}` })) : [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, cover]);

  useEffect(() => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const s = () => usePlayerStore.getState();
    const set = (a, fn) => { try { navigator.mediaSession.setActionHandler(a, fn); } catch { /* unsupported action */ } };
    set('play', () => { if (s().audio.paused) s().togglePlay(); });
    set('pause', () => { if (!s().audio.paused) s().togglePlay(); });
    set('nexttrack', () => s().next());
    set('previoustrack', () => s().prev());
    set('seekto', (d) => s().seek(d.seekTime));
    set('seekbackward', (d) => s().seek(s().audio.currentTime - (d.seekOffset ?? 10)));
    set('seekforward', (d) => s().seek(s().audio.currentTime + (d.seekOffset ?? 10)));
    return () => ['play', 'pause', 'nexttrack', 'previoustrack', 'seekto', 'seekbackward', 'seekforward'].forEach((a) => set(a, null));
  }, []);

  // Position for the lock-screen scrubber — once a second is plenty
  useEffect(() => {
    if (!('mediaSession' in navigator) || !duration || !Number.isFinite(duration)) return;
    const push = () => {
      const a = usePlayerStore.getState().audio;
      try { navigator.mediaSession.setPositionState({ duration, playbackRate: a.playbackRate || 1, position: Math.min(a.currentTime, duration) }); } catch { /* invalid state */ }
    };
    push();
    const id = setInterval(push, 1000);
    return () => clearInterval(id);
  }, [duration, trackId, isPlaying]);

  // Electron mini-player + taskbar buttons
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.setPlayerState) return;
    const push = () => {
      const s = usePlayerStore.getState();
      api.setPlayerState({ currentTrack: s.currentTrack, isPlaying: s.isPlaying, progress: s.audio.currentTime, duration: s.audio.duration, volume: s.volume })?.catch?.(() => {});
    };
    push();
    api.thumbarSetState?.(isPlaying)?.catch?.(() => {});
    const id = setInterval(push, 1000);
    return () => clearInterval(id);
  }, [trackId, isPlaying]);
}
