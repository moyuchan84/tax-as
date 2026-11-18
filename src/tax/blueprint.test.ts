import { buildBlueprint } from './blueprint';
import { emptyPerson, newDependent, sampleHousehold } from './sample';
import type { HouseholdInput } from './types';

const M = 10_000;

describe('시작 가이드 (지출 없이 소득·가족만으로)', () => {
  it('지출을 전부 비워도 문턱·한도·환급률이 계산된다', () => {
    const hh = sampleHousehold();
    // 지출 입력은 무시되어야 한다
    const b = buildBlueprint(hh);
    expect(b.empty).toBe(false);
    expect(b.persons.h.thr).toBe(8500 * M * 0.25);
    expect(b.persons.w.thr).toBe(4200 * M * 0.25);
    expect(b.persons.h.refund.debit).toBeCloseTo(0.3 * b.persons.h.marginal, 6);
    expect(b.persons.h.refund.debit).toBeGreaterThan(b.persons.h.refund.credit);
    expect(b.persons.h.refund.special).toBeGreaterThan(b.persons.h.refund.debit);
    expect(b.persons.h.pension.gain).toBeGreaterThan(0);
    expect(b.breakeven).not.toBeNull();
    expect(b.breakevenText!.headline).toContain('구간');
  });

  it('소득이 없으면 empty', () => {
    const hh: HouseholdInput = {
      husband: emptyPerson('남편'),
      wife: emptyPerson('아내'),
      dependents: [newDependent()],
      housing: { head: 'h', headLocked: false, rent: 0, leaseLoanRepay: 0 },
      flex: { cards: true, medical: true, donations: true },
    };
    expect(buildBlueprint(hh).empty).toBe(true);
  });

  it('부양가족 배정 추천이 포함되고, 자녀가 있는 쪽의 카드 한도가 늘어난다', () => {
    const hh = sampleHousehold();
    const b = buildBlueprint(hh);
    expect(b.deps.length).toBe(hh.dependents.length);
    const holder = b.persons.h.kids >= b.persons.w.kids ? b.persons.h : b.persons.w;
    expect(holder.baseLimit).toBeGreaterThanOrEqual(3_000_000);
  });
});
