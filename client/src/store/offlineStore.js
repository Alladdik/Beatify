import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { openDB } from 'idb';
import toast from 'react-hot-toast';
import { isElectron, isNative, streamUrl as apiStreamUrl, fileUrl } from '../lib/config';

// Offline copies live where the platform allows:
//   Electron   → files on disk (IPC)         audioUrl = file URL
//   Capacitor  → app Data directory          audioUrl = capacitor://… file URL
//   Browser/PWA→ IndexedDB blob              audioUrl = `idb://<id>` (resolved to a blob: URL on demand)

const DB_NAME = 'beatify_audio_store';
let dbPromise = null;
const getDB = () => {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio');
    },
  });
  return dbPromise;
};

const blobUrls = new Map(); // id → blob: URL (kept for the session)

async function fetchBlob(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Сервер відповів ${res.status}`);
  return res.blob();
}

export const useOfflineStore = create(
  persist(
    (set, get) => ({
      // { [trackId]: { audioUrl, coverUrl, metadata, downloadedAt, size } }
      downloadedTracks: {},
      downloading: {},

      isDownloaded: (trackId) => !!get().downloadedTracks[String(trackId)],
      isDownloading: (trackId) => !!get().downloading[String(trackId)],

      resolveAudioUrl: async (trackId) => {
        const entry = get().downloadedTracks[String(trackId)];
        if (!entry?.audioUrl) return null;
        if (!entry.audioUrl.startsWith('idb://')) return entry.audioUrl;
        const id = String(trackId);
        if (blobUrls.has(id)) return blobUrls.get(id);
        try {
          const blob = await (await getDB()).get('audio', id);
          if (!blob) return null;
          const url = URL.createObjectURL(blob);
          blobUrls.set(id, url);
          return url;
        } catch {
          return null;
        }
      },

      getLocalCoverUrl: (trackId) => get().downloadedTracks[String(trackId)]?.coverUrl ?? null,

      downloadTrack: async (track) => {
        const id = String(track.id);
        if (track.id == null) { toast('Спочатку збережіть трек у бібліотеку'); return; }
        if (get().downloading[id] || get().downloadedTracks[id]) return;
        set((s) => ({ downloading: { ...s.downloading, [id]: true } }));

        try {
          const streamUrl = apiStreamUrl(track.id);
          const coverUrl = track.coverPath ? fileUrl('covers', track.coverPath) : null;
          let audioUrl;
          let finalCover = coverUrl;
          let size = 0;

          if (isElectron) {
            const result = await window.electronAPI.downloadOffline({ trackId: track.id, streamUrl, coverUrl, ext: '.mp3' });
            audioUrl = result.audioUrl;
            finalCover = result.coverUrl ?? coverUrl;
          } else if (isNative) {
            const { Filesystem, Directory } = await import('@capacitor/filesystem');
            const blob = await fetchBlob(streamUrl);
            size = blob.size;
            const data = await new Promise((resolve, reject) => {
              const r = new FileReader();
              r.onloadend = () => resolve(String(r.result).split(',')[1]);
              r.onerror = reject;
              r.readAsDataURL(blob);
            });
            const path = `tracks/offline_${id}.mp3`;
            await Filesystem.writeFile({ path, data, directory: Directory.Data, recursive: true });
            const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
            const { Capacitor } = await import('@capacitor/core');
            audioUrl = Capacitor.convertFileSrc(uri);
          } else {
            const blob = await fetchBlob(streamUrl);
            size = blob.size;
            await (await getDB()).put('audio', blob, id);
            audioUrl = `idb://${id}`;
          }

          set((s) => ({
            downloadedTracks: {
              ...s.downloadedTracks,
              [id]: { audioUrl, coverUrl: finalCover, metadata: track, downloadedAt: Date.now(), size },
            },
            downloading: Object.fromEntries(Object.entries(s.downloading).filter(([k]) => k !== id)),
          }));
          toast.success(`«${track.title}» збережено офлайн`);
        } catch (err) {
          set((s) => ({ downloading: Object.fromEntries(Object.entries(s.downloading).filter(([k]) => k !== id)) }));
          toast.error(`Не вдалося завантажити: ${err.message}`);
        }
      },

      removeTrack: async (trackId) => {
        const id = String(trackId);
        try {
          if (isElectron) await window.electronAPI.removeOffline({ trackId });
          else if (isNative) {
            const { Filesystem, Directory } = await import('@capacitor/filesystem');
            await Filesystem.deleteFile({ path: `tracks/offline_${id}.mp3`, directory: Directory.Data });
          } else {
            await (await getDB()).delete('audio', id);
            const u = blobUrls.get(id);
            if (u) { URL.revokeObjectURL(u); blobUrls.delete(id); }
          }
        } catch { /* already gone */ }
        set((s) => {
          const next = { ...s.downloadedTracks };
          delete next[id];
          return { downloadedTracks: next };
        });
      },

      clearAll: async () => {
        for (const id of Object.keys(get().downloadedTracks)) await get().removeTrack(id);
        set({ downloadedTracks: {} });
      },

      getStats: () => {
        const tracks = Object.values(get().downloadedTracks);
        return {
          count: tracks.length,
          bytes: tracks.reduce((a, t) => a + (t.size || 0), 0),
          oldest: tracks.length ? Math.min(...tracks.map((t) => t.downloadedAt)) : null,
        };
      },
    }),
    {
      name: 'beatify-offline',
      partialize: (s) => ({ downloadedTracks: s.downloadedTracks }),
    }
  )
);
