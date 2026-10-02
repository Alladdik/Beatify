import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search, ShieldCheck, Upload, Link2, Ban, KeyRound, Mic2, Loader2, Copy, Check, Bell, X, Trash2, ChevronDown, Music2, UserX,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminUsersApi, artistsApi, tracksApi, errMsg } from '../../api';
import { useAuthStore } from '../../store/authStore';
import { fileUrl } from '../../lib/config';

const FILTERS = [
  ['all', 'Усі', () => true],
  ['requests', 'Запити', (u) => isRequest(u)],
  ['uploaders', 'Публікують', (u) => u.canUpload || u.role === 'admin'],
  ['importers', 'Імпортують', (u) => u.canImport || u.role === 'admin'],
  ['admins', 'Адміни', (u) => u.role === 'admin'],
  ['blocked', 'Заблоковані', (u) => u.isBlocked],
];
const isRequest = (u) => !!u.uploadRequestedAt && !u.canUpload && u.role !== 'admin';
const fmtDate = (d) => new Date(d).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' });

/** Small on/off switch with a label and a one-line explanation. */
function Perm({ icon: Icon, title, hint, on, disabled, onChange }) {
  return (
    <label className={`perm ${disabled ? 'disabled' : ''}`}>
      <Icon size={16} className="perm-ico" />
      <span className="perm-text"><b>{title}</b><small>{hint}</small></span>
      <span className="switch"><input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /><i /></span>
    </label>
  );
}

/** The user's published tracks, with a delete button each — what to do with content when rights are taken away. */
function UserTracks({ artistId }) {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ['artistTracks', artistId], queryFn: () => artistsApi.getTracks(artistId).then((r) => r.data) });
  const remove = async (t) => {
    if (!window.confirm(`Видалити трек «${t.title}» з каталогу? Це незворотно.`)) return;
    try {
      await tracksApi.delete(t.id);
      toast.success('Трек видалено');
      qc.invalidateQueries({ queryKey: ['artistTracks', artistId] });
      qc.invalidateQueries({ queryKey: ['adminUsers'] });
      qc.invalidateQueries({ queryKey: ['adminTracks'] });
    } catch (err) { toast.error(errMsg(err, 'Не вдалося видалити')); }
  };
  if (isLoading) return <p className="muted" style={{ fontSize: '0.8rem' }}><Loader2 size={13} className="spin" /> Завантаження…</p>;
  if (!data.length) return <p className="muted" style={{ fontSize: '0.8rem' }}>Ще не опублікував жодного треку.</p>;
  return (
    <ul className="utracks">
      {data.map((t) => (
        <li key={t.id}>
          <span className="trunc">{t.title}</span>
          <span className="mono muted">{t.playCount ?? 0} ▶</span>
          <button className="ibtn sm" onClick={() => remove(t)} aria-label={`Видалити ${t.title}`} title="Видалити трек"><Trash2 size={14} /></button>
        </li>
      ))}
    </ul>
  );
}

function UserCard({ u, me, onChange, onRemoved }) {
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const isMe = u.id === me;
  const isAdmin = u.role === 'admin';
  const requested = isRequest(u);

  const act = async (fn, okMsg) => {
    setBusy(true);
    try { const res = await fn(); if (okMsg) toast.success(okMsg); return res?.data ?? true; }
    catch (err) { toast.error(errMsg(err, 'Не вдалося')); }
    finally { setBusy(false); }
  };
  const patch = async (p, okMsg) => { const d = await act(() => adminUsersApi.update(u.id, p), okMsg); if (d && d !== true) onChange(d); };

  const resetPw = async () => {
    if (!window.confirm(`Скинути пароль користувача ${u.name}? Старий пароль перестане працювати.`)) return;
    const d = await act(() => adminUsersApi.resetPassword(u.id));
    if (d && d.password) setPw(d.password);
  };
  const makeArtist = async () => { const d = await act(() => adminUsersApi.makeArtist(u.id), 'Сторінку виконавця створено'); if (d && d !== true) onChange(d); };
  const unlinkArtist = async () => {
    if (!window.confirm('Відв’язати сторінку виконавця від користувача? Сторінка й треки залишаться в каталозі.')) return;
    const d = await act(() => adminUsersApi.unlinkArtist(u.id), 'Відв’язано');
    if (d && d !== true) onChange(d);
  };
  const removeUser = async () => {
    if (!window.confirm(`Видалити акаунт «${u.name}» назавжди?\n\nЗникнуть його плейлисти, вподобані й історія. Опубліковані треки залишаться в каталозі.`)) return;
    const ok = await act(() => adminUsersApi.remove(u.id), 'Акаунт видалено');
    if (ok) onRemoved(u.id);
  };

  return (
    <article className={`ucard ${u.isBlocked ? 'blocked' : ''} ${requested ? 'requested' : ''}`}>
      <header className="ucard-head">
        <span className="avatar">{u.avatarPath ? <img src={fileUrl('avatars', u.avatarPath)} alt="" /> : (u.name?.[0] || '?').toUpperCase()}</span>
        <div className="ucard-who">
          <div className="ucard-name">{u.name}{isMe && <span className="tag">це ви</span>}{isAdmin && <span className="tag accent">адмін</span>}{u.isBlocked && <span className="tag danger">заблокований</span>}</div>
          <div className="mono muted ucard-mail">{u.email}</div>
          <div className="muted ucard-meta">з {fmtDate(u.createdAt)} · {u.playlistCount} плейлистів{u.artistId ? ` · ${u.trackCount} треків` : ''}</div>
        </div>
        {busy && <Loader2 size={16} className="spin muted" />}
      </header>

      {requested && (
        <div className="ucard-request">
          <span className="ucard-req"><Bell size={14} /> Просить дозвіл публікувати власні треки <small>({fmtDate(u.uploadRequestedAt)})</small></span>
          <div className="ucard-req-actions">
            <button className="btn sm primary" disabled={busy} onClick={() => patch({ canUpload: true }, 'Дозвіл надано')}><Check size={14} /> Дозволити</button>
            <button className="btn sm" disabled={busy} onClick={() => patch({ denyUpload: true }, 'Запит відхилено')}><X size={14} /> Відхилити</button>
          </div>
        </div>
      )}
      {!requested && u.uploadDeniedAt && !u.canUpload && !isAdmin && (
        <p className="muted ucard-denied">Запит відхилено {fmtDate(u.uploadDeniedAt)} — користувач може подати його ще раз.</p>
      )}

      <div className="ucard-perms">
        <Perm icon={Upload} title="Може публікувати власні треки" hint="Завантажує свої аудіофайли та випускає зі Studio" on={u.canUpload || isAdmin} disabled={isAdmin || busy} onChange={(v) => patch({ canUpload: v }, v ? 'Дозвіл на публікацію надано' : 'Дозвіл на публікацію знято')} />
        <Perm icon={Link2} title="Може імпортувати за посиланням" hint="Додає музику з YouTube, SoundCloud, Spotify на сайт" on={u.canImport || isAdmin} disabled={isAdmin || busy} onChange={(v) => patch({ canImport: v }, v ? 'Дозвіл на імпорт надано' : 'Дозвіл на імпорт знято')} />
        <Perm icon={ShieldCheck} title="Адміністратор" hint="Повний доступ до адмінки, користувачів і каталогу" on={isAdmin} disabled={isMe || busy} onChange={(v) => { if (!v || window.confirm(`Зробити ${u.name} адміністратором? Він отримає повний доступ.`)) patch({ role: v ? 'admin' : 'user' }, v ? 'Тепер адміністратор' : 'Права адміністратора знято'); }} />
      </div>

      <div className="ucard-foot">
        <div className="ucard-artist">
          <Mic2 size={14} className="muted" />
          {u.artistId
            ? <><span className="trunc">Виконавець: <b>{u.artistName}</b></span>
                <button className="btn ghost sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}><Music2 size={14} /> Треки · {u.trackCount} <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none' }} /></button>
                <button className="btn ghost sm" onClick={unlinkArtist} disabled={busy}>Відв’язати</button></>
            : <><span className="muted">Немає сторінки виконавця</span><button className="btn sm" onClick={makeArtist} disabled={busy}>Зробити виконавцем</button></>}
        </div>
        {open && u.artistId && <UserTracks artistId={u.artistId} />}
        <div className="ucard-actions">
          <button className="btn sm" onClick={resetPw} disabled={busy}><KeyRound size={14} /> Скинути пароль</button>
          {!isMe && (
            <button className={`btn sm ${u.isBlocked ? '' : 'danger'}`} disabled={busy}
              onClick={() => { if (u.isBlocked || window.confirm(`Заблокувати ${u.name}? Він одразу втратить доступ.`)) patch({ isBlocked: !u.isBlocked }, u.isBlocked ? 'Розблоковано' : 'Заблоковано'); }}>
              <Ban size={14} /> {u.isBlocked ? 'Розблокувати' : 'Заблокувати'}
            </button>
          )}
          {!isMe && <button className="btn sm danger" onClick={removeUser} disabled={busy}><UserX size={14} /> Видалити</button>}
        </div>
      </div>

      {pw && (
        <div className="note ucard-pw">
          <span>Новий пароль (показується один раз):</span>
          <code className="mono">{pw}</code>
          <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(pw); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Скопійовано' : 'Копіювати'}</button>
          <button className="btn ghost sm" onClick={() => setPw(null)}>Закрити</button>
        </div>
      )}
    </article>
  );
}

export default function UsersTab() {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user?.id);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const { data = [], isLoading, error } = useQuery({
    queryKey: ['adminUsers', q],
    queryFn: () => adminUsersApi.list(q.trim()).then((r) => r.data),
    placeholderData: (prev) => prev,
  });
  const replace = (u) => qc.setQueryData(['adminUsers', q], (list = []) => list.map((x) => (x.id === u.id ? u : x)));
  const dropped = (id) => qc.setQueryData(['adminUsers', q], (list = []) => list.filter((x) => x.id !== id));

  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([id, , fn]) => [id, data.filter(fn).length])), [data]);
  const shown = useMemo(() => data.filter(FILTERS.find(([id]) => id === filter)[2]), [data, filter]);

  return (
    <div className="users-tab">
      <div className="note users-help">
        <b>Хто що може.</b> Звичайний користувач лише слухає. «Публікувати власні треки» дозволяє завантажувати свої файли й випускати музику зі Studio; «Імпорт за посиланням» — додавати музику з YouTube, SoundCloud і Spotify.
        Права діють одразу, без повторного входу. Запити на дозвіл можна схвалити або відхилити — користувач побачить відповідь у своєму профілі.
      </div>

      <div className="users-bar">
        <div className="search-field" style={{ flex: '1 1 260px', maxWidth: 420 }}>
          <Search size={16} />
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пошук за іменем або email" aria-label="Пошук користувачів" />
        </div>
        <div className="chips" role="group" aria-label="Фільтр">
          {FILTERS.map(([id, label]) => (
            <button key={id} className={`chip ${filter === id ? 'on' : ''} ${id === 'requests' && counts.requests ? 'alert' : ''}`} onClick={() => setFilter(id)}>
              {label}<span className="mono chip-n">{counts[id] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <p className="muted">Не вдалося завантажити користувачів: {errMsg(error, '')}</p>}
      {isLoading && <p className="muted"><Loader2 size={14} className="spin" /> Завантаження…</p>}
      <div className="ulist">
        {shown.map((u) => <UserCard key={u.id} u={u} me={me} onChange={replace} onRemoved={dropped} />)}
        {!isLoading && shown.length === 0 && <p className="muted">{filter === 'requests' ? 'Нових запитів немає.' : 'Нікого не знайдено.'}</p>}
      </div>
    </div>
  );
}
