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

  // Position for the lock-screen / car scrubber. The browser extrapolates from (position, rate), so it only needs to hear
  // about real changes — a push every second makes a car head unit (AVRCP) redraw the progress bar and re-send metadata,
  // which on some units shows up as the track display flickering or the sound hiccuping.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const a = usePlayerStore.getState().audio;
    let last = 0;
    const push = (e) => {
      const now = Date.now();
      // 8D / lo-fi wobble playbackRate every frame: ignore those ratechange bursts
      if (e?.type === 'ratechange' && now - last < 2000) return;
      last = now;
      const d = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : duration;
      if (!d || !Number.isFinite(d)) return;
      try { navigator.mediaSession.setPositionState({ duration: d, playbackRate: a.playbackRate || 1, position: Math.min(Math.max(0, a.currentTime), d) }); } catch { /* invalid state */ }
    };
    push();
    const evts = ['loadedmetadata', 'durationchange', 'playing', 'pause', 'seeked', 'ratechange'];
    evts.forEach((n) => a.addEventListener(n, push));
    return () => evts.forEach((n) => a.removeEventListener(n, push));
  }, [duration, trackId]);

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
