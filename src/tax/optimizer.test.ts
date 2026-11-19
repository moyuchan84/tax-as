import { optimizeHousehold } from './optimizer';
import { sampleHousehold, emptyPerson, newDependent } from './sample';
import type { HouseholdInput } from './types';

const M = 10_000;

describe('부부 최적화', () => {
  it('예시 가구: 현재보다 나빠지지 않고, 배분 합계가 보존된다', () => {
    const hh = sampleHousehold();
    const r = optimizeHousehold(hh);
    expect(r.bestResult.total).toBeLessThanOrEqual(r.baselineResult.total);
    expect(r.savings).toBeGreaterThan(0);
    const hCards = r.best.h.credit;
    expect(hCards).toBeGreaterThanOrEqual(0);
    expect(hCards).toBeLessThanOrEqual(3000 * M);
  });

  it('의료비는 3% 문턱이 낮은 배우자에게 몰린다', () => {
    const hh: HouseholdInput = {
      husband: { ...emptyPerson('남편'), salary: 9000 * M, medical: 300 * M, insurance: 100 * M },
      wife: { ...emptyPerson('아내'), salary: 4000 * M, insurance: 100 * M },
      dependents: [],
      housing: { head: 'h', headLocked: true, rent: 0, leaseLoanRepay: 0 },
      flex: { cards: false, medical: true, donations: false },
    };
    const r = optimizeHousehold(hh);
    // 남편 문턱 270만 vs 아내 문턱 120만 → 아내가 결제하는 편이 유리
    expect(r.best.h.hMed).toBeLessThan(300 * M);
    expect(r.savings).toBeGreaterThan(0);
  });

  it('고정한 부양가족은 옮기지 않는다', () => {
    const hh = sampleHousehold();
    hh.dependents = hh.dependents.map((d) => ({ ...d, locked: true }));
    const r = optimizeHousehold(hh);
    expect(r.best.deps).toEqual(hh.dependents.map((d) => d.assignedTo));
  });

  it('정치자금 기부는 부부가 10만원씩 나누는 편이 유리', () => {
    const hh: HouseholdInput = {
      husband: { ...emptyPerson('남편'), salary: 6000 * M, donations: { general: 0, political: 20 * M, hometown: 0 } },
      wife: { ...emptyPerson('아내'), salary: 5000 * M },
      dependents: [newDependent({ age: 30, relation: 'other', locked: true })],
      housing: { head: 'h', headLocked: true, rent: 0, leaseLoanRepay: 0 },
      flex: { cards: false, medical: false, donations: true },
    };
    const r = optimizeHousehold(hh);
    expect(r.best.h.donPolitical).toBe(10 * M);
  });
});

describe('연말 점검(actual) 모드: 이미 쓴 카드는 명의 고정, 남은 지출만 배분', () => {
  const base = () => {
    const hh = sampleHousehold();
    hh.time = { mode: 'actual', month: 10 };
    // 10월 말까지 실제: 남편 신용 1,000만, 아내 신용 300만. 남은 기간 예상: 신용 400만
    hh.husband.cards = { credit: 1000 * M, debitCash: 0, market: 0, transport: 0, culture: 0 };
    hh.wife.cards = { credit: 300 * M, debitCash: 0, market: 0, transport: 0, culture: 0 };
    hh.remaining = { credit: 400 * M, debitCash: 0, market: 0, transport: 0, culture: 0 };
    return hh;
  };
  it('배분 대상 총액은 남은 기간 지출이다', async () => {
    const { pooledTotals } = await import('./household');
    expect(pooledTotals(base()).credit).toBe(400 * M);
  });
  it('기준선은 지금까지 쓰던 비율(남편 1000:아내 300)대로 남은 지출을 나눈다', async () => {
    const { baselineAllocation } = await import('./household');
    expect(baselineAllocation(base()).h.credit).toBeCloseTo((400 * M * 1000) / 1300, 0);
  });
  it('각자의 카드 사용액 = 이미 쓴 금액 + 배분분 (합계는 보존)', async () => {
    const { buildPersonInputs } = await import('./household');
    const hh = base();
    const r = optimizeHousehold(hh);
    const inp = buildPersonInputs(hh, r.best);
    expect(inp.h.cards.credit).toBeGreaterThanOrEqual(1000 * M);
    expect(inp.w.cards.credit).toBeGreaterThanOrEqual(300 * M);
    expect(Math.round(inp.h.cards.credit + inp.w.cards.credit)).toBe(1700 * M);
    expect(r.bestResult.total).toBeLessThanOrEqual(r.baselineResult.total);
  });
  it('plan 모드와 달리 과거 지출은 옮길 수 없다 (전부 한쪽으로 몰 수 있는 plan보다 절세 폭이 작거나 같다)', () => {
    const actual = base();
    const plan = { ...actual, time: { mode: 'plan' as const, month: 10 } };
    // plan에서는 합계 1,300만 전부 재배분 가능
    expect(optimizeHousehold(plan).savings).toBeGreaterThanOrEqual(optimizeHousehold(actual).savings);
  });
});
