'use client';
import { useState, useEffect, useCallback } from 'react';

interface AccountData {
  equity: number;
  cash: number;
  buyingPower: number;
  dayPnl: number;
  dayPnlPct: number;
  daytrades: number;
  tradingBlocked: boolean;
  marketOpen: boolean;
  nextOpen: string;
  nextClose: string;
}

interface PositionData {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  costBasis: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  side: string;
  changeToday: number;
}

export function useAccount(refreshMs = 30000) {
  const [data, setData] = useState<AccountData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch('/api/alpaca/account');
      if (!res.ok) throw new Error(`${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, refreshMs);
    return () => clearInterval(id);
  }, [fetch_, refreshMs]);

  return { data, error, loading, refresh: fetch_ };
}

export function usePositions(refreshMs = 15000) {
  const [data, setData] = useState<PositionData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch('/api/alpaca/positions');
      if (!res.ok) throw new Error(`${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, refreshMs);
    return () => clearInterval(id);
  }, [fetch_, refreshMs]);

  return { data, error, loading, refresh: fetch_ };
}

export function useOrders() {
  const [data, setData] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/alpaca/orders')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return { data, loading };
}
