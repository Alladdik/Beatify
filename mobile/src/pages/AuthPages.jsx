import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../api';
import { useAuthStore } from '../store/authStore';
import { Music2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setError('');
    setLoading(true);
    try {
      const res = await authApi.login({ email, password });
      const { token, user } = res.data;
      login(token, user);
      toast.success(`Ласкаво просимо, ${user.name}! 🎵`);
      navigate('/', { replace: true });
    } catch (err) {
      const msg = err.response?.data?.message || 'Невірний email або пароль';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card animate-in">
        <div className="auth-logo">
          <Music2 size={36} color="var(--accent)" />
          <span className="gradient-text">Beatify</span>
        </div>
        <h1 className="auth-title">Увійти в акаунт</h1>
        <p className="auth-sub">Раді бачити тебе знову 👋</p>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#f87171', fontSize: 13 }}>
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group" style={{ position: 'relative' }}>
            <label className="form-label">Пароль</label>
            <input
              className="form-input"
              type={showPw ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{ paddingRight: 44 }}
            />
            <button
              type="button"
              onClick={() => setShowPw(p => !p)}
              style={{ position: 'absolute', right: 12, bottom: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
            >
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <button
            className="btn btn-primary w-full"
            type="submit"
            disabled={loading || !email || !password}
            style={{ marginTop: 8, justifyContent: 'center', opacity: (loading || !email || !password) ? 0.6 : 1 }}
          >
            {loading ? <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : 'Увійти'}
          </button>
        </form>

        <div className="auth-switch">
          Немає акаунту? <Link to="/register">Зареєструватись</Link>
        </div>
      </div>
    </div>
  );
}

export function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setError('');

    if (password.length < 6) {
      setError('Пароль мінімум 6 символів');
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.register({ email, password, name });
      const { token, user } = res.data;
      login(token, user);
      toast.success('Акаунт створено! 🎉');
      navigate('/', { replace: true });
    } catch (err) {
      const msg = err.response?.data?.message || 'Помилка реєстрації';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card animate-in">
        <div className="auth-logo">
          <Music2 size={36} color="var(--accent)" />
          <span className="gradient-text">Beatify</span>
        </div>
        <h1 className="auth-title">Створити акаунт</h1>
        <p className="auth-sub">Приєднуйся до мільйонів слухачів 🎵</p>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#f87171', fontSize: 13 }}>
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label className="form-label">Ім'я</label>
            <input
              className="form-input"
              placeholder="Твоє ім'я"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              autoComplete="name"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Пароль <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>(мін. 6 символів)</span></label>
            <input
              className="form-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          <button
            className="btn btn-primary w-full"
            type="submit"
            disabled={loading || !name || !email || !password}
            style={{ marginTop: 8, justifyContent: 'center', opacity: (loading || !name || !email || !password) ? 0.6 : 1 }}
          >
            {loading ? <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : 'Зареєструватись'}
          </button>
        </form>

        <div className="auth-switch">
          Вже є акаунт? <Link to="/login">Увійти</Link>
        </div>
      </div>
    </div>
  );
}
