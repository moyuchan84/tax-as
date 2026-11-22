import { toActual } from './timeline';
import type { DependentInput, HouseholdInput, PersonProfile } from './types';

const M = 10_000;

export function emptyPerson(name: string): PersonProfile {
  return {
    name,
    salary: 0,
    age: 35,
    disabled: false,
    autoSocial: true,
    pension: 0,
    health: 0,
    employment: 0,
    cards: { credit: 0, debitCash: 0, market: 0, transport: 0, culture: 0 },
    medical: 0,
    insurance: 0,
    disabledInsurance: 0,
    ownEducation: 0,
    pensionSavings: 0,
    irp: 0,
    housingSubscription: 0,
    mortgageInterest: 0,
    mortgageCap: 8_000_000,
    donations: { statutory: 0, general: 0, religious: 0, political: 0, hometown: 0 },
    marriage: false,
    withheld: 0,
  };
}

export function newDependent(partial: Partial<DependentInput> = {}): DependentInput {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: '',
    relation: 'child',
    age: 5,
    disabled: false,
    educationType: 'none',
    education: 0,
    medical: 0,
    assignedTo: 'h',
    locked: false,
    ...partial,
  };
}

/** 예시: 남편 8,500만 / 아내 4,200만, 자녀 2명, 어머니 1명 */
export function sampleHousehold(): HouseholdInput {
  return {
    husband: {
      ...emptyPerson('남편'),
      salary: 8500 * M,
      age: 40,
      cards: { credit: 2400 * M, debitCash: 300 * M, market: 50 * M, transport: 60 * M, culture: 30 * M },
      medical: 80 * M,
      insurance: 120 * M,
      pensionSavings: 300 * M,
      donations: { statutory: 0, general: 60 * M, religious: 120 * M, political: 0, hometown: 10 * M },
    },
    wife: {
      ...emptyPerson('아내'),
      salary: 4200 * M,
      age: 38,
      cards: { credit: 600 * M, debitCash: 400 * M, market: 30 * M, transport: 40 * M, culture: 20 * M },
      medical: 150 * M,
      insurance: 80 * M,
      donations: { statutory: 0, general: 0, religious: 0, political: 0, hometown: 0 },
    },
    dependents: [
      newDependent({ name: '첫째', age: 11, educationType: 'school', education: 400 * M, medical: 60 * M, assignedTo: 'h' }),
      newDependent({ name: '둘째', age: 6, educationType: 'preschool', education: 250 * M, medical: 120 * M, assignedTo: 'h' }),
      newDependent({ name: '어머니', relation: 'parent', age: 72, medical: 300 * M, assignedTo: 'h' }),
    ],
    housing: { head: 'h', headLocked: false, rent: 0, leaseLoanRepay: 0 },
    flex: { cards: true, medical: true, donations: true },
  };
}

/** 싱글 예시: 총급여 6,000만원 직장인 */
export function sampleSingle(): HouseholdInput {
  const s = sampleHousehold();
  return {
    ...s,
    husband: { ...s.husband, name: '본인', salary: 6000 * M, age: 34, medical: 40 * M, insurance: 60 * M, cards: { credit: 1200 * M, debitCash: 500 * M, market: 20 * M, transport: 40 * M, culture: 20 * M }, donations: { statutory: 0, general: 0, religious: 0, political: 0, hometown: 10 * M }, pensionSavings: 200 * M },
    wife: emptyPerson('배우자'),
    dependents: [],
    housing: { head: 'h', headLocked: true, rent: 0, leaseLoanRepay: 0 },
    flex: { cards: false, medical: false, donations: false },
    single: true,
  };
}

/** 연말 점검 예시: 예시 가구의 10월 말까지 실제 사용액과 남은 2개월 예상 */
export function sampleYearEnd(single = false): HouseholdInput {
  const base = single ? sampleSingle() : sampleHousehold();
  return toActual(base, 10);
}
