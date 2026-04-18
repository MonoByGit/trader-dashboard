'use client';

interface Option {
  label: string;
  value: string;
}

interface SegmentedProps {
  options: Option[];
  value: string;
  onChange: (v: string) => void;
}

export function Segmented({ options, value, onChange }: SegmentedProps) {
  return (
    <div className="segmented">
      {options.map(o => (
        <button
          key={o.value}
          className={value === o.value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
