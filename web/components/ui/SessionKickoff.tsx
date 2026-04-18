'use client';
import { useState, useEffect } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';

interface KickoffOption {
  symbol: string;
  thesis: string;
  rationale: string;
  confidence: number;
  criteria: Record<string, 'pass' | 'fail'>;
  entryZone: string;
  stopLevel: string;
}

interface SessionKickoffProps {
  onSelect: (option: KickoffOption) => void;
}

export function SessionKickoff({ onSelect }: SessionKickoffProps) {
  const [options, setOptions] = useState<KickoffOption[] | null>(null);
  const [source, setSource] = useState<'premarket' | 'live'>('live');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/agent/kickoff')
      .then(r => r.json())
      .then(d => {
        if (d.options) { setOptions(d.options); setSource(d.source); }
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = (opt: KickoffOption) => {
    setSelected(opt.symbol);
    onSelect(opt);
  };

  if (loading) {
    return (
      <div className="card" style={{marginBottom:16}}>
        <div className="card-head"><h3><Icon name="bolt" size={12}/> Dagelijkse briefing</h3></div>
        <div className="card-body" style={{display:'flex',alignItems:'center',gap:10,color:'var(--text-tertiary)',fontSize:12}}>
          <Pill kind="accent" dot pulse>Analyzing</Pill>
          Ik analyseer de watchlist en selecteer vandaag 3 setups voor je…
        </div>
      </div>
    );
  }

  if (error || !options) {
    return (
      <div className="card" style={{marginBottom:16}}>
        <div className="card-head"><h3><Icon name="bolt" size={12}/> Dagelijkse briefing</h3></div>
        <div className="card-body" style={{fontSize:12,color:'var(--text-tertiary)'}}>
          Kon geen sessie-data ophalen. Trigger handmatig de premarket routine om te starten.
        </div>
      </div>
    );
  }

  if (selected) {
    const opt = options.find(o => o.symbol === selected)!;
    return (
      <div className="card" style={{marginBottom:16,borderColor:'var(--accent)',borderWidth:1}}>
        <div className="card-head">
          <h3><Icon name="bolt" size={12}/> Sessie gestart · <span className="sym">{opt.symbol}</span></h3>
          <Pill kind="accent" dot pulse>ACTIEF</Pill>
        </div>
        <div className="card-body" style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6}}>
          {opt.thesis} — Open Conversations voor de volledige analyse en follow-up.
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{marginBottom:16}}>
      <div className="card-head">
        <h3><Icon name="bolt" size={12}/> Waar beginnen we vandaag?</h3>
        <Pill kind={source === 'premarket' ? 'pos' : 'accent'}>
          {source === 'premarket' ? 'Premarket scan' : 'Live analyse'}
        </Pill>
      </div>
      <div className="card-body" style={{paddingBottom:0}}>
        <div style={{fontSize:11,color:'var(--text-tertiary)',marginBottom:12}}>
          Ik heb {options.length} setups geselecteerd op basis van trend, momentum en volume. Kies er één om de sessie te focussen.
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,paddingBottom:14}}>
          {options.map(opt => {
            const passCnt = Object.values(opt.criteria).filter(v => v === 'pass').length;
            const conf = Math.round(opt.confidence * 100);
            return (
              <div key={opt.symbol}
                style={{background:'var(--bg-app)',borderRadius:8,border:'1px solid var(--border-subtle)',padding:12,display:'flex',flexDirection:'column',gap:8,cursor:'pointer'}}
                onClick={() => handleSelect(opt)}
              >
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                  <div className="sym" style={{fontSize:16,fontWeight:700}}>{opt.symbol}</div>
                  <div style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:'var(--font-mono)'}}>{conf}%</div>
                </div>
                <div style={{fontSize:11,color:'var(--text-secondary)',lineHeight:1.5,flex:1}}>{opt.thesis}</div>
                <div style={{display:'flex',gap:4}}>
                  {Object.values(opt.criteria).map((v, i) => (
                    <div key={i} style={{width:8,height:8,borderRadius:4,background:v==='pass'?'var(--pos)':'var(--border-strong)'}}/>
                  ))}
                  <span style={{fontSize:9,color:'var(--text-tertiary)',marginLeft:4,fontFamily:'var(--font-mono)'}}>{passCnt}/6</span>
                </div>
                <div style={{fontSize:10,color:'var(--text-tertiary)'}}>
                  Entry: <span className="mono">{opt.entryZone}</span>
                </div>
                <button className="btn primary" style={{width:'100%',fontSize:11,padding:'5px 0'}} onClick={e => { e.stopPropagation(); handleSelect(opt); }}>
                  <Icon name="play" size={10}/> Start met {opt.symbol}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
