import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import toast from 'react-hot-toast';
import { openDB } from 'idb';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

const DB_NAME = 'beatify_mobile_audio_store';
let dbPromise = null;

function getAudioDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('audio_blobs')) {
          db.createObjectStore('audio_blobs');
        }
      },
    });
  }
  return dbPromise;
}

const getBaseUrl = () => {
  const customIp = localStorage.getItem('beatify_server_ip');
  if (customIp) return customIp.replace(/\/$/, '');
  const _h = window.location.hostname;
  return `http://${_h}:5000`;
};

export const useOfflineStore = create(
  persist(
    (set, get) => ({
      // { [trackId]: { audioUrl, coverUrl, metadata, downloadedAt } }
      downloadedTracks: {},
      // { [trackId]: true } — currently downloading
      downloading: {},

      isDownloaded: (trackId) => !!get().downloadedTracks[String(trackId)],
      isDownloading: (trackId) => !!get().downloading[String(trackId)],

      getLocalAudioUrl: async (trackId) => {
        const entry = get().downloadedTracks[String(trackId)];
        if (!entry) return null;

        // If IndexedDB key
        if (entry.audioUrl && entry.audioUrl.startsWith('idb://')) {
          const db = await getAudioDB();
          const blob = await db.get('audio_blobs', String(trackId));
          if (blob) return URL.createObjectURL(blob);
        }

        return entry?.audioUrl ?? null;
      },

      getLocalCoverUrl: (trackId) => {
        const entry = get().downloadedTracks[String(trackId)];
        return entry?.coverUrl ?? null;
      },

      downloadTrack: async (track) => {
        const id = String(track.id);
        if (get().downloading[id] || get().downloadedTracks[id]) return;

        set(s => ({ downloading: { ...s.downloading, [id]: true } }));

        try {
          const baseUrl = getBaseUrl();
          const streamUrl = `${baseUrl}/api/tracks/${track.id}/stream`;
          const coverUrl = track.coverPath ? `${baseUrl}/uploads/covers/${track.coverPath}` : (track.coverUrl || null);

          let finalAudioUrl = streamUrl;
          let finalCoverUrl = coverUrl;

          if (window.electronAPI) {
            // Electron environment
            const result = await window.electronAPI.downloadOffline({
              trackId: track.id,
              streamUrl,
              coverUrl,
              ext: '.mp3',
            });
            finalAudioUrl = result.audioUrl;
            finalCoverUrl = result.coverUrl;
          } else if (Capacitor.isNativePlatform()) {
            // Capacitor iOS native environment
            const resp = await fetch(streamUrl);
            const blob = await resp.blob();
            const base64Data = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result.split(',')[1]);
              reader.readAsDataURL(blob);
            });

            const fileName = `offline_${id}.mp3`;
            await Filesystem.writeFile({
              path: `tracks/${fileName}`,
              data: base64Data,
              directory: Directory.Data,
              recursive: true,
            });

            const fileUri = await Filesystem.getUri({
              path: `tracks/${fileName}`,
              directory: Directory.Data,
            });

            finalAudioUrl = Capacitor.convertFileSrc(fileUri.uri);
          } else {
            // PC Web Browser environment (IndexedDB)
            const resp = await fetch(streamUrl);
            if (!resp.ok) throw new Error('Помилка отримання файлу з сервера');
            const blob = await resp.blob();
            const db = await getAudioDB();
            await db.put('audio_blobs', blob, id);
            finalAudioUrl = `idb://${id}`;
          }

          set(s => ({
            downloadedTracks: {
              ...s.downloadedTracks,
              [id]: {
                audioUrl: finalAudioUrl,
                coverUrl: finalCoverUrl,
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
        } else if (Capacitor.isNativePlatform()) {
          try {
            await Filesystem.deleteFile({
              path: `tracks/offline_${id}.mp3`,
              directory: Directory.Data,
            });
          } catch { /* ignore */ }
        } else {
          try {
            const db = await getAudioDB();
            await db.delete('audio_blobs', id);
          } catch { /* ignore */ }
        }

        set(s => {
          const next = { ...s.downloadedTracks };
          delete next[id];
          return { downloadedTracks: next };
        });
        toast.success('Трек видалено з офлайну');
      },

      clearAll: async () => {
        const ids = Object.keys(get().downloadedTracks);
        for (const id of ids) {
          await get().removeTrack(id);
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
      partialize: (s) => ({ downloadedTracks: s.downloadedTracks }),
    }
  )
);
