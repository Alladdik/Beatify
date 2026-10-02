/**
 * Singleton download engine.
 * Reads from downloadQueueStore, posts to /api/download.
 * Survives component unmounts — call startDownloadQueue() from anywhere,
 * only one loop ever runs at a time.
 */

import api from '../api';
import { useDownloadQueueStore } from '../store/downloadQueueStore';

let _running = false;

export async function startDownloadQueue() {
  // Guard: only one loop at a time
  if (_running) return;
  _running = true;

  const store = () => useDownloadQueueStore.getState();
  store().setRunning(true);

  try {
    while (true) {
      const { queue, aborted, updateTrack } = store();

      if (aborted) break;

      const next = queue.find(t => t.status === 'pending');
      if (!next) break;

      updateTrack(next.id, { status: 'downloading' });

      try {
        await api.post('/download', {
          url:        next.url,
          title:      next.title,
          artistName: next.artistName ?? 'Unknown Artist',
          artistId:   null,
          albumId:    null,
          genre:      null,
          coverUrl:   next.coverUrl ?? null,
        });
        updateTrack(next.id, { status: 'done' });
      } catch {
        updateTrack(next.id, { status: 'failed' });
        // Always continue to next track on failure
      }
    }
  } finally {
    _running = false;
    store().setRunning(false);
  }
}

/** Add tracks and immediately start the queue (idempotent). */
export function enqueueAndStart(tracks) {
  useDownloadQueueStore.getState().enqueue(tracks);
  startDownloadQueue(); // no-op if already running
}
