export type Spouse = 'h' | 'w';

export interface CardSpend {
  credit: number; // 신용카드
  debitCash: number; // 체크카드·현금영수증
  market: number; // 전통시장
  transport: number; // 대중교통
  culture: number; // 도서·공연·박물관·체육시설
}

export type EducationType = 'none' | 'preschool' | 'school' | 'university' | 'disabledSpecial';
export type Relation = 'child' | 'parent' | 'other' | 'spouse';

export interface DonationInput {
  general: number; // 특례·일반 기부금 (종교 포함 단순화)
  political: number; // 정치자금
  hometown: number; // 고향사랑
}

/** 화면에서 입력받는 부부 각자의 정보 (금액은 모두 원 단위) */
export interface PersonProfile {
  name: string;
  salary: number; // 총급여 (비과세 제외)
  age: number;
  disabled: boolean;
  autoSocial: boolean;
  pension: number; // 국민연금 본인부담
  health: number; // 건강+장기요양 본인부담
  employment: number; // 고용보험 본인부담
  cards: CardSpend; // 현재 본인 명의 사용액
  medical: number; // 본인 의료비 (현재 본인이 결제)
  insurance: number; // 보장성보험료
  disabledInsurance: number; // 장애인전용 보장성보험료
  ownEducation: number; // 본인 교육비 (대학원 등, 한도 없음)
  pensionSavings: number; // 연금저축
  irp: number; // IRP·퇴직연금
  housingSubscription: number; // 주택청약종합저축 납입액
  mortgageInterest: number; // 장기주택저당차입금 이자상환액
  mortgageCap: number; // 해당 대출의 공제 한도
  donations: DonationInput;
  marriage: boolean; // 결혼세액공제 대상
  withheld: number; // 기납부세액(소득세) — 환급액 계산용, 0이면 생략
}

export interface DependentInput {
  id: string;
  name: string;
  relation: Relation;
  age: number;
  disabled: boolean;
  educationType: EducationType;
  education: number;
  medical: number;
  assignedTo: Spouse; // 현재 누가 공제받는지
  locked: boolean; // true면 최적화에서 바꾸지 않음
}

export interface HousingInput {
  head: Spouse; // 세대주
  headLocked: boolean;
  rent: number; // 연간 월세 합계
  leaseLoanRepay: number; // 전세대출 원리금 상환액
}

export interface FlexOptions {
  cards: boolean;
  medical: boolean;
  donations: boolean;
}

export interface HouseholdInput {
  husband: PersonProfile;
  wife: PersonProfile;
  dependents: DependentInput[];
  housing: HousingInput;
  flex: FlexOptions;
  /** 싱글(배우자 없음)이면 true — 두 번째 사람 계산·추천을 건너뛴다 */
  single?: boolean;
}

/** 한 사람의 세액을 계산하기 위한, 배분이 끝난 입력 */
export interface ResolvedDependent {
  name: string;
  relation: Relation;
  age: number;
  disabled: boolean;
  educationType: EducationType;
  education: number;
  medical: number;
  birthOrder: number; // 가구 내 자녀 출생 순서 (자녀가 아니면 0)
}

export interface PersonTaxInput {
  salary: number;
  age: number;
  disabled: boolean;
  female: boolean;
  social: { pension: number; health: number; employment: number };
  dependents: ResolvedDependent[];
  cards: CardSpend;
  ownMedical: number;
  spouseMedical: number; // 배우자를 위해 대신 결제한 의료비
  spouseMedicalSpecific: boolean; // 배우자가 65세 이상/장애인이면 한도 없음
  insurance: number;
  disabledInsurance: number;
  ownEducation: number;
  pensionSavings: number;
  irp: number;
  isHead: boolean;
  housingSubscription: number;
  rent: number;
  leaseLoanRepay: number;
  mortgageInterest: number;
  mortgageCap: number;
  donations: DonationInput;
  marriage: boolean;
  withheld: number;
}
