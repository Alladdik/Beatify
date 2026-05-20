import React, { useState, useRef, useCallback, useEffect } from 'react';
import { searchApi, externalSearchApi, downloadApi, fileUrl, tracksApi, playlistsApi } from '../api';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import { useQueryClient } from '@tanstack/react-query';
import {
  Search, Loader2, Play, Pause, Download, Music2,
  FileText, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, X,
  Heart, ListPlus
} from 'lucide-react';
import toast from 'react-hot-toast';
import { debounce } from 'lodash';

function fmt(s) {
  if (!s) return '';
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function Highlight({ text = '', query = '' }) {
  if (!query || !text) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'transparent', color: 'var(--accent)', fontWeight: 700, padding: 0 }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function SourceBadge({ source }) {
  if (source === 'soundcloud') return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'2px 8px', borderRadius:100, fontSize:10, fontWeight:700, background:'rgba(255,85,0,0.15)', color:'#ff7733', letterSpacing:0.3 }}>
      ☁ SoundCloud
    </span>
  );
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'2px 8px', borderRadius:100, fontSize:10, fontWeight:700, background:'rgba(255,0,0,0.12)', color:'#ff5555', letterSpacing:0.3 }}>
      ▶ YouTube Music
    </span>
  );
}

function EqBars() {
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:2, height:14, flexShrink:0 }}>
      {[0,0.15,0.3].map((d,i) => (
        <div key={i} style={{ width:3, borderRadius:1, background:'var(--accent)', animation:`eq 0.7s ${d}s ease-in-out infinite alternate` }}/>
      ))}
    </div>
  );
}

// ── External Track Card ───────────────────────────────────────────────────────
function ExternalCard({ item, query, extResults }) {
  const [streamLoading, setStreamLoading] = useState(false);
  const [dlStatus, setDlStatus]           = useState('idle');
  const [dlOpen, setDlOpen]               = useState(false);
  const [dlTitle, setDlTitle]             = useState(item.title || '');
  const [dlArtist, setDlArtist]           = useState(item.artist || '');
  const [hovered, setHovered]             = useState(false);

  const { currentTrack, isPlaying, playExternalUrl, togglePlay } = usePlayerStore();
  const { user } = useAuthStore();
  const isAdmin    = user?.role === 'admin';
  const isCurrent  = currentTrack?.isExternal && currentTrack?.externalUrl === item.webpage_url;
  const isThisPlay = isCurrent && isPlaying;

  const handlePlay = async () => {
    if (isCurrent) { togglePlay(); return; }
    setStreamLoading(true);
    try {
      const res = await externalSearchApi.getPreviewUrl(item.webpage_url);
      const queue = extResults || [item];
      const index = queue.findIndex(t => t.webpage_url === item.webpage_url);
      playExternalUrl(res.data.streamUrl, {
        title: item.title, artistName: item.artist || 'Unknown',
        thumbnail: item.thumbnail, externalUrl: item.webpage_url,
        source: item.source, duration: item.duration,
      }, queue, index !== -1 ? index : 0);
    } catch (err) {
      toast.error(err.response?.status === 503 ? 'yt-dlp не встановлено на сервері' : 'Не вдалось отримати потік');
    } finally { setStreamLoading(false); }
  };

  const handleDownload = async () => {
    if (!dlTitle.trim()) return toast.error('Введіть назву треку');
    setDlOpen(false); setDlStatus('downloading');
    try {
      await downloadApi.download({ url: item.webpage_url, title: dlTitle.trim(), artistName: dlArtist.trim() || item.artist || 'Unknown' });
      setDlStatus('done');
      toast.success(`✅ "${dlTitle}" додано до бібліотеки!`);
    } catch (err) {
      setDlStatus('error');
      toast.error(err.response?.status === 401 ? 'Необхідно увійти як адміністратор' : err.response?.data?.message || 'Помилка завантаження');
    }
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 16,
        border: `1px solid ${isCurrent ? 'rgba(29,185,84,0.4)' : hovered ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'}`,
        background: isCurrent ? 'rgba(29,185,84,0.07)' : hovered ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
        backdropFilter: 'blur(16px)',
        marginBottom: 8,
        overflow: 'hidden',
        transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: isCurrent
          ? '0 4px 24px rgba(29,185,84,0.15), inset 0 1px 0 rgba(255,255,255,0.08)'
          : hovered ? '0 2px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)'
          : 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <div style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px' }}>
        {/* Thumbnail with play overlay */}
        <div style={{ position:'relative', flexShrink:0 }}>
          {item.thumbnail
            ? <img src={item.thumbnail} alt="" style={{ width:56, height:56, borderRadius:10, objectFit:'cover', display:'block' }} />
            : <div style={{ width:56, height:56, borderRadius:10, background:'rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Music2 size={22} color="var(--text-muted)" />
              </div>
          }
          <button
            onClick={handlePlay}
            disabled={streamLoading || dlStatus === 'downloading'}
            style={{
              position:'absolute', inset:0, borderRadius:10, border:'none', cursor:'pointer',
              background: isThisPlay ? 'rgba(0,0,0,0.55)' : hovered ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0)',
              display:'flex', alignItems:'center', justifyContent:'center',
              transition:'all 0.18s', color:'#fff',
              opacity: isThisPlay || hovered ? 1 : 0,
            }}
          >
            {streamLoading
              ? <Loader2 size={20} style={{ animation:'spin 0.8s linear infinite' }} />
              : isThisPlay ? <Pause size={20} /> : <Play size={20} style={{ marginLeft:2 }} />
            }
          </button>
        </div>

        {/* Info */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:600, display:'flex', alignItems:'center', gap:8, overflow:'hidden' }}>
            <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color: isCurrent ? 'var(--accent)' : 'inherit' }}>
              <Highlight text={item.title} query={query} />
            </span>
            {isCurrent && isThisPlay && <EqBars />}
          </div>
          <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:3, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <Highlight text={item.artist || ''} query={query} />
            {item.duration && <span>· {fmt(item.duration)}</span>}
            <SourceBadge source={item.source} />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
          {dlStatus === 'downloading' && <Loader2 size={16} style={{ animation:'spin 0.8s linear infinite', color:'var(--accent)' }} />}
          {dlStatus === 'done' && (
            <span style={{ fontSize:12, color:'var(--accent)', display:'flex', alignItems:'center', gap:4, fontWeight:600 }}>
              <CheckCircle2 size={14} /> В бібліотеці
            </span>
          )}
          {dlStatus === 'error' && <AlertCircle size={16} color="#ef4444" title="Помилка" />}
          {dlStatus === 'idle' && isAdmin && (
            <button
              className="btn btn-secondary"
              style={{ fontSize:12, padding:'5px 14px', gap:5, borderRadius:10, opacity: hovered ? 1 : 0.7, transition:'opacity 0.15s' }}
              onClick={() => setDlOpen(p => !p)}
            >
              <Download size={12} /> {dlOpen ? '✕' : 'Зберегти'}
            </button>
          )}
          {dlStatus === 'idle' && !isAdmin && !user && (
            <span style={{ fontSize:11, color:'var(--text-muted)', opacity: hovered ? 1 : 0, transition:'opacity 0.15s' }}>Увійдіть щоб зберегти</span>
          )}
        </div>
      </div>

      {/* Download panel */}
      {dlOpen && dlStatus === 'idle' && (
        <div style={{ padding:'12px 16px 14px', borderTop:'1px solid rgba(255,255,255,0.06)', background:'rgba(0,0,0,0.2)', display:'flex', gap:8, alignItems:'flex-end', animation:'fadeIn 0.15s ease' }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:4 }}>Назва треку</div>
            <input className="form-input" style={{ height:36, padding:'0 10px', fontSize:13 }} value={dlTitle} onChange={e => setDlTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleDownload()} placeholder="Назва..." />
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:4 }}>Виконавець</div>
            <input className="form-input" style={{ height:36, padding:'0 10px', fontSize:13 }} value={dlArtist} onChange={e => setDlArtist(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleDownload()} placeholder="Виконавець..." />
          </div>
          <button className="btn btn-primary" style={{ height:36, padding:'0 16px', fontSize:13, gap:6, flexShrink:0, borderRadius:8 }} onClick={handleDownload}>
            <Download size={13} /> Зберегти
          </button>
          <button onClick={() => setDlOpen(false)} style={{ height:36, width:36, border:'none', background:'rgba(255,255,255,0.05)', cursor:'pointer', color:'var(--text-muted)', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:8, flexShrink:0 }}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Local Track Row ───────────────────────────────────────────────────────────
function LocalTrackRow({ track, query, isPlaying, isCurrent, onPlay }) {
  const [hovered, setHovered] = useState(false);
  const [liked, setLiked] = useState(track.isLiked);
  const [showPlMenu, setShowPlMenu] = useState(false);
  const [pls, setPls] = useState([]);
  const plMenuRef = React.useRef(null);
  const cover = track.coverPath ? fileUrl('covers', track.coverPath) : null;
  const active = isCurrent && isPlaying;
  const { user } = useAuthStore();
  const qc = useQueryClient();

  React.useEffect(() => {
    if (!showPlMenu) return;
    const handler = (e) => {
      if (plMenuRef.current && !plMenuRef.current.contains(e.target)) setShowPlMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPlMenu]);

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
      onClick={onPlay}
      style={{
        position:'relative',
        display:'flex', alignItems:'center', gap:12, padding:'8px 12px',
        borderRadius:12, cursor:'pointer', transition:'all 0.15s',
        background: isCurrent ? 'rgba(29,185,84,0.08)' : hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
        marginBottom:2,
      }}
    >
      {/* Cover + play overlay */}
      <div style={{ position:'relative', flexShrink:0, width:44, height:44 }}>
        {cover
          ? <img src={cover} alt="" style={{ width:44, height:44, borderRadius:8, objectFit:'cover', display:'block' }} />
          : <div style={{ width:44, height:44, borderRadius:8, background:'rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'center' }}><Music2 size={18} color="var(--text-muted)" /></div>
        }
        {(hovered || active) && (
          <div onClick={e => { e.stopPropagation(); onPlay(); }} style={{
            position:'absolute', inset:0, borderRadius:8, background:'rgba(0,0,0,0.5)',
            display:'flex', alignItems:'center', justifyContent:'center', color:'#fff',
          }}>
            {active ? <Pause size={16} /> : <Play size={16} style={{ marginLeft:1 }} />}
          </div>
        )}
      </div>

      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:14, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color: isCurrent ? 'var(--accent)' : 'var(--text-primary)', display:'flex', alignItems:'center', gap:8 }}>
          <Highlight text={track.title} query={query} />
          {track.mediaType === 'video' && <span style={{ fontSize:10, padding:'1px 6px', borderRadius:4, background:'rgba(255,165,0,0.15)', color:'#ffa500', fontWeight:700 }}>VIDEO</span>}
          {track.isExplicit && <span style={{ fontSize:10, padding:'1px 5px', borderRadius:4, background:'rgba(255,255,255,0.1)', color:'var(--text-muted)', fontWeight:700 }}>E</span>}
          {active && <EqBars />}
        </div>
        <div style={{ fontSize:12, color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:2 }}>
          <Highlight text={track.artistName} query={query} />
          {track.albumTitle && <> · <Highlight text={track.albumTitle} query={query} /></>}
        </div>
      </div>

      <span style={{ fontSize:12, color:'var(--text-muted)', flexShrink:0 }}>{fmt(track.duration)}</span>

      {/* Like + playlist buttons */}
      {hovered && user && (
        <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={handleLike}
            title={liked ? 'Видалити з улюблених' : 'Додати до улюблених'}
            style={{ background:'none', border:'none', cursor:'pointer', padding:4, display:'flex', alignItems:'center', color: liked ? '#1db954' : 'var(--text-muted)' }}
          >
            <Heart size={16} fill={liked ? '#1db954' : 'none'} />
          </button>
          <div style={{ position:'relative' }} ref={plMenuRef}>
            <button
              onClick={openPlMenu}
              title="Додати до плейлисту"
              style={{ background:'none', border:'none', cursor:'pointer', padding:4, display:'flex', alignItems:'center', color:'var(--text-muted)', transition:'transform 0.18s' }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              <ListPlus size={16} />
            </button>
            {showPlMenu && (
              <div style={{
                position:'fixed', zIndex:500,
                background:'rgba(18,18,28,0.98)', backdropFilter:'blur(20px)',
                border:'1px solid rgba(255,255,255,0.1)', borderRadius:12, padding:8,
                width:210, boxShadow:'0 12px 40px rgba(0,0,0,0.7)',
                top: (() => { const el = plMenuRef.current; if (!el) return 'auto'; return el.getBoundingClientRect().bottom + 4; })(),
                right: (() => { const el = plMenuRef.current; if (!el) return 'auto'; return window.innerWidth - el.getBoundingClientRect().right; })(),
              }}>
                <div style={{ fontSize:11, color:'var(--text-muted)', padding:'4px 8px 8px', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.08em' }}>Плейлисти</div>
                {pls.length === 0 && <div style={{ fontSize:13, color:'var(--text-muted)', padding:'8px' }}>Немає плейлистів</div>}
                <div style={{ maxHeight:200, overflowY:'auto' }}>
                  {pls.map(pl => (
                    <div
                      key={pl.id}
                      onClick={() => addToPl(pl.id)}
                      style={{ padding:'8px 10px', fontSize:13, borderRadius:8, cursor:'pointer', color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', transition:'background 0.15s' }}
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

// ── Lyrics Row ────────────────────────────────────────────────────────────────
function LyricsRow({ track, query }) {
  const { playTrack } = usePlayerStore();
  const [open, setOpen] = useState(false);
  const cover = track.coverPath ? fileUrl('covers', track.coverPath) : null;
  const matchLine = (track.lyricsSnippet || '').split('\n').find(l => l.toLowerCase().includes(query.toLowerCase())) || '';

  return (
    <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:14, marginBottom:8, overflow:'hidden', transition:'all 0.15s' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', cursor:'pointer' }} onClick={() => setOpen(p => !p)}>
        <button
          onClick={e => { e.stopPropagation(); playTrack(track); }}
          style={{ width:34, height:34, borderRadius:'50%', border:'none', background:'rgba(29,185,84,0.15)', color:'var(--accent)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
        ><Play size={14} /></button>
        {cover
          ? <img src={cover} alt="" style={{ width:44, height:44, borderRadius:8, objectFit:'cover', flexShrink:0 }} />
          : <div style={{ width:44, height:44, borderRadius:8, background:'rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><FileText size={16} color="var(--text-muted)" /></div>
        }
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{track.title}</div>
          <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{track.artistName}</div>
          {matchLine && (
            <div style={{ fontSize:11, color:'rgba(168,85,247,0.8)', marginTop:4, fontStyle:'italic', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              «<Highlight text={matchLine.trim()} query={query} />»
            </div>
          )}
        </div>
        <div style={{ color:'var(--text-muted)', flexShrink:0, transition:'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          <ChevronDown size={16} />
        </div>
      </div>
      {open && (
        <div style={{ padding:'14px 20px', borderTop:'1px solid rgba(255,255,255,0.05)', background:'rgba(0,0,0,0.2)', whiteSpace:'pre-wrap', fontSize:13, lineHeight:2, color:'var(--text-secondary)', maxHeight:280, overflowY:'auto' }}>
          <Highlight text={track.lyricsSnippet || ''} query={query} />
        </div>
      )}
    </div>
  );
}

// ── Tab definitions ───────────────────────────────────────────────────────────
const TABS = [
  { id:'all',        label:'Все',           emoji:'🎶', color:'#a78bfa' },
  { id:'local',      label:'Бібліотека',    emoji:'🎵', color:'#1db954' },
  { id:'youtube',    label:'YouTube Music', emoji:'▶️', color:'#ff4444' },
  { id:'soundcloud', label:'SoundCloud',    emoji:'☁️', color:'#ff7733' },
  { id:'lyrics',     label:'Текст пісні',   emoji:'📄', color:'#a855f7' },
];

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function SearchPage() {
  const [query, setQuery]               = useState('');
  const [tab, setTab]                   = useState('all');
  const [localResults, setLocalResults] = useState(null);
  const [extResults, setExtResults]     = useState(null);
  const [lyricsResults, setLyricsResults] = useState(null);
  const [loading, setLoading]           = useState(false);
  const [allResults, setAllResults] = useState({ local: null, youtube: null, soundcloud: null });
  const [allLoading, setAllLoading] = useState({ local: false, youtube: false, soundcloud: false });
  const inputRef = useRef(null);

  const { currentTrack, isPlaying, playTrack, setQueue } = usePlayerStore();

  useEffect(() => { inputRef.current?.focus(); }, []);

  const doLocal = useCallback(debounce(async (q) => {
    if (!q.trim()) { setLocalResults(null); setLoading(false); return; }
    try { const res = await searchApi.search(q); setLocalResults(res.data); }
    catch { setLocalResults({ tracks:[], artists:[], albums:[] }); }
    finally { setLoading(false); }
  }, 350), []);

  const doExternal = useCallback(debounce(async (q, source) => {
    if (!q.trim()) { setExtResults(null); setLoading(false); return; }
    try { const res = await externalSearchApi.search(q, source, 12); setExtResults(res.data); }
    catch (err) {
      if (err.response?.status === 503) toast.error('yt-dlp не встановлено. Виконайте: winget install yt-dlp');
      setExtResults([]);
    }
    finally { setLoading(false); }
  }, 700), []);

  const doLyrics = useCallback(debounce(async (q) => {
    if (!q.trim() || q.length < 3) { setLyricsResults(null); setLoading(false); return; }
    try { const res = await externalSearchApi.searchLyrics(q); setLyricsResults(res.data); }
    catch { setLyricsResults([]); }
    finally { setLoading(false); }
  }, 350), []);

  const doAll = useCallback(debounce((q) => {
    if (!q.trim()) {
      setAllResults({ local: null, youtube: null, soundcloud: null });
      setAllLoading({ local: false, youtube: false, soundcloud: false });
      setLoading(false);
      return;
    }
    setAllResults({ local: null, youtube: null, soundcloud: null });
    setAllLoading({ local: true, youtube: true, soundcloud: true });

    // Fire all 3 in parallel, update state as each resolves
    searchApi.search(q)
      .then(r => setAllResults(p => ({ ...p, local: r.data })))
      .catch(() => setAllResults(p => ({ ...p, local: { tracks:[], artists:[], albums:[] } })))
      .finally(() => { setAllLoading(p => ({ ...p, local: false })); setLoading(false); });

    externalSearchApi.search(q, 'youtube', 6)
      .then(r => setAllResults(p => ({ ...p, youtube: r.data })))
      .catch(() => setAllResults(p => ({ ...p, youtube: [] })))
      .finally(() => setAllLoading(p => ({ ...p, youtube: false })));

    externalSearchApi.search(q, 'soundcloud', 6)
      .then(r => setAllResults(p => ({ ...p, soundcloud: r.data })))
      .catch(() => setAllResults(p => ({ ...p, soundcloud: [] })))
      .finally(() => setAllLoading(p => ({ ...p, soundcloud: false })));
  }, 500), []);

  const runSearch = (q, t) => {
    setLoading(true);
    setLocalResults(null); setExtResults(null); setLyricsResults(null);
    setAllResults({ local: null, youtube: null, soundcloud: null });
    if (t === 'all')        doAll(q);
    if (t === 'local')      doLocal(q);
    if (t === 'youtube')    doExternal(q, 'youtube');
    if (t === 'soundcloud') doExternal(q, 'soundcloud');
    if (t === 'lyrics')     doLyrics(q);
  };

  const handleChange = (e) => {
    const q = e.target.value; setQuery(q);
    if (!q.trim()) {
      setLoading(false);
      setAllResults({ local: null, youtube: null, soundcloud: null });
      return;
    }
    runSearch(q, tab);
  };

  const handleTab = (t) => {
    setTab(t);
    if (query.trim()) runSearch(query, t);
  };

  const hasLocal = localResults && (localResults.tracks?.length || localResults.artists?.length || localResults.albums?.length);
  const activeTab = TABS.find(t => t.id === tab);

  return (
    <div className="main-content">
      {/* Sticky header */}
      <div style={{ padding:'28px 28px 0', position:'sticky', top:0, zIndex:10, background:'var(--bg-base)', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>

        {/* Search bar */}
        <div style={{ position:'relative', maxWidth:620, marginBottom:20 }}>
          <div style={{ position:'absolute', left:18, top:'50%', transform:'translateY(-50%)', color: query ? 'var(--text-secondary)' : 'var(--text-muted)', pointerEvents:'none', transition:'color 0.2s' }}>
            <Search size={18} />
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={handleChange}
            placeholder="Назва пісні, виконавець, рядок тексту..."
            style={{
              width:'100%', height:50, paddingLeft:50, paddingRight:46,
              fontSize:14, fontWeight:500, borderRadius:25,
              background:'rgba(255,255,255,0.06)',
              border:`1.5px solid ${query ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.07)'}`,
              color:'var(--text-primary)', outline:'none',
              backdropFilter:'blur(20px)',
              transition:'all 0.2s',
              boxShadow: query ? '0 0 0 3px rgba(29,185,84,0.08)' : 'none',
            }}
            onFocus={e => e.target.style.borderColor = 'rgba(29,185,84,0.4)'}
            onBlur={e => e.target.style.borderColor = query ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.07)'}
          />
          {loading && query && (
            <Loader2 size={16} style={{ position:'absolute', right:16, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', animation:'spin 0.8s linear infinite' }} />
          )}
          {query && !loading && (
            <button
              onClick={() => { setQuery(''); setLocalResults(null); setExtResults(null); setLyricsResults(null); setAllResults({ local: null, youtube: null, soundcloud: null }); }}
              style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'rgba(255,255,255,0.08)', border:'none', cursor:'pointer', color:'var(--text-muted)', display:'flex', padding:5, borderRadius:'50%' }}
            ><X size={14} /></button>
          )}
        </div>

        {/* Pill tabs */}
        <div style={{ display:'flex', gap:4, paddingBottom:0 }}>
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => handleTab(t.id)}
                style={{
                  display:'flex', alignItems:'center', gap:6,
                  padding:'9px 18px', border:'none', cursor:'pointer',
                  fontSize:13, fontWeight:active ? 700 : 500,
                  borderRadius:'12px 12px 0 0',
                  transition:'all 0.18s cubic-bezier(0.4,0,0.2,1)',
                  background: active ? 'rgba(255,255,255,0.07)' : 'transparent',
                  color: active ? t.color : 'var(--text-muted)',
                  position:'relative',
                  letterSpacing: active ? '0.01em' : 0,
                }}
              >
                <span style={{ fontSize:14 }}>{t.emoji}</span>
                {t.label}
                {active && (
                  <div style={{
                    position:'absolute', bottom:0, left:18, right:18, height:2,
                    borderRadius:'2px 2px 0 0', background:t.color,
                    boxShadow:`0 0 8px ${t.color}88`,
                  }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding:'24px 28px 100px' }}>

        {/* Empty / welcome state */}
        {!query && (
          <div style={{ textAlign:'center', paddingTop:64, color:'var(--text-muted)' }}>
            <div style={{ width:80, height:80, borderRadius:20, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', fontSize:36 }}>🔍</div>
            <p style={{ fontSize:20, fontWeight:700, color:'var(--text-secondary)', marginBottom:6 }}>Знайди будь-яку музику</p>
            <p style={{ fontSize:13, color:'var(--text-muted)', lineHeight:1.9, marginBottom:24 }}>
              Бібліотека · YouTube Music · SoundCloud · Тексти пісень
            </p>
            <div style={{ display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap' }}>
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => handleTab(t.id)}
                  style={{
                    padding:'7px 16px', borderRadius:100,
                    border:`1px solid ${t.color}44`,
                    background:`${t.color}11`,
                    color:t.color, fontSize:12, fontWeight:600, cursor:'pointer',
                    transition:'all 0.15s',
                  }}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── ALL SOURCES ── */}
        {tab === 'all' && query && (
          <div className="animate-in">
            {/* No results from any source */}
            {!allLoading.local && !allLoading.youtube && !allLoading.soundcloud
              && !allResults.local?.tracks?.length && !allResults.local?.artists?.length
              && !allResults.youtube?.length && !allResults.soundcloud?.length
              && (allResults.local !== null || allResults.youtube !== null || allResults.soundcloud !== null) && (
              <div style={{ textAlign:'center', paddingTop:60, color:'var(--text-muted)' }}>
                <Music2 size={48} style={{ opacity:0.2, marginBottom:12 }} />
                <p style={{ fontSize:15 }}>Нічого не знайдено за запитом «{query}»</p>
              </div>
            )}

            {/* ── Library section ── */}
            {(allLoading.local || allResults.local) && (
              <section style={{ marginBottom:28 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                  <div style={{ width:28, height:28, borderRadius:8, background:'rgba(29,185,84,0.15)', border:'1px solid rgba(29,185,84,0.25)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13 }}>🎵</div>
                  <span style={{ fontSize:13, fontWeight:700, color:'#1db954' }}>Бібліотека</span>
                  {allLoading.local && <Loader2 size={13} style={{ animation:'spin 0.8s linear infinite', color:'var(--text-muted)' }} />}
                </div>
                {allResults.local?.tracks?.map(t => (
                  <LocalTrackRow
                    key={t.id} track={t} query={query}
                    isCurrent={currentTrack?.id === t.id && !currentTrack?.isExternal}
                    isPlaying={isPlaying}
                    onPlay={() => setQueue(allResults.local.tracks, t.id)}
                  />
                ))}
                {!allLoading.local && !allResults.local?.tracks?.length && (
                  <div style={{ fontSize:13, color:'var(--text-muted)', padding:'8px 12px' }}>Нічого не знайдено в бібліотеці</div>
                )}
              </section>
            )}

            {/* ── YouTube Music section ── */}
            <section style={{ marginBottom:28 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                <div style={{ width:28, height:28, borderRadius:8, background:'rgba(255,68,68,0.12)', border:'1px solid rgba(255,68,68,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13 }}>▶</div>
                <span style={{ fontSize:13, fontWeight:700, color:'#ff5555' }}>YouTube Music</span>
                {allLoading.youtube && <Loader2 size={13} style={{ animation:'spin 0.8s linear infinite', color:'var(--text-muted)' }} />}
                {!allLoading.youtube && allResults.youtube && <span style={{ fontSize:11, color:'var(--text-muted)' }}>{allResults.youtube.length} результатів</span>}
              </div>
              {allResults.youtube?.map(item => (
                <ExternalCard key={item.id || item.webpage_url} item={item} query={query} extResults={allResults.youtube} />
              ))}
              {!allLoading.youtube && allResults.youtube?.length === 0 && (
                <div style={{ fontSize:13, color:'var(--text-muted)', padding:'8px 12px' }}>Нічого не знайдено на YouTube</div>
              )}
            </section>

            {/* ── SoundCloud section ── */}
            <section style={{ marginBottom:28 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                <div style={{ width:28, height:28, borderRadius:8, background:'rgba(255,119,51,0.12)', border:'1px solid rgba(255,119,51,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13 }}>☁</div>
                <span style={{ fontSize:13, fontWeight:700, color:'#ff7733' }}>SoundCloud</span>
                {allLoading.soundcloud && <Loader2 size={13} style={{ animation:'spin 0.8s linear infinite', color:'var(--text-muted)' }} />}
                {!allLoading.soundcloud && allResults.soundcloud && <span style={{ fontSize:11, color:'var(--text-muted)' }}>{allResults.soundcloud.length} результатів</span>}
              </div>
              {allResults.soundcloud?.map(item => (
                <ExternalCard key={item.id || item.webpage_url} item={item} query={query} extResults={allResults.soundcloud} />
              ))}
              {!allLoading.soundcloud && allResults.soundcloud?.length === 0 && (
                <div style={{ fontSize:13, color:'var(--text-muted)', padding:'8px 12px' }}>Нічого не знайдено на SoundCloud</div>
              )}
            </section>
          </div>
        )}

        {/* ── LOCAL ── */}
        {tab === 'local' && query && (
          <div className="animate-in">
            {!hasLocal && !loading && (
              <div style={{ textAlign:'center', paddingTop:60, color:'var(--text-muted)' }}>
                <Music2 size={48} style={{ opacity:0.2, marginBottom:12 }} />
                <p style={{ fontSize:15, marginBottom:8 }}>Нічого не знайдено за запитом «{query}»</p>
                <p style={{ fontSize:13, color:'var(--text-muted)' }}>
                  Спробуйте{' '}
                  <button onClick={() => handleTab('youtube')} style={{ background:'none', border:'none', color:'#ff4444', cursor:'pointer', fontWeight:700, fontSize:13 }}>YouTube Music</button>
                  {' '}або{' '}
                  <button onClick={() => handleTab('soundcloud')} style={{ background:'none', border:'none', color:'#ff7733', cursor:'pointer', fontWeight:700, fontSize:13 }}>SoundCloud</button>
                </p>
              </div>
            )}

            {localResults?.tracks?.length > 0 && (
              <section style={{ marginBottom:32 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10 }}>Треки</div>
                {localResults.tracks.map(t => (
                  <LocalTrackRow
                    key={t.id} track={t} query={query}
                    isCurrent={currentTrack?.id === t.id && !currentTrack?.isExternal}
                    isPlaying={isPlaying}
                    onPlay={() => setQueue(localResults.tracks, t.id)}
                  />
                ))}
              </section>
            )}

            {localResults?.artists?.length > 0 && (
              <section style={{ marginBottom:32 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:12 }}>Виконавці</div>
                <div style={{ display:'flex', gap:14, flexWrap:'wrap' }}>
                  {localResults.artists.map(a => {
                    const img = a.imagePath ? fileUrl('artists', a.imagePath) : null;
                    return (
                      <div
                        key={a.id}
                        onClick={() => window.location.href = `/artist/${a.id}`}
                        style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, cursor:'pointer', width:90, padding:'12px 4px', borderRadius:14, transition:'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        {img
                          ? <img src={img} style={{ width:72, height:72, borderRadius:'50%', objectFit:'cover' }} alt="" />
                          : <div style={{ width:72, height:72, borderRadius:'50%', background:'rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'center' }}><Music2 size={24} color="var(--text-muted)" /></div>
                        }
                        <span style={{ fontSize:13, fontWeight:600, textAlign:'center', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', width:'100%' }}>
                          <Highlight text={a.name} query={query} />
                        </span>
                        <span style={{ fontSize:11, color:'var(--text-muted)' }}>{a.trackCount} тр.</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {localResults?.albums?.length > 0 && (
              <section>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:12 }}>Альбоми</div>
                <div style={{ display:'flex', gap:14, flexWrap:'wrap' }}>
                  {localResults.albums.map(al => {
                    const img = al.coverPath ? fileUrl('covers', al.coverPath) : null;
                    return (
                      <div
                        key={al.id}
                        onClick={() => window.location.href = `/album/${al.id}`}
                        style={{ cursor:'pointer', width:130 }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                      >
                        {img
                          ? <img src={img} style={{ width:130, height:130, borderRadius:12, objectFit:'cover', marginBottom:8, display:'block' }} alt="" />
                          : <div style={{ width:130, height:130, borderRadius:12, background:'rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:8 }}><Music2 size={32} color="var(--text-muted)" /></div>
                        }
                        <div style={{ fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          <Highlight text={al.title} query={query} />
                        </div>
                        <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{al.artistName}</div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}

        {/* ── YOUTUBE / SOUNDCLOUD ── */}
        {(tab === 'youtube' || tab === 'soundcloud') && query && (
          <div className="animate-in">
            {loading && !extResults && (
              <div style={{ textAlign:'center', paddingTop:60 }}>
                <Loader2 size={36} style={{ animation:'spin 0.8s linear infinite', color: tab === 'soundcloud' ? '#ff7733' : '#ff4444', marginBottom:14 }} />
                <p style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>
                  Пошук на {tab === 'soundcloud' ? '☁ SoundCloud' : '▶ YouTube Music'}...
                </p>
                <p style={{ fontSize:12, color:'var(--text-muted)' }}>Зазвичай 3–8 секунд</p>
              </div>
            )}

            {!loading && extResults?.length === 0 && (
              <div style={{ textAlign:'center', paddingTop:60, color:'var(--text-muted)' }}>
                <p style={{ fontSize:15 }}>Нічого не знайдено за запитом «{query}»</p>
              </div>
            )}

            {extResults && extResults.length > 0 && (
              <>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:14 }}>
                  {extResults.length} результатів
                </div>
                {extResults.map(item => (
                  <ExternalCard key={item.id || item.webpage_url} item={item} query={query} extResults={extResults} />
                ))}
              </>
            )}
          </div>
        )}

        {/* ── LYRICS ── */}
        {tab === 'lyrics' && (
          <div className="animate-in">
            {(!query || query.length < 3) && (
              <div style={{ textAlign:'center', paddingTop:60, color:'var(--text-muted)' }}>
                <div style={{ width:64, height:64, borderRadius:16, background:'rgba(168,85,247,0.1)', border:'1px solid rgba(168,85,247,0.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
                  <FileText size={28} color="#a855f7" />
                </div>
                <p style={{ fontSize:16, fontWeight:700, color:'var(--text-secondary)', marginBottom:8 }}>Пошук по текстах пісень</p>
                <p style={{ fontSize:13 }}>Введіть мінімум 3 символи — знайдемо рядок у бібліотеці</p>
              </div>
            )}
            {query.length >= 3 && !loading && lyricsResults?.length === 0 && (
              <div style={{ textAlign:'center', paddingTop:60, color:'var(--text-muted)' }}>
                <FileText size={40} style={{ opacity:0.2, marginBottom:12 }} />
                <p style={{ fontSize:14 }}>Рядок «{query}» не знайдено в жодному треку</p>
                <p style={{ fontSize:12, marginTop:8 }}>Пошук лише серед треків з доданим текстом</p>
              </div>
            )}
            {lyricsResults?.map(t => (
              <LyricsRow key={t.id} track={t} query={query} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
