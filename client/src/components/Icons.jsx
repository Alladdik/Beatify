// Custom hand-crafted icons for Beatify — distinct from generic icon libraries

export function IconHome({ size = 20, ...p }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V10.5z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9 22V12h6v10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function IconSearch({ size = 20, ...p }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="10.5" cy="10.5" r="7" stroke="currentColor" strokeWidth="1.6"/>
      <path d="M16 16l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}

export function IconCompass({ size = 20, ...p }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6"/>
      <path d="M16.5 7.5l-3 6-6 3 3-6 6-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="currentColor" fillOpacity="0.2"/>
    </svg>
  );
}

export function IconLibrary({ size = 20, ...p }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...p}>
      <rect x="3" y="3" width="6" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
      <rect x="11" y="3" width="4" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
      <path d="M17.5 3.5l3.5 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}

export function IconPlay({ size = 20, filled = false, ...p }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M6 4.5l13 7.5-13 7.5V4.5z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
    </svg>
  );
}

export function IconPause({ size = 20, ...p }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...p}>
      <rect x="5" y="4" width="4" height="16" rx="1.5" fill="currentColor"/>
      <rect x="15" y="4" width="4" height="16" rx="1.5" fill="currentColor"/>
    </svg>
  );
}

export function IconSkipBack({ size = 20, ...p }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M19 20L9 12l10-8v16z" fill="currentColor" fillOpacity="0.85"/>
      <rect x="5" y="4" width="2.5" height="16" rx="1.25" fill="currentColor"/>
    </svg>
  );
}

export function IconSkipForward({ size = 20, ...p }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M5 4l10 8-10 8V4z" fill="currentColor" fillOpacity="0.85"/>
      <rect x="16.5" y="4" width="2.5" height="16" rx="1.25" fill="currentColor"/>
    </svg>
  );
}

export function IconShuffle({ size = 18, ...p }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M16 3h5v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 21l7.5-7.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M21 3l-18 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M16 21h5v-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 3l7.5 7.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  );
}

export function IconRepeat({ size = 18, ...p }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M17 2l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 11V9a4 4 0 0 1 4-4h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M7 22l-4-4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M21 13v2a4 4 0 0 1-4 4H3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  );
}

export function IconHeart({ size = 18, filled = false, ...p }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
    </svg>
  );
}

export function IconVolume({ size = 18, muted = false, ...p }) {
  if (muted) return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" fillOpacity="0.7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      <line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  );
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" fillOpacity="0.7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  );
}

// Animated equalizer bars — shows when a track is playing
export function NowPlayingBars({ size = 16, active = true, color = 'currentColor' }) {
  const bars = [
    { h: active ? '60%' : '30%', delay: '0s',    dur: '0.7s' },
    { h: active ? '90%' : '30%', delay: '0.18s', dur: '0.9s' },
    { h: active ? '50%' : '30%', delay: '0.06s', dur: '0.8s' },
    { h: active ? '80%' : '30%', delay: '0.24s', dur: '0.75s' },
  ];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, width: size, height: size }}>
      {bars.map((b, i) => (
        <span key={i} style={{
          flex: 1,
          background: color,
          borderRadius: 1.5,
          height: active ? undefined : b.h,
          animation: active ? `eqBar ${b.dur} ease-in-out ${b.delay} infinite alternate` : 'none',
          minHeight: '20%',
        }} />
      ))}
      <style>{`
        @keyframes eqBar {
          0%   { height: 20%; }
          100% { height: 95%; }
        }
      `}</style>
    </span>
  );
}

// Cool cybernetic animated blinking SVG Eye logo
export function BeatifyLogo({ size = 38 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        overflow: 'hidden',
        boxShadow: '0 0 20px rgba(16, 185, 129, 0.45), 0 4px 14px rgba(0, 0, 0, 0.6)',
        border: '1px solid rgba(16, 185, 129, 0.35)',
        flexShrink: 0,
        background: 'linear-gradient(135deg, #09090b 0%, #121217 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      <style>{`
        @keyframes eyeBlinkAnim {
          0%, 88%, 100% {
            transform: scaleY(1);
          }
          93% {
            transform: scaleY(0.04);
          }
        }
        @keyframes eyeGlowPulse {
          0%, 100% {
            filter: drop-shadow(0 0 3px rgba(16, 185, 129, 0.9));
          }
          50% {
            filter: drop-shadow(0 0 9px rgba(6, 182, 212, 0.9));
          }
        }
        @keyframes pupilLook {
          0%, 100% { transform: translate(0, 0); }
          30% { transform: translate(-1px, 0.5px); }
          70% { transform: translate(1px, -0.5px); }
        }
        .blinking-eye {
          transform-origin: center center;
          animation: eyeBlinkAnim 3.6s ease-in-out infinite;
        }
        .eye-pupil {
          animation: pupilLook 4s ease-in-out infinite, eyeGlowPulse 2.2s ease-in-out infinite alternate;
        }
      `}</style>

      <svg
        width={size * 0.78}
        height={size * 0.78}
        viewBox="0 0 32 32"
        fill="none"
        className="blinking-eye"
      >
        <defs>
          <linearGradient id="irisGrad" x1="0" y1="0" x2="32" y2="32">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="50%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <linearGradient id="eyeOutlineGrad" x1="0" y1="0" x2="32" y2="0">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>

        {/* Outer Cybernetic Eye Shape */}
        <path
          d="M 3 16 Q 16 5 29 16 Q 16 27 3 16 Z"
          fill="rgba(16, 185, 129, 0.08)"
          stroke="url(#eyeOutlineGrad)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Outer Glowing Iris Ring */}
        <circle cx="16" cy="16" r="7.5" fill="url(#irisGrad)" opacity="0.9" />

        {/* Inner Dark Pupil & Glint */}
        <g className="eye-pupil">
          <circle cx="16" cy="16" r="4" fill="#09090b" />
          <circle cx="16" cy="16" r="2.2" fill="#10b981" opacity="0.9" />
          <circle cx="14.2" cy="14.2" r="1.3" fill="#ffffff" opacity="0.95" />
          <circle cx="18" cy="18" r="0.7" fill="#ffffff" opacity="0.7" />
        </g>

        {/* Top/Bottom Eyelash accent curves */}
        <path d="M 12 7.5 C 14 6 18 6 20 7.5" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
        <path d="M 13 24.5 C 15 25.5 17 25.5 19 24.5" stroke="#06b6d4" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
      </svg>
    </div>
  );
}
