import { pensionCaps } from './engine';
import { COMP, compPersonTax, compPersonTaxMode, yellowLimit, type CompHousehold, type CompPerson } from './comp';
import { ctxFor, evalComp, type CompAlloc, type CompOptimizeResult } from './compHousehold';
import { man, pct, won } from './format';
import { RULES } from './rules';
import type { Tip } from './strategy';

const L = 1 + RULES.localTaxRate;

export function buildCompStrategy(hh: CompHousehold, opt: CompOptimizeResult): Tip[] {
  const tips: Tip[] = [];
  const best = opt.best;
  const people = hh.people;
  const names = people.map((p, i) => p.name || (hh.single ? '본인' : i === 0 ? '남편' : '아내'));
  const res = opt.bestResult.people;
  const ctx = (i: number) => ctxFor(hh, people, best, i);
  const gainOf = (i: number, mod: (p: CompPerson) => CompPerson) => {
    const base = compPersonTax(people[i], ctx(i)).totalTax;
    return base - compPersonTax(mod(people[i]), ctx(i)).totalTax;
  };

  // 1. 세율 위치
  people.forEach((_, i) => {
    const r = res[i];
    if (r.totalIncome <= 0 && r.houseSeparateTax <= 0) return;
    const next = r.nextBracket ? ` 과세표준이 ${man(r.nextBracket.room)} 더 늘면 세율이 ${pct(r.nextBracket.rate)}로 올라갑니다.` : '';
    tips.push({
      level: 'info',
      title: `${names[i]}: 종합소득금액 ${man(r.totalIncome)} → 한계세율 ${pct(r.marginalRate)} (지방세 포함 ${pct(r.marginalRate * L)})`,
      detail: `과세표준 ${man(r.taxBase)}. 소득공제 1만원은 한계세율만큼 세금을 줄입니다.${next} 소득이 부부 중 한쪽에 몰려 있으면 아래 ‘소득 분산’ 효과를 확인하세요.`,
    });
  });

  // 2. 부양가족 배정
  if (!hh.single) {
    hh.dependents.forEach((d, i) => {
      if (best.deps[i] === opt.baseline.deps[i]) return;
      const a: CompAlloc = { deps: [...opt.baseline.deps], shift: null };
      a.deps[i] = best.deps[i];
      const s = opt.baselineResult.total - evalComp(hh, a).total;
      tips.push({
        level: 'action',
        title: `${d.name || `부양가족 ${i + 1}`} → ${best.deps[i] === 'h' ? names[0] : names[1]} 공제로 변경`,
        detail: '한계세율이 높은 쪽이 인적공제(1명당 150만원)와 자녀세액공제를 받는 편이 유리합니다. 부부가 중복으로 공제받으면 안 됩니다.',
        saving: s,
      });
    });
  }

  people.forEach((p, i) => {
    const name = names[i];
    const r = res[i];

    // 3. 주택임대: 분리 vs 종합
    if (p.hasRental && p.rental.houseRevenue > 0) {
      const sep = compPersonTaxMode(p, ctx(i), 'separate');
      const com = compPersonTaxMode(p, ctx(i), 'comprehensive');
      const canSep = p.rental.houseRevenue <= COMP.rental.revenueLimit;
      const choose = canSep && sep.totalTax <= com.totalTax ? '분리과세(14%)' : '종합과세';
      tips.push({
        level: canSep && Math.abs(sep.totalTax - com.totalTax) > 0 ? 'action' : 'info',
        title: `${name}: 주택임대 ${choose} 선택이 유리`,
        detail:
          (canSep
            ? `분리과세 시 세금 ${won(sep.totalTax)} vs 종합과세 시 ${won(com.totalTax)}. `
            : `주택임대 수입이 ${man(COMP.rental.revenueLimit)}을 넘어 분리과세를 선택할 수 없고 종합과세됩니다. `) +
          `분리과세는 필요경비율 ${pct(p.rental.houseRegistered ? COMP.rental.expenseRate.registered : COMP.rental.expenseRate.unregistered)}와 기본공제(${man(p.rental.houseRegistered ? COMP.rental.basicDeduction.registered : COMP.rental.basicDeduction.unregistered)}, 다른 종합소득금액이 ${man(COMP.rental.otherIncomeLimit)} 이하일 때)를 적용합니다. 다른 소득이 크면 종합과세 때 세율이 높아져 분리과세가 대체로 유리합니다.`,
        saving: canSep ? Math.abs(sep.totalTax - com.totalTax) : undefined,
      });
      if (canSep && !p.rental.houseRegistered) {
        const reg = gainOf(i, (q) => ({ ...q, rental: { ...q.rental, houseRegistered: true } }));
        if (reg > 0)
          tips.push({
            level: 'info',
            kind: 'extra',
            title: `${name}: 임대주택 등록 시 ${won(reg)} 추가 절세 가능`,
            detail: '세무서(사업자등록)와 지자체(임대주택 등록)에 등록한 임대주택은 분리과세 필요경비율 60%·기본공제 400만원이 적용됩니다. 다만 등록 요건(임대료 증액 제한, 의무임대기간 등)과 건강보험료 영향을 먼저 확인하세요.',
            saving: reg,
          });
      }
    }

    // 4. 사업소득: 노란우산·기장·경비 방식
    if (p.hasBusiness && p.business.revenue > 0) {
      const lim = yellowLimit(r.businessIncome);
      const room = Math.max(0, lim - Math.min(p.business.yellowUmbrella, lim));
      if (room > 0 && r.businessIncome > 0) {
        const g = gainOf(i, (q) => ({ ...q, business: { ...q.business, yellowUmbrella: lim } }));
        if (g > 0)
          tips.push({
            level: 'action',
            kind: 'extra',
            title: `${name}: 노란우산공제 ${man(room)} 추가 납입 시 ${won(g)} 절세`,
            detail: `소기업·소상공인 공제부금은 사업소득금액 ${man(r.businessIncome)} 기준 연 ${man(lim)}까지 소득공제됩니다(4천만 이하 600만, 4천만~1억 400만, 1억 초과 200만). 12월 31일까지 납입분이 대상이고, 중도 해지하면 불이익이 있습니다.`,
            saving: g,
          });
      }
      if (p.business.bookkeeping === 'none') {
        const g = gainOf(i, (q) => ({ ...q, business: { ...q.business, bookkeeping: 'simple' } }));
        if (g > 0)
          tips.push({
            level: 'action',
            kind: 'extra',
            title: `${name}: 간편장부로 기장하면 기장세액공제 ${won(g)}`,
            detail: '간편장부대상자(직전연도 수입이 업종별 기준 미만: 도소매·농업 3억, 제조·음식 1.5억, 서비스 7,500만원)가 장부를 쓰면 산출세액의 20%(한도 100만원)를 공제받고 무기장 가산세도 피합니다. 복식부기의무자는 해당하지 않습니다.',
            saving: g,
          });
      }
      if (p.business.expense > 0 && p.business.expenseRate > 0) {
        const other = p.business.expenseMode === 'actual' ? 'rate' : 'actual';
        const g = gainOf(i, (q) => ({ ...q, business: { ...q.business, expenseMode: other } }));
        if (g > 0)
          tips.push({
            level: 'info',
            title: `${name}: 필요경비는 ${other === 'rate' ? '경비율(추계)' : '실제 경비(장부)'} 방식이 ${won(g)} 유리`,
            detail: '추계신고(단순·기준경비율)는 수입 규모 등 요건을 갖춘 사업자만 가능하고, 장부 없이 추계하면 기장세액공제를 받을 수 없습니다. 요건을 확인하세요.',
            saving: g,
          });
      }
      if (p.business.withholding33) {
        tips.push({
          level: 'info',
          title: `${name}: 3.3% 원천징수 ${won(r.prepaid)} → 최종 ${r.payable >= 0 ? `${won(r.payable)} 추가 납부` : `${won(-r.payable)} 환급`} 예상`,
          detail: '프리랜서가 받을 때 뗀 3%(소득세)는 기납부세액입니다. 소득이 낮으면 경비·공제 후 환급받고, 높으면 추가 납부합니다. 경비 증빙과 단순경비율 적용 가능 여부가 환급액을 좌우합니다.',
        });
      }
    }

    // 5. 연금저축·IRP
    const wageOnly = p.hasWage && !p.hasBusiness && !p.hasRental;
    const caps = pensionCaps(p.hasWage ? p.wage.salary : 0, wageOnly ? undefined : r.totalIncome);
    const proom = Math.max(0, caps.totalCap - Math.min(p.pensionSavings, caps.savingsCap) - p.irp);
    if (proom > 0 && r.determinedTax > 0) {
      const g = gainOf(i, (q) => ({ ...q, irp: q.irp + proom }));
      if (g > 0)
        tips.push({
          level: 'action',
          kind: 'extra',
          title: `${name}: 연금저축·IRP ${man(proom)} 추가 납입 시 ${won(g)} 절세`,
          detail: `연금계좌는 합산 연 ${man(caps.totalCap)}(연금저축 ${man(caps.savingsCap)} 이내)까지 세액공제됩니다.${caps.reduced ? ' 소득이 높아 한도가 줄어든 구간입니다.' : ''} 사업·임대 소득도 연금계좌 세액공제를 받을 수 있으며 12월 31일까지 납입분이 대상입니다.`,
          saving: g,
        });
    }
  });

  // 6. 소득 분산
  if (opt.bestShift?.alloc.shift) {
    const sh = opt.bestShift.alloc.shift;
    const from = sh.from === 'h' ? names[0] : names[1];
    const to = sh.from === 'h' ? names[1] : names[0];
    tips.push({
      level: 'info',
      title: `소득 분산: ${from}의 ${sh.kind === 'rental' ? '임대' : '사업'} 소득 ${Math.round(sh.share * 100)}%를 ${to}에게 → ${won(opt.shiftSavings)} 절세 가능`,
      detail:
        sh.kind === 'rental'
          ? '부동산을 공동명의(지분 이전)로 하면 임대소득이 지분대로 나뉘어 누진세율이 낮아집니다. 단, 배우자에게 지분을 넘기면 증여(배우자 10년 6억원 공제 초과 시 증여세)·취득세·양도소득세가 따로 생길 수 있어 세무사 상담이 필요합니다.'
          : '배우자가 실제로 사업에 참여하는 공동사업자(동업계약·사업자등록)여야 소득을 나눌 수 있습니다. 명목상 분산은 세무조사에서 부인될 수 있고, 건강보험료(지역가입자)도 함께 변합니다.',
      saving: opt.shiftSavings,
    });
  }

  // 7. 일정·주의
  tips.push({
    level: 'info',
    title: '신고·납부 일정과 건강보험료',
    detail:
      '종합소득세 신고·납부는 다음 해 5월 1~31일(성실신고확인 대상은 6월 30일)입니다. 사업소득이 있으면 11월에 중간예납(직전연도 세액의 1/2) 고지서가 나옵니다(11월 30일 납부). 지역가입자는 소득·재산에 따라 건강보험료가 정해지므로, 임대소득 분리과세나 소득 분산 시 건보료 변화도 함께 확인하세요(이 계산에는 반영하지 않았습니다).',
  });
  return tips;
}
