import { create } from 'zustand';
import { downloadApi } from '../api';

export const useImportStore = create((set, get) => ({
  playlistInfo: null,
  isImporting: false,
  progress: { current: 0, total: 0 },
  results: [],

  setPlaylistInfo: (info) => set({ playlistInfo: info }),
  
  startImport: async (playlistTracks, qc) => {
    if (get().isImporting) return;
    
    set({
      isImporting: true,
      progress: { current: 0, total: playlistTracks.length },
      results: []
    });

    for (let i = 0; i < playlistTracks.length; i++) {
      const track = playlistTracks[i];
      set(s => ({ progress: { ...s.progress, current: i + 1 } }));
      
      try {
        const payload = {
          url: track.query,
          title: track.title,
          artistName: track.artist,
          coverUrl: track.coverUrl ?? null
        };
        await downloadApi.download(payload);
        set(s => ({ results: [...s.results, { track, status: 'success' }] }));
      } catch (err) {
        set(s => ({ results: [...s.results, { track, status: 'error', error: err.response?.data?.message || 'Помилка' }] }));
      }
    }

    set({ isImporting: false });
    if (qc) {
      qc.invalidateQueries(['allTracks']);
      qc.invalidateQueries(['trending']);
      qc.invalidateQueries(['newReleases']);
      qc.invalidateQueries(['adminTracks']);
      qc.invalidateQueries(['artists']);
    }
  },

  reset: () => set({ playlistInfo: null, isImporting: false, progress: { current: 0, total: 0 }, results: [] })
}));
