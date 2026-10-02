import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mic, MicOff, Play, Pause, Square, Circle, Search, ChevronLeft, Settings, Download, X, Disc3, Scissors } from 'lucide-react';
import toast from 'react-hot-toast';
import { tracksApi } from '../api';
import { streamUrl } from '../lib/config';
import { formatTime } from '../lib/format';
import { usePlayerStore } from '../store/playerStore';
import { useLyrics } from '../hooks/useLyrics';
import Cover from '../components/ui/Cover';

// Word-by-word fill for the current lyric line
function LyricLineWords({ text, fillPct }) {
  const words = text.split(' ');
  return (
    <span>
      {words.map((word, wi) => (
        <span key={wi} className={((wi + 0.5) / words.length) * 100 <= fillPct ? 'kara-word lit' : 'kara-word'}>
          {word}{wi < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  );
}

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
// Mic test — self-contained: own AudioContext + stream, 3-second check with playback
// ─────────────────────────────────────────────────────────────────────────────
function MicTestWidget() {
  const [phase, setPhase] = useState('idle'); // idle | testing | done | silent | error
  const [level, setLevel] = useState(0);
  const [countdown, setCd] = useState(3);
  const [playUrl, setPlayUrl] = useState(null);
  const [errMsg, setErrMsg] = useState('');
  const streamRef = useRef(null);
  const ctxRef = useRef(null);
  const rafRef = useRef(null);
  const timerRef = useRef(null);
  const signalRef = useRef(false);

  const cleanup = () => {
    cancelAnimationFrame(rafRef.current);
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (ctxRef.current?.state !== 'closed') ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  };
  useEffect(() => cleanup, []);

  const startTest = async () => {
    cleanup();
    setPhase('testing'); setLevel(0); setCd(3); setPlayUrl(null); setErrMsg('');
    signalRef.current = false;
    if (!navigator.mediaDevices?.getUserMedia) { setPhase('error'); setErrMsg('Мікрофон недоступний у цьому контексті (потрібен HTTPS або localhost)'); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { setPhase('error'); setErrMsg(e.name === 'NotAllowedError' ? 'Дозвіл відхилено — розблокуйте мікрофон у браузері' : e.message); return; }

    streamRef.current = stream;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.6;
    ctx.createMediaStreamSource(stream).connect(analyser);

    const chunks = [];
    let recorder;
    try {
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => setPlayUrl(URL.createObjectURL(new Blob(chunks, { type: 'audio/webm' })));
      recorder.start();
    } catch { /* no MediaRecorder — skip playback */ }

    const data = new Uint8Array(analyser.frequencyBinCount);
    const poll = () => {
      rafRef.current = requestAnimationFrame(poll);
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((s, v) => s + v, 0) / data.length / 255;
      setLevel(avg);
      if (avg > 0.015) signalRef.current = true;
    };
    poll();

    let secs = 3;
    timerRef.current = setInterval(() => {
      secs--; setCd(secs);
      if (secs <= 0) {
        clearInterval(timerRef.current);
        cancelAnimationFrame(rafRef.current);
        try { if (recorder?.state === 'recording') recorder.stop(); } catch { /* stopped */ }
        stream.getTracks().forEach((t) => t.stop());
        ctx.close().catch(() => {});
        setLevel(0);
        setPhase(signalRef.current ? 'done' : 'silent');
      }
    }, 1000);
  };
  const reset = () => { cleanup(); setPhase('idle'); setLevel(0); setPlayUrl(null); };

  return (
    <div className="kara-block">
      <div className="label">Тест мікрофона</div>
      {phase === 'idle' && <button className="btn sm block" onClick={startTest}>Перевірити (3 с)</button>}
      {phase === 'testing' && (
        <>
          <div className="kara-meter-line"><i style={{ transform: `scaleX(${Math.round(level * 100) / 100})`, background: level > 0.6 ? 'var(--danger)' : level > 0.3 ? 'var(--warn)' : 'var(--accent)' }} /></div>
          <span className="mono muted" style={{ fontSize: '0.72rem' }}>говоріть… {countdown}</span>
        </>
      )}
      {phase === 'done' && (
        <>
          <div className="note" style={{ borderColor: 'var(--accent-line)' }}>Мікрофон працює.</div>
          {playUrl && <audio src={playUrl} controls style={{ width: '100%', height: 32 }} />}
          <button className="btn sm ghost" onClick={reset}>Ще раз</button>
        </>
      )}
      {phase === 'silent' && (<><div className="note warn">Сигналу немає — перевірте, що мікрофон підключений і вибраний правильний пристрій.</div><button className="btn sm" onClick={startTest}>Спробувати ще</button></>)}
      {phase === 'error' && (<><div className="note err">{errMsg || 'Помилка мікрофона'}</div><button className="btn sm ghost" onClick={reset}>Закрити</button></>)}
    </div>
  );
}

// Live mic spectrum
function MicMeter({ analyserRef, active }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const g = canvas.getContext('2d');
    let raf; let data;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.clientWidth * dpr, H = canvas.clientHeight * dpr;
      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;
      g.clearRect(0, 0, W, H);
      const color = getComputedStyle(canvas).color;
      const BARS = 64;
      const an = analyserRef.current;
      if (!an || !active) { g.fillStyle = color; g.globalAlpha = 0.18; for (let i = 0; i < BARS; i++) g.fillRect(i * (W / BARS) + 1, H / 2 - 1, W / BARS - 2, 2); return; }
      if (!data || data.length !== an.frequencyBinCount) data = new Uint8Array(an.frequencyBinCount);
      an.getByteFrequencyData(data);
      const step = Math.max(1, Math.floor(data.length / BARS));
      g.globalAlpha = 1; g.fillStyle = color;
      for (let i = 0; i < BARS; i++) {
        let s = 0; for (let j = 0; j < step; j++) s += data[i * step + j];
        const h = Math.max(2, (s / step / 255) * H);
        g.fillRect(i * (W / BARS) + 1, H / 2 - h / 2, W / BARS - 2, h);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [active, analyserRef]);
  return <canvas ref={ref} className="kara-meter" aria-hidden="true" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Song picker
// ─────────────────────────────────────────────────────────────────────────────
function SongPicker({ onSelect }) {
  const [q, setQ] = useState('');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['tracks-all-karaoke'],
    queryFn: () => tracksApi.getAll(1, 500).then((r) => r.data.filter((t) => t.mediaType !== 'video')),
    staleTime: 60_000,
  });
  const tracks = useMemo(() => {
    const all = data ?? [];
    const s = q.trim().toLowerCase();
    return s ? all.filter((t) => t.title?.toLowerCase().includes(s) || t.artistName?.toLowerCase().includes(s)) : all;
  }, [data, q]);

  return (
    <div className="page narrow">
      <header className="page-head">
        <h1 className="display">Караоке</h1>
        <p className="page-lede">Оберіть пісню, увімкніть мікрофон — слова підсвічуються в такт. Можна записати себе, перезаписати окремий рядок і зберегти результат.</p>
        <div className="search-field" style={{ maxWidth: 420 }}><Search size={16} /><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пісня або виконавець" aria-label="Пошук пісні" /></div>
      </header>
      {isLoading && <p className="muted">Завантажуємо треки…</p>}
      {isError && <div className="note err">Не вдалося завантажити каталог. Перевірте з’єднання.</div>}
      <div className="rows no-album">
        {tracks.map((t, i) => (
          <div key={t.id} className="row" onClick={() => onSelect(t)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onSelect(t)}>
            <div className="row-idx"><span className="n">{i + 1}</span></div>
            <div className="row-main"><Cover track={t} className="row-art" /><div className="row-text"><div className="row-title"><span className="trunc">{t.title}</span></div><div className="row-sub">{t.artistName}</div></div></div>
            <span className="mic-go"><Mic size={16} /></span>
            <div className="row-time" />
          </div>
        ))}
        {!isLoading && tracks.length === 0 && <p className="muted" style={{ padding: 16 }}>Нічого не знайдено.</p>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage
// ─────────────────────────────────────────────────────────────────────────────
const EFFECTS = [
  { id: 'none', label: 'Чисто' }, { id: 'studio', label: 'Студія' }, { id: 'room', label: 'Кімната' },
  { id: 'hall', label: 'Зал' }, { id: 'echo', label: 'Ехо' }, { id: 'double', label: 'Дубль' },
];

function KaraokeStage({ track, onBack }) {
  const [playing, setPlaying] = useState(false);
  const [curTime, setCurTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [trackVol, setTrackVol] = useState(0.8);
  const [micVol, setMicVol] = useState(0.9);
  const [monitoring, setMonitor] = useState(true);
  const [effect, setEffect] = useState('studio');
  const [micOn, setMicOn] = useState(false);
  const [micDevices, setMicDevices] = useState([]);
  const [selMic, setSelMic] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordings, setRecordings] = useState([]);
  const [punchTime, setPunchTime] = useState(null);
  const [punchIdx, setPunchIdx] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const audioRef = useRef(null);
  const ctxRef = useRef(null);
  const trackSrcRef = useRef(null);
  const trackGainRef = useRef(null);
  const recDestRef = useRef(null);
  const micSrcRef = useRef(null);
  const micGainRef = useRef(null);
  const micAnalRef = useRef(null);
  const monGainRef = useRef(null);
  const fxNodesRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const punchTimeRef = useRef(null);
  const punchIdxRef = useRef(null);
  const recordingsRef = useRef([]);

  useEffect(() => { punchTimeRef.current = punchTime; }, [punchTime]);
  useEffect(() => { punchIdxRef.current = punchIdx; }, [punchIdx]);
  useEffect(() => { recordingsRef.current = recordings; }, [recordings]);

  const { lines: parsedLyrics, synced: hasTimed } = useLyrics(track);

  const curIdx = useMemo(() => {
    if (!hasTimed || !parsedLyrics.length) return 0;
    let idx = 0;
    for (let i = 0; i < parsedLyrics.length; i++) { if (parsedLyrics[i].time <= curTime) idx = i; else break; }
    return idx;
  }, [curTime, parsedLyrics, hasTimed]);

  const lineFillPct = useMemo(() => {
    if (!hasTimed || !parsedLyrics.length) return 0;
    const cur = parsedLyrics[curIdx], next = parsedLyrics[curIdx + 1];
    if (!cur || !next) return 100;
    return Math.min(100, Math.max(0, ((curTime - cur.time) / (next.time - cur.time)) * 100));
  }, [curTime, curIdx, parsedLyrics, hasTimed]);

  // The main player yields to the stage; list inputs even before permission (labels fill in later)
  useEffect(() => {
    usePlayerStore.getState().pause();
    navigator.mediaDevices?.enumerateDevices?.()
      .then((all) => { const inp = all.filter((d) => d.kind === 'audioinput'); if (inp.length) { setMicDevices(inp); setSelMic(inp[0].deviceId); } })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const a = audioRef.current; if (!a) return;
    const onTime = () => setCurTime(a.currentTime);
    const onDur = () => setDur(a.duration);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener('timeupdate', onTime); a.addEventListener('durationchange', onDur);
    a.addEventListener('play', onPlay); a.addEventListener('pause', onPause);
    return () => { a.removeEventListener('timeupdate', onTime); a.removeEventListener('durationchange', onDur); a.removeEventListener('play', onPlay); a.removeEventListener('pause', onPause); };
  }, []);

  useEffect(() => { if (trackGainRef.current) trackGainRef.current.gain.value = trackVol; }, [trackVol]);
  useEffect(() => { if (micGainRef.current) micGainRef.current.gain.value = micVol; }, [micVol]);
  useEffect(() => { if (monGainRef.current) monGainRef.current.gain.value = monitoring ? 0.9 : 0; }, [monitoring]);

  const stopMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try { micSrcRef.current?.disconnect(); } catch { /* gone */ }
    try { fxNodesRef.current?.input?.disconnect(); fxNodesRef.current?.output?.disconnect(); } catch { /* gone */ }
    micSrcRef.current = micGainRef.current = monGainRef.current = micAnalRef.current = fxNodesRef.current = null;
    setMicOn(false);
  }, []);

  useEffect(() => () => {
    stopMic();
    if (ctxRef.current?.state !== 'closed') ctxRef.current?.close();
    audioRef.current?.pause();
  }, [stopMic]);

  // One AudioContext + one record destination: both the track and the vocal chain feed it
  const getCtx = useCallback(() => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctxRef.current = ctx;
      recDestRef.current = ctx.createMediaStreamDestination();
    }
    return ctxRef.current;
  }, []);

  const connectTrack = useCallback(() => {
    if (trackSrcRef.current) return;
    const ctx = getCtx();
    const src = ctx.createMediaElementSource(audioRef.current);
    const gain = ctx.createGain(); gain.gain.value = trackVol;
    src.connect(gain); gain.connect(ctx.destination);
    if (recDestRef.current) gain.connect(recDestRef.current);
    trackSrcRef.current = src; trackGainRef.current = gain;
  }, [getCtx, trackVol]);

  const connectMic = useCallback(async (deviceId, fxId) => {
    let ctx;
    try { ctx = getCtx(); if (ctx.state === 'suspended') await ctx.resume(); }
    catch (e) { toast.error(`Помилка аудіо: ${e.message}`); return; }
    stopMic();
    if (!navigator.mediaDevices?.getUserMedia) { toast.error('Мікрофон недоступний у цьому контексті. Відкрийте застосунок через HTTPS або localhost.'); return; }

    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true }); }
    catch (e1) {
      if (e1.name === 'NotAllowedError' || e1.name === 'PermissionDeniedError') { toast.error('Мікрофон заблоковано. Дозвольте доступ у налаштуваннях сайту і перезавантажте сторінку.'); return; }
      if (e1.name === 'NotFoundError' || e1.name === 'DevicesNotFoundError') { toast.error('Мікрофон не знайдено. Підключіть його й спробуйте ще раз.'); return; }
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch (e2) { toast.error(`Мікрофон недоступний: ${e2.message || e2.name}`); return; }
    }
    streamRef.current = stream;
    try { const all = await navigator.mediaDevices.enumerateDevices(); const inp = all.filter((d) => d.kind === 'audioinput'); setMicDevices(inp); if (!deviceId && inp.length) setSelMic(inp[0].deviceId); } catch { /* labels optional */ }

    try {
      const src = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain(); gain.gain.value = micVol;
      const anal = ctx.createAnalyser(); anal.fftSize = 512; anal.smoothingTimeConstant = 0.75;
      const fx = buildFx(ctx, fxId ?? effect);
      const mon = ctx.createGain(); mon.gain.value = monitoring ? 0.9 : 0;
      src.connect(gain); gain.connect(anal); anal.connect(fx.input); fx.output.connect(mon); mon.connect(ctx.destination);
      if (recDestRef.current) fx.output.connect(recDestRef.current);
      micSrcRef.current = src; micGainRef.current = gain; micAnalRef.current = anal; fxNodesRef.current = fx; monGainRef.current = mon;
    } catch (e) { console.warn('Mic chain warning:', e.message); }
    setMicOn(true);
    toast.success('Мікрофон підключено');
  }, [getCtx, stopMic, micVol, monitoring, effect]);

  const toggleMic = useCallback(async () => {
    if (micOn) { stopMic(); return; }
    try { connectTrack(); } catch { /* mic works without the track tap */ }
    await connectMic(selMic, effect);
  }, [micOn, stopMic, connectMic, connectTrack, selMic, effect]);

  const changeEffect = useCallback((id) => { setEffect(id); if (micOn) connectMic(selMic, id); }, [micOn, connectMic, selMic]);
  const changeMicDevice = useCallback(async (id) => { setSelMic(id); if (micOn) await connectMic(id, effect); }, [micOn, connectMic, effect]);

  const togglePlay = useCallback(async () => {
    const ctx = getCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    try { connectTrack(); } catch { /* CORS — playback still works */ }
    const a = audioRef.current;
    if (a.paused) a.play().catch((e) => toast.error(`Не вдалося відтворити: ${e.message}`)); else a.pause();
  }, [getCtx, connectTrack]);

  const handleSeek = useCallback((e) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (audioRef.current && dur) audioRef.current.currentTime = ((e.clientX - r.left) / r.width) * dur;
  }, [dur]);

  const handleLyricClick = useCallback((time) => {
    setPunchTime(time);
    setPunchIdx(recordings.length > 0 ? recordings.length - 1 : null);
    if (audioRef.current) audioRef.current.currentTime = time;
    toast(`Перезапис з ${formatTime(time)}`);
  }, [recordings.length]);
  const clearPunch = useCallback(() => { setPunchTime(null); setPunchIdx(null); }, []);

  const startRec = useCallback(() => {
    try { getCtx(); } catch { /* shown below */ }
    try { connectTrack(); } catch { /* optional */ }
    if (!recDestRef.current) { toast.error('Спершу увімкніть мікрофон'); return; }
    const pt = punchTimeRef.current;
    if (pt !== null && audioRef.current) audioRef.current.currentTime = pt;

    chunksRef.current = [];
    try {
      const rec = new MediaRecorder(recDestRef.current.stream, { mimeType: MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : undefined });
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        const newBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const latestPt = punchTimeRef.current;
        const latestPi = punchIdxRef.current;
        const prev = recordingsRef.current;
        if (latestPt !== null && latestPi !== null && prev[latestPi]) {
          toast('Об’єднуємо записи…', { duration: 2000 });
          try {
            const merged = await mergePunchIn(prev[latestPi].blob, latestPt, newBlob);
            const url = URL.createObjectURL(merged);
            setRecordings((p) => p.map((r, i) => (i === latestPi ? { ...r, blob: merged, url, title: `${r.title} (пересп.)` } : r)));
          } catch (err) {
            toast.error(`Не вдалося об’єднати: ${err.message}`);
            setRecordings((p) => [...p, { blob: newBlob, url: URL.createObjectURL(newBlob), title: `${track.title} — дубль ${p.length + 1}`, ts: Date.now() }]);
          }
        } else {
          setRecordings((p) => [...p, { blob: newBlob, url: URL.createObjectURL(newBlob), title: `${track.title} — дубль ${p.length + 1}`, ts: Date.now() }]);
          toast.success('Запис збережено');
        }
        clearPunch();
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      if (audioRef.current?.paused) togglePlay();
    } catch { toast.error('Запис не підтримується в цьому браузері'); }
  }, [getCtx, connectTrack, track.title, clearPunch, togglePlay]);

  const stopRec = useCallback(() => { if (recorderRef.current?.state === 'recording') recorderRef.current.stop(); setRecording(false); }, []);
  const downloadRec = useCallback((rec) => { const a = document.createElement('a'); a.href = rec.url; a.download = `${rec.title}.webm`; a.click(); }, []);

  const lyricsWindow = useMemo(() => Array.from({ length: 7 }, (_, i) => { const offset = i - 3; return { idx: curIdx + offset, line: parsedLyrics[curIdx + offset] ?? null, offset }; }), [parsedLyrics, curIdx]);

  return (
    <div className="kara">
      <audio ref={audioRef} src={streamUrl(track.id)} crossOrigin="anonymous" preload="auto" />

      <div className="kara-top">
        <button className="ibtn" onClick={onBack} aria-label="Назад до списку"><ChevronLeft size={20} /></button>
        <Cover track={track} style={{ width: 36 }} />
        <div style={{ minWidth: 0, flex: 1 }}><div className="trunc" style={{ fontWeight: 560 }}>{track.title}</div><div className="trunc muted" style={{ fontSize: '0.78rem' }}>{track.artistName}</div></div>
        {punchTime !== null && <span className="tag accent" style={{ height: 24, padding: '0 8px' }}><Scissors size={11} style={{ marginRight: 5 }} /> перезапис з {formatTime(punchTime)} <button onClick={clearPunch} aria-label="Скасувати" style={{ marginLeft: 6, display: 'inline-flex' }}><X size={11} /></button></span>}
        <button className={`ibtn ${showSettings ? 'on' : ''}`} onClick={() => setShowSettings((p) => !p)} aria-label="Налаштування" aria-pressed={showSettings}><Settings size={18} /></button>
      </div>

      <div className="kara-main">
        <div className="kara-lyrics">
          {parsedLyrics.length === 0 ? (
            <div className="empty" style={{ alignItems: 'center', textAlign: 'center' }}><Disc3 size={40} className="muted" /><div className="h2">Тексту немає</div><p>Співайте, що хочете — це фристайл.</p></div>
          ) : (
            <div className="kara-window">
              {lyricsWindow.map(({ idx, line, offset }) => {
                if (!line) return <div key={`e${offset}`} style={{ height: offset === 0 ? 80 : 36 }} />;
                const isCur = offset === 0;
                const dist = Math.abs(offset);
                const isPunch = punchTime !== null && line.time <= punchTime && (parsedLyrics[idx + 1]?.time ?? Infinity) > punchTime;
                return (
                  <div
                    key={idx} className={`kara-line ${isCur ? 'cur' : ''} ${isPunch ? 'punch' : ''}`}
                    style={{ opacity: isCur ? 1 : Math.max(0.12, 1 - dist * 0.26), transform: `scale(${isCur ? 1 : Math.max(0.84, 1 - dist * 0.05)})` }}
                    onClick={() => hasTimed && handleLyricClick(line.time)}
                    title={hasTimed ? `Перезаписати з цього місця (${formatTime(line.time)})` : undefined}
                  >
                    {isCur && hasTimed ? <LyricLineWords text={line.text} fillPct={lineFillPct} /> : line.text}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {showSettings && (
          <aside className="kara-side">
            <div className="label">Налаштування</div>
            <div className="field">
              <label htmlFor="mic-dev">Мікрофон</label>
              {micDevices.length === 0 ? <div className="note">Мікрофон не знайдено</div> : (
                <select id="mic-dev" className="select" value={selMic} onChange={(e) => changeMicDevice(e.target.value)}>
                  {micDevices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || (d.deviceId === 'default' ? 'Мікрофон за замовчуванням' : `Мікрофон ${i + 1}`)}</option>)}
                </select>
              )}
            </div>
            <label className="mode"><span className="mode-text"><span className="mode-name">Моніторинг</span><span className="mode-note">чути себе в навушниках</span></span><span className="switch"><input type="checkbox" checked={monitoring} onChange={(e) => setMonitor(e.target.checked)} /><i /></span></label>
            <div className="axis"><span className="axis-name">Трек</span><span className="axis-val">{Math.round(trackVol * 100)}</span><input type="range" className="slider" min="0" max="1" step="0.01" value={trackVol} style={{ '--p': `${trackVol * 100}%` }} onChange={(e) => setTrackVol(+e.target.value)} aria-label="Гучність треку" /></div>
            <div className="axis"><span className="axis-name">Вокал</span><span className="axis-val">{Math.round(micVol * 100)}</span><input type="range" className="slider" min="0" max="1" step="0.01" value={micVol} style={{ '--p': `${micVol * 100}%` }} onChange={(e) => setMicVol(+e.target.value)} aria-label="Гучність вокалу" /></div>
            <MicTestWidget />
          </aside>
        )}
      </div>

      <div className="kara-bottom">
        <MicMeter analyserRef={micAnalRef} active={micOn} />

        <div className="kara-seek">
          <span className="mono muted">{formatTime(curTime)}</span>
          <div className="kara-bar" onClick={handleSeek} role="slider" aria-label="Перемотка" aria-valuenow={Math.round(curTime)} aria-valuemax={Math.round(dur)} tabIndex={0}>
            <i style={{ width: `${dur > 0 ? (curTime / dur) * 100 : 0}%` }} />
            {punchTime !== null && dur > 0 && <b style={{ left: `${(punchTime / dur) * 100}%` }} />}
          </div>
          <span className="mono muted">{formatTime(dur)}</span>
        </div>

        <div className="chips">{EFFECTS.map((ef) => <button key={ef.id} className={`chip ${effect === ef.id ? 'on' : ''}`} onClick={() => changeEffect(ef.id)}>{ef.label}</button>)}</div>

        <div className="kara-transport">
          <button className={`btn lg icon ${micOn ? 'on' : ''}`} onClick={toggleMic} aria-pressed={micOn} aria-label={micOn ? 'Вимкнути мікрофон' : 'Увімкнути мікрофон'}>{micOn ? <Mic size={20} /> : <MicOff size={20} />}</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn icon" onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, curTime - 10); }} aria-label="Назад 10 секунд"><span className="mono">−10</span></button>
            <button className="playbtn lg" onClick={togglePlay} aria-label={playing ? 'Пауза' : 'Відтворити'}>{playing ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" style={{ marginLeft: 3 }} />}</button>
            <button className="btn icon" onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.min(dur, curTime + 10); }} aria-label="Вперед 10 секунд"><span className="mono">+10</span></button>
          </div>
          <button className={`btn lg icon rec ${recording ? 'on' : ''}`} onClick={recording ? stopRec : startRec} aria-pressed={recording} aria-label={recording ? 'Зупинити запис' : 'Почати запис'}>{recording ? <Square size={18} fill="currentColor" /> : <Circle size={20} fill="currentColor" />}</button>
        </div>

        {recordings.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="label">Записи — клацніть на рядок тексту, щоб обрати точку перезапису</div>
            {recordings.map((rec, i) => (
              <div key={rec.ts} className="kara-rec">
                <span className="trunc" style={{ flex: 1, fontSize: '0.85rem', fontWeight: 520 }}>{rec.title}</span>
                <audio src={rec.url} controls style={{ height: 30, maxWidth: 200 }} />
                <button className="ibtn sm" onClick={() => { setPunchTime(null); setPunchIdx(i); toast('Оберіть рядок тексту, з якого перезаписати'); }} aria-label="Перезаписати фрагмент"><Scissors size={15} /></button>
                <button className="ibtn sm" onClick={() => downloadRec(rec)} aria-label="Завантажити"><Download size={15} /></button>
                <button className="ibtn sm" onClick={() => setRecordings((p) => p.filter((_, j) => j !== i))} aria-label="Видалити"><X size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function KaraokePage() {
  const [track, setTrack] = useState(null);
  return track ? <KaraokeStage track={track} onBack={() => setTrack(null)} /> : <SongPicker onSelect={setTrack} />;
}
