import { computePersonTax } from './engine';
import {
  CARD_KEYS,
  DON_KEYS,
  MED_KEYS,
  buildPersonInputs,
  cloneAllocation,
  evaluateHousehold,
  pooledTotals,
  type Allocation,
  type PooledKey,
} from './household';
import type { OptimizeResult } from './optimizer';
import { RULES } from './rules';
import type { HouseholdInput, Spouse } from './types';
import { man, pct, won } from './format';

export interface Tip {
  title: string;
  detail: string;
  saving?: number; // 이 조정 하나만 했을 때 절세액
  level: 'action' | 'info' | 'warn';
}

const NAME = (hh: HouseholdInput, s: Spouse) => (s === 'h' ? hh.husband.name || '남편' : hh.wife.name || '아내');

/** 최적 배분의 일부만 현재 상태에 적용했을 때 절세액 */
function partialSaving(hh: HouseholdInput, opt: OptimizeResult, apply: (a: Allocation) => void) {
  const a = cloneAllocation(opt.baseline);
  apply(a);
  return opt.baselineResult.total - evaluateHousehold(hh, a).total;
}

export function buildStrategy(hh: HouseholdInput, opt: OptimizeResult): Tip[] {
  const tips: Tip[] = [];
  const { best, bestResult } = opt;
  const totals = pooledTotals(hh);
  const nH = NAME(hh, 'h');
  const nW = NAME(hh, 'w');
  const R = bestResult;

  // 0. 부부의 세율 위치
  tips.push({
    level: 'info',
    title: '부부 한계세율 비교',
    detail:
      `${nH}: 과세표준 ${man(R.h.taxBase)} → 한계세율 ${pct(R.h.marginalRate)} (지방세 포함 ${pct(R.h.marginalRate * 1.1)}) · ` +
      `${nW}: 과세표준 ${man(R.w.taxBase)} → 한계세율 ${pct(R.w.marginalRate)} (지방세 포함 ${pct(R.w.marginalRate * 1.1)}). ` +
      '소득공제(인적공제·카드 등)는 한계세율이 높은 사람에게, 문턱이 있는 공제(카드 25%, 의료비 3%)는 문턱이 낮은 사람에게 유리한 경향이 있습니다.',
  });

  // 1. 부양가족 배정
  hh.dependents.forEach((d, i) => {
    const to = best.deps[i];
    const from = opt.baseline.deps[i];
    const label = d.name || `부양가족 ${i + 1}`;
    if (to !== from) {
      const s = partialSaving(hh, opt, (a) => (a.deps[i] = to));
      tips.push({
        level: 'action',
        title: `${label} → ${NAME(hh, to)} 공제로 변경`,
        detail: `현재 ${NAME(hh, from)}에게 올라가 있는 ${label}을(를) ${NAME(hh, to)}의 부양가족으로 옮기세요. 인적공제·자녀세액공제·교육비·의료비가 함께 따라갑니다. 부부가 중복으로 공제받으면 안 됩니다.`,
        saving: s,
      });
    } else {
      tips.push({
        level: 'info',
        title: `${label}: ${NAME(hh, to)} 유지`,
        detail: `${label}은(는) 지금처럼 ${NAME(hh, to)}이(가) 공제받는 것이 유리합니다.${d.locked ? ' (고정 항목)' : ''}`,
      });
    }
  });

  // 2. 세대주
  if (hh.housing.rent > 0 || hh.housing.leaseLoanRepay > 0 || hh.husband.housingSubscription + hh.wife.housingSubscription > 0) {
    const s = best.head !== opt.baseline.head ? partialSaving(hh, opt, (a) => (a.head = best.head)) : 0;
    tips.push({
      level: s > 0 ? 'action' : 'info',
      title: `주택 관련 공제는 ${NAME(hh, best.head)}(세대주) 쪽으로`,
      detail:
        `월세 세액공제·전세대출 원리금·주택청약 공제는 무주택 세대주가 받습니다. ` +
        `월세 공제는 총급여 ${man(RULES.rent.salaryLimit)} 이하만, 청약 공제는 ${man(RULES.housingSubscription.salaryLimit)} 이하만 가능합니다.` +
        (s > 0 ? ' 세대주(또는 계약자) 변경을 검토하세요.' : ''),
      saving: s || undefined,
    });
  }

  // 3. 카드
  if (hh.flex.cards && CARD_KEYS.some((k) => totals[k] > 0)) {
    const s = partialSaving(hh, opt, (a) => CARD_KEYS.forEach((k) => (a.h[k] = best.h[k])));
    const hCard = CARD_KEYS.reduce((t, k) => t + best.h[k], 0);
    const wCard = CARD_KEYS.reduce((t, k) => t + totals[k] - best.h[k], 0);
    const line = (k: PooledKey) => `${labelOf(k)} ${nH} ${man(best.h[k])} / ${nW} ${man(totals[k] - best.h[k])}`;
    tips.push({
      level: s > 0 ? 'action' : 'info',
      title: `카드 사용 배분: ${nH} ${man(hCard)} · ${nW} ${man(wCard)}`,
      detail:
        `최저사용금액(총급여의 25%)은 ${nH} ${man(R.h.card.minSpend)}, ${nW} ${man(R.w.card.minSpend)}입니다. ` +
        `이 금액까지는 공제가 0원이므로 혜택이 많은 신용카드(포인트·할인)로 채우고, 넘는 부분은 공제율이 높은 체크카드·현금영수증(30%)이나 전통시장·대중교통(40%)을 쓰세요. ` +
        `기본한도: ${nH} ${man(R.h.card.baseLimit)}(자녀 ${R.h.card.kids}명), ${nW} ${man(R.w.card.baseLimit)}(자녀 ${R.w.card.kids}명). ` +
        `권장 배분 → ${CARD_KEYS.filter((k) => totals[k] > 0).map(line).join(', ')}.`,
      saving: s || undefined,
    });
    for (const who of ['h', 'w'] as Spouse[]) {
      const c = R[who].card;
      const cap = c.baseLimit + c.extraLimit;
      let detail: string;
      if (c.total < c.minSpend) {
        detail = `사용액 ${man(c.total)}이 최저사용금액 ${man(c.minSpend)}에 못 미쳐 카드 공제 0원 → 이 사람 명의로 더 쓰는 것은 ${man(c.minSpend - c.total)}을 넘기기 전까지 효과가 없습니다.`;
      } else if (c.baseDeduction >= c.baseLimit) {
        detail = `기본한도 ${man(c.baseLimit)}를 모두 채웠습니다. 이후 일반 결제는 공제 효과가 없고, 전통시장·대중교통${c.extraLimit === RULES.card.extraLimitLow ? '·문화' : ''} 사용분만 추가한도(${man(c.extraLimit)}, 현재 ${man(c.extraDeduction)} 사용) 안에서 더 공제됩니다.`;
      } else {
        detail = `카드 공제 ${man(c.deduction)} (최대 ${man(cap)}). 신용카드로 약 ${man(c.roomToBaseLimit)}을 더 쓰면(체크·현금은 절반) 기본한도를 채웁니다.`;
      }
      tips.push({ level: 'info', title: `${NAME(hh, who)} 카드 공제 상태`, detail });
    }
  }

  // 4. 의료비
  if (hh.flex.medical && MED_KEYS.some((k) => totals[k] > 0)) {
    const s = partialSaving(hh, opt, (a) => MED_KEYS.forEach((k) => (a.h[k] = best.h[k])));
    tips.push({
      level: s > 0 ? 'action' : 'info',
      title: '의료비는 한 사람에게 몰아 3% 문턱을 한 번만 넘기기',
      detail:
        `의료비는 총급여의 3%를 넘는 금액만 공제되고, 공제율(15%)은 소득과 관계없이 같습니다. 그래서 문턱이 낮은 사람, 또는 부모님·자녀 의료비로 이미 문턱을 넘은 사람에게 몰아주는 것이 유리합니다. 문턱: ${nH} ${man(R.h.medical.threshold)}, ${nW} ${man(R.w.medical.threshold)}. ` +
        `배우자 의료비는 배우자의 소득과 관계없이 대신 결제한 사람이 공제받을 수 있습니다(단, 본인 의료비가 아니므로 연 700만원 한도). ` +
        `권장: ${nH} 의료비 ${man(totals.hMed)} 중 ${nH} 결제 ${man(best.h.hMed)} / ${nW} 결제 ${man(totals.hMed - best.h.hMed)}, ` +
        `${nW} 의료비 ${man(totals.wMed)} 중 ${nW} 결제 ${man(totals.wMed - best.h.wMed)} / ${nH} 결제 ${man(best.h.wMed)}.`,
      saving: s || undefined,
    });
  }

  // 5. 기부금
  if (hh.flex.donations && DON_KEYS.some((k) => totals[k] > 0)) {
    const s = partialSaving(hh, opt, (a) => DON_KEYS.forEach((k) => (a.h[k] = best.h[k])));
    tips.push({
      level: s > 0 ? 'action' : 'info',
      title: '기부금 명의 나누기',
      detail:
        `정치자금·고향사랑 기부금은 1인당 10만원까지 100/110(사실상 전액)을 돌려받습니다. 부부가 각각 10만원씩 기부하면 둘 다 혜택을 받을 수 있습니다. ` +
        `고향사랑은 10만~20만원 구간 ${pct(RULES.donation.hometown.tier2Rate)}, 그 이상은 15%입니다. 일반 기부금은 결정세액이 남는 사람 명의로 하세요. ` +
        `권장: 일반 ${nH} ${man(best.h.donGeneral)}/${nW} ${man(totals.donGeneral - best.h.donGeneral)}, 정치 ${nH} ${man(best.h.donPolitical)}/${nW} ${man(totals.donPolitical - best.h.donPolitical)}, 고향사랑 ${nH} ${man(best.h.donHometown)}/${nW} ${man(totals.donHometown - best.h.donHometown)}.`,
      saving: s || undefined,
    });
  }

  // 6. 소멸되는 세액공제
  for (const who of ['h', 'w'] as Spouse[]) {
    const r = R[who];
    if (r.lostCredits > 0) {
      tips.push({
        level: 'warn',
        title: `${NAME(hh, who)}: 세액공제 ${won(r.lostCredits)} 소멸`,
        detail: `${NAME(hh, who)}은(는) 산출세액보다 세액공제가 많아 결정세액이 0원이고 남는 공제는 사라집니다. 옮길 수 있는 공제(부양가족, 의료비, 기부금)는 상대 배우자에게 넘기고, 연금저축 추가 납입은 이 사람 명의로는 효과가 없습니다.`,
      });
    }
  }

  // 7. 연금저축·IRP 추가 납입 여력
  const inputs = buildPersonInputs(hh, best);
  for (const who of ['h', 'w'] as Spouse[]) {
    const p = inputs[who];
    const cap = RULES.pension;
    const room = Math.max(0, cap.totalCap - Math.min(p.pensionSavings, cap.savingsCap) - p.irp);
    if (room <= 0) continue;
    const after = computePersonTax({ ...p, irp: p.irp + room });
    const gain = R[who].totalTax - after.totalTax;
    if (gain > 0) {
      const rate = p.salary <= cap.salaryThreshold ? cap.highRate : cap.lowRate;
      tips.push({
        level: 'action',
        title: `${NAME(hh, who)}: 연금저축·IRP ${man(room)} 추가 납입 시 ${won(gain)} 절세`,
        detail: `연금계좌는 합산 연 ${man(cap.totalCap)}(연금저축 ${man(cap.savingsCap)} 이내)까지 ${pct(rate * 1.1)}(지방세 포함) 세액공제됩니다. 12월 31일까지 납입분이 대상입니다. 결정세액이 0이 되면 그 이상은 효과가 없으니, 세금이 남는 사람에게 먼저 넣으세요.`,
        saving: gain,
      });
    }
  }

  return tips;
}

const SHORT_LABEL: Partial<Record<PooledKey, string>> = {
  credit: '신용',
  debitCash: '체크·현금',
  market: '전통시장',
  transport: '대중교통',
  culture: '문화·체육',
};
const labelOf = (k: PooledKey) => SHORT_LABEL[k] ?? k;
