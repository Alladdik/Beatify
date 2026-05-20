import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { tracksApi } from '../api';
import { TrackRow } from '../components/TrackComponents';
import { usePlayerStore } from '../store/playerStore';
import { Play, Pause, Heart } from 'lucide-react';

export default function LikedPage() {
  const { currentTrack, isPlaying, setTrack, togglePlay } = usePlayerStore();
  const { data: tracks = [], isLoading, refetch } = useQuery({
    queryKey: ['liked'],
    queryFn: () => tracksApi.getLiked().then(r => r.data),
  });

  const isPlayingThis = currentTrack && tracks.some(t => t.id === currentTrack.id) && isPlaying;

  return (
    <div className="main-content">
      <div style={{ background: 'linear-gradient(135deg, #4a0e8f, #7c3aed)', padding: '48px 32px 32px', display: 'flex', alignItems: 'flex-end', gap: 24 }}>
        <div style={{ width: 200, height: 200, background: 'linear-gradient(135deg, #a855f7, #7c3aed)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Heart size={80} fill="white" color="white" />
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8, opacity: 0.7 }}>Плейлист</div>
          <h1 style={{ fontSize: 48, fontWeight: 900, marginBottom: 8 }}>Вподобані треки</h1>
          <div style={{ fontSize: 14, opacity: 0.7 }}>{tracks.length} треків</div>
        </div>
      </div>

      <div className="content-body" style={{ paddingTop: 24 }}>
        <div style={{ marginBottom: 24 }}>
          <button className="btn-play-large" onClick={() => {
            if (!tracks.length) return;
            if (isPlayingThis) togglePlay();
            else setTrack(tracks[0], tracks, 0);
          }}>
            {isPlayingThis ? <Pause size={24} /> : <Play size={24} />}
          </button>
        </div>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>
        ) : tracks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
            <Heart size={48} style={{ marginBottom: 12 }} />
            <p>Вподобайте треки натиснувши на ♡</p>
          </div>
        ) : (
          <div className="track-list">
            {tracks.map((t, i) => <TrackRow key={t.id} track={t} index={i} queue={tracks} onLikeChange={refetch} />)}
          </div>
        )}
      </div>
    </div>
  );
}
