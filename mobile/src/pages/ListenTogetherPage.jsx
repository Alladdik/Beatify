import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as signalR from '@microsoft/signalr';
import { Users, Copy, LogIn, LogOut, Music2 } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default function ListenTogetherPage() {
  const { user } = useAuthStore();
  const { currentTrack, isPlaying, progress, seek, setTrack, queue, queueIndex } = usePlayerStore();

  const [connection, setConnection] = useState(null);
  const [connected, setConnected] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [members, setMembers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const connectionRef = useRef(null);
  const syncIntervalRef = useRef(null);
  const isSyncingRef = useRef(false);

  const userName = user?.name || 'Гість';

  const buildConnection = useCallback(() => {
    return new signalR.HubConnectionBuilder()
      .withUrl(`http://${window.location.hostname}:5000/hubs/listentogether`, {
        skipNegotiation: true,
        transport: signalR.HttpTransportType.WebSockets,
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();
  }, []);

  const startSync = useCallback((conn, rId) => {
    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    syncIntervalRef.current = setInterval(() => {
      if (!conn || conn.state !== signalR.HubConnectionState.Connected) return;
      const state = usePlayerStore.getState();
      conn.invoke('SyncState', rId, {
        progress: state.progress,
        isPlaying: state.isPlaying,
        trackId: state.currentTrack?.id ?? null,
        trackTitle: state.currentTrack?.title ?? null,
        senderName: userName,
      }).catch(() => {});
    }, 3000);
  }, [userName]);

  const joinRoom = useCallback(async (code, conn) => {
    const c = conn || connectionRef.current;
    if (!c || c.state !== signalR.HubConnectionState.Connected) return;
    try {
      await c.invoke('JoinRoom', code, userName);
      setRoomId(code);
      startSync(c, code);
      toast.success(`Приєднались до кімнати ${code}`);
    } catch (e) {
      toast.error('Не вдалося приєднатися до кімнати');
    }
  }, [userName, startSync]);

  const connect = useCallback(async () => {
    if (connectionRef.current) return;
    const conn = buildConnection();
    connectionRef.current = conn;

    conn.on('MembersUpdated', (memberList) => {
      setMembers(Array.isArray(memberList) ? memberList : []);
    });

    conn.on('ReceiveState', (state) => {
      if (state.senderName === userName) return;
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      const store = usePlayerStore.getState();
      if (Math.abs(state.progress - store.progress) > 3) {
        seek(state.progress);
      }
      setTimeout(() => { isSyncingRef.current = false; }, 1000);
    });

    conn.onreconnected(() => {
      setConnected(true);
      if (roomId) joinRoom(roomId, conn);
    });

    conn.onclose(() => {
      setConnected(false);
      setMembers([]);
    });

    try {
      await conn.start();
      setConnection(conn);
      setConnected(true);
    } catch (e) {
      toast.error('Не вдалося підключитися до сервера');
      connectionRef.current = null;
    }
  }, [buildConnection, joinRoom, roomId, seek, userName]);

  const disconnect = useCallback(async () => {
    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    if (connectionRef.current) {
      try { await connectionRef.current.stop(); } catch {}
      connectionRef.current = null;
    }
    setConnection(null);
    setConnected(false);
    setRoomId('');
    setMembers([]);
    setIsHost(false);
  }, []);

  const handleCreate = async () => {
    await connect();
    const code = generateRoomCode();
    setIsHost(true);
    // Wait a tick for connection to finalize
    setTimeout(() => joinRoom(code, connectionRef.current), 300);
  };

  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code || code.length < 2) { toast.error('Введіть код кімнати'); return; }
    await connect();
    setTimeout(() => joinRoom(code, connectionRef.current), 300);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(roomId).then(() => toast.success('Код скопійовано'));
  };

  useEffect(() => {
    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      if (connectionRef.current) {
        connectionRef.current.stop().catch(() => {});
        connectionRef.current = null;
      }
    };
  }, []);

  return (
    <div className="main-content">
      {/* Header */}
      <div style={{ padding: '40px 32px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--purple)' }}>
          <Users size={24} />
        </div>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, lineHeight: 1.2 }}>Слухати разом</h1>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>Слухайте музику синхронно з друзями</p>
        </div>
      </div>

      <div className="content-body" style={{ paddingTop: 0, maxWidth: 640 }}>

        {!connected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Create room */}
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 16, padding: 24, border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Створити кімнату</div>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>
                Створіть нову кімнату та поділіться кодом з друзями.
              </p>
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <Users size={16} /> Створити кімнату
              </button>
            </div>

            {/* Join room */}
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 16, padding: 24, border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Приєднатись до кімнати</div>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>
                Введіть 4-символьний код кімнати.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="form-input"
                  placeholder="Код кімнати (напр. AB2C)"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handleJoin()}
                  maxLength={8}
                  style={{ flex: 1, letterSpacing: '0.12em', fontWeight: 700, textTransform: 'uppercase' }}
                />
                <button
                  className="btn btn-secondary"
                  onClick={handleJoin}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <LogIn size={16} /> Приєднатись
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Room info */}
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 16, padding: 24, border: '1px solid rgba(29,185,84,0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
                    {isHost ? 'Ваша кімната' : 'Підключено'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: 28, letterSpacing: '0.15em', color: 'var(--accent)' }}>{roomId}</span>
                    {roomId && (
                      <button className="btn-icon" onClick={copyCode} title="Скопіювати код">
                        <Copy size={16} />
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1db954', boxShadow: '0 0 6px #1db954' }} />
                  <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>Онлайн</span>
                </div>
              </div>

              <button
                className="btn btn-secondary"
                onClick={disconnect}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <LogOut size={16} /> Вийти з кімнати
              </button>
            </div>

            {/* Members list */}
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 16, padding: 24, border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>
                Учасники ({members.length > 0 ? members.length : 1})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {members.length > 0 ? members.map((m, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-dim), var(--purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, color: '#fff', flexShrink: 0 }}>
                      {(m || '?')[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{m}</div>
                      {m === userName && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ви</div>
                      )}
                    </div>
                  </div>
                )) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-dim), var(--purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, color: '#fff' }}>
                      {userName[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{userName}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ви · очікуємо інших</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Now playing info */}
            {currentTrack && (
              <div style={{ background: 'var(--bg-elevated)', borderRadius: 16, padding: 20, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <Music2 size={20} color="var(--accent)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentTrack.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{currentTrack.artistName}</div>
                </div>
                <div style={{ fontSize: 12, color: isPlaying ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 600 }}>
                  {isPlaying ? '▶ Грає' : '⏸ Пауза'}
                </div>
              </div>
            )}

            <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
              Стан плеєра синхронізується кожні 3 секунди з учасниками кімнати.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
