'use client';
import Link from 'next/link';
import { BrandLogo } from '@/components/ui/Icon';
import { useReport } from '@/hooks/useTrader';
import { ReportCard } from '../_components/ReportCard';
import { Skeleton, ErrorState, EmptyState } from '../_components/states';

export default function ReportPage() {
  const { data, error, loading, refresh } = useReport();
  return (
    <main>
      <div className="m-head">
        <span className="m-title"><BrandLogo size={22} /> Rapport</span>
        <div className="m-actions">
          <Link className="m-btn" href="/m">Glance</Link>
          <button className="m-btn" onClick={refresh} aria-label="Vernieuwen">↻</button>
        </div>
      </div>

      {error
        ? <div className="m-card"><ErrorState /></div>
        : loading
          ? <div className="m-card"><Skeleton lines={4} /></div>
          : !data
            ? <div className="m-card"><EmptyState msg="Nog geen rapport beschikbaar" /></div>
            : <ReportCard r={data} />}

      <div className="m-foot">
        <a href="/?desktop=1">Open desktopversie</a>
      </div>
    </main>
  );
}
