'use client';

interface IconProps {
  name: string;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 14, className = '' }: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
  };

  const paths: Record<string, React.ReactNode> = {
    dashboard: <><rect x="2" y="2" width="5" height="6" rx="1"/><rect x="9" y="2" width="5" height="3" rx="1"/><rect x="9" y="7" width="5" height="7" rx="1"/><rect x="2" y="10" width="5" height="4" rx="1"/></>,
    positions: <><path d="M2 13l3-4 3 2 5-7"/><path d="M9 4h4v4"/></>,
    log: <><rect x="3" y="2" width="10" height="12" rx="1"/><path d="M5.5 5h5M5.5 8h5M5.5 11h3"/></>,
    chat: <><path d="M2.5 3.5h11v7.5h-5l-3 2.5v-2.5h-3v-7.5z"/><path d="M5.5 6.5h5M5.5 8.5h3.5"/></>,
    send: <><path d="M13.5 2.5L2 7.5l5 1.5 1.5 5 5-11.5z"/></>,
    tag: <><path d="M2 2h6l6 6-6 6-6-6V2z"/><circle cx="5" cy="5" r=".8" fill="currentColor"/></>,
    sparkle: <><path d="M8 2l1.3 3.7L13 7l-3.7 1.3L8 12l-1.3-3.7L3 7l3.7-1.3L8 2z" fill="currentColor" stroke="none"/></>,
    research: <><circle cx="7" cy="7" r="4"/><path d="M10 10l3 3"/><path d="M5.5 7h3M7 5.5v3"/></>,
    routines: <><circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 2"/></>,
    shield: <><path d="M8 2l5 2v4c0 3-2.2 5.2-5 6-2.8-.8-5-3-5-6V4l5-2z"/><path d="M6 8l1.5 1.5L10.5 7"/></>,
    strategy: <><path d="M2 12V4m0 0h4a2 2 0 012 2v6m0 0V6a2 2 0 012-2h4v8"/></>,
    history: <><circle cx="8" cy="8" r="5.5"/><path d="M8 5v3h3"/><path d="M2.5 5.5c.5-1.5 1.5-2.5 3-3"/></>,
    logs: <><path d="M3 3h10v10H3z"/><path d="M5 6h6M5 8h6M5 10h4"/></>,
    play: <><path d="M5 3l8 5-8 5V3z" fill="currentColor" stroke="none"/></>,
    pause: <><rect x="4" y="3" width="3" height="10" fill="currentColor" stroke="none"/><rect x="9" y="3" width="3" height="10" fill="currentColor" stroke="none"/></>,
    kill: <><circle cx="8" cy="8" r="5.5"/><path d="M8 4v5"/></>,
    search: <><circle cx="7" cy="7" r="4"/><path d="M10 10l3 3"/></>,
    chev: <><path d="M5 6l3 3 3-3"/></>,
    chevR: <><path d="M6 4l3 3-3 3"/></>,
    check: <><path d="M3 8l3 3 7-7"/></>,
    x: <><path d="M4 4l8 8M12 4l-8 8"/></>,
    plus: <><path d="M8 3v10M3 8h10"/></>,
    minus: <><path d="M3 8h10"/></>,
    bell: <><path d="M4 11V7a4 4 0 118 0v4l1 1.5H3L4 11z"/><path d="M6 13a2 2 0 004 0"/></>,
    more: <><circle cx="3.5" cy="8" r=".8" fill="currentColor"/><circle cx="8" cy="8" r=".8" fill="currentColor"/><circle cx="12.5" cy="8" r=".8" fill="currentColor"/></>,
    menu: <><path d="M2.5 4h11M2.5 8h11M2.5 12h11"/></>,
    sun: <><circle cx="8" cy="8" r="2.5"/><path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.7 3.7l1 1M11.3 11.3l1 1M12.3 3.7l-1 1M4.7 11.3l-1 1"/></>,
    moon: <><path d="M12 9a5 5 0 11-5-5 4 4 0 005 5z"/></>,
    dollar: <><path d="M8 2v12M11 5H6.5a1.5 1.5 0 000 3H9a1.5 1.5 0 010 3H5"/></>,
    up: <><path d="M4 10l4-4 4 4"/></>,
    down: <><path d="M4 6l4 4 4-4"/></>,
    bolt: <><path d="M9 2L4 9h3l-1 5 5-7H8l1-5z" fill="currentColor" stroke="none"/></>,
    clock: <><circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 1.5"/></>,
    wifi: <><path d="M2.5 6a8 8 0 0111 0"/><path d="M4.5 8.5a5 5 0 017 0"/><circle cx="8" cy="11.5" r="1" fill="currentColor"/></>,
    lock: <><rect x="3.5" y="7" width="9" height="6" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/></>,
    unlock: <><rect x="3.5" y="7" width="9" height="6" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 014.5-1.5"/></>,
    arrow_ne: <><path d="M5 11l6-6M6 5h5v5"/></>,
    arrow_se: <><path d="M5 5l6 6M11 6v5H6"/></>,
    filter: <><path d="M2.5 3h11l-4 5v4l-3 1V8l-4-5z"/></>,
    eye: <><path d="M1.5 8s2.5-4 6.5-4 6.5 4 6.5 4-2.5 4-6.5 4-6.5-4-6.5-4z"/><circle cx="8" cy="8" r="1.6"/></>,
    zap: <><path d="M9 2L3 9h4v5l6-7H9V2z"/></>,
    refresh: <><path d="M2 8a6 6 0 0110.5-3.5M14 8a6 6 0 01-10.5 3.5"/><path d="M12 2v3h-3M4 14v-3h3"/></>,
    settings: <><circle cx="8" cy="8" r="2"/><path d="M8 1v2M8 13v2M15 8h-2M3 8H1M12.5 3.5l-1.4 1.4M4.9 11.1l-1.4 1.4M12.5 12.5l-1.4-1.4M4.9 4.9L3.5 3.5"/></>,
    terminal: <><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M4.5 6l2 2-2 2M8 10h3"/></>,
    tweak: <><path d="M2 4h4M10 4h4M2 12h8M14 12h0"/><circle cx="8" cy="4" r="1.5"/><circle cx="12" cy="12" r="1.5"/></>,
    diamond: <><path d="M8 2l5 6-5 6-5-6 5-6z"/></>,
    grid: <><rect x="2" y="2" width="5" height="5"/><rect x="9" y="2" width="5" height="5"/><rect x="2" y="9" width="5" height="5"/><rect x="9" y="9" width="5" height="5"/></>,
    user: <><circle cx="8" cy="5.5" r="2.5"/><path d="M3 14c.5-2.5 2.5-4 5-4s4.5 1.5 5 4"/></>,
    share: <><circle cx="4" cy="8" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="12" cy="12" r="2"/><path d="M5.8 7l4.4-2M5.8 9l4.4 2"/></>,
    link: <><path d="M7 9l2-2M6 10l-1.5 1.5a2.1 2.1 0 01-3-3L3 7M10 6l1.5-1.5a2.1 2.1 0 013 3L13 9"/></>,
    copy: <><rect x="5" y="5" width="8" height="8" rx="1"/><path d="M3 11V4a1 1 0 011-1h7"/></>,
    trash: <><path d="M3 5h10M6 5V3h4v2M5 5l.7 9h4.6L11 5M7 8v4M9 8v4"/></>,
    environment: <><path d="M8 2a6 6 0 100 12A6 6 0 008 2z"/><path d="M2 8h12M8 2c-1.5 2-2.5 3.5-2.5 6s1 4 2.5 6M8 2c1.5 2 2.5 3.5 2.5 6s-1 4-2.5 6"/></>,
    sidebarLeft: <><rect x="2" y="2" width="4.5" height="12" rx="1" fill="currentColor" stroke="none"/><rect x="8" y="2" width="6" height="12" rx="1"/></>,
    sidebarRight: <><rect x="9.5" y="2" width="4.5" height="12" rx="1" fill="currentColor" stroke="none"/><rect x="2" y="2" width="6" height="12" rx="1"/></>,
  };

  return <svg {...common}>{paths[name] ?? null}</svg>;
}

export function BrandLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="currentColor" style={{ display: 'block' }}>
      <path d="m452 78.67h-.72v-38.67c0-6.9-5.6-12.5-12.5-12.5s-12.5 5.6-12.5 12.5v38.67h-.72c-17.92 0-32.5 14.58-32.5 32.5v251.43c0 17.92 14.58 32.5 32.5 32.5h.72v38.67c0 6.9 5.6 12.5 12.5 12.5s12.5-5.6 12.5-12.5v-38.67h.72c17.92 0 32.5-14.58 32.5-32.5v-251.43c0-17.92-14.58-32.5-32.5-32.5z"/>
      <path d="m330.15 199.9h-.72v-19.17c0-6.9-5.6-12.5-12.5-12.5s-12.5 5.6-12.5 12.5v19.17h-.72c-17.92 0-32.5 14.58-32.5 32.5v187.92c0 17.92 14.58 32.5 32.5 32.5h.72v19.17c0 6.9 5.6 12.5 12.5 12.5s12.5-5.6 12.5-12.5v-19.17h.72c17.92 0 32.5-14.58 32.5-32.5v-187.92c0-17.92-14.58-32.5-32.5-32.5z"/>
      <path d="m208.3 158.71h-.72v-25.93c0-6.9-5.6-12.5-12.5-12.5s-12.5 5.6-12.5 12.5v25.93h-.72c-17.92 0-32.5 14.58-32.5 32.5v115.15c0 17.92 14.58 32.5 32.5 32.5h.72v25.93c0 6.9 5.6 12.5 12.5 12.5s12.5-5.6 12.5-12.5v-25.93h.72c17.92 0 32.5-14.58 32.5-32.5v-115.15c0-17.92-14.58-32.5-32.5-32.5z"/>
      <path d="m86.44 84.54h-.72v-44.54c0-6.9-5.6-12.5-12.5-12.5s-12.5 5.6-12.5 12.5v44.54h-.72c-17.92 0-32.5 14.58-32.5 32.5v232.12c0 17.92 14.58 32.5 32.5 32.5h.72v44.54c0 6.9 5.6 12.5 12.5 12.5s12.5-5.6 12.5-12.5v-44.54h.72c17.92 0 32.5-14.58 32.5-32.5v-232.12c0-17.92-14.58-32.5-32.5-32.5z"/>
    </svg>
  );
}
