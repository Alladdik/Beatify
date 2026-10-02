import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tracksApi, externalSearchApi } from '../api';
import { isExternal, trackKey } from '../lib/tracks';
import { parseLRC, isSyncedLyrics } from '../lib/lrc';
import { usePlayerStore } from '../store/playerStore';

/**
 * Lyrics for a track. Library tracks ask the server, which fetches once and caches in the DB;
 * external tracks are looked up by artist + title. Result is shared by the dock and the full-screen view.
 */
export function useLyrics(track) {
  const ext = isExternal(track);
  const key = track ? trackKey(track) : null;

  const q = useQuery({
    queryKey: ['lyrics', key],
    enabled: !!track && !(track.lyrics),
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      if (!ext) {
        const res = await tracksApi.getLyrics(track.id);
        return res.data?.lyrics ?? null;
      }
      const res = await externalSearchApi.fetchLyrics(track.artistName, track.title);
      return res.data?.found ? (res.data.lyrics ?? res.data.options?.[0]?.lyrics ?? null) : null;
    },
  });

  const raw = track?.lyrics || q.data || '';
  const lines = useMemo(() => parseLRC(raw), [raw]);
  const synced = useMemo(() => isSyncedLyrics(lines), [lines]);

  // Keep the store's currentTrack in step so other views see the lyrics too
  useEffect(() => {
    const cur = usePlayerStore.getState().currentTrack;
    if (q.data && cur && !cur.lyrics && trackKey(cur) === key) usePlayerStore.getState().updateCurrentTrack({ lyrics: q.data });
  }, [q.data, key]);

  return { lines, synced, loading: q.isFetching, notFound: !!track && !raw && !q.isFetching, raw };
}
