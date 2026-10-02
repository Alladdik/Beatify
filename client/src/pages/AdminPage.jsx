import { useState, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { artistsApi, albumsApi, tracksApi, externalSearchApi, adminUsersApi, fileUrl } from '../api';
import {
  Music, User, Disc3, Trash2, Upload, Check, ChevronRight, Image,
  FileMusic, Mic2, Download, Pencil, X, Save, Search, Loader2, Camera,
  Wand2, Cloud, Telescope, Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import DownloadTab from './admin/DownloadTab';
import UsersTab from './admin/UsersTab';
import SpotifyImportTab from './admin/SpotifyImportTab';
import SoundCloudTab from './admin/SoundCloudTab';
import ArtistHunterTab from './admin/ArtistHunterTab';

const fmt = s => s > 0 ? `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}` : '0:00';

// ── Spinner keyframes injected once ─────────────────────────────────────────
const SPIN_STYLE = `@keyframes _spin{to{transform:rotate(360deg)}} ._spin{animation:_spin .7s linear infinite}`;

// ── Upload Zone ──────────────────────────────────────────────────────────────
function DropZone({ label, icon: Icon, accept, file, onFile }) {
  const ref = useRef();
  const has = !!file;
  return (
    <label className={`upload-zone ${has ? 'has-file' : ''}`}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer', minHeight: 120, justifyContent: 'center' }}>
      <input ref={ref} type="file" accept={accept} style={{ display: 'none' }} onChange={e => onFile(e.target.files[0])} />
      {has ? <Check size={28} /> : <Icon size={28} />}
      <span style={{ fontSize: 13 }}>{has ? file.name : label}</span>
    </label>
  );
}

function Field({ label, children }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {children}
    </div>
  );
}

// ── Edit Track Modal ─────────────────────────────────────────────────────────
function EditTrackModal({ track, artists, albums, onClose, qc }) {
  const [form, setForm] = useState({
    title: track.title || '',
    artistId: String(track.artistId || ''),
    albumId: String(track.albumId || ''),
    genre: track.genre || '',
    isExplicit: track.isExplicit || false,
    lyrics: track.lyrics || '',
  });
  const [cover, setCover] = useState(null);
  const [panel, setPanel] = useState('lyrics');
  const [fetchingLyrics, setFetchingLyrics] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lyricsOptions, setLyricsOptions] = useState([]); // multiple candidates
  const [lyricsSource, setLyricsSource] = useState('');

  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const { data: recs = [] } = useQuery({
    queryKey: ['recs', track.id],
    queryFn: () => tracksApi.getRecommendations(track.id).then(r => r.data),
  });

  const filteredAlbums = albums.filter(a => !form.artistId || a.artistId === parseInt(form.artistId));

  const coverPreview = cover
    ? URL.createObjectURL(cover)
    : track.coverPath ? fileUrl('covers', track.coverPath) : null;

  const fetchLyrics = async () => {
    const artistName = artists.find(a => a.id === parseInt(form.artistId))?.name || track.artistName || '';
    if (!artistName || !form.title) return toast.error('Заповніть назву та виконавця');
    setFetchingLyrics(true);
    setLyricsOptions([]);
    setLyricsSource('');
    try {
      const res = await externalSearchApi.fetchLyrics(artistName, form.title);
      const d = res.data;
      if (d.found && d.lyrics) {
        setForm(p => ({ ...p, lyrics: d.lyrics }));
        setLyricsSource(d.source || 'lrclib');
        const synced = d.lyrics.startsWith('[');
        toast.success(`Знайдено${synced ? ' синхронізований' : ''} текст (${d.source || 'lrclib'})`);
      } else if (d.found && d.options?.length) {
        setLyricsOptions(d.options);
        toast('Знайдено кілька варіантів — оберіть:', { icon: '🎵' });
      } else {
        toast.error('Текст не знайдено. Спробуй уточнити назву.');
      }
    } catch {
      toast.error('Помилка при пошуку тексту');
    } finally {
      setFetchingLyrics(false);
    }
  };

  const save = async () => {
    if (!form.title.trim()) return toast.error('Введіть назву треку');
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('artistId', form.artistId || '0');
      fd.append('albumId', form.albumId || '0');
      fd.append('genre', form.genre || '');
      fd.append('isExplicit', form.isExplicit);
      fd.append('lyrics', form.lyrics || '');
      if (cover) fd.append('coverFile', cover);
      await tracksApi.update(track.id, fd);
      qc.invalidateQueries(['adminTracks']);
      qc.invalidateQueries(['trending']);
      qc.invalidateQueries(['newReleases']);
      qc.invalidateQueries(['allTracks']);
      toast.success('Зміни збережено!');
      onClose();
    } catch {
      toast.error('Помилка збереження');
    } finally {
      setSaving(false);
    }
  };

  const coverRef = useRef();

  return (
    <>
      <style>{SPIN_STYLE}</style>
      <div
        onClick={e => e.target === e.currentTarget && onClose()}
        style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: 'var(--bg-surface)', borderRadius: 20, width: '100%', maxWidth: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,.7)' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,var(--accent),#059669)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Pencil size={15} color="#000" />
              </div>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>Редагувати трек</h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{track.title}</p>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'color-mix(in oklab, var(--fg) 6%, transparent)', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 8, borderRadius: 8, display: 'flex' }}>
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="admin-modal-body" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', flex: 1, overflow: 'hidden' }}>

            {/* LEFT: form */}
            <div style={{ padding: 24, overflowY: 'auto', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 0 }}>

              {/* Cover compact */}
              <div style={{ marginBottom: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 72, height: 72, borderRadius: 10, overflow: 'hidden', background: 'var(--bg-elevated)', flexShrink: 0, cursor: 'pointer', position: 'relative' }}
                  onClick={() => coverRef.current?.click()}>
                  {coverPreview
                    ? <img src={coverPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><Music size={28} color="var(--text-muted)" /></div>}
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: '0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.opacity = 1}
                    onMouseLeave={e => e.currentTarget.style.opacity = 0}>
                    <Camera size={18} color="white" />
                  </div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{track.artistName}</div>
                  <button onClick={() => coverRef.current?.click()} style={{ fontSize: 11, background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', color: 'var(--text-secondary)', cursor: 'pointer' }}>Змінити фото</button>
                </div>
                <input ref={coverRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => e.target.files[0] && setCover(e.target.files[0])} />
              </div>

              <Field label="Назва *">
                <input className="form-input" value={form.title} onChange={set('title')} placeholder="Назва треку" />
              </Field>
              <Field label="Виконавець *">
                <select className="form-select" value={form.artistId}
                  onChange={e => setForm(p => ({ ...p, artistId: e.target.value, albumId: '' }))}>
                  <option value="">Оберіть виконавця</option>
                  {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              <Field label="Альбом">
                <select className="form-select" value={form.albumId} onChange={set('albumId')}>
                  <option value="">Без альбому</option>
                  {filteredAlbums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select>
              </Field>
              <Field label="Жанр">
                <input className="form-input" value={form.genre} onChange={set('genre')} placeholder="Pop, Rock, Hip-Hop..." />
              </Field>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginBottom: 20, padding: '10px 12px', borderRadius: 8, background: 'var(--bg-hover)' }}>
                <input type="checkbox" checked={form.isExplicit} onChange={e => setForm(p => ({ ...p, isExplicit: e.target.checked }))} />
                <span>🅴 Explicit контент</span>
              </label>

              <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', gap: 6 }} onClick={save} disabled={saving}>
                  {saving ? <Loader2 size={15} className="_spin" /> : <Save size={15} />}
                  Зберегти
                </button>
                <button className="btn" style={{ justifyContent: 'center', padding: '0 16px' }} onClick={onClose}>
                  Скасувати
                </button>
              </div>
            </div>

            {/* RIGHT: lyrics + recommendations */}
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

              {/* Sub-tabs */}
              <div style={{ display: 'flex', padding: '0 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                {[['lyrics', 'Текст пісні'], ['recs', `Схожі треки${recs.length ? ` (${recs.length})` : ''}`]].map(([id, label]) => (
                  <button key={id} onClick={() => setPanel(id)}
                    style={{ padding: '14px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                      color: panel === id ? 'var(--text-primary)' : 'var(--text-muted)',
                      borderBottom: panel === id ? '2px solid var(--accent)' : '2px solid transparent' }}>
                    {label}
                  </button>
                ))}
              </div>

              {panel === 'lyrics' && (
                <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
                  {/* Toolbar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <button className="btn" style={{ gap: 6, fontSize: 12, padding: '7px 12px', flexShrink: 0 }}
                      onClick={fetchLyrics} disabled={fetchingLyrics}>
                      {fetchingLyrics ? <Loader2 size={13} className="_spin" /> : <Wand2 size={13} />}
                      {fetchingLyrics ? 'Шукаємо...' : 'Авто-пошук'}
                    </button>
                    {lyricsSource && (
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: form.lyrics?.startsWith('[') ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : 'color-mix(in oklab, var(--fg) 7%, transparent)', color: form.lyrics?.startsWith('[') ? 'var(--accent)' : 'var(--text-muted)' }}>
                        {form.lyrics?.startsWith('[') ? 'Synced' : 'Plain'} · {lyricsSource}
                      </span>
                    )}
                    {form.lyrics && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{form.lyrics.split('\n').length} рядків</span>
                    )}
                    {form.lyrics && (
                      <button onClick={() => { setForm(p => ({ ...p, lyrics: '' })); setLyricsSource(''); setLyricsOptions([]); }}
                        style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, padding: '3px 6px', borderRadius: 5 }}>
                        <X size={11} /> Очистити
                      </button>
                    )}
                  </div>

                  {/* Lyrics options to pick from */}
                  {lyricsOptions.length > 0 && (
                    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto', padding: '8px', background: 'color-mix(in oklab, var(--fg) 3%, transparent)', borderRadius: 10, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Оберіть варіант</div>
                      {lyricsOptions.map((opt, i) => (
                        <button key={i} onClick={() => { setForm(p => ({ ...p, lyrics: opt.lyrics })); setLyricsSource('lrclib'); setLyricsOptions([]); }}
                          style={{ textAlign: 'left', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, background: opt.isSynced ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : 'color-mix(in oklab, var(--fg) 7%, transparent)', color: opt.isSynced ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }}>
                            {opt.isSynced ? 'Synced' : 'Plain'}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.title}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{opt.artist}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <textarea
                    className="form-input"
                    value={form.lyrics}
                    onChange={set('lyrics')}
                    placeholder={'[00:12.50] Рядок з тайм-кодом (LRC)\n або просто текст без тайм-кодів...'}
                    style={{ flex: 1, resize: 'none', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.7, minHeight: 0 }}
                  />
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                    Synced = LRC формат з тайм-кодами (підсвітка рядків під час відтворення) · Plain = звичайний текст
                  </p>
                </div>
              )}

              {panel === 'recs' && (
                <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                    Схожі треки за виконавцем та жанром «{track.genre || 'без жанру'}»
                  </p>
                  {recs.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                      <Music size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
                      <p>Немає схожих треків у бібліотеці</p>
                      <p style={{ fontSize: 12, marginTop: 4 }}>Додайте більше треків того ж жанру або виконавця</p>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {recs.map((r, i) => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--bg-hover)' }}>
                        <span style={{ color: 'var(--text-muted)', width: 18, fontSize: 12, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
                        {r.coverPath
                          ? <img src={fileUrl('covers', r.coverPath)} style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} alt="" />
                          : <div style={{ width: 40, height: 40, borderRadius: 6, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Music size={16} color="var(--text-muted)" /></div>}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.artistName} {r.albumTitle ? `• ${r.albumTitle}` : ''}</div>
                        </div>
                        {r.genre && <span style={{ fontSize: 11, background: 'color-mix(in oklab, var(--fg) 7%, transparent)', padding: '2px 8px', borderRadius: 20, color: 'var(--text-muted)', flexShrink: 0 }}>{r.genre}</span>}
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{fmt(r.duration)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── TAB: Artist ──────────────────────────────────────────────────────────────
function ArtistTab({ artists, qc }) {
  const [form, setForm] = useState({ name: '', bio: '', genre: '', userId: '' });
  // users who can still be made the owner of an artist page
  const { data: owners = [] } = useQuery({
    queryKey: ['adminUsers', ''],
    queryFn: () => adminUsersApi.list('').then(r => r.data),
  });
  const freeOwners = owners.filter(u => !u.artistId);
  const [img, setImg] = useState(null);
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name) return toast.error("Введіть ім'я виконавця");
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v));
    if (img) fd.append('imageFile', img);
    await artistsApi.create(fd);
    qc.invalidateQueries(['artists']);
    setForm({ name: '', bio: '', genre: '', userId: '' }); setImg(null);
    qc.invalidateQueries(['adminUsers']);
    toast.success('Виконавця додано!');
  };

  return (
    <div className="admin-split" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      <div className="admin-card">
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Новий виконавець</h3>
        <form onSubmit={submit}>
          <Field label="Ім'я *"><input className="form-input" value={form.name} onChange={set('name')} placeholder="Назва виконавця" /></Field>
          <Field label="Жанр"><input className="form-input" value={form.genre} onChange={set('genre')} placeholder="Pop, Rock, Hip-Hop..." /></Field>
          <Field label="Біографія">
            <textarea className="form-input" value={form.bio} onChange={set('bio')} placeholder="Розкажи про виконавця..." style={{ height: 90, resize: 'vertical', paddingTop: 12 }} />
          </Field>
          <Field label="Фото виконавця">
            <DropZone label="Завантажити фото" icon={Image} accept="image/*" file={img} onFile={setImg} />
          </Field>
          <Field label="Власник сторінки (необов’язково)">
            <select className="form-input" value={form.userId} onChange={set('userId')}>
              <option value="">Без власника — керує адмін</option>
              {freeOwners.map(u => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}
            </select>
            <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>Власник зможе сам редагувати цю сторінку у своєму профілі.</small>
          </Field>
          <button className="btn btn-primary w-full" style={{ justifyContent: 'center', marginTop: 4 }} type="submit">
            <User size={16} /> Додати виконавця
          </button>
        </form>
      </div>
      <div className="admin-card">
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Всі виконавці ({artists.length})</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 500, overflowY: 'auto' }}>
          {artists.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Ще немає виконавців</p>}
          {artists.map(a => {
            const src = a.imagePath ? fileUrl('artists', a.imagePath) : null;
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'var(--bg-hover)', borderRadius: 8 }}>
                {src
                  ? <img src={src} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} alt="" />
                  : <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Mic2 size={18} color="var(--text-muted)" /></div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.genre || 'Без жанру'} • {a.trackCount} треків</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── TAB: Album ───────────────────────────────────────────────────────────────
function AlbumTab({ artists, albums, qc }) {
  const [form, setForm] = useState({ title: '', artistId: '', year: new Date().getFullYear(), genre: '' });
  const [cover, setCover] = useState(null);
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title || !form.artistId) return toast.error('Заповніть обов\'язкові поля');
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v));
    if (cover) fd.append('coverFile', cover);
    await albumsApi.create(fd);
    qc.invalidateQueries(['albums']);
    setForm({ title: '', artistId: '', year: new Date().getFullYear(), genre: '' }); setCover(null);
    toast.success('💿 Альбом додано!');
  };

  return (
    <div className="admin-split" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      <div className="admin-card">
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Новий альбом</h3>
        <form onSubmit={submit}>
          <Field label="Назва альбому *"><input className="form-input" value={form.title} onChange={set('title')} placeholder="Назва альбому" /></Field>
          <Field label="Виконавець *">
            <select className="form-select" value={form.artistId} onChange={set('artistId')} required>
              <option value="">Оберіть виконавця</option>
              {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <div className="form-row">
            <Field label="Рік"><input className="form-input" type="number" value={form.year} onChange={set('year')} min="1900" max="2030" /></Field>
            <Field label="Жанр"><input className="form-input" value={form.genre} onChange={set('genre')} placeholder="Pop..." /></Field>
          </div>
          <Field label="Обкладинка альбому">
            <DropZone label="Завантажити обкладинку" icon={Image} accept="image/*" file={cover} onFile={setCover} />
          </Field>
          <button className="btn btn-primary w-full" style={{ justifyContent: 'center', marginTop: 4 }} type="submit">
            <Disc3 size={16} /> Додати альбом
          </button>
        </form>
      </div>
      <div className="admin-card">
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Всі альбоми ({albums.length})</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 500, overflowY: 'auto' }}>
          {albums.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Ще немає альбомів</p>}
          {albums.map(a => {
            const src = a.coverPath ? fileUrl('covers', a.coverPath) : null;
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'var(--bg-hover)', borderRadius: 8 }}>
                {src
                  ? <img src={src} style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover' }} alt="" />
                  : <div style={{ width: 44, height: 44, borderRadius: 6, background: 'linear-gradient(135deg,#374151,#1f2937)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Disc3 size={18} color="var(--text-muted)" /></div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{a.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.artistName} • {a.year} • {a.trackCount} треків</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── TAB: Track ───────────────────────────────────────────────────────────────
function TrackTab({ artists, albums, tracks, qc }) {
  // Upload form state
  const [form, setForm] = useState({ title: '', artistId: '', albumId: '', genre: '', isExplicit: false, duration: 0, lyrics: '' });
  const [audio, setAudio] = useState(null);
  const [cover, setCover] = useState(null);
  const [showLyrics, setShowLyrics] = useState(false);
  const [fillingLyrics, setFillingLyrics] = useState(false);

  // Search / filter
  const [search, setSearch] = useState('');
  const [filterArtist, setFilterArtist] = useState('');

  // Edit modal
  const [editTrack, setEditTrack] = useState(null);

  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const handleAudio = (file) => {
    setAudio(file);
    const a = new Audio(URL.createObjectURL(file));
    a.addEventListener('loadedmetadata', () => setForm(p => ({ ...p, duration: Math.round(a.duration) })));
  };

  const del = async (id) => {
    if (!confirm('Видалити трек? Цю дію не можна скасувати.')) return;
    await tracksApi.delete(id);
    qc.invalidateQueries(['adminTracks']);
    qc.invalidateQueries(['trending']);
    qc.invalidateQueries(['newReleases']);
    toast.success('Трек видалено');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!audio) return toast.error('Виберіть аудіофайл');
    if (!form.title) return toast.error("Заповніть назву треку");
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v));
    fd.append('mediaFile', audio);
    if (cover) fd.append('coverFile', cover);
    await tracksApi.upload(fd);
    qc.invalidateQueries(['adminTracks']);
    qc.invalidateQueries(['trending']);
    qc.invalidateQueries(['newReleases']);
    setForm({ title: '', artistId: '', albumId: '', genre: '', isExplicit: false, duration: 0, lyrics: '' });
    setAudio(null); setCover(null);
    toast.success('Трек завантажено!');
  };

  const missingLyricsCount = tracks.filter(t => !t.lyrics).length;

  const fillAllLyrics = async () => {
    if (missingLyricsCount === 0) return toast('Всі треки вже мають текст пісні', { icon: '✅' });
    setFillingLyrics(true);
    try {
      const res = await externalSearchApi.fillLyrics(Math.min(missingLyricsCount, 100));
      const d = res.data;
      qc.invalidateQueries(['adminTracks']);
      toast.success(`Знайдено текстів: ${d.filled}, пропущено: ${d.skipped}`);
    } catch {
      toast.error('Помилка при пошуку текстів');
    } finally {
      setFillingLyrics(false);
    }
  };

  const filteredAlbumsForm = albums.filter(a => !form.artistId || a.artistId === parseInt(form.artistId));

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tracks.filter(t => {
      const matchSearch = !q
        || t.title?.toLowerCase().includes(q)
        || t.artistName?.toLowerCase().includes(q)
        || t.albumTitle?.toLowerCase().includes(q)
        || t.genre?.toLowerCase().includes(q);
      const matchArtist = !filterArtist || String(t.artistId) === filterArtist;
      return matchSearch && matchArtist;
    });
  }, [tracks, search, filterArtist]);

  const PANEL_H = 'calc(100vh - 380px)';

  return (
    <>
      <div className="admin-split" style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20, alignItems: 'start' }}>
        {/* Upload form — fixed height, scrollable */}
        <div className="admin-card" style={{ height: PANEL_H, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, flexShrink: 0 }}>Завантажити трек</h3>
          <form onSubmit={submit} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0, paddingRight: 4 }}>
            <Field label="Назва *"><input className="form-input" value={form.title} onChange={set('title')} placeholder="Назва треку" /></Field>
            <div className="admin-pair" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Виконавець">
                <select className="form-select" value={form.artistId} onChange={e => setForm(p => ({ ...p, artistId: e.target.value, albumId: '' }))}>
                  <option value="">Без виконавця</option>
                  {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              <Field label="Жанр"><input className="form-input" value={form.genre} onChange={set('genre')} placeholder="Pop, Rock..." /></Field>
            </div>
            <Field label="Альбом">
              <select className="form-select" value={form.albumId} onChange={set('albumId')}>
                <option value="">Без альбому</option>
                {filteredAlbumsForm.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </Field>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.isExplicit} onChange={e => setForm(p => ({ ...p, isExplicit: e.target.checked }))}/>
                🅴 Explicit
              </label>
              {form.duration > 0 && <span className="pill">⏱ {fmt(form.duration)}</span>}
            </div>
            <div className="admin-pair" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <Field label="Медіафайл *">
                <DropZone label="MP3 / WAV / FLAC" icon={FileMusic} accept="audio/*,video/*" file={audio} onFile={handleAudio} />
              </Field>
              <Field label="🖼 Обкладинка">
                <DropZone label="JPG / PNG" icon={Image} accept="image/*" file={cover} onFile={setCover} />
              </Field>
            </div>
            <div style={{ marginBottom: 12 }}>
              <button type="button" onClick={() => setShowLyrics(p => !p)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}>
                <ChevronRight size={14} style={{ transform: showLyrics ? 'rotate(90deg)' : 'none', transition: '0.15s' }} />
                Текст пісні
              </button>
              {showLyrics && (
                <textarea className="form-input" value={form.lyrics} onChange={set('lyrics')}
                  placeholder="Текст пісні..."
                  style={{ height: 100, resize: 'none', paddingTop: 10, marginTop: 8, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 }} />
              )}
            </div>
            <button className="btn btn-primary w-full" style={{ justifyContent: 'center', marginTop: 'auto', flexShrink: 0 }} type="submit">
              <Upload size={15} /> Завантажити трек
            </button>
          </form>
        </div>

        {/* Track list — fixed height, scrollable */}
        <div className="admin-card" style={{ height: PANEL_H, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* List header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexShrink: 0 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>
              Бібліотека
              <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: 'var(--text-muted)' }}>
                {filtered.length !== tracks.length ? `${filtered.length} / ${tracks.length}` : tracks.length}
              </span>
            </h3>
            <button className="btn" style={{ gap: 7, fontSize: 12, padding: '6px 12px' }}
              onClick={fillAllLyrics} disabled={fillingLyrics || missingLyricsCount === 0}
              title={`Автоматично знайти тексти для ${missingLyricsCount} треків без них`}>
              {fillingLyrics
                ? <Loader2 size={13} style={{ animation: 'spin .7s linear infinite' }} />
                : <Wand2 size={13} />}
              {fillingLyrics ? 'Шукаємо...' : `Заповнити тексти (${missingLyricsCount})`}
            </button>
          </div>

          {/* Search + filter */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexShrink: 0 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Пошук за назвою, виконавцем, альбомом, жанром..."
                style={{ width: '100%', paddingLeft: 32, background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px 8px 32px', color: 'var(--text-primary)', fontSize: 13 }}
              />
              {search && (
                <button onClick={() => setSearch('')}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}>
                  <X size={13} />
                </button>
              )}
            </div>
            <select value={filterArtist} onChange={e => setFilterArtist(e.target.value)}
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: filterArtist ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: 13, minWidth: 130 }}>
              <option value="">Всі виконавці</option>
              {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3, minHeight: 0 }}>
            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                <Search size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
                <p style={{ fontSize: 13 }}>{tracks.length === 0 ? 'Ще немає треків' : 'Нічого не знайдено'}</p>
              </div>
            )}
            {filtered.map((t, i) => {
              const src = t.coverPath ? fileUrl('covers', t.coverPath) : null;
              return (
                <div key={t.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 8, transition: 'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ color: 'var(--text-muted)', width: 22, fontSize: 12, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
                  {src
                    ? <img src={src} style={{ width: 34, height: 34, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} alt="" />
                    : <div style={{ width: 34, height: 34, borderRadius: 4, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Music size={14} color="var(--text-muted)" /></div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.title}
                      {t.isExplicit && <span style={{ fontSize: 10, background: 'color-mix(in oklab, var(--danger) 20%, transparent)', color: 'var(--danger)', padding: '1px 4px', borderRadius: 3, marginLeft: 5 }}>E</span>}
                      {t.lyrics && <span title="Є текст пісні" style={{ marginLeft: 5, fontSize: 10, color: 'var(--accent)', opacity: 0.7 }}>♪</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.artistName}{t.albumTitle ? ` • ${t.albumTitle}` : ''}{t.genre ? ` • ${t.genre}` : ''}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{fmt(t.duration)}</span>
                  <button
                    onClick={() => setEditTrack(t)}
                    title="Редагувати"
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 5, display: 'flex', flexShrink: 0, borderRadius: 6, transition: 'color 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => del(t.id)}
                    title="Видалити"
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 5, display: 'flex', flexShrink: 0, borderRadius: 6, transition: 'color 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {editTrack && (
        <EditTrackModal
          track={editTrack}
          artists={artists}
          albums={albums}
          qc={qc}
          onClose={() => setEditTrack(null)}
        />
      )}
    </>
  );
}

// ── MAIN ADMIN PAGE ──────────────────────────────────────────────────────────
const TABS = [
  { id: 'users',         label: 'Користувачі',  icon: Users },
  { id: 'artist',        label: 'Виконавці',    icon: Mic2 },
  { id: 'album',         label: 'Альбоми',      icon: Disc3 },
  { id: 'track',         label: 'Треки',        icon: Music },
  { id: 'download',      label: 'Імпорт URL',   icon: Download },
  { id: 'spotify',       label: 'Spotify',      icon: Wand2 },
  { id: 'soundcloud',    label: 'SoundCloud',   icon: Cloud },
  { id: 'artist-hunter', label: 'Artist Hunter', icon: Telescope },
];

export default function AdminPage() {
  const [tab, setTab] = useState('users');
  const qc = useQueryClient();

  const { data: artists = [] } = useQuery({ queryKey: ['artists'], queryFn: () => artistsApi.getAll().then(r => r.data) });
  const { data: albums = [] }  = useQuery({ queryKey: ['albums'],  queryFn: () => albumsApi.getAll().then(r => r.data) });
  const { data: tracks = [] }  = useQuery({
    queryKey: ['adminTracks'],
    queryFn: () => tracksApi.getAllAdmin().then(r => r.data),
  });

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="display">Адмінка</h1>
        <div className="page-meta">
          <span>{artists.length} виконавців</span>
          <span>{albums.length} альбомів</span>
          <span>{tracks.length} треків</span>
        </div>
        <div className="tabs" role="tablist">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Icon size={15} />{t.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Content */}
      <div>
        <div className="animate-in">
          {tab === 'users'      && <UsersTab />}
          {tab === 'artist'     && <ArtistTab   artists={artists} qc={qc} />}
          {tab === 'album'      && <AlbumTab    artists={artists} albums={albums} qc={qc} />}
          {tab === 'track'      && <TrackTab    artists={artists} albums={albums} tracks={tracks} qc={qc} />}
          {tab === 'download'   && <DownloadTab />}
          {tab === 'spotify'    && <SpotifyImportTab />}
          {tab === 'soundcloud'    && <SoundCloudTab />}
          {tab === 'artist-hunter' && <ArtistHunterTab />}
        </div>
      </div>
    </div>
  );
}
