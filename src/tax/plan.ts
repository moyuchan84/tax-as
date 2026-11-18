import { computePersonTax, type TaxResult } from './engine';
import { man, pct } from './format';
import {
  CARD_KEYS,
  baselineAllocation,
  buildPersonInputs,
  cloneAllocation,
  evaluateHousehold,
  pooledTotals,
  type Allocation,
} from './household';
import { RULES } from './rules';
import type { CardSpend, HouseholdInput, Spouse } from './types';

// ------------------------------------------------------------------ 소비 성향

export type SpendStyle = 'credit' | 'debit' | 'mixed';
export const STYLES: SpendStyle[] = ['credit', 'debit', 'mixed'];
export const STYLE_LABEL: Record<SpendStyle, string> = {
  credit: '신용카드 위주',
  debit: '체크·현금 위주',
  mixed: '혼합',
};

const MIX: Record<SpendStyle, CardSpend> = {
  credit: { credit: 0.85, debitCash: 0.08, market: 0.03, transport: 0.03, culture: 0.01 },
  debit: { credit: 0.15, debitCash: 0.77, market: 0.03, transport: 0.04, culture: 0.01 },
  mixed: { credit: 0.5, debitCash: 0.42, market: 0.03, transport: 0.04, culture: 0.01 },
};
const UNIT = 10_000;

export const cardSum = (c: CardSpend) => c.credit + c.debitCash + c.market + c.transport + c.culture;

/** 연 총 지출을 소비 성향 비율대로 쪼갠다 (합계는 정확히 total) */
export function splitSpend(total: number, style: SpendStyle): CardSpend {
  const m = MIX[style];
  const r = (x: number) => Math.round((total * x) / UNIT) * UNIT;
  const debitCash = r(m.debitCash);
  const market = r(m.market);
  const transport = r(m.transport);
  const culture = r(m.culture);
  const credit = Math.max(0, total - debitCash - market - transport - culture);
  return { credit, debitCash, market, transport, culture };
}

export function detectStyle(c: CardSpend): SpendStyle {
  const t = cardSum(c);
  if (!t) return 'mixed';
  const s = c.credit / t;
  return s >= 0.65 ? 'credit' : s <= 0.35 ? 'debit' : 'mixed';
}

// ------------------------------------------------------------------ 소득 입력 도우미

/** 급여명세서(월 지급총액·상여·비과세 식대) → 총급여 */
export function annualSalary(monthly: number, bonus: number, monthlyMealNonTax: number): number {
  const meal = Math.min(Math.max(monthlyMealNonTax, 0), 200_000, monthly);
  return Math.max(0, (monthly - meal) * 12 + bonus);
}

/**
 * 간이세액표 100% 원천징수 시 연간 기납부 소득세 추정치.
 * 간이세액표는 근로소득공제·인적공제·4대보험·표준세액공제만 반영하므로
 * 카드·의료비·기부금 등을 모두 뺀 상태로 계산한다. 실제 값은 급여명세서/원천징수영수증으로 대체할 것.
 */
export function estimateWithheld(hh: HouseholdInput, who: Spouse): number {
  const p = buildPersonInputs(hh, baselineAllocation(hh))[who];
  const stripped = {
    ...p,
    cards: { credit: 0, debitCash: 0, market: 0, transport: 0, culture: 0 },
    ownMedical: 0,
    spouseMedical: 0,
    insurance: 0,
    disabledInsurance: 0,
    ownEducation: 0,
    pensionSavings: 0,
    irp: 0,
    housingSubscription: 0,
    rent: 0,
    leaseLoanRepay: 0,
    mortgageInterest: 0,
    donations: { general: 0, political: 0, hometown: 0 },
    marriage: false,
    dependents: p.dependents.map((d) => ({ ...d, medical: 0, education: 0 })),
  };
  return computePersonTax(stripped).determinedTax;
}

// ------------------------------------------------------------------ 규모별 카드 지출 플랜

export interface PlanCell {
  hAmount: number;
  wAmount: number;
  creditShareH: number; // 신용카드 중 남편 비중
  otherShareH: number; // 체크·현금·시장·교통·문화 중 남편 비중
  tax: number;
  evenTax: number; // 부부가 반반 쓸 때
  saving: number; // 반반 대비 절세액
}
export interface PlanRow {
  total: number;
  isCurrent: boolean;
  cells: Record<SpendStyle, PlanCell>;
}

/**
 * 부부 카드·현금 지출 총액이 X일 때, 다른 항목은 최적 배분으로 고정하고
 * 신용카드/그 외 결제수단을 각각 누구에게 몰아야 세금이 최소인지 21×21 격자로 찾는다.
 */
export function cardPlan(hh: HouseholdInput, best: Allocation): PlanRow[] {
  const base = pooledTotals(hh);
  const current = CARD_KEYS.reduce((s, k) => s + base[k], 0);
  const combined = hh.husband.salary + hh.wife.salary;
  const levels = new Set<number>();
  for (const f of [0.2, 0.3, 0.4, 0.5, 0.65]) levels.add(Math.max(1_000_000, Math.round((combined * f) / 1_000_000) * 1_000_000));
  const totalsList = [...levels].sort((a, b) => a - b);
  const rows: PlanRow[] = totalsList.map((total) => ({ total, isCurrent: false, cells: {} as PlanRow['cells'] }));
  if (current > 0 && !levels.has(current)) {
    rows.push({ total: current, isCurrent: true, cells: {} as PlanRow['cells'] });
    rows.sort((a, b) => a.total - b.total);
  } else if (current > 0) {
    rows.find((r) => r.total === current)!.isCurrent = true;
  }

  const N = 20;
  for (const row of rows) {
    for (const style of STYLES) {
      const spend = splitSpend(row.total, style);
      const totals = { ...base, ...spend };
      const evalAt = (sc: number, so: number) => {
        const a = cloneAllocation(best);
        for (const k of CARD_KEYS) a.h[k] = totals[k] * (k === 'credit' ? sc : so);
        return evaluateHousehold(hh, a, totals).total;
      };
      const evenTax = evalAt(0.5, 0.5);
      let bestV = Infinity;
      let bs = 0.5;
      let bo = 0.5;
      for (let i = 0; i <= N; i++) {
        for (let j = 0; j <= N; j++) {
          const sc = i / N;
          const so = j / N;
          const v = evalAt(sc, so);
          const closer = Math.abs(sc - 0.5) + Math.abs(so - 0.5) < Math.abs(bs - 0.5) + Math.abs(bo - 0.5);
          if (v < bestV || (v === bestV && closer)) {
            bestV = v;
            bs = sc;
            bo = so;
          }
        }
      }
      const hAmount = spend.credit * bs + (row.total - spend.credit) * bo;
      row.cells[style] = {
        hAmount,
        wAmount: row.total - hAmount,
        creditShareH: bs,
        otherShareH: bo,
        tax: bestV,
        evenTax,
        saving: evenTax - bestV,
      };
    }
  }
  return rows;
}

// ------------------------------------------------------------------ 이정표 (지출이 어디쯤인지)

export interface Mark {
  at: number;
  label: string;
}
export interface Milestone {
  key: 'card' | 'medical' | 'pension';
  title: string;
  current: number;
  max: number;
  marks: Mark[];
  note: string;
  tone: 'ok' | 'warn' | 'info';
}

export function milestones(hh: HouseholdInput, best: Allocation, res: { h: TaxResult; w: TaxResult }): Record<Spouse, Milestone[]> {
  const inputs = buildPersonInputs(hh, best);
  const out = { h: [] as Milestone[], w: [] as Milestone[] };
  for (const who of ['h', 'w'] as Spouse[]) {
    const r = res[who];
    const c = r.card;
    if (r.salary <= 0) continue;

    // 카드
    const fullDebit = c.minSpend + c.baseLimit / RULES.card.rates.debitCash;
    const fullCredit = c.minSpend + c.baseLimit / RULES.card.rates.credit;
    let note: string;
    let tone: Milestone['tone'] = 'info';
    if (c.total < c.minSpend) {
      note = `공제 시작선까지 ${man(c.minSpend - c.total)} 남았습니다. 이 구간은 공제가 0원이니 포인트·할인이 좋은 신용카드로 쓰세요.`;
      tone = c.total > 0 ? 'warn' : 'info';
    } else if (c.baseDeduction >= c.baseLimit) {
      note = `기본한도 ${man(c.baseLimit)}을 채웠습니다. 일반 결제는 더 써도 공제가 늘지 않고, 전통시장·대중교통만 추가한도(${man(c.extraLimit)}) 안에서 더 공제됩니다.`;
      tone = 'ok';
    } else {
      note = `공제 ${man(c.deduction)} / 기본한도 ${man(c.baseLimit)}. 체크·현금영수증으로 ${man((c.baseLimit - c.baseDeduction) / RULES.card.rates.debitCash)} 더 쓰면 한도를 채웁니다.`;
    }
    out[who].push({
      key: 'card',
      title: '카드·현금영수증 사용액',
      current: c.total,
      max: Math.max(fullCredit * 1.05, c.total * 1.05),
      marks: [
        { at: c.minSpend, label: '공제 시작' },
        { at: fullDebit, label: '체크로 한도' },
        { at: fullCredit, label: '신용으로 한도' },
      ],
      note,
      tone,
    });

    // 의료비
    const med = r.medical;
    const medTotal = med.general + med.specific;
    if (medTotal > 0 || r.salary > 0) {
      out[who].push({
        key: 'medical',
        title: '의료비 (이 사람이 공제받는 분)',
        current: medTotal,
        max: Math.max(med.threshold * 2, medTotal * 1.15, 1),
        marks: [{ at: med.threshold, label: '문턱(총급여 3%)' }],
        note:
          medTotal < med.threshold
            ? medTotal > 0
              ? `문턱까지 ${man(med.threshold - medTotal)} 남았습니다. 문턱 이하 금액은 공제가 안 되므로 한 사람에게 몰아야 합니다.`
              : `문턱은 ${man(med.threshold)}입니다. 가족 의료비를 이 사람 명의로 몰면 문턱 초과분만 15% 공제됩니다.`
            : `문턱을 ${man(medTotal - med.threshold)} 넘겨 세액공제 ${man(med.credit)}을 받습니다.`,
        tone: medTotal >= med.threshold && medTotal > 0 ? 'ok' : 'info',
      });
    }

    // 연금계좌
    const p = inputs[who];
    const cap = RULES.pension;
    const paid = Math.min(p.pensionSavings, cap.savingsCap) + p.irp;
    const room = Math.max(0, cap.totalCap - paid);
    const rate = p.salary <= cap.salaryThreshold ? cap.highRate : cap.lowRate;
    let pnote: string;
    if (room <= 0) pnote = '연금계좌 세액공제 한도를 모두 채웠습니다.';
    else {
      const gain = r.totalTax - computePersonTax({ ...p, irp: p.irp + room }).totalTax;
      pnote =
        gain > 0
          ? `${man(room)}을 더 넣으면 ${man(gain)} 절세 (공제율 ${pct(rate * 1.1)}, 12/31까지 납입).`
          : `결정세액이 이미 0원이라 추가 납입 효과가 없습니다.`;
    }
    out[who].push({
      key: 'pension',
      title: '연금저축·IRP 납입',
      current: paid,
      max: cap.totalCap,
      marks: [{ at: cap.totalCap, label: '한도' }],
      note: pnote,
      tone: room <= 0 ? 'ok' : 'info',
    });
  }
  return out;
}
