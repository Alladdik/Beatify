import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi, errMsg } from '../api';
import { useAuthStore } from '../store/authStore';
import { LogoMark } from '../components/ui/Logo';

// The specimen: a giant "b" whose weight and width follow the pointer — a live coordinate readout under it.
function Specimen() {
  const glyph = useRef(null);
  const readout = useRef(null);
  const set = (x, y) => {
    const w = Math.round(100 + x * 900);          // wght 100 → 1000
    const d = Math.round(25 + (1 - y) * 126);     // wdth 151 (top) → 25 (bottom)
    if (glyph.current) glyph.current.style.fontVariationSettings = `'wght' ${w}, 'wdth' ${d}`;
    if (readout.current) readout.current.textContent = `wght ${String(w).padStart(4, '0')}  wdth ${String(d).padStart(3, '0')}`;
  };
  useEffect(() => { set(0.42, 0.45); }, []);

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const p = e.touches?.[0] ?? e;
    set(Math.min(1, Math.max(0, (p.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (p.clientY - r.top) / r.height)));
  };

  return (
    <div className="auth-specimen" onPointerMove={onMove} onTouchMove={onMove} aria-hidden="true">
      <span ref={glyph} className="auth-glyph">b</span>
      <div className="auth-readout mono" ref={readout} />
    </div>
  );
}

function Shell({ title, lede, children, footer }) {
  return (
    <main className="auth">
      <Specimen />
      <section className="auth-panel">
        <Link to="/" className="brand" aria-label="Beatify" style={{ padding: 0, marginBottom: 'var(--s-6)' }}>
          <span style={{ color: 'var(--accent-text)', display: 'inline-flex' }}><LogoMark size={30} /></span>
          <span className="brand-word">Beatify</span>
        </Link>
        <h1 className="h1" style={{ marginBottom: 'var(--s-2)' }}>{title}</h1>
        <p className="muted" style={{ marginBottom: 'var(--s-5)' }}>{lede}</p>
        {children}
        <div className="auth-foot">{footer}</div>
      </section>
    </main>
  );
}

function PasswordField({ id, label, value, onChange, autoComplete, hint }) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}{hint && <span style={{ textTransform: 'none', letterSpacing: 0, marginLeft: 6 }}>{hint}</span>}</label>
      <div style={{ position: 'relative' }}>
        <input id={id} className="input" type={show ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} required style={{ paddingRight: 48 }} />
        <button type="button" className="ibtn" style={{ position: 'absolute', right: 4, top: 4 }} onClick={() => setShow((s) => !s)} aria-label={show ? 'Сховати пароль' : 'Показати пароль'}>
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}

// Closed (invite-only) servers hide "create account"; unknown/old servers count as open
function useRegistrationOpen() {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    let alive = true;
    authApi.config().then(({ data }) => { if (alive) setOpen(data.allowRegistration !== false); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return open;
}

export function LoginPage() {
  const registrationOpen = useRegistrationOpen();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const from = useLocation().state?.from || '/';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await authApi.login({ email: email.trim(), password });
      login(data.token, data.user);
      toast.success(`З поверненням, ${data.user.name}`);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errMsg(err, 'Не вдалося увійти. Перевірте дані й з’єднання.'));
    } finally { setLoading(false); }
  };

  return (
    <Shell
      title="Увійти"
      lede="Ваші плейлисти, вподобане й історія чекають."
      footer={<>{registrationOpen && <>Немає акаунту? <Link to="/register" className="accent">Створити</Link> · </>}<Link to="/" className="muted">Слухати без входу</Link></>}
    >
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        {error && <div className="note err" role="alert">{error}</div>}
        <div className="field"><label htmlFor="email">Email</label><input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required autoFocus /></div>
        <PasswordField id="password" label="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        <button className="btn primary lg block" disabled={loading || !email || !password}>{loading ? <Loader2 size={18} className="spin" /> : 'Увійти'}</button>
      </form>
    </Shell>
  );
}

export function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Пароль має містити щонайменше 6 символів.'); return; }
    setLoading(true);
    try {
      const { data } = await authApi.register({ email: email.trim(), password, name: name.trim() });
      login(data.token, data.user);
      toast.success('Акаунт створено');
      navigate('/', { replace: true });
    } catch (err) {
      setError(errMsg(err, 'Не вдалося зареєструватись.'));
    } finally { setLoading(false); }
  };

  return (
    <Shell
      title="Створити акаунт"
      lede="Безкоштовно. Займає пів хвилини."
      footer={<>Вже є акаунт? <Link to="/login" className="accent">Увійти</Link></>}
    >
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        {error && <div className="note err" role="alert">{error}</div>}
        <div className="field"><label htmlFor="name">Ім’я</label><input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required autoFocus maxLength={60} /></div>
        <div className="field"><label htmlFor="email">Email</label><input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required /></div>
        <PasswordField id="password" label="Пароль" hint="від 6 символів" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        <button className="btn primary lg block" disabled={loading || !name || !email || !password}>{loading ? <Loader2 size={18} className="spin" /> : 'Створити акаунт'}</button>
      </form>
    </Shell>
  );
}
