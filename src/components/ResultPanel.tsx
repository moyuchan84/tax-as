import { useState } from 'react';
import type { TaxResult } from '../tax/engine';
import { man, pct, won } from '../tax/format';
import { POOLED_KEYS, POOLED_LABEL, pooledTotals, type Allocation } from '../tax/household';
import type { OptimizeResult } from '../tax/optimizer';
import type { Tip } from '../tax/strategy';
import type { HouseholdInput, Spouse } from '../tax/types';
import { PlanPanel } from './PlanPanel';

export type Tab = 'plan' | 'alloc' | 'tips' | 'detail';
const TABS: { id: Tab; label: string }[] = [
  { id: 'plan', label: '지출 플랜' },
  { id: 'alloc', label: '추천 배분' },
  { id: 'tips', label: '전략 가이드' },
  { id: 'detail', label: '상세 계산' },
];

type Props = { hh: HouseholdInput; opt: OptimizeResult; tips: Tip[]; tab: Tab; onTab: (t: Tab) => void };

export function ResultPanel({ hh, opt, tips, tab, onTab }: Props) {
  const [view, setView] = useState<'best' | 'baseline'>('best');
  const nH = hh.husband.name || '남편';
  const nW = hh.wife.name || '아내';
  const b = opt.baselineResult;
  const r = opt.bestResult;

  return (
    <div className="results">
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'tab on' : 'tab'} onClick={() => onTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'plan' && <PlanPanel hh={hh} opt={opt} />}

      {tab === 'alloc' && (
        <div>
          <h3>부부별 세금</h3>
          <div className="table-scroll">
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
                  <tr className="sum">
                    <td>예상 환급(+) / 추가납부(−)</td>
                    <td>{b.h.refund !== null ? won(b.h.refund * 1.1) : '-'}</td>
                    <td>{r.h.refund !== null ? won(r.h.refund * 1.1) : '-'}</td>
                    <td>{b.w.refund !== null ? won(b.w.refund * 1.1) : '-'}</td>
                    <td>{r.w.refund !== null ? won(r.w.refund * 1.1) : '-'}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <h3>추천 배분표</h3>
          <AllocationTable hh={hh} opt={opt} />
        </div>
      )}

      {tab === 'tips' && (
        <div>
          <h3>전략 가이드</h3>
          <p className="muted">각 절세액은 그 항목 하나만 바꿨을 때의 값이라 합계가 전체 절세액과 다를 수 있습니다.</p>
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
        </div>
      )}

      {tab === 'detail' && (
        <div>
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
      )}
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
