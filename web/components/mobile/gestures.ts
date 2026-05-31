'use client';

import { useRef } from 'react';

// Native-aanvoelende iOS-gestures, zonder externe library. Elke hook geeft
// touch-handlers terug die je op een element plakt. We manipuleren transform
// rechtstreeks op de DOM-ref (geen re-render per frame) voor 60fps.

// Sleep een bottom-sheet omlaag om te sluiten. Werkt alleen als de inhoud
// bovenaan staat, zodat het niet vecht met scrollen.
export function useSwipeDown(onClose: () => void, threshold = 110) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ y: number; t: number } | null>(null);
  const active = useRef(false);

  return {
    ref,
    onTouchStart: (e: React.TouchEvent) => {
      start.current = { y: e.touches[0].clientY, t: Date.now() };
      active.current = false;
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (!start.current || !ref.current) return;
      const dy = e.touches[0].clientY - start.current.y;
      const body = ref.current.querySelector('.m-sheet-body') as HTMLElement | null;
      const atTop = !body || body.scrollTop <= 0;
      if (dy > 0 && atTop) {
        active.current = true;
        ref.current.style.transition = 'none';
        ref.current.style.transform = `translateY(${dy}px)`;
      }
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (!start.current || !ref.current) return;
      const dy = (e.changedTouches[0]?.clientY ?? start.current.y) - start.current.y;
      const dt = Date.now() - start.current.t;
      ref.current.style.transition = '';
      ref.current.style.transform = '';
      const fling = dy > 60 && dt < 260;
      if (active.current && (dy > threshold || fling)) onClose();
      start.current = null;
      active.current = false;
    },
  };
}

// Veeg vanaf de linkerrand naar rechts om terug te gaan (zoals iOS).
export function useSwipeBack(onBack: () => void, edge = 32, threshold = 80) {
  const start = useRef<{ x: number; y: number; fromEdge: boolean } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY, fromEdge: t.clientX <= edge };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (!start.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.current.x;
      const dy = Math.abs(t.clientY - start.current.y);
      if (start.current.fromEdge && dx > threshold && dy < 60) onBack();
      start.current = null;
    },
  };
}
