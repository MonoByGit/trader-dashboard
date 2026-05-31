'use client';

import { useState, useRef, useEffect, useLayoutEffect, useCallback, type ReactNode } from 'react';
import { getTerm } from '@/lib/glossary';

// A small info popover. Works on desktop (hover) and mobile (tap).
// Two entry points:
//   <InfoTip id="rsi" />            -> a small info dot that explains a glossary term
//   <Term id="rsi">RSI</Term>       -> inline text with a dotted underline that explains itself
//   <Tooltip title="..." body="..."> -> ad-hoc explanation not in the glossary

interface PopoverProps {
  title: string;
  plain: string;
  tech?: string;
  children: ReactNode; // the trigger
}

const MARGIN = 8; // keep this many px from any viewport edge

function Popover({ title, plain, tech, children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => { setOpen(false); setCoords(null); }, []);

  // Position the popover with fixed coordinates, clamped inside the viewport.
  // Fixed positioning escapes the panel's overflow clipping, so it never gets cut off.
  useLayoutEffect(() => {
    if (!open || !wrapRef.current || !popRef.current) return;
    const trigger = wrapRef.current.getBoundingClientRect();
    const pop = popRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = trigger.left + trigger.width / 2 - pop.width / 2;
    left = Math.max(MARGIN, Math.min(left, vw - pop.width - MARGIN));

    const above = trigger.top > pop.height + 12;
    const top = above ? trigger.top - pop.height - 7 : Math.min(trigger.bottom + 7, vh - pop.height - MARGIN);

    setCoords({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onScroll = () => close();
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, close]);

  const onEnter = () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => setOpen(true), 120); };
  const onLeave = () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => close(), 80); };

  return (
    <span
      className="tip-wrap"
      ref={wrapRef}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <span
        role="button"
        tabIndex={0}
        aria-label={`Uitleg: ${title}`}
        onClick={(e) => { e.stopPropagation(); open ? close() : setOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open ? close() : setOpen(true); } }}
        className="tip-trigger"
      >
        {children}
      </span>
      {open && (
        <span
          ref={popRef}
          className="tip-pop"
          role="tooltip"
          onClick={(e) => e.stopPropagation()}
          style={{
            top: coords ? coords.top : -9999,
            left: coords ? coords.left : -9999,
            visibility: coords ? 'visible' : 'hidden',
          }}
        >
          <span className="tip-title">{title}</span>
          <span className="tip-plain">{plain}</span>
          {tech && <span className="tip-tech">{tech}</span>}
        </span>
      )}
    </span>
  );
}

/** Small info dot that explains a glossary term by id. */
export function InfoTip({ id, size = 12 }: { id: string; size?: number }) {
  const t = getTerm(id);
  if (!t) return null;
  return (
    <Popover title={t.title} plain={t.plain} tech={t.tech}>
      <svg className="tip-dot" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 7v3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="8" cy="5" r="0.9" fill="currentColor" />
      </svg>
    </Popover>
  );
}

/** Inline term with a dotted underline; explains itself from the glossary. */
export function Term({ id, children }: { id: string; children: ReactNode }) {
  const t = getTerm(id);
  if (!t) return <>{children}</>;
  return (
    <Popover title={t.title} plain={t.plain} tech={t.tech}>
      <span className="tip-term">{children}</span>
    </Popover>
  );
}

/** Ad-hoc tooltip for explanations not in the glossary. */
export function Tooltip({ title, body, tech, children }: { title: string; body: string; tech?: string; children: ReactNode }) {
  return (
    <Popover title={title} plain={body} tech={tech}>
      {children}
    </Popover>
  );
}
