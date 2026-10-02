import { create } from 'zustand';
import toast from 'react-hot-toast';
import api from '../api';
import { useAuthStore } from './authStore';

// One source of truth for "is this track liked", so a heart toggled in the player
// instantly updates every list on screen (the per-track `isLiked` from the API is only the seed).
export const useLikesStore = create((set, get) => ({
  ids: new Set(),
  loaded: false,

  load: async () => {
    if (!useAuthStore.getState().token) { set({ ids: new Set(), loaded: false }); return; }
    try {
      const res = await api.get('/tracks/liked/ids');
      set({ ids: new Set(res.data), loaded: true });
    } catch { /* offline — keep what we have */ }
  },

  reset: () => set({ ids: new Set(), loaded: false }),

  isLiked: (track) => {
    if (!track || track.id == null) return false;
    const { ids, loaded } = get();
    return loaded ? ids.has(track.id) : !!track.isLiked;
  },

  toggle: async (track) => {
    if (!track || track.id == null) return;
    if (!useAuthStore.getState().token) { toast('Увійдіть, щоб зберігати вподобані'); return; }
    const was = get().isLiked(track);
    const apply = (liked) => set((s) => {
      const ids = new Set(s.ids);
      if (liked) ids.add(track.id); else ids.delete(track.id);
      return { ids, loaded: true };
    });
    apply(!was);
    try {
      const res = await api.post(`/tracks/${track.id}/like`);
      if (res.data?.liked !== !was) apply(res.data.liked);
    } catch {
      apply(was);
      toast.error('Не вдалося оновити вподобання');
    }
  },
}));

// Reload the set when the session changes
let lastToken = useAuthStore.getState().token;
useAuthStore.subscribe((s) => {
  if (s.token !== lastToken) {
    lastToken = s.token;
    if (s.token) useLikesStore.getState().load(); else useLikesStore.getState().reset();
  }
});
if (lastToken) useLikesStore.getState().load();

export const useIsLiked = (track) =>
  useLikesStore((s) => (s.loaded ? (track?.id != null && s.ids.has(track.id)) : !!track?.isLiked));
