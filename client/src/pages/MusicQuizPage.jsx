import React, { useState, useEffect, useRef, useCallback } from 'react';
import { tracksApi, fileUrl } from '../api';

// ─── Helpers ────────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick(arr, n) {
  return shuffle(arr).slice(0, n);
}

const MODES = [
  { id: 'title',  label: 'Назва треку', icon: '🎵', desc: 'Вгадайте назву за уривком' },
  { id: 'artist', label: 'Артист',      icon: '🎤', desc: 'Вгадайте виконавця за уривком' },
  { id: 'cover',  label: 'Обкладинка', icon: '🖼️', desc: 'Вгадайте трек за обкладинкою' },
];

const DURATIONS = [5, 10, 15, 20];

// ─── Setup Screen ─────────────────────────────────────────────────────────────
function SetupScreen({ tracks, onStart }) {
  const [mode, setMode]         = useState('title');
  const [questions, setQuestions] = useState(10);
  const [clipLen, setClipLen]   = useState(10);

  const canStart = tracks.length >= 4;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 36, maxWidth: 600, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 8 }}>🎮</div>
        <h1 style={{ fontSize: 36, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Музична Вікторина</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 10, fontSize: 16 }}>
          {canStart
            ? `${tracks.length} треків у бібліотеці — перевір свої знання!`
            : 'Потрібно щонайменше 4 треки у бібліотеці'}
        </p>
      </div>

      {/* Mode */}
      <div style={{ width: '100%' }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 12 }}>Режим гри</div>
        <div style={{ display: 'flex', gap: 12 }}>
          {MODES.map(m => (
            <button key={m.id} onClick={() => setMode(m.id)}
              style={{
                flex: 1, padding: '18px 10px', borderRadius: 18,
                border: mode === m.id ? '2px solid var(--accent)' : '1.5px solid rgba(255,255,255,0.08)',
                background: mode === m.id ? 'rgba(48,209,88,0.12)' : 'rgba(255,255,255,0.03)',
                cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
              }}>
              <div style={{ fontSize: 30, marginBottom: 8 }}>{m.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: mode === m.id ? 'var(--accent)' : '#fff' }}>{m.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{m.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Question count */}
      <div style={{ width: '100%' }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 12 }}>
          Кількість питань: <span style={{ color: 'var(--accent)' }}>{questions}</span>
        </div>
        <input type="range" min={4} max={Math.min(20, tracks.length)} value={questions}
          onChange={e => setQuestions(+e.target.value)}
          style={{ width: '100%', accentColor: 'var(--accent)', height: 4 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
          <span>4</span><span>{Math.min(20, tracks.length)}</span>
        </div>
      </div>

      {/* Clip duration */}
      {mode !== 'cover' && (
        <div style={{ width: '100%' }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 12 }}>Тривалість уривку</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {DURATIONS.map(d => (
              <button key={d} onClick={() => setClipLen(d)}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 14,
                  border: clipLen === d ? '2px solid var(--accent)' : '1.5px solid rgba(255,255,255,0.08)',
                  background: clipLen === d ? 'rgba(48,209,88,0.12)' : 'rgba(255,255,255,0.03)',
                  cursor: 'pointer', fontSize: 15, fontWeight: 700,
                  color: clipLen === d ? 'var(--accent)' : 'rgba(255,255,255,0.65)',
                  transition: 'all 0.15s',
                }}>
                {d}с
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        disabled={!canStart}
        onClick={() => onStart({ mode, questions, clipLen })}
        style={{
          width: '100%', padding: '18px 0', borderRadius: 18, border: 'none',
          background: canStart ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
          color: canStart ? '#000' : 'var(--text-muted)',
          fontWeight: 800, fontSize: 18, cursor: canStart ? 'pointer' : 'not-allowed',
          transition: 'all 0.2s', letterSpacing: '-0.01em', fontFamily: 'inherit',
        }}>
        🚀 Почати гру
      </button>
    </div>
  );
}

// ─── Question Screen ──────────────────────────────────────────────────────────
// Повністю ізольований компонент — ресетиться при зміні key
function QuestionScreen({ question, index, total, onAnswer, maxTime }) {
  const [selected, setSelected]   = useState(null); // null = не вибрано
  const [timeLeft, setTimeLeft]   = useState(maxTime);
  const answeredRef               = useRef(false);  // захист від подвійного виклику
  const timerRef                  = useRef(null);
  const transitionRef             = useRef(null); // ID таймера переходу
  const audioRef                  = useRef(null);

  const { correct, options, mode, coverUrl, streamUrl, clipLen } = question;

  // ── Аудіо ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode === 'cover') return;

    const audio = new Audio();
    audioRef.current = audio;
    audio.volume = 0.85;
    audio.crossOrigin = 'anonymous';
    audio.src = streamUrl;

    const stopTimeout = { id: null };

    const onMeta = () => {
      const dur = audio.duration || 120;
      const startAt = Math.floor(Math.random() * Math.max(1, dur * 0.4)) + 5;
      audio.currentTime = Math.min(startAt, dur - clipLen - 1);
      audio.play().catch(() => {});
      stopTimeout.id = setTimeout(() => {
        audio.pause();
      }, clipLen * 1000);
    };

    audio.addEventListener('loadedmetadata', onMeta);
    audio.load();

    return () => {
      clearTimeout(stopTimeout.id);
      clearTimeout(transitionRef.current);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.pause();
      audio.src = '';
    };
  }, []); // тільки при маунті (key скидає компонент)

  // ── Таймер ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode === 'cover') return; // немає таймера для обкладинки

    setTimeLeft(maxTime);

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          // Автоматичний провал — тільки якщо ще не відповів
          if (!answeredRef.current) {
            answeredRef.current = true;
            if (audioRef.current) audioRef.current.pause();
            // Показуємо правильну відповідь перед переходом
            setSelected('__timeout__');
            transitionRef.current = setTimeout(() => onAnswer(false, '⏱ Час вийшов'), 1500);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, []); // тільки при маунті

  // ── Обробка кліку ──────────────────────────────────────────────────────────
  const handlePick = (opt) => {
    if (answeredRef.current) return; // ігнорувати повторні кліки
    answeredRef.current = true;

    clearInterval(timerRef.current);
    if (audioRef.current) audioRef.current.pause();

    setSelected(opt);

    const isCorrect = opt === correct;
    // Затримка щоб показати результат перед переходом
    transitionRef.current = setTimeout(() => onAnswer(isCorrect, opt), 1400);
  };

  // ── Стилі варіантів ────────────────────────────────────────────────────────
  const getOptionStyle = (opt) => {
    const base = {
      padding: '16px 20px', borderRadius: 16, fontWeight: 600, fontSize: 15,
      cursor: selected !== null ? 'default' : 'pointer',
      textAlign: 'left', transition: 'all 0.25s',
      display: 'flex', alignItems: 'center', gap: 14,
      fontFamily: 'inherit', width: '100%',
    };

    if (selected === null) {
      // Ще не відповіли
      return { ...base, background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.09)', color: '#fff' };
    }

    // Показуємо результати
    if (opt === correct) {
      return { ...base, background: 'rgba(48,209,88,0.18)', border: '1.5px solid var(--accent)', color: 'var(--accent)' };
    }
    if (opt === selected) {
      return { ...base, background: 'rgba(239,68,68,0.15)', border: '1.5px solid #ef4444', color: '#ef4444' };
    }
    return { ...base, background: 'rgba(255,255,255,0.02)', border: '1.5px solid rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.3)' };
  };

  const timePct   = maxTime > 0 ? (timeLeft / maxTime) * 100 : 0;
  const timerColor = timePct > 55 ? 'var(--accent)' : timePct > 25 ? '#facc15' : '#ef4444';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 600, margin: '0 auto', padding: '32px 24px', width: '100%' }}>

      {/* Прогрес + таймер */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>
            Питання {index + 1} / {total}
          </div>
          {/* Прогрес-бар питань */}
          <div style={{ width: 80, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${((index + 1) / total) * 100}%`, background: 'rgba(255,255,255,0.25)', borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
        </div>

        {mode !== 'cover' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 100, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${timePct}%`, background: timerColor, borderRadius: 3, transition: 'width 1s linear, background 0.3s' }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 800, color: timerColor, minWidth: 22, textAlign: 'right' }}>{timeLeft}</span>
          </div>
        )}
      </div>

      {/* Питання */}
      {mode === 'cover' ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 200, height: 200, borderRadius: 22, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
            {coverUrl
              ? <img src={coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#1a1a2e,#16213e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 56 }}>🎵</div>
            }
          </div>
          <p style={{ fontSize: 17, fontWeight: 600, color: 'rgba(255,255,255,0.6)', textAlign: 'center', margin: 0 }}>Який трек на цій обкладинці?</p>
        </div>
      ) : (
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 18, padding: '24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>{mode === 'title' ? '🎵' : '🎤'}</div>
          <p style={{ margin: 0, fontSize: 16, color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>
            {mode === 'title' ? 'Що грає?' : 'Хто виконує?'}
          </p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Слухайте уривок та виберіть правильну відповідь</p>
          {/* Анімація звуку */}
          {selected === null && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 16 }}>
              {[1,2,3,4,5].map(i => (
                <div key={i} style={{
                  width: 4, borderRadius: 2, background: 'var(--accent)',
                  animation: `soundbar 0.9s ease-in-out infinite`,
                  animationDelay: `${i * 0.12}s`,
                  height: 20,
                }} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Варіанти відповідей */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {options.map((opt, i) => (
          <button key={`${opt}-${i}`} onClick={() => handlePick(opt)} style={getOptionStyle(opt)}>
            <span style={{
              width: 32, height: 32, borderRadius: '50%',
              background: selected !== null && opt === correct
                ? 'rgba(48,209,88,0.2)'
                : selected !== null && opt === selected && opt !== correct
                ? 'rgba(239,68,68,0.2)'
                : 'rgba(255,255,255,0.07)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 800, flexShrink: 0, transition: 'all 0.25s',
            }}>
              {String.fromCharCode(65 + i)}
            </span>
            <span style={{ flex: 1 }}>{opt}</span>
            {selected !== null && opt === correct && <span style={{ fontSize: 18 }}>✓</span>}
            {selected !== null && opt === selected && opt !== correct && <span style={{ fontSize: 18 }}>✗</span>}
          </button>
        ))}
      </div>

      <style>{`
        @keyframes soundbar {
          0%, 100% { transform: scaleY(0.3); opacity: 0.5; }
          50%       { transform: scaleY(1);   opacity: 1;   }
        }
      `}</style>
    </div>
  );
}

// ─── Result Screen ─────────────────────────────────────────────────────────────
function ResultScreen({ score, total, history, onRestart }) {
  const pct   = Math.round((score / total) * 100);
  const emoji = pct >= 90 ? '🏆' : pct >= 70 ? '🎉' : pct >= 50 ? '👍' : '😅';
  const msg   = pct >= 90 ? 'Неймовірно!' : pct >= 70 ? 'Молодець!' : pct >= 50 ? 'Непогано!' : 'Ще є куди рости!';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, maxWidth: 560, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ fontSize: 80 }}>{emoji}</div>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 34, fontWeight: 800, margin: 0 }}>{msg}</h2>
        <p style={{ fontSize: 18, color: 'var(--text-muted)', marginTop: 10 }}>
          <strong style={{ color: '#fff', fontSize: 22 }}>{score}</strong> з {total} правильно ({pct}%)
        </p>
      </div>

      {/* Кругова діаграма */}
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r="60" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="10"/>
        <circle cx="70" cy="70" r="60" fill="none"
          stroke={pct >= 70 ? 'var(--accent)' : pct >= 50 ? '#facc15' : '#ef4444'}
          strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * 60}`}
          strokeDashoffset={`${2 * Math.PI * 60 * (1 - pct / 100)}`}
          transform="rotate(-90 70 70)"
          style={{ transition: 'stroke-dashoffset 1.2s ease' }}
        />
        <text x="70" y="70" textAnchor="middle" dominantBaseline="central" fill="white" fontSize="26" fontWeight="800">{pct}%</text>
      </svg>

      {/* Деталі */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 4 }}>Деталі</div>
        {history.map((h, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 16px', borderRadius: 14,
            background: h.correct ? 'rgba(48,209,88,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${h.correct ? 'rgba(48,209,88,0.18)' : 'rgba(239,68,68,0.18)'}`,
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{h.correct ? '✅' : '❌'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.trackTitle}</div>
              {!h.correct && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Ваша відповідь: <span style={{ color: '#ef4444' }}>{h.picked}</span></div>
              )}
            </div>
          </div>
        ))}
      </div>

      <button onClick={onRestart}
        style={{
          width: '100%', padding: '18px 0', borderRadius: 16, border: 'none',
          background: 'var(--accent)', color: '#000', fontWeight: 800, fontSize: 17,
          cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit',
        }}>
        🔄 Грати знову
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MusicQuizPage() {
  const [tracks, setTracks]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [phase, setPhase]       = useState('setup'); // setup | playing | result
  const [config, setConfig]     = useState(null);
  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex]     = useState(0);
  const [score, setScore]       = useState(0);
  const [history, setHistory]   = useState([]);

  // Завантаження треків
  useEffect(() => {
    tracksApi.getAll()
      .then(res => setTracks(res.data || []))
      .catch(() => setTracks([]))
      .finally(() => setLoading(false));
  }, []);

  // Побудова питань
  const buildQuestions = useCallback((cfg, allTracks) => {
    const selected = pick(allTracks, cfg.questions);
    return selected.map(t => {
      const others = shuffle(allTracks.filter(x => x.id !== t.id)).slice(0, 3);
      let correctLabel, optionsFn;

      if (cfg.mode === 'title' || cfg.mode === 'cover') {
        correctLabel = t.title;
        optionsFn = o => o.title;
      } else {
        correctLabel = t.artistName || 'Unknown';
        optionsFn = o => o.artistName || 'Unknown';
      }

      // Дедублікація варіантів
      const distractors = [...new Set(others.map(optionsFn).filter(v => v !== correctLabel))].slice(0, 3);
      // Якщо не вистачає дистракторів — доповнюємо з інших треків
      let allOptions = shuffle([correctLabel, ...distractors]);
      while (allOptions.length < 4) allOptions.push('—');

      const coverUrl = t.coverPath ? fileUrl('covers', t.coverPath) : null;

      return {
        trackId:    t.id,
        trackTitle: t.title,
        correct:    correctLabel,
        options:    allOptions.slice(0, 4),
        mode:       cfg.mode,
        coverUrl,
        clipLen:    cfg.clipLen,
        streamUrl:  `http://localhost:5000/api/tracks/${t.id}/stream`,
      };
    });
  }, []);

  const startGame = (cfg) => {
    const qs = buildQuestions(cfg, tracks);
    setConfig(cfg);
    setQuestions(qs);
    setQIndex(0);
    setScore(0);
    setHistory([]);
    setPhase('playing');
  };

  // Обробка відповіді — викликається з QuestionScreen
  const handleAnswer = useCallback((isCorrect, picked) => {
    const q = questions[qIndex];
    setHistory(prev => [...prev, {
      trackTitle: q.trackTitle,
      correct: isCorrect,
      picked,
    }]);
    if (isCorrect) setScore(s => s + 1);

    const nextIndex = qIndex + 1;
    if (nextIndex >= questions.length) {
      setPhase('result');
    } else {
      setQIndex(nextIndex);
    }
  }, [qIndex, questions]);

  const restart = () => {
    setPhase('setup');
    setQuestions([]);
    setQIndex(0);
    setScore(0);
    setHistory([]);
  };

  if (loading) return (
    <div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 16 }}>Завантаження треків…</div>
    </div>
  );

  return (
    <div className="main-content" style={{ overflowY: 'auto' }}>
      <div style={{ minHeight: '80vh' }}>

        {phase === 'setup' && (
          <SetupScreen tracks={tracks} onStart={startGame} />
        )}

        {phase === 'playing' && questions.length > 0 && (
          /* KEY = qIndex гарантує повний ремаунт компонента при кожному новому питанні.
             Це скидає весь локальний стан (selected, таймер, аудіо) автоматично. */
          <QuestionScreen
            key={qIndex}
            question={questions[qIndex]}
            index={qIndex}
            total={questions.length}
            onAnswer={handleAnswer}
            maxTime={config?.clipLen ?? 10}
          />
        )}

        {phase === 'result' && (
          <ResultScreen
            score={score}
            total={questions.length}
            history={history}
            onRestart={restart}
          />
        )}
      </div>
    </div>
  );
}
