'use client';

import { useEffect } from 'react';
import { Icon } from '@/components/ui/Icon';

// Bottom-sheet drill-down (Trading 212 / Binance-stijl). Tik buiten of op de
// kruis-knop sluit. Body scrollt; head + grip blijven staan.
export function Sheet({ open, title, sub, onClose, children }: {
  open: boolean;
  title: string;
  sub?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
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
    </div>
  );
}
