'use client';

import { useEffect, useState } from 'react';
import { DashboardShell } from './DashboardShell';
import { MobileApp } from '@/components/mobile/MobileApp';

// Eén route (/), twee weergaven. We kiezen op basis van de schermbreedte via
// matchMedia — GEEN UA-sniffing, GEEN redirect, GEEN cookie. Tot JS de meting
// heeft gedaan tonen we een neutrale dark boot-splash (één frame, onzichtbaar),
// zodat er geen desktop-flits op de telefoon verschijnt en andersom.
export function ResponsiveRoot() {
  const [view, setView] = useState<'desktop' | 'mobile' | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const apply = () => setView(mq.matches ? 'mobile' : 'desktop');
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  if (view === null) {
    return <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-app)' }} />;
  }
  return view === 'mobile' ? <MobileApp /> : <DashboardShell />;
}
