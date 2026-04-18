'use client';

interface ToggleProps {
  on: boolean;
  onChange?: (v: boolean) => void;
  danger?: boolean;
  kill?: boolean;
  'aria-label'?: string;
}

export function Toggle({ on, onChange, danger, kill, 'aria-label': ariaLabel }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      className={`toggle ${on ? 'on' : ''} ${danger ? 'danger' : ''} ${kill ? 'kill' : ''}`}
      onClick={() => onChange?.(!on)}
    />
  );
}
