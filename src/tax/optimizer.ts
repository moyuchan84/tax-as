import {
  CARD_KEYS,
  DON_KEYS,
  MED_KEYS,
  baselineAllocation,
  isActual,
  cloneAllocation,
  evaluateHousehold,
  pooledTotals,
  type Allocation,
  type HouseholdResult,
  type PooledKey,
} from './household';
import type { HouseholdInput, Spouse } from './types';

export interface OptimizeResult {
  baseline: Allocation;
  baselineResult: HouseholdResult;
  best: Allocation;
  bestResult: HouseholdResult;
  savings: number;
  evaluations: number;
}

const ROUND = 10_000; // 추천 금액은 1만원 단위
const MAX_ENUM_DEPS = 6;

/**
 * 부부 합산 세금(소득세+지방소득세)이 최소가 되는 배분을 찾는다.
 *
 * - 부양가족 배정·세대주 같은 이산 선택은 전수 조사(부양가족 6명 초과 시 탐욕법)
 * - 카드·의료비·기부금처럼 나눌 수 있는 금액은 좌표하강법(격자 탐색 후 세밀화)
 * - 공제 구조가 계단식(최저사용금액, 3% 문턱, 한도)이라 여러 시작점에서 출발한다
 * - 같은 세금이면 현재 상태에 가까운 배분을 고른다 (불필요한 변경 최소화)
 */
export function optimizeHousehold(hh: HouseholdInput): OptimizeResult {
  const totals = pooledTotals(hh);
  let evaluations = 0;
  const evalAlloc = (a: Allocation) => {
    evaluations++;
    return evaluateHousehold(hh, a, totals).total;
  };

  const baseline = baselineAllocation(hh);
  const baselineResult = evaluateHousehold(hh, baseline, totals);

  const keys: PooledKey[] = [
    ...(hh.flex.cards ? CARD_KEYS : []),
    ...(hh.flex.medical ? MED_KEYS : []),
    // 연말 점검에서는 이미 한 기부(영수증 명의)를 옮길 수 없다
    ...(hh.flex.donations && !isActual(hh) ? DON_KEYS : []),
  ].filter((k) => totals[k] > 0);

  const distance = (a: Allocation) => {
    let d = 0;
    for (const k of keys) d += Math.abs(a.h[k] - baseline.h[k]);
    a.deps.forEach((s, i) => (d += s !== baseline.deps[i] ? 1e6 : 0));
    if (a.head !== baseline.head) d += 1e6;
    return d;
  };

  const descend = (start: Allocation, grid: number, passes: number, refine = true) => {
    const a = cloneAllocation(start);
    let best = evalAlloc(a);
    for (let pass = 0; pass < passes; pass++) {
      let improved = false;
      for (const k of keys) {
        const T = totals[k];
        let bestX = a.h[k];
        const tryX = (x: number) => {
          x = Math.min(T, Math.max(0, x));
          a.h[k] = x;
          const v = evalAlloc(a);
          if (v < best - 0.5) {
            best = v;
            bestX = x;
            improved = true;
          }
        };
        for (let i = 0; i <= grid; i++) tryX((T * i) / grid);
        let step = T / grid;
        while (refine && step > ROUND) {
          const center = bestX;
          const sub = step / 10;
          for (let j = -10; j <= 10; j++) tryX(center + j * sub);
          step = sub;
        }
        a.h[k] = bestX;
      }
      if (!improved) break;
    }
    return { a, value: best };
  };

  const extremes = (base: Allocation, who: Spouse): Allocation => {
    const a = cloneAllocation(base);
    for (const k of keys) a.h[k] = who === 'h' ? totals[k] : 0;
    return a;
  };

  // 이산 선택지 만들기
  const freeDeps = hh.dependents.map((d, i) => (d.locked ? -1 : i)).filter((i) => i >= 0);
  const heads: Spouse[] = hh.housing.headLocked ? [hh.housing.head] : ['h', 'w'];
  const combos: Allocation[] = [];
  if (freeDeps.length <= MAX_ENUM_DEPS) {
    for (let mask = 0; mask < 1 << freeDeps.length; mask++) {
      for (const head of heads) {
        const a = cloneAllocation(baseline);
        a.head = head;
        freeDeps.forEach((di, bit) => (a.deps[di] = mask & (1 << bit) ? 'w' : 'h'));
        combos.push(a);
      }
    }
  } else {
    combos.push(cloneAllocation(baseline));
  }

  type Cand = { a: Allocation; value: number };
  const better = (x: Cand, y: Cand | null) =>
    !y || x.value < y.value - 0.5 || (Math.abs(x.value - y.value) <= 0.5 && distance(x.a) < distance(y.a));

  // 1단계: 모든 조합을 거칠게 탐색
  const coarse: Cand[] = combos.map((c) => {
    let best: Cand | null = null;
    for (const start of [c, extremes(c, 'h'), extremes(c, 'w')]) {
      const r = descend(start, 10, 2, false);
      if (better(r, best)) best = r;
    }
    return best!;
  });
  coarse.sort((x, y) => x.value - y.value || distance(x.a) - distance(y.a));

  // 2단계: 상위 후보를 세밀하게
  let best: Cand | null = null;
  for (const c of coarse.slice(0, 4)) {
    for (const start of [c.a, extremes(c.a, 'h'), extremes(c.a, 'w')]) {
      const r = descend(start, 40, 4);
      if (better(r, best)) best = r;
    }
  }

  // 부양가족이 많으면 탐욕적으로 한 명씩 바꿔보기
  if (freeDeps.length > MAX_ENUM_DEPS && best) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const di of freeDeps) {
        const a = cloneAllocation(best.a);
        a.deps[di] = a.deps[di] === 'h' ? 'w' : 'h';
        const r = descend(a, 20, 2);
        if (r.value < best.value - 0.5) {
          best = r;
          changed = true;
        }
      }
    }
  }

  // 1만원 단위로 반올림 후, 손해가 없으면 채택
  const final = cloneAllocation(best!.a);
  for (const k of keys) final.h[k] = Math.min(totals[k], Math.max(0, Math.round(final.h[k] / ROUND) * ROUND));
  let bestAlloc = evalAlloc(final) <= best!.value + 1 ? final : best!.a;

  // 현재 상태보다 나쁘면 현재 상태 유지
  let bestResult = evaluateHousehold(hh, bestAlloc, totals);
  if (bestResult.total >= baselineResult.total) {
    bestAlloc = cloneAllocation(baseline);
    bestResult = baselineResult;
  }

  return {
    baseline,
    baselineResult,
    best: bestAlloc,
    bestResult,
    savings: baselineResult.total - bestResult.total,
    evaluations,
  };
}

/**
 * 카드 사용액 총합 중 남편 비중을 0~100%로 바꿔가며(다른 배분은 최적값 고정) 부부 합산 세금을 그린다.
 */
export function cardShareCurve(hh: HouseholdInput, best: Allocation, steps = 50) {
  const totals = pooledTotals(hh);
  const points: { share: number; total: number; h: number; w: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const a = cloneAllocation(best);
    for (const k of CARD_KEYS) a.h[k] = totals[k] * s;
    const r = evaluateHousehold(hh, a, totals);
    points.push({ share: s, total: r.total, h: r.h.totalTax, w: r.w.totalTax });
  }
  return points;
}
