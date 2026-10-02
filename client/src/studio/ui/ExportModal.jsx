import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Download, Upload, Loader2, Check, Mic } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStudio } from '../store';
import { GENRES } from '../presets';
import { hashSeed } from '../music';
import { tracksApi, usersApi, authApi, errMsg } from '../../api';
import { useAuthStore } from '../../store/authStore';

/** A specimen-style cover drawn from the project: one giant letter, the name, and the coordinates. */
export async function drawCover(project, size = 1000) {
  const hue = hashSeed(project.seed + project.name) % 360;
  try { await document.fonts.load('300 600px "Roboto Flex Variable"'); await document.fonts.load('400 24px "Martian Mono Variable"'); } catch { /* fall back to system fonts */ }
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = `oklch(0.2 0.045 ${hue})`; g.fillRect(0, 0, size, size);
  g.fillStyle = `oklch(0.78 0.14 ${hue})`;
  const letter = (project.name.trim()[0] || 'B').toUpperCase();
  const w = 120 + (hashSeed(project.seed) % 7) * 120;
  g.font = `${w} ${size * 0.92}px "Roboto Flex Variable", system-ui, sans-serif`;
  g.textBaseline = 'alphabetic';
  g.fillText(letter, size * 0.06, size * 0.8);
  g.fillStyle = `oklch(0.92 0.02 ${hue})`;
  g.font = `400 ${size * 0.034}px "Martian Mono Variable", ui-monospace, monospace`;
  g.fillText(`${project.bpm} BPM · ${project.key} · ${project.scale}`.toUpperCase(), size * 0.06, size * 0.9);
  g.font = `560 ${size * 0.05}px "Roboto Flex Variable", system-ui, sans-serif`;
  let title = project.name; while (g.measureText(title).width > size * 0.88 && title.length > 4) title = title.slice(0, -2);
  g.fillText(title === project.name ? title : `${title}…`, size * 0.06, size * 0.955);
  return new Promise((res) => c.toBlob((b) => res(b), 'image/jpeg', 0.9));
}

export default function ExportModal({ onClose }) {
  const project = useStudio((s) => s.project);
  const rendering = useStudio((s) => s.rendering);
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const login = useAuthStore((s) => s.login);
  const [loops, setLoops] = useState(2);
  const [title, setTitle] = useState(project.name);
  const [genre, setGenre] = useState(GENRES[project.genre]?.label ?? 'Electronic');
  const [coverUrl, setCoverUrl] = useState(null);
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState(null);
  const coverBlob = useRef(null);

  const steps = project.bars * 16 * ((project.mode === 'song' && project.song.length) ? project.song.length : 1) * loops;
  const seconds = Math.round(steps * (60 / project.bpm / 4));
  const label = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  useEffect(() => {
    let url;
    drawCover(project).then((b) => { coverBlob.current = b; url = URL.createObjectURL(b); setCoverUrl(url); });
    return () => url && URL.revokeObjectURL(url);
  }, [project]);

  const bounce = async () => {
    useStudio.setState({ loop: loops });
    return useStudio.getState().bounce();
  };

  const download = async () => {
    setBusy('wav');
    const out = await bounce();
    setBusy('');
    if (!out) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(out.blob);
    a.download = `${(project.name || 'beatify').replace(/[^\p{L}\p{N}\- _]/gu, '')}.wav`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast.success(`WAV збережено · ${(out.blob.size / 1024 / 1024).toFixed(1)} МБ`);
  };

  const becomeArtist = async () => {
    try { await usersApi.becomeArtist(); const { data } = await authApi.me(); login(token, data); toast.success('Тепер ви виконавець'); }
    catch (e) { toast.error(errMsg(e, 'Не вдалося')); }
  };

  const publish = async () => {
    setBusy('pub');
    try {
      const out = await bounce();
      if (!out) return;
      const fd = new FormData();
      fd.append('Title', title.trim() || project.name);
      fd.append('Genre', genre);
      fd.append('Duration', String(Math.round(out.seconds)));
      fd.append('mediaFile', new File([out.blob], 'studio.wav', { type: 'audio/wav' }));
      if (coverBlob.current) fd.append('coverFile', new File([coverBlob.current], 'cover.jpg', { type: 'image/jpeg' }));
      const res = await tracksApi.uploadMine(fd);
      setDone(res.data);
      toast.success('Трек опубліковано в Beatify');
    } catch (e) { toast.error(errMsg(e, 'Не вдалося опублікувати')); }
    finally { setBusy(''); }
  };

  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal wide" role="dialog" aria-label="Експорт">
        <div className="modal-head"><span className="h2">Експорт і публікація</span><button className="ibtn" onClick={onClose} aria-label="Закрити" disabled={!!busy}><X size={18} /></button></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
          <div>
            <div className="label" style={{ marginBottom: 8 }}>Скільки разів програти {project.mode === 'song' && project.song.length ? 'пісню' : 'патерн'}</div>
            <div className="chips">{[1, 2, 4, 8].map((n) => <button key={n} className={`chip ${loops === n ? 'on' : ''}`} onClick={() => setLoops(n)}>×{n}</button>)}</div>
            <p className="mono muted" style={{ fontSize: '0.75rem', marginTop: 8 }}>≈ {label} · стерео WAV 44,1 кГц</p>
          </div>

          {rendering > 0 && <div className="feed-progress" style={{ maxWidth: 'none' }}><i style={{ width: `${rendering * 100}%` }} /></div>}

          <button className="btn lg" onClick={download} disabled={!!busy} style={{ alignSelf: 'flex-start' }}>
            {busy === 'wav' ? <Loader2 size={18} className="spin" /> : <Download size={18} />} Завантажити WAV
          </button>

          <hr className="hr" />

          <div>
            <h3 className="h2" style={{ marginBottom: 'var(--s-3)' }}>Опублікувати в Beatify</h3>
            {done ? (
              <div className="note" style={{ borderColor: 'var(--accent-line)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <Check size={18} className="accent" /> <span style={{ flex: 1 }}>«{done.title}» тепер у каталозі.</span>
                <Link className="btn sm" to={`/artist/${done.artistId}`} onClick={onClose}>До моєї сторінки</Link>
              </div>
            ) : !user ? (
              <div className="note">Щоб публікувати, <Link to="/login" className="accent" onClick={onClose}>увійдіть</Link> у акаунт.</div>
            ) : !user.artistId ? (
              <div className="note" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <Mic size={18} className="accent" /><span style={{ flex: 1 }}>Публікувати можуть виконавці. Це одна кнопка.</span><button className="btn primary sm" onClick={becomeArtist}>Стати виконавцем</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '132px minmax(0, 1fr)', gap: 'var(--s-4)', alignItems: 'start' }}>
                <div className="cover" style={{ width: 132 }}>{coverUrl ? <img src={coverUrl} alt="Обкладинка, створена зі студії" /> : <div className="skel" style={{ position: 'absolute', inset: 0 }} />}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
                  <div className="field"><label htmlFor="pub-title">Назва</label><input id="pub-title" className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></div>
                  <div className="field"><label htmlFor="pub-genre">Жанр</label><input id="pub-genre" className="input" value={genre} maxLength={40} onChange={(e) => setGenre(e.target.value)} /></div>
                  <div><button className="btn primary" onClick={publish} disabled={!!busy || !title.trim()}>{busy === 'pub' ? <><Loader2 size={16} className="spin" /> Збираємо й завантажуємо…</> : <><Upload size={16} /> Опублікувати</>}</button></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
