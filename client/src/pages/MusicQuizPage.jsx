import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Check, X, Play, RotateCcw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { tracksApi } from '../api';
import { streamUrl, coverUrl } from '../lib/config';
import { usePlayerStore } from '../store/playerStore';
import Cover from '../components/ui/Cover';

const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const BEST_KEY = 'beatify_quiz_best';
const MODES = [
  { id: 'title', label: 'Назва треку', desc: 'Впізнайте пісню за уривком' },
  { id: 'artist', label: 'Виконавець', desc: 'Хто це співає?' },
  { id: 'cover', label: 'Обкладинка', desc: 'Який трек на картинці?' },
];
const CLIPS = [5, 10, 15, 20];

function Setup({ tracks, liked, onStart }) {
  const [mode, setMode] = useState('title');
  const [questions, setQuestions] = useState(10);
  const [clip, setClip] = useState(10);
  const [source, setSource] = useState('all');
  const pool = source === 'liked' ? liked : source === 'top' ? [...tracks].sort((a, b) => b.playCount - a.playCount).slice(0, 60) : tracks;
  const max = Math.max(4, Math.min(20, pool.length));
  const canStart = pool.length >= 4;
  const best = (() => { try { return JSON.parse(localStorage.getItem(BEST_KEY)); } catch { return null; } })();

  return (
    <div className="page narrow">
      <header className="page-head">
        <h1 className="display">Вікторина</h1>
        <p className="page-lede">Послухайте уривок — і впізнайте. Чим швидше відповісте, тим більше очок; серія правильних дає бонус.</p>
        {best && <div className="page-meta"><span>рекорд {best.points} очок</span><span>{best.correct}/{best.total} правильно</span></div>}
      </header>

      <section className="section">
        <div className="section-head"><h2 className="h2">Режим</h2></div>
        <div className="quicks" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {MODES.map((m) => (
            <button key={m.id} className={`quick opt ${mode === m.id ? 'on' : ''}`} onClick={() => setMode(m.id)} aria-pressed={mode === m.id} style={{ textAlign: 'left' }}>
              <span><span className="quick-title">{m.label}</span><span className="quick-sub">{m.desc}</span></span>
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2 className="h2">Звідки треки</h2></div>
        <div className="chips">
          {[['all', 'Уся бібліотека'], ['top', 'Найпопулярніші'], ['liked', `Вподобані · ${liked.length}`]].map(([id, l]) => (
            <button key={id} className={`chip ${source === id ? 'on' : ''}`} onClick={() => setSource(id)} disabled={id === 'liked' && liked.length < 4}>{l}</button>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="axis" style={{ borderBottom: 0 }}>
          <span className="axis-name">Кількість питань</span><span className="axis-val">{Math.min(questions, max)}</span>
          <input type="range" className="slider" min={4} max={max} value={Math.min(questions, max)} style={{ '--p': `${((Math.min(questions, max) - 4) / Math.max(1, max - 4)) * 100}%` }} onChange={(e) => setQuestions(+e.target.value)} aria-label="Кількість питань" />
        </div>
        {mode !== 'cover' && (
          <div>
            <div className="label" style={{ marginBottom: 8 }}>Довжина уривка</div>
            <div className="chips">{CLIPS.map((c) => <button key={c} className={`chip ${clip === c ? 'on' : ''}`} onClick={() => setClip(c)}>{c} с</button>)}</div>
          </div>
        )}
      </section>

      <div>
        <button className="btn primary lg" disabled={!canStart} onClick={() => onStart({ mode, questions: Math.min(questions, max), clip, pool })}><Play size={18} fill="currentColor" /> Почати гру</button>
        {!canStart && <p className="muted" style={{ marginTop: 8, fontSize: '0.85rem' }}>Для гри потрібно щонайменше 4 треки.</p>}
      </div>
    </div>
  );
}

function Question({ q, index, total, streak, onAnswer }) {
  const [picked, setPicked] = useState(null);
  const [left, setLeft] = useState(q.clip);
  const done = useRef(false);
  const timers = useRef({});
  const audio = useRef(null);

  useEffect(() => {
    if (q.mode === 'cover') return;
    const a = new Audio(streamUrl(q.trackId));
    audio.current = a;
    a.volume = 0.9;
    const onMeta = () => {
      const dur = a.duration || 120;
      a.currentTime = Math.max(0, Math.min(dur - q.clip - 1, dur * (0.08 + Math.random() * 0.4)));
      a.play().catch(() => {});
    };
    a.addEventListener('loadedmetadata', onMeta);
    return () => { a.removeEventListener('loadedmetadata', onMeta); a.pause(); a.removeAttribute('src'); a.load(); };
  }, [q]);

  useEffect(() => {
    if (q.mode === 'cover') return;
    const id = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    timers.current.tick = id;
    return () => clearInterval(id);
  }, [q]);

  const finish = useCallback((opt, timeLeft) => {
    if (done.current) return;
    done.current = true;
    clearInterval(timers.current.tick);
    audio.current?.pause();
    setPicked(opt ?? '__timeout__');
    const ok = opt === q.correct;
    const points = ok ? 100 + Math.round((timeLeft / q.clip) * 100) + Math.min(streak, 5) * 20 : 0;
    timers.current.next = setTimeout(() => onAnswer({ ok, picked: opt, points, title: q.title }), 1500);
  }, [q, streak, onAnswer]);

  useEffect(() => { if (q.mode !== 'cover' && left === 0) finish(null, 0); }, [left, q, finish]);
  useEffect(() => () => clearTimeout(timers.current.next), []);

  const cls = (opt) => {
    if (picked === null) return 'quiz-opt';
    if (opt === q.correct) return 'quiz-opt right';
    if (opt === picked) return 'quiz-opt wrong';
    return 'quiz-opt dim';
  };

  return (
    <div className="page narrow">
      <div className="page-meta" style={{ justifyContent: 'space-between' }}>
        <span>питання {index + 1} з {total}</span>
        {streak > 1 && <span className="accent">серія ×{streak}</span>}
        {q.mode !== 'cover' && <span>{left} с</span>}
      </div>
      {q.mode !== 'cover' && <div className="feed-progress" style={{ maxWidth: 'none', marginBottom: 0 }}><i style={{ transform: `scaleX(${left / q.clip})`, transformOrigin: 'left', transition: 'transform 1s linear' }} /></div>}

      {q.mode === 'cover'
        ? <div style={{ display: 'grid', placeItems: 'center' }}><div style={{ width: 'min(280px, 70vw)' }}><Cover src={q.cover} title="?" lazy={false} /></div></div>
        : <div className="quiz-prompt"><span className="eqbars" style={{ width: 28, height: 28, opacity: picked === null ? 1 : 0.2 }}><i /><i /><i /></span><span className="h1">{q.mode === 'title' ? 'Що грає?' : 'Хто співає?'}</span></div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {q.options.map((opt, i) => (
          <button key={`${opt}-${i}`} className={cls(opt)} disabled={picked !== null} onClick={() => finish(opt, left)}>
            <span className="mono quiz-letter">{String.fromCharCode(65 + i)}</span>
            <span style={{ flex: 1, textAlign: 'left' }}>{opt}</span>
            {picked !== null && opt === q.correct && <Check size={18} />}
            {picked !== null && opt === picked && opt !== q.correct && <X size={18} />}
          </button>
        ))}
      </div>
    </div>
  );
}

function Result({ r, onAgain }) {
  const pct = Math.round((r.correct / r.total) * 100);
  return (
    <div className="page narrow">
      <header className="page-head">
        <h1 className="display">{pct >= 90 ? 'Бездоганно' : pct >= 70 ? 'Сильно' : pct >= 50 ? 'Непогано' : 'Є куди рости'}</h1>
        <p className="facts"><span><b>{r.points}</b>очок</span><span><b>{r.correct}/{r.total}</b>правильно</span><span><b>{pct}%</b></span>{r.newBest && <span className="accent">новий рекорд</span>}</p>
        <div className="page-actions"><button className="btn primary lg" onClick={onAgain}><RotateCcw size={18} /> Грати знову</button></div>
      </header>
      <div className="rows no-album">
        {r.history.map((h, i) => (
          <div key={i} className="row" style={{ cursor: 'default' }}>
            <div className="row-idx">{h.ok ? <Check size={18} className="accent" /> : <X size={18} style={{ color: 'var(--danger)' }} />}</div>
            <div className="row-main"><div className="row-text"><div className="row-title"><span className="trunc">{h.title}</span></div>{!h.ok && <div className="row-sub">ви обрали: {h.picked ?? 'час вийшов'}</div>}</div></div>
            <span />
            <div className="row-time">{h.points ? `+${h.points}` : '0'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MusicQuizPage() {
  const { data: tracks = [], isLoading } = useQuery({ queryKey: ['quizTracks'], queryFn: () => tracksApi.getAll(1, 500).then((r) => r.data.filter((t) => t.mediaType !== 'video')) });
  const liked = useMemo(() => tracks.filter((t) => t.isLiked), [tracks]);
  const [phase, setPhase] = useState('setup');
  const [, setCfg] = useState(null);
  const [qs, setQs] = useState([]);
  const [i, setI] = useState(0);
  const [history, setHistory] = useState([]);
  const [result, setResult] = useState(null);

  useEffect(() => { usePlayerStore.getState().pause(); }, []);

  const start = (c) => {
    const picked = shuffle(c.pool).slice(0, c.questions);
    const built = picked.map((t) => {
      const labelOf = (x) => (c.mode === 'artist' ? x.artistName || '—' : x.title);
      const correct = labelOf(t);
      const others = [...new Set(shuffle(c.pool.filter((x) => x.id !== t.id)).map(labelOf).filter((v) => v !== correct))].slice(0, 3);
      const options = shuffle([correct, ...others]);
      while (options.length < 4) options.push('—');
      return { trackId: t.id, title: t.title, correct, options: options.slice(0, 4), mode: c.mode, cover: coverUrl(t), clip: c.clip };
    });
    setCfg(c); setQs(built); setI(0); setHistory([]); setResult(null); setPhase('play');
  };

  const answer = (h) => {
    const next = [...history, h];
    setHistory(next);
    if (i + 1 >= qs.length) {
      const points = next.reduce((s, x) => s + x.points, 0);
      const correct = next.filter((x) => x.ok).length;
      let best = null; try { best = JSON.parse(localStorage.getItem(BEST_KEY)); } catch { /* none */ }
      const newBest = !best || points > best.points;
      if (newBest) { try { localStorage.setItem(BEST_KEY, JSON.stringify({ points, correct, total: qs.length })); } catch { /* quota */ } }
      setResult({ points, correct, total: qs.length, history: next, newBest });
      setPhase('result');
    } else setI(i + 1);
  };

  const streak = (() => { let s = 0; for (let k = history.length - 1; k >= 0 && history[k].ok; k--) s++; return s; })();

  if (isLoading) return <div className="page"><h1 className="display">Вікторина</h1><p className="muted">Збираємо треки…</p></div>;
  if (phase === 'play' && qs[i]) return <Question key={i} q={qs[i]} index={i} total={qs.length} streak={streak} onAnswer={answer} />;
  if (phase === 'result' && result) return <Result r={result} onAgain={() => setPhase('setup')} />;
  return <Setup tracks={tracks} liked={liked} onStart={start} />;
}
