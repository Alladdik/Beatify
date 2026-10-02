
/** The mark: a lowercase "b" whose counter is a play triangle. Uses currentColor. */
export function LogoMark({ size = 28, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="currentColor" aria-hidden="true" {...rest}>
      <rect x="8" y="3" width="5" height="25" rx="1" />
      <path
        fillRule="evenodd"
        d="M19 11a8.5 8.5 0 0 0 0 17a8.5 8.5 0 0 0 0-17ZM16.8 15.7L23.2 19.5L16.8 23.3Z"
      />
    </svg>
  );
}

export default function Logo({ size = 26, word = true }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <span style={{ color: 'var(--accent-text)', display: 'inline-flex' }}><LogoMark size={size} /></span>
      {word && <span className="brand-word">Beatify</span>}
    </span>
  );
}
