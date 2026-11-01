'use client';
import { useState, useEffect } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { fmt } from '@/lib/format';
import { ordersFromResponse, readJson } from '@/lib/api-shapes';

interface AlpacaOrder {
  id: string; symbol: string; side: string; qty: number; filledQty: number;
  status: string; submittedAt: string; filledAt: string | null;
  filledAvgPrice: number | null; type: string;
}

/** Alleen echte orders van het Alpaca papieraccount. Geen demodata: laden is laden, een fout is een fout. */
export function HistoryPage() {
  const [liveOrders, setLiveOrders] = useState<AlpacaOrder[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/alpaca/orders', { cache: 'no-store' })
      .then(async (r) => setLiveOrders(ordersFromResponse<AlpacaOrder>(await readJson(r))))
      .catch((e) => setFout(String(e instanceof Error ? e.message : e)));
  }, []);

  if (liveOrders === null) {
    return (
      <>
        <div className="page-head">
          <div><h1>Trade History</h1><div className="subtitle text-secondary">Orders van het Alpaca papieraccount.</div></div>
        </div>
        <div className="card">
          <div className="card-body">
            {fout
              ? <div className="text-neg" style={{ fontSize: 12 }}>Kon de orders niet laden: {fout}</div>
              : <div className="text-tertiary" style={{ fontSize: 12 }}>Bezig met lezen…</div>}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Trade History</h1><div className="subtitle text-secondary">Live orders van Alpaca paper account. Echte uitvoeringen.</div></div>
      </div>
      <div className="card">
        <div className="card-head">
          <h3><Icon name="history" size={12}/> Orders <span className="text-tertiary mono" style={{fontSize:10}}>{liveOrders.length} total</span></h3>
        </div>
        <div className="card-body flush">
          <table className="data">
            <thead>
              <tr>
                <th style={{width:140}}>Tijd</th>
                <th style={{width:70}}>Sym</th>
                <th style={{width:60}}>Side</th>
                <th className="num" style={{width:60}}>Qty</th>
                <th className="num">Prijs</th>
                <th>Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {liveOrders.map(o => (
                <tr key={o.id}>
                  <td className="mono text-tertiary" style={{fontSize:10}}>
                    {o.filledAt
                      ? new Date(o.filledAt).toLocaleString('nl-NL', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
                      : new Date(o.submittedAt).toLocaleString('nl-NL', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}
                  </td>
                  <td className="sym">{o.symbol}</td>
                  <td><Pill kind={o.side==='buy'?'pos':'neg'}>{o.side.toUpperCase()}</Pill></td>
                  <td className="num mono">{o.filledQty || o.qty}</td>
                  <td className="num mono">{o.filledAvgPrice ? fmt.usd(o.filledAvgPrice) : <span className="text-tertiary">—</span>}</td>
                  <td className="text-tertiary" style={{fontSize:11}}>{o.type}</td>
                  <td><Pill kind={o.status==='filled'?'pos':o.status==='canceled'?'neg':'muted'}>{o.status}</Pill></td>
                </tr>
              ))}
              {liveOrders.length === 0 && (
                <tr>
                  <td colSpan={7} style={{padding:48,textAlign:'center',color:'var(--text-tertiary)'}}>
                    <Icon name="history" size={32}/>
                    <div style={{marginTop:10,fontSize:12}}>Nog geen orders.</div>
                    <div style={{fontSize:11,marginTop:4}}>De agent plaatst zijn eerste order bij de market-open routine (09:35 ET).</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
