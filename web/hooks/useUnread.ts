'use client';
import { useState, useEffect, useCallback } from 'react';

function getLastSeen(key: string): number {
  try { return parseInt(localStorage.getItem(key) ?? '0') || 0; } catch { return 0; }
}

export function useUnread(refreshMs = 90000) {
  const [decisions, setDecisions] = useState(0);
  const [conversations, setConversations] = useState(0);

  const check = useCallback(async () => {
    const lastDec = getLastSeen('lastSeenDecisions');
    const lastConv = getLastSeen('lastSeenConversations');
    try {
      const data = await fetch('/api/decisions?limit=100').then(r => r.json());
      if (Array.isArray(data)) {
        setDecisions(data.filter((d: { ts: string }) => new Date(d.ts).getTime() > lastDec).length);
      }
    } catch { /* offline or no data yet */ }
    try {
      const data = await fetch('/api/conversations').then(r => r.json());
      if (Array.isArray(data)) {
        setConversations(data.filter((t: { last_at: string }) => new Date(t.last_at).getTime() > lastConv).length);
      }
    } catch { /* offline or no data yet */ }
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, refreshMs);
    return () => clearInterval(id);
  }, [check, refreshMs]);

  const markSeen = useCallback((section: 'decisions' | 'conversations') => {
    try {
      if (section === 'decisions') { localStorage.setItem('lastSeenDecisions', Date.now().toString()); setDecisions(0); }
      if (section === 'conversations') { localStorage.setItem('lastSeenConversations', Date.now().toString()); setConversations(0); }
    } catch {}
  }, []);

  return { decisions, conversations, markSeen };
}
