import {
  cardDeduction,
  computePersonTax,
  earnedCredit,
  earnedIncomeDeduction,
  computedTax,
  hometownCredit,
  medicalCredit,
  politicalCredit,
} from './engine';
import type { PersonTaxInput } from './types';

const M = 10_000;

function person(over: Partial<PersonTaxInput> = {}): PersonTaxInput {
  return {
    salary: 0,
    age: 40,
    disabled: false,
    female: false,
    social: { pension: 0, health: 0, employment: 0 },
    dependents: [],
    cards: { credit: 0, debitCash: 0, market: 0, transport: 0, culture: 0 },
    ownMedical: 0,
    spouseMedical: 0,
    spouseMedicalSpecific: false,
    insurance: 0,
    disabledInsurance: 0,
    ownEducation: 0,
    pensionSavings: 0,
    irp: 0,
    isHead: false,
    housingSubscription: 0,
    rent: 0,
    leaseLoanRepay: 0,
    mortgageInterest: 0,
    mortgageCap: 0,
    donations: { general: 0, political: 0, hometown: 0 },
    marriage: false,
    withheld: 0,
    ...over,
  };
}

describe('근로소득공제·세율', () => {
  it('구간별 근로소득공제', () => {
    expect(earnedIncomeDeduction(400 * M)).toBe(280 * M);
    expect(earnedIncomeDeduction(5000 * M)).toBe(1225 * M);
    expect(earnedIncomeDeduction(50_000 * M)).toBe(2000 * M); // 한도
  });
  it('누진세율', () => {
    expect(computedTax(1400 * M)).toBe(84 * M);
    expect(computedTax(3625 * M)).toBe(4_177_500);
    expect(computedTax(10_000 * M)).toBe(35_000_000 - 15_440_000);
  });
  it('근로소득세액공제 한도', () => {
    expect(earnedCredit(4_177_500, 5000 * M)).toBe(660_000);
    expect(earnedCredit(1_000_000, 3000 * M)).toBe(550_000);
    expect(earnedCredit(10_000_000, 15_000 * M)).toBe(200_000);
  });
});

describe('신용카드 소득공제', () => {
  it('최저사용금액 25%는 신용카드부터 차감', () => {
    const r = cardDeduction(4000 * M, { credit: 800 * M, debitCash: 800 * M, market: 0, transport: 0, culture: 0 }, 0);
    expect(r.minSpend).toBe(1000 * M);
    expect(r.deduction).toBe(180 * M);
  });
  it('자녀 수별 기본한도 (7천 이하, 2명 → 400만)', () => {
    const r = cardDeduction(4000 * M, { credit: 0, debitCash: 3000 * M, market: 0, transport: 0, culture: 0 }, 2);
    expect(r.deduction).toBe(400 * M);
  });
  it('전통시장·대중교통 추가한도', () => {
    const r = cardDeduction(4000 * M, { credit: 0, debitCash: 3000 * M, market: 500 * M, transport: 0, culture: 0 }, 0);
    // 기본 300 + 추가 min(초과, 300, 전통시장 200)
    expect(r.deduction).toBe(500 * M);
  });
});

describe('의료비·기부금', () => {
  it('일반 의료비가 3% 미달하면 특정 의료비에서 차감', () => {
    const r = medicalCredit(5000 * M, 100 * M, 300 * M);
    expect(r.eligible).toBe(250 * M);
    expect(r.credit).toBe(375_000);
  });
  it('일반 의료비 700만 한도', () => {
    expect(medicalCredit(5000 * M, 1000 * M, 0).eligible).toBe(700 * M);
  });
  it('정치·고향사랑 10만원까지 100/110', () => {
    expect(politicalCredit(10 * M)).toBe(90_909);
    expect(hometownCredit(20 * M)).toBe(90_909 + 40_000);
  });
});

describe('개인 세액', () => {
  it('공제 항목이 없으면 표준세액공제 선택', () => {
    const r = computePersonTax(person({ salary: 5000 * M }));
    expect(r.usedStandard).toBe(true);
    expect(r.determinedTax).toBe(4_177_500 - 660_000 - 130_000);
    expect(r.localTax).toBe(338_750);
  });
  it('자녀세액공제는 9세 이상만, 출생아는 출산공제', () => {
    const r = computePersonTax(
      person({
        salary: 6000 * M,
        social: { pension: 270 * M, health: 230 * M, employment: 54 * M },
        dependents: [
          { name: 'a', relation: 'child', age: 12, disabled: false, educationType: 'none', education: 0, medical: 0, birthOrder: 1 },
          { name: 'b', relation: 'child', age: 7, disabled: false, educationType: 'none', education: 0, medical: 0, birthOrder: 2 },
          { name: 'c', relation: 'child', age: 0, disabled: false, educationType: 'none', education: 0, medical: 0, birthOrder: 3 },
        ],
      }),
    );
    expect(r.childCreditCount).toBe(1);
    expect(r.credits.child).toBe(250_000);
    expect(r.credits.birth).toBe(700_000);
    expect(r.basicCount).toBe(4);
  });
  it('세액공제가 산출세액을 넘으면 소멸분 표시', () => {
    const r = computePersonTax(person({ salary: 2000 * M, pensionSavings: 600 * M, ownMedical: 1000 * M }));
    expect(r.determinedTax).toBe(0);
    expect(r.lostCredits).toBeGreaterThan(0);
  });
});
