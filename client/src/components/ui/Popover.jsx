import { useLayoutEffect, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Floating menu anchored to an element or to a point (right-click).
 * Clamps to the viewport, closes on outside press / Escape / scroll / resize.
 */
export default function Popover({ open, onClose, anchor, point, align = 'start', placement = 'bottom', className = 'menu', children, width }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const el = ref.current;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 6;
    let left, top;

    if (point) {
      left = point.x;
      top = point.y;
    } else if (anchor) {
      const r = anchor.getBoundingClientRect();
      left = align === 'end' ? r.right - w : r.left;
      top = placement === 'top' ? r.top - h - gap : r.bottom + gap;
      // flip if there is no room
      if (placement === 'bottom' && top + h > vh - 8 && r.top - h - gap > 8) top = r.top - h - gap;
      if (placement === 'top' && top < 8) top = r.bottom + gap;
    } else {
      left = 8; top = 8;
    }
    left = Math.max(8, Math.min(left, vw - w - 8));
    top = Math.max(8, Math.min(top, vh - h - 8));
    setPos({ left, top });
  }, [open, anchor, point, align, placement, children]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current?.contains(e.target)) return;
      if (anchor?.contains(e.target)) return;
      onClose?.();
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); } };
    const onAway = () => onClose?.();
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onAway);
    window.addEventListener('blur', onAway);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onAway);
      window.removeEventListener('blur', onAway);
    };
  }, [open, anchor, onClose]);

  if (!open) return null;
  return createPortal(
    <div ref={ref} className={className} role="menu" style={{ position: 'fixed', left: pos.left, top: pos.top, width }}>
      {children}
    </div>,
    document.body,
  );
}
