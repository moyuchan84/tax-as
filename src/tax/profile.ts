import { emptyCompPerson } from './compHousehold';
import type { CompHousehold, CompPerson } from './comp';
import { emptyPerson, newDependent } from './sample';
import type { HouseholdInput } from './types';

/** 시작 페이지에서 고르는 가구 구성과 소득 유형 */
export interface IncomeKinds {
  wage: boolean; // 근로소득(직장인)
  business: boolean; // 사업소득(개인사업자·프리랜서)
  rental: boolean; // 임대소득(주택·상가 월세)
}
export interface Profile {
  kind: 'single' | 'couple';
  a: IncomeKinds; // 본인(1번)
  b: IncomeKinds; // 배우자(2번)
  children: number;
}
export type AppMode = 'wage' | 'comprehensive';

export const NO_INCOME: IncomeKinds = { wage: false, business: false, rental: false };
export const defaultProfile = (): Profile => ({ kind: 'couple', a: { ...NO_INCOME, wage: true }, b: { ...NO_INCOME, wage: true }, children: 0 });

const hasExtra = (k: IncomeKinds) => k.business || k.rental;
const hasAny = (k: IncomeKinds) => k.wage || k.business || k.rental;

/** 사업·임대 소득이 하나라도 있으면 종합소득세 모드, 근로소득뿐이면 연말정산 모드 */
export function modeOf(p: Profile): AppMode {
  return hasExtra(p.a) || (p.kind === 'couple' && hasExtra(p.b)) ? 'comprehensive' : 'wage';
}

export const profileValid = (p: Profile) => hasAny(p.a);
export const profileKey = (p: Profile) => JSON.stringify(p.kind === 'single' ? { ...p, b: NO_INCOME } : p);

export function describeProfile(p: Profile): string {
  const kinds = (k: IncomeKinds) =>
    [k.wage && '직장인', k.business && '사업자·프리랜서', k.rental && '임대'].filter(Boolean).join(' + ') || '소득 없음';
  if (p.kind === 'single') return `싱글 · ${kinds(p.a)}`;
  const pattern = hasAny(p.a) && hasAny(p.b) ? '맞벌이' : '외벌이';
  return `부부(${pattern}) · 본인 ${kinds(p.a)} / 배우자 ${kinds(p.b)}`;
}

const kids = (n: number, who: 'h' | 'w' = 'h') =>
  Array.from({ length: n }, (_, i) => newDependent({ name: `자녀${i + 1}`, age: 8, assignedTo: who }));

/** 연말정산 모드의 초기 입력 */
export function newWageHousehold(p: Profile): HouseholdInput {
  const couple = p.kind === 'couple';
  return {
    husband: emptyPerson('본인'),
    wife: emptyPerson('배우자'),
    dependents: kids(p.children),
    housing: { head: 'h', headLocked: !couple, rent: 0, leaseLoanRepay: 0 },
    flex: { cards: couple, medical: couple, donations: couple },
    single: !couple,
  };
}

function compPerson(name: string, k: IncomeKinds): CompPerson {
  return { ...emptyCompPerson(name), hasWage: k.wage, hasBusiness: k.business, hasRental: k.rental };
}

/** 종합소득세 모드의 초기 입력 */
export function newCompHousehold(p: Profile): CompHousehold {
  const couple = p.kind === 'couple';
  return {
    single: !couple,
    people: couple ? [compPerson('본인', p.a), compPerson('배우자', p.b)] : [compPerson('본인', p.a)],
    dependents: kids(p.children),
  };
}
