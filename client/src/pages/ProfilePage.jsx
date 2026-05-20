import React, { useState, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { playlistsApi, usersApi, tracksApi, statsApi, fileUrl } from '../api';
import {
  User, Settings, Globe, Lock, Trash2, Edit2, Play, Music2,
  Search, Mic2, Upload, X, Heart, BarChart2, Trophy, ChevronRight,
  Plus, Check, Sparkles, Clock, Headphones, Star, Zap, Shield,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { usePlayerStore } from '../store/playerStore';

// ── Helpers ───────────────────────────────────────────────────────────────────
function avatarGradient(name = '') {
  const colors = [
    ['#1db954','#16a34a'], ['#a855f7','#7c3aed'], ['#3b82f6','#1d4ed8'],
    ['#f97316','#dc2626'], ['#ec4899','#be185d'], ['#06b6d4','#0284c7'],
    ['#84cc16','#65a30d'], ['#f59e0b','#d97706'],
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  const [a, b] = colors[Math.abs(h) % colors.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

function fmt(s) {
  if (!s) return '0:00';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2,'0')}`;
}

function playlistGradient(title = '') {
  const grads = [
    'linear-gradient(135deg,#1db954,#065f46)',
    'linear-gradient(135deg,#a855f7,#4c1d95)',
    'linear-gradient(135deg,#3b82f6,#1e3a8a)',
    'linear-gradient(135deg,#f97316,#7c2d12)',
    'linear-gradient(135deg,#ec4899,#831843)',
    'linear-gradient(135deg,#06b6d4,#164e63)',
    'linear-gradient(135deg,#84cc16,#365314)',
    'linear-gradient(135deg,#f59e0b,#78350f)',
  ];
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) & 0xffffffff;
  return grads[Math.abs(h) % grads.length];
}

// ── Achievements ──────────────────────────────────────────────────────────────
function getAchievements(user, stats, playlists, likedCount) {
  const plays = stats?.totalPlays ?? 0;
  const pls   = playlists?.length ?? 0;
  const liked = likedCount ?? 0;
  return [
    { id:'first',   icon:'🎵', label:'Перший крок',   desc:'Прослухав першу пісню',       done: plays >= 1 },
    { id:'fan50',   icon:'🎧', label:'Меломан',        desc:'50+ прослуховувань',           done: plays >= 50 },
    { id:'fan500',  icon:'🔥', label:'Адикт',          desc:'500+ прослуховувань',          done: plays >= 500 },
    { id:'coll',    icon:'💿', label:'Колекціонер',    desc:'5+ плейлістів',                done: pls >= 5 },
    { id:'heart',   icon:'❤️', label:'Фанат',          desc:'20+ лайків',                   done: liked >= 20 },
    { id:'artist',  icon:'🎤', label:'Артист',         desc:'Зареєструвався як виконавець', done: !!user?.artistId },
    { id:'admin',   icon:'👑', label:'Адміністратор',  desc:'Має права адміна',             done: user?.role === 'admin' },
    { id:'unique',  icon:'✨', label:'Дослідник',      desc:'20+ унікальних треків',        done: (stats?.uniqueTracks ?? 0) >= 20 },
  ];
}

// ── Tab component ─────────────────────────────────────────────────────────────
const TABS = [
  { id:'playlists', label:'Плейлісти', icon: Music2 },
  { id:'stats',     label:'Статистика', icon: BarChart2 },
  { id:'artist',    label:'Артист',    icon: Mic2 },
  { id:'community', label:'Спільнота', icon: Globe },
  { id:'settings',  label:'Налаштування', icon: Settings },
];

// ── Upload Modal ──────────────────────────────────────────────────────────────
function UploadModal({ onClose, artistId, onSuccess }) {
  const [title,   setTitle]   = useState('');
  const [genre,   setGenre]   = useState('Pop');
  const [year,    setYear]    = useState(new Date().getFullYear().toString());
  const [file,    setFile]    = useState(null);
  const [cover,   setCover]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [drag,    setDrag]    = useState(false);
  const coverPreview = cover ? URL.createObjectURL(cover) : null;
  const qc = useQueryClient();

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f?.type.startsWith('audio/')) setFile(f);
    else toast.error('Потрібен аудіо файл');
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !file) return toast.error('Заповніть назву та виберіть файл');
    setLoading(true);
    const fd = new FormData();
    fd.append('title',    title);
    fd.append('genre',    genre);
    fd.append('year',     year);
    fd.append('audioFile', file);
    fd.append('artistId', artistId);
    if (cover) fd.append('coverFile', cover);
    try {
      await tracksApi.upload(fd);
      qc.invalidateQueries(['myArtistTracks']);
      toast.success('🎵 Трек опубліковано!');
      onSuccess?.(); onClose();
    } catch { toast.error('Помилка завантаження'); }
    finally { setLoading(false); }
  };

  const GENRES = ['Pop','Rock','Hip-Hop','R&B','Electronic','Jazz','Classical','Country','Indie','Metal','Folk','Reggae','Latin','K-Pop','Other'];

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', backdropFilter:'blur(16px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:20 }}>
      <div style={{ background:'#131318', width:'100%', maxWidth:520, borderRadius:24, border:'1px solid rgba(255,255,255,0.1)', boxShadow:'0 32px 80px rgba(0,0,0,0.7)', overflow:'hidden' }}>
        {/* Header */}
        <div style={{ padding:'24px 28px 20px', borderBottom:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:20, fontWeight:900 }}>Випустити трек</div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:3 }}>Поділись своєю музикою зі світом</div>
          </div>
          <button onClick={onClose} style={{ width:34, height:34, borderRadius:'50%', border:'none', background:'rgba(255,255,255,0.07)', color:'var(--text-muted)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding:'24px 28px 28px', display:'flex', flexDirection:'column', gap:18 }}>
          {/* Drag & drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById('audio-input').click()}
            style={{
              border: `2px dashed ${drag ? 'var(--accent)' : file ? 'rgba(29,185,84,0.4)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius:16, padding:'28px 20px', textAlign:'center', cursor:'pointer',
              background: drag ? 'rgba(29,185,84,0.05)' : file ? 'rgba(29,185,84,0.04)' : 'rgba(255,255,255,0.02)',
              transition:'all 0.2s',
            }}
          >
            <input id="audio-input" type="file" accept="audio/*" style={{ display:'none' }} onChange={e => setFile(e.target.files[0])} />
            {file ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
                <div style={{ width:36, height:36, borderRadius:10, background:'rgba(29,185,84,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Music2 size={18} color="var(--accent)" />
                </div>
                <div style={{ textAlign:'left' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--accent)' }}>{file.name}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>{(file.size/1024/1024).toFixed(1)} MB</div>
                </div>
                <Check size={18} color="var(--accent)" />
              </div>
            ) : (
              <>
                <Upload size={28} color="var(--text-muted)" style={{ marginBottom:10 }} />
                <div style={{ fontSize:13, fontWeight:700, color:'var(--text-secondary)' }}>Перетягни аудіо сюди</div>
                <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>або клікни щоб вибрати файл · MP3, WAV, FLAC</div>
              </>
            )}
          </div>

          {/* Title */}
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'var(--text-muted)', display:'block', marginBottom:6 }}>Назва треку *</label>
            <input
              value={title} onChange={e => setTitle(e.target.value)} required
              placeholder="Як називається твоя пісня?"
              style={{ width:'100%', boxSizing:'border-box', padding:'11px 14px', borderRadius:12, border:'1.5px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.05)', color:'#fff', fontSize:14, outline:'none' }}
            />
          </div>

          {/* Genre + Year */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 120px', gap:12 }}>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:'var(--text-muted)', display:'block', marginBottom:6 }}>Жанр</label>
              <select value={genre} onChange={e => setGenre(e.target.value)}
                style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1.5px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.05)', color:'#fff', fontSize:13, outline:'none', cursor:'pointer' }}>
                {GENRES.map(g => <option key={g} value={g} style={{ background:'#1a1a24' }}>{g}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:'var(--text-muted)', display:'block', marginBottom:6 }}>Рік</label>
              <input
                value={year} onChange={e => setYear(e.target.value)}
                type="number" min="1900" max="2099"
                style={{ width:'100%', boxSizing:'border-box', padding:'11px 14px', borderRadius:12, border:'1.5px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.05)', color:'#fff', fontSize:13, outline:'none' }}
              />
            </div>
          </div>

          {/* Cover */}
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'var(--text-muted)', display:'block', marginBottom:6 }}>Обкладинка (опціонально)</label>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:60, height:60, borderRadius:10, background:'rgba(255,255,255,0.06)', overflow:'hidden', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                {coverPreview ? <img src={coverPreview} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" /> : <Music2 size={22} color="var(--text-muted)" />}
              </div>
              <label style={{ flex:1, padding:'10px 14px', borderRadius:10, border:'1px dashed rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.03)', color:'var(--text-muted)', fontSize:12, cursor:'pointer', textAlign:'center' }}>
                <input type="file" accept="image/*" style={{ display:'none' }} onChange={e => setCover(e.target.files[0])} />
                {cover ? cover.name : 'Вибрати обкладинку'}
              </label>
            </div>
          </div>

          <button type="submit" disabled={loading || !file} style={{
            padding:'14px', borderRadius:14, border:'none',
            background: loading || !file ? 'rgba(255,255,255,0.08)' : 'var(--accent)',
            color: loading || !file ? 'var(--text-muted)' : '#000',
            fontSize:15, fontWeight:800, cursor: loading || !file ? 'not-allowed' : 'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginTop:4,
          }}>
            {loading ? (
              <><div style={{ width:16, height:16, border:'2px solid rgba(0,0,0,0.3)', borderTopColor:'#000', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} /> Публікація...</>
            ) : (
              <><Zap size={16} /> Опублікувати трек</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { user, login }   = useAuthStore();
  const qc                = useQueryClient();
  const navigate          = useNavigate();
  const { setTrack }      = usePlayerStore();

  const [tab,          setTab]          = useState('playlists');
  const [editingName,  setEditingName]  = useState(false);
  const [newName,      setNewName]      = useState(user?.name || '');
  const [showUpload,   setShowUpload]   = useState(false);
  const [searchQ,      setSearchQ]      = useState('');

  // ── Queries ──
  const { data: myPlaylists = [] }  = useQuery({ queryKey:['myPlaylists'],        queryFn: () => playlistsApi.getAll().then(r => r.data),        enabled:!!user });
  const { data: publicPlaylists=[] }= useQuery({ queryKey:['publicPlaylists'],    queryFn: () => playlistsApi.getPublic().then(r => r.data) });
  const { data: stats }             = useQuery({ queryKey:['profileStats'],        queryFn: () => statsApi.get().then(r => r.data),              enabled:!!user });
  const { data: likedTracks=[] }    = useQuery({ queryKey:['liked'],              queryFn: () => tracksApi.getLiked().then(r => Array.isArray(r.data) ? r.data : r.data?.tracks ?? []), enabled:!!user });
  const { data: myTracks=[] }       = useQuery({
    queryKey: ['myArtistTracks', user?.artistId],
    queryFn:  () => tracksApi.getAllAdmin().then(r => (Array.isArray(r.data) ? r.data : r.data?.tracks ?? []).filter(t => t.artistId === user.artistId)),
    enabled:  !!user?.artistId,
  });

  const achievements = getAchievements(user, stats, myPlaylists, likedTracks.length);
  const earned       = achievements.filter(a => a.done).length;

  // ── Handlers ──
  const handleUpdateName = async () => {
    if (!newName.trim()) return;
    try {
      const res = await usersApi.updateMe({ name: newName });
      login(localStorage.getItem('beatify_token'), res.data);
      setEditingName(false);
      toast.success('✅ Ім\'я оновлено');
    } catch { toast.error('Помилка оновлення'); }
  };

  const handleBecomeArtist = async () => {
    if (!window.confirm('Стати виконавцем? Ти зможеш завантажувати власні треки.')) return;
    try {
      await usersApi.becomeArtist();
      const res = await fetch('http://localhost:5000/api/auth/me', { headers: { Authorization: `Bearer ${localStorage.getItem('beatify_token')}` } });
      if (res.ok) { const d = await res.json(); login(localStorage.getItem('beatify_token'), d); }
      toast.success('🎤 Вітаємо! Тепер ти виконавець');
    } catch { toast.error('Помилка'); }
  };

  const togglePublic = async (pl) => {
    try {
      await playlistsApi.update(pl.id, { isPublic: !pl.isPublic });
      qc.invalidateQueries(['myPlaylists']); qc.invalidateQueries(['publicPlaylists']);
      toast.success(pl.isPublic ? 'Плейлист приватний' : '🌍 Плейлист опубліковано');
    } catch { toast.error('Помилка'); }
  };

  const deletePlaylist = async (id) => {
    if (!window.confirm('Видалити плейлист назавжди?')) return;
    try {
      await playlistsApi.delete(id);
      qc.invalidateQueries(['myPlaylists']); qc.invalidateQueries(['publicPlaylists']);
      toast.success('Плейлист видалено');
    } catch { toast.error('Помилка'); }
  };

  const createPlaylist = async () => {
    try {
      const res = await playlistsApi.create({ title:`Мій плейлист #${myPlaylists.length + 1}`, description:'', isPublic:false });
      qc.invalidateQueries(['myPlaylists']);
      navigate(`/playlist/${res.data.id}`);
      toast.success('✅ Плейлист створено');
    } catch { toast.error('Помилка'); }
  };

  const filteredPublic = publicPlaylists.filter(p =>
    p.title?.toLowerCase().includes(searchQ.toLowerCase()) ||
    p.userName?.toLowerCase().includes(searchQ.toLowerCase())
  );

  if (!user) return null;

  const visibleTabs = TABS.filter(t => t.id !== 'artist' || !!user.artistId || true);

  return (
    <div className="main-content" style={{ padding:0 }}>

      {/* ── Hero Header ── */}
      <div style={{
        position:'relative', overflow:'hidden', padding:'48px 48px 40px',
        background:`linear-gradient(180deg, ${avatarGradient(user.name).replace('linear-gradient(135deg,','').replace(')','')}22 0%, transparent 100%)`,
        borderBottom:'1px solid rgba(255,255,255,0.06)',
      }}>
        {/* Decorative blobs */}
        <div style={{ position:'absolute', top:-60, right:80, width:300, height:300, borderRadius:'50%', background:avatarGradient(user.name), opacity:0.07, filter:'blur(60px)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:-40, left:200, width:200, height:200, borderRadius:'50%', background:'rgba(99,102,241,0.15)', filter:'blur(50px)', pointerEvents:'none' }} />

        <div style={{ display:'flex', alignItems:'flex-end', gap:32, position:'relative', zIndex:1 }}>
          {/* Avatar */}
          <div style={{
            width:120, height:120, borderRadius:24, flexShrink:0,
            background: avatarGradient(user.name),
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:`0 16px 48px ${avatarGradient(user.name).match(/#[0-9a-f]{6}/i)?.[0] ?? '#1db954'}55`,
            fontSize:48, fontWeight:900, color:'rgba(0,0,0,0.6)',
            letterSpacing:-2,
          }}>
            {user.name?.charAt(0).toUpperCase()}
          </div>

          {/* Info */}
          <div style={{ flex:1, paddingBottom:4 }}>
            <div style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.12em', color:'var(--text-muted)', marginBottom:8 }}>
              {user.role === 'admin' ? '👑 Адміністратор' : user.artistId ? '🎤 Виконавець' : '👤 Слухач'}
            </div>

            {editingName ? (
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                <input
                  autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key==='Enter') handleUpdateName(); if (e.key==='Escape') setEditingName(false); }}
                  style={{ fontSize:36, fontWeight:900, background:'rgba(255,255,255,0.07)', border:'1.5px solid rgba(255,255,255,0.2)', borderRadius:10, color:'#fff', padding:'4px 14px', outline:'none', width:300 }}
                />
                <button onClick={handleUpdateName} style={{ padding:'8px 18px', borderRadius:10, border:'none', background:'var(--accent)', color:'#000', fontWeight:700, cursor:'pointer', fontSize:13 }}>Зберегти</button>
                <button onClick={() => setEditingName(false)} style={{ padding:'8px 14px', borderRadius:10, border:'1px solid rgba(255,255,255,0.12)', background:'transparent', color:'var(--text-muted)', fontWeight:700, cursor:'pointer', fontSize:13 }}>✕</button>
              </div>
            ) : (
              <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:10 }}>
                <h1 style={{ fontSize:46, fontWeight:900, margin:0, letterSpacing:-1.5, lineHeight:1 }}>{user.name}</h1>
                <button onClick={() => { setNewName(user.name); setEditingName(true); }} style={{ width:32, height:32, borderRadius:8, border:'none', background:'rgba(255,255,255,0.07)', color:'var(--text-muted)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Edit2 size={14} />
                </button>
              </div>
            )}

            {/* Quick stats */}
            <div style={{ display:'flex', alignItems:'center', gap:20, flexWrap:'wrap' }}>
              {[
                { label:`${myPlaylists.length} плейлістів`, icon: Music2 },
                { label:`${likedTracks.length} лайків`,     icon: Heart },
                { label:`${stats?.totalPlays ?? 0} відтворень`, icon: Headphones },
                { label:`${earned}/${achievements.length} досягнень`, icon: Trophy },
              ].map(({ label, icon: Icon }) => (
                <div key={label} style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, color:'var(--text-secondary)', fontWeight:600 }}>
                  <Icon size={14} color="var(--text-muted)" />
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Become artist CTA */}
          {!user.artistId && (
            <button onClick={handleBecomeArtist} style={{
              display:'flex', alignItems:'center', gap:8,
              padding:'12px 22px', borderRadius:14, border:'1.5px solid rgba(255,255,255,0.15)',
              background:'rgba(255,255,255,0.06)', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer',
              backdropFilter:'blur(10px)',
            }}>
              <Mic2 size={16} /> Стати артистом
            </button>
          )}
          {user.artistId && (
            <button onClick={() => setShowUpload(true)} style={{
              display:'flex', alignItems:'center', gap:8,
              padding:'12px 22px', borderRadius:14, border:'none',
              background:'var(--accent)', color:'#000', fontWeight:800, fontSize:13, cursor:'pointer',
            }}>
              <Upload size={16} /> Випустити трек
            </button>
          )}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display:'flex', gap:2, padding:'0 48px', borderBottom:'1px solid rgba(255,255,255,0.06)', background:'rgba(0,0,0,0.15)' }}>
        {visibleTabs.map(t => {
          const active = tab === t.id;
          const Icon   = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display:'flex', alignItems:'center', gap:7, padding:'14px 18px', border:'none', background:'transparent',
              color: active ? '#fff' : 'var(--text-muted)', fontWeight: active ? 700 : 500,
              fontSize:13, cursor:'pointer', position:'relative', transition:'color 0.15s',
            }}>
              <Icon size={15} />
              {t.label}
              {active && <div style={{ position:'absolute', bottom:0, left:10, right:10, height:2, borderRadius:'2px 2px 0 0', background:'var(--accent)', boxShadow:'0 0 8px rgba(29,185,84,0.6)' }} />}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ── */}
      <div style={{ padding:'32px 48px 80px' }}>

        {/* ── PLAYLISTS ── */}
        {tab === 'playlists' && (
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
              <h2 style={{ fontSize:22, fontWeight:800, margin:0 }}>Мої плейлісти</h2>
              <button onClick={createPlaylist} style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 18px', borderRadius:12, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.05)', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer' }}>
                <Plus size={15} /> Створити
              </button>
            </div>

            {myPlaylists.length === 0 ? (
              <div style={{ textAlign:'center', padding:'60px 0', color:'var(--text-muted)' }}>
                <Music2 size={48} style={{ opacity:0.2, marginBottom:16, display:'block', margin:'0 auto 16px' }} />
                <p style={{ fontSize:16, fontWeight:700, color:'var(--text-secondary)', marginBottom:8 }}>Немає плейлістів</p>
                <p style={{ fontSize:13, marginBottom:20 }}>Створи перший і збери свою музику</p>
                <button onClick={createPlaylist} style={{ padding:'10px 24px', borderRadius:100, border:'none', background:'var(--accent)', color:'#000', fontWeight:800, fontSize:13, cursor:'pointer' }}>
                  Створити плейліст
                </button>
              </div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:16 }}>
                {myPlaylists.map(pl => (
                  <div key={pl.id} style={{ borderRadius:16, overflow:'hidden', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', cursor:'pointer', transition:'transform 0.18s, box-shadow 0.18s', position:'relative', group:true }}
                    onMouseEnter={e => { e.currentTarget.style.transform='translateY(-4px)'; e.currentTarget.style.boxShadow='0 12px 32px rgba(0,0,0,0.4)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}>
                    {/* Cover */}
                    <div onClick={() => navigate(`/playlist/${pl.id}`)} style={{ height:180, background:playlistGradient(pl.title), display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}>
                      <Music2 size={48} color="rgba(255,255,255,0.4)" />
                      <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0)', transition:'background 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.background='rgba(0,0,0,0.3)'}
                        onMouseLeave={e => e.currentTarget.style.background='rgba(0,0,0,0)'}>
                        <Play size={40} color="#fff" fill="#fff" style={{ opacity:0, transition:'opacity 0.2s' }}
                          onMouseEnter={e => e.currentTarget.style.opacity='1'}
                        />
                      </div>
                    </div>
                    {/* Info */}
                    <div style={{ padding:'14px 16px 12px' }}>
                      <div onClick={() => navigate(`/playlist/${pl.id}`)} style={{ fontSize:14, fontWeight:700, marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{pl.title}</div>
                      <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:12 }}>{pl.trackCount ?? 0} треків</div>
                      {/* Actions */}
                      <div style={{ display:'flex', gap:8 }}>
                        <button onClick={e => { e.stopPropagation(); togglePublic(pl); }}
                          style={{ flex:1, padding:'6px 0', borderRadius:8, border:`1px solid ${pl.isPublic ? 'rgba(29,185,84,0.3)' : 'rgba(255,255,255,0.1)'}`, background: pl.isPublic ? 'rgba(29,185,84,0.08)' : 'rgba(255,255,255,0.04)', color: pl.isPublic ? 'var(--accent)' : 'var(--text-muted)', fontSize:11, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}>
                          {pl.isPublic ? <><Globe size={11} /> Публічний</> : <><Lock size={11} /> Приватний</>}
                        </button>
                        <button onClick={e => { e.stopPropagation(); deletePlaylist(pl.id); }}
                          style={{ width:34, height:34, borderRadius:8, border:'1px solid rgba(239,68,68,0.2)', background:'rgba(239,68,68,0.06)', color:'#ef4444', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── STATS ── */}
        {tab === 'stats' && (
          <div>
            <h2 style={{ fontSize:22, fontWeight:800, marginBottom:28 }}>Статистика</h2>
            {/* Big numbers */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:16, marginBottom:36 }}>
              {[
                { label:'Прослуховувань',  value: stats?.totalPlays ?? 0,      icon: Headphones, color:'#1db954' },
                { label:'Унікальних треків',value: stats?.uniqueTracks ?? 0,   icon: Music2,     color:'#a855f7' },
                { label:'Улюблених треків', value: likedTracks.length,          icon: Heart,      color:'#ef4444' },
                { label:'Плейлістів',       value: myPlaylists.length,          icon: Music2,     color:'#3b82f6' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:18, padding:'22px 24px' }}>
                  <div style={{ width:40, height:40, borderRadius:12, background:`${color}18`, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:14 }}>
                    <Icon size={20} color={color} />
                  </div>
                  <div style={{ fontSize:34, fontWeight:900, marginBottom:4 }}>{value.toLocaleString()}</div>
                  <div style={{ fontSize:12, color:'var(--text-muted)', fontWeight:600 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Top artists */}
            {stats?.topArtists?.length > 0 && (
              <div style={{ marginBottom:36 }}>
                <h3 style={{ fontSize:17, fontWeight:800, marginBottom:16 }}>🎤 Топ виконавці</h3>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {stats.topArtists.slice(0, 8).map((a, i) => {
                    const max = stats.topArtists[0]?.playCount || 1;
                    const pct = Math.round((a.playCount / max) * 100);
                    return (
                      <div key={a.name} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px', background:'rgba(255,255,255,0.03)', borderRadius:12 }}>
                        <span style={{ fontSize:13, fontWeight:900, color:'var(--text-muted)', minWidth:20, textAlign:'right' }}>{i+1}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                            <span style={{ fontSize:14, fontWeight:700 }}>{a.name}</span>
                            <span style={{ fontSize:12, color:'var(--text-muted)' }}>{a.playCount} відтворень</span>
                          </div>
                          <div style={{ height:4, background:'rgba(255,255,255,0.07)', borderRadius:2, overflow:'hidden' }}>
                            <div style={{ height:'100%', width:`${pct}%`, background:`linear-gradient(90deg, var(--accent), #a855f7)`, borderRadius:2, transition:'width 0.6s ease' }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Top tracks */}
            {stats?.topTracks?.length > 0 && (
              <div>
                <h3 style={{ fontSize:17, fontWeight:800, marginBottom:16 }}>🔥 Топ треки</h3>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {stats.topTracks.slice(0, 8).map((t, i) => {
                    const cover = t.coverPath ? fileUrl('covers', t.coverPath) : null;
                    return (
                      <div key={t.id} onClick={() => setTrack(t, stats.topTracks, i)}
                        style={{ display:'flex', alignItems:'center', gap:14, padding:'10px 14px', background:'rgba(255,255,255,0.03)', borderRadius:12, cursor:'pointer', transition:'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.06)'}
                        onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.03)'}>
                        <span style={{ fontSize:13, fontWeight:900, color:'var(--text-muted)', minWidth:18, textAlign:'right' }}>{i+1}</span>
                        <div style={{ width:40, height:40, borderRadius:8, background:'rgba(255,255,255,0.07)', flexShrink:0, overflow:'hidden' }}>
                          {cover ? <img src={cover} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" /> : <Music2 size={18} color="var(--text-muted)" style={{ margin:'11px auto', display:'block' }} />}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:14, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.title}</div>
                          <div style={{ fontSize:12, color:'var(--text-muted)' }}>{t.artistName}</div>
                        </div>
                        <span style={{ fontSize:12, color:'var(--accent)', fontWeight:700 }}>{t.playCount}×</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!stats && (
              <div style={{ textAlign:'center', padding:'60px 0', color:'var(--text-muted)' }}>
                <BarChart2 size={48} style={{ opacity:0.2, display:'block', margin:'0 auto 16px' }} />
                <p>Слухай музику — тут з'явиться статистика</p>
              </div>
            )}

            {/* Achievements */}
            <div style={{ marginTop:40 }}>
              <h3 style={{ fontSize:17, fontWeight:800, marginBottom:4 }}>🏆 Досягнення</h3>
              <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:16 }}>{earned} з {achievements.length} отримано</p>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:12 }}>
                {achievements.map(a => (
                  <div key={a.id} style={{
                    padding:'16px 18px', borderRadius:14,
                    background: a.done ? 'rgba(29,185,84,0.07)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${a.done ? 'rgba(29,185,84,0.25)' : 'rgba(255,255,255,0.06)'}`,
                    opacity: a.done ? 1 : 0.5, transition:'all 0.2s',
                  }}>
                    <div style={{ fontSize:28, marginBottom:8 }}>{a.icon}</div>
                    <div style={{ fontSize:14, fontWeight:800, marginBottom:3 }}>{a.label}</div>
                    <div style={{ fontSize:12, color:'var(--text-muted)' }}>{a.desc}</div>
                    {a.done && <div style={{ fontSize:11, color:'var(--accent)', fontWeight:700, marginTop:8 }}>✓ Отримано</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── ARTIST ── */}
        {tab === 'artist' && (
          <div>
            {!user.artistId ? (
              <div style={{ textAlign:'center', padding:'80px 0' }}>
                <div style={{ width:80, height:80, borderRadius:20, background:'rgba(29,185,84,0.1)', border:'1px solid rgba(29,185,84,0.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
                  <Mic2 size={36} color="var(--accent)" />
                </div>
                <h2 style={{ fontSize:24, fontWeight:800, marginBottom:10 }}>Стань виконавцем</h2>
                <p style={{ color:'var(--text-muted)', fontSize:15, marginBottom:28, maxWidth:400, margin:'0 auto 28px' }}>
                  Завантажуй власні треки, відстежуй статистику і діліся музикою з усіма слухачами Beatify
                </p>
                <button onClick={handleBecomeArtist} style={{ padding:'14px 32px', borderRadius:100, border:'none', background:'var(--accent)', color:'#000', fontWeight:800, fontSize:15, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:8 }}>
                  <Mic2 size={18} /> Стати виконавцем
                </button>
              </div>
            ) : (
              <div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:28 }}>
                  <div>
                    <h2 style={{ fontSize:22, fontWeight:800, margin:'0 0 4px' }}>Панель артиста</h2>
                    <p style={{ fontSize:13, color:'var(--text-muted)', margin:0 }}>{myTracks.length} опублікованих треків</p>
                  </div>
                  <button onClick={() => setShowUpload(true)} style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 22px', borderRadius:14, border:'none', background:'var(--accent)', color:'#000', fontWeight:800, fontSize:13, cursor:'pointer' }}>
                    <Upload size={16} /> Випустити трек
                  </button>
                </div>

                {myTracks.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'60px', border:'2px dashed rgba(255,255,255,0.07)', borderRadius:20 }}>
                    <Sparkles size={40} color="var(--text-muted)" style={{ display:'block', margin:'0 auto 16px', opacity:0.4 }} />
                    <p style={{ fontSize:16, fontWeight:700, color:'var(--text-secondary)', marginBottom:8 }}>Ще немає треків</p>
                    <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>Випусти свій перший трек і потрап у бібліотеку</p>
                    <button onClick={() => setShowUpload(true)} style={{ padding:'10px 24px', borderRadius:100, border:'none', background:'var(--accent)', color:'#000', fontWeight:800, fontSize:13, cursor:'pointer' }}>
                      + Завантажити трек
                    </button>
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {/* Header */}
                    <div style={{ display:'grid', gridTemplateColumns:'40px 1fr 120px 100px', gap:12, padding:'8px 16px', fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>
                      <span>#</span><span>Трек</span><span style={{ textAlign:'right' }}>Відтворень</span><span style={{ textAlign:'right' }}>Тривалість</span>
                    </div>
                    {myTracks.map((t, i) => {
                      const cover = t.coverPath ? fileUrl('covers', t.coverPath) : null;
                      const maxPlays = Math.max(...myTracks.map(x => x.playCount || 0), 1);
                      return (
                        <div key={t.id} onClick={() => setTrack(t, myTracks, i)}
                          style={{ display:'grid', gridTemplateColumns:'40px 1fr 120px 100px', gap:12, alignItems:'center', padding:'10px 16px', borderRadius:12, cursor:'pointer', transition:'background 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.05)'}
                          onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                          <span style={{ fontSize:13, color:'var(--text-muted)', fontWeight:700 }}>{i+1}</span>
                          <div style={{ display:'flex', alignItems:'center', gap:12, minWidth:0 }}>
                            <div style={{ width:42, height:42, borderRadius:8, background:'rgba(255,255,255,0.07)', flexShrink:0, overflow:'hidden' }}>
                              {cover ? <img src={cover} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" /> : <Music2 size={18} color="var(--text-muted)" style={{ margin:'12px auto', display:'block' }} />}
                            </div>
                            <div style={{ minWidth:0 }}>
                              <div style={{ fontSize:14, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.title}</div>
                              {/* Play bar */}
                              <div style={{ height:3, background:'rgba(255,255,255,0.07)', borderRadius:2, marginTop:6, overflow:'hidden', width:140 }}>
                                <div style={{ height:'100%', width:`${Math.round(((t.playCount||0)/maxPlays)*100)}%`, background:'var(--accent)', borderRadius:2 }} />
                              </div>
                            </div>
                          </div>
                          <span style={{ fontSize:14, fontWeight:700, color:'var(--accent)', textAlign:'right' }}>{(t.playCount||0).toLocaleString()}</span>
                          <span style={{ fontSize:13, color:'var(--text-muted)', textAlign:'right' }}>{fmt(t.duration)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── COMMUNITY ── */}
        {tab === 'community' && (
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
              <h2 style={{ fontSize:22, fontWeight:800, margin:0 }}>Публічні плейлісти</h2>
              <span style={{ fontSize:13, color:'var(--text-muted)' }}>{filteredPublic.length} плейлістів</span>
            </div>

            {/* Search */}
            <div style={{ position:'relative', marginBottom:20 }}>
              <Search size={16} style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', pointerEvents:'none' }} />
              <input
                value={searchQ} onChange={e => setSearchQ(e.target.value)}
                placeholder="Пошук плейлістів або авторів..."
                style={{ width:'100%', boxSizing:'border-box', height:44, paddingLeft:44, borderRadius:22, border:'1.5px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.05)', color:'#fff', fontSize:14, outline:'none' }}
              />
            </div>

            {filteredPublic.length === 0 && (
              <div style={{ textAlign:'center', padding:'60px 0', color:'var(--text-muted)' }}>
                <Globe size={48} style={{ opacity:0.2, display:'block', margin:'0 auto 16px' }} />
                <p>Публічних плейлістів немає</p>
              </div>
            )}

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:12 }}>
              {filteredPublic.map(pl => (
                <div key={pl.id} onClick={() => navigate(`/playlist/${pl.id}`)}
                  style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:14, cursor:'pointer', transition:'all 0.18s' }}
                  onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.12)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.06)'; }}>
                  <div style={{ width:50, height:50, borderRadius:12, flexShrink:0, background:playlistGradient(pl.title), display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Music2 size={22} color="rgba(255,255,255,0.7)" />
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:3 }}>{pl.title}</div>
                    <div style={{ fontSize:12, color:'var(--text-muted)' }}>від <span style={{ color:'var(--text-secondary)', fontWeight:600 }}>{pl.userName}</span> · {pl.trackCount} треків</div>
                  </div>
                  <ChevronRight size={16} color="var(--text-muted)" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab === 'settings' && (
          <div style={{ maxWidth:520 }}>
            <h2 style={{ fontSize:22, fontWeight:800, marginBottom:28 }}>Налаштування акаунта</h2>

            {/* Name */}
            <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:18, padding:'22px 24px', marginBottom:16 }}>
              <label style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)', display:'block', marginBottom:12 }}>Ім'я</label>
              <div style={{ display:'flex', gap:10 }}>
                <input
                  value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleUpdateName()}
                  style={{ flex:1, padding:'11px 14px', borderRadius:12, border:'1.5px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.05)', color:'#fff', fontSize:14, outline:'none' }}
                />
                <button onClick={handleUpdateName} style={{ padding:'11px 20px', borderRadius:12, border:'none', background:'var(--accent)', color:'#000', fontWeight:700, fontSize:13, cursor:'pointer', flexShrink:0 }}>
                  Зберегти
                </button>
              </div>
            </div>

            {/* Email (readonly) */}
            <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:18, padding:'22px 24px', marginBottom:16 }}>
              <label style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)', display:'block', marginBottom:12 }}>Email</label>
              <div style={{ fontSize:15, color:'var(--text-secondary)' }}>{user.email}</div>
            </div>

            {/* Role / Badges */}
            <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:18, padding:'22px 24px', marginBottom:16 }}>
              <label style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)', display:'block', marginBottom:14 }}>Статус</label>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <span style={{ padding:'6px 14px', borderRadius:100, fontSize:13, fontWeight:700, background:'rgba(255,255,255,0.08)', color:'var(--text-secondary)' }}>{user.role}</span>
                {user.artistId && <span style={{ padding:'6px 14px', borderRadius:100, fontSize:13, fontWeight:700, background:'rgba(29,185,84,0.15)', color:'var(--accent)' }}>🎤 Виконавець</span>}
                {user.role === 'admin' && <span style={{ padding:'6px 14px', borderRadius:100, fontSize:13, fontWeight:700, background:'rgba(168,85,247,0.15)', color:'#a855f7' }}>👑 Адмін</span>}
              </div>
            </div>

            {/* Become artist */}
            {!user.artistId && (
              <div style={{ background:'linear-gradient(135deg, rgba(29,185,84,0.07), rgba(99,102,241,0.07))', border:'1px solid rgba(29,185,84,0.2)', borderRadius:18, padding:'22px 24px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ width:48, height:48, borderRadius:14, background:'rgba(29,185,84,0.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <Mic2 size={24} color="var(--accent)" />
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:15, fontWeight:800, marginBottom:4 }}>Стати виконавцем</div>
                    <div style={{ fontSize:12, color:'var(--text-muted)' }}>Завантажуй власні треки і збирай слухачів</div>
                  </div>
                  <button onClick={handleBecomeArtist} style={{ padding:'10px 20px', borderRadius:12, border:'none', background:'var(--accent)', color:'#000', fontWeight:800, fontSize:13, cursor:'pointer', flexShrink:0 }}>
                    Активувати
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Upload Modal ── */}
      {showUpload && (
        <UploadModal
          artistId={user.artistId}
          onClose={() => setShowUpload(false)}
          onSuccess={() => qc.invalidateQueries(['myArtistTracks'])}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
