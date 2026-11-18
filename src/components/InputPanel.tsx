import type { ReactNode } from 'react';
import { estimateSocial } from '../tax/engine';
import { man } from '../tax/format';
import { newDependent } from '../tax/sample';
import type { DependentInput, EducationType, HouseholdInput, PersonProfile, Relation, Spouse } from '../tax/types';
import { Check, IntInput, MoneyInput, PairRow, Section } from './inputs';

type Props = { hh: HouseholdInput; onChange: (hh: HouseholdInput) => void };

const MORTGAGE_CAPS = [
  { v: 20_000_000, label: '2,000만 (15년↑ 고정+비거치)' },
  { v: 18_000_000, label: '1,800만 (15년↑ 고정 또는 비거치)' },
  { v: 8_000_000, label: '800만 (15년↑ 기타)' },
  { v: 6_000_000, label: '600만 (10년↑ 고정 또는 비거치)' },
];

export function InputPanel({ hh, onChange }: Props) {
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

  return (
    <div className="inputs">
      <div className="pair-row head">
        <div />
        <div>
          <input className="name" value={hh.husband.name} onChange={(e) => setPerson('h', { name: e.target.value })} aria-label="남편 이름" />
        </div>
        <div>
          <input className="name" value={hh.wife.name} onChange={(e) => setPerson('w', { name: e.target.value })} aria-label="아내 이름" />
        </div>
      </div>

      <Section title="① 소득·기본정보">
        <PairRow label="총급여" hint="연봉에서 비과세(식대 등) 제외" {...money((p) => p.salary, (_, v) => ({ salary: v }), '총급여')} />
        <PairRow
          label="나이"
          {...both((p, set) => <IntInput value={p.age} suffix="세" onChange={(v) => set({ age: v })} />)}
        />
        <PairRow label="장애인" {...both((p, set) => <Check checked={p.disabled} onChange={(v) => set({ disabled: v })}>해당</Check>)} />
        <PairRow
          label="4대보험"
          hint="자동 추정 해제 시 직접 입력"
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
        <PairRow
          label="기납부세액"
          hint="원천징수된 소득세 (선택, 환급액 계산용)"
          {...money((p) => p.withheld, (_, v) => ({ withheld: v }), '기납부세액')}
        />
      </Section>

      <Section title="② 카드·현금영수증" hint="지금 각자 명의로 쓰는(쓸) 금액. 가족 카드 사용분 포함">
        {card('credit', '신용카드', '공제율 15%')}
        {card('debitCash', '체크카드·현금영수증', '30%')}
        {card('market', '전통시장', '40%')}
        {card('transport', '대중교통', '40%')}
        {card('culture', '도서·공연·헬스장·수영장', '30%, 총급여 7천 이하')}
        <Check checked={hh.flex.cards} onChange={(v) => onChange({ ...hh, flex: { ...hh.flex, cards: v } })}>
          부부 간에 카드 사용을 옮길 수 있음 (최적화 대상)
        </Check>
      </Section>

      <Section title="③ 의료비·교육비·보험료">
        <PairRow label="본인 의료비" hint="안경 50만·실손보험금 수령분 제외" {...money((p) => p.medical, (_, v) => ({ medical: v }), '본인 의료비')} />
        <Check checked={hh.flex.medical} onChange={(v) => onChange({ ...hh, flex: { ...hh.flex, medical: v } })}>
          배우자 의료비를 대신 결제할 수 있음 (최적화 대상)
        </Check>
        <PairRow label="본인 교육비" hint="대학원·직업훈련 등, 한도 없음" {...money((p) => p.ownEducation, (_, v) => ({ ownEducation: v }), '본인 교육비')} />
        <PairRow label="보장성보험료" hint="본인이 피보험자, 100만 한도 12%" {...money((p) => p.insurance, (_, v) => ({ insurance: v }), '보장성보험료')} />
        <PairRow label="장애인전용보험" {...money((p) => p.disabledInsurance, (_, v) => ({ disabledInsurance: v }), '장애인전용보험')} />
      </Section>

      <Section title="④ 연금저축·IRP">
        <PairRow label="연금저축" hint="600만 한도" {...money((p) => p.pensionSavings, (_, v) => ({ pensionSavings: v }), '연금저축')} />
        <PairRow label="IRP·퇴직연금" hint="연금저축 합산 900만" {...money((p) => p.irp, (_, v) => ({ irp: v }), 'IRP')} />
      </Section>

      <Section title="⑤ 주택" defaultOpen={false}>
        <div className="row-inline">
          <span>세대주</span>
          <select value={hh.housing.head} onChange={(e) => onChange({ ...hh, housing: { ...hh.housing, head: e.target.value as Spouse } })}>
            <option value="h">{hh.husband.name || '남편'}</option>
            <option value="w">{hh.wife.name || '아내'}</option>
          </select>
          <Check checked={hh.housing.headLocked} onChange={(v) => onChange({ ...hh, housing: { ...hh.housing, headLocked: v } })}>
            고정
          </Check>
        </div>
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
      </Section>

      <Section title="⑥ 기부금" defaultOpen={false}>
        {don('general', '일반·특례 기부금', '15%, 1천만 초과 30%')}
        {don('political', '정치자금', '10만까지 100/110')}
        {don('hometown', '고향사랑', '10만까지 100/110')}
        <Check checked={hh.flex.donations} onChange={(v) => onChange({ ...hh, flex: { ...hh.flex, donations: v } })}>
          기부 명의를 나눌 수 있음 (최적화 대상)
        </Check>
      </Section>

      <Section title="⑦ 부양가족" hint="자녀·부모님 등 (소득금액 100만원 이하 가정)">
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
              <button className="ghost" onClick={() => onChange({ ...hh, dependents: hh.dependents.filter((_, j) => j !== i) })} aria-label="삭제">
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
            <div className="dep-row">
              <span className="muted">현재 공제자</span>
              <select value={d.assignedTo} onChange={(e) => setDep(i, { assignedTo: e.target.value as Spouse })} aria-label="현재 공제자">
                <option value="h">{hh.husband.name || '남편'}</option>
                <option value="w">{hh.wife.name || '아내'}</option>
              </select>
              <Check checked={d.locked} onChange={(v) => setDep(i, { locked: v })}>
                고정 (옮기지 않음)
              </Check>
            </div>
          </div>
        ))}
        <button onClick={() => onChange({ ...hh, dependents: [...hh.dependents, newDependent()] })}>+ 부양가족 추가</button>
      </Section>
    </div>
  );
}
