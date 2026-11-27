import type { ReactNode } from 'react';
import { COMP, type Bookkeeping, type CompHousehold, type CompPerson, type ExpenseMode, type HouseChoice } from '../tax/comp';
import { estimateSocialFor } from '../tax/comp';
import { man } from '../tax/format';
import { newDependent } from '../tax/sample';
import type { DependentInput, Relation, Spouse } from '../tax/types';
import { Check, IntInput, MoneyInput, PairRow, Section, SingleCtx } from './inputs';

type Props = {
  hh: CompHousehold;
  onChange: (hh: CompHousehold) => void;
  includeShift: boolean;
  onIncludeShift: (v: boolean) => void;
};

const NA = <span className="muted">해당 없음</span>;

export function CompInputPanel({ hh, onChange, includeShift, onIncludeShift }: Props) {
  const single = hh.single;
  const anyWage = hh.people.some((p) => p.hasWage);
  const anyBiz = hh.people.some((p) => p.hasBusiness);
  const anyRent = hh.people.some((p) => p.hasRental);

  const setP = (i: number, fn: (p: CompPerson) => CompPerson) => onChange({ ...hh, people: hh.people.map((p, j) => (j === i ? fn(p) : p)) });
  const pair = (render: (p: CompPerson, i: number) => ReactNode) => ({
    h: render(hh.people[0], 0),
    w: hh.people[1] ? render(hh.people[1], 1) : null,
  });
  const money = (get: (p: CompPerson) => number, put: (p: CompPerson, v: number) => CompPerson, label: string, applies: (p: CompPerson) => boolean = () => true) =>
    pair((p, i) => (applies(p) ? <MoneyInput ariaLabel={`${p.name} ${label}`} value={get(p)} onChange={(v) => setP(i, (q) => put(q, v))} /> : NA));
  const flag = (get: (p: CompPerson) => boolean, put: (p: CompPerson, v: boolean) => CompPerson, text: string, applies: (p: CompPerson) => boolean) =>
    pair((p, i) => (applies(p) ? <Check checked={get(p)} onChange={(v) => setP(i, (q) => put(q, v))}>{text}</Check> : NA));
  const select = <T extends string>(get: (p: CompPerson) => T, put: (p: CompPerson, v: T) => CompPerson, options: [T, string][], label: string, applies: (p: CompPerson) => boolean) =>
    pair((p, i) =>
      applies(p) ? (
        <select aria-label={`${p.name} ${label}`} value={get(p)} onChange={(e) => setP(i, (q) => put(q, e.target.value as T))}>
          {options.map(([v, t]) => (
            <option key={v} value={v}>{t}</option>
          ))}
        </select>
      ) : (
        NA
      ),
    );

  const biz = (p: CompPerson) => p.hasBusiness;
  const rent = (p: CompPerson) => p.hasRental;
  const wage = (p: CompPerson) => p.hasWage;

  const setDep = (i: number, patch: Partial<DependentInput>) => onChange({ ...hh, dependents: hh.dependents.map((d, j) => (j === i ? { ...d, ...patch } : d)) });

  return (
    <SingleCtx.Provider value={single}>
      <div className="inputs">
        <p className="guide">
          <span className="step">1</span> 소득 <i>→</i> <span className="step">2</span> 공제 <i>→</i> <span className="step">3</span> 가족. 금액은 모두 <strong>만원</strong> 단위, 1년(1~12월) 합계입니다.
        </p>

        <div className={single ? 'pair-row head single' : 'pair-row head'}>
          <div />
          {hh.people.map((p, i) => (
            <div key={i}>
              <input className="name" value={p.name} onChange={(e) => setP(i, (q) => ({ ...q, name: e.target.value }))} aria-label={`${i === 0 ? '본인' : '배우자'} 이름`} />
              <small className="tags">
                {[p.hasWage && '근로', p.hasBusiness && '사업', p.hasRental && '임대'].filter(Boolean).join('·') || '소득 없음'}
              </small>
            </div>
          ))}
        </div>

        <Section title="기본 정보">
          <PairRow label="나이" {...pair((p, i) => <IntInput value={p.age} suffix="세" onChange={(v) => setP(i, (q) => ({ ...q, age: v }))} />)} />
          <PairRow label="장애인" {...pair((p, i) => <Check checked={p.disabled} onChange={(v) => setP(i, (q) => ({ ...q, disabled: v }))}>해당</Check>)} />
        </Section>

        {anyWage && (
          <Section title="1-1. 근로소득 (직장인)" hint="연말정산 결과를 그대로 옮겨 적으세요">
            <PairRow label="총급여" hint="원천징수영수증 ‘총급여’" {...money((p) => p.wage.salary, (p, v) => ({ ...p, wage: { ...p.wage, salary: v } }), '총급여', wage)} />
            <PairRow label="원천징수 소득세" hint="이미 낸 소득세(기납부)" {...money((p) => p.wage.withheld, (p, v) => ({ ...p, wage: { ...p.wage, withheld: v } }), '원천징수 소득세', wage)} />
            <PairRow label="소득공제 합계" hint="카드·보험료·청약 등 (4대보험은 자동 추정)" {...money((p) => p.wage.otherDeduction, (p, v) => ({ ...p, wage: { ...p.wage, otherDeduction: v } }), '소득공제 합계', wage)} />
            <PairRow label="세액공제 합계" hint="의료·교육·기부·월세 등 (13만원 미만이면 표준세액공제 13만원)" {...money((p) => p.wage.otherCredit, (p, v) => ({ ...p, wage: { ...p.wage, otherCredit: v } }), '세액공제 합계', wage)} />
            <p className="note">
              근로소득은 연말정산 때 한 번 계산하지만, 사업·임대 소득이 있으면 5월에 <b>합산해서 다시 신고</b>합니다. 위 공제 값은 연말정산 시뮬레이터의 결과(소득공제·세액공제)를 옮겨 적으면 됩니다.
              {hh.people.map((p, i) => (p.hasWage ? <span key={i}> {p.name} 4대보험 추정: 연금 {man(estimateSocialFor(p).pension)}.</span> : null))}
            </p>
          </Section>
        )}

        {anyBiz && (
          <Section title="1-2. 사업소득 (개인사업자·프리랜서)">
            <PairRow label="연 매출" hint="총수입금액 (부가세 제외)" {...money((p) => p.business.revenue, (p, v) => ({ ...p, business: { ...p.business, revenue: v } }), '연 매출', biz)} />
            <PairRow label="필요경비 방식" {...select<ExpenseMode>((p) => p.business.expenseMode, (p, v) => ({ ...p, business: { ...p.business, expenseMode: v } }), [['actual', '실제 경비(장부)'], ['rate', '경비율(추계)']], '경비 방식', biz)} />
            <PairRow
              label="필요경비"
              hint="실제 경비 금액 또는 경비율(%)"
              {...pair((p, i) =>
                !p.hasBusiness ? (
                  NA
                ) : p.business.expenseMode === 'actual' ? (
                  <MoneyInput ariaLabel={`${p.name} 필요경비`} value={p.business.expense} onChange={(v) => setP(i, (q) => ({ ...q, business: { ...q.business, expense: v } }))} />
                ) : (
                  <IntInput ariaLabel={`${p.name} 경비율`} value={Math.round(p.business.expenseRate * 100)} suffix="%" onChange={(v) => setP(i, (q) => ({ ...q, business: { ...q.business, expenseRate: Math.min(100, v) / 100 } }))} />
                ),
              )}
            />
            <PairRow label="장부 기장" hint="간편장부 기장 시 기장세액공제" {...select<Bookkeeping>((p) => p.business.bookkeeping, (p, v) => ({ ...p, business: { ...p.business, bookkeeping: v } }), [['none', '무기장(추계)'], ['simple', '간편장부 기장'], ['complex', '복식부기 의무자']], '장부', biz)} />
            <PairRow label="3.3% 원천징수" hint="프리랜서(인적용역)" {...flag((p) => p.business.withholding33, (p, v) => ({ ...p, business: { ...p.business, withholding33: v } }), '떼고 받음', biz)} />
            <PairRow label="국민연금(지역)" hint="연간 납부액, 전액 소득공제" {...money((p) => p.business.pension, (p, v) => ({ ...p, business: { ...p.business, pension: v } }), '지역 국민연금', biz)} />
            <PairRow label="노란우산공제" hint="연 납입액 (한도 200~600만)" {...money((p) => p.business.yellowUmbrella, (p, v) => ({ ...p, business: { ...p.business, yellowUmbrella: v } }), '노란우산공제', biz)} />
          </Section>
        )}

        {anyRent && (
          <Section title="1-3. 임대소득">
            <PairRow label="주택 임대수입" hint="연 월세 합계(보증금 간주임대료 제외)" {...money((p) => p.rental.houseRevenue, (p, v) => ({ ...p, rental: { ...p.rental, houseRevenue: v } }), '주택 임대수입', rent)} />
            <PairRow label="등록임대주택" hint="세무서+지자체 등록" {...flag((p) => p.rental.houseRegistered, (p, v) => ({ ...p, rental: { ...p.rental, houseRegistered: v } }), '등록함', rent)} />
            <PairRow
              label="주택임대 과세방식"
              hint="수입 2천만 이하만 분리과세 가능"
              {...select<HouseChoice>((p) => p.rental.houseChoice, (p, v) => ({ ...p, rental: { ...p.rental, houseChoice: v } }), [['auto', '유리한 쪽 자동'], ['separate', '분리과세(14%)'], ['comprehensive', '종합과세']], '과세방식', rent)}
            />
            <PairRow
              label="종합과세 시 경비"
              hint={`경비율 예시 ${Math.round(COMP.rental.defaultHouseExpenseRate * 1000) / 10}% (고시값 확인)`}
              {...pair((p, i) =>
                !p.hasRental ? (
                  NA
                ) : (
                  <div className="stack">
                    <select aria-label={`${p.name} 임대 경비 방식`} value={p.rental.houseExpenseMode} onChange={(e) => setP(i, (q) => ({ ...q, rental: { ...q.rental, houseExpenseMode: e.target.value as ExpenseMode } }))}>
                      <option value="rate">경비율(추계)</option>
                      <option value="actual">실제 경비</option>
                    </select>
                    {p.rental.houseExpenseMode === 'actual' ? (
                      <MoneyInput ariaLabel={`${p.name} 주택임대 경비`} value={p.rental.houseExpense} onChange={(v) => setP(i, (q) => ({ ...q, rental: { ...q.rental, houseExpense: v } }))} />
                    ) : (
                      <IntInput ariaLabel={`${p.name} 주택임대 경비율`} value={Math.round(p.rental.houseExpenseRate * 1000) / 10} suffix="%" onChange={(v) => setP(i, (q) => ({ ...q, rental: { ...q.rental, houseExpenseRate: Math.min(100, v) / 100 } }))} />
                    )}
                  </div>
                ),
              )}
            />
            <PairRow label="상가 등 임대수입" hint="사업소득(부동산임대업), 종합과세" {...money((p) => p.rental.shopRevenue, (p, v) => ({ ...p, rental: { ...p.rental, shopRevenue: v } }), '상가 임대수입', rent)} />
            <PairRow label="상가 필요경비" hint="재산세·감가상각·이자 등" {...money((p) => p.rental.shopExpense, (p, v) => ({ ...p, rental: { ...p.rental, shopExpense: v } }), '상가 필요경비', rent)} />
          </Section>
        )}

        <Section title="2. 공제·기납부">
          <PairRow label="연금저축" hint="600만 한도 (소득 1억 초과 300만)" {...money((p) => p.pensionSavings, (p, v) => ({ ...p, pensionSavings: v }), '연금저축')} />
          <PairRow label="IRP·퇴직연금" hint="연금저축과 합산 900만 (1억 초과 700만)" {...money((p) => p.irp, (p, v) => ({ ...p, irp: v }), 'IRP')} />
          <PairRow label="기타 기납부세액" hint="중간예납 등" {...money((p) => p.prepaid, (p, v) => ({ ...p, prepaid: v }), '기타 기납부세액')} />
        </Section>

        <Section title="3. 가족" hint="자녀·부모님 (소득금액 100만원 이하 가정)">
          {!single && <p className="muted">배우자 소득이 100만원 이하(근로만이면 총급여 500만원 이하)이면 배우자 기본공제를 자동 반영합니다.</p>}
          {hh.dependents.length === 0 && <p className="muted">부양가족이 없습니다.</p>}
          {hh.dependents.map((d, i) => (
            <div className="dep" key={d.id}>
              <div className="dep-row">
                <input className="name" value={d.name} placeholder="이름" onChange={(e) => setDep(i, { name: e.target.value })} aria-label="부양가족 이름" />
                <select value={d.relation} onChange={(e) => setDep(i, { relation: e.target.value as Relation })} aria-label="관계">
                  <option value="child">자녀</option>
                  <option value="parent">부모·조부모</option>
                  <option value="other">기타(형제 등)</option>
                </select>
                <IntInput value={d.age} suffix="세" onChange={(v) => setDep(i, { age: v })} ariaLabel="나이" />
                <Check checked={d.disabled} onChange={(v) => setDep(i, { disabled: v })}>장애인</Check>
                <button type="button" className="ghost" onClick={() => onChange({ ...hh, dependents: hh.dependents.filter((_, j) => j !== i) })} aria-label="삭제">
                  ✕
                </button>
              </div>
              {!single && (
                <div className="dep-row">
                  <span className="muted">현재 공제자</span>
                  <select value={d.assignedTo} onChange={(e) => setDep(i, { assignedTo: e.target.value as Spouse })} aria-label="현재 공제자">
                    <option value="h">{hh.people[0].name}</option>
                    <option value="w">{hh.people[1].name}</option>
                  </select>
                  <Check checked={d.locked} onChange={(v) => setDep(i, { locked: v })}>
                    고정 (옮기지 않음)
                  </Check>
                </div>
              )}
            </div>
          ))}
          <button type="button" onClick={() => onChange({ ...hh, dependents: [...hh.dependents, newDependent()] })}>
            + 부양가족 추가
          </button>
        </Section>

        {!single && (anyBiz || anyRent) && (
          <Section title="옵션" defaultOpen>
            <Check checked={includeShift} onChange={onIncludeShift}>
              부부 간 소득 분산(지분 이전·공동사업)도 절세액에 포함해서 보기
            </Check>
            <p className="note">분산은 증여세·취득세·건강보험료·사업 실질 요건 등 부수 효과가 크니 ‘소득 분산’ 탭의 주의사항을 꼭 읽고 판단하세요.</p>
          </Section>
        )}
      </div>
    </SingleCtx.Provider>
  );
}
