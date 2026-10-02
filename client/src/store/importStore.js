import { create } from 'zustand';
import { downloadApi, playlistsApi } from '../api';

export const useImportStore = create((set, get) => ({
  playlistInfo: null,
  isImporting: false,
  progress: { current: 0, total: 0 },
  results: [],
  createdPlaylistId: null,

  setPlaylistInfo: (info) => set({ playlistInfo: info }),
  
  startImport: async (playlistTracks, qc, { createPlaylist = true } = {}) => {
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
        const res = await downloadApi.download(payload);
        set(s => ({ results: [...s.results, { track, status: 'success', trackId: res.data?.trackId }] }));
      } catch (err) {
        set(s => ({ results: [...s.results, { track, status: 'error', error: err.response?.data?.message || 'Помилка' }] }));
      }
    }

    // Everything that landed in the library becomes one Beatify playlist, in Spotify's order
    if (createPlaylist) {
      const ids = get().results.filter((r) => r.status === 'success' && r.trackId).map((r) => r.trackId);
      if (ids.length) {
        try {
          const pl = await playlistsApi.create({ title: get().playlistInfo?.name || 'Імпорт зі Spotify', description: 'Імпортовано зі Spotify', isPublic: false });
          for (const id of ids) await playlistsApi.addTrack(pl.data.id, id).catch(() => {});
          set({ createdPlaylistId: pl.data.id });
        } catch { /* tracks are in the library regardless */ }
      }
    }

    set({ isImporting: false });
    if (qc) {
      qc.invalidateQueries({ queryKey: ['myPlaylists'] });
      qc.invalidateQueries(['allTracks']);
      qc.invalidateQueries(['trending']);
      qc.invalidateQueries(['newReleases']);
      qc.invalidateQueries(['adminTracks']);
      qc.invalidateQueries(['artists']);
    }
  },

  reset: () => set({ playlistInfo: null, isImporting: false, progress: { current: 0, total: 0 }, results: [], createdPlaylistId: null })
}));
