import { computePersonTax, pensionCaps } from './engine';
import { man, pct } from './format';
import {
  CARD_KEYS,
  baselineAllocation,
  buildPersonInputs,
  evaluateHousehold,
  isActual,
  type PooledKey,
} from './household';
import type { OptimizeResult } from './optimizer';
import { RULES } from './rules';
import type { CardSpend, HouseholdInput, Spouse } from './types';

/** 시점 관련 계산: 계획(연초~연중)의 월별 실행 플랜 / 연말 점검의 남은 기간 플랜 */

const UNIT = 10_000;
const roundUnit = (n: number) => Math.round(n / UNIT) * UNIT;
const ceilUnit = (n: number) => Math.ceil(n / UNIT) * UNIT;
const ZERO: CardSpend = { credit: 0, debitCash: 0, market: 0, transport: 0, culture: 0 };
const nameOf = (hh: HouseholdInput, who: Spouse) => (who === 'h' ? hh.husband.name || '남편' : hh.wife.name || '아내');
const whosOf = (hh: HouseholdInput): Spouse[] => (hh.single ? ['h'] : ['h', 'w']);

/** 오늘 기준 ‘지난달 말까지’의 달 (11월 중순 → 10) */
export function defaultMonth(now = new Date()): number {
  return Math.min(12, Math.max(1, now.getMonth()));
}

export const monthsLeft = (hh: HouseholdInput) => (isActual(hh) ? Math.max(0, 12 - (hh.time?.month ?? 12)) : 12);

/** 지금까지의 사용 속도 그대로 남은 기간에도 쓴다고 가정한 남은 지출(부부 합계) */
export function paceRemaining(hh: HouseholdInput): CardSpend {
  const m = Math.max(1, hh.time?.month ?? 12);
  const left = Math.max(0, 12 - m);
  const out = { ...ZERO };
  for (const k of Object.keys(ZERO) as (keyof CardSpend)[]) {
    out[k] = roundUnit(((hh.husband.cards[k] + hh.wife.cards[k]) * left) / m);
  }
  return out;
}

export const cardTotal = (c: CardSpend) => c.credit + c.debitCash + c.market + c.transport + c.culture;

// ------------------------------------------------------------------ 계획 모드: 월별 실행 플랜

export interface CardRoute {
  who: Spouse;
  name: string;
  total: number;
  monthly: number;
  thr: number;
  baseLimit: number;
  thrMonth: number | null;
  limitMonth: number | null;
  steps: string[];
}

export function cardRoutes(hh: HouseholdInput, opt: OptimizeResult): CardRoute[] {
  const out: CardRoute[] = [];
  for (const who of whosOf(hh)) {
    const r = opt.bestResult[who];
    if (r.salary <= 0) continue;
    const c = r.card;
    const monthly = c.total / 12;
    const name = nameOf(hh, who);
    const steps: string[] = [];
    let thrMonth: number | null = null;
    let limitMonth: number | null = null;
    if (c.total <= 0) {
      steps.push('이 사람 명의로 쓰는 카드 지출 계획이 없습니다.');
    } else if (c.total <= c.minSpend) {
      steps.push(`연 ${man(c.total)}으로는 공제 문턱 ${man(c.minSpend)}을 넘지 못해 카드 공제가 없습니다 → 이 사람 카드는 적립·할인 혜택 위주로 쓰거나, 소비를 배우자 카드로 몰아주세요.`);
    } else {
      thrMonth = Math.min(12, Math.ceil(c.minSpend / monthly));
      const limitSpend = c.minSpend + c.baseLimit / RULES.card.rates.debitCash;
      limitMonth = c.total >= limitSpend ? Math.min(12, Math.ceil(limitSpend / monthly)) : null;
      steps.push(`1~${thrMonth}월: 신용카드로 쓰기 — 공제 문턱 ${man(c.minSpend)} 구간(공제 0원이라 적립·할인이 큰 카드).`);
      if (limitMonth !== null && limitMonth > thrMonth) {
        steps.push(`${thrMonth}~${limitMonth}월: 체크카드·현금영수증(30%)과 전통시장·대중교통(40%)으로 갈아타기 — 기본한도 ${man(c.baseLimit)}을 채웁니다.`);
        if (limitMonth < 12) steps.push(`${limitMonth + 1}~12월: 한도 도달 → 일반 결제는 다시 신용카드 혜택 위주. 전통시장·대중교통은 추가한도 ${man(c.extraLimit)}까지 계속 공제됩니다.`);
      } else if (limitMonth === null && thrMonth < 12) {
        steps.push(`${Math.min(12, thrMonth + 1)}~12월: 체크카드·현금영수증(30%)과 전통시장·대중교통(40%)으로 쓰기 — 연말까지 한도 ${man(c.baseLimit)} 중 약 ${man(c.baseDeduction)}을 채웁니다.`);
      }
    }
    out.push({ who, name, total: c.total, monthly, thr: c.minSpend, baseLimit: c.baseLimit, thrMonth, limitMonth, steps });
  }
  return out;
}

export interface MonthlyAction {
  who: Spouse;
  name: string;
  title: string;
  monthly: number;
  gain: number;
  note: string;
}

/** 자동이체 등으로 매달 해 두면 되는 것 */
export function monthlyActions(hh: HouseholdInput, opt: OptimizeResult): MonthlyAction[] {
  const inputs = buildPersonInputs(hh, opt.best);
  const out: MonthlyAction[] = [];
  const pr = RULES.pension;
  for (const who of whosOf(hh)) {
    const p = inputs[who];
    const r = opt.bestResult[who];
    if (r.salary <= 0) continue;
    const name = nameOf(hh, who);
    const caps = pensionCaps(p.salary);
    const room = Math.max(0, caps.totalCap - Math.min(p.pensionSavings, caps.savingsCap) - p.irp);
    if (room > 0 && r.determinedTax > 0) {
      const gain = r.totalTax - computePersonTax({ ...p, irp: p.irp + room }).totalTax;
      if (gain > 0) {
        const rate = p.salary <= pr.salaryThreshold ? pr.highRate : pr.lowRate;
        out.push({ who, name, title: '연금저축·IRP 자동이체', monthly: ceilUnit(room / 12), gain, note: `연 ${man(room)}까지 ${pct(rate * 1.1)} 세액공제 (연금저축은 연 ${man(caps.savingsCap)} 이내)` });
      }
    }
    const hs = RULES.housingSubscription;
    if (p.isHead && p.salary <= hs.salaryLimit && p.housingSubscription < hs.cap) {
      const add = hs.cap - p.housingSubscription;
      const gain = r.totalTax - computePersonTax({ ...p, housingSubscription: p.housingSubscription + add }).totalTax;
      if (gain > 0) out.push({ who, name, title: '주택청약종합저축 납입', monthly: ceilUnit(add / 12), gain, note: `무주택 세대주 · 연 ${man(hs.cap)}까지 40% 소득공제` });
    }
  }
  return out;
}

export const CHECKPOINTS: { when: string; text: string }[] = [
  { when: '1월', text: '올해 지출 계획 확정: 카드 로드맵대로 결제수단 정리, 연금저축·IRP 자동이체 설정, 부양가족을 누구 공제로 할지 부부가 합의' },
  { when: '3월 말', text: '1분기 카드 사용액 × 4가 연간 속도입니다. 문턱 돌파 예상 월과 비교해 보세요' },
  { when: '6월 말', text: '상반기 실제값으로 ‘연말 점검’ 모드를 한 번 돌려 남은 기간 계획을 수정하세요' },
  { when: '9월 말', text: '의료비·교육비 영수증을 공제받을 사람 앞으로 정리하고, 고향사랑·정치자금 기부 계획을 세우세요' },
  { when: '11월', text: '‘연말 점검’ 모드로 실제값을 입력해 남은 기간 배분을 확정하세요 (이미 쓴 카드는 못 바꿉니다)' },
  { when: '12월 31일', text: '마감: 연금저축·IRP 입금, 카드·현금영수증 사용, 기부를 이날까지 끝내세요. 이후 건은 내년 공제입니다' },
  { when: '다음 해 1월', text: '홈택스 연말정산 간소화 자료를 확인하고 누락(안경·교복·월세 등) 증빙을 챙기세요' },
];

// ------------------------------------------------------------------ 연말 점검: 남은 기간 플랜

export interface ActualSummary {
  monthsLeft: number;
  stopNow: number; // 지금부터 더 쓰지 않는다면
  pace: number; // 남은 기간도 지금 비율대로 쓰면
  best: number; // 남은 기간 지출을 최적 배분하면
}

export function actualSummary(hh: HouseholdInput, opt: OptimizeResult): ActualSummary {
  const stopped: HouseholdInput = { ...hh, remaining: { ...ZERO } };
  return {
    monthsLeft: monthsLeft(hh),
    stopNow: evaluateHousehold(stopped, baselineAllocation(stopped)).total,
    pace: opt.baselineResult.total,
    best: opt.bestResult.total,
  };
}

export interface RemainingRow {
  who: Spouse;
  name: string;
  amounts: Record<PooledKey & keyof CardSpend, number>;
  total: number;
  perMonth: number;
}

/** 남은 기간 지출을 누구 카드로, 어떤 결제수단으로 쓸지 */
export function remainingPlan(hh: HouseholdInput, opt: OptimizeResult): RemainingRow[] {
  const rem = hh.remaining ?? ZERO;
  const months = Math.max(1, monthsLeft(hh));
  return whosOf(hh).map((who) => {
    const amounts = { ...ZERO } as RemainingRow['amounts'];
    for (const k of CARD_KEYS) {
      const h = opt.best.h[k];
      amounts[k as keyof CardSpend] = who === 'h' ? h : (rem[k as keyof CardSpend] ?? 0) - h;
    }
    const total = cardTotal(amounts);
    return { who, name: nameOf(hh, who), amounts, total, perMonth: total / months };
  });
}

export interface CheckItem {
  title: string;
  detail: string;
  gain?: number;
  tone: 'do' | 'info' | 'warn';
}

/** 12월 31일 전에 할 일 (효과 큰 순) */
export function yearEndChecklist(hh: HouseholdInput, opt: OptimizeResult): CheckItem[] {
  const items: CheckItem[] = [];
  const inputs = buildPersonInputs(hh, opt.best);
  const left = monthsLeft(hh);
  const when = left > 0 ? `남은 ${left}개월 안에` : '12월 31일까지';

  for (const who of whosOf(hh)) {
    const p = inputs[who];
    const r = opt.bestResult[who];
    const name = nameOf(hh, who);
    if (r.salary <= 0) continue;

    // 연금계좌
    const caps = pensionCaps(p.salary);
    const room = Math.max(0, caps.totalCap - Math.min(p.pensionSavings, caps.savingsCap) - p.irp);
    if (room > 0 && r.determinedTax > 0) {
      const gain = r.totalTax - computePersonTax({ ...p, irp: p.irp + room }).totalTax;
      if (gain > 0)
        items.push({ tone: 'do', gain, title: `${name}: 연금저축·IRP ${man(room)} 추가 입금`, detail: `${when} 입금한 금액만 올해 세액공제됩니다. 한 번에 넣어도 되고(IRP는 일시납 가능), 합산 한도는 연 ${man(caps.totalCap)}입니다.` });
    }

    // 정치자금·고향사랑 10만원 (10만원까지 100/110 환급)
    const polRoom = Math.max(0, RULES.donation.political.fullUpTo - p.donations.political);
    const homeRoom = Math.max(0, RULES.donation.hometown.fullUpTo - p.donations.hometown);
    if (polRoom + homeRoom > 0) {
      const gain = r.totalTax - computePersonTax({ ...p, donations: { ...p.donations, political: p.donations.political + polRoom, hometown: p.donations.hometown + homeRoom } }).totalTax;
      if (gain > 0)
        items.push({ tone: 'do', gain, title: `${name}: 고향사랑·정치자금 기부 ${man(polRoom + homeRoom)}`, detail: `각각 10만원까지는 기부액의 100/110을 세액공제로 돌려받아 사실상 부담이 거의 없습니다(고향사랑은 답례품도 받음). ${when} 결제하세요.` });
    }

    // 주택청약
    const hs = RULES.housingSubscription;
    if (p.isHead && p.salary <= hs.salaryLimit && p.housingSubscription < hs.cap) {
      const add = hs.cap - p.housingSubscription;
      const gain = r.totalTax - computePersonTax({ ...p, housingSubscription: p.housingSubscription + add }).totalTax;
      if (gain > 0) items.push({ tone: 'do', gain, title: `${name}: 주택청약종합저축 ${man(add)} 추가 납입`, detail: `무주택 세대주는 연 ${man(hs.cap)}까지 납입액의 40%를 소득공제받습니다. ${when} 납입분이 올해 공제됩니다.` });
    }

    // 의료비
    const med = r.medical;
    const medTotal = med.general + med.specific;
    if (medTotal > 0 || med.threshold > 0) {
      if (medTotal >= med.threshold && medTotal > 0) {
        items.push({ tone: 'info', title: `${name}: 의료비는 이미 문턱을 넘었습니다`, detail: `문턱 ${man(med.threshold)}을 ${man(medTotal - med.threshold)} 넘겨 이후 의료비는 15%씩 공제됩니다. 미뤄 둔 진료·치과·안경(1인 50만원)·보청기를 올해 안에 결제하면 효과가 있습니다.` });
      } else if (medTotal > 0) {
        items.push({ tone: 'warn', title: `${name}: 의료비가 문턱에 ${man(med.threshold - medTotal)} 모자랍니다`, detail: `문턱(총급여 3%) ${man(med.threshold)} 아래 금액은 공제가 안 되니 공제를 노린 무리한 지출은 하지 마세요. 가족 의료비 영수증을 한 사람 앞으로 모으는 것이 먼저입니다.` });
      }
    }
  }

  items.sort((a, b) => (b.gain ?? 0) - (a.gain ?? 0));

  items.push(
    { tone: 'info', title: '카드·현금영수증 마감', detail: '카드는 12월 31일까지 승인(사용)된 건이 올해 분입니다(결제일 아님). 현금 결제는 소득공제용 현금영수증을 꼭 발급받으세요(번호 등록).' },
    { tone: 'info', title: '부양가족 요건은 12월 31일 기준', detail: '나이(자녀 9세 이상 등)와 소득 요건(연 소득금액 100만원 이하)은 12월 31일 현재로 판단합니다. 부양가족을 누구 공제로 올릴지는 연말정산 때 정하며, 부부가 중복 공제받으면 안 됩니다.' },
    { tone: 'info', title: '이미 지난 카드 사용은 바꿀 수 없습니다', detail: '카드 공제는 사용한 사람 명의로만 가능합니다. 남은 기간 지출을 어느 쪽 카드로 쓸지가 마지막 선택지이고, 의료비·교육비 영수증과 부양가족 배정은 연말정산 때까지 조정할 수 있습니다.' },
  );
  return items;
}

// ------------------------------------------------------------------ 계획 ↔ 연말 점검 전환

const scaleCard = (c: CardSpend, x: number): CardSpend => ({
  credit: roundUnit(c.credit * x),
  debitCash: roundUnit(c.debitCash * x),
  market: roundUnit(c.market * x),
  transport: roundUnit(c.transport * x),
  culture: roundUnit(c.culture * x),
});

/** 계획(연간 예상) → 연말 점검: 연간 예상을 월 균등으로 가정해 ‘지금까지’와 ‘남은 기간’으로 나눈다 */
export function toActual(hh: HouseholdInput, month: number): HouseholdInput {
  const f = month / 12;
  const total: CardSpend = { ...ZERO };
  for (const k of Object.keys(ZERO) as (keyof CardSpend)[]) total[k] = hh.husband.cards[k] + hh.wife.cards[k];
  return {
    ...hh,
    husband: { ...hh.husband, cards: scaleCard(hh.husband.cards, f) },
    wife: { ...hh.wife, cards: scaleCard(hh.wife.cards, f) },
    time: { mode: 'actual', month },
    remaining: scaleCard(total, 1 - f),
  };
}

/** 연말 점검 → 계획: 남은 기간 지출을 지금까지의 비율대로 각자에게 합쳐 연간 예상으로 돌린다 */
export function toPlan(hh: HouseholdInput): HouseholdInput {
  if (!isActual(hh)) return { ...hh, time: { mode: 'plan', month: hh.time?.month ?? 12 } };
  const base = baselineAllocation(hh);
  const rem = hh.remaining ?? ZERO;
  const h = { ...ZERO };
  const w = { ...ZERO };
  for (const k of Object.keys(ZERO) as (keyof CardSpend)[]) {
    h[k] = hh.husband.cards[k] + base.h[k];
    w[k] = hh.wife.cards[k] + (rem[k] - base.h[k]);
  }
  return { ...hh, husband: { ...hh.husband, cards: h }, wife: { ...hh.wife, cards: w }, time: { mode: 'plan', month: hh.time?.month ?? 12 }, remaining: undefined };
}
