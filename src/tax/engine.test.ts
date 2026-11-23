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
    donations: { statutory: 0, general: 0, religious: 0, political: 0, hometown: 0 },
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

describe('외벌이 배우자공제', () => {
  it('배우자 소득이 요건 이하이면 소득 높은 쪽이 기본공제를 받는다', async () => {
    const { buildPersonInputs, baselineAllocation } = await import('./household');
    const { emptyPerson } = await import('./sample');
    const hh = {
      husband: { ...emptyPerson('남편'), salary: 6000 * M },
      wife: { ...emptyPerson('아내'), salary: 0 },
      dependents: [],
      housing: { head: 'h' as const, headLocked: false, rent: 0, leaseLoanRepay: 0 },
      flex: { cards: true, medical: true, donations: true },
    };
    const inp = buildPersonInputs(hh, baselineAllocation(hh));
    expect(inp.h.dependents.map((d) => d.relation)).toEqual(['spouse']);
    expect(inp.w.dependents).toEqual([]);
    expect(computePersonTax(inp.h).basicCount).toBe(2);
    // 싱글이면 배우자공제 없음
    const single = buildPersonInputs({ ...hh, single: true }, baselineAllocation(hh));
    expect(single.h.dependents).toEqual([]);
  });
});

import { donationBreakdown } from './engine';
const D = (over: Partial<PersonTaxInput['donations']> = {}) => ({ statutory: 0, general: 0, religious: 0, political: 0, hometown: 0, ...over });

describe('기부금 한도·세액공제', () => {
  it('지정기부금(종교 외)은 소득금액 30% 한도, 1천만원 이하 15%', () => {
    const b = donationBreakdown(D({ general: 300 * M }), 5000 * M);
    expect(b.mainAllowed).toBe(300 * M);
    expect(b.creditMain).toBe(45 * M);
    expect(b.effectiveRate).toBeCloseTo(0.15, 6);
    // 소득금액 1,000만원이면 한도 300만원
    expect(donationBreakdown(D({ general: 500 * M }), 1000 * M).lines[1].allowed).toBe(300 * M);
  });
  it('종교단체만 있으면 소득금액 10% 한도, 초과분은 이월', () => {
    const b = donationBreakdown(D({ religious: 800 * M }), 4000 * M);
    expect(b.lines[2].limit).toBe(400 * M);
    expect(b.lines[2].allowed).toBe(400 * M);
    expect(b.lines[2].carryover).toBe(400 * M);
    expect(b.creditMain).toBe(60 * M);
  });
  it('지정기부금 전체 한도 = 10% + min(소득금액 20%, 종교 외 지정) → 종교 몫은 min(10%, 30% − 종교 외 지정)', () => {
    // 소득 4,000만, 종교 외 지정 200만 → 전체 한도 400 + min(800, 200) = 600만 → 종교 몫 400만(=10%)
    const b = donationBreakdown(D({ general: 200 * M, religious: 900 * M }), 4000 * M);
    expect(b.lines[2].limit).toBe(400 * M);
    expect(b.lines[2].allowed).toBe(400 * M);
    expect(b.mainAllowed).toBe(600 * M);
    expect(b.lines[2].carryover).toBe(500 * M);
    // 종교 외 지정을 1,000만 쓰면 전체 한도 400+800=1,200만 → 종교 몫은 200만으로 줄어든다
    const c = donationBreakdown(D({ general: 1000 * M, religious: 2000 * M }), 4000 * M);
    expect(c.lines[1].allowed).toBe(1000 * M);
    expect(c.lines[2].limit).toBe(200 * M);
    expect(c.mainAllowed).toBe(1200 * M); // 소득금액의 30%를 넘지 못함
  });
  it('법정기부금은 소득금액 100%까지, 그만큼 종교·지정 한도 기준금액이 줄어든다', () => {
    const b = donationBreakdown(D({ statutory: 1000 * M, general: 5000 * M }), 3000 * M);
    expect(b.lines[0].allowed).toBe(1000 * M);
    expect(b.lines[1].limit).toBe(600 * M); // (3000−1000)×30%
  });
  it('인정액 합계 1천만원 초과분은 30%, 종류별 공제액 합은 전체와 같다', () => {
    const b = donationBreakdown(D({ statutory: 600 * M, general: 800 * M }), 20000 * M);
    expect(b.mainAllowed).toBe(1400 * M);
    expect(b.lowPart).toBe(1000 * M);
    expect(b.highPart).toBe(400 * M);
    expect(b.creditMain).toBe(150 * M + 120 * M);
    const sum = b.lines.slice(0, 3).reduce((s, l) => s + l.credit, 0);
    expect(Math.abs(sum - b.creditMain)).toBeLessThanOrEqual(2);
  });
  it('정치자금·고향사랑은 한도/구간별 공제율이 따로 적용된다', () => {
    const b = donationBreakdown(D({ political: 4000 * M, hometown: 20 * M }), 50000 * M);
    expect(b.creditPolitical).toBe(Math.floor((10 * M * 100) / 110 + 2990 * M * 0.15 + 1000 * M * 0.25));
    expect(b.creditHometown).toBe(Math.floor((10 * M * 100) / 110 + 10 * M * 0.4));
    expect(b.total).toBe(b.creditPolitical + b.creditHometown);
  });
  it('표준세액공제가 적용되면 법정·지정·종교 기부금 공제는 세액에 반영되지 않는다', () => {
    const r = computePersonTax(person({ salary: 5000 * M, donations: D({ general: 20 * M }) }));
    expect(r.usedStandard).toBe(true);
    expect(r.credits.donation).toBe(0);
    expect(r.donation.creditMain).toBeGreaterThan(0); // 가정 계산은 따로 보여줌
  });
  it('항목별 공제가 더 크면 기부금이 세액공제에 반영된다', () => {
    const r = computePersonTax(person({ salary: 5000 * M, donations: D({ general: 300 * M, religious: 200 * M }) }));
    expect(r.usedStandard).toBe(false);
    expect(r.credits.donation).toBe(r.donation.creditMain);
  });
});
