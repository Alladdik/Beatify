import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Trash2, Eye, EyeOff, Loader2, Check, Minus, Send, Upload, Link2, ShieldCheck, Headphones } from 'lucide-react';
import toast from 'react-hot-toast';
import { usersApi, artistsApi, authApi, errMsg } from '../api';
import { useAuthStore } from '../store/authStore';
import { fileUrl } from '../lib/config';

const stack = { display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' };

function Avatar({ user, size = 72 }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4, fontWeight: 300 }}>
      {user.avatarPath ? <img src={fileUrl('avatars', user.avatarPath)} alt="" /> : (user.name?.[0] || '?').toUpperCase()}
    </span>
  );
}

function PhotoForm() {
  const { user, token, login } = useAuthStore();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn, ok) => {
    setBusy(true);
    try { const { data } = await fn(); login(token, data); toast.success(ok); }
    catch (err) { toast.error(errMsg(err, 'Не вдалося змінити фото')); }
    finally { setBusy(false); }
  };
  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return toast.error('Потрібне фото: jpg, png або webp');
    if (f.size > 5 * 1024 * 1024) return toast.error('Фото завелике (максимум 5 МБ)');
    run(() => usersApi.uploadAvatar(f), 'Фото оновлено');
  };

  return (
    <div style={stack}>
      <h2 className="h2">Фото профілю</h2>
      <div className="settings-photo">
        <Avatar user={user} size={72} />
        <div className="settings-photo-actions">
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} />
          <button className="btn" onClick={() => input.current?.click()} disabled={busy}>{busy ? <Loader2 size={15} className="spin" /> : <Camera size={16} />} {user.avatarPath ? 'Змінити фото' : 'Додати фото'}</button>
          {user.avatarPath && <button className="btn ghost" onClick={() => run(() => usersApi.removeAvatar(), 'Фото прибрано')} disabled={busy}><Trash2 size={16} /> Прибрати</button>}
          <span className="muted" style={{ fontSize: '0.75rem' }}>jpg, png або webp до 5 МБ</span>
        </div>
      </div>
    </div>
  );
}

function AccountForm() {
  const { user, token, login } = useAuthStore();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await usersApi.updateMe({ name: name.trim(), email: email.trim() });
      login(token, data);
      toast.success('Збережено');
    } catch (err) { toast.error(errMsg(err, 'Не вдалося зберегти')); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={save} style={stack}>
      <h2 className="h2">Акаунт</h2>
      <div className="field"><label htmlFor="pf-name">Ім’я</label><input id="pf-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" /></div>
      <div className="field"><label htmlFor="pf-email">Email</label><input id="pf-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" /></div>
      <div><button className="btn primary" disabled={saving || (name.trim() === user.name && email.trim() === user.email)}>{saving ? <Loader2 size={15} className="spin" /> : 'Зберегти'}</button></div>
    </form>
  );
}

function PasswordForm() {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const tooShort = next.length > 0 && next.length < 6;
  const mismatch = again.length > 0 && again !== next;
  const ok = cur && next.length >= 6 && next === again && next !== cur;

  const submit = async (e) => {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    try {
      await usersApi.changePassword(cur, next);
      toast.success('Пароль змінено');
      setCur(''); setNext(''); setAgain('');
    } catch (err) { toast.error(errMsg(err, 'Не вдалося змінити пароль')); }
    finally { setBusy(false); }
  };

  const type = show ? 'text' : 'password';
  return (
    <form onSubmit={submit} style={stack}>
      <h2 className="h2">Пароль</h2>
      <div className="field"><label htmlFor="pw-cur">Поточний пароль</label><input id="pw-cur" className="input" type={type} value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></div>
      <div className="field">
        <label htmlFor="pw-new">Новий пароль</label>
        <input id="pw-new" className="input" type={type} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={6} />
        {tooShort && <small className="field-err">Щонайменше 6 символів</small>}
      </div>
      <div className="field">
        <label htmlFor="pw-again">Повторіть новий пароль</label>
        <input id="pw-again" className="input" type={type} value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
        {mismatch && <small className="field-err">Паролі не збігаються</small>}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn primary" disabled={busy || !ok}>{busy ? <Loader2 size={15} className="spin" /> : 'Змінити пароль'}</button>
        <button type="button" className="btn ghost" onClick={() => setShow((s) => !s)}>{show ? <EyeOff size={16} /> : <Eye size={16} />} {show ? 'Сховати' : 'Показати'}</button>
      </div>
    </form>
  );
}

function Row({ icon: Icon, title, hint, on, children }) {
  return (
    <div className="rights-row">
      <Icon size={18} className="rights-ico" />
      <div className="rights-text"><b>{title}</b><small>{hint}</small></div>
      <div className="rights-state">{children ?? (on ? <span className="tag accent"><Check size={12} /> є</span> : <span className="tag"><Minus size={12} /> немає</span>)}</div>
    </div>
  );
}

function Rights() {
  const { user, token, login } = useAuthStore();
  const [busy, setBusy] = useState(false);
  const isAdmin = user.role === 'admin';

  const request = async () => {
    setBusy(true);
    try { const { data } = await usersApi.requestUpload(); login(token, data); toast.success('Запит надіслано адміністратору'); }
    catch (err) { toast.error(errMsg(err, 'Не вдалося надіслати запит')); }
    finally { setBusy(false); }
  };

  return (
    <div style={stack}>
      <h2 className="h2">Мої права</h2>
      <div className="rights">
        <Row icon={Headphones} title="Слухати й збирати плейлисти" hint="Доступно всім" on />
        <Row icon={Upload} title="Публікувати власні треки" hint="Завантаження файлів і випуск із Studio" on={user.canUpload}>
          {user.canUpload ? <span className="tag accent"><Check size={12} /> є</span>
            : user.uploadRequested ? <span className="tag"><Send size={12} /> запит надіслано</span>
            : <>{user.uploadDenied && <span className="tag danger" style={{ marginRight: 8 }}>відхилено</span>}<button className="btn sm" onClick={request} disabled={busy}>{busy ? <Loader2 size={14} className="spin" /> : <Send size={14} />} {user.uploadDenied ? 'Подати ще раз' : 'Попросити дозвіл'}</button></>}
        </Row>
        <Row icon={Link2} title="Імпорт за посиланням" hint="YouTube, SoundCloud, Spotify → на сайт" on={user.canImport}>
          {user.canImport ? <Link to="/import" className="btn sm">Відкрити імпорт</Link> : undefined}
        </Row>
        {isAdmin && <Row icon={ShieldCheck} title="Адміністратор" hint="Каталог, користувачі та їхні права" on><Link to="/admin" className="btn sm">Відкрити адмінку</Link></Row>}
      </div>
      {!isAdmin && (!user.canUpload || !user.canImport) && <p className="muted" style={{ fontSize: '0.8rem' }}>Права видає адміністратор сайту. Після схвалення вони з’являються одразу.</p>}
    </div>
  );
}

const GENRES = ['Pop', 'Rock', 'Hip-Hop', 'R&B', 'Electronic', 'Lo-Fi', 'Ambient', 'Jazz', 'Classical', 'Indie', 'Metal', 'Folk', 'Other', 'Various'];

function ArtistPageForm({ artistId }) {
  const { token, login } = useAuthStore();
  const qc = useQueryClient();
  const { data: artist } = useQuery({ queryKey: ['artist', artistId], queryFn: () => artistsApi.getById(artistId).then((r) => r.data) });
  if (!artist) return null;
  return <ArtistPageFields key={artist.id + (artist.imagePath || '')} artist={artist} onSaved={async () => {
    qc.invalidateQueries({ queryKey: ['artist', artistId] }); qc.invalidateQueries({ queryKey: ['artists'] });
    try { const { data } = await authApi.me(); login(token, data); } catch { /* keep going */ }
  }} />;
}

function ArtistPageFields({ artist, onSaved }) {
  const [form, setForm] = useState({ name: artist.name ?? '', genre: artist.genre ?? '', bio: artist.bio ?? '' });
  const [img, setImg] = useState(null);
  const [busy, setBusy] = useState(false);
  const preview = img ? URL.createObjectURL(img) : artist.imagePath ? fileUrl('artists', artist.imagePath) : null;
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const dirty = img || form.name !== (artist.name ?? '') || form.genre !== (artist.genre ?? '') || form.bio !== (artist.bio ?? '');

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Вкажіть назву виконавця');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('Name', form.name.trim()); fd.append('Genre', form.genre); fd.append('Bio', form.bio);
      if (img) fd.append('imageFile', img);
      await artistsApi.updateMine(fd);
      toast.success('Сторінку виконавця збережено');
      setImg(null);
      await onSaved();
    } catch (err) { toast.error(errMsg(err, 'Не вдалося зберегти')); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={save} style={stack}>
      <h2 className="h2">Сторінка виконавця</h2>
      <div className="settings-photo">
        <span className="avatar" style={{ width: 72, height: 72 }}>{preview ? <img src={preview} alt="" /> : (form.name[0] || '?').toUpperCase()}</span>
        <label className="btn"><Camera size={16} /> {preview ? 'Змінити фото' : 'Додати фото'}<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setImg(f); e.target.value = ''; }} /></label>
      </div>
      <div className="field"><label htmlFor="ar-name">Сценічне ім’я</label><input id="ar-name" className="input" value={form.name} onChange={set('name')} maxLength={100} /></div>
      <div className="field"><label htmlFor="ar-genre">Жанр</label>
        <input id="ar-genre" className="input" list="ar-genres" value={form.genre} onChange={set('genre')} maxLength={60} />
        <datalist id="ar-genres">{GENRES.map((g) => <option key={g} value={g} />)}</datalist>
      </div>
      <div className="field"><label htmlFor="ar-bio">Про себе</label><textarea id="ar-bio" className="textarea" value={form.bio} onChange={set('bio')} rows={4} maxLength={1000} /></div>
      <div><button className="btn primary" disabled={busy || !dirty}>{busy ? <Loader2 size={15} className="spin" /> : 'Зберегти сторінку'}</button></div>
    </form>
  );
}

/** Everything a person can change about themselves, in the order they usually need it. */
export default function AccountSettings() {
  const user = useAuthStore((s) => s.user);
  return (
    <>
      <PhotoForm />
      <AccountForm key={`${user.name}|${user.email}`} />
      <PasswordForm />
      <Rights />
      {user.artistId ? <ArtistPageForm artistId={user.artistId} /> : null}
    </>
  );
}
