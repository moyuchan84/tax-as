import { optimizeHousehold } from './optimizer';
import { sampleHousehold } from './sample';
import { actualSummary, cardRoutes, defaultMonth, monthlyActions, monthsLeft, paceRemaining, remainingPlan, yearEndChecklist } from './timeline';
import type { HouseholdInput } from './types';

const M = 10_000;

function actualHh(): HouseholdInput {
  const hh = sampleHousehold();
  hh.time = { mode: 'actual', month: 10 };
  hh.husband.cards = { credit: 1500 * M, debitCash: 250 * M, market: 40 * M, transport: 50 * M, culture: 25 * M };
  hh.wife.cards = { credit: 500 * M, debitCash: 330 * M, market: 25 * M, transport: 35 * M, culture: 15 * M };
  hh.remaining = paceRemaining(hh);
  return hh;
}

describe('시점 계산', () => {
  it('오늘 날짜 기준 지난달 말, 남은 개월 수', () => {
    expect(defaultMonth(new Date('2026-11-18'))).toBe(10);
    expect(defaultMonth(new Date('2026-01-05'))).toBe(1);
    expect(monthsLeft(actualHh())).toBe(2);
    expect(monthsLeft(sampleHousehold())).toBe(12);
  });
  it('지금 속도로 남은 기간 지출을 채운다: 10월까지 합계 × 2/10', () => {
    const hh = actualHh();
    expect(hh.remaining!.credit).toBe(Math.round(((1500 + 500) * M * 2) / 10 / M) * M);
  });
  it('남은 기간 플랜: 사람별 배분 합계가 남은 지출과 같다', () => {
    const hh = actualHh();
    const opt = optimizeHousehold(hh);
    const rows = remainingPlan(hh, opt);
    const total = rows.reduce((s, r) => s + r.total, 0);
    const rem = Object.values(hh.remaining!).reduce((s, v) => s + v, 0);
    expect(Math.round(total)).toBe(rem);
    expect(rows[0].perMonth).toBeCloseTo(rows[0].total / 2, 3);
  });
  it('연말 점검 요약: 더 안 쓸 때·지금 비율·최적 순서로 세금이 정리된다', () => {
    const hh = actualHh();
    const s = actualSummary(hh, optimizeHousehold(hh));
    expect(s.best).toBeLessThanOrEqual(s.pace);
    expect(s.monthsLeft).toBe(2);
    expect(s.stopNow).toBeGreaterThan(0);
  });
  it('연말 체크리스트: 효과 큰 순 정렬, 마감 안내 포함', () => {
    const hh = actualHh();
    const items = yearEndChecklist(hh, optimizeHousehold(hh));
    const gains = items.filter((i) => i.gain).map((i) => i.gain!);
    expect([...gains].sort((a, b) => b - a)).toEqual(gains);
    expect(items.some((i) => i.title.includes('카드·현금영수증 마감'))).toBe(true);
  });
});

describe('계획 모드 실행 플랜', () => {
  it('카드 로드맵: 문턱 돌파·한도 도달 월이 순서대로', () => {
    const hh = sampleHousehold();
    const routes = cardRoutes(hh, optimizeHousehold(hh));
    const h = routes.find((r) => r.who === 'h')!;
    expect(h.thrMonth).not.toBeNull();
    if (h.limitMonth !== null) expect(h.limitMonth).toBeGreaterThanOrEqual(h.thrMonth!);
    expect(h.steps[0]).toContain('신용카드');
  });
  it('월 자동이체 제안은 절세액이 양수인 항목만', () => {
    const hh = sampleHousehold();
    for (const a of monthlyActions(hh, optimizeHousehold(hh))) expect(a.gain).toBeGreaterThan(0);
  });
});

import { toActual, toPlan } from './timeline';
describe('계획 ↔ 연말 점검 전환', () => {
  it('왕복해도 연간 카드 총액이 보존된다', () => {
    const plan = sampleHousehold();
    const total = (h: HouseholdInput) =>
      Object.values(h.husband.cards).reduce((a, b) => a + b, 0) + Object.values(h.wife.cards).reduce((a, b) => a + b, 0);
    const act = toActual(plan, 10);
    expect(act.time).toEqual({ mode: 'actual', month: 10 });
    const sumAct = total(act) + Object.values(act.remaining!).reduce((a, b) => a + b, 0);
    expect(Math.abs(sumAct - total(plan))).toBeLessThan(10 * M);
    const back = toPlan(act);
    expect(back.time?.mode).toBe('plan');
    expect(back.remaining).toBeUndefined();
    expect(Math.abs(total(back) - total(plan))).toBeLessThan(20 * M);
  });
});
