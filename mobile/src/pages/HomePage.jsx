import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tracksApi, artistsApi, albumsApi, statsApi, fileUrl, playlistsApi } from '../api';
import { usePlayerStore } from '../store/playerStore';
import { TrackCard } from '../components/TrackComponents';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Play, TrendingUp, Music2, Disc3, Sparkles, Heart, ListPlus, X, Shuffle, Radio, ListMusic } from 'lucide-react';
import toast from 'react-hot-toast';

function fmt(s) {
  if (!s) return '';
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function ArtistCard({ artist, onClick }) {
  const img = artist.imagePath ? fileUrl('artists', artist.imagePath) : null;
  return (
    <div className="card" onClick={onClick}>
      {img ? <img src={img} alt="" className="card-cover rounded" />
        : <div className="card-cover rounded" style={{ background: 'linear-gradient(135deg, #1a1a3e, #4338ca)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Music2 size={40} color="white" /></div>}
      <div className="card-title">{artist.name}</div>
      <div className="card-sub">Виконавець • {artist.monthlyListeners.toLocaleString()} слухачів</div>
    </div>
  );
}

function AlbumCard({ album, onClick }) {
  const img = album.coverPath ? fileUrl('covers', album.coverPath) : null;
  return (
    <div className="card" onClick={onClick}>
      {img ? <img src={img} alt="" className="card-cover" />
        : <div className="card-cover" style={{ background: 'linear-gradient(135deg, #374151, #1f2937)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Disc3 size={40} color="var(--text-muted)" /></div>}
      <div className="card-title">{album.title}</div>
      <div className="card-sub">{album.artistName} • {album.year}</div>
    </div>
  );
}

function SmartMixes({ tracks, artists, onPlay }) {
  if (!tracks.length) return null;

  const mixes = [];

  // 1. Artist Radio: group by artist, find artist with most tracks
  const byArtist = {};
  tracks.forEach(t => {
    const key = t.artistName || 'Unknown';
    if (!byArtist[key]) byArtist[key] = [];
    byArtist[key].push(t);
  });
  const topArtist = Object.entries(byArtist).sort((a, b) => b[1].length - a[1].length)[0];
  if (topArtist && topArtist[1].length >= 2) {
    mixes.push({ id: 'artist', label: `${topArtist[0]} Radio`, sub: `${topArtist[1].length} треків`, emoji: '🎤', tracks: topArtist[1], color: '#1db954' });
  }

  // 2. Fresh pick: shuffle all and take 20
  const shuffled = [...tracks].sort(() => Math.random() - 0.5);
  mixes.push({ id: 'fresh', label: 'Відкриття тижня', sub: 'Свіжий мікс для вас', emoji: '✨', tracks: shuffled.slice(0, 20), color: '#a855f7' });

  // 3. Night mix: different shuffle
  const focus = [...tracks].sort(() => Math.random() - 0.5);
  mixes.push({ id: 'focus', label: 'Нічний мікс', sub: 'Для зосередженої роботи', emoji: '🌙', tracks: focus.slice(0, 20), color: '#3b82f6' });

  // 4. Hits: sort by play count
  const byPlays = [...tracks].sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
  if (byPlays.some(t => t.playCount > 0)) {
    mixes.push({ id: 'hits', label: 'Популярне', sub: 'Найпопулярніші треки', emoji: '🔥', tracks: byPlays.slice(0, 20), color: '#f97316' });
  }

  const gradients = {
    '#1db954': 'linear-gradient(135deg,#1db954,#16a34a)',
    '#a855f7': 'linear-gradient(135deg,#a855f7,#7c3aed)',
    '#3b82f6': 'linear-gradient(135deg,#3b82f6,#1d4ed8)',
    '#f97316': 'linear-gradient(135deg,#f97316,#dc2626)',
  };

  return (
    <section style={{ marginBottom: 32 }}>
      <div className="section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={20} color="var(--accent)" />
          <span className="section-title">Smart Mixes</span>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Персонально для вас</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
        {mixes.map(mix => (
          <div key={mix.id}
            onClick={() => onPlay(mix.tracks)}
            style={{ background: gradients[mix.color], borderRadius: 16, padding: '20px 18px', cursor: 'pointer', position: 'relative', overflow: 'hidden', transition: 'transform 0.2s, box-shadow 0.2s', aspectRatio: '1' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.5)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}>
            <div style={{ position: 'absolute', bottom: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
            <div style={{ position: 'absolute', top: -10, right: 30, width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
            <div style={{ fontSize: 32, marginBottom: 12 }}>{mix.emoji}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 4, lineHeight: 1.3 }}>{mix.label}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{mix.sub}</div>
            <div style={{ position: 'absolute', bottom: 14, right: 14, width: 38, height: 38, borderRadius: '50%', background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Play size={16} color="#fff" fill="#fff" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function HomeTrackRow({ track, index, queue }) {
  const { setTrack, addToQueue } = usePlayerStore();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [hovered, setHovered] = useState(false);
  const [liked, setLiked] = useState(track.isLiked);
  const [showPlMenu, setShowPlMenu] = useState(false);
  const [pls, setPls] = useState([]);
  const plMenuRef = React.useRef(null);

  // Close playlist menu on outside click
  React.useEffect(() => {
    if (!showPlMenu) return;
    const handler = (e) => {
      if (plMenuRef.current && !plMenuRef.current.contains(e.target)) setShowPlMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPlMenu]);

  const cover = track.coverPath ? fileUrl('covers', track.coverPath) : null;

  const handlePlay = () => {
    setTrack(track, queue, queue.indexOf(track));
  };

  const handleLike = async (e) => {
    e.stopPropagation();
    if (!user) return;
    setLiked(l => !l);
    try {
      await tracksApi.like(track.id);
      qc.invalidateQueries(['liked']);
    } catch {
      setLiked(l => !l);
    }
  };

  const openPlMenu = async (e) => {
    e.stopPropagation();
    if (!user) return;
    try {
      const res = await playlistsApi.getAll();
      setPls(Array.isArray(res.data) ? res.data : []);
      setShowPlMenu(true);
    } catch {
      setPls([]);
    }
  };

  const addToPl = async (plId) => {
    try {
      await playlistsApi.addTrack(plId, track.id);
      toast.success('Додано до плейлисту');
    } catch {
      toast.error('Помилка');
    }
    setShowPlMenu(false);
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handlePlay}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '7px 10px',
        borderRadius: 10,
        cursor: 'pointer',
        background: hovered ? 'rgba(255,255,255,0.05)' : 'transparent',
        transition: 'background 0.15s',
        marginBottom: 2,
      }}
    >
      {/* Index number */}
      <div style={{ width: 22, textAlign: 'right', fontSize: 13, color: 'var(--text-muted)', fontWeight: 500, flexShrink: 0 }}>
        {index + 1}
      </div>

      {/* Cover */}
      <div style={{ width: 46, height: 46, flexShrink: 0, position: 'relative', borderRadius: 8, overflow: 'hidden' }}>
        {cover
          ? <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Music2 size={18} color="var(--text-muted)" /></div>
        }
        {hovered && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Play size={16} color="#fff" fill="#fff" style={{ marginLeft: 2 }} />
          </div>
        )}
      </div>

      {/* Title + Artist */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {track.title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
          {track.artistName}
        </div>
      </div>

      {/* Duration */}
      <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0, marginRight: 4 }}>
        {fmt(track.duration)}
      </span>

      {/* Like + playlist + queue buttons (on hover) */}
      {hovered && user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={handleLike}
            title={liked ? 'Видалити з улюблених' : 'Додати до улюблених'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', color: liked ? '#1db954' : 'var(--text-muted)', transition: 'transform 0.2s', borderRadius: 6 }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            <Heart size={15} fill={liked ? '#1db954' : 'none'} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); addToQueue(track); toast(`➕ "${track.title}" у черзі`); }}
            title="Додати до черги"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', color: 'var(--text-muted)', transition: 'transform 0.2s', borderRadius: 6 }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.2)'; e.currentTarget.style.color = 'var(--accent)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <ListMusic size={15} />
          </button>
          <div style={{ position: 'relative' }} ref={plMenuRef}>
            <button
              onClick={openPlMenu}
              title="Додати до плейлисту"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', color: 'var(--text-muted)', transition: 'transform 0.2s', borderRadius: 6 }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              <ListPlus size={15} />
            </button>
            {showPlMenu && (
              <div style={{
                position: 'fixed', zIndex: 500,
                background: 'rgba(18,18,28,0.98)', backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 8,
                width: 210, boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
                // Position relative to viewport
                top: (() => {
                  const el = plMenuRef.current;
                  if (!el) return 'auto';
                  const r = el.getBoundingClientRect();
                  return r.bottom + 4;
                })(),
                right: (() => {
                  const el = plMenuRef.current;
                  if (!el) return 'auto';
                  const r = el.getBoundingClientRect();
                  return window.innerWidth - r.right;
                })(),
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 8px 8px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Додати до плейлисту</div>
                {pls.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px' }}>Немає плейлистів</div>}
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {pls.map(pl => (
                    <div
                      key={pl.id}
                      onClick={() => addToPl(pl.id)}
                      style={{ padding: '8px 10px', fontSize: 13, borderRadius: 8, cursor: 'pointer', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {pl.title}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function HomePage({ deferredPrompt, onInstall }) {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { setTrack } = usePlayerStore();
  const [showAllTracks, setShowAllTracks] = useState(false);

  const { data: trending = [] } = useQuery({ queryKey: ['trending'], queryFn: () => tracksApi.getTrending().then(r => r.data) });
  const { data: newReleases = [] } = useQuery({ queryKey: ['newReleases'], queryFn: () => tracksApi.getNewReleases().then(r => r.data) });
  const { data: artists = [] } = useQuery({ queryKey: ['artists'], queryFn: () => artistsApi.getAll().then(r => r.data) });
  const { data: albums = [] } = useQuery({ queryKey: ['albums'], queryFn: () => albumsApi.getAll().then(r => r.data) });
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: () => statsApi.get().then(r => r.data), enabled: !!user });
  const { data: allTracks = [] } = useQuery({
    queryKey: ['all-tracks-home'],
    queryFn: () => tracksApi.getAllAdmin().then(r => Array.isArray(r.data) ? r.data : (r.data?.tracks ?? [])),
  });

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Доброго ранку';
    if (h < 18) return 'Доброго дня';
    return 'Доброго вечора';
  };

  const isIOS = typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = typeof window !== 'undefined' && (window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches);

  const visibleAllTracks = showAllTracks ? allTracks : allTracks.slice(0, 20);

  return (
    <div className="main-content">
      <div className="content-header">
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>
          {user ? `${greeting()}, ${user.name} 👋` : 'Вітаємо в Beatify 🎵'}
        </h1>
      </div>
      <div className="content-body animate-in">

        {/* PWA Promotion Banner */}
        {deferredPrompt && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(48,209,88,0.12), rgba(10,132,255,0.12))',
            border: '1px solid rgba(48,209,88,0.22)',
            borderRadius: 16,
            padding: '14px 18px',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            backdropFilter: 'blur(10px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                background: 'var(--accent)',
                width: 38,
                height: 38,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#000',
                flexShrink: 0
              }}>
                <Sparkles size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: '#fff' }}>Додати Beatify на головний екран</h3>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '3px 0 0', lineHeight: 1.3 }}>Швидкий доступ та повноцінний досвід без рамок браузера</p>
              </div>
            </div>
            <button
              onClick={onInstall}
              style={{
                padding: '8px 16px',
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 20,
                background: '#fff',
                color: '#000',
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 12px rgba(255,255,255,0.1)'
              }}
            >
              Встановити
            </button>
          </div>
        )}

        {/* iOS WebApp promotion */}
        {isIOS && !isStandalone && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(191,90,242,0.12), rgba(10,132,255,0.12))',
            border: '1px solid rgba(191,90,242,0.22)',
            borderRadius: 16,
            padding: '14px 18px',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            backdropFilter: 'blur(10px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          }}>
            <div style={{
              background: '#bf5af2',
              width: 38,
              height: 38,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              flexShrink: 0
            }}>
              <Sparkles size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: '#fff' }}>Встановити як додаток на iPhone</h3>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '3px 0 0', lineHeight: 1.4 }}>
                Натисніть кнопку <span style={{ color: '#fff', fontWeight: 600 }}>«Поділитися»</span> (значок <span style={{ fontSize: 13 }}>⎋</span> в Safari) та виберіть <span style={{ color: '#fff', fontWeight: 600 }}>«Додати на початковий екран»</span>.
              </p>
            </div>
          </div>
        )}

        {/* Hero */}
        <div className="hero-banner" style={{ marginBottom: 32 }}>
          {stats && stats.totalPlays > 0 ? (
            <div className="hero-content" style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
              <div style={{ flex: 1, zIndex: 10 }}>
                <div className="hero-label" style={{ color: '#bf5af2', textShadow: '0 0 12px rgba(191,90,242,0.5)' }}>🔥 Твоя статистика</div>
                <div className="hero-title" style={{ fontSize: 44, marginBottom: 20 }}>Твоя музика.<br/>Твій момент.</div>
                <div style={{ display: 'flex', gap: 32, marginBottom: 28 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 4 }}>Прослухано</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: '#fff' }}>{stats.totalPlays} <span style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 600 }}>разів</span></div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 4 }}>Унікальних треків</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: '#fff' }}>{stats.uniqueTracks}</div>
                  </div>
                  {stats.topArtists?.[0] && (
                    <div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 4 }}>Фаворит</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: 180 }}>
                        {stats.topArtists[0].name}
                      </div>
                    </div>
                  )}
                </div>
                {stats.topTracks?.[0] && (
                  <button className="btn btn-primary" onClick={() => setTrack(trending.find(t => t.id === stats.topTracks[0].id) || trending[0], trending, 0)} style={{ background: 'linear-gradient(135deg, #bf5af2, #30d158)', border: 'none', color: '#fff' }}>
                    <Play size={16} fill="#fff" /> Мікс "Топ за місяць"
                  </button>
                )}
              </div>
              {stats.topTracks && stats.topTracks.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', position: 'relative', height: 180, flexShrink: 0, paddingRight: 10, marginRight: 20 }}>
                  {stats.topTracks.slice(0, 5).map((t, i) => (
                    <div key={t.id} style={{
                      position: 'relative',
                      width: i === 0 ? 150 : 120,
                      height: i === 0 ? 150 : 120,
                      marginLeft: i === 0 ? 0 : -50,
                      zIndex: 10 - i,
                      transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1), z-index 0s',
                      cursor: 'pointer'
                    }}
                    title={`${t.title} - ${t.artistName} (${t.playCount} прослуховувань)`}
                    onClick={() => setTrack(t, stats.topTracks, i)}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-15px) scale(1.08)'; e.currentTarget.style.zIndex = 20; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.zIndex = 10 - i; }}>
                      <img
                        src={t.coverPath ? fileUrl('covers', t.coverPath) : ''}
                        alt=""
                        style={{
                          width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12,
                          background: 'linear-gradient(135deg, #2a2a4a, #1a1a2e)',
                          boxShadow: i === 0 ? '0 12px 32px rgba(0,0,0,0.7)' : '0 8px 24px rgba(0,0,0,0.5)',
                          border: '1px solid rgba(255,255,255,0.1)'
                        }}
                      />
                      <div style={{
                        position: 'absolute', bottom: -12, left: -14,
                        fontSize: i === 0 ? 64 : 52, fontWeight: 900,
                        color: 'transparent',
                        WebkitTextStroke: '2px rgba(255,255,255,0.9)',
                        textShadow: '0 8px 16px rgba(0,0,0,0.8)',
                        lineHeight: 1, letterSpacing: '-0.05em'
                      }}>
                        {i + 1}
                      </div>
                      <div style={{
                        position: 'absolute', top: 8, right: 8,
                        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)',
                        padding: '3px 8px', borderRadius: 12, fontSize: 10, fontWeight: 700,
                        border: '1px solid rgba(255,255,255,0.1)', color: 'var(--accent)'
                      }}>
                        {t.playCount}x
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="hero-content">
              <div className="hero-label">🔥 Trending Now</div>
              <div className="hero-title">Твоя музика.<br/>Твій момент.</div>
              <div className="hero-sub">Понад {trending.reduce((a, t) => a + t.playCount, 0).toLocaleString()} прослуховувань на платформі</div>
              {trending[0] && (
                <button className="btn btn-primary" onClick={() => setTrack(trending[0], trending, 0)}>
                  <Play size={16} /> Слухати зараз
                </button>
              )}
            </div>
          )}
        </div>

        {/* Smart Mixes — uses allTracks for variety */}
        <SmartMixes
          tracks={allTracks.length ? allTracks : [...trending, ...newReleases]}
          artists={artists}
          onPlay={(tracks) => { if (tracks.length) setTrack(tracks[0], tracks, 0); }}
        />

        {/* Trending — compact numbered list */}
        {trending.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <div className="section-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={20} color="var(--accent)" />
                <span className="section-title">Трендові треки</span>
              </div>
            </div>
            <div>
              {trending.map((t, i) => (
                <HomeTrackRow key={t.id} track={t} index={i} queue={trending} />
              ))}
            </div>
          </section>
        )}

        {/* Artists */}
        {artists.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <div className="section-header">
              <span className="section-title">Виконавці</span>
              <a className="section-link" onClick={() => navigate('/artists')}>Всі</a>
            </div>
            <div className="cards-grid">
              {artists.slice(0, 6).map(a => <ArtistCard key={a.id} artist={a} onClick={() => navigate(`/artist/${a.id}`)} />)}
            </div>
          </section>
        )}

        {/* New Releases — card grid with play-on-hover (TrackCard already handles hover) */}
        {newReleases.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <div className="section-header">
              <span className="section-title">Нові треки</span>
            </div>
            <div className="cards-grid">
              {newReleases.map(t => <TrackCard key={t.id} track={t} queue={newReleases} />)}
            </div>
          </section>
        )}

        {/* All Tracks — 2-column grid, max 20 with toggle */}
        {allTracks.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <div className="section-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ListMusic size={18} color="var(--accent)" />
                <span className="section-title">Усі треки</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 2 }}>{allTracks.length}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {/* Quick shuffle play */}
                <button
                  onClick={() => {
                    const shuffled = [...allTracks].sort(() => Math.random() - 0.5);
                    setTrack(shuffled[0], shuffled, 0);
                    toast('🔀 Випадкове відтворення');
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.18s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                >
                  <Shuffle size={13} /> Shuffle
                </button>
              </div>
            </div>
            <div>
              {visibleAllTracks.map((t, i) => (
                <HomeTrackRow key={t.id} track={t} index={i} queue={allTracks} />
              ))}
            </div>
            {allTracks.length > 20 && (
              <div style={{ textAlign: 'center', marginTop: 14 }}>
                <button
                  onClick={() => setShowAllTracks(v => !v)}
                  style={{ padding: '10px 28px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.18s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                >
                  {showAllTracks ? '↑ Показати менше' : `↓ Показати більше (${allTracks.length - 20} ще)`}
                </button>
              </div>
            )}
          </section>
        )}

        {/* Albums */}
        {albums.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <div className="section-header">
              <span className="section-title">Альбоми</span>
            </div>
            <div className="cards-grid">
              {albums.slice(0, 6).map(a => <AlbumCard key={a.id} album={a} onClick={() => navigate(`/album/${a.id}`)} />)}
            </div>
          </section>
        )}

        {trending.length === 0 && artists.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <Music2 size={64} color="var(--text-muted)" style={{ margin: '0 auto 16px' }} />
            <h2 style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>База порожня</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Адмін ще не додав треки</p>
            {user?.role === 'admin' && (
              <button className="btn btn-primary" onClick={() => navigate('/admin')}>Додати музику</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
