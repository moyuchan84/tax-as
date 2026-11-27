/**
 * 2026년 귀속(2027년 1~2월 정산) 근로소득 연말정산 규칙.
 *
 * 모든 세법 수치는 이 파일 한 곳에만 둔다. 법이 바뀌면 여기만 고치면 된다.
 * `verify: true` 로 표시한 항목은 개정안/언론 보도 기준이라 국세청 공식 안내로
 * 재확인이 필요한 값이다 (README 참고).
 */

export interface Bracket {
  upTo: number; // 이 금액 이하 구간
  rate: number;
  deduction: number; // 누진공제
}

export const RULES = {
  year: 2026,

  /** 근로소득공제 (소득세법 47조) */
  earnedIncomeDeduction: {
    tiers: [
      { upTo: 5_000_000, base: 0, rate: 0.7, from: 0 },
      { upTo: 15_000_000, base: 3_500_000, rate: 0.4, from: 5_000_000 },
      { upTo: 45_000_000, base: 7_500_000, rate: 0.15, from: 15_000_000 },
      { upTo: 100_000_000, base: 12_000_000, rate: 0.05, from: 45_000_000 },
      { upTo: Infinity, base: 14_750_000, rate: 0.02, from: 100_000_000 },
    ],
    cap: 20_000_000,
  },

  /** 종합소득 기본세율 (소득세법 55조) */
  brackets: [
    { upTo: 14_000_000, rate: 0.06, deduction: 0 },
    { upTo: 50_000_000, rate: 0.15, deduction: 1_260_000 },
    { upTo: 88_000_000, rate: 0.24, deduction: 5_760_000 },
    { upTo: 150_000_000, rate: 0.35, deduction: 15_440_000 },
    { upTo: 300_000_000, rate: 0.38, deduction: 19_940_000 },
    { upTo: 500_000_000, rate: 0.4, deduction: 25_940_000 },
    { upTo: 1_000_000_000, rate: 0.42, deduction: 35_940_000 },
    { upTo: Infinity, rate: 0.45, deduction: 65_940_000 },
  ] as Bracket[],

  /** 근로소득세액공제 (소득세법 59조) */
  earnedCredit: {
    lowTaxLimit: 1_300_000,
    lowRate: 0.55,
    highRate: 0.3,
  },

  /** 인적공제 */
  personal: {
    basic: 1_500_000,
    elderly: 1_000_000, // 70세 이상
    elderlyAge: 70,
    disabled: 2_000_000,
    woman: 500_000, // 부녀자 (배우자 있는 여성, 종합소득금액 3천만 이하)
    womanIncomeLimit: 30_000_000,
    spouseWageLimit: 5_000_000, // 배우자 소득요건: 총급여 500만원 이하(근로소득금액 100만원 이하)
    spouseIncomeLimit: 1_000_000, // 종합소득금액 100만원 이하
    childMaxAge: 20,
    parentMinAge: 60,
  },

  /** 신용카드 등 사용금액 소득공제 (조특법 126조의2) */
  card: {
    minSpendRate: 0.25,
    rates: { credit: 0.15, debitCash: 0.3, culture: 0.3, market: 0.4, transport: 0.4 },
    cultureSalaryLimit: 70_000_000, // 도서·공연·박물관·체육시설 30%는 총급여 7천 이하만
    /** 기본한도: [자녀 0명, 1명, 2명 이상] — 2026~2028 사용분 자녀 수별 확대 (verify) */
    baseLimitLow: [3_000_000, 3_500_000, 4_000_000],
    baseLimitHigh: [2_500_000, 2_750_000, 3_000_000],
    extraLimitLow: 3_000_000, // 전통시장+대중교통+도서공연 등
    extraLimitHigh: 2_000_000, // 전통시장+대중교통
    salaryThreshold: 70_000_000,
    verify: true,
  },

  /** 의료비 세액공제 */
  medical: { thresholdRate: 0.03, generalCap: 7_000_000, rate: 0.15, specificAgeUnder: 6, specificAgeOver: 65 },

  /** 교육비 세액공제 */
  education: { rate: 0.15, schoolCap: 3_000_000, univCap: 9_000_000 },

  /** 보장성보험료 세액공제 */
  insurance: { rate: 0.12, cap: 1_000_000, disabledRate: 0.15, disabledCap: 1_000_000 },

  /** 연금계좌 세액공제 */
  /**
   * 연금계좌 세액공제 (소득세법 59조의3). 연금저축 600만 + 퇴직연금(IRP) 합산 900만원.
   * 총급여 1.2억 초과(종합소득금액 1억 초과)이면 연금저축 300만 + 합산 700만원으로 줄어든다 (국세청 상담 Q&A).
   */
  pension: {
    savingsCap: 6_000_000,
    totalCap: 9_000_000,
    highRate: 0.15,
    lowRate: 0.12,
    salaryThreshold: 55_000_000,
    highIncome: { salary: 120_000_000, income: 100_000_000, savingsCap: 3_000_000, totalCap: 7_000_000 },
  },

  /** 월세 세액공제 (무주택 세대주) */
  rent: { salaryLimit: 80_000_000, highRate: 0.17, lowRate: 0.15, rateThreshold: 55_000_000, cap: 10_000_000 },

  /** 주택청약종합저축 소득공제 (무주택 세대주, 총급여 7천 이하) */
  housingSubscription: { salaryLimit: 70_000_000, cap: 3_000_000, rate: 0.4 },

  /** 주택임차차입금 원리금상환액 (전세대출) */
  leaseLoan: { rate: 0.4 },
  /** 청약 + 전세대출 합산 한도 */
  housingCombinedCap: 4_000_000,

  /** 자녀세액공제 (verify: 2026년 귀속 대상 연령 9세 이상으로 상향 보도) */
  child: { minAge: 9, amounts: [250_000, 300_000, 400_000], birth: [300_000, 500_000, 700_000], verify: true },

  /**
   * 기부금 (근로소득자, 소득세법 59조의4 · 조특법 76조 · 고향사랑기부금법)
   * - 한도(근로소득금액 기준): 법정기부금 100% → 지정기부금(종교 외) 30% → 종교단체 10%
   *   종교단체 한도 = (소득금액 − 법정) × 10% + min(소득금액 × 20%, 종교 외 지정기부금)
   * - 법정·지정·종교 인정액 합계: 1천만원 이하 15%, 초과분 30%. 한도 초과분은 10년간 이월공제
   * - 정치자금: 10만원 이하 100/110, 10만~3천만원 15%, 3천만원 초과 25% (한도 소득금액 100%)
   * - 고향사랑: 10만원 이하 100/110, 10만~20만원 40%, 20만원 초과 15% (소득세 기준. 지방세 포함 44%·16.5%), 연 2천만원 한도
   * 미반영: 우리사주조합 기부금, 이월공제 입력, 특별재난지역 고향사랑 30%, 2027년 고향사랑 지역차등안(개편안 단계)
   * 3년 이상 연속 기부 우대 공제율은 확인되지 않아 적용하지 않음
   */
  donation: {
    limit: { statutory: 1, designated: 0.3, religious: 0.1, religiousExtra: 0.2 },
    rate: 0.15,
    highRate: 0.3,
    threshold: 10_000_000,
    carryYears: 10,
    political: { limitRate: 1, fullUpTo: 100_000, rate: 0.15, highRate: 0.25, highThreshold: 30_000_000 },
    hometown: { fullUpTo: 100_000, tier2UpTo: 200_000, tier2Rate: 0.4, rate: 0.15, cap: 20_000_000, verify: false },
  },

  standardCredit: 130_000,
  marriageCredit: 500_000, // 2024~2026 혼인신고, 생애 1회 (부부 각각)
  localTaxRate: 0.1,

  /** 4대보험 근로자 부담분 자동 추정용 (근사치) */
  social: {
    pensionRate: 0.0475,
    pensionMonthlyCap: 6_370_000,
    pensionMonthlyFloor: 400_000,
    healthRate: 0.03595,
    ltcRatio: 0.1314,
    employmentRate: 0.009,
  },
} as const;

export type Rules = typeof RULES;
