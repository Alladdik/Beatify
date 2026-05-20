import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { tracksApi } from '../api';

function getOfflineAudioUrl(trackId) {
  try {
    const raw = localStorage.getItem('beatify-offline');
    if (!raw) return null;
    const state = JSON.parse(raw);
    return state?.state?.downloadedTracks?.[String(trackId)]?.audioUrl ?? null;
  } catch {
    return null;
  }
}

// Single audio element — module-level singleton, never serialized to localStorage
const _audio = new Audio();
_audio.crossOrigin = "anonymous";

let _audioCtx = null;
let _filters  = [];
let _analyser = null;

function initAudioContext() {
  if (_audioCtx) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  _audioCtx = new AudioContext();
  const source = _audioCtx.createMediaElementSource(_audio);

  // Analyser for visualizer (non-destructive tap)
  _analyser = _audioCtx.createAnalyser();
  _analyser.fftSize = 512;               // 256 frequency bins
  _analyser.smoothingTimeConstant = 0.78;

  const freqs = [60, 230, 910, 3600, 14000];
  const types = ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf'];

  _filters = freqs.map((freq, i) => {
    const filter = _audioCtx.createBiquadFilter();
    filter.type = types[i];
    filter.frequency.value = freq;
    filter.gain.value = 0;
    return filter;
  });

  source.connect(_filters[0]);
  for (let i = 0; i < _filters.length - 1; i++) {
    _filters[i].connect(_filters[i + 1]);
  }
  // chain: filters → analyser → speakers
  _filters[_filters.length - 1].connect(_analyser);
  _analyser.connect(_audioCtx.destination);

  // Apply persisted EQ
  setTimeout(() => {
    applyEqBands(usePlayerStore.getState().eqBands);
  }, 0);
}

/** Exposes the AnalyserNode for visualizers */
export function getAnalyser() { return _analyser; }

const applyEqBands = (bands) => {
  if (!_audioCtx || !_filters.length) return;
  bands.forEach((val, i) => {
    if (_filters[i]) _filters[i].gain.value = val;
  });
};

// Auto-fetch lyrics in background when a track starts playing
async function autoFetchLyrics(track) {
  if (track?.lyrics) return;
  const title = track?.title || '';
  const artist = track?.artistName || track?.artist || '';
  if (!title) return;
  try {
    const { externalSearchApi } = await import('../api');
    // Use the base URL since we're in store
    const res = await fetch(
      `http://localhost:5000/api/externalsearch/fetchlyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`,
      { headers: { 'Content-Type': 'application/json' } }
    );
    if (!res.ok) return;
    const data = await res.json();
    if (!data?.found || !data?.lyrics) return;

    const curr = usePlayerStore.getState().currentTrack;
    const isSame = track.id
      ? curr?.id === track.id
      : curr?.externalUrl === track.externalUrl;
    if (!isSame) return;

    usePlayerStore.setState(s => ({
      currentTrack: s.currentTrack ? { ...s.currentTrack, lyrics: data.lyrics } : null
    }));

    // Save to backend for local tracks
    if (track.id && !track.isExternal) {
      const token = (() => { try { const raw = localStorage.getItem('beatify-auth'); return raw ? JSON.parse(raw)?.state?.token : null; } catch { return null; } })();
      if (token) {
        const fd = new FormData();
        fd.append('Lyrics', data.lyrics);
        fetch(`http://localhost:5000/api/tracks/${track.id}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        }).catch(() => {});
      }
    }
  } catch {}
}

// Debounced localStorage writer so rapid progress updates don't thrash disk
let _saveTimer = null;
const debouncedStorage = {
  getItem:    (key) => localStorage.getItem(key),
  removeItem: (key) => localStorage.removeItem(key),
  setItem:    (key, value) => {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => localStorage.setItem(key, value), 800);
  },
};

async function fetchRadioTracks(trackId) {
  try {
    const { externalSearchApi } = await import('../api');
    const res = await externalSearchApi.radio(trackId, 5);
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}

export const usePlayerStore = create(
  persist(
    (set, get) => ({
      currentTrack: null,
      queue:        [],
      queueIndex:   0,
      isPlaying:    false,
      volume:       0.8,
      progress:     0,
      duration:     0,
      isShuffle:    false,
      isRepeat:     false,
      isRadio:      false,
      eqBands:      [0, 0, 0, 0, 0],
      sleepTimer:        null,
      sleepTimerMinutes: 0,
      audio:        _audio, // excluded from persistence via partialize

      setTrack: (track, queue = [], index = 0) => {
        initAudioContext();
        if (_audioCtx && _audioCtx.state === 'suspended') _audioCtx.resume();
        const offlineUrl = getOfflineAudioUrl(track.id);
        _audio.src = offlineUrl || `http://localhost:5000/api/tracks/${track.id}/stream`;
        _audio.volume = get().volume;
        _audio.play().catch(() => {});
        set({ currentTrack: track, queue, queueIndex: index, isPlaying: true, progress: 0, duration: 0 });
        tracksApi.logPlay(track.id).catch(() => {});
        // Auto-fetch lyrics after brief delay so playback starts first
        setTimeout(() => autoFetchLyrics(track), 2000);
      },

      playTrack: (track, queue = [], index = 0) => get().setTrack(track, queue, index),

      setQueue: (tracks, startId) => {
        const index = tracks.findIndex(t => t.id === startId);
        const idx = index >= 0 ? index : 0;
        get().setTrack(tracks[idx], tracks, idx);
      },

      playExternalUrl: (streamUrl, meta, queue = [], index = 0) => {
        initAudioContext();
        if (_audioCtx && _audioCtx.state === 'suspended') _audioCtx.resume();
        _audio.src = streamUrl;
        _audio.volume = get().volume;
        _audio.play().catch(() => {});
        set({
          currentTrack: {
            id: null, isExternal: true,
            externalUrl: meta.externalUrl,
            title: meta.title,
            artistName: meta.artistName,
            thumbnail: meta.thumbnail,
            coverPath: null,
            source: meta.source,
            duration: meta.duration,
            mediaType: 'audio',
            lyrics: null,
          },
          queue: queue, queueIndex: index, isPlaying: true, progress: 0, duration: 0,
        });
        // Auto-fetch lyrics for external tracks
        const exMeta = { title: meta.title, artistName: meta.artistName, externalUrl: meta.externalUrl, id: null, isExternal: true };
        setTimeout(() => autoFetchLyrics(exMeta), 2000);
      },

      togglePlay: () => {
        initAudioContext();
        if (_audioCtx && _audioCtx.state === 'suspended') _audioCtx.resume();
        const { isPlaying } = get();
        if (isPlaying) {
          _audio.pause();
          set({ isPlaying: false });
        } else {
          _audio.play().catch(() => {});
          set({ isPlaying: true });
        }
      },

      next: async () => {
        const { queue, queueIndex, isShuffle, currentTrack } = get();
        if (!queue.length) return;
        const idx = isShuffle
          ? Math.floor(Math.random() * queue.length)
          : (queueIndex + 1) % queue.length;
        
        const nextTrack = queue[idx];
        if (nextTrack.isExternal || nextTrack.source) {
          try {
            const { externalSearchApi } = await import('../api');
            const res = await externalSearchApi.getPreviewUrl(nextTrack.webpage_url || nextTrack.externalUrl);
            get().playExternalUrl(res.data.streamUrl, {
              title: nextTrack.title,
              artistName: nextTrack.artist || nextTrack.artistName || 'Unknown',
              thumbnail: nextTrack.thumbnail,
              externalUrl: nextTrack.webpage_url || nextTrack.externalUrl,
              source: nextTrack.source,
              duration: nextTrack.duration,
            }, queue, idx);
          } catch (e) { console.error(e); }
        } else {
          get().setTrack(nextTrack, queue, idx);
        }
      },

      prev: async () => {
        const { queue, queueIndex, currentTrack } = get();
        if (_audio.currentTime > 3) { _audio.currentTime = 0; return; }
        if (!queue.length) return;
        const idx = (queueIndex - 1 + queue.length) % queue.length;
        
        const prevTrack = queue[idx];
        if (prevTrack.isExternal || prevTrack.source) {
          try {
            const { externalSearchApi } = await import('../api');
            const res = await externalSearchApi.getPreviewUrl(prevTrack.webpage_url || prevTrack.externalUrl);
            get().playExternalUrl(res.data.streamUrl, {
              title: prevTrack.title,
              artistName: prevTrack.artist || prevTrack.artistName || 'Unknown',
              thumbnail: prevTrack.thumbnail,
              externalUrl: prevTrack.webpage_url || prevTrack.externalUrl,
              source: prevTrack.source,
              duration: prevTrack.duration,
            }, queue, idx);
          } catch (e) { console.error(e); }
        } else {
          get().setTrack(prevTrack, queue, idx);
        }
      },

      setVolume: (vol) => { _audio.volume = vol; set({ volume: vol }); },
      seek:      (time) => { _audio.currentTime = time; set({ progress: time }); },

      toggleShuffle: () => set((s) => ({ isShuffle: !s.isShuffle })),
      toggleRepeat:  () => set((s) => ({ isRepeat:  !s.isRepeat  })),
      setProgress:   (progress) => set({ progress }),
      setDuration:   (duration) => set({ duration }),
      setIsPlaying:  (isPlaying) => set({ isPlaying }),

      // ── Queue manipulation ──────────────────────────────────────────────────
      addToQueue: (track) => {
        set(s => ({ queue: [...s.queue, track] }));
        return true;
      },

      addToQueueNext: (track) => {
        set(s => {
          const newQ = [...s.queue];
          newQ.splice(s.queueIndex + 1, 0, track);
          return { queue: newQ };
        });
      },

      addBulkToQueue: (tracks) => {
        set(s => ({ queue: [...s.queue, ...tracks] }));
      },

      shuffleQueue: () => {
        const { queue, queueIndex } = get();
        if (queue.length < 2) return;
        const current = queue[queueIndex];
        const rest = queue.filter((_, i) => i !== queueIndex);
        const shuffled = rest.sort(() => Math.random() - 0.5);
        set({ queue: [current, ...shuffled], queueIndex: 0 });
      },

      setEqBand: (index, value) => {
        initAudioContext();
        const newBands = [...get().eqBands];
        newBands[index] = value;
        applyEqBands(newBands);
        set({ eqBands: newBands });
      },

      setEqBands: (bands) => {
        initAudioContext();
        applyEqBands(bands);
        set({ eqBands: bands });
      },

      // Sleep timer
      setSleepTimer: (minutes) => {
        if (!minutes) {
          set({ sleepTimer: null, sleepTimerMinutes: 0 });
        } else {
          set({ sleepTimer: Date.now() + minutes * 60000, sleepTimerMinutes: minutes });
        }
      },
      clearSleepTimer: () => set({ sleepTimer: null, sleepTimerMinutes: 0 }),

      // Radio mode
      toggleRadio: () => set((s) => ({ isRadio: !s.isRadio })),

      // Patch the currentTrack object in-place (e.g. after saving lyrics)
      updateCurrentTrack: (updates) =>
        set((s) => ({ currentTrack: s.currentTrack ? { ...s.currentTrack, ...updates } : null })),
    }),
    {
      name:    'beatify-player',
      storage: debouncedStorage,
      // Only persist these fields — audio element and isPlaying are intentionally excluded
      partialize: (s) => ({
        currentTrack: s.currentTrack,
        queue:        s.queue,
        queueIndex:   s.queueIndex,
        isPlaying:    s.isPlaying,
        volume:       s.volume,
        isShuffle:    s.isShuffle,
        isRepeat:     s.isRepeat,
        isRadio:      s.isRadio,
        progress:     s.progress,
        eqBands:      s.eqBands,
      }),
      // After hydration: restore audio source + seek position
      onRehydrateStorage: () => (state) => {
        _audio.volume = state?.volume ?? 0.8;
        if (!state?.currentTrack) return;
        
        // Wait for user interaction to initAudioContext, but we can restore EQ bands later when it's initialized.
        // Or we just rely on setEqBand calls, but we need to apply them on first play.
        // We will call applyEqBands inside initAudioContext by reading from localStorage directly or state.
        
        const seekTo = state.progress ?? 0;
        
        const applyState = () => {
          if (seekTo > 0) _audio.currentTime = seekTo;
          if (state.isPlaying) {
            initAudioContext();
            _audio.play().catch(() => { usePlayerStore.setState({ isPlaying: false }); });
            if (_audioCtx && _audioCtx.state === 'suspended') _audioCtx.resume().catch(()=>{});
          }
        };

        if (!state.currentTrack.isExternal) {
          const offlineUrl = getOfflineAudioUrl(state.currentTrack.id);
          _audio.src = offlineUrl || `http://localhost:5000/api/tracks/${state.currentTrack.id}/stream`;
          if (_audio.readyState >= 1) {
            applyState();
          } else {
            _audio.addEventListener('loadedmetadata', applyState, { once: true });
          }
        } else {
          // External URLs expire quickly, so we reset playback to paused and do not restore the URL
          usePlayerStore.setState({ isPlaying: false });
        }
      },
    }
  )
);
