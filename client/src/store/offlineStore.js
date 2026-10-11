import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { openDB } from 'idb';
import toast from 'react-hot-toast';
import { externalSearchApi, errMsg } from '../api';
import { isExternal } from '../lib/tracks';
import { isElectron, isNative, streamUrl as apiStreamUrl, fileUrl } from '../lib/config';

// Offline copies live where the platform allows:
//   Electron   → files on disk (IPC)         audioUrl = local:// URL
//   Capacitor  → app Data directory          audioUrl = capacitor://… file URL
//   Browser/PWA→ IndexedDB blob              audioUrl = `idb://<key>` (resolved to a blob: URL on demand)
//
// Library tracks are keyed by their id ("42"), search results from YouTube / SoundCloud by their `key`
// ("ext:youtube:abc") — so anyone signed in can keep a search result on their own device without
// needing the permission to import it into the server library.

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

/** Storage key of a track, or of an already-computed key. */
export const offlineKey = (t) => {
  if (t == null) return '';
  if (typeof t !== 'object') return String(t);
  if (t.id != null) return String(t.id);
  return t.key || t.externalUrl || t.webpage_url || '';
};

// Safe as a file name on every platform; library ids stay as they are
const fileId = (key) => {
  if (/^\d+$/.test(key)) return key;
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h * 33) ^ key.charCodeAt(i)) >>> 0;
  return `${key.replace(/[^\w-]+/g, '_').slice(0, 48)}_${h.toString(36)}`;
};

async function fetchBlob(url) {
  let res;
  try { res = await fetch(url); } catch { throw new Error('немає зʼєднання із сервером'); }
  if (!res.ok) throw new Error(`сервер відповів ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (/text\/html|application\/json/i.test(type)) throw new Error('сервер повернув не аудіо');
  const blob = await res.blob();
  if (!blob.size) throw new Error('файл порожній');
  return blob;
}

/** Where the audio bytes come from: our own stream for library tracks, a signed proxy for search results. */
async function sourceUrl(track) {
  if (!isExternal(track)) return apiStreamUrl(track.id);
  const page = track.externalUrl || track.webpage_url;
  if (!page) throw new Error('у треку немає посилання на джерело');
  const res = await externalSearchApi.getPreviewUrl(page);
  if (!res.data?.streamUrl) throw new Error('не вдалося отримати аудіо з цього джерела');
  return res.data.streamUrl;
}

export const useOfflineStore = create(
  persist(
    (set, get) => ({
      // { [key]: { audioUrl, coverUrl, metadata, downloadedAt, size } }
      downloadedTracks: {},
      downloading: {},

      isDownloaded: (t) => !!get().downloadedTracks[offlineKey(t)],
      isDownloading: (t) => !!get().downloading[offlineKey(t)],

      resolveAudioUrl: async (t) => {
        const id = offlineKey(t);
        const entry = get().downloadedTracks[id];
        if (!entry?.audioUrl) return null;
        if (!entry.audioUrl.startsWith('idb://')) return entry.audioUrl;
        // A fresh blob: URL every time — the player revokes the previous one when the track changes, so handing out a
        // remembered URL would make a second play of the same saved track fail with "source not supported"
        try {
          const blob = await (await getDB()).get('audio', id);
          return blob ? URL.createObjectURL(blob) : null;
        } catch {
          return null;
        }
      },

      getLocalCoverUrl: (t) => get().downloadedTracks[offlineKey(t)]?.coverUrl ?? null,

      downloadTrack: async (track) => {
        const id = offlineKey(track);
        if (!id) { toast('Спочатку збережіть трек у бібліотеку'); return; }
        if (get().downloading[id] || get().downloadedTracks[id]) return;
        set((s) => ({ downloading: { ...s.downloading, [id]: true } }));
        const t = toast.loading(`Завантажую «${track.title}»…`);

        try {
          const streamUrl = await sourceUrl(track);
          const ext = isExternal(track);
          const coverUrl = ext ? (track.thumbnail ?? null) : track.coverPath ? fileUrl('covers', track.coverPath) : null;
          const name = fileId(id);
          let audioUrl;
          let finalCover = coverUrl;
          let size = 0;

          if (isElectron) {
            const result = await window.electronAPI.downloadOffline({ trackId: name, streamUrl, coverUrl });
            audioUrl = result.audioUrl;
            finalCover = result.coverUrl ?? coverUrl;
            size = result.size ?? 0;
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
            const path = `tracks/offline_${name}.mp3`;
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
          toast.success(`«${track.title}» збережено офлайн`, { id: t });
        } catch (err) {
          set((s) => ({ downloading: Object.fromEntries(Object.entries(s.downloading).filter(([k]) => k !== id)) }));
          const reason = err?.response ? errMsg(err, 'помилка сервера') : err?.message;
          toast.error(`Не вдалося завантажити: ${reason}`, { id: t });
        }
      },

      removeTrack: async (t) => {
        const id = offlineKey(t);
        const name = fileId(id);
        try {
          if (isElectron) await window.electronAPI.removeOffline({ trackId: name });
          else if (isNative) {
            const { Filesystem, Directory } = await import('@capacitor/filesystem');
            await Filesystem.deleteFile({ path: `tracks/offline_${name}.mp3`, directory: Directory.Data });
          } else {
            await (await getDB()).delete('audio', id);
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
