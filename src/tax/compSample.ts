import type { CompHousehold } from './comp';
import { emptyCompPerson } from './compHousehold';
import { newDependent } from './sample';

const M = 10_000;

/** 예시: 남편은 개인사업자 + 주택임대, 아내는 직장인, 자녀 2명 */
export function sampleComp(): CompHousehold {
  const h = emptyCompPerson('남편');
  const w = emptyCompPerson('아내');
  return {
    single: false,
    people: [
      {
        ...h,
        age: 42,
        hasBusiness: true,
        hasRental: true,
        business: { ...h.business, revenue: 14_000 * M, expenseMode: 'actual', expense: 6_500 * M, bookkeeping: 'none', pension: 200 * M },
        rental: { ...h.rental, houseRevenue: 1_800 * M, houseRegistered: false, houseChoice: 'auto', shopRevenue: 0 },
      },
      {
        ...w,
        age: 40,
        hasWage: true,
        wage: { salary: 4_000 * M, otherDeduction: 120 * M, otherCredit: 30 * M, withheld: 180 * M },
      },
    ],
    dependents: [newDependent({ name: '첫째', age: 11 }), newDependent({ name: '둘째', age: 7 })],
  };
}

/** 예시: 싱글 프리랜서 (3.3% 원천징수) */
export function sampleCompSingle(): CompHousehold {
  const p = emptyCompPerson('본인');
  return {
    single: true,
    people: [{ ...p, age: 33, hasBusiness: true, business: { ...p.business, revenue: 6_000 * M, expenseMode: 'rate', expenseRate: 0.641, withholding33: true, bookkeeping: 'none' } }],
    dependents: [],
  };
}
