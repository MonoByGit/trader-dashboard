'use client';

import { useEffect, useState, type ReactNode } from 'react';

export function AuthGate({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(d => {
        setAuthRequired(!!d.authRequired);
        setAuthed(!!d.authenticated);
      })
      .catch(() => setAuthed(false))
      .finally(() => setLoading(false));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      setError('Onjuist wachtwoord');
      return;
    }
    setAuthed(true);
  };

  if (loading) {
    return <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-app)' }} />;
  }

  if (!authRequired || authed) return <>{children}</>;

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg-app)', padding: 24 }}>
      <form onSubmit={submit} className="card" style={{ width: 'min(360px, 100%)', padding: 24 }}>
        <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>Momentum</h1>
        <p className="text-secondary" style={{ fontSize: 12, margin: '0 0 16px' }}>
          Voer het dashboard-wachtwoord in (APP_PASSWORD).
        </p>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete="current-password"
          style={{ width: '100%', marginBottom: 12, padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
        />
        {error && <p style={{ color: 'var(--neg)', fontSize: 11, margin: '0 0 12px' }}>{error}</p>}
        <button type="submit" className="btn primary" style={{ width: '100%' }}>Inloggen</button>
      </form>
    </div>
  );
}
