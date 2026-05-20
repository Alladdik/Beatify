import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import toast from 'react-hot-toast';

const BASE_URL = 'http://localhost:5000';

export const useOfflineStore = create(
  persist(
    (set, get) => ({
      // { [trackId]: { audioUrl, coverUrl, metadata, downloadedAt } }
      downloadedTracks: {},
      // { [trackId]: true } — currently downloading
      downloading: {},

      isDownloaded: (trackId) => !!get().downloadedTracks[String(trackId)],
      isDownloading: (trackId) => !!get().downloading[String(trackId)],

      getLocalAudioUrl: (trackId) => {
        const entry = get().downloadedTracks[String(trackId)];
        return entry?.audioUrl ?? null;
      },

      getLocalCoverUrl: (trackId) => {
        const entry = get().downloadedTracks[String(trackId)];
        return entry?.coverUrl ?? null;
      },

      downloadTrack: async (track) => {
        const id = String(track.id);
        if (get().downloading[id] || get().downloadedTracks[id]) return;
        if (!window.electronAPI) {
          toast.error('Офлайн-режим доступний лише в Electron-додатку');
          return;
        }

        set(s => ({ downloading: { ...s.downloading, [id]: true } }));

        try {
          const streamUrl = `${BASE_URL}/api/tracks/${track.id}/stream`;
          const coverUrl  = track.coverPath ? `${BASE_URL}/uploads/covers/${track.coverPath}` : null;

          const result = await window.electronAPI.downloadOffline({
            trackId: track.id,
            streamUrl,
            coverUrl,
            ext: '.mp3',
          });

          set(s => ({
            downloadedTracks: {
              ...s.downloadedTracks,
              [id]: {
                audioUrl: result.audioUrl,
                coverUrl: result.coverUrl,
                metadata: track,
                downloadedAt: Date.now(),
              },
            },
            downloading: Object.fromEntries(Object.entries(s.downloading).filter(([k]) => k !== id)),
          }));

          toast.success(`"${track.title}" збережено офлайн`);
        } catch (err) {
          set(s => ({
            downloading: Object.fromEntries(Object.entries(s.downloading).filter(([k]) => k !== id)),
          }));
          toast.error(`Помилка завантаження: ${err.message}`);
        }
      },

      removeTrack: async (trackId) => {
        const id = String(trackId);
        if (window.electronAPI) {
          try { await window.electronAPI.removeOffline({ trackId }); } catch { /* ignore */ }
        }
        set(s => {
          const next = { ...s.downloadedTracks };
          delete next[id];
          return { downloadedTracks: next };
        });
      },

      clearAll: async () => {
        const ids = Object.keys(get().downloadedTracks);
        if (window.electronAPI) {
          for (const id of ids) {
            try { await window.electronAPI.removeOffline({ trackId: id }); } catch { /* ignore */ }
          }
        }
        set({ downloadedTracks: {} });
      },

      getStats: () => {
        const tracks = Object.values(get().downloadedTracks);
        return { count: tracks.length, oldest: tracks.length ? Math.min(...tracks.map(t => t.downloadedAt)) : null };
      },
    }),
    {
      name: 'beatify-offline',
      // Only persist downloadedTracks, not the transient downloading map
      partialize: (s) => ({ downloadedTracks: s.downloadedTracks }),
    }
  )
);
