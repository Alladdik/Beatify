import { useState } from 'react';
import { Server } from 'lucide-react';
import { setServerUrl } from '../lib/config';
import { LogoMark } from '../components/ui/Logo';

// First screen of the Capacitor / standalone shell: where does your Beatify server live?
export default function ServerSetup() {
  const [url, setUrl] = useState('https://');
  const valid = /^https?:\/\/[^\s/]+\.[^\s/]+|^https?:\/\/(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?/i.test(url.trim());
  return (
    <main className="auth" style={{ gridTemplateColumns: '1fr' }}>
      <section className="auth-panel" style={{ margin: 'auto' }}>
        <span style={{ color: 'var(--accent-text)', display: 'inline-flex', marginBottom: 'var(--s-5)' }}><LogoMark size={44} /></span>
        <h1 className="h1" style={{ marginBottom: 'var(--s-2)' }}>Адреса сервера</h1>
        <p className="muted" style={{ marginBottom: 'var(--s-5)' }}>Вкажіть, де працює ваш Beatify: домен (https://music.example.com) або адреса в мережі (http://192.168.1.10:5000).</p>
        <form onSubmit={(e) => { e.preventDefault(); if (valid) setServerUrl(url); }} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          <div className="field"><label htmlFor="srv">Сервер</label><input id="srv" className="input" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" autoCapitalize="none" autoCorrect="off" autoFocus /></div>
          <button className="btn primary lg block" disabled={!valid}><Server size={18} /> Підключитись</button>
        </form>
      </section>
    </main>
  );
}
