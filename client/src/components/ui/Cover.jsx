import { useState, useEffect } from 'react';
import { hueFromString } from '../../lib/color';
import { coverUrl } from '../../lib/config';

/**
 * Square cover. No art → a flat tinted plate with the title's first letter set as a glyph
 * (the specimen idea: when there's no picture, the letterform is the picture).
 */
export default function Cover({ src, track, title, round = false, className = '', style, children, lazy = true }) {
  const url = src ?? coverUrl(track);
  const label = title ?? track?.title ?? track?.name ?? '';
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);

  const hue = hueFromString(label);
  const ph = !url || failed;

  return (
    <div
      className={`cover ${round ? 'round' : ''} ${className}`}
      style={ph ? { '--cv': `oklch(0.74 0.12 ${hue})`, ...style } : style}
    >
      {ph ? (
        <span className="cover-ph" aria-hidden="true">{(label.trim()[0] || '♪').toUpperCase()}</span>
      ) : (
        <img
          src={url}
          alt=""
          loading={lazy ? 'lazy' : 'eager'}
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
      {children}
    </div>
  );
}

/** Up to four covers in a 2×2 plate — used for artists and mixes, which have no picture of their own. */
export function Collage({ covers = [], title, round = false, className = '' }) {
  const list = covers.filter(Boolean).slice(0, 4);
  if (list.length === 0) return <Cover title={title} round={round} className={className} />;
  if (list.length < 4) {
    return <Cover src={list[0]} title={title} round={round} className={className} />;
  }
  return (
    <div className={`cover ${round ? 'round' : ''} ${className}`}>
      <div className="collage" style={{ position: 'absolute', inset: 0 }}>
        {list.map((u, i) => (
          <div key={i}><img src={u} alt="" loading="lazy" decoding="async" /></div>
        ))}
      </div>
    </div>
  );
}
