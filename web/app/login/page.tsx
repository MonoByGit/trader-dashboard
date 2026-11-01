'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(typeof d.error === 'string' ? d.error : 'Inloggen mislukt');
        return;
      }
      router.replace(next.startsWith('/') ? next : '/');
      router.refresh();
    } catch {
      setError('Netwerkfout. Probeer opnieuw.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Momentum</h1>
        <p className="login-sub">Paper trading dashboard. Voer het app-wachtwoord in om verder te gaan.</p>
        <form onSubmit={onSubmit}>
          <label htmlFor="password">Wachtwoord</label>
          <input
            id="password"
            type="password"
            className="input"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="App-wachtwoord"
            required
          />
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="btn primary" disabled={loading || !password}>
            {loading ? 'Bezig…' : 'Inloggen'}
          </button>
        </form>
      </div>
      <style jsx>{`
        .login-page {
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: var(--bg-base, #1e1e1e);
        }
        .login-card {
          width: 100%;
          max-width: 380px;
          padding: 28px 24px;
          border-radius: 12px;
          border: 1px solid var(--border-subtle, #333);
          background: var(--bg-elevated, #252525);
        }
        h1 {
          margin: 0 0 8px;
          font-size: 22px;
          font-weight: 600;
        }
        .login-sub {
          margin: 0 0 20px;
          font-size: 13px;
          line-height: 1.5;
          color: var(--text-secondary, #aaa);
        }
        label {
          display: block;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-tertiary, #888);
          margin-bottom: 6px;
        }
        .input {
          width: 100%;
          margin-bottom: 14px;
        }
        .login-error {
          color: var(--neg, #f87171);
          font-size: 12px;
          margin: 0 0 12px;
        }
        .btn.primary {
          width: 100%;
        }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="login-page" style={{ color: '#888' }}>Laden…</div>}>
      <LoginForm />
    </Suspense>
  );
}
