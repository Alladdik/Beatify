import React, { useEffect, useState, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, X } from 'lucide-react';

// Standalone mini player — renders when URL hash is #miniplayer
export default function MiniPlayerPage() {
  const [track, setTrack] = useState(null);
  const [playing, setPlaying] = useState(false);

  const isElectron = !!window.electronAPI;

  useEffect(() => {
    if (!isElectron) return;
    const unsub = window.electronAPI.onPlayerState(state => {
      if (state?.currentTrack) setTrack(state.currentTrack);
      setPlaying(state?.isPlaying ?? false);
    });
    return unsub;
  }, []);

  const control = (cmd) => {
    if (isElectron) window.electronAPI.miniPlayerControl(cmd);
  };

  const cover = track?.isExternal
    ? track.thumbnail
    : track?.coverPath ? `http://localhost:5000/uploads/covers/${track.coverPath}` : null;

  return (
    <div style={{
      width: '100%', height: '100vh', background: 'rgba(12,12,20,0.92)',
      backdropFilter: 'blur(20px)', borderRadius: 14,
      border: '1px solid rgba(255,255,255,0.1)',
      display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px',
      color: '#fff', userSelect: 'none', overflow: 'hidden',
    }}>
      {/* Cover */}
      <div style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#111' }}>
        {cover ? <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#1a1a2e,#16213e)' }} />}
      </div>
      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {track?.title || 'Нічого не грає'}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {track?.artistName || ''}
        </div>
      </div>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <button onClick={() => control('prev')} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4, display: 'flex', opacity: 0.7 }}>
          <SkipBack size={14} />
        </button>
        <button onClick={() => control('playpause')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', cursor: 'pointer', width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {playing ? <Pause size={13} /> : <Play size={13} style={{ marginLeft: 1 }} />}
        </button>
        <button onClick={() => control('next')} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4, display: 'flex', opacity: 0.7 }}>
          <SkipForward size={14} />
        </button>
        <button onClick={() => isElectron && window.electronAPI.hideMiniPlayer()} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 4, display: 'flex', marginLeft: 4 }}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
