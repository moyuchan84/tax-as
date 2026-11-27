import { bracketFor, computedTax, earnedCredit, earnedIncomeDeduction, estimateSocial, isBasicEligible, pensionCaps } from './engine';
import { RULES } from './rules';
import type { DependentInput, Spouse } from './types';

/**
 * 종합소득세(근로·사업·임대 합산) 계산. 2026년 귀속(2027년 5월 신고) 기준.
 * `verify: true` 로 표시한 수치는 개정·고시에 따라 달라질 수 있어 신고 전 확인이 필요하다.
 */
export const COMP = {
  /** 노란우산공제 소득공제 한도 (사업소득금액 구간별) */
  yellowUmbrella: [
    { upTo: 40_000_000, cap: 6_000_000 },
    { upTo: 100_000_000, cap: 4_000_000 },
    { upTo: Infinity, cap: 2_000_000 },
  ],
  bookkeepingCredit: { rate: 0.2, cap: 1_000_000 }, // 간편장부대상자 기장세액공제
  eFiling: 20_000,
  standardNoWage: 70_000, // 근로소득 없는 거주자 표준세액공제
  withholding33: 0.03, // 프리랜서 3.3% 중 소득세 3%
  pensionCreditThreshold: { wage: 55_000_000, income: 45_000_000 },
  rental: {
    separateRate: 0.14,
    revenueLimit: 20_000_000, // 주택임대 수입 2천만원 이하만 분리과세 선택 가능
    expenseRate: { registered: 0.6, unregistered: 0.5 }, // 분리과세 시 필요경비율
    basicDeduction: { registered: 4_000_000, unregistered: 2_000_000 },
    otherIncomeLimit: 20_000_000, // 다른 종합소득금액이 이 이하일 때만 기본공제
    defaultHouseExpenseRate: 0.426, // 종합과세 추계 시 단순경비율 예시 (업종·연도별 고시값 확인 필요)
    verify: true,
  },
  shopSimpleLimit: 24_000_000,
} as const;

export type Bookkeeping = 'none' | 'simple' | 'complex';
export type HouseChoice = 'auto' | 'separate' | 'comprehensive';
export type ExpenseMode = 'actual' | 'rate';

export interface CompPerson {
  name: string;
  age: number;
  disabled: boolean;
  hasWage: boolean;
  hasBusiness: boolean;
  hasRental: boolean;
  wage: {
    salary: number;
    otherDeduction: number; // 연말정산 소득공제 합계(카드·보험료·주택자금 등)
    otherCredit: number; // 연말정산 세액공제 합계(의료·교육·기부·월세 등)
    withheld: number; // 원천징수(근로) 소득세
  };
  business: {
    revenue: number;
    expenseMode: ExpenseMode;
    expense: number;
    expenseRate: number;
    bookkeeping: Bookkeeping;
    withholding33: boolean;
    pension: number; // 지역가입 국민연금 납부액
    yellowUmbrella: number; // 노란우산공제 납입액
  };
  rental: {
    houseRevenue: number; // 주택 임대수입(월세 합계)
    houseRegistered: boolean; // 등록임대주택
    houseChoice: HouseChoice;
    houseExpenseMode: ExpenseMode;
    houseExpense: number;
    houseExpenseRate: number;
    shopRevenue: number; // 상가·오피스텔(업무용) 등 임대수입
    shopExpense: number;
  };
  pensionSavings: number;
  irp: number;
  prepaid: number; // 기타 기납부세액(중간예납 등)
}

export interface CompHousehold {
  single: boolean;
  people: CompPerson[]; // [본인/남편, 배우자/아내?]
  dependents: DependentInput[];
}

export interface CompCtx {
  deps: Pick<DependentInput, 'relation' | 'age' | 'disabled'>[];
  spouse: { age: number; disabled: boolean } | null;
  female: boolean;
}

export interface CompResult {
  wageIncome: number;
  businessIncome: number; // 사업소득금액 (결손 포함)
  shopIncome: number;
  houseIncomeComp: number; // 종합과세로 합산된 주택임대소득금액
  houseMode: 'separate' | 'comprehensive' | 'none';
  houseSeparateTax: number;
  totalIncome: number; // 종합소득금액
  deductions: { personal: number; pension: number; yellow: number; wageOther: number; social: number; total: number };
  taxBase: number;
  marginalRate: number;
  computedTax: number;
  credits: { earned: number; child: number; pension: number; bookkeeping: number; eFiling: number; standard: number; total: number };
  determinedTax: number; // 종합과세 결정세액(소득세)
  incomeTax: number; // 종합 + 분리과세
  localTax: number;
  totalTax: number; // 소득세 + 지방소득세
  prepaid: number;
  payable: number; // +납부 / −환급 (소득세 기준 × 1.1)
  basicCount: number;
  yellowLimit: number;
  nextBracket: { rate: number; room: number } | null; // 다음 세율 구간까지 남은 과세표준
}

const pos = (n: number) => Math.max(0, n);
const floor = Math.floor;

export function yellowLimit(businessIncome: number): number {
  return COMP.yellowUmbrella.find((t) => businessIncome <= t.upTo)!.cap;
}

export function businessIncomeOf(p: CompPerson): number {
  if (!p.hasBusiness) return 0;
  const b = p.business;
  return b.revenue - (b.expenseMode === 'actual' ? b.expense : b.revenue * b.expenseRate);
}

export function shopIncomeOf(p: CompPerson): number {
  if (!p.hasRental) return 0;
  return pos(p.rental.shopRevenue - p.rental.shopExpense); // 부동산임대업 결손은 다른 소득과 통산 불가
}

function houseIncomeCompOf(p: CompPerson): number {
  if (!p.hasRental) return 0;
  const r = p.rental;
  const exp = r.houseExpenseMode === 'actual' ? r.houseExpense : r.houseRevenue * r.houseExpenseRate;
  return pos(r.houseRevenue - exp);
}

function separateTaxOf(p: CompPerson, otherIncome: number): number | null {
  if (!p.hasRental || p.rental.houseRevenue <= 0 || p.rental.houseRevenue > COMP.rental.revenueLimit) return null;
  const R = COMP.rental;
  const reg = p.rental.houseRegistered;
  const exp = p.rental.houseRevenue * (reg ? R.expenseRate.registered : R.expenseRate.unregistered);
  const basic = otherIncome <= R.otherIncomeLimit ? (reg ? R.basicDeduction.registered : R.basicDeduction.unregistered) : 0;
  return floor(pos(p.rental.houseRevenue - exp - basic) * R.separateRate);
}

function calc(p: CompPerson, ctx: CompCtx, houseMode: 'separate' | 'comprehensive'): CompResult {
  const per = RULES.personal;
  const S = p.hasWage ? p.wage.salary : 0;
  const wageIncome = S > 0 ? pos(S - earnedIncomeDeduction(S)) : 0;
  const businessIncome = businessIncomeOf(p);
  const shopIncome = shopIncomeOf(p);
  const hasHouse = p.hasRental && p.rental.houseRevenue > 0;
  const otherForSep = pos(wageIncome + businessIncome + shopIncome);

  const sepTax = hasHouse && houseMode === 'separate' ? separateTaxOf(p, otherForSep) : null;
  const mode: CompResult['houseMode'] = !hasHouse ? 'none' : sepTax !== null ? 'separate' : 'comprehensive';
  const houseIncomeComp = hasHouse && mode === 'comprehensive' ? houseIncomeCompOf(p) : 0;
  const totalIncome = pos(wageIncome + businessIncome + shopIncome + houseIncomeComp);

  // 인적공제
  const eligible = ctx.deps.filter(isBasicEligible);
  const basicCount = 1 + eligible.length + (ctx.spouse ? 1 : 0);
  let personal = basicCount * per.basic;
  if (p.disabled) personal += per.disabled;
  if (p.age >= per.elderlyAge) personal += per.elderly;
  if (ctx.female && totalIncome <= per.womanIncomeLimit && (eligible.length > 0 || ctx.spouse)) personal += per.woman;
  for (const d of eligible) {
    if (d.disabled) personal += per.disabled;
    if (d.age >= per.elderlyAge) personal += per.elderly;
  }
  if (ctx.spouse) {
    if (ctx.spouse.disabled) personal += per.disabled;
    if (ctx.spouse.age >= per.elderlyAge) personal += per.elderly;
  }

  const social = p.hasWage ? estimateSocial(S) : { pension: 0, health: 0, employment: 0 };
  const pensionDed = social.pension + (p.hasBusiness ? p.business.pension : 0);
  const socialOther = social.health + social.employment;
  const yLimit = p.hasBusiness ? yellowLimit(businessIncome) : 0;
  const yellow = p.hasBusiness ? Math.min(p.business.yellowUmbrella, yLimit, pos(businessIncome)) : 0;
  const wageOther = p.hasWage ? p.wage.otherDeduction : 0;
  const dedTotal = personal + pensionDed + socialOther + yellow + wageOther;
  const taxBase = pos(totalIncome - dedTotal);
  const tax = computedTax(taxBase);
  const marginalRate = taxBase > 0 ? bracketFor(taxBase).rate : 0;

  // 세액공제
  const wageShare = totalIncome > 0 ? wageIncome / totalIncome : 0;
  const earned = p.hasWage ? earnedCredit(tax * wageShare, S) : 0;
  const childAmts = RULES.child.amounts;
  const kids = eligible.filter((d) => d.relation === 'child' && d.age >= RULES.child.minAge).length;
  let child = 0;
  for (let i = 0; i < kids; i++) child += childAmts[Math.min(i, childAmts.length - 1)];
  const pr = RULES.pension;
  const wageOnly = p.hasWage && !p.hasBusiness && !p.hasRental;
  const caps = pensionCaps(S, wageOnly ? undefined : totalIncome);
  const pensionBase = Math.min(Math.min(p.pensionSavings, caps.savingsCap) + p.irp, caps.totalCap);
  const high = p.hasWage ? S <= COMP.pensionCreditThreshold.wage : totalIncome <= COMP.pensionCreditThreshold.income;
  const pension = floor(pensionBase * (high ? pr.highRate : pr.lowRate));
  const bookkeeping =
    p.hasBusiness && p.business.bookkeeping === 'simple' && totalIncome > 0
      ? floor(Math.min(tax * (pos(businessIncome) / totalIncome) * COMP.bookkeepingCredit.rate, COMP.bookkeepingCredit.cap))
      : 0;
  const hasFiling = totalIncome > 0 && (p.hasBusiness || p.hasRental);
  const eFiling = hasFiling ? COMP.eFiling : 0;
  const standard = p.hasWage ? Math.max(p.wage.otherCredit, RULES.standardCredit) : COMP.standardNoWage;
  const creditTotal = earned + child + pension + bookkeeping + eFiling + standard;
  const determined = pos(tax - creditTotal);

  const sep = sepTax ?? 0;
  const incomeTax = determined + sep;
  const localTax = floor(incomeTax * RULES.localTaxRate);
  const prepaid =
    (p.hasWage ? p.wage.withheld : 0) + (p.hasBusiness && p.business.withholding33 ? floor(p.business.revenue * COMP.withholding33) : 0) + p.prepaid;

  const idx = RULES.brackets.findIndex((b) => taxBase <= b.upTo);
  const nextBracket = idx >= 0 && idx < RULES.brackets.length - 1 ? { rate: RULES.brackets[idx + 1].rate, room: RULES.brackets[idx].upTo - taxBase } : null;

  return {
    wageIncome,
    businessIncome,
    shopIncome,
    houseIncomeComp,
    houseMode: mode,
    houseSeparateTax: sep,
    totalIncome,
    deductions: { personal, pension: pensionDed, yellow, wageOther, social: socialOther, total: dedTotal },
    taxBase,
    marginalRate,
    computedTax: tax,
    credits: { earned, child, pension, bookkeeping, eFiling, standard, total: creditTotal },
    determinedTax: determined,
    incomeTax,
    localTax,
    totalTax: incomeTax + localTax,
    prepaid,
    payable: floor((incomeTax - prepaid) * (1 + RULES.localTaxRate)),
    basicCount,
    yellowLimit: yLimit,
    nextBracket,
  };
}

/** 주택임대 분리/종합 선택을 반영한 개인 종합소득세 (auto면 세금이 적은 쪽 선택) */
export function compPersonTax(p: CompPerson, ctx: CompCtx): CompResult {
  const choice = p.hasRental ? p.rental.houseChoice : 'comprehensive';
  if (choice === 'separate') return calc(p, ctx, 'separate');
  if (choice === 'comprehensive') return calc(p, ctx, 'comprehensive');
  const a = calc(p, ctx, 'separate');
  const b = calc(p, ctx, 'comprehensive');
  return a.totalTax <= b.totalTax ? a : b;
}

/** 주택임대 과세 방식을 지정해 계산 (분리/종합 비교용) */
export function compPersonTaxMode(p: CompPerson, ctx: CompCtx, mode: 'separate' | 'comprehensive'): CompResult {
  return calc(p, ctx, mode);
}

export function estimateSocialFor(p: CompPerson) {
  return p.hasWage ? estimateSocial(p.wage.salary) : { pension: 0, health: 0, employment: 0 };
}

export type { Spouse };
