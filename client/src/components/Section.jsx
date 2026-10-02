import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export function Section({ title, to, more = 'Усі', right, children, className = '' }) {
  return (
    <section className={`section ${className}`}>
      <div className="section-head">
        <h2 className="h2">{title}</h2>
        {right}
        {to && <Link to={to} className="more">{more}<ChevronRight size={15} /></Link>}
      </div>
      {children}
    </section>
  );
}

export function Shelf({ children, wide = false }) {
  return <div className={`shelf ${wide ? 'wide' : ''}`}>{children}</div>;
}

export function PageHead({ title, meta, children, display = false }) {
  return (
    <header className="page-head">
      <h1 className={display ? 'display' : 'h1'}>{title}</h1>
      {meta && meta.length > 0 && <div className="page-meta">{meta.filter(Boolean).map((m, i) => <span key={i}>{m}</span>)}</div>}
      {children}
    </header>
  );
}

export function EmptyState({ title, text, action }) {
  return (
    <div className="empty">
      <div className="h2">{title}</div>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function SkeletonRows({ n = 6 }) {
  return (
    <div className="rows" aria-busy="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="row" style={{ pointerEvents: 'none' }}>
          <span /><div className="row-main"><div className="skel" style={{ width: 40, height: 40 }} /><div style={{ flex: 1 }}><div className="skel" style={{ width: '40%', height: 12, marginBottom: 6 }} /><div className="skel" style={{ width: '24%', height: 10 }} /></div></div><span /><span /><span />
        </div>
      ))}
    </div>
  );
}

export function SkeletonShelf({ n = 6 }) {
  return (
    <div className="shelf" aria-busy="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i}><div className="skel" style={{ aspectRatio: '1', marginBottom: 12 }} /><div className="skel" style={{ width: '70%', height: 12, marginBottom: 6 }} /><div className="skel" style={{ width: '45%', height: 10 }} /></div>
      ))}
    </div>
  );
}
