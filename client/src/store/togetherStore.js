import { create } from 'zustand';
import toast from 'react-hot-toast';
import { buildHub, signalR } from '../lib/hubs';
import { useAuthStore } from './authStore';
import { usePlayerStore } from './playerStore';
import { trackKey } from '../lib/tracks';

// Listen Together: a room is a SignalR group. Everyone is equal — whoever presses play, skips or
// seeks moves the whole room. A heartbeat from the host (first one in) corrects drift.
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newRoomCode = () => Array.from({ length: 4 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');

let hub = null;
let heartbeat = null;
let unsub = null;
let applying = 0;       // timestamp until which local changes are the echo of a remote one
let lastKey = '';
let lastPlaying = false;
let seekHandler = null;

const quiet = () => { applying = Date.now() + 1500; };
const echoing = () => Date.now() < applying;
const selfId = () => useAuthStore.getState().user?.id ?? 0;

function snapshot(type = 'snapshot') {
  const s = usePlayerStore.getState();
  return {
    type,
    from: selfId(),
    track: s.currentTrack,
    queue: s.queue.slice(0, 120),
    index: s.queueIndex,
    progress: s.audio.currentTime,
    isPlaying: s.isPlaying,
  };
}

async function applyRemote(msg) {
  const p = usePlayerStore.getState();
  quiet();
  if (msg.type === 'snapshot' || msg.type === 'track') {
    if (!msg.track) return;
    const queue = msg.queue?.length ? msg.queue : [msg.track];
    const same = p.currentTrack && trackKey(p.currentTrack) === trackKey(msg.track);
    if (!same) {
      await p.playQueue(queue, Math.min(msg.index ?? 0, queue.length - 1));
      quiet();
    }
    if (msg.progress > 1.5 || same) setTimeout(() => usePlayerStore.getState().seek(msg.progress + (msg.isPlaying ? 0.35 : 0)), same ? 0 : 900);
    if (msg.isPlaying === false) setTimeout(() => { quiet(); usePlayerStore.getState().pause(); }, same ? 0 : 1100);
    else if (same && p.audio.paused) p.togglePlay();
  } else if (msg.type === 'play') {
    if (p.audio.paused) p.togglePlay();
    if (Math.abs(p.audio.currentTime - msg.progress) > 1.2) p.seek(msg.progress + 0.2);
  } else if (msg.type === 'pause') {
    p.pause();
    if (Math.abs(p.audio.currentTime - msg.progress) > 0.8) p.seek(msg.progress);
  } else if (msg.type === 'seek') {
    p.seek(msg.progress + (p.isPlaying ? 0.2 : 0));
  } else if (msg.type === 'beat') {
    if (!p.currentTrack || trackKey(p.currentTrack) !== msg.key) return; // different track — wait for a real 'track' event
    if (msg.isPlaying && p.audio.paused) p.togglePlay();
    if (!msg.isPlaying && !p.audio.paused) p.pause();
    const drift = Math.abs(p.audio.currentTime - (msg.progress + (msg.isPlaying ? 0.2 : 0)));
    if (drift > 1.8) p.seek(msg.progress + 0.2);
  }
}

export const useTogetherStore = create((set, get) => ({
  room: '',
  members: [],
  connected: false,
  isHost: false,
  busy: false,

  join: async (code, host = false) => {
    code = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,12}$/.test(code)) { toast.error('Код кімнати — від 3 до 12 літер або цифр'); return false; }
    if (get().room) await get().leave();
    set({ busy: true });
    hub = buildHub('listentogether');

    hub.on('MembersUpdated', (list) => set({ members: Array.isArray(list) ? list : [] }));
    hub.on('ReceiveState', (msg) => {
      if (!msg || msg.from === selfId()) return;
      if (msg.type === 'hello') {
        // A newcomer asks where we are. The host answers at once, others only if the host is silent.
        if (get().isHost) hub?.invoke('SyncState', get().room, snapshot('snapshot')).catch(() => {});
        return;
      }
      applyRemote(msg);
    });
    hub.onreconnected(async () => { try { await hub.invoke('JoinRoom', code, ''); await hub.invoke('SyncState', code, { type: 'hello', from: selfId() }); } catch { /* retry on next beat */ } });
    hub.onclose(() => set({ connected: false }));

    try {
      await hub.start();
      await hub.invoke('JoinRoom', code, useAuthStore.getState().user?.name ?? 'Гість');
    } catch {
      hub = null;
      set({ busy: false, connected: false });
      toast.error('Не вдалося підключитися до кімнати');
      return false;
    }
    set({ room: code, connected: true, isHost: host, busy: false });

    const send = (msg) => { if (hub?.state === signalR.HubConnectionState.Connected) hub.invoke('SyncState', code, { ...msg, from: selfId() }).catch(() => {}); };

    // Local → room
    const p0 = usePlayerStore.getState();
    lastKey = p0.currentTrack ? trackKey(p0.currentTrack) : '';
    lastPlaying = p0.isPlaying;
    unsub = usePlayerStore.subscribe((s) => {
      if (echoing()) { lastKey = s.currentTrack ? trackKey(s.currentTrack) : ''; lastPlaying = s.isPlaying; return; }
      const key = s.currentTrack ? trackKey(s.currentTrack) : '';
      if (key !== lastKey) {
        lastKey = key; lastPlaying = s.isPlaying;
        if (key) send(snapshot('track'));
      } else if (s.isPlaying !== lastPlaying) {
        lastPlaying = s.isPlaying;
        send({ type: s.isPlaying ? 'play' : 'pause', progress: s.audio.currentTime });
      }
    });
    seekHandler = () => { if (!echoing()) send({ type: 'seek', progress: usePlayerStore.getState().audio.currentTime }); };
    usePlayerStore.getState().audio.addEventListener('seeked', seekHandler);

    heartbeat = setInterval(() => {
      if (!get().isHost) return;
      const s = usePlayerStore.getState();
      if (s.currentTrack) send({ type: 'beat', key: trackKey(s.currentTrack), progress: s.audio.currentTime, isPlaying: s.isPlaying });
    }, 4000);

    // Ask the room where it is
    if (!host) send({ type: 'hello' });
    toast.success(host ? `Кімната ${code} створена` : `Ви в кімнаті ${code}`);
    return true;
  },

  create: () => get().join(newRoomCode(), true),

  leave: async () => {
    clearInterval(heartbeat); heartbeat = null;
    unsub?.(); unsub = null;
    if (seekHandler) { usePlayerStore.getState().audio.removeEventListener('seeked', seekHandler); seekHandler = null; }
    const h = hub; hub = null;
    const room = get().room;
    set({ room: '', members: [], connected: false, isHost: false, busy: false });
    try { await h?.invoke('LeaveRoom', room); } catch { /* gone */ }
    try { await h?.stop(); } catch { /* gone */ }
  },
}));
