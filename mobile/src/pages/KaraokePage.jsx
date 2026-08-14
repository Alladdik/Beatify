import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { tracksApi, fileUrl } from '../api';
import { useQuery } from '@tanstack/react-query';
import { usePlayerStore } from '../store/playerStore';
import {
  Mic, MicOff, Play, Pause, Square, Circle,
  Music2, Search, ChevronLeft, Settings, Volume2,
  Headphones, Download, X, Disc3, Scissors, Pin,
} from 'lucide-react';
import toast from 'react-hot-toast';

const API_URL = `http://${window.location.hostname}:5000/api`;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function parseLRC(lrc) {
  if (!lrc) return [];
  const parsed = [];
  const re = /\[(\d{2}):(\d{2}(?:\.\d{2,3})?)\]/g;
  lrc.split('\n').forEach(line => {
    let m; const times = [];
    while ((m = re.exec(line)) !== null) times.push(+m[1] * 60 + parseFloat(m[2]));
    const text = line.replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, '').replace(/\[[a-z]+:[^\]]*\]/gi, '').trim();
    if (!text) return;
    if (times.length) times.forEach(t => parsed.push({ time: t, text }));
    else parsed.push({ time: 0, text });
  });
  return parsed.sort((a, b) => a.time - b.time);
}

function fmt(s) {
  if (!s || isNaN(s)) return '0:00';
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Word-by-word highlight for current lyric line
// ─────────────────────────────────────────────────────────────────────────────
function LyricLineWords({ text, fillPct, fontSize = 28, active = false }) {
  const words = text.split(' ');
  const total = words.length;
  return (
    <span>
      {words.map((word, wi) => {
        // word is lit when its centre has been passed
        const wordCentre = ((wi + 0.5) / total) * 100;
        const lit = active && fillPct >= wordCentre;
        return (
          <span key={wi}
            style={{
              color: lit ? '#1db954' : active ? 'rgba(255,255,255,0.28)' : 'inherit',
              textShadow: lit ? '0 0 18px rgba(29,185,84,0.7)' : 'none',
              transition: 'color 0.08s ease, text-shadow 0.08s ease',
              fontSize, fontWeight: active ? 900 : 'inherit',
            }}>
            {word}{wi < total - 1 ? ' ' : ''}
          </span>
        );
      })}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio: impulse reverb + effect chain
// ─────────────────────────────────────────────────────────────────────────────
function makeImpulse(ctx, dur, decay) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  const n = ctx.createConvolver(); n.buffer = buf; return n;
}

function buildFx(ctx, id) {
  const input = ctx.createGain();
  let output;
  if (id === 'room') {
    const rv = makeImpulse(ctx, 1.2, 3.5), dr = ctx.createGain(), wt = ctx.createGain(), mx = ctx.createGain();
    dr.gain.value = 0.75; wt.gain.value = 0.4;
    input.connect(dr); dr.connect(mx); input.connect(rv); rv.connect(wt); wt.connect(mx); output = mx;
  } else if (id === 'hall') {
    const rv = makeImpulse(ctx, 3.5, 1.5), dr = ctx.createGain(), wt = ctx.createGain(), mx = ctx.createGain();
    dr.gain.value = 0.55; wt.gain.value = 0.65;
    input.connect(dr); dr.connect(mx); input.connect(rv); rv.connect(wt); wt.connect(mx); output = mx;
  } else if (id === 'echo') {
    const dl = ctx.createDelay(2); dl.delayTime.value = 0.35;
    const fb = ctx.createGain(); fb.gain.value = 0.42;
    const dr = ctx.createGain(); dr.gain.value = 0.8;
    const mx = ctx.createGain();
    input.connect(dr); dr.connect(mx); input.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(mx); output = mx;
  } else if (id === 'studio') {
    const rv = makeImpulse(ctx, 1.8, 4);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -24; comp.knee.value = 8; comp.ratio.value = 4;
    comp.attack.value = 0.003; comp.release.value = 0.15;
    const dr = ctx.createGain(); dr.gain.value = 0.8;
    const wt = ctx.createGain(); wt.gain.value = 0.28;
    const mx = ctx.createGain();
    input.connect(comp); comp.connect(dr); dr.connect(mx); comp.connect(rv); rv.connect(wt); wt.connect(mx); output = mx;
  } else if (id === 'double') {
    const dl = ctx.createDelay(0.5); dl.delayTime.value = 0.022;
    const dr = ctx.createGain(); dr.gain.value = 0.75;
    const wt = ctx.createGain(); wt.gain.value = 0.55;
    const mx = ctx.createGain();
    input.connect(dr); dr.connect(mx); input.connect(dl); dl.connect(wt); wt.connect(mx); output = mx;
  } else {
    output = input;
  }
  return { input, output };
}

// ─────────────────────────────────────────────────────────────────────────────
// AudioBuffer → WAV Blob (for punch-in merge)
// ─────────────────────────────────────────────────────────────────────────────
function bufToWav(buf) {
  const ch = buf.numberOfChannels, sr = buf.sampleRate, len = buf.length;
  const ab = new ArrayBuffer(44 + len * ch * 2);
  const v = new DataView(ab);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + len * ch * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, ch, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, len * ch * 2, true);
  let off = 44;
  for (let i = 0; i < len; i++)
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, buf.getChannelData(c)[i]));
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true); off += 2;
    }
  return new Blob([ab], { type: 'audio/wav' });
}

async function mergePunchIn(prevBlob, punchTime, newBlob) {
  const tmpCtx = new (window.AudioContext || window.webkitAudioContext)();
  const [prevBuf, newBuf] = await Promise.all([
    prevBlob.arrayBuffer().then(ab => tmpCtx.decodeAudioData(ab)),
    newBlob.arrayBuffer().then(ab => tmpCtx.decodeAudioData(ab)),
  ]);
  await tmpCtx.close();

  const sr = prevBuf.sampleRate;
  const punchSamples = Math.min(Math.floor(punchTime * sr), prevBuf.length);
  const totalLen = punchSamples + newBuf.length;
  const offCtx = new OfflineAudioContext(2, totalLen, sr);

  const s1 = offCtx.createBufferSource(); s1.buffer = prevBuf;
  s1.connect(offCtx.destination); s1.start(0, 0, punchTime);

  const s2 = offCtx.createBufferSource(); s2.buffer = newBuf;
  s2.connect(offCtx.destination); s2.start(punchTime);

  const rendered = await offCtx.startRendering();
  return bufToWav(rendered);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mic Test Widget — self-contained, uses its own AudioContext + stream
// ─────────────────────────────────────────────────────────────────────────────
function MicTestWidget() {
  const [phase, setPhase]       = useState('idle');   // idle|testing|done|silent|error
  const [level, setLevel]       = useState(0);
  const [countdown, setCd]      = useState(3);
  const [playUrl, setPlayUrl]   = useState(null);
  const [errMsg, setErrMsg]     = useState('');
  const streamRef  = useRef(null);
  const ctxRef     = useRef(null);
  const rafRef     = useRef(null);
  const timerRef   = useRef(null);
  const signalRef  = useRef(false);

  const cleanup = () => {
    cancelAnimationFrame(rafRef.current);
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (ctxRef.current?.state !== 'closed') ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  };

  useEffect(() => cleanup, []);

  const startTest = async () => {
    cleanup();
    setPhase('testing');
    setLevel(0);
    setCd(3);
    setPlayUrl(null);
    setErrMsg('');
    signalRef.current = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase('error'); setErrMsg('getUserMedia не підтримується'); return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setPhase('error');
      setErrMsg(e.name === 'NotAllowedError' ? 'Дозвіл відхилено — розблокуй мікрофон у браузері' : e.message);
      return;
    }

    streamRef.current = stream;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctxRef.current = ctx;
    const src      = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.6;
    src.connect(analyser);

    // MediaRecorder for playback
    const chunks = [];
    let recorder;
    try {
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setPlayUrl(URL.createObjectURL(blob));
      };
      recorder.start();
    } catch { /* MediaRecorder unavailable — skip playback */ }

    // Level poll via rAF
    const poll = () => {
      rafRef.current = requestAnimationFrame(poll);
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((s, v) => s + v, 0) / data.length / 255;
      setLevel(avg);
      if (avg > 0.015) signalRef.current = true;
    };
    poll();

    // Countdown
    let secs = 3;
    timerRef.current = setInterval(() => {
      secs--;
      setCd(secs);
      if (secs <= 0) {
        clearInterval(timerRef.current);
        cancelAnimationFrame(rafRef.current);
        try { if (recorder?.state === 'recording') recorder.stop(); } catch {}
        stream.getTracks().forEach(t => t.stop());
        ctx.close().catch(() => {});
        setLevel(0);
        setPhase(signalRef.current ? 'done' : 'silent');
      }
    }, 1000);
  };

  const reset = () => { cleanup(); setPhase('idle'); setLevel(0); setPlayUrl(null); };

  const barW = Math.round(level * 100);

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 14 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 8 }}>
        🎤 Тест мікрофону
      </div>

      {phase === 'idle' && (
        <button onClick={startTest} style={{ width: '100%', padding: '8px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          Почати тест (3 сек)
        </button>
      )}

      {phase === 'testing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#facc15', fontWeight: 700, animation: 'recPulse 1s ease-in-out infinite' }}>
              ● Говори в мікрофон...
            </span>
            <span style={{ fontSize: 13, fontWeight: 900, color: '#facc15', minWidth: 20, textAlign: 'right' }}>{countdown}</span>
          </div>
          {/* Level bar */}
          <div style={{ height: 10, background: 'rgba(255,255,255,0.07)', borderRadius: 5, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 5, transition: 'width 0.05s linear',
              width: `${barW}%`,
              background: barW > 60 ? '#ef4444' : barW > 30 ? '#facc15' : '#1db954',
            }} />
          </div>
          {/* Bar labels */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
            <span>тихо</span><span>норм</span><span>гучно</span>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(29,185,84,0.1)', border: '1px solid rgba(29,185,84,0.3)', borderRadius: 9 }}>
            <span style={{ fontSize: 16 }}>✅</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1db954' }}>Мікрофон працює!</span>
          </div>
          {playUrl && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Прослухай запис:</div>
              <audio src={playUrl} controls style={{ width: '100%', height: 28 }} />
            </div>
          )}
          <button onClick={reset} style={{ padding: '6px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
            Тест ще раз
          </button>
        </div>
      )}

      {phase === 'silent' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 9 }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#facc15' }}>Немає сигналу</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Перевір чи мікрофон підключено та вибраний правильний пристрій.
          </div>
          <button onClick={startTest} style={{ padding: '6px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
            Спробувати ще раз
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 9 }}>
            <span style={{ fontSize: 16 }}>❌</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444' }}>{errMsg || 'Помилка мікрофону'}</span>
          </div>
          <button onClick={reset} style={{ padding: '6px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
            Закрити
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mic VU meter
// ─────────────────────────────────────────────────────────────────────────────
function MicMeter({ analyserRef, active }) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx2 = canvas.getContext('2d');
    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const W = canvas.offsetWidth * window.devicePixelRatio || 400;
      const H = canvas.offsetHeight * window.devicePixelRatio || 48;
      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;
      ctx2.clearRect(0, 0, W, H);
      const BARS = 52;
      if (!analyserRef.current || !active) {
        for (let i = 0; i < BARS; i++) {
          ctx2.fillStyle = 'rgba(255,255,255,0.06)';
          ctx2.fillRect(i * (W / BARS) + 1, H / 2 - 2, W / BARS - 2, 4);
        }
        return;
      }
      const data = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(data);
      const step = Math.floor(data.length / BARS);
      for (let i = 0; i < BARS; i++) {
        let avg = 0;
        for (let j = 0; j < step; j++) avg += data[i * step + j];
        const val = avg / step / 255;
        const h = Math.max(4, val * H);
        ctx2.fillStyle = `hsl(${120 - val * 80},80%,55%)`;
        ctx2.fillRect(i * (W / BARS) + 1, H / 2 - h / 2, W / BARS - 2, h);
      }
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);
  return (
    <canvas ref={canvasRef}
      style={{ width: '100%', height: 44, borderRadius: 10, background: 'rgba(255,255,255,0.03)', display: 'block' }} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Song Picker
// ─────────────────────────────────────────────────────────────────────────────
function SongPicker({ onSelect }) {
  const [q, setQ] = useState('');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['tracks-all-karaoke'],
    queryFn: () => tracksApi.getAllAdmin().then(r =>
      Array.isArray(r.data) ? r.data : (r.data?.tracks ?? r.data?.items ?? [])
    ),
    staleTime: 60_000,
  });

  const tracks = useMemo(() => {
    const all = Array.isArray(data) ? data : [];
    const sq = q.trim().toLowerCase();
    return sq ? all.filter(t =>
      t.title?.toLowerCase().includes(sq) || t.artistName?.toLowerCase().includes(sq)
    ) : all;
  }, [data, q]);

  return (
    <div style={{ minHeight: '100%', background: 'radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.12) 0%, transparent 55%)', padding: '40px 24px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 72, marginBottom: 16, filter: 'drop-shadow(0 0 24px rgba(99,102,241,0.5))' }}>🎤</div>
          <h1 style={{ fontSize: 36, fontWeight: 900, margin: '0 0 10px', letterSpacing: -1, background: 'linear-gradient(135deg,#fff 30%,rgba(255,255,255,0.5))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Karaoke Studio
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>Вибери пісню і починай співати</p>
        </div>

        <div style={{ position: 'relative', marginBottom: 20 }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Пошук пісні або виконавця..."
            style={{ width: '100%', boxSizing: 'border-box', padding: '13px 16px 13px 42px', borderRadius: 14, border: '1.5px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 15, outline: 'none' }} />
        </div>

        {isLoading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <div style={{ width: 18, height: 18, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            Завантаження треків...
          </div>
        )}
        {isError && <div style={{ textAlign: 'center', padding: 40, color: '#ef4444' }}>Не вдалось завантажити. Перевір сервер.</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tracks.map(t => {
            const cover = t.coverPath ? fileUrl('covers', t.coverPath) : null;
            return (
              <div key={t.id} onClick={() => onSelect(t)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
              >
                <div style={{ width: 46, height: 46, borderRadius: 9, overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {cover ? <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Music2 size={18} color="var(--text-muted)" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.artistName}</div>
                </div>
                {t.lyrics
                  ? <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', background: 'rgba(29,185,84,0.12)', padding: '3px 9px', borderRadius: 10, flexShrink: 0 }}>🎵 Lyrics</span>
                  : <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>no lyrics</span>
                }
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Play size={13} color="#fff" style={{ marginLeft: 2 }} />
                </div>
              </div>
            );
          })}
          {!isLoading && tracks.length === 0 && (
            <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
              <Music2 size={36} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
              Нічого не знайдено
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Karaoke Stage
// ─────────────────────────────────────────────────────────────────────────────
const EFFECTS = [
  { id: 'none',   label: 'Чисто',    emoji: '🎙' },
  { id: 'studio', label: 'Студія',   emoji: '🎚' },
  { id: 'room',   label: 'Кімната',  emoji: '🏠' },
  { id: 'hall',   label: 'Зал',      emoji: '🏛' },
  { id: 'echo',   label: 'Ехо',      emoji: '🔁' },
  { id: 'double', label: 'Дубль',    emoji: '✨' },
];

function KaraokeStage({ track, onBack }) {
  const { isPlaying: gPlay, togglePlay: gToggle } = usePlayerStore();

  // Playback
  const [playing,   setPlaying]   = useState(false);
  const [curTime,   setCurTime]   = useState(0);
  const [dur,       setDur]       = useState(0);
  const [trackVol,  setTrackVol]  = useState(0.8);

  // Mic
  const [micVol,    setMicVol]    = useState(0.9);
  const [monitoring,setMonitor]   = useState(true);
  const [effect,    setEffect]    = useState('studio');
  const [micOn,     setMicOn]     = useState(false);
  const [micDevices,setMicDevices]= useState([]);
  const [selMic,    setSelMic]    = useState('');

  // Recording
  const [recording, setRecording] = useState(false);
  const [recordings,setRecordings]= useState([]);

  // Punch-in
  const [punchTime, setPunchTime] = useState(null);   // seconds to re-record from
  const [punchIdx,  setPunchIdx]  = useState(null);   // recording index to punch into

  // UI
  const [showSettings, setShowSettings] = useState(false);

  // Audio refs
  const audioRef      = useRef(null);
  const ctxRef        = useRef(null);
  const trackSrcRef   = useRef(null);
  const trackGainRef  = useRef(null);
  const recDestRef    = useRef(null);
  const micSrcRef     = useRef(null);
  const micGainRef    = useRef(null);
  const micAnalRef    = useRef(null);
  const monGainRef    = useRef(null);
  const fxNodesRef    = useRef(null);
  const streamRef     = useRef(null);
  const recorderRef   = useRef(null);
  const chunksRef     = useRef([]);
  const punchTimeRef  = useRef(null); // latest punchTime without closure stale

  useEffect(() => { punchTimeRef.current = punchTime; }, [punchTime]);

  const parsedLyrics = useMemo(() => parseLRC(track.lyrics), [track.lyrics]);
  const hasTimed     = parsedLyrics.some(l => l.time > 0);

  const curIdx = useMemo(() => {
    if (!hasTimed || !parsedLyrics.length) return 0;
    let idx = 0;
    for (let i = 0; i < parsedLyrics.length; i++) {
      if (parsedLyrics[i].time <= curTime) idx = i; else break;
    }
    return idx;
  }, [curTime, parsedLyrics, hasTimed]);

  const lineFillPct = useMemo(() => {
    if (!hasTimed || !parsedLyrics.length) return 0;
    const cur = parsedLyrics[curIdx], next = parsedLyrics[curIdx + 1];
    if (!cur || !next) return 100;
    return Math.min(100, Math.max(0, ((curTime - cur.time) / (next.time - cur.time)) * 100));
  }, [curTime, curIdx, parsedLyrics, hasTimed]);

  // Pause global player on mount + enumerate mic devices immediately
  useEffect(() => {
    if (gPlay) gToggle();
    // Try to list audio inputs even before permission is granted.
    // Labels will be empty until the user grants mic access, but deviceIds work.
    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices()
        .then(all => {
          const inp = all.filter(d => d.kind === 'audioinput');
          if (inp.length) { setMicDevices(inp); setSelMic(inp[0].deviceId); }
        })
        .catch(() => {});
    }
  }, []);

  // Audio element listeners
  useEffect(() => {
    const a = audioRef.current; if (!a) return;
    const onTime = () => setCurTime(a.currentTime);
    const onDur  = () => setDur(a.duration);
    const onPlay  = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('durationchange', onDur);
    a.addEventListener('play',  onPlay);
    a.addEventListener('pause', onPause);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('durationchange', onDur);
      a.removeEventListener('play',  onPlay);
      a.removeEventListener('pause', onPause);
    };
  }, []);

  // Volume sync
  useEffect(() => { if (trackGainRef.current) trackGainRef.current.gain.value = trackVol; }, [trackVol]);
  useEffect(() => { if (micGainRef.current)   micGainRef.current.gain.value   = micVol;   }, [micVol]);
  useEffect(() => { if (monGainRef.current)   monGainRef.current.gain.value   = monitoring ? 0.9 : 0; }, [monitoring]);

  // Cleanup
  useEffect(() => () => {
    stopMic();
    if (ctxRef.current?.state !== 'closed') ctxRef.current?.close();
    audioRef.current?.pause();
  }, []);

  // Get/create AudioContext — always creates recDest together with it so they
  // share the same context. Both track and mic connect to this single recDest.
  const getCtx = useCallback(() => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctxRef.current = ctx;
      recDestRef.current = ctx.createMediaStreamDestination(); // one recDest per context
    }
    return ctxRef.current;
  }, []);

  // Connect track element (once) — throws on CORS/context errors so callers must catch.
  // Uses the shared recDestRef created by getCtx — never overwrites it.
  const connectTrack = useCallback(() => {
    if (trackSrcRef.current) return; // already connected
    const ctx = getCtx(); // also ensures recDestRef.current exists
    const src  = ctx.createMediaElementSource(audioRef.current);
    const gain = ctx.createGain(); gain.gain.value = trackVol;
    src.connect(gain);
    gain.connect(ctx.destination);
    if (recDestRef.current) gain.connect(recDestRef.current); // share the same recDest as mic
    trackSrcRef.current  = src;
    trackGainRef.current = gain;
  }, [getCtx, trackVol]);

  // Disconnect mic chain (no side-effects, safe to call multiple times)
  const stopMic = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    try { micSrcRef.current?.disconnect(); } catch {}
    try { fxNodesRef.current?.input?.disconnect(); fxNodesRef.current?.output?.disconnect(); } catch {}
    micSrcRef.current = micGainRef.current = monGainRef.current = micAnalRef.current = fxNodesRef.current = null;
    setMicOn(false);
  }, []);

  // Build mic chain — called on first connect and after effect change
  const connectMic = useCallback(async (deviceId, fxId) => {
    let ctx;
    try {
      ctx = getCtx();
      if (ctx.state === 'suspended') await ctx.resume();
    } catch (e) {
      toast.error('Помилка AudioContext: ' + e.message); return;
    }

    stopMic();

    // Check API availability first (missing on HTTP non-localhost or old browsers)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error('Мікрофон недоступний у цьому контексті. Спробуй через HTTPS або localhost.');
      return;
    }

    // Try device-specific first, then fall back to default
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
    } catch (e1) {
      if (e1.name === 'NotAllowedError' || e1.name === 'PermissionDeniedError') {
        toast.error('Мікрофон заблоковано. Натисни 🔒 у адресному рядку → Дозволи → Мікрофон → Дозволити, потім перезавантаж сторінку.');
        return;
      }
      if (e1.name === 'NotFoundError' || e1.name === 'DevicesNotFoundError') {
        toast.error('Мікрофон не знайдено. Підключи мікрофон і спробуй ще раз.');
        return;
      }
      // device-specific failed → fallback to any mic
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e2) {
        toast.error('Мікрофон недоступний: ' + (e2.message || e2.name));
        return;
      }
    }

    streamRef.current = stream;

    // Enumerate devices now that we have permission
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const inp = all.filter(d => d.kind === 'audioinput');
      setMicDevices(inp);
      if (!deviceId && inp.length) setSelMic(inp[0].deviceId);
    } catch {}

    // recDestRef.current is guaranteed by getCtx() above — no fallback needed

    // Build Web Audio chain — wrapped so a node error doesn't leave mic "off"
    try {
      const src  = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain(); gain.gain.value = micVol;
      const anal = ctx.createAnalyser(); anal.fftSize = 512; anal.smoothingTimeConstant = 0.75;
      const fx   = buildFx(ctx, fxId ?? effect);
      const mon  = ctx.createGain(); mon.gain.value = monitoring ? 0.9 : 0;

      src.connect(gain);
      gain.connect(anal);
      anal.connect(fx.input);
      fx.output.connect(mon);
      mon.connect(ctx.destination);
      if (recDestRef.current) fx.output.connect(recDestRef.current);

      micSrcRef.current  = src;
      micGainRef.current = gain;
      micAnalRef.current = anal;
      fxNodesRef.current = fx;
      monGainRef.current = mon;
    } catch (e) {
      console.warn('Mic chain warning:', e.message);
    }

    setMicOn(true);          // ← always reach this if we have a stream
    toast.success('🎙 Мікрофон підключено');
  }, [getCtx, stopMic, micVol, monitoring, effect]);

  // Toggle mic
  const toggleMic = useCallback(async () => {
    if (micOn) { stopMic(); return; }
    // Connect track so rec destination exists; ignore errors (mic works without it)
    try { connectTrack(); } catch {}
    await connectMic(selMic, effect);
  }, [micOn, stopMic, connectMic, connectTrack, selMic, effect]);

  // Effect change
  const changeEffect = useCallback((id) => {
    setEffect(id);
    if (micOn) connectMic(selMic, id);
  }, [micOn, connectMic, selMic]);

  // Mic device change
  const changeMicDevice = useCallback(async (id) => {
    setSelMic(id);
    if (micOn) await connectMic(id, effect);
  }, [micOn, connectMic, effect]);

  // Play / pause
  const togglePlay = useCallback(async () => {
    const ctx = getCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    try { connectTrack(); } catch {}
    const a = audioRef.current;
    if (a.paused) a.play().catch(e => toast.error('Не вдалось відтворити: ' + e.message));
    else a.pause();
  }, [getCtx, connectTrack]);

  // Seekbar click
  const handleSeek = useCallback((e) => {
    const r   = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - r.left) / r.width;
    if (audioRef.current) audioRef.current.currentTime = pct * dur;
  }, [dur]);

  // Click on a lyric line → set punch-in point
  const handleLyricClick = useCallback((time) => {
    setPunchTime(time);
    setPunchIdx(recordings.length > 0 ? recordings.length - 1 : null);
    if (audioRef.current) audioRef.current.currentTime = time;
    toast(`📍 Точка перезапису: ${fmt(time)}`, { icon: '✂️' });
  }, [recordings.length]);

  // Clear punch-in
  const clearPunch = useCallback(() => {
    setPunchTime(null);
    setPunchIdx(null);
  }, []);

  // Start recording
  const startRec = useCallback(() => {
    // Ensure AudioContext + shared recDest exist
    try { getCtx(); } catch {}
    // Try to wire track into the shared recDest (no-op if already connected or CORS fails)
    try { connectTrack(); } catch {}

    if (!recDestRef.current) {
      toast.error('Спочатку увімкни мікрофон 🎙');
      return;
    }

    // If punch-in set, seek to punch point
    const pt = punchTimeRef.current;
    if (pt !== null && audioRef.current) audioRef.current.currentTime = pt;

    chunksRef.current = [];
    try {
      const rec = new MediaRecorder(recDestRef.current.stream, { mimeType: 'audio/webm;codecs=opus' });
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        const newBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const latestPt = punchTimeRef.current;
        const latestPi = punchIdx;

        // Punch-in merge
        if (latestPt !== null && latestPi !== null && recordings[latestPi]) {
          toast('⏳ Об\'єднання записів...', { duration: 2000 });
          try {
            const merged = await mergePunchIn(recordings[latestPi].blob, latestPt, newBlob);
            const url = URL.createObjectURL(merged);
            setRecordings(p => p.map((r, i) => i === latestPi ? { ...r, blob: merged, url, title: r.title + ' (пересп.)' } : r));
          } catch (err) {
            toast.error('Помилка об\'єднання: ' + err.message);
            // Fall back: save as new recording
            const url = URL.createObjectURL(newBlob);
            setRecordings(p => [...p, { blob: newBlob, url, title: `${track.title} — дубль ${p.length + 1}`, ts: Date.now() }]);
          }
        } else {
          const url = URL.createObjectURL(newBlob);
          setRecordings(p => [...p, { blob: newBlob, url, title: `${track.title} — дубль ${p.length + 1}`, ts: Date.now() }]);
          toast.success('🎙 Запис збережено!');
        }
        clearPunch();
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      // Auto-play if not playing
      if (audioRef.current?.paused) togglePlay();
    } catch { toast.error('MediaRecorder не підтримується в цьому браузері'); }
  }, [connectTrack, punchIdx, recordings, track.title, clearPunch, togglePlay]);

  const stopRec = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    setRecording(false);
  }, []);

  const downloadRec = useCallback((rec) => {
    const a = document.createElement('a');
    a.href = rec.url; a.download = `${rec.title}.wav`; a.click();
  }, []);

  // Lyrics window: 3 above, current, 3 below
  const lyricsWindow = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const offset = i - 3;
    return { idx: curIdx + offset, line: parsedLyrics[curIdx + offset] ?? null, offset };
  }), [parsedLyrics, curIdx]);

  const cover = track.coverPath ? fileUrl('covers', track.coverPath) : null;

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', background: 'radial-gradient(ellipse at 50% -5%, rgba(99,102,241,0.15) 0%, transparent 50%), radial-gradient(ellipse at 80% 100%, rgba(29,185,84,0.07) 0%, transparent 45%)' }}>
      <audio ref={audioRef} src={`${API_URL}/tracks/${track.id}/stream`} crossOrigin="anonymous" preload="auto" />

      {/* ── Top bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.07)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={17} />
        </button>
        {cover && <img src={cover} alt="" style={{ width: 34, height: 34, borderRadius: 7, objectFit: 'cover', flexShrink: 0 }} />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{track.artistName}</div>
        </div>

        {/* Punch-in badge */}
        {punchTime !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 20 }}>
            <Scissors size={12} color="#eab308" />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#eab308' }}>Перезапис з {fmt(punchTime)}</span>
            <button onClick={clearPunch} style={{ background: 'none', border: 'none', color: '#eab308', cursor: 'pointer', display: 'flex', padding: 0, opacity: 0.7 }}><X size={12} /></button>
          </div>
        )}

        <button onClick={() => setShowSettings(p => !p)}
          style={{ background: showSettings ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Settings size={15} />
        </button>
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* Lyrics */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 32px', textAlign: 'center' }}>
          {parsedLyrics.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>
              <Disc3 size={48} style={{ marginBottom: 16, opacity: 0.25, display: 'block', margin: '0 auto 16px' }} />
              <p style={{ fontSize: 16, fontWeight: 600 }}>Текст пісні недоступний</p>
              <p style={{ fontSize: 13, margin: 0 }}>Freestyle — співай що хочеш 🎤</p>
            </div>
          ) : (
            <div style={{ width: '100%', maxWidth: 680, userSelect: 'none' }}>
              {lyricsWindow.map(({ idx, line, offset }) => {
                if (!line) return <div key={`e${offset}`} style={{ height: offset === 0 ? 80 : 36 }} />;
                const isCur  = offset === 0;
                const dist   = Math.abs(offset);
                const opacity = isCur ? 1 : Math.max(0.1, 1 - dist * 0.26);
                const isPunch = punchTime !== null && line.time <= punchTime && (parsedLyrics[idx + 1]?.time ?? Infinity) > punchTime;

                return (
                  <div key={idx}
                    onClick={() => hasTimed && handleLyricClick(line.time)}
                    title={hasTimed ? `Клацни, щоб перезаписати з цього місця (${fmt(line.time)})` : undefined}
                    style={{
                      margin: isCur ? '8px 0' : '2px 0',
                      padding: isCur ? '8px 0' : '4px 0',
                      opacity,
                      transform: `scale(${isCur ? 1.04 : Math.max(0.82, 1 - dist * 0.055)})`,
                      filter: dist > 1 ? `blur(${(dist - 1) * 0.4}px)` : 'none',
                      transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
                      cursor: hasTimed ? 'pointer' : 'default',
                      borderRadius: 10,
                      background: isPunch ? 'rgba(234,179,8,0.07)' : 'transparent',
                      outline: isPunch ? '1px solid rgba(234,179,8,0.3)' : 'none',
                    }}
                  >
                    {isPunch && <span style={{ fontSize: 10, color: '#eab308', display: 'block', marginBottom: 2 }}>✂️ перезапис звідси</span>}
                    <span style={{ fontSize: isCur ? 28 : 17, fontWeight: isCur ? 900 : 600, color: isCur ? '#fff' : 'var(--text-secondary)', letterSpacing: isCur ? -0.5 : 0 }}>
                      {isCur && hasTimed
                        ? <LyricLineWords text={line.text} fillPct={lineFillPct} fontSize={28} active />
                        : line.text
                      }
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div style={{ width: 250, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.06)', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto' }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>Налаштування</div>

            {/* Mic device */}
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 6 }}>🎙 Мікрофон</label>
              {micDevices.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, textAlign: 'center' }}>
                  Мікрофон не знайдено
                </div>
              ) : (
                <select value={selMic} onChange={e => changeMicDevice(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 12, outline: 'none', cursor: 'pointer' }}>
                  {micDevices.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || (d.deviceId === 'default' ? 'Мікрофон за замовчуванням' : `Мікрофон ${i + 1}`)}
                    </option>
                  ))}
                </select>
              )}
              {micDevices.length > 0 && !micOn && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5, opacity: 0.7 }}>
                  Натисни 🎙 щоб увімкнути вибраний пристрій
                </div>
              )}
            </div>

            {/* Monitor */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}><Headphones size={14} /> Моніторинг</span>
              <button onClick={() => setMonitor(p => !p)}
                style={{ padding: '4px 12px', borderRadius: 20, border: 'none', background: monitoring ? 'var(--accent)' : 'rgba(255,255,255,0.1)', color: monitoring ? '#000' : 'var(--text-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {monitoring ? 'ВКЛ' : 'ВИКЛ'}
              </button>
            </div>

            {/* Track vol */}
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span><Volume2 size={12} style={{ verticalAlign: 'middle' }} /> Трек</span>
                <span>{Math.round(trackVol * 100)}%</span>
              </label>
              <input type="range" min="0" max="1" step="0.01" value={trackVol} onChange={e => setTrackVol(+e.target.value)} style={{ width: '100%', accentColor: 'var(--accent)' }} />
            </div>

            {/* Mic vol */}
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span><Mic size={12} style={{ verticalAlign: 'middle' }} /> Вокал</span>
                <span>{Math.round(micVol * 100)}%</span>
              </label>
              <input type="range" min="0" max="1" step="0.01" value={micVol} onChange={e => setMicVol(+e.target.value)} style={{ width: '100%', accentColor: 'var(--accent)' }} />
            </div>

            {/* Mic test */}
            <MicTestWidget />
          </div>
        )}
      </div>

      {/* ── Bottom controls ── */}
      <div style={{ flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.06)', padding: '12px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* VU meter */}
        <MicMeter analyserRef={micAnalRef} active={micOn} />

        {/* Seekbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 34, textAlign: 'right' }}>{fmt(curTime)}</span>
          <div onClick={handleSeek} style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 3, cursor: 'pointer', position: 'relative' }}>
            <div style={{ height: '100%', width: `${dur > 0 ? (curTime / dur) * 100 : 0}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.15s linear' }} />
            {/* Punch-in marker */}
            {punchTime !== null && dur > 0 && (
              <div style={{ position: 'absolute', top: -4, left: `${(punchTime / dur) * 100}%`, width: 2, height: 13, background: '#eab308', borderRadius: 1, transform: 'translateX(-50%)' }} />
            )}
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 34 }}>{fmt(dur)}</span>
        </div>

        {/* Effects */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {EFFECTS.map(ef => (
            <button key={ef.id} onClick={() => changeEffect(ef.id)}
              style={{ padding: '5px 11px', borderRadius: 20, border: `1px solid ${effect === ef.id ? 'var(--accent)' : 'rgba(255,255,255,0.1)'}`, background: effect === ef.id ? 'rgba(29,185,84,0.14)' : 'rgba(255,255,255,0.04)', color: effect === ef.id ? 'var(--accent)' : 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {ef.emoji} {ef.label}
            </button>
          ))}
        </div>

        {/* Transport row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>

          {/* Mic toggle */}
          <button onClick={toggleMic}
            style={{ width: 46, height: 46, borderRadius: '50%', border: 'none', background: micOn ? 'rgba(29,185,84,0.18)' : 'rgba(255,255,255,0.07)', color: micOn ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: micOn ? '0 0 18px rgba(29,185,84,0.35)' : 'none', transition: 'all 0.2s' }}>
            {micOn ? <Mic size={19} /> : <MicOff size={19} />}
          </button>

          {/* Quick vol sliders */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Volume2 size={11} color="var(--text-muted)" />
              <input type="range" min="0" max="1" step="0.01" value={trackVol} onChange={e => setTrackVol(+e.target.value)} style={{ flex: 1, accentColor: 'var(--accent)', height: 3 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Mic size={11} color="var(--text-muted)" />
              <input type="range" min="0" max="1" step="0.01" value={micVol} onChange={e => setMicVol(+e.target.value)} style={{ flex: 1, accentColor: '#a78bfa', height: 3 }} />
            </div>
          </div>

          {/* Playback */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, curTime - 10); }}
              style={{ background: 'rgba(255,255,255,0.07)', border: 'none', color: '#fff', width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>-10</button>
            <button onClick={togglePlay}
              style={{ background: 'var(--accent)', border: 'none', color: '#000', width: 52, height: 52, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(29,185,84,0.4)' }}>
              {playing ? <Pause size={21} /> : <Play size={21} style={{ marginLeft: 2 }} />}
            </button>
            <button onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.min(dur, curTime + 10); }}
              style={{ background: 'rgba(255,255,255,0.07)', border: 'none', color: '#fff', width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>+10</button>
          </div>

          {/* Record */}
          <button onClick={recording ? stopRec : startRec}
            style={{ width: 46, height: 46, borderRadius: '50%', border: 'none', background: recording ? '#ef4444' : 'rgba(239,68,68,0.12)', color: recording ? '#fff' : '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: recording ? '0 0 20px rgba(239,68,68,0.55)' : 'none', animation: recording ? 'recPulse 1.4s ease-in-out infinite' : 'none', transition: 'all 0.2s' }}>
            {recording ? <Square size={17} fill="#fff" /> : <Circle size={19} />}
          </button>
        </div>

        {/* Recordings */}
        {recordings.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Записи — клацни на текст пісні щоб вибрати точку перезапису
            </div>
            {recordings.map((rec, i) => (
              <div key={rec.ts} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10 }}>
                <Circle size={9} color="#ef4444" fill="#ef4444" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{rec.title}</span>
                <audio src={rec.url} controls style={{ height: 26, flexShrink: 0, maxWidth: 180 }} />
                <button onClick={() => { setPunchTime(null); setPunchIdx(i); toast('Обери точку — клацни на рядок тексту', { icon: '✂️' }); }}
                  title="Вибрати точку перезапису" style={{ background: 'rgba(234,179,8,0.1)', border: 'none', color: '#eab308', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Scissors size={12} />
                </button>
                <button onClick={() => downloadRec(rec)} title="Завантажити"
                  style={{ background: 'rgba(255,255,255,0.07)', border: 'none', color: 'var(--text-muted)', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Download size={12} />
                </button>
                <button onClick={() => setRecordings(p => p.filter((_, j) => j !== i))} title="Видалити"
                  style={{ background: 'rgba(239,68,68,0.08)', border: 'none', color: '#ef4444', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes recPulse { 0%,100% { box-shadow: 0 0 20px rgba(239,68,68,0.5); } 50% { box-shadow: 0 0 40px rgba(239,68,68,0.9); } }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function KaraokePage() {
  const [track, setTrack] = useState(null);
  return track ? <KaraokeStage track={track} onBack={() => setTrack(null)} /> : <SongPicker onSelect={setTrack} />;
}
