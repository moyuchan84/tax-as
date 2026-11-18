import { useState, type ReactNode } from 'react';
import { estimateSocial } from '../tax/engine';
import { man, pct } from '../tax/format';
import { STYLES, STYLE_LABEL, annualSalary, cardSum, detectStyle, estimateWithheld, splitSpend, type SpendStyle } from '../tax/plan';
import { newDependent } from '../tax/sample';
import type { DependentInput, EducationType, HouseholdInput, PersonProfile, Relation, Spouse } from '../tax/types';
import { isActual } from '../tax/household';
import { paceRemaining } from '../tax/timeline';
import { Check, IntInput, MoneyInput, PairRow, Section, SingleCtx } from './inputs';
import { TimeControl } from './TimeControl';

type Props = { hh: HouseholdInput; onChange: (hh: HouseholdInput) => void; onMode: (m: 'plan' | 'actual') => void };

const CARD_LABELS = { credit: '신용카드', debitCash: '체크·현금영수증', market: '전통시장', transport: '대중교통', culture: '문화·체육' } as const;
const ZERO_CARD = { credit: 0, debitCash: 0, market: 0, transport: 0, culture: 0 };

const MORTGAGE_CAPS = [
  { v: 20_000_000, label: '2,000만 (15년↑ 고정+비거치)' },
  { v: 18_000_000, label: '1,800만 (15년↑ 고정 또는 비거치)' },
  { v: 8_000_000, label: '800만 (15년↑ 기타)' },
  { v: 6_000_000, label: '600만 (10년↑ 고정 또는 비거치)' },
];

const M = 10_000;

/** 급여명세서의 월급·상여·비과세 식대로 총급여를 계산해 주는 도우미 */
function SalaryHelper({ onApply }: { onApply: (salary: number) => void }) {
  const [monthly, setMonthly] = useState(0);
  const [bonus, setBonus] = useState(0);
  const [meal, setMeal] = useState(20 * M);
  const result = annualSalary(monthly, bonus, meal);
  return (
    <details className="helper">
      <summary>월급으로 계산</summary>
      <div className="helper-body">
        <label>
          월 지급총액(세전) <MoneyInput value={monthly} onChange={setMonthly} />
        </label>
        <label>
          연 상여·성과급 <MoneyInput value={bonus} onChange={setBonus} />
        </label>
        <label>
          월 비과세 식대 <MoneyInput value={meal} onChange={setMeal} />
        </label>
        <div className="helper-result">
          <span>총급여 {man(result)}</span>
          <button type="button" disabled={result <= 0} onClick={() => onApply(result)}>
            적용
          </button>
        </div>
      </div>
    </details>
  );
}

/** 연간 카드·현금 지출 총액 + 소비 성향으로 세부 항목을 자동 배분 */
function QuickSpend({ p, onApply }: { p: PersonProfile; onApply: (c: PersonProfile['cards']) => void }) {
  const sum = cardSum(p.cards);
  const [style, setStyle] = useState<SpendStyle>(() => detectStyle(p.cards));
  const creditShare = sum ? p.cards.credit / sum : 0;
  return (
    <div className="stack">
      <MoneyInput ariaLabel={`${p.name} 연간 카드·현금 지출 총액`} value={sum} onChange={(v) => onApply(splitSpend(v, style))} />
      <div className="chips" role="group" aria-label="소비 성향">
        {STYLES.map((s) => (
          <button
            key={s}
            type="button"
            className={style === s ? 'chip on' : 'chip'}
            aria-pressed={style === s}
            onClick={() => {
              setStyle(s);
              if (sum > 0) onApply(splitSpend(sum, s));
            }}
          >
            {STYLE_LABEL[s]}
          </button>
        ))}
      </div>
      {sum > 0 && (
        <small className="muted">
          신용 {pct(creditShare)} · 체크/현금/시장/교통 {pct(1 - creditShare)}
        </small>
      )}
    </div>
  );
}

export function InputPanel({ hh, onChange, onMode }: Props) {
  const actual = isActual(hh);
  const setPerson = (who: Spouse, patch: Partial<PersonProfile>) => {
    const key = who === 'h' ? 'husband' : 'wife';
    onChange({ ...hh, [key]: { ...hh[key], ...patch } });
  };

  /** 두 사람 각각에 같은 종류의 입력을 그린다 */
  const both = (render: (p: PersonProfile, set: (patch: Partial<PersonProfile>) => void, who: Spouse) => ReactNode) => ({
    h: render(hh.husband, (patch) => setPerson('h', patch), 'h'),
    w: render(hh.wife, (patch) => setPerson('w', patch), 'w'),
  });

  const money = (get: (p: PersonProfile) => number, put: (p: PersonProfile, v: number) => Partial<PersonProfile>, label: string) =>
    both((p, set, who) => <MoneyInput ariaLabel={`${who === 'h' ? '남편' : '아내'} ${label}`} value={get(p)} onChange={(v) => set(put(p, v))} />);

  const card = (k: keyof PersonProfile['cards'], label: string, hint?: string) => (
    <PairRow label={label} hint={hint} {...money((p) => p.cards[k], (p, v) => ({ cards: { ...p.cards, [k]: v } }), label)} />
  );
  const don = (k: keyof PersonProfile['donations'], label: string, hint?: string) => (
    <PairRow label={label} hint={hint} {...money((p) => p.donations[k], (p, v) => ({ donations: { ...p.donations, [k]: v } }), label)} />
  );

  const setDep = (i: number, patch: Partial<DependentInput>) =>
    onChange({ ...hh, dependents: hh.dependents.map((d, j) => (j === i ? { ...d, ...patch } : d)) });

  const single = !!hh.single;
  return (
    <SingleCtx.Provider value={single}>
    <div className="inputs">
      <TimeControl hh={hh} onChange={onChange} onMode={onMode} />
      <p className="guide">
        <span className="step">1</span> 소득 <i>→</i> <span className="step">2</span> 올해 예상 지출 <i>→</i> <span className="step">3</span> 가족. 값을 바꾸면 오른쪽 추천이 바로 갱신됩니다. 금액은 모두 <strong>만원</strong> 단위입니다.
      </p>

      <div className={single ? 'pair-row head single' : 'pair-row head'}>
        <div />
        <div>
          <input className="name" value={hh.husband.name} onChange={(e) => setPerson('h', { name: e.target.value })} aria-label="남편 이름" />
        </div>
        {!single && (
          <div>
            <input className="name" value={hh.wife.name} onChange={(e) => setPerson('w', { name: e.target.value })} aria-label="아내 이름" />
          </div>
        )}
      </div>

      <Section title="1. 소득" hint="급여명세서·원천징수영수증 기준">
        <PairRow
          label="총급여"
          hint="연봉 − 비과세(식대 등). 원천징수영수증의 ‘총급여’ 칸 값"
          {...money((p) => p.salary, (_, v) => ({ salary: v }), '총급여')}
        />
        <PairRow label="" {...both((_, set) => <SalaryHelper onApply={(v) => set({ salary: v })} />)} />
        <PairRow label="나이" {...both((p, set) => <IntInput value={p.age} suffix="세" onChange={(v) => set({ age: v })} />)} />
        <PairRow label="장애인" {...both((p, set) => <Check checked={p.disabled} onChange={(v) => set({ disabled: v })}>해당</Check>)} />
        <PairRow
          label="기납부세액"
          hint="이미 원천징수된 소득세 (선택)"
          {...both((p, set, who) => (
            <div className="stack">
              <MoneyInput ariaLabel={`${who === 'h' ? '남편' : '아내'} 기납부세액`} value={p.withheld} onChange={(v) => set({ withheld: v })} />
              <button type="button" className="link" onClick={() => set({ withheld: estimateWithheld(hh, who) })}>
                간이세액표로 추정
              </button>
            </div>
          ))}
        />
        <p className="note">
          정확한 값은 급여명세서 12월분의 ‘소득세 누계’ 또는 홈택스 <b>연말정산 미리보기</b>에서 확인하세요. 원천징수 비율(80·100·120%)은 매달 떼는 금액만 바꾸고
          <b> 최종 세금은 같습니다</b> — 환급·추가납부 금액만 달라집니다.
        </p>
        <PairRow
          label="4대보험"
          hint="본인부담분"
          {...both((p, set) => {
            const est = estimateSocial(p.salary);
            return (
              <div className="stack">
                <Check checked={p.autoSocial} onChange={(v) => set({ autoSocial: v, ...(v ? {} : est) })}>
                  자동 추정
                </Check>
                {p.autoSocial ? (
                  <small className="muted">
                    연금 {man(est.pension)} · 건강 {man(est.health)} · 고용 {man(est.employment)}
                  </small>
                ) : (
                  <>
                    <MoneyInput ariaLabel="국민연금" value={p.pension} onChange={(v) => set({ pension: v })} />
                    <MoneyInput ariaLabel="건강보험" value={p.health} onChange={(v) => set({ health: v })} />
                    <MoneyInput ariaLabel="고용보험" value={p.employment} onChange={(v) => set({ employment: v })} />
                  </>
                )}
              </div>
            );
          })}
        />
        <PairRow
          label="결혼세액공제"
          hint="2024~2026년 혼인신고, 1인 50만원"
          {...both((p, set) => <Check checked={p.marriage} onChange={(v) => set({ marriage: v })}>대상</Check>)}
        />
      </Section>

      <Section title={actual ? '2. 지금까지 실제 + 남은 기간' : '2. 올해 예상 지출'} hint={actual ? '이미 쓴 건 고정, 남은 지출만 배분' : '올해 전체(이미 쓴 금액 + 12월까지 쓸 금액)'}>
        <PairRow
          label={actual ? '지금까지 카드·현금 사용' : '카드·현금 총지출'}
          hint={actual ? '각자 명의로 실제 사용한 금액 (바꿀 수 없음)' : '총액과 소비 성향만 고르면 아래 세부 항목이 자동으로 채워져요'}
          {...both((p, set) => <QuickSpend p={p} onApply={(cards) => set({ cards })} />)}
        />
        <details className="helper wide">
          <summary>세부 항목 직접 입력</summary>
          <div className="section-body">
            {card('credit', '신용카드', '공제율 15%')}
            {card('debitCash', '체크카드·현금영수증', '30%')}
            {card('market', '전통시장', '40%')}
            {card('transport', '대중교통', '40%')}
            {card('culture', '도서·공연·헬스장·수영장', '30%, 총급여 7천 이하')}
          </div>
        </details>
        {actual && (
          <div className="remaining-box">
            <div className="rb-head">
              <b>남은 기간 예상 지출 {single ? '' : '(부부 합계)'}</b>
              <button type="button" className="link" onClick={() => onChange({ ...hh, remaining: paceRemaining(hh) })}>
                지금 속도로 채우기
              </button>
            </div>
            <p className="muted">{single ? '남은 기간에 쓸 것으로 예상하는 금액입니다.' : '누가 쓸지 아직 정해지지 않은 금액입니다. 어느 카드로 쓰면 좋을지 오른쪽에서 추천해 드려요.'}</p>
            <div className="rb-grid">
              {(Object.keys(CARD_LABELS) as (keyof typeof CARD_LABELS)[]).map((k) => (
                <label key={k}>
                  <span>{CARD_LABELS[k]}</span>
                  <MoneyInput ariaLabel={`남은 기간 ${CARD_LABELS[k]}`} value={(hh.remaining ?? ZERO_CARD)[k]} onChange={(v) => onChange({ ...hh, remaining: { ...(hh.remaining ?? ZERO_CARD), [k]: v } })} />
                </label>
              ))}
            </div>
          </div>
        )}
        {!single && (
          <Check checked={hh.flex.cards} onChange={(v) => onChange({ ...hh, flex: { ...hh.flex, cards: v } })}>
            부부 간에 카드 사용을 옮길 수 있음 (최적화 대상)
          </Check>
        )}
        <PairRow label="본인 의료비" hint="실손보험금 수령분 제외" {...money((p) => p.medical, (_, v) => ({ medical: v }), '본인 의료비')} />
        {!single && (
          <Check checked={hh.flex.medical} onChange={(v) => onChange({ ...hh, flex: { ...hh.flex, medical: v } })}>
            배우자 의료비를 대신 결제할 수 있음 (최적화 대상)
          </Check>
        )}
        <PairRow label="본인 교육비" hint="대학원·직업훈련 등" {...money((p) => p.ownEducation, (_, v) => ({ ownEducation: v }), '본인 교육비')} />
        <PairRow label="보장성보험료" hint="연 100만 한도 12%" {...money((p) => p.insurance, (_, v) => ({ insurance: v }), '보장성보험료')} />
        <PairRow label="장애인전용보험" {...money((p) => p.disabledInsurance, (_, v) => ({ disabledInsurance: v }), '장애인전용보험')} />
        <PairRow label="연금저축" hint="600만 한도" {...money((p) => p.pensionSavings, (_, v) => ({ pensionSavings: v }), '연금저축')} />
        <PairRow label="IRP·퇴직연금" hint="연금저축과 합산 900만" {...money((p) => p.irp, (_, v) => ({ irp: v }), 'IRP')} />
      </Section>

      <Section title="3. 가족" hint="자녀·부모님 (소득금액 100만원 이하 가정)">
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
            <div className="dep-row">
              <span className="muted">의료비</span>
              <MoneyInput value={d.medical} onChange={(v) => setDep(i, { medical: v })} ariaLabel="의료비" />
              <select value={d.educationType} onChange={(e) => setDep(i, { educationType: e.target.value as EducationType })} aria-label="교육 구분">
                <option value="none">교육비 없음</option>
                <option value="preschool">취학전(학원 포함)</option>
                <option value="school">초·중·고</option>
                <option value="university">대학</option>
                <option value="disabledSpecial">장애인 특수교육</option>
              </select>
              {d.educationType !== 'none' && <MoneyInput value={d.education} onChange={(v) => setDep(i, { education: v })} ariaLabel="교육비" />}
            </div>
            {!single && <div className="dep-row">
              <span className="muted">현재 공제자</span>
              <select value={d.assignedTo} onChange={(e) => setDep(i, { assignedTo: e.target.value as Spouse })} aria-label="현재 공제자">
                <option value="h">{hh.husband.name || '남편'}</option>
                <option value="w">{hh.wife.name || '아내'}</option>
              </select>
              <Check checked={d.locked} onChange={(v) => setDep(i, { locked: v })}>
                고정 (옮기지 않음)
              </Check>
            </div>}
          </div>
        ))}
        <button type="button" onClick={() => onChange({ ...hh, dependents: [...hh.dependents, newDependent()] })}>
          + 부양가족 추가
        </button>
      </Section>

      <Section title="더 입력하기: 주택·기부금" hint="있을 때만" defaultOpen={false}>
        {!single && <div className="row-inline">
          <span>세대주</span>
          <select value={hh.housing.head} onChange={(e) => onChange({ ...hh, housing: { ...hh.housing, head: e.target.value as Spouse } })}>
            <option value="h">{hh.husband.name || '남편'}</option>
            <option value="w">{hh.wife.name || '아내'}</option>
          </select>
          <Check checked={hh.housing.headLocked} onChange={(v) => onChange({ ...hh, housing: { ...hh.housing, headLocked: v } })}>
            고정
          </Check>
        </div>}
        <div className="row-inline">
          <span>연간 월세 합계</span>
          <MoneyInput value={hh.housing.rent} onChange={(v) => onChange({ ...hh, housing: { ...hh.housing, rent: v } })} />
        </div>
        <div className="row-inline">
          <span>전세대출 원리금 상환</span>
          <MoneyInput value={hh.housing.leaseLoanRepay} onChange={(v) => onChange({ ...hh, housing: { ...hh.housing, leaseLoanRepay: v } })} />
        </div>
        <PairRow label="주택청약 납입" hint="무주택 세대주, 총급여 7천 이하" {...money((p) => p.housingSubscription, (_, v) => ({ housingSubscription: v }), '주택청약')} />
        <PairRow label="주담대 이자상환" hint="장기주택저당차입금" {...money((p) => p.mortgageInterest, (_, v) => ({ mortgageInterest: v }), '주담대 이자')} />
        <PairRow
          label="주담대 공제한도"
          {...both((p, set) => (
            <select value={p.mortgageCap} onChange={(e) => set({ mortgageCap: Number(e.target.value) })}>
              {MORTGAGE_CAPS.map((c) => (
                <option key={c.v} value={c.v}>
                  {c.label}
                </option>
              ))}
            </select>
          ))}
        />
        {don('general', '일반·특례 기부금', '15%, 1천만 초과 30%')}
        {don('political', '정치자금', '10만까지 100/110')}
        {don('hometown', '고향사랑', '10만까지 100/110')}
        {!single && (
          <Check checked={hh.flex.donations} onChange={(v) => onChange({ ...hh, flex: { ...hh.flex, donations: v } })}>
            기부 명의를 나눌 수 있음 (최적화 대상)
          </Check>
        )}
      </Section>
    </div>
    </SingleCtx.Provider>
  );
}
