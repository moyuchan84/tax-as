import { useMemo, useState } from 'react';
import type { TaxResult } from '../tax/engine';
import { man, pct, won } from '../tax/format';
import { POOLED_KEYS, POOLED_LABEL, pooledTotals, type Allocation } from '../tax/household';
import { cardShareCurve, type OptimizeResult } from '../tax/optimizer';
import type { Tip } from '../tax/strategy';
import type { HouseholdInput, Spouse } from '../tax/types';

type Props = { hh: HouseholdInput; opt: OptimizeResult; tips: Tip[] };

export function ResultPanel({ hh, opt, tips }: Props) {
  const [view, setView] = useState<'best' | 'baseline'>('best');
  const nH = hh.husband.name || '남편';
  const nW = hh.wife.name || '아내';
  const b = opt.baselineResult;
  const r = opt.bestResult;

  return (
    <div className="results">
      <div className="summary">
        <div>
          <div className="label">현재 방식 부부 합산 세금</div>
          <div className="num">{won(b.total)}</div>
        </div>
        <div className="arrow">→</div>
        <div>
          <div className="label">최적 배분 시</div>
          <div className="num">{won(r.total)}</div>
        </div>
        <div className="saving">
          <div className="label">절세 효과</div>
          <div className="num big">{opt.savings > 0 ? won(opt.savings) : '이미 최적'}</div>
        </div>
      </div>

      <table className="mini">
        <thead>
          <tr>
            <th />
            <th>{nH} 현재</th>
            <th>{nH} 최적</th>
            <th>{nW} 현재</th>
            <th>{nW} 최적</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>결정세액(소득세)</td>
            <td>{won(b.h.determinedTax)}</td>
            <td>{won(r.h.determinedTax)}</td>
            <td>{won(b.w.determinedTax)}</td>
            <td>{won(r.w.determinedTax)}</td>
          </tr>
          <tr>
            <td>+ 지방소득세</td>
            <td>{won(b.h.totalTax)}</td>
            <td>{won(r.h.totalTax)}</td>
            <td>{won(b.w.totalTax)}</td>
            <td>{won(r.w.totalTax)}</td>
          </tr>
          {(r.h.refund !== null || r.w.refund !== null) && (
            <tr>
              <td>예상 환급(+)/납부(−)</td>
              <td>{b.h.refund !== null ? won(b.h.refund * 1.1) : '-'}</td>
              <td>{r.h.refund !== null ? won(r.h.refund * 1.1) : '-'}</td>
              <td>{b.w.refund !== null ? won(b.w.refund * 1.1) : '-'}</td>
              <td>{r.w.refund !== null ? won(r.w.refund * 1.1) : '-'}</td>
            </tr>
          )}
        </tbody>
      </table>

      <h3>추천 배분</h3>
      <AllocationTable hh={hh} opt={opt} />

      <h3>전략 가이드</h3>
      <ul className="tips">
        {tips.map((t, i) => (
          <li key={i} className={t.level}>
            <div className="tip-title">
              <span>{t.title}</span>
              {t.saving ? <b>{won(t.saving)} ↓</b> : null}
            </div>
            <p>{t.detail}</p>
          </li>
        ))}
      </ul>

      <h3>카드 사용 배분 시뮬레이션</h3>
      <p className="muted">카드 사용액 전체 중 {nH} 명의 비중을 바꿀 때 부부 합산 세금 (다른 항목은 최적 배분 고정)</p>
      <CardChart hh={hh} best={opt.best} nH={nH} nW={nW} />

      <h3>
        상세 계산
        <span className="toggle">
          <button className={view === 'best' ? 'on' : ''} onClick={() => setView('best')}>
            최적
          </button>
          <button className={view === 'baseline' ? 'on' : ''} onClick={() => setView('baseline')}>
            현재
          </button>
        </span>
      </h3>
      <Breakdown h={(view === 'best' ? r : b).h} w={(view === 'best' ? r : b).w} nH={nH} nW={nW} />
    </div>
  );
}

function AllocationTable({ hh, opt }: { hh: HouseholdInput; opt: OptimizeResult }) {
  const totals = pooledTotals(hh);
  const nm = (s: Spouse) => (s === 'h' ? hh.husband.name || '남편' : hh.wife.name || '아내');
  const split = (a: Allocation, k: (typeof POOLED_KEYS)[number]) => `${man(a.h[k])} / ${man(totals[k] - a.h[k])}`;
  const rows: { label: string; cur: string; best: string; changed: boolean }[] = [];
  for (const k of POOLED_KEYS) {
    if (totals[k] <= 0) continue;
    const changed = Math.abs(opt.baseline.h[k] - opt.best.h[k]) >= 10_000;
    rows.push({ label: POOLED_LABEL[k], cur: split(opt.baseline, k), best: split(opt.best, k), changed });
  }
  hh.dependents.forEach((d, i) =>
    rows.push({
      label: `부양가족: ${d.name || i + 1}`,
      cur: nm(opt.baseline.deps[i]),
      best: nm(opt.best.deps[i]),
      changed: opt.baseline.deps[i] !== opt.best.deps[i],
    }),
  );
  if (hh.housing.rent + hh.housing.leaseLoanRepay + hh.husband.housingSubscription + hh.wife.housingSubscription > 0) {
    rows.push({ label: '세대주(주택공제)', cur: nm(opt.baseline.head), best: nm(opt.best.head), changed: opt.baseline.head !== opt.best.head });
  }
  return (
    <table className="alloc">
      <thead>
        <tr>
          <th>항목</th>
          <th>
            현재 ({nm('h')} / {nm('w')})
          </th>
          <th>
            추천 ({nm('h')} / {nm('w')})
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className={row.changed ? 'changed' : ''}>
            <td>{row.label}</td>
            <td>{row.cur}</td>
            <td>{row.best}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CardChart({ hh, best, nH, nW }: { hh: HouseholdInput; best: Allocation; nH: string; nW: string }) {
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

function Breakdown({ h, w, nH, nW }: { h: TaxResult; w: TaxResult; nH: string; nW: string }) {
  const rows: [string, (r: TaxResult) => string, string?][] = [
    ['총급여', (r) => won(r.salary)],
    ['− 근로소득공제', (r) => won(r.earnedDeduction)],
    ['= 근로소득금액', (r) => won(r.earnedIncome), 'sum'],
    ['인적공제 (기본)', (r) => `${won(r.personalBasic)} (${r.basicCount}명)`],
    ['인적공제 (추가)', (r) => won(r.personalExtra)],
    ['국민연금', (r) => won(r.pensionInsurance)],
    ['건강·고용보험', (r) => won(r.healthEmployment)],
    ['주택자금 (전세대출·주담대)', (r) => won(r.housingLoan)],
    ['주택청약', (r) => won(r.housingSubscription)],
    ['신용카드 등', (r) => `${won(r.card.deduction)} (사용 ${man(r.card.total)} / 문턱 ${man(r.card.minSpend)})`],
    ['= 과세표준', (r) => won(r.taxBase), 'sum'],
    ['산출세액', (r) => `${won(r.computedTax)} (${pct(r.marginalRate)})`, 'sum'],
    ['근로소득세액공제', (r) => won(r.credits.earned)],
    ['자녀세액공제', (r) => `${won(r.credits.child)} (${r.childCreditCount}명)`],
    ['출산·입양', (r) => won(r.credits.birth)],
    ['결혼', (r) => won(r.credits.marriage)],
    ['연금계좌', (r) => won(r.credits.pension)],
    ['보장성보험', (r) => won(r.credits.insurance)],
    ['의료비', (r) => `${won(r.credits.medical)} (문턱 ${man(r.medical.threshold)})`],
    ['교육비', (r) => won(r.credits.education)],
    ['기부금', (r) => won(r.credits.donation + r.credits.politicalHometown)],
    ['월세', (r) => won(r.credits.rent)],
    ['표준세액공제', (r) => (r.usedStandard ? won(r.credits.standard) : '미적용')],
    ['소멸된 세액공제', (r) => won(r.lostCredits)],
    ['= 결정세액', (r) => won(r.determinedTax), 'sum'],
    ['지방소득세 (10%)', (r) => won(r.localTax)],
    ['총 부담 세액', (r) => won(r.totalTax), 'sum'],
  ];
  return (
    <table className="breakdown">
      <thead>
        <tr>
          <th />
          <th>{nH}</th>
          <th>{nW}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, f, cls]) => (
          <tr key={label} className={cls}>
            <td>{label}</td>
            <td>{f(h)}</td>
            <td>{f(w)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
