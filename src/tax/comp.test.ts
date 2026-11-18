import { COMP, compPersonTax, yellowLimit, type CompCtx } from './comp';
import { emptyCompPerson, evalComp, optimizeComp, shiftCurve, baselineCompAlloc } from './compHousehold';
import type { CompHousehold, CompPerson } from './comp';
import type { DependentInput } from './types';

const M = 10_000;
const ctx: CompCtx = { deps: [], spouse: null, female: false };

const biz = (revenue: number, over: Partial<CompPerson['business']> = {}): CompPerson => ({
  ...emptyCompPerson('사업자'),
  hasBusiness: true,
  business: { ...emptyCompPerson('x').business, revenue, expenseMode: 'actual', expense: revenue * 0.4, ...over },
});

describe('사업소득', () => {
  it('매출 − 경비로 사업소득금액, 기본공제·표준세액공제 후 세금', () => {
    const r = compPersonTax(biz(10_000 * M), ctx);
    expect(r.businessIncome).toBe(6_000 * M);
    // 과세표준 = 6,000만 − 본인 150만 = 5,850만 → 24% 구간
    expect(r.taxBase).toBe(6000 * M - 150 * M);
    expect(r.marginalRate).toBe(0.24);
    expect(r.credits.standard).toBe(COMP.standardNoWage);
    expect(r.totalTax).toBe(r.incomeTax + r.localTax);
  });
  it('노란우산 한도는 소득 구간별', () => {
    expect(yellowLimit(3000 * M)).toBe(600 * M);
    expect(yellowLimit(7000 * M)).toBe(400 * M);
    expect(yellowLimit(2e8)).toBe(200 * M);
  });
  it('노란우산·간편장부 기장세액공제로 세금이 줄고 한도를 넘는 납입은 무시', () => {
    const base = compPersonTax(biz(10_000 * M), ctx);
    const y = compPersonTax(biz(10_000 * M, { yellowUmbrella: 1000 * M }), ctx);
    expect(y.deductions.yellow).toBe(400 * M); // 소득 6천만 → 한도 400만
    expect(y.totalTax).toBeLessThan(base.totalTax);
    const b = compPersonTax(biz(10_000 * M, { bookkeeping: 'simple' }), ctx);
    expect(b.credits.bookkeeping).toBeGreaterThan(0);
    expect(b.credits.bookkeeping).toBeLessThanOrEqual(COMP.bookkeepingCredit.cap);
  });
  it('프리랜서 3.3%는 기납부세액으로 정산', () => {
    const r = compPersonTax(biz(3000 * M, { withholding33: true }), ctx);
    expect(r.prepaid).toBe(90 * M);
    expect(r.payable).toBe(Math.floor((r.incomeTax - r.prepaid) * 1.1));
  });
});

describe('주택임대', () => {
  const landlord = (revenue: number, registered: boolean, choice: 'auto' | 'separate' | 'comprehensive'): CompPerson => ({
    ...emptyCompPerson('임대인'),
    hasRental: true,
    rental: { ...emptyCompPerson('x').rental, houseRevenue: revenue, houseRegistered: registered, houseChoice: choice },
  });
  it('수입 2천만 이하 미등록: (수입×50% − 200만)×14%', () => {
    const r = compPersonTax(landlord(1800 * M, false, 'separate'), ctx);
    expect(r.houseMode).toBe('separate');
    expect(r.houseSeparateTax).toBe(Math.floor((1800 * M * 0.5 - 200 * M) * 0.14));
    expect(r.totalIncome).toBe(0);
  });
  it('등록임대는 경비율 60%·공제 400만원이라 분리과세 세금이 더 적다', () => {
    const un = compPersonTax(landlord(1800 * M, false, 'separate'), ctx).houseSeparateTax;
    const re = compPersonTax(landlord(1800 * M, true, 'separate'), ctx).houseSeparateTax;
    expect(re).toBeLessThan(un);
  });
  it('수입 2천만 초과는 분리과세 불가 → 종합과세', () => {
    expect(compPersonTax(landlord(2500 * M, false, 'separate'), ctx).houseMode).toBe('comprehensive');
  });
  it('auto는 더 적은 쪽을 고른다', () => {
    const sep = compPersonTax(landlord(1500 * M, false, 'separate'), ctx).totalTax;
    const com = compPersonTax(landlord(1500 * M, false, 'comprehensive'), ctx).totalTax;
    expect(compPersonTax(landlord(1500 * M, false, 'auto'), ctx).totalTax).toBe(Math.min(sep, com));
  });
});

describe('근로 + 사업 합산', () => {
  it('근로소득세액공제는 근로소득 비중만큼만 적용', () => {
    const p: CompPerson = { ...biz(5000 * M), hasWage: true, wage: { salary: 4000 * M, otherDeduction: 0, otherCredit: 0, withheld: 0 } };
    const r = compPersonTax(p, ctx);
    expect(r.wageIncome).toBeGreaterThan(0);
    expect(r.totalIncome).toBe(r.wageIncome + r.businessIncome);
    expect(r.credits.earned).toBeGreaterThan(0);
    expect(r.credits.standard).toBe(130_000);
  });
});

describe('부부 최적화·소득 분산', () => {
  const dep = (over: Partial<DependentInput>): DependentInput => ({
    id: 'a', name: '자녀', relation: 'child', age: 12, disabled: false, educationType: 'none', education: 0, medical: 0, assignedTo: 'h', locked: false, ...over,
  });
  const couple = (): CompHousehold => ({
    single: false,
    people: [
      { ...emptyCompPerson('남편'), hasRental: true, rental: { ...emptyCompPerson('x').rental, shopRevenue: 12000 * M, shopExpense: 2000 * M } },
      { ...emptyCompPerson('아내'), hasWage: true, wage: { salary: 2500 * M, otherDeduction: 0, otherCredit: 0, withheld: 0 } },
    ],
    dependents: [dep({})],
  });

  it('소득이 한쪽에 몰린 부부는 분산하면 세금이 줄어든다', () => {
    const hh = couple();
    const o = optimizeComp(hh);
    expect(o.bestShift).not.toBeNull();
    expect(o.shiftSavings).toBeGreaterThan(0);
    const curve = shiftCurve(hh, o.best.deps, 'h', 'rental');
    expect(curve[0].total).toBeGreaterThan(Math.min(...curve.map((c) => c.total)));
  });

  it('외벌이: 소득 없는 배우자는 배우자공제 대상이 되어 세금이 줄어든다', () => {
    const hh: CompHousehold = { single: false, people: [{ ...emptyCompPerson('남편'), hasBusiness: true, business: { ...emptyCompPerson('x').business, revenue: 8000 * M, expense: 3000 * M } }, emptyCompPerson('아내')], dependents: [] };
    const withSpouse = evalComp(hh, baselineCompAlloc(hh));
    const single = evalComp({ ...hh, single: true, people: [hh.people[0]] }, baselineCompAlloc({ ...hh, single: true }));
    expect(withSpouse.people[0].basicCount).toBe(2);
    expect(withSpouse.total).toBeLessThan(single.total);
  });

  it('싱글은 분산 전략이 없다', () => {
    const hh: CompHousehold = { single: true, people: [{ ...emptyCompPerson('본인'), hasBusiness: true, business: { ...emptyCompPerson('x').business, revenue: 8000 * M, expense: 3000 * M } }], dependents: [] };
    expect(optimizeComp(hh).bestShift).toBeNull();
  });
});
