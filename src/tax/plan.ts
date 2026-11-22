import { computePersonTax, type TaxResult } from './engine';
import { man, man0, pct } from './format';
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
    donations: { statutory: 0, general: 0, religious: 0, political: 0, hometown: 0 },
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

// ------------------------------------------------------------------ 카드: 고소득 vs 저소득 손익분기

export interface Breakeven {
  hi: Spouse; // 한계세율이 높은 쪽 (같으면 총급여가 높은 쪽)
  lo: Spouse;
  thr: Record<Spouse, number>; // 공제 문턱 (총급여 25%)
  full: Record<Spouse, number>; // 기본한도를 채우는 총지출 (체크·현금 30% 가정)
  rate: Record<Spouse, number>; // 지방세 포함 한계세율
  maxSave: Record<Spouse, number>; // 한도를 채웠을 때 절세액
  /** 부부 합산 지출이 이 금액 이상이면 고소득자 한 명에게 몰아주는 쪽이 유리 (null이면 계속 저소득자 우선) */
  tHiFirst: number | null;
  /** 이 금액 이상이면 한 명이 한도를 채운 뒤 나머지를 다른 배우자에게 나누는 쪽이 유리 */
  tSplit: number | null;
  /** 이 금액 이상이면 두 사람 모두 한도 → 더 써도 공제 증가 없음 */
  tBoth: number;
}

/**
 * 단순 모델(전부 체크카드·현금영수증 30%, 추가한도 제외)로 "누구에게 몰아야 하나"의 경계 금액을 구한다.
 * 정확한 값은 지출 플랜 표(격자 탐색)가 계산하고, 여기서는 사람이 이해할 기준선을 제공한다.
 */
export function cardBreakeven(res: { h: TaxResult; w: TaxResult }): Breakeven | null {
  if (res.h.salary <= 0 || res.w.salary <= 0) return null;
  const rate = { h: res.h.marginalRate * (1 + RULES.localTaxRate), w: res.w.marginalRate * (1 + RULES.localTaxRate) };
  const hi: Spouse = rate.h !== rate.w ? (rate.h > rate.w ? 'h' : 'w') : res.h.salary >= res.w.salary ? 'h' : 'w';
  const lo: Spouse = hi === 'h' ? 'w' : 'h';
  const r = RULES.card.rates.debitCash;
  const thr = { h: res.h.card.minSpend, w: res.w.card.minSpend };
  const lim = { h: res.h.card.baseLimit, w: res.w.card.baseLimit };
  const full = { h: thr.h + lim.h / r, w: thr.w + lim.w / r };
  const save = (who: Spouse, x: number) => Math.min(Math.max(x - thr[who], 0) * r, lim[who]) * rate[who];
  const maxSave = { h: save('h', full.h), w: save('w', full.w) };
  const tBoth = full.h + full.w;

  const STEP = 100_000;
  let tHiFirst: number | null = null;
  let tSplit: number | null = null;
  for (let t = STEP; t <= tBoth + STEP; t += STEP) {
    const allHi = save(hi, t);
    const allLo = save(lo, t);
    if (tHiFirst === null && allHi > 0 && allHi >= allLo) tHiFirst = t;
    if (tSplit === null) {
      let best = 0;
      for (let x = 0; x <= t; x += STEP) best = Math.max(best, save(hi, x) + save(lo, t - x));
      if (best > Math.max(allHi, allLo) + 1) tSplit = t;
    }
    if (tHiFirst !== null && tSplit !== null) break;
  }
  return { hi, lo, thr, full, rate, maxSave, tHiFirst, tSplit, tBoth };
}

/** 사람이 읽는 설명 (전략 가이드·지출 플랜 공용). currentTotal은 부부 합산 카드·현금 지출. */
export function breakevenLines(b: Breakeven, name: Record<Spouse, string>, currentTotal: number): { headline: string; lines: string[] } {
  const { hi, lo } = b;
  const own = (s: Spouse) =>
    `${name[s]}(한계세율 ${pct(b.rate[s])}): 문턱 ${man(b.thr[s])}, 한도를 채우는 총지출 약 ${man0(b.full[s])}, 한도를 채우면 최대 ${man(b.maxSave[s])} 절세`;
  const limit = (s: Spouse) => b.maxSave[s] / b.rate[s];
  const rateHigher = b.rate[hi] > b.rate[lo] + 1e-9;
  const limitHigher = limit(hi) > limit(lo) + 1;
  const why = rateHigher && limitHigher ? '세율이 높고 한도도 큰' : rateHigher ? '세율이 높은' : limitHigher ? '공제 한도가 더 큰(자녀 수 반영)' : '';
  const lines: string[] = [`고소득 쪽 → ${own(hi)}`, `저소득 쪽 → ${own(lo)}`];

  if (b.tHiFirst === null) {
    lines.push(`세율·한도 차이보다 문턱 차이가 커서, 합산 지출이 어느 규모든 문턱이 낮은 ${name[lo]}에게 먼저 쓰는 편이 유리합니다.`);
  } else {
    lines.push(`합산 지출 ${man0(b.tHiFirst)} 미만: 문턱이 낮은 ${name[lo]} 한 명에게 — 고소득자는 문턱을 못 넘겨 공제가 거의 없습니다.`);
    lines.push(
      `합산 지출 ${man0(b.tHiFirst)} ~ ${man0(b.tSplit ?? b.tBoth)}: ${why ? why + ' ' : ''}${name[hi]}에게 몰아 한도(약 ${man0(b.full[hi])})까지 — 절세액이 더 큽니다.`,
    );
  }
  if (b.tSplit !== null) lines.push(`합산 지출 ${man0(b.tSplit)} 이상: 한 명이 한도를 채우고 남는 지출은 다른 배우자 카드로 — 둘 다 문턱을 넘기 시작합니다.`);
  lines.push(`합산 지출 ${man0(b.tBoth)} 이상: 두 사람 모두 한도라서 더 써도 공제가 늘지 않습니다.`);

  let now: string;
  if (b.tHiFirst === null || currentTotal < b.tHiFirst) now = `${name[lo]} 한 명에게 몰기`;
  else if (b.tSplit === null || currentTotal < b.tSplit) now = `${name[hi]}에게 몰아 한도 채우기`;
  else if (currentTotal < b.tBoth) now = `한 명이 한도를 채우고 나머지는 다른 배우자에게`;
  else now = '두 사람 모두 한도를 채운 상태 (추가 지출은 공제 효과 없음)';
  const headline = currentTotal > 0 ? `현재 입력한 합산 지출 ${man(currentTotal)} → ${now}` : '올해 카드·현금 지출을 얼마나 쓸지에 따라 아래 구간 중 하나를 고르세요';
  return { headline, lines };
}
