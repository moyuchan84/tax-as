import { useMemo, useState } from 'react';
import { man, won } from '../tax/format';
import { pooledTotals, type Allocation } from '../tax/household';
import { cardShareCurve } from '../tax/optimizer';
import type { HouseholdInput } from '../tax/types';

export function CardChart({ hh, best, nH, nW }: { hh: HouseholdInput; best: Allocation; nH: string; nW: string }) {
  const pts = useMemo(() => cardShareCurve(hh, best), [hh, best]);
  const [hover, setHover] = useState<number | null>(null);
  const totals = pooledTotals(hh);
  const cardTotal = totals.credit + totals.debitCash + totals.market + totals.transport + totals.culture;
  if (cardTotal <= 0) return <p className="muted">카드 사용액을 입력하면 그래프가 표시됩니다.</p>;

  const W = 560;
  const H = 220;
  const pad = { l: 64, r: 12, t: 12, b: 32 };
  const ys = pts.flatMap((p) => [p.total, p.h, p.w]);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const span = yMax - yMin || 1;
  const x = (s: number) => pad.l + s * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - yMin) / span) * (H - pad.t - pad.b);
  const path = (f: (p: (typeof pts)[number]) => number) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.share).toFixed(1)},${y(f(p)).toFixed(1)}`).join('');
  const minPt = pts.reduce((m, p) => (p.total < m.total ? p : m), pts[0]);
  const hp = hover !== null ? pts[hover] : null;
  const ticks = [yMin, yMin + span / 2, yMax];

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="카드 배분 비중별 세금"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const sx = ((e.clientX - rect.left) / rect.width) * W;
          const s = Math.min(1, Math.max(0, (sx - pad.l) / (W - pad.l - pad.r)));
          setHover(Math.round(s * (pts.length - 1)));
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="axis">
              {man(t)}
            </text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((s) => (
          <text key={s} x={x(s)} y={H - 10} textAnchor="middle" className="axis">
            {Math.round(s * 100)}%
          </text>
        ))}
        <path d={path((p) => p.h)} className="line s1" />
        <path d={path((p) => p.w)} className="line s2" />
        <path d={path((p) => p.total)} className="line total" />
        <circle cx={x(minPt.share)} cy={y(minPt.total)} r={5} className="dot" />
        {hp && (
          <g>
            <line x1={x(hp.share)} x2={x(hp.share)} y1={pad.t} y2={H - pad.b} className="cursor" />
            <circle cx={x(hp.share)} cy={y(hp.total)} r={4} className="dot" />
          </g>
        )}
      </svg>
      <div className="legend">
        <span className="k total">부부 합산</span>
        <span className="k s1">{nH}</span>
        <span className="k s2">{nW}</span>
        {hp ? (
          <span className="readout">
            {nH} {Math.round(hp.share * 100)}% ({man(cardTotal * hp.share)}) · 합산 {won(hp.total)}
          </span>
        ) : (
          <span className="readout">
            최저점: {nH} {Math.round(minPt.share * 100)}% · {won(minPt.total)}
          </span>
        )}
      </div>
    </div>
  );
}
