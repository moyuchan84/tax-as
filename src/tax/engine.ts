import { RULES } from './rules';
import type { CardSpend, PersonTaxInput, ResolvedDependent } from './types';

const R = RULES;
const floor = (n: number) => Math.floor(n);
const pos = (n: number) => Math.max(0, n);

export function earnedIncomeDeduction(salary: number): number {
  const tier = R.earnedIncomeDeduction.tiers.find((t) => salary <= t.upTo)!;
  return floor(Math.min(tier.base + (salary - tier.from) * tier.rate, R.earnedIncomeDeduction.cap));
}

export function bracketFor(taxBase: number) {
  return R.brackets.find((b) => taxBase <= b.upTo)!;
}

export function computedTax(taxBase: number): number {
  if (taxBase <= 0) return 0;
  const b = bracketFor(taxBase);
  return floor(taxBase * b.rate - b.deduction);
}

export function earnedCreditLimit(salary: number): number {
  if (salary <= 33_000_000) return 740_000;
  if (salary <= 70_000_000) return Math.max(660_000, 740_000 - (salary - 33_000_000) * 0.008);
  if (salary <= 120_000_000) return Math.max(500_000, 660_000 - (salary - 70_000_000) * 0.5);
  return Math.max(200_000, 500_000 - (salary - 120_000_000) * 0.5);
}

export function earnedCredit(tax: number, salary: number): number {
  const c = R.earnedCredit;
  const base = tax <= c.lowTaxLimit ? tax * c.lowRate : c.lowTaxLimit * c.lowRate + (tax - c.lowTaxLimit) * c.highRate;
  return floor(Math.min(base, earnedCreditLimit(salary)));
}

export function estimateSocial(salary: number) {
  const s = R.social;
  const monthly = Math.min(Math.max(salary / 12, s.pensionMonthlyFloor), s.pensionMonthlyCap);
  const pension = salary > 0 ? floor(monthly * s.pensionRate * 12) : 0;
  const healthBase = salary * s.healthRate;
  return {
    pension,
    health: floor(healthBase * (1 + s.ltcRatio)),
    employment: floor(salary * s.employmentRate),
  };
}

// ---------------------------------------------------------------- 인적공제

export function isBasicEligible(d: ResolvedDependent): boolean {
  const p = R.personal;
  if (d.disabled) return true;
  if (d.relation === 'child') return d.age <= p.childMaxAge;
  if (d.relation === 'parent') return d.age >= p.parentMinAge;
  return d.age <= p.childMaxAge || d.age >= p.parentMinAge;
}

export function isMedicalSpecific(d: { age: number; disabled: boolean }): boolean {
  return d.disabled || d.age <= R.medical.specificAgeUnder || d.age >= R.medical.specificAgeOver;
}

// ---------------------------------------------------------------- 신용카드

export interface CardResult {
  total: number;
  minSpend: number;
  gross: number; // 한도 적용 전 공제액
  baseLimit: number;
  extraLimit: number;
  baseDeduction: number;
  extraDeduction: number;
  deduction: number;
  kids: number;
  /** 최저사용금액을 넘긴 뒤 기본한도를 채우려면 신용카드로 더 써야 할 금액 (0이면 이미 채움) */
  roomToBaseLimit: number;
}

export function cardDeduction(salary: number, c: CardSpend, kids: number): CardResult {
  const cr = R.card;
  const low = salary <= cr.salaryThreshold;
  const cultureAllowed = salary <= cr.cultureSalaryLimit;
  // 총급여 7천 초과자의 도서·공연 등은 결제수단(신용카드 가정)으로 들어감
  const credit = c.credit + (cultureAllowed ? 0 : c.culture);
  const culture = cultureAllowed ? c.culture : 0;
  const parts: [number, number, boolean][] = [
    [credit, cr.rates.credit, false],
    [c.debitCash, cr.rates.debitCash, false],
    [culture, cr.rates.culture, true],
    [c.market, cr.rates.market, true],
    [c.transport, cr.rates.transport, true],
  ];
  const total = parts.reduce((s, p) => s + p[0], 0);
  const minSpend = salary * cr.minSpendRate;
  let remainingMin = minSpend;
  let gross = 0;
  let special = 0;
  for (const [amt, rate, isSpecial] of parts) {
    const used = Math.min(amt, remainingMin);
    remainingMin -= used;
    const d = (amt - used) * rate;
    gross += d;
    if (isSpecial) special += d;
  }
  const k = Math.min(kids, 2);
  const baseLimit = (low ? cr.baseLimitLow : cr.baseLimitHigh)[k];
  const extraLimit = low ? cr.extraLimitLow : cr.extraLimitHigh;
  const baseDeduction = Math.min(gross, baseLimit);
  const extraDeduction = Math.min(gross - baseDeduction, extraLimit, special);
  const roomToBaseLimit = remainingMin > 0 ? remainingMin + baseLimit / cr.rates.credit : pos(baseLimit - gross) / cr.rates.credit;
  return {
    total,
    minSpend,
    gross: floor(gross),
    baseLimit,
    extraLimit,
    baseDeduction: floor(baseDeduction),
    extraDeduction: floor(extraDeduction),
    deduction: floor(baseDeduction + extraDeduction),
    kids,
    roomToBaseLimit: floor(roomToBaseLimit),
  };
}

// ---------------------------------------------------------------- 의료비

export interface MedicalResult {
  general: number;
  specific: number;
  threshold: number;
  eligible: number;
  credit: number;
}

export function medicalCredit(salary: number, general: number, specific: number): MedicalResult {
  const m = R.medical;
  const threshold = salary * m.thresholdRate;
  const g = general - threshold;
  let eligible: number;
  if (g >= 0) eligible = Math.min(g, m.generalCap) + specific;
  else eligible = pos(specific + g);
  return { general, specific, threshold: floor(threshold), eligible: floor(eligible), credit: floor(eligible * m.rate) };
}

// ---------------------------------------------------------------- 기부금

export function politicalCredit(amount: number): number {
  const p = R.donation.political;
  const full = Math.min(amount, p.fullUpTo);
  const mid = Math.min(pos(amount - p.fullUpTo), p.highThreshold - p.fullUpTo);
  const high = pos(amount - p.highThreshold);
  return floor((full * 100) / 110 + mid * p.rate + high * p.highRate);
}

export function hometownCredit(amount: number): number {
  const h = R.donation.hometown;
  const a = Math.min(amount, h.cap);
  const full = Math.min(a, h.fullUpTo);
  const tier2 = Math.min(pos(a - h.fullUpTo), h.tier2UpTo - h.fullUpTo);
  const rest = pos(a - h.tier2UpTo);
  return floor((full * 100) / 110 + tier2 * h.tier2Rate + rest * h.rate);
}

export function generalDonationCredit(amount: number, earnedIncome: number): number {
  const g = R.donation.general;
  const base = Math.min(amount, earnedIncome * g.incomeCapRate);
  return floor(Math.min(base, g.threshold) * g.rate + pos(base - g.threshold) * g.highRate);
}

// ---------------------------------------------------------------- 전체 계산

export interface Credits {
  earned: number;
  child: number;
  birth: number;
  marriage: number;
  pension: number;
  insurance: number;
  medical: number;
  education: number;
  donation: number;
  politicalHometown: number;
  rent: number;
  standard: number;
}

export interface TaxResult {
  salary: number;
  earnedDeduction: number;
  earnedIncome: number;
  personalBasic: number;
  personalExtra: number;
  basicCount: number;
  pensionInsurance: number;
  healthEmployment: number;
  housingLoan: number;
  housingSubscription: number;
  card: CardResult;
  totalIncomeDeduction: number;
  taxBase: number;
  marginalRate: number;
  computedTax: number;
  medical: MedicalResult;
  credits: Credits;
  totalCredits: number;
  lostCredits: number;
  determinedTax: number;
  localTax: number;
  totalTax: number; // 소득세 + 지방소득세
  withheld: number;
  refund: number | null; // + 환급, - 추가납부
  usedStandard: boolean;
  childCreditCount: number;
}

function compute(p: PersonTaxInput, standard: boolean): TaxResult {
  const salary = p.salary;
  const earnedDeduction = earnedIncomeDeduction(salary);
  const earnedIncome = pos(salary - earnedDeduction);

  // 인적공제
  const per = R.personal;
  const eligibleDeps = p.dependents.filter(isBasicEligible);
  const basicCount = 1 + eligibleDeps.length;
  const personalBasic = basicCount * per.basic;
  let personalExtra = 0;
  if (p.disabled) personalExtra += per.disabled;
  if (p.age >= per.elderlyAge) personalExtra += per.elderly;
  if (p.female && earnedIncome <= per.womanIncomeLimit) personalExtra += per.woman;
  for (const d of eligibleDeps) {
    if (d.disabled) personalExtra += per.disabled;
    if (d.age >= per.elderlyAge) personalExtra += per.elderly;
  }

  const pensionInsurance = p.social.pension;
  const healthEmployment = standard ? 0 : p.social.health + p.social.employment;

  // 주택자금 (세대주만): 청약 + 전세대출 합산 400만, 주담대 이자는 별도 한도
  let housingSubscription = 0;
  let housingLoan = 0;
  if (p.isHead) {
    const hs = R.housingSubscription;
    if (salary <= hs.salaryLimit) housingSubscription = Math.min(p.housingSubscription, hs.cap) * hs.rate;
    const lease = standard ? 0 : p.leaseLoanRepay * R.leaseLoan.rate;
    const combined = Math.min(housingSubscription + lease, R.housingCombinedCap);
    housingLoan = combined - Math.min(housingSubscription, combined);
    housingSubscription = Math.min(housingSubscription, combined);
  }
  if (!standard && p.mortgageInterest > 0) {
    // 주담대 이자 한도에는 청약·전세대출 공제액이 함께 포함된다
    housingLoan += Math.min(p.mortgageInterest, pos(p.mortgageCap - housingSubscription - housingLoan));
  }

  const kids = eligibleDeps.filter((d) => d.relation === 'child').length;
  const card = cardDeduction(salary, p.cards, kids);

  const totalIncomeDeduction = floor(
    personalBasic + personalExtra + pensionInsurance + healthEmployment + housingLoan + housingSubscription + card.deduction,
  );
  const taxBase = pos(earnedIncome - totalIncomeDeduction);
  const tax = computedTax(taxBase);
  const marginalRate = taxBase > 0 ? bracketFor(taxBase).rate : 0;

  // 세액공제
  const credits: Credits = {
    earned: earnedCredit(tax, salary),
    child: 0,
    birth: 0,
    marriage: p.marriage ? R.marriageCredit : 0,
    pension: 0,
    insurance: 0,
    medical: 0,
    education: 0,
    donation: 0,
    politicalHometown: politicalCredit(p.donations.political) + hometownCredit(p.donations.hometown),
    rent: 0,
    standard: 0,
  };

  const childCreditKids = eligibleDeps.filter((d) => d.relation === 'child' && d.age >= R.child.minAge).length;
  const amts = R.child.amounts;
  for (let i = 0; i < childCreditKids; i++) credits.child += amts[Math.min(i, amts.length - 1)];
  for (const d of p.dependents) {
    if (d.relation === 'child' && d.age === 0 && d.birthOrder > 0) {
      credits.birth += R.child.birth[Math.min(d.birthOrder, 3) - 1];
    }
  }

  const pr = R.pension;
  const pensionBase = Math.min(Math.min(p.pensionSavings, pr.savingsCap) + p.irp, pr.totalCap);
  credits.pension = floor(pensionBase * (salary <= pr.salaryThreshold ? pr.highRate : pr.lowRate));

  let medical: MedicalResult;
  if (standard) {
    medical = medicalCredit(salary, 0, 0);
    credits.standard = R.standardCredit;
  } else {
    const ins = R.insurance;
    credits.insurance = floor(
      Math.min(p.insurance, ins.cap) * ins.rate + Math.min(p.disabledInsurance, ins.disabledCap) * ins.disabledRate,
    );

    let general = p.spouseMedicalSpecific ? 0 : p.spouseMedical;
    let specific = p.ownMedical + (p.spouseMedicalSpecific ? p.spouseMedical : 0);
    let edu = p.ownEducation;
    const e = R.education;
    for (const d of p.dependents) {
      if (isMedicalSpecific(d)) specific += d.medical;
      else general += d.medical;
      if (d.educationType === 'disabledSpecial') edu += d.education;
      else if (d.relation !== 'parent') {
        if (d.educationType === 'preschool' || d.educationType === 'school') edu += Math.min(d.education, e.schoolCap);
        else if (d.educationType === 'university') edu += Math.min(d.education, e.univCap);
      }
    }
    medical = medicalCredit(salary, general, specific);
    credits.medical = medical.credit;
    credits.education = floor(edu * e.rate);
    credits.donation = generalDonationCredit(p.donations.general, earnedIncome);

    const rr = R.rent;
    if (p.isHead && salary <= rr.salaryLimit) {
      credits.rent = floor(Math.min(p.rent, rr.cap) * (salary <= rr.rateThreshold ? rr.highRate : rr.lowRate));
    }
  }

  const totalCredits = Object.values(credits).reduce((s, v) => s + v, 0);
  const determinedTax = pos(tax - totalCredits);
  const lostCredits = pos(totalCredits - tax);
  const localTax = floor(determinedTax * R.localTaxRate);

  return {
    salary,
    earnedDeduction,
    earnedIncome,
    personalBasic,
    personalExtra,
    basicCount,
    pensionInsurance,
    healthEmployment,
    housingLoan: floor(housingLoan),
    housingSubscription: floor(housingSubscription),
    card,
    totalIncomeDeduction,
    taxBase,
    marginalRate,
    computedTax: tax,
    medical,
    credits,
    totalCredits,
    lostCredits,
    determinedTax,
    localTax,
    totalTax: determinedTax + localTax,
    withheld: p.withheld,
    refund: p.withheld > 0 ? p.withheld - determinedTax : null,
    usedStandard: standard,
    childCreditCount: childCreditKids,
  };
}

/** 항목별 공제와 표준세액공제(13만원) 중 유리한 쪽을 자동 선택한다. */
export function computePersonTax(p: PersonTaxInput): TaxResult {
  const itemized = compute(p, false);
  if (itemized.determinedTax === 0) return itemized;
  const std = compute(p, true);
  return std.determinedTax < itemized.determinedTax ? std : itemized;
}
