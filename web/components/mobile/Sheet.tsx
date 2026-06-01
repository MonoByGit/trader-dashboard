'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/Icon';
import { useSwipeDown } from './gestures';

// Bottom-sheet drill-down (Trading 212 / Binance-stijl). Sluit via: tik buiten,
// kruis-knop, Escape, of sleep de sheet omlaag (iOS-gebaar). Body scrollt; head
// + grip blijven staan. Portal naar document.body zodat de sheet het hele scherm
// dekt en niet door de scroll-container wordt afgesneden.
export function Sheet({ open, title, sub, onClose, children }: {
  open: boolean;
  title: string;
  sub?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const swipe = useSwipeDown(onClose);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;
  return createPortal(
    <div className="m-sheet-backdrop" onClick={onClose}>
      <div
        className="m-sheet"
        ref={swipe.ref}
        onClick={e => e.stopPropagation()}
        onTouchStart={swipe.onTouchStart}
        onTouchMove={swipe.onTouchMove}
        onTouchEnd={swipe.onTouchEnd}
      >
        <div className="m-sheet-grip" />
        <div className="m-sheet-head">
          <div style={{ minWidth: 0 }}>
            <div className="m-sheet-title">{title}</div>
            {sub && <div className="m-sheet-sub">{sub}</div>}
          </div>
          <button className="m-sheet-close" onClick={onClose} aria-label="Sluiten"><Icon name="x" size={13} /></button>
        </div>
        <div className="m-sheet-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
