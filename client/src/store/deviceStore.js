import { create } from 'zustand';
import toast from 'react-hot-toast';
import { buildHub, signalR } from '../lib/hubs';
import { useAuthStore } from './authStore';
import { usePlayerStore } from './playerStore';

// Cross-device handoff: every signed-in device registers; any of them can pull playback from another.
function deviceName() {
  if (window.electronAPI) return 'Beatify для ПК';
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Пристрій';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'браузер';
  return `${os} · ${br}`;
}

let hub = null;
let unsubPlayer = null;
let broadcastTimer = null;

function snapshot() {
  const s = usePlayerStore.getState();
  return {
    currentTrack: s.currentTrack,
    queue: s.queue.slice(0, 200),
    queueIndex: s.queueIndex,
    progress: s.audio.currentTime,
    isPlaying: s.isPlaying,
    volume: s.volume,
  };
}

export const useDeviceStore = create((set) => ({
  devices: [],
  connected: false,
  myId: null,
  transferring: false,

  connect: async () => {
    if (hub || !useAuthStore.getState().token) return;
    hub = buildHub('devicesync');

    hub.on('DevicesUpdated', (list) => set({ devices: list || [], myId: hub?.connectionId ?? null }));

    // Another device wants our playback → send it
    hub.on('HandoffRequested', async (requester) => {
      const state = snapshot();
      try { await hub.invoke('SendHandoffState', requester, state); } catch { /* requester gone */ }
      if (state.isPlaying) usePlayerStore.getState().pause();
      toast('Відтворення передано на інший пристрій');
    });

    // We pulled playback from another device → apply it
    hub.on('HandoffReceived', async (state) => {
      set({ transferring: false });
      if (!state?.currentTrack) return;
      const p = usePlayerStore.getState();
      const queue = state.queue?.length ? state.queue : [state.currentTrack];
      await p.playQueue(queue, Math.min(state.queueIndex ?? 0, queue.length - 1));
      if (state.progress > 2) setTimeout(() => usePlayerStore.getState().seek(state.progress), 700);
      if (state.volume != null) p.setVolume(state.volume);
      if (!state.isPlaying) setTimeout(() => usePlayerStore.getState().pause(), 900);
      toast.success('Відтворення перенесено сюди');
    });

    hub.onreconnected(() => hub.invoke('RegisterDevice', deviceName()).catch(() => {}));
    hub.onclose(() => set({ connected: false }));

    try {
      await hub.start();
      set({ connected: true, myId: hub.connectionId });
      await hub.invoke('RegisterDevice', deviceName());
    } catch {
      hub = null;
      set({ connected: false });
      return;
    }

    // Tell the other devices what we're playing — only on real changes, never per tick
    let last = '';
    unsubPlayer = usePlayerStore.subscribe((s) => {
      const key = `${s.currentTrack?.id ?? s.currentTrack?.key}|${s.isPlaying}`;
      if (key === last) return;
      last = key;
      clearTimeout(broadcastTimer);
      broadcastTimer = setTimeout(() => {
        if (hub?.state === signalR.HubConnectionState.Connected) {
          hub.invoke('BroadcastState', { currentTrack: s.currentTrack, isPlaying: s.isPlaying }).catch(() => {});
        }
      }, 300);
    });
  },

  disconnect: async () => {
    unsubPlayer?.(); unsubPlayer = null;
    clearTimeout(broadcastTimer);
    const h = hub; hub = null;
    set({ devices: [], connected: false, myId: null });
    try { await h?.stop(); } catch { /* already stopped */ }
  },

  takeOver: async (device) => {
    if (!hub || hub.state !== signalR.HubConnectionState.Connected) return;
    set({ transferring: true });
    try { await hub.invoke('RequestHandoff', device.connectionId); }
    catch { toast.error('Не вдалося зв’язатися з пристроєм'); }
    setTimeout(() => set({ transferring: false }), 6000);
  },
}));
