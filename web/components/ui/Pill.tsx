'use client';

interface PillProps {
  kind?: 'pos' | 'neg' | 'warn' | 'accent' | 'muted';
  children?: React.ReactNode;
  className?: string;
  dot?: boolean;
  pulse?: boolean;
}

export function Pill({ kind = 'muted', children, className = '', dot, pulse }: PillProps) {
  return (
    <span className={`pill ${kind}${dot ? ' dot' : ''}${pulse ? ' pulse' : ''} ${className}`}>
      {children}
    </span>
  );
}
