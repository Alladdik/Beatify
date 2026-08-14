import React, { useRef, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { artistsApi, fileUrl } from '../api';
import { TrackRow } from '../components/TrackComponents';
import { usePlayerStore } from '../store/playerStore';
import { useAlbumColor } from '../hooks/useAlbumColor';
import { Play, Pause, Music2, Disc3 } from 'lucide-react';

function ArtistCanvas({ color }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const [r, g, b] = color || [29, 185, 84];
    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 3 + 1,
      speedX: (Math.random() - 0.5) * 0.4,
      speedY: (Math.random() - 0.5) * 0.4,
      opacity: Math.random() * 0.5 + 0.1,
    }));

    let raf;
    let animating = true;
    const draw = () => {
      if (!animating) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.speedX;
        p.y += p.speedY;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${p.opacity})`;
        ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { animating = false; cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [color?.toString()]);

  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
}

export default function ArtistPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentTrack, isPlaying, setTrack, togglePlay } = usePlayerStore();

  const [showAll, setShowAll] = useState(false);

  const { data: artist } = useQuery({ queryKey: ['artist', id], queryFn: () => artistsApi.getById(id).then(r => r.data) });
  const { data: tracks = [] } = useQuery({ queryKey: ['artistTracks', id], queryFn: () => artistsApi.getTracks(id).then(r => r.data) });
  const { data: albums = [] } = useQuery({ queryKey: ['artistAlbums', id], queryFn: () => artistsApi.getAlbums(id).then(r => r.data) });

  const img = artist?.imagePath ? fileUrl('artists', artist.imagePath) : null;
  const color = useAlbumColor(img);
  const isPlayingThis = currentTrack && tracks.some(t => t.id === currentTrack.id) && isPlaying;

  const handlePlay = () => {
    if (!tracks.length) return;
    if (isPlayingThis) togglePlay();
    else setTrack(tracks[0], tracks, 0);
  };

  return (
    <div className="main-content">
      <div className="artist-header" style={{ background: `linear-gradient(to bottom, rgba(29,185,84,0.15), var(--bg-base))`, position: 'relative', overflow: 'hidden' }}>
        <ArtistCanvas color={color ? [color.r, color.g, color.b] : null} />
        {img && <img src={img} className="artist-header-img" alt="" />}
        <div className="artist-header-content">
          <div style={{ fontSize: 12, marginBottom: 8, opacity: 0.7 }}>✓ Verified Artist</div>
          <div className="artist-name">{artist?.name}</div>
          <div className="artist-listeners">{(artist?.monthlyListeners || 0).toLocaleString()} щомісячних слухачів</div>
        </div>
      </div>

      <div className="content-body" style={{ paddingTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <button className="btn-play-large" onClick={handlePlay}>
            {isPlayingThis ? <Pause size={24} /> : <Play size={24} />}
          </button>
          {artist?.genre && <span className="pill green">{artist.genre}</span>}
        </div>

        {artist?.bio && (
          <div style={{ marginBottom: 32, padding: 20, background: 'var(--bg-elevated)', borderRadius: 12 }}>
            <h3 style={{ marginBottom: 8, fontSize: 16, fontWeight: 700 }}>Про виконавця</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>{artist.bio}</p>
          </div>
        )}

        {tracks.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Популярні треки</h2>
            <div className="track-list">
              {tracks.slice(0, showAll ? undefined : 8).map((t, i) => <TrackRow key={t.id} track={t} index={i} queue={tracks} />)}
            </div>
            {tracks.length > 8 && (
              <div style={{ marginTop: 12 }}>
                <button
                  onClick={() => setShowAll(v => !v)}
                  style={{ padding: '10px 24px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  {showAll ? 'Показати менше' : `Показати всі ${tracks.length} треків`}
                </button>
              </div>
            )}
          </section>
        )}

        {albums.length > 0 && (
          <section>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Альбоми</h2>
            <div className="cards-grid">
              {albums.map(a => (
                <div key={a.id} className="card" onClick={() => navigate(`/album/${a.id}`)}>
                  <div className="card-cover" style={{ background: 'linear-gradient(135deg, #374151, #1f2937)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Disc3 size={40} color="var(--text-muted)" />
                  </div>
                  <div className="card-title">{a.title}</div>
                  <div className="card-sub">{a.year} • {a.trackCount} треків</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
