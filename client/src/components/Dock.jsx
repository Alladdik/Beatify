import { X } from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import QueuePanel from './panels/QueuePanel';
import { LyricsPanel } from './panels/LyricsView';
import SoundPanel from './panels/SoundPanel';
import DevicesPanel from './panels/DevicesPanel';

const TABS = [
  ['queue', 'Черга'],
  ['lyrics', 'Текст'],
  ['sound', 'Звук'],
  ['devices', 'Пристрої'],
];

export default function Dock() {
  const tab = useUiStore((s) => s.dockTab);
  const open = useUiStore((s) => s.openDock);
  const close = useUiStore((s) => s.closeDock);
  if (!tab) return null;

  return (
    <aside className="dock" aria-label="Панель">
      <div className="dock-head">
        <div className="tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'on' : ''}`} onClick={() => open(id)}>{label}</button>
          ))}
        </div>
        <button className="ibtn" onClick={close} aria-label="Закрити панель"><X size={18} /></button>
      </div>
      <div className="dock-body">
        {tab === 'queue' && <QueuePanel />}
        {tab === 'lyrics' && <LyricsPanel />}
        {tab === 'sound' && <SoundPanel compact />}
        {tab === 'devices' && <DevicesPanel />}
      </div>
    </aside>
  );
}
