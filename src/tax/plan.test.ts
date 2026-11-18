import { optimizeHousehold } from './optimizer';
import { annualSalary, cardPlan, cardSum, detectStyle, estimateWithheld, milestones, splitSpend } from './plan';
import { sampleHousehold } from './sample';

const M = 10_000;

describe('소비 성향', () => {
  it('성향별로 나눠도 합계가 보존된다', () => {
    for (const s of ['credit', 'debit', 'mixed'] as const) {
      const c = splitSpend(3333 * M, s);
      expect(cardSum(c)).toBe(3333 * M);
      expect(detectStyle(c)).toBe(s);
    }
  });
});

describe('소득 입력 도우미', () => {
  it('월급·상여·비과세 식대로 총급여 계산', () => {
    expect(annualSalary(500 * M, 1000 * M, 20 * M)).toBe((480 * 12 + 1000) * M);
    expect(annualSalary(500 * M, 0, 50 * M)).toBe(480 * 12 * M); // 식대 비과세 한도 20만원
  });
  it('기납부세액 추정은 양수이고 최종 결정세액 이하가 아닐 수도 있으나 합리적 범위', () => {
    const hh = sampleHousehold();
    const h = estimateWithheld(hh, 'h');
    const w = estimateWithheld(hh, 'w');
    expect(h).toBeGreaterThan(w);
    expect(w).toBeGreaterThan(0);
  });
});

describe('규모별 카드 플랜', () => {
  const hh = sampleHousehold();
  const opt = optimizeHousehold(hh);
  const rows = cardPlan(hh, opt.best);
  it('행이 오름차순이고 현재 지출 행이 포함된다', () => {
    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(rows.some((r) => r.isCurrent)).toBe(true);
    for (let i = 1; i < rows.length; i++) expect(rows[i].total).toBeGreaterThan(rows[i - 1].total);
  });
  it('최적 배분은 반반보다 나쁘지 않고 금액 합계가 맞다', () => {
    for (const r of rows) for (const s of ['credit', 'debit', 'mixed'] as const) {
      const c = r.cells[s];
      expect(c.saving).toBeGreaterThanOrEqual(0);
      expect(Math.round(c.hAmount + c.wAmount)).toBe(r.total);
    }
  });
});

describe('이정표', () => {
  it('부부 각각 카드·의료비·연금 항목이 만들어진다', () => {
    const hh = sampleHousehold();
    const opt = optimizeHousehold(hh);
    const ms = milestones(hh, opt.best, opt.bestResult);
    expect(ms.h.map((m) => m.key)).toEqual(['card', 'medical', 'pension']);
    expect(ms.w.length).toBe(3);
    expect(ms.w[0].note.length).toBeGreaterThan(0);
  });
});
