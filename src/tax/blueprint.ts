import { computePersonTax } from './engine';
import { buildPersonInputs } from './household';
import { optimizeHousehold } from './optimizer';
import { breakevenLines, cardBreakeven, type Breakeven } from './plan';
import { RULES } from './rules';
import type { HouseholdInput, PersonProfile, Spouse } from './types';

/**
 * "시작 가이드": 지출을 하나도 입력하지 않은 상태, 즉 소득과 가족 구성만으로
 * 올해 어디까지 쓰면 되고 어떻게 쓰는 게 유리한지를 계산한다.
 */

export interface PersonGuide {
  who: Spouse;
  name: string;
  salary: number;
  kids: number; // 이 사람이 기본공제로 올린 자녀 수 (카드 한도에 반영)
  marginal: number; // 지방세 포함 한계세율
  thr: number; // 카드 공제 문턱 (총급여 25%)
  baseLimit: number;
  extraLimit: number;
  fullDebit: number; // 체크·현금으로만 기본한도를 채우는 총지출
  fullCredit: number; // 신용카드로만 기본한도를 채우는 총지출
  extraFill: number; // 추가한도를 채우는 데 필요한 전통시장·대중교통 사용액
  maxSaveBase: number;
  maxSaveExtra: number;
  refund: { credit: number; debit: number; special: number }; // 사용액 1원당 실질 환급률
  cultureOk: boolean; // 도서·공연·체육시설 30% 대상(총급여 7천 이하)
  medicalThr: number; // 의료비 3% 문턱
  pension: { room: number; rate: number; gain: number }; // 900만원 납입 시 절세
  insuranceCredit: number;
  rent: { eligible: boolean; max: number };
  subscription: { eligible: boolean; saving: number };
  taxAfterBasic: number; // 지출 없이 계산한 결정세액(소득세)
}

export interface Blueprint {
  empty: boolean;
  persons: Record<Spouse, PersonGuide>;
  breakeven: Breakeven | null;
  deps: { name: string; to: Spouse; from: Spouse }[];
  head: Spouse;
  breakevenText: { headline: string; lines: string[] } | null;
}

function strip(hh: HouseholdInput): HouseholdInput {
  const z = (p: PersonProfile): PersonProfile => ({
    ...p,
    cards: { credit: 0, debitCash: 0, market: 0, transport: 0, culture: 0 },
    medical: 0,
    insurance: 0,
    disabledInsurance: 0,
    ownEducation: 0,
    pensionSavings: 0,
    irp: 0,
    housingSubscription: 0,
    mortgageInterest: 0,
    donations: { statutory: 0, general: 0, religious: 0, political: 0, hometown: 0 },
    withheld: 0,
  });
  return {
    ...hh,
    time: undefined,
    remaining: undefined,
    husband: z(hh.husband),
    wife: z(hh.wife),
    dependents: hh.dependents.map((d) => ({ ...d, medical: 0, education: 0, educationType: 'none' as const })),
    housing: { ...hh.housing, rent: 0, leaseLoanRepay: 0 },
  };
}

export function buildBlueprint(hh: HouseholdInput): Blueprint {
  const zero = strip(hh);
  const opt = optimizeHousehold(zero);
  const res = opt.bestResult;
  const inputs = buildPersonInputs(zero, opt.best);
  const L = 1 + RULES.localTaxRate;
  const names: Record<Spouse, string> = { h: hh.husband.name || '남편', w: hh.wife.name || '아내' };
  const c = RULES.card;
  const pr = RULES.pension;

  const person = (who: Spouse): PersonGuide => {
    const r = res[who];
    const p = inputs[who];
    const m = r.marginalRate * L;
    const card = r.card;
    const pensionRate = p.salary <= pr.salaryThreshold ? pr.highRate : pr.lowRate;
    const gain = r.salary > 0 ? Math.max(0, r.totalTax - computePersonTax({ ...p, irp: pr.totalCap }).totalTax) : 0;
    const rent = RULES.rent;
    return {
      who,
      name: names[who],
      salary: r.salary,
      kids: card.kids,
      marginal: m,
      thr: card.minSpend,
      baseLimit: card.baseLimit,
      extraLimit: card.extraLimit,
      fullDebit: card.minSpend + card.baseLimit / c.rates.debitCash,
      fullCredit: card.minSpend + card.baseLimit / c.rates.credit,
      extraFill: card.extraLimit / c.rates.market,
      maxSaveBase: card.baseLimit * m,
      maxSaveExtra: card.extraLimit * m,
      refund: { credit: c.rates.credit * m, debit: c.rates.debitCash * m, special: c.rates.market * m },
      cultureOk: r.salary <= c.cultureSalaryLimit,
      medicalThr: r.salary * RULES.medical.thresholdRate,
      pension: { room: pr.totalCap, rate: pensionRate * L, gain },
      insuranceCredit: RULES.insurance.cap * RULES.insurance.rate,
      rent: { eligible: r.salary <= rent.salaryLimit, max: rent.cap * (r.salary <= rent.rateThreshold ? rent.highRate : rent.lowRate) },
      subscription: {
        eligible: r.salary <= RULES.housingSubscription.salaryLimit,
        saving: RULES.housingSubscription.cap * RULES.housingSubscription.rate * m,
      },
      taxAfterBasic: r.determinedTax,
    };
  };

  const persons = { h: person('h'), w: person('w') };
  const breakeven = cardBreakeven(res);
  const empty = hh.husband.salary <= 0 && hh.wife.salary <= 0;
  return {
    empty,
    persons,
    breakeven,
    deps: hh.dependents.map((d, i) => ({ name: d.name || `부양가족 ${i + 1}`, to: opt.best.deps[i], from: d.assignedTo })),
    head: opt.best.head,
    breakevenText: breakeven ? breakevenLines(breakeven, names, 0) : null,
  };
}
