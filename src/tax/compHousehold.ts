import { COMP, compPersonTax, shopIncomeOf, businessIncomeOf, yellowLimit, type CompCtx, type CompHousehold, type CompPerson, type CompResult } from './comp';
import { estimateSocial } from './engine';
import { RULES } from './rules';
import type { Spouse } from './types';

export type ShiftKind = 'rental' | 'business';
export interface Shift {
  from: Spouse;
  kind: ShiftKind;
  share: number; // 0~1: 원래 소유자의 해당 소득 중 배우자에게 넘기는 비율
}
export interface CompAlloc {
  deps: Spouse[];
  shift: Shift | null;
}
export interface CompHouseholdResult {
  people: CompResult[];
  total: number; // 부부 합산 소득세+지방소득세
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** 지분 이전·공동사업으로 소득 일부를 배우자에게 옮겼을 때의 입력 (단순화: 수입·경비를 비율대로 이동) */
export function applyShift(people: CompPerson[], shift: Shift | null): CompPerson[] {
  if (!shift || shift.share <= 0 || people.length < 2) return people;
  const [fi, ti] = shift.from === 'h' ? [0, 1] : [1, 0];
  const out = people.map(clone);
  const src = out[fi];
  const dst = out[ti];
  const s = Math.min(1, shift.share);
  if (shift.kind === 'business') {
    if (!src.hasBusiness) return people;
    const rev = src.business.revenue;
    const exp = src.business.expense;
    if (!dst.hasBusiness || dst.business.revenue <= 0) {
      dst.hasBusiness = true;
      dst.business = { ...src.business, revenue: 0, expense: 0, pension: 0, yellowUmbrella: 0, withholding33: src.business.withholding33 };
    }
    src.business.revenue = rev * (1 - s);
    src.business.expense = exp * (1 - s);
    dst.business.revenue += rev * s;
    dst.business.expense += exp * s;
  } else {
    if (!src.hasRental) return people;
    const r = src.rental;
    if (!dst.hasRental || dst.rental.houseRevenue + dst.rental.shopRevenue <= 0) {
      dst.hasRental = true;
      dst.rental = { ...r, houseRevenue: 0, houseExpense: 0, shopRevenue: 0, shopExpense: 0 };
    }
    const moved = { hr: r.houseRevenue * s, he: r.houseExpense * s, sr: r.shopRevenue * s, se: r.shopExpense * s };
    src.rental.houseRevenue = r.houseRevenue - moved.hr;
    src.rental.houseExpense = r.houseExpense - moved.he;
    src.rental.shopRevenue = r.shopRevenue - moved.sr;
    src.rental.shopExpense = r.shopExpense - moved.se;
    dst.rental.houseRevenue += moved.hr;
    dst.rental.houseExpense += moved.he;
    dst.rental.shopRevenue += moved.sr;
    dst.rental.shopExpense += moved.se;
  }
  return out;
}

/** 배우자공제 소득요건 판단용 소득금액 */
function incomeForSpouseTest(p: CompPerson): { amount: number; wageOnly: boolean } {
  const wageOnly = p.hasWage && !p.hasBusiness && !p.hasRental;
  const S = p.hasWage ? p.wage.salary : 0;
  if (wageOnly) return { amount: S, wageOnly };
  const wage = S > 0 ? Math.max(0, S - (S <= 5_000_000 ? S * 0.7 : 3_500_000 + (Math.min(S, 15_000_000) - 5_000_000) * 0.4)) : 0;
  return { amount: wage + Math.max(0, businessIncomeOf(p)) + shopIncomeOf(p), wageOnly };
}

function qualifiesAsSpouse(p: CompPerson): boolean {
  const { amount, wageOnly } = incomeForSpouseTest(p);
  return wageOnly ? amount <= RULES.personal.spouseWageLimit : amount <= RULES.personal.spouseIncomeLimit;
}

export function ctxFor(hh: CompHousehold, people: CompPerson[], a: CompAlloc, idx: number): CompCtx {
  const who: Spouse = idx === 0 ? 'h' : 'w';
  const p = people[idx];
  const other = people[1 - idx];
  let spouse: CompCtx['spouse'] = null;
  if (!hh.single && other && qualifiesAsSpouse(other)) {
    const mine = incomeForSpouseTest(p).amount;
    const theirs = incomeForSpouseTest(other).amount;
    if (mine > theirs || (mine === theirs && idx === 0)) spouse = { age: other.age, disabled: other.disabled };
  }
  return {
    deps: hh.dependents.filter((_, i) => a.deps[i] === who),
    spouse,
    female: !hh.single && idx === 1,
  };
}

export function evalComp(hh: CompHousehold, a: CompAlloc): CompHouseholdResult {
  const people = applyShift(hh.people, a.shift);
  const results = people.map((p, i) => compPersonTax(p, ctxFor(hh, people, a, i)));
  return { people: results, total: results.reduce((s, r) => s + r.totalTax, 0) };
}

export function baselineCompAlloc(hh: CompHousehold): CompAlloc {
  return { deps: hh.dependents.map((d) => (hh.single ? 'h' : d.assignedTo)), shift: null };
}

export interface CompOptimizeResult {
  baseline: CompAlloc;
  baselineResult: CompHouseholdResult;
  best: CompAlloc; // 소득 분산 제외
  bestResult: CompHouseholdResult;
  bestShift: { alloc: CompAlloc; result: CompHouseholdResult } | null; // 소득 분산까지 고려
  savings: number;
  shiftSavings: number; // 분산을 추가로 했을 때 더 줄어드는 세금
}

const MAX_ENUM = 6;

export function optimizeComp(hh: CompHousehold): CompOptimizeResult {
  const baseline = baselineCompAlloc(hh);
  const baselineResult = evalComp(hh, baseline);

  const free = hh.single ? [] : hh.dependents.map((d, i) => (d.locked ? -1 : i)).filter((i) => i >= 0);
  const combos: Spouse[][] = [];
  if (free.length <= MAX_ENUM) {
    for (let mask = 0; mask < 1 << free.length; mask++) {
      const deps = [...baseline.deps];
      free.forEach((di, bit) => (deps[di] = mask & (1 << bit) ? 'w' : 'h'));
      combos.push(deps);
    }
  } else combos.push(baseline.deps);

  const dist = (deps: Spouse[]) => deps.reduce((n, s, i) => n + (s !== baseline.deps[i] ? 1 : 0), 0);
  let best = { alloc: baseline, result: baselineResult };
  for (const deps of combos) {
    const alloc: CompAlloc = { deps, shift: null };
    const result = evalComp(hh, alloc);
    if (result.total < best.result.total || (result.total === best.result.total && dist(deps) < dist(best.alloc.deps))) best = { alloc, result };
  }

  let bestShift: CompOptimizeResult['bestShift'] = null;
  if (!hh.single && hh.people.length === 2) {
    const sources: { from: Spouse; kind: ShiftKind }[] = [];
    hh.people.forEach((p, i) => {
      const from: Spouse = i === 0 ? 'h' : 'w';
      if (p.hasRental && p.rental.houseRevenue + p.rental.shopRevenue > 0) sources.push({ from, kind: 'rental' });
      if (p.hasBusiness && p.business.revenue > 0) sources.push({ from, kind: 'business' });
    });
    let cur = best;
    for (const src of sources) {
      for (const deps of combos) {
        for (let k = 1; k <= 20; k++) {
          const alloc: CompAlloc = { deps, shift: { ...src, share: k / 20 } };
          const result = evalComp(hh, alloc);
          if (result.total < cur.result.total - 0.5) cur = { alloc, result };
        }
      }
    }
    if (cur !== best) bestShift = cur;
  }

  return {
    baseline,
    baselineResult,
    best: best.alloc,
    bestResult: best.result,
    bestShift,
    savings: baselineResult.total - best.result.total,
    shiftSavings: bestShift ? best.result.total - bestShift.result.total : 0,
  };
}

/** 선택한 소득의 배우자 이전 비율(0~100%)별 부부 합산 세금 */
export function shiftCurve(hh: CompHousehold, deps: Spouse[], from: Spouse, kind: ShiftKind, steps = 20) {
  const pts: { share: number; total: number; a: number; b: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const share = i / steps;
    const r = evalComp(hh, { deps, shift: { from, kind, share } });
    pts.push({ share, total: r.total, a: r.people[0].totalTax, b: r.people[1]?.totalTax ?? 0 });
  }
  return pts;
}

export function emptyCompPerson(name: string): CompPerson {
  return {
    name,
    age: 40,
    disabled: false,
    hasWage: false,
    hasBusiness: false,
    hasRental: false,
    wage: { salary: 0, otherDeduction: 0, otherCredit: 0, withheld: 0 },
    business: {
      revenue: 0,
      expenseMode: 'actual',
      expense: 0,
      expenseRate: 0.6,
      bookkeeping: 'none',
      withholding33: false,
      pension: 0,
      yellowUmbrella: 0,
    },
    rental: {
      houseRevenue: 0,
      houseRegistered: false,
      houseChoice: 'auto',
      houseExpenseMode: 'rate',
      houseExpense: 0,
      houseExpenseRate: COMP.rental.defaultHouseExpenseRate,
      shopRevenue: 0,
      shopExpense: 0,
    },
    pensionSavings: 0,
    irp: 0,
    prepaid: 0,
  };
}

export { estimateSocial, yellowLimit };
