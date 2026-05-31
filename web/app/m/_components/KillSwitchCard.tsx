'use client';
import { Toggle } from '@/components/ui/Toggle';

interface Props {
  tradingEnabled: boolean | null;
  saving: boolean;
  onToggle: (next: boolean) => void;
}

export function KillSwitchCard({ tradingEnabled, saving, onToggle }: Props) {
  const on = tradingEnabled === true;
  const handle = (next: boolean) => {
    if (tradingEnabled == null) return;
    const msg = next
      ? 'Trading weer AANzetten? De bot mag dan weer posities openen.'
      : 'Kill switch: trading UITzetten? De bot opent geen nieuwe posities meer.';
    if (window.confirm(msg)) onToggle(next);
  };
  return (
    <div className="m-card">
      <div className="m-row">
        <div>
          <div className="m-card-title" style={{ marginBottom: 4 }}>Kill switch</div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            {tradingEnabled == null ? 'Laden...' : on ? 'Trading staat aan' : 'Trading staat uit'}
            {saving && ' · opslaan...'}
          </div>
        </div>
        <Toggle on={on} kill onChange={handle} aria-label="Kill switch" />
      </div>
    </div>
  );
}
