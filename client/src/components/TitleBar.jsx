import { useState, useEffect } from 'react';
import { Minus, Square, X, Copy } from 'lucide-react';
import { LogoMark } from './ui/Logo';

// Window chrome for the Electron shell. Renders nothing in a browser.
export default function TitleBar() {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;
  const isMac = isElectron && window.electronAPI.platform === 'darwin';
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isElectron) return;
    document.documentElement.setAttribute('data-electron', 'true');
    window.electronAPI.isMaximized?.().then(setMaximized);
    return window.electronAPI.onMaximizeChange?.(setMaximized);
  }, [isElectron]);

  if (!isElectron) return null;

  return (
    <div className="titlebar">
      <div className="titlebar-brand" style={isMac ? { paddingLeft: 78 } : undefined}>
        <LogoMark size={14} /> Beatify
      </div>
      {!isMac && (
        <div className="titlebar-ctl">
          <button onClick={() => window.electronAPI.minimize()} aria-label="Згорнути"><Minus size={14} /></button>
          <button onClick={() => window.electronAPI.maximize()} aria-label={maximized ? 'Відновити' : 'Розгорнути'}>
            {maximized ? <Copy size={12} /> : <Square size={12} />}
          </button>
          <button className="close" onClick={() => window.electronAPI.close()} aria-label="Закрити"><X size={15} /></button>
        </div>
      )}
    </div>
  );
}
