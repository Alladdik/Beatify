import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { albumsApi, fileUrl } from '../api';
import { TrackRow } from '../components/TrackComponents';
import { usePlayerStore } from '../store/playerStore';
import { Play, Pause, Disc3 } from 'lucide-react';

export default function AlbumPage() {
  const { id } = useParams();
  const { currentTrack, isPlaying, setTrack, togglePlay } = usePlayerStore();

  const { data: album } = useQuery({ queryKey: ['album', id], queryFn: () => albumsApi.getById(id).then(r => r.data) });
  const { data: tracks = [] } = useQuery({ queryKey: ['albumTracks', id], queryFn: () => albumsApi.getTracks(id).then(r => r.data) });

  const cover = album?.coverPath ? fileUrl('covers', album.coverPath) : null;
  const isPlayingThis = currentTrack && tracks.some(t => t.id === currentTrack.id) && isPlaying;

  const handlePlay = () => {
    if (!tracks.length) return;
    if (isPlayingThis) togglePlay();
    else setTrack(tracks[0], tracks, 0);
  };

  const totalDuration = tracks.reduce((a, t) => a + t.duration, 0);
  const formatTotal = (s) => `${Math.floor(s / 60)} хв ${s % 60} сек`;

  return (
    <div className="main-content">
      <div style={{ background: 'linear-gradient(135deg, #1f2937, #374151, #111827)', padding: '48px 32px 32px', display: 'flex', alignItems: 'flex-end', gap: 24 }}>
        {cover
          ? <img src={cover} style={{ width: 200, height: 200, borderRadius: 8, objectFit: 'cover', boxShadow: '0 8px 40px rgba(0,0,0,0.6)', flexShrink: 0 }} alt="" />
          : <div style={{ width: 200, height: 200, background: 'rgba(0,0,0,0.3)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Disc3 size={80} color="rgba(255,255,255,0.4)" /></div>
        }
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8, opacity: 0.7 }}>Альбом</div>
          <h1 style={{ fontSize: 40, fontWeight: 900, marginBottom: 8 }}>{album?.title}</h1>
          <div style={{ fontSize: 14, opacity: 0.7 }}>{album?.artistName} • {album?.year} • {tracks.length} треків • {formatTotal(totalDuration)}</div>
        </div>
      </div>

      <div className="content-body" style={{ paddingTop: 24 }}>
        <div style={{ marginBottom: 24 }}>
          <button className="btn-play-large" onClick={handlePlay}>
            {isPlayingThis ? <Pause size={24} /> : <Play size={24} />}
          </button>
        </div>
        <div className="track-list">
          {tracks.map((t, i) => <TrackRow key={t.id} track={t} index={i} queue={tracks} />)}
        </div>
      </div>
    </div>
  );
}
