import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { playlistsApi, errMsg } from '../api';
import { useAuthStore } from '../store/authStore';

export function useMyPlaylists() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['myPlaylists'],
    queryFn: () => playlistsApi.getAll().then((r) => r.data),
    enabled: !!token,
    retry: false,
    staleTime: 60_000,
  });
}

export function usePlaylistActions() {
  const qc = useQueryClient();

  const create = async (title, trackId) => {
    try {
      const res = await playlistsApi.create({ title, description: '', isPublic: false });
      if (trackId != null) await playlistsApi.addTrack(res.data.id, trackId);
      qc.invalidateQueries({ queryKey: ['myPlaylists'] });
      return res.data;
    } catch (e) {
      toast.error(errMsg(e, 'Не вдалося створити плейлист'));
      return null;
    }
  };

  const addTrack = async (playlist, track) => {
    try {
      await playlistsApi.addTrack(playlist.id, track.id);
      qc.invalidateQueries({ queryKey: ['myPlaylists'] });
      qc.invalidateQueries({ queryKey: ['playlist', String(playlist.id)] });
      toast.success(`Додано до «${playlist.title}»`);
      return true;
    } catch (e) {
      toast.error(e?.response?.status === 409 ? 'Цей трек уже в плейлисті' : errMsg(e, 'Не вдалося додати трек'));
      return false;
    }
  };

  return { create, addTrack };
}
