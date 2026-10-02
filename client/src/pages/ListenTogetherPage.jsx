import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Copy, LogOut, Link2, Loader2, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTogetherStore } from '../store/togetherStore';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import Cover from '../components/ui/Cover';

export default function ListenTogetherPage() {
  const user = useAuthStore((s) => s.user);
  const { room, members, connected, isHost, busy, join, create, leave } = useTogetherStore();
  const track = usePlayerStore((s) => s.currentTrack);
  const playing = usePlayerStore((s) => s.isPlaying);
  const [params, setParams] = useSearchParams();
  const [code, setCode] = useState('');

  // Invite link: /listen-together?room=AB2C
  useEffect(() => {
    const r = params.get('room');
    if (r && !room) { join(r); setParams({}, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const invite = `${window.location.origin}/listen-together?room=${room}`;
  const copy = async (text, msg) => { try { await navigator.clipboard.writeText(text); toast.success(msg); } catch { toast.error('Не вдалося скопіювати'); } };

  if (!room) {
    return (
      <div className="page narrow">
        <header className="page-head">
          <h1 className="display">Слухати разом</h1>
          <p className="page-lede">Одна кімната — одна музика. Хто натиснув паузу, перемотав чи змінив трек — це чують усі учасники одночасно.</p>
        </header>

        <section className="section">
          <div className="section-head"><h2 className="h2">Створити кімнату</h2></div>
          <p className="muted" style={{ maxWidth: '52ch' }}>Ми дамо чотирисимвольний код і посилання. Друзі відкривають його — і ви слухаєте синхронно.</p>
          <div><button className="btn primary lg" onClick={create} disabled={busy}>{busy ? <Loader2 size={18} className="spin" /> : <Users size={18} />} Створити кімнату</button></div>
        </section>

        <section className="section">
          <div className="section-head"><h2 className="h2">Приєднатися за кодом</h2></div>
          <form onSubmit={(e) => { e.preventDefault(); join(code); }} style={{ display: 'flex', gap: 8, maxWidth: 420 }}>
            <input className="input code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="AB2C" maxLength={12} aria-label="Код кімнати" autoComplete="off" />
            <button className="btn lg" disabled={code.length < 3 || busy}>Увійти</button>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div className="page narrow">
      <header className="page-head">
        <div className="page-meta"><span>{connected ? 'На зв’язку' : 'Відновлюємо з’єднання…'}</span><span>{isHost ? 'Ви створили кімнату' : 'Ви приєдналися'}</span></div>
        <h1 className="display mono-code" aria-label={`Код кімнати ${room}`}>{room}</h1>
        <div className="page-actions">
          <button className="btn lg" onClick={() => copy(room, 'Код скопійовано')}><Copy size={18} /> Копіювати код</button>
          <button className="btn lg" onClick={() => copy(invite, 'Посилання скопійовано')}><Link2 size={18} /> Посилання-запрошення</button>
          <button className="btn lg danger" onClick={leave}><LogOut size={18} /> Вийти</button>
        </div>
      </header>

      <section className="section">
        <div className="section-head"><h2 className="h2">Учасники · {Math.max(1, members.length)}</h2></div>
        <div className="rows no-album">
          {(members.length ? members : [user?.name ?? 'Ви']).map((m, i) => (
            <div key={`${m}-${i}`} className="row" style={{ cursor: 'default' }}>
              <div className="row-idx"><span className="avatar" style={{ width: 28, height: 28, fontSize: '0.75rem' }}>{(m?.[0] || '?').toUpperCase()}</span></div>
              <div className="row-main"><div className="row-text"><div className="row-title">{m}</div></div></div>
              <span />
              <div className="row-time">{m === user?.name ? 'ви' : ''}</div>
            </div>
          ))}
        </div>
        {members.length <= 1 && <p className="muted" style={{ fontSize: '0.85rem' }}>Поки що ви тут сам(а). Надішліть код або посилання друзям.</p>}
      </section>

      <section className="section">
        <div className="section-head"><h2 className="h2">Зараз у кімнаті</h2></div>
        {track ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-4)' }}>
            <Cover track={track} style={{ width: 72 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="trunc" style={{ fontWeight: 560, fontSize: '1.05rem' }}>{track.title}</div>
              <div className="trunc muted">{track.artistName}</div>
            </div>
            <span className="tag accent">{playing ? 'грає' : 'пауза'}</span>
          </div>
        ) : <p className="muted">Увімкніть будь-який трек — він заграє в усіх.</p>}
      </section>
    </div>
  );
}
