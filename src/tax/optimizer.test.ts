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
