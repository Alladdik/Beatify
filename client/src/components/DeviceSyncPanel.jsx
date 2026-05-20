import React, { useState, useEffect, useRef } from 'react';
import * as signalR from '@microsoft/signalr';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import { Monitor, Smartphone, X, ArrowRightLeft } from 'lucide-react';

export default function DeviceSyncPanel({ onClose }) {
  const [devices, setDevices] = useState([]);
  const [connected, setConnected] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const hubRef = useRef(null);
  const { user } = useAuthStore();

  useEffect(() => {
    const deviceName = `${navigator.platform || 'Пристрій'} — ${new Date().toLocaleTimeString('uk', { hour: '2-digit', minute: '2-digit' })}`;

    const hub = new signalR.HubConnectionBuilder()
      .withUrl('http://localhost:5000/hubs/devicesync', {
        skipNegotiation: true,
        transport: signalR.HttpTransportType.WebSockets,
      })
      .withAutomaticReconnect()
      .build();
    hubRef.current = hub;

    hub.on('DevicesUpdated', (list) => setDevices(list || []));

    // When another device requests handoff from us → send our current state
    hub.on('HandoffRequested', async (requesterConnectionId) => {
      const state = usePlayerStore.getState();
      await hub.invoke('SendHandoffState', requesterConnectionId, {
        currentTrack: state.currentTrack,
        progress: state.progress,
        isPlaying: state.isPlaying,
        queue: state.queue,
        queueIndex: state.queueIndex,
        volume: state.volume,
      });
    });

    // When we receive a handoff → apply the state
    hub.on('HandoffReceived', (state) => {
      if (!state?.currentTrack) return;
      const store = usePlayerStore.getState();
      if (state.currentTrack.isExternal) {
        // For external tracks, we'd need the stream URL which expires — skip
        return;
      }
      store.setTrack(state.currentTrack, state.queue || [], state.queueIndex || 0);
      setTimeout(() => {
        if (!state.isPlaying) store.togglePlay(); // pause if source wasn't playing
        if (state.progress > 3) store.seek(state.progress);
      }, 1000);
      setTransferring(false);
    });

    hub.start().then(() => {
      setConnected(true);
      hub.invoke('RegisterDevice', deviceName).catch(console.error);
    }).catch(console.error);

    // Broadcast state changes
    const unsub = usePlayerStore.subscribe((state) => {
      if (hub.state === signalR.HubConnectionState.Connected) {
        hub.invoke('BroadcastState', {
          currentTrack: state.currentTrack,
          isPlaying: state.isPlaying,
          progress: state.progress,
        }).catch(() => {});
      }
    });

    return () => {
      unsub();
      hub.stop();
    };
  }, []);

  const requestHandoff = async (device) => {
    if (!hubRef.current) return;
    setTransferring(true);
    await hubRef.current.invoke('RequestHandoff', device.connectionId);
    setTimeout(() => setTransferring(false), 5000); // timeout
  };

  const myConnId = hubRef.current?.connectionId;
  const otherDevices = devices.filter(d => d.connectionId !== myConnId);

  return (
    <div style={{
      position: 'fixed', bottom: 'var(--player-height)', right: 0, width: 320, height: '50vh',
      background: 'var(--bg-elevated)', borderLeft: '1px solid var(--border)', borderTop: '1px solid var(--border)',
      borderRadius: '16px 0 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column', zIndex: 50,
      animation: 'slideInRight 0.22s cubic-bezier(0.2,0.8,0.2,1)',
    }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <ArrowRightLeft size={16} color="var(--accent)" /> Мережева передача
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
          <X size={18} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {connected ? '🟢 Підключено' : '🔴 Підключення...'} · {devices.length} пристрій(ів) в мережі
        </div>

        {/* This device */}
        <div style={{ padding: '12px 14px', background: 'rgba(29,185,84,0.08)', border: '1px solid rgba(29,185,84,0.2)', borderRadius: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>Цей пристрій</div>
          <div style={{ fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Monitor size={14} /> {navigator.platform || 'Браузер'}
          </div>
        </div>

        {/* Other devices */}
        {otherDevices.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            <Smartphone size={32} style={{ margin: '0 auto 10px', opacity: 0.4, display: 'block' }} />
            Відкрийте Beatify на іншому пристрої або вкладці, щоб передати відтворення
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>Інші пристрої</div>
            {otherDevices.map((d, i) => (
              <div key={d.connectionId || i} style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <Monitor size={14} color="var(--text-muted)" />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{d.name}</span>
                </div>
                <button
                  onClick={() => requestHandoff(d)}
                  disabled={transferring}
                  style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#000', fontWeight: 700, fontSize: 11, cursor: transferring ? 'wait' : 'pointer', opacity: transferring ? 0.6 : 1 }}>
                  {transferring ? '...' : 'Перейняти'}
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
