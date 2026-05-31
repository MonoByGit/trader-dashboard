'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/Icon';

// Bottom-sheet drill-down (Trading 212 / Binance-stijl). Tik buiten of op de
// kruis-knop sluit. Body scrollt; head + grip blijven staan. Via een portal naar
// document.body zodat de sheet het hele scherm dekt (boven de hero, onder de
// island) en niet door de scroll-container wordt afgesneden.
export function Sheet({ open, title, sub, onClose, children }: {
  open: boolean;
  title: string;
  sub?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
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
      <div className="m-sheet" onClick={e => e.stopPropagation()}>
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
