import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../../store/playerStore';
import { useLyrics } from '../../hooks/useLyrics';
import { activeLineIndex } from '../../lib/lrc';

function scrollParent(el) {
  for (let p = el; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/**
 * Synced (LRC) or plain lyrics. `large` is the full-screen reading size.
 * Re-renders only when the active line changes, not on every playback tick.
 */
export default function LyricsView({ track, large = false }) {
  const { lines, synced, loading, notFound } = useLyrics(track);
  const active = usePlayerStore((s) => (synced ? activeLineIndex(lines, s.progress) : -1));
  const seek = usePlayerStore((s) => s.seek);
  const box = useRef(null);
  const userScroll = useRef(0);

  useEffect(() => {
    if (!synced || active < 0 || !box.current) return;
    if (Date.now() - userScroll.current < 3000) return; // let people read ahead
    const line = box.current.querySelector(`[data-i="${active}"]`);
    const scroller = scrollParent(box.current);
    if (!line || !scroller) return;
    // Centre the line inside its own scroller only: scrollIntoView would also drag the full-screen sheet and the page along
    const l = line.getBoundingClientRect(), s = scroller.getBoundingClientRect();
    scroller.scrollTo({ top: scroller.scrollTop + (l.top - s.top) - s.height / 2 + l.height / 2, behavior: 'smooth' });
  }, [active, synced]);

  if (loading && !lines.length) {
    return (
      <div className="lyrics-state" aria-busy="true">
        {[70, 92, 58, 84, 66].map((w, i) => <div key={i} className="skel" style={{ width: `${w}%`, height: large ? 34 : 18 }} />)}
      </div>
    );
  }
  if (notFound || !lines.length) {
    return (
      <div className="lyrics-state">
        <p className="muted">Для цього треку тексту ще немає.</p>
        <p className="muted" style={{ fontSize: '0.8rem' }}>Ми шукаємо його автоматично (LRCLIB, Genius та інші). Спробуйте пізніше.</p>
      </div>
    );
  }

  return (
    <div
      ref={box}
      className={`lyrics ${large ? 'large' : ''} ${synced ? 'synced' : ''}`}
      onWheel={() => { userScroll.current = Date.now(); }}
      onTouchMove={() => { userScroll.current = Date.now(); }}
    >
      {lines.map((l, i) => (
        <button
          key={i}
          data-i={i}
          className={`lyric ${i === active ? 'on' : i < active ? 'past' : ''}`}
          onClick={() => synced && seek(l.time)}
          tabIndex={synced ? 0 : -1}
        >
          {l.text}
        </button>
      ))}
      <div style={{ height: '40%' }} aria-hidden="true" />
    </div>
  );
}

export function LyricsPanel() {
  const track = usePlayerStore((s) => s.currentTrack);
  if (!track) return <div className="empty" style={{ padding: 'var(--s-5)' }}><div className="h2">Тут з’явиться текст</div><p>Увімкніть трек — і слова поплили в такт.</p></div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px var(--s-4)', borderBottom: '1px solid var(--line)' }}>
        <div className="trunc" style={{ fontWeight: 560 }}>{track.title}</div>
        <div className="trunc muted" style={{ fontSize: '0.8rem' }}>{track.artistName}</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 var(--s-4)' }}><LyricsView track={track} /></div>
    </div>
  );
}
