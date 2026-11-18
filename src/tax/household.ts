import { computePersonTax, estimateSocial, type TaxResult } from './engine';
import { RULES } from './rules';
import type { HouseholdInput, PersonProfile, PersonTaxInput, ResolvedDependent, Spouse } from './types';

/**
 * 부부 사이에서 옮길 수 있는 금액 항목.
 * 각 항목의 값은 "남편 쪽으로 배분한 금액"이고 나머지는 아내 몫이다.
 */
export const POOLED_KEYS = [
  'credit',
  'debitCash',
  'market',
  'transport',
  'culture',
  'hMed',
  'wMed',
  'donGeneral',
  'donPolitical',
  'donHometown',
] as const;
export type PooledKey = (typeof POOLED_KEYS)[number];

export const POOLED_LABEL: Record<PooledKey, string> = {
  credit: '신용카드',
  debitCash: '체크카드·현금영수증',
  market: '전통시장',
  transport: '대중교통',
  culture: '도서·공연·체육시설',
  hMed: '남편 의료비',
  wMed: '아내 의료비',
  donGeneral: '일반·특례 기부금',
  donPolitical: '정치자금 기부금',
  donHometown: '고향사랑 기부금',
};

export const CARD_KEYS: PooledKey[] = ['credit', 'debitCash', 'market', 'transport', 'culture'];
export const MED_KEYS: PooledKey[] = ['hMed', 'wMed'];
export const DON_KEYS: PooledKey[] = ['donGeneral', 'donPolitical', 'donHometown'];

export interface Allocation {
  deps: Spouse[]; // 부양가족별 공제 받는 사람
  head: Spouse; // 세대주 (월세·전세대출·청약 공제)
  h: Record<PooledKey, number>; // 남편에게 배분한 금액
}

export interface HouseholdResult {
  h: TaxResult;
  w: TaxResult;
  total: number; // 부부 합산 소득세+지방소득세
}

export function pooledTotals(hh: HouseholdInput): Record<PooledKey, number> {
  const { husband: H, wife: W } = hh;
  return {
    credit: H.cards.credit + W.cards.credit,
    debitCash: H.cards.debitCash + W.cards.debitCash,
    market: H.cards.market + W.cards.market,
    transport: H.cards.transport + W.cards.transport,
    culture: H.cards.culture + W.cards.culture,
    hMed: H.medical,
    wMed: W.medical,
    donGeneral: H.donations.general + W.donations.general,
    donPolitical: H.donations.political + W.donations.political,
    donHometown: H.donations.hometown + W.donations.hometown,
  };
}

/** 사용자가 입력한 "현재 상태" 그대로의 배분 */
export function baselineAllocation(hh: HouseholdInput): Allocation {
  const H = hh.husband;
  return {
    deps: hh.dependents.map((d) => d.assignedTo),
    head: hh.housing.head,
    h: {
      credit: H.cards.credit,
      debitCash: H.cards.debitCash,
      market: H.cards.market,
      transport: H.cards.transport,
      culture: H.cards.culture,
      hMed: H.medical,
      wMed: 0,
      donGeneral: H.donations.general,
      donPolitical: H.donations.political,
      donHometown: H.donations.hometown,
    },
  };
}

export function cloneAllocation(a: Allocation): Allocation {
  return { deps: [...a.deps], head: a.head, h: { ...a.h } };
}

export function socialOf(p: PersonProfile) {
  return p.autoSocial ? estimateSocial(p.salary) : { pension: p.pension, health: p.health, employment: p.employment };
}

function resolveDependents(hh: HouseholdInput): ResolvedDependent[] {
  const children = hh.dependents
    .map((d, i) => ({ d, i }))
    .filter((x) => x.d.relation === 'child')
    .sort((a, b) => b.d.age - a.d.age);
  const order = new Map<number, number>();
  children.forEach((c, idx) => order.set(c.i, idx + 1));
  return hh.dependents.map((d, i) => ({
    name: d.name,
    relation: d.relation,
    age: d.age,
    disabled: d.disabled,
    educationType: d.educationType,
    education: d.education,
    medical: d.medical,
    birthOrder: order.get(i) ?? 0,
  }));
}

export function buildPersonInputs(hh: HouseholdInput, a: Allocation, totals = pooledTotals(hh)) {
  const resolved = resolveDependents(hh);
  const make = (who: Spouse): PersonTaxInput => {
    const p = who === 'h' ? hh.husband : hh.wife;
    const other = who === 'h' ? hh.wife : hh.husband;
    const share = (k: PooledKey) => (who === 'h' ? a.h[k] : totals[k] - a.h[k]);
    const isHead = a.head === who;
    // 외벌이: 배우자 소득이 요건 이하이면 소득이 더 높은 쪽이 배우자 기본공제를 받는다
    const claimsSpouse =
      !hh.single && other.salary <= RULES.personal.spouseWageLimit && (p.salary > other.salary || (p.salary === other.salary && who === 'h'));
    const spouseDep: ResolvedDependent[] = claimsSpouse
      ? [{ name: other.name || '배우자', relation: 'spouse', age: other.age, disabled: other.disabled, educationType: 'none', education: 0, medical: 0, birthOrder: 0 }]
      : [];
    return {
      salary: p.salary,
      age: p.age,
      disabled: p.disabled,
      female: who === 'w',
      social: socialOf(p),
      dependents: [...resolved.filter((_, i) => a.deps[i] === who), ...spouseDep],
      cards: {
        credit: share('credit'),
        debitCash: share('debitCash'),
        market: share('market'),
        transport: share('transport'),
        culture: share('culture'),
      },
      // 남편 의료비 중 남편이 결제한 몫 = 본인 의료비, 아내가 결제한 몫 = 아내 입장에서 배우자 의료비
      ownMedical: who === 'h' ? a.h.hMed : totals.wMed - a.h.wMed,
      spouseMedical: who === 'h' ? a.h.wMed : totals.hMed - a.h.hMed,
      spouseMedicalSpecific: other.disabled || other.age >= 65,
      insurance: p.insurance,
      disabledInsurance: p.disabledInsurance,
      ownEducation: p.ownEducation,
      pensionSavings: p.pensionSavings,
      irp: p.irp,
      isHead,
      housingSubscription: p.housingSubscription,
      rent: isHead ? hh.housing.rent : 0,
      leaseLoanRepay: isHead ? hh.housing.leaseLoanRepay : 0,
      mortgageInterest: p.mortgageInterest,
      mortgageCap: p.mortgageCap,
      donations: {
        general: share('donGeneral'),
        political: share('donPolitical'),
        hometown: share('donHometown'),
      },
      marriage: p.marriage,
      withheld: p.withheld,
    };
  };
  return { h: make('h'), w: make('w') };
}

export function evaluateHousehold(hh: HouseholdInput, a: Allocation, totals = pooledTotals(hh)): HouseholdResult {
  const inputs = buildPersonInputs(hh, a, totals);
  const h = computePersonTax(inputs.h);
  const w = computePersonTax(inputs.w);
  return { h, w, total: h.totalTax + w.totalTax };
}
