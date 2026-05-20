import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tracksApi, fileUrl, playlistsApi } from '../api';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import { Heart, Plus, Play, ChevronUp, X, Music2 } from 'lucide-react';
import toast from 'react-hot-toast';

function DiscoveryItem({ track, isActive }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const { user } = useAuthStore();
  const { setTrack: setGlobalTrack, isPlaying: globalPlaying, togglePlay } = usePlayerStore();
  const qc = useQueryClient();
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [localIsLiked, setLocalIsLiked] = useState(track.isLiked);

  const cover = track.coverPath ? fileUrl('covers', track.coverPath) : null;

  useEffect(() => {
    if (isActive) {
      const audio = new Audio(tracksApi.streamUrl(track.id));
      audioRef.current = audio;
      audio.volume = 0.7;
      
      // Start from a random point (e.g., first 30% of the song)
      audio.addEventListener('loadedmetadata', () => {
        const start = Math.random() * (audio.duration * 0.4);
        audio.currentTime = start;
        audio.play().catch(e => console.log("Autoplay blocked", e));
        setIsPlaying(true);
      });

      // Stop after 15 seconds or when song ends
      const timer = setTimeout(() => {
        audio.pause();
        setIsPlaying(false);
      }, 15000);

      return () => {
        clearTimeout(timer);
        audio.pause();
        audio.src = '';
        audioRef.current = null;
      };
    }
  }, [isActive, track.id]);

  const toggleLike = async (e) => {
    e.stopPropagation();
    if (!user) return toast.error('Увійдіть, щоб лайкнути');
    
    // Optimistic update
    setLocalIsLiked(!localIsLiked);
    
    try {
      await tracksApi.like(track.id);
      qc.invalidateQueries(['liked']);
      toast.success(!localIsLiked ? 'Додано до улюблених' : 'Видалено з улюблених');
    } catch { 
      // Revert on error
      setLocalIsLiked(localIsLiked);
      toast.error('Помилка'); 
    }
  };

  const openPlaylistMenu = async (e) => {
    e.stopPropagation();
    if (!user) return toast.error('Увійдіть, щоб додавати в плейліст');
    try {
      const res = await playlistsApi.getAll();
      setPlaylists(res.data);
      setShowPlaylistMenu(true);
    } catch { toast.error('Помилка завантаження плейлістів'); }
  };

  const handleAddToPlaylist = async (e, playlistId) => {
    e.stopPropagation();
    try {
      await playlistsApi.addTrack(playlistId, track.id);
      toast.success('Додано до плейліста');
      setShowPlaylistMenu(false);
    } catch { toast.error('Помилка або трек вже є у плейлісті'); }
  };

  const playFull = () => {
    if (audioRef.current) audioRef.current.pause();
    setIsPlaying(false);
    setGlobalTrack(track, [track], 0);
    toast.success('Відтворюється повністю');
  };

  return (
    <div className="discovery-item" style={{ 
      height: '100%', 
      width: '100%', 
      scrollSnapAlign: 'start', 
      position: 'relative',
      overflow: 'hidden',
      background: '#000'
    }}>
      {/* Background Layer (Blurred Cover) */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `url(${cover})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'blur(60px) brightness(0.4)',
        transform: 'scale(1.2)',
        zIndex: 0
      }} />

      {/* Content Overlay */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0 20px'
      }}>
        
        {/* Vinyl/Cover Rotating Animation */}
        <div style={{
          width: 280,
          height: 280,
          position: 'relative',
          marginBottom: 40,
          perspective: '1000px'
        }}>
          <img 
            src={cover || '/default-cover.png'} 
            alt="" 
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: '20px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
              border: '1px solid rgba(255,255,255,0.1)',
              animation: isPlaying ? 'float 6s ease-in-out infinite' : 'none'
            }}
          />
          {isPlaying && (
            <div style={{
              position: 'absolute',
              bottom: -15,
              right: -15,
              width: 50,
              height: 50,
              background: 'var(--accent)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#000',
              boxShadow: '0 0 20px var(--accent-glow)'
            }}>
              <Music2 size={24} style={{ animation: 'spin 3s linear infinite' }} />
            </div>
          )}
        </div>

        {/* Track Details */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h2 style={{ fontSize: 32, fontWeight: 900, marginBottom: 8, letterSpacing: '-0.5px' }}>{track.title}</h2>
          <p style={{ fontSize: 18, color: 'var(--text-secondary)', fontWeight: 500 }}>{track.artistName || 'Невідомий виконавець'}</p>
        </div>

        {/* Controls Overlay (Right side) */}
        <div style={{
          position: 'absolute',
          right: 20,
          bottom: '15%',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          alignItems: 'center'
        }}>
          <button className="discovery-btn" onClick={toggleLike} style={{ 
            width: 54, height: 54, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', 
            backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', color: localIsLiked ? 'var(--accent)' : '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
          }}>
            <Heart size={28} fill={localIsLiked ? 'var(--accent)' : 'none'} />
          </button>
          
          <button className="discovery-btn" onClick={openPlaylistMenu} style={{ 
            width: 54, height: 54, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', 
            backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
          }}>
            <Plus size={28} />
          </button>

          <button className="discovery-btn" onClick={playFull} style={{ 
            width: 54, height: 54, borderRadius: '50%', background: 'var(--accent)', 
            color: '#000', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            boxShadow: '0 8px 24px var(--accent-glow)'
          }}>
            <Play size={28} fill="#000" />
          </button>
        </div>

        {/* Playlist Menu Overlay */}
        {showPlaylistMenu && (
          <div style={{
            position: 'absolute', right: 85, bottom: '25%', background: 'rgba(20,20,30,0.95)', 
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 12, zIndex: 50,
            boxShadow: '0 12px 32px rgba(0,0,0,0.8)', width: 220, backdropFilter: 'blur(20px)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Додати до...</span>
              <X size={16} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={(e) => { e.stopPropagation(); setShowPlaylistMenu(false); }} />
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {playlists.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>Немає плейлістів</div>}
              {playlists.map(p => (
                <button key={p.id} onClick={(e) => handleAddToPlaylist(e, p.id)} style={{
                  background: 'transparent', border: 'none', color: '#fff', 
                  textAlign: 'left', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 14,
                  fontWeight: 500, transition: 'background 0.2s'
                }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {p.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Swipe Hint */}
        <div style={{ position: 'absolute', bottom: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: 0.5 }}>
          <ChevronUp size={20} style={{ animation: 'bounce 2s infinite' }} />
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', marginTop: 4 }}>Swipe for more</span>
        </div>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-15px) rotate(2deg); }
        }
        @keyframes bounce {
          0%, 20%, 50%, 80%, 100% {transform: translateY(0);}
          40% {transform: translateY(-10px);}
          60% {transform: translateY(-5px);}
        }
        .discovery-btn:hover { transform: scale(1.1); transition: transform 0.2s; }
      `}</style>
    </div>
  );
}

export default function DiscoveryPage() {
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef(null);

  const { isPlaying: globalPlaying, togglePlay } = usePlayerStore();

  // Зупиняємо глобальний плеєр при вході в Discovery
  useEffect(() => {
    if (globalPlaying) togglePlay();
  }, [globalPlaying]);

  // Завантажуємо значну кількість треків для скролінгу
  const { data: tracks = [], isLoading } = useQuery({
    queryKey: ['discoveryTracks'],
    queryFn: () => tracksApi.getAllAdmin().then(r => {
      // Перемішуємо всі треки
      return r.data.sort(() => Math.random() - 0.5);
    })
  });

  const handleScroll = (e) => {
    const height = e.target.clientHeight;
    const index = Math.round(e.target.scrollTop / height);
    if (index !== activeIndex) {
      setActiveIndex(index);
    }
  };

  // Покращений скролінг коліщатком миші для Desktop
  const handleWheel = (e) => {
    if (!containerRef.current) return;
    e.preventDefault();
    const direction = e.deltaY > 0 ? 1 : -1;
    const nextIndex = Math.max(0, Math.min(tracks.length - 1, activeIndex + direction));
    
    containerRef.current.scrollTo({
      top: nextIndex * containerRef.current.clientHeight,
      behavior: 'smooth'
    });
  };

  if (isLoading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}><Music2 size={40} className="animate-spin" /></div>;

  return (
    <div className="main-content" style={{ padding: 0, height: 'calc(100vh - var(--player-height) - var(--titlebar-height))', overflow: 'hidden' }}>
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        onWheel={handleWheel}
        style={{
          height: '100%',
          overflowY: 'auto',
          scrollSnapType: 'y mandatory',
          scrollbarWidth: 'none', // Hide scrollbar for Chrome/Safari
          msOverflowStyle: 'none'
        }}
      >
        {tracks.map((track, i) => (
          <DiscoveryItem 
            key={track.id} 
            track={track} 
            isActive={i === activeIndex} 
          />
        ))}
      </div>
    </div>
  );
}
