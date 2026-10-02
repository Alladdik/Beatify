import { useState } from 'react';
import { externalSearchApi, downloadApi } from '../../api';
import {
  Search, Loader2, Download, Music, User, CheckCircle2, AlertCircle,
  CheckSquare, Square,
} from 'lucide-react';
import toast from 'react-hot-toast';

function fmt(s) {
  if (!s) return '';
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function DownloadStatus({ status }) {
  if (status === 'done')        return <CheckCircle2 size={16} color="var(--accent-text)" />;
  if (status === 'error')       return <AlertCircle  size={16} color="var(--danger)" />;
  if (status === 'downloading') return <Loader2      size={16} style={{ animation: 'spin 1s linear infinite', color: 'var(--warn)' }} />;
  return null;
}

export default function SoundCloudTab() {
  const [username, setUsername] = useState('');
  const [type, setType]         = useState('tracks'); // tracks | likes
  const [loading, setLoading]   = useState(false);
  const [userData, setUserData] = useState(null); // { user, tracks }
  const [selected, setSelected] = useState(new Set());
  const [dlStatuses, setDlStatuses] = useState({}); // { [webpage_url]: idle|downloading|done|error }
  const [bulkRunning, setBulkRunning] = useState(false);

  const fetchUser = async () => {
    const u = username.trim().replace(/^https?:\/\/soundcloud\.com\//i, '').replace(/\/.*/, '');
    if (!u) return toast.error('Введіть ім\'я користувача SoundCloud');
    setLoading(true);
    setUserData(null);
    setSelected(new Set());
    setDlStatuses({});
    try {
      const res = await externalSearchApi.soundcloudUser(u, type, 100);
      setUserData(res.data);
      if (res.data.tracks.length === 0) toast('Треків не знайдено. Можливо, профіль приватний.', { icon: '⚠️' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Помилка завантаження профілю');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (url) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(url) ? next.delete(url) : next.add(url);
      return next;
    });
  };

  const toggleAll = () => {
    if (!userData) return;
    const all = userData.tracks.map(t => t.webpage_url);
    if (selected.size === all.length) setSelected(new Set());
    else setSelected(new Set(all));
  };

  const downloadTrack = async (track) => {
    const key = track.webpage_url;
    setDlStatuses(s => ({ ...s, [key]: 'downloading' }));
    try {
      await downloadApi.download({
        url: key,
        title: track.title,
        artistName: track.artist || userData?.user?.name || '',
        coverUrl: track.thumbnail || null,
      });
      setDlStatuses(s => ({ ...s, [key]: 'done' }));
      return true;
    } catch {
      setDlStatuses(s => ({ ...s, [key]: 'error' }));
      return false;
    }
  };

  const downloadSelected = async () => {
    if (selected.size === 0) return toast.error('Оберіть треки для завантаження');
    const tracks = userData.tracks.filter(t => selected.has(t.webpage_url));
    setBulkRunning(true);
    let ok = 0, fail = 0;
    for (const track of tracks) {
      const success = await downloadTrack(track);
      success ? ok++ : fail++;
    }
    setBulkRunning(false);
    toast.success(`Завантажено: ${ok}${fail ? `, помилок: ${fail}` : ''}`);
  };

  const allSelected = userData && selected.size === userData.tracks.length && userData.tracks.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Search bar */}
      <div className="admin-card">
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>SoundCloud — пошук користувача</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Введіть ім'я користувача (наприклад: <code style={{ background: 'var(--bg-hover)', padding: '2px 6px', borderRadius: 4 }}>skrillex</code>) або повний URL профілю.
        </p>

        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchUser()}
            placeholder="soundcloud.com/username або просто username"
            className="form-input"
            style={{ flex: 1 }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            {['tracks', 'likes'].map(t => (
              <button key={t} onClick={() => setType(t)}
                style={{
                  padding: '0 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  background: type === t ? 'var(--accent)' : 'var(--bg-hover)',
                  color: type === t ? '#000' : 'var(--text-secondary)',
                }}>
                {t === 'tracks' ? 'Треки' : '❤️ Вподобані'}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={fetchUser} disabled={loading} style={{ gap: 8, flexShrink: 0 }}>
            {loading ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={15} />}
            Знайти
          </button>
        </div>
      </div>

      {/* User profile + track list */}
      {userData && (
        <div className="admin-card">
          {/* User card */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, padding: '16px', background: 'var(--bg-hover)', borderRadius: 12 }}>
            {userData.user.avatar
              ? <img src={userData.user.avatar} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} alt="" />
              : <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg,#ff5500,#ff8800)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <User size={28} color="white" />
                </div>
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{userData.user.name || userData.user.username}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>soundcloud.com/{userData.user.username}</div>
              {userData.user.bio && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {userData.user.bio.slice(0, 120)}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#ff5500' }}>{userData.tracks.length}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{type === 'likes' ? 'вподобань' : 'треків'}</div>
            </div>
          </div>

          {/* Toolbar */}
          {userData.tracks.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <button onClick={toggleAll}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13, padding: '6px 10px', borderRadius: 8 }}
                title={allSelected ? 'Зняти всі' : 'Обрати всі'}>
                {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                {allSelected ? 'Зняти всі' : 'Обрати всі'}
              </button>

              {selected.size > 0 && (
                <button
                  className="btn btn-primary"
                  onClick={downloadSelected}
                  disabled={bulkRunning}
                  style={{ gap: 8, marginLeft: 'auto' }}>
                  {bulkRunning
                    ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    : <Download size={14} />}
                  Завантажити обрані ({selected.size})
                </button>
              )}
            </div>
          )}

          {/* Track list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 500, overflowY: 'auto' }}>
            {userData.tracks.map((track) => {
              const isSelected = selected.has(track.webpage_url);
              const status     = dlStatuses[track.webpage_url] || 'idle';

              return (
                <div key={track.id}
                  onClick={() => toggleSelect(track.webpage_url)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                    background: isSelected ? 'rgba(255,85,0,0.1)' : 'transparent',
                    border: isSelected ? '1px solid rgba(255,85,0,0.3)' : '1px solid transparent',
                    transition: 'all 0.15s',
                  }}>

                  {/* Checkbox */}
                  <div style={{ color: isSelected ? '#ff5500' : 'var(--text-muted)', flexShrink: 0 }}>
                    {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                  </div>

                  {/* Thumbnail */}
                  {track.thumbnail
                    ? <img src={track.thumbnail} style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} alt="" />
                    : <div style={{ width: 40, height: 40, borderRadius: 6, background: 'linear-gradient(135deg,#ff5500,#ff8800)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Music size={16} color="white" />
                      </div>}

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {track.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {track.artist || userData.user.name}
                    </div>
                  </div>

                  <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{fmt(track.duration)}</span>

                  {/* Download status + individual button */}
                  <DownloadStatus status={status} />
                  {status === 'idle' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); downloadTrack(track); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', borderRadius: 6 }}
                      title="Завантажити цей трек"
                      onMouseEnter={e => e.currentTarget.style.color = '#ff5500'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                      <Download size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
