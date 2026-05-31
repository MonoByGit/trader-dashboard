'use client';

import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
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

function Popover({ title, plain, tech, children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(true);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    // Flip below if there is little room above.
    if (wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect();
      setAbove(rect.top > 180);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const onEnter = () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => setOpen(true), 120); };
  const onLeave = () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => setOpen(false), 80); };

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
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } }}
        className="tip-trigger"
      >
        {children}
      </span>
      {open && (
        <span className={`tip-pop ${above ? 'above' : 'below'}`} role="tooltip" onClick={(e) => e.stopPropagation()}>
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
