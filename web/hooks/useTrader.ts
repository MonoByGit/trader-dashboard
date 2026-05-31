'use client';
import { useState, useEffect, useCallback } from 'react';

export interface Decision {
  id: string;
  ts: string;
  routine: string;
  symbol: string | null;
  decision: string;
  rationale: string | null;
  confidence: number | null;
}

export interface ReportData {
  id: string;
  date: string;
  generated_at: string;
  kpis: { equityStart?: number; equityEnd?: number; closed?: number } | null;
  narrative: string | null;
}

export function useGuards() {
  const [tradingEnabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/guards');
      if (!res.ok) throw new Error(`${res.status}`);
      const d = await res.json();
      setEnabled(!!d.tradingEnabled);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const setTrading = useCallback(async (next: boolean) => {
    const prev = tradingEnabled;
    setEnabled(next); // optimistisch
    setSaving(true);
    try {
      const res = await fetch('/api/guards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradingEnabled: next, who: 'Dusty (mobiel)' }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
    } catch (e) {
      setEnabled(prev); // terugdraaien
      setError(String(e));
      throw e;
    } finally {
      setSaving(false);
    }
  }, [tradingEnabled]);

  useEffect(() => { refresh(); }, [refresh]);
  return { tradingEnabled, error, saving, refresh, setTrading };
}

export function useDecisions(limit = 5) {
  const [data, setData] = useState<Decision[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/decisions?limit=${limit}`);
      if (!res.ok) throw new Error(`${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => { refresh(); }, [refresh]);
  return { data, error, loading, refresh };
}

export function useReport() {
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/agent/report');
      if (!res.ok) throw new Error(`${res.status}`);
      const d = await res.json();
      setData(d && !d.error ? d : null);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  return { data, error, loading, refresh };
}
