import { useState } from 'react';
import { CloudDownload, Check, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { canSaveToLibrary, isSaved, saveExternalTrack } from '../lib/saveTrack';

/** Visible "save to the server library" button for a search result. Renders nothing without the permission. */
export default function SaveButton({ track }) {
  const user = useAuthStore((s) => s.user);
  const [state, setState] = useState(() => (isSaved(track) ? 'done' : 'idle'));
  if (!canSaveToLibrary(user)) return null;

  const onClick = async (e) => {
    e.stopPropagation();
    if (state !== 'idle') return;
    setState('busy');
    setState((await saveExternalTrack(track)) ? 'done' : 'idle');
  };

  const label = state === 'done' ? 'Збережено' : state === 'busy' ? 'Зберігаю…' : 'Зберегти';
  return (
    <button className={`save-btn ${state}`} onClick={onClick} disabled={state === 'done'} aria-label={`${label} в бібліотеку`} title="Зберегти в бібліотеку на сервері">
      {state === 'busy' ? <Loader2 size={16} className="spin" /> : state === 'done' ? <Check size={16} /> : <CloudDownload size={16} />}
      <span>{label}</span>
    </button>
  );
}
