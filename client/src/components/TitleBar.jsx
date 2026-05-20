import React, { useState, useEffect } from 'react';
import { Minus, Square, X } from 'lucide-react';

export default function TitleBar() {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;
  const isMac = isElectron && window.electronAPI.platform === 'darwin';
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isElectron) return;
    window.electronAPI.isMaximized().then(setIsMaximized);
    const unsub = window.electronAPI.onMaximizeChange(setIsMaximized);
    return unsub;
  }, [isElectron]);

  useEffect(() => {
    if (isElectron) document.documentElement.setAttribute('data-electron', 'true');
  }, [isElectron]);

  if (!isElectron) return null;

  return (
    <div className="title-bar" data-mac={isMac || undefined}>
      <div className="title-bar-drag" />

      {/* Windows / Linux controls — right side */}
      {!isMac && (
        <div className="title-bar-controls">
          <button className="tb-btn tb-minimize" onClick={() => window.electronAPI.minimize()} title="Згорнути">
            <Minus size={11} strokeWidth={2.5} />
          </button>
          <button className="tb-btn tb-maximize" onClick={() => window.electronAPI.maximize()} title={isMaximized ? 'Відновити' : 'Розгорнути'}>
            {isMaximized
              ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="0" width="8" height="8" rx="1"/><rect x="0" y="2" width="8" height="8" rx="1" fill="currentColor" fillOpacity=".08"/></svg>
              : <Square size={10} strokeWidth={2} />}
          </button>
          <button className="tb-btn tb-close" onClick={() => window.electronAPI.close()} title="Закрити">
            <X size={11} strokeWidth={2.5} />
          </button>
        </div>
      )}
    </div>
  );
}
