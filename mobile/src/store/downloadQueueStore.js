import { create } from 'zustand';

/**
 * Global download queue — lives outside any component.
 * Survives navigation, unmounts, re-renders.
 */
export const useDownloadQueueStore = create((set, get) => ({
  // Array of { id, url, title, artistName, coverUrl, status: 'pending'|'downloading'|'done'|'failed' }
  queue: [],
  isRunning: false,
  aborted: false,

  enqueue: (tracks) => {
    // Deduplicate by id — don't re-add tracks that are already queued/done
    set(s => {
      const existingIds = new Set(s.queue.map(t => t.id));
      const newTracks = tracks
        .filter(t => !existingIds.has(t.id))
        .map(t => ({ ...t, status: 'pending' }));
      return { queue: [...s.queue, ...newTracks], aborted: false };
    });
  },

  updateTrack: (id, patch) => set(s => ({
    queue: s.queue.map(t => t.id === id ? { ...t, ...patch } : t),
  })),

  setRunning: (v) => set({ isRunning: v }),

  abort: () => set({ aborted: true }),

  clearFinished: () => set(s => ({
    queue: s.queue.filter(t => t.status === 'pending' || t.status === 'downloading'),
  })),

  clearAll: () => set({ queue: [], isRunning: false, aborted: false }),

  // Derived helpers (call getState() to use these outside React)
  get pending() { return get().queue.filter(t => t.status === 'pending'); },
  get doneCount() { return get().queue.filter(t => t.status === 'done').length; },
  get failCount() { return get().queue.filter(t => t.status === 'failed').length; },
}));
