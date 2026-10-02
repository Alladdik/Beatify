import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import NowPlaying from './NowPlaying';
import CommandPalette from './CommandPalette';
import TrackMenu from './TrackMenu';
import FloatingMiniPlayer from './FloatingMiniPlayer';
import MidiVisualizer from './MidiVisualizer';
import { SHORTCUTS } from '../hooks/useShortcuts';
import { useUiStore } from '../store/uiStore';
import { usePlayerStore } from '../store/playerStore';
import { streamUrl } from '../lib/config';

function Shortcuts() {
  const open = useUiStore((s) => s.shortcutsOpen);
  const toggle = useUiStore((s) => s.toggleShortcuts);
  if (!open) return null;
  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && toggle()}>
      <div className="modal" role="dialog" aria-label="Гарячі клавіші">
        <div className="modal-head">
          <span className="h2">Гарячі клавіші</span>
          <button className="ibtn" onClick={toggle} aria-label="Закрити"><X size={18} /></button>
        </div>
        <div className="modal-body">
          {SHORTCUTS.map(([k, d]) => (
            <div key={k} className="axis" style={{ gridTemplateColumns: '1fr auto' }}>
              <span className="axis-name">{d}</span>
              <span className="kbd">{k}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function VideoModal() {
  const open = useUiStore((s) => s.videoOpen);
  const setVideo = useUiStore((s) => s.setVideo);
  const track = usePlayerStore((s) => s.currentTrack);
  const ref = useRef(null);

  useEffect(() => {
    if (!open || !track) return;
    const a = usePlayerStore.getState().audio;
    const wasPlaying = !a.paused;
    const v = ref.current;
    if (!v) return;
    a.pause();
    v.currentTime = a.currentTime;
    v.volume = a.volume;
    v.play().catch(() => {});
    return () => {
      a.currentTime = v.currentTime;
      if (wasPlaying) a.play().catch(() => {});
    };
  }, [open, track]);

  if (!open || !track) return null;
  return (
    <div className="modal-back" style={{ background: '#000' }}>
      <div style={{ position: 'absolute', top: 16, right: 16 }}>
        <button className="ibtn lg" style={{ color: '#fff' }} onClick={() => setVideo(false)} aria-label="Закрити відео"><X size={24} /></button>
      </div>
      <div style={{ textAlign: 'center', color: '#fff' }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>{track.title} — {track.artistName}</div>
        <video ref={ref} src={streamUrl(track.id)} controls playsInline style={{ maxWidth: '92vw', maxHeight: '76vh', background: '#000' }} />
      </div>
    </div>
  );
}

export default function Overlays() {
  const mini = useUiStore((s) => s.miniPlayerOpen);
  const midi = useUiStore((s) => s.midiOpen);
  const setMini = useUiStore((s) => s.setMiniPlayer);
  const setMidi = useUiStore((s) => s.setMidi);
  return (
    <>
      <NowPlaying />
      <CommandPalette />
      <TrackMenu />
      <Shortcuts />
      <VideoModal />
      {mini && <FloatingMiniPlayer onClose={() => setMini(false)} />}
      {midi && <MidiVisualizer onClose={() => setMidi(false)} />}
    </>
  );
}
