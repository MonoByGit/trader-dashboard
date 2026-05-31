import { fmt } from '@/lib/format';
import type { Decision } from '@/hooks/useTrader';

export function DecisionRow({ d }: { d: Decision }) {
  return (
    <div className="m-dec">
      <div className="m-dec-top">
        <span style={{ fontWeight: 600 }}>{d.symbol ?? d.routine}</span>
        <span className="text-tertiary mono" style={{ fontSize: 11 }}>{d.decision}</span>
        <span className="text-tertiary" style={{ marginLeft: 'auto', fontSize: 11 }}>{fmt.relTime(d.ts)}</span>
      </div>
      {d.rationale && <div className="m-dec-rat">{d.rationale}</div>}
    </div>
  );
}
