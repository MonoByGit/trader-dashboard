export function Skeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="m-skel" style={{ width: i === 0 ? '60%' : '90%' }} />
      ))}
    </div>
  );
}

export function ErrorState({ msg = 'Kan niet laden' }: { msg?: string }) {
  return <div style={{ color: 'var(--neg)', fontSize: 13 }}>{msg}</div>;
}

export function EmptyState({ msg }: { msg: string }) {
  return <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>{msg}</div>;
}
