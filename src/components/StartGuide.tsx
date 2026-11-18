import { useMemo } from 'react';
import { buildBlueprint, type PersonGuide } from '../tax/blueprint';
import { man, man0, pct, won } from '../tax/format';
import type { HouseholdInput, Spouse } from '../tax/types';

const SPOUSES: Spouse[] = ['h', 'w'];
const pr = (v: number) => pct(v);

export function StartGuide({ hh }: { hh: HouseholdInput }) {
  // 지출 입력과 무관하게 소득·가족만 바뀔 때 다시 계산
  const key = JSON.stringify([
    hh.husband.salary, hh.wife.salary, hh.husband.age, hh.wife.age, hh.husband.disabled, hh.wife.disabled,
    hh.husband.name, hh.wife.name, hh.husband.marriage, hh.wife.marriage, hh.housing.head, hh.housing.headLocked,
    hh.dependents.map((d) => [d.name, d.relation, d.age, d.disabled, d.assignedTo, d.locked]),
  ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bp = useMemo(() => buildBlueprint(hh), [key]);

  if (bp.empty) {
    return (
      <div className="guide-empty">
        <h3>시작 가이드</h3>
        <p>왼쪽에서 <b>부부 각자의 총급여</b>와 <b>가족(자녀·부모님)</b>만 입력하면, 지출을 입력하기 전에도 올해 목표 금액과 전략이 여기에 나타납니다.</p>
      </div>
    );
  }

  const P = bp.persons;
  const [a, b] = [P.h, P.w];
  const nm = (s: Spouse) => P[s].name;
  const cols = (f: (p: PersonGuide) => React.ReactNode) => SPOUSES.map((s) => <td key={s}>{f(P[s])}</td>);

  return (
    <div className="start">
      <h3>우리 집 기준선 <small className="muted">소득·가족만으로 계산</small></h3>
      <div className="table-scroll">
        <table className="basic">
          <thead>
            <tr>
              <th />
              <th>{a.name}</th>
              <th>{b.name}</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>총급여</td>{cols((p) => man(p.salary))}</tr>
            <tr><td>한계세율 (지방세 포함)</td>{cols((p) => pr(p.marginal))}</tr>
            <tr className="key"><td>카드 공제 <b>문턱</b> (총급여 25%)</td>{cols((p) => man(p.thr))}</tr>
            <tr><td>기본한도 <small>(자녀 {a.kids}·{b.kids}명 반영)</small></td>{cols((p) => man(p.baseLimit))}</tr>
            <tr><td>추가한도 (전통시장·대중교통{a.cultureOk || b.cultureOk ? '·문화' : ''})</td>{cols((p) => man(p.extraLimit))}</tr>
            <tr className="key"><td>한도 채우는 총지출 (체크·현금 기준)</td>{cols((p) => `약 ${man0(p.fullDebit)}`)}</tr>
            <tr><td>한도 채우는 총지출 (신용카드만)</td>{cols((p) => `약 ${man0(p.fullCredit)}`)}</tr>
            <tr><td>한도를 채우면 최대 절세</td>{cols((p) => `${won(p.maxSaveBase)} (+추가 ${won(p.maxSaveExtra)})`)}</tr>
          </tbody>
        </table>
      </div>

      <h3>어떤 카드·결제수단이 유리한가</h3>
      <p className="muted">문턱을 넘은 뒤 <b>쓴 돈 1원당 실제로 돌려받는 비율</b>입니다 (공제율 × 한계세율).</p>
      <div className="table-scroll">
        <table className="basic">
          <thead>
            <tr>
              <th>결제수단 (공제율)</th>
              <th>{a.name}</th>
              <th>{b.name}</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>신용카드 (15%)</td>{cols((p) => pr(p.refund.credit))}</tr>
            <tr className="key"><td>체크카드·현금영수증 (30%)</td>{cols((p) => pr(p.refund.debit))}</tr>
            <tr className="key"><td>전통시장·대중교통 (40%)</td>{cols((p) => pr(p.refund.special))}</tr>
          </tbody>
        </table>
      </div>
      <ul className="rules">
        <li>
          <b>문턱 아래는 공제가 0원</b>이고 최저사용금액은 신용카드 사용분부터 차감됩니다. 이 구간은 공제와 무관하니 <b>적립·할인 혜택이 가장 큰 신용카드</b>를 쓰세요.
        </li>
        <li>
          문턱을 넘으면 체크·현금이 신용보다 {pr(0.15 * a.marginal)}p({a.name}) / {pr(0.15 * b.marginal)}p({b.name}) 더 돌려줍니다. <b>신용카드 혜택률이 이만큼 더 높지 않다면 체크카드·현금영수증이 유리</b>합니다. 보통 신용카드 혜택은 1~2%대입니다.
        </li>
        <li>
          <b>전통시장·대중교통</b>은 항상 최우선(40%)입니다. 기본한도를 채운 뒤에도 추가한도({man(a.extraLimit)} / {man(b.extraLimit)})까지 공제되며, 이를 채우려면 이 두 항목에 약 {man0(a.extraFill)} / {man0(b.extraFill)}를 써야 합니다. 대중교통 40% 우대는 2026년 세제개편안에서 폐지가 거론되니 확정 여부를 확인하세요.
        </li>
        <li>
          <b>한도를 다 채운 뒤</b>의 일반 소비는 더 써도 공제가 늘지 않으므로, 다시 혜택이 큰 신용카드로 쓰면 됩니다.
        </li>
        <li>가족 카드·배우자 카드: 소득 있는 배우자의 카드 사용분은 서로 공제받을 수 없으니, 몰아줄 사람 <b>본인 명의 카드로 직접 결제</b>하세요.</li>
      </ul>

      <h3>카드 지출, 누구에게 얼마나 몰까</h3>
      {bp.breakevenText ? (
        <div className="breakeven">
          <p className="headline">{bp.breakevenText.headline}</p>
          <ul>
            {bp.breakevenText.lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="muted">부부 모두 총급여를 입력하면 몰아주는 기준 금액을 보여드립니다.</p>
      )}
      <div className="steps-card">
        {SPOUSES.map((s) => {
          const p = P[s];
          return (
            <ol key={s}>
              <li className="steps-title">{p.name}가 쓴다면 이 순서로</li>
              <li><b>① 신용카드 {man(p.thr)}까지</b> — 공제 문턱 구간 (혜택 위주)</li>
              <li><b>② 체크·현금영수증 {man0(p.baseLimit / 0.3)}</b> — 기본한도 {man(p.baseLimit)} 채우기 ({won(p.maxSaveBase)} 절세)</li>
              <li><b>③ 전통시장·대중교통 {man0(p.extraFill)}</b> — 추가한도 {man(p.extraLimit)} 채우기 ({won(p.maxSaveExtra)} 절세)</li>
              <li>④ 그 이후는 신용카드 혜택 위주로</li>
            </ol>
          );
        })}
      </div>

      <h3>카드 외 항목: 목표와 문턱</h3>
      <div className="table-scroll">
        <table className="basic checklist">
          <thead>
            <tr>
              <th>항목</th>
              <th>{a.name}</th>
              <th>{b.name}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>의료비 문턱 (총급여 3%)<small>이 금액을 넘긴 부분만 15% 공제. 가족 의료비는 한 사람에게 영수증을 모으세요</small></td>
              {cols((p) => man(p.medicalThr))}
            </tr>
            <tr>
              <td>연금저축+IRP 연 900만원 납입<small>12/31까지 납입분 · 연금저축은 600만 한도</small></td>
              {cols((p) => `${won(p.pension.gain)} 절세 (공제율 ${pr(p.pension.rate)})`)}
            </tr>
            <tr>
              <td>보장성보험 연 100만원<small>12% 세액공제</small></td>
              {cols((p) => `${won(p.insuranceCredit)}`)}
            </tr>
            <tr>
              <td>정치자금·고향사랑 기부 각 10만원<small>10만원까지 100/110 환급 → 부부가 각각 하면 2배</small></td>
              {cols(() => '각 9.1만원 환급')}
            </tr>
            <tr>
              <td>주택청약 연 300만원<small>무주택 세대주·총급여 7천 이하, 40% 소득공제</small></td>
              {cols((p) => (p.subscription.eligible ? `${won(p.subscription.saving)} 절세` : '대상 아님'))}
            </tr>
            <tr>
              <td>월세 연 1,000만원<small>무주택 세대주·총급여 8천 이하, 15~17% 세액공제</small></td>
              {cols((p) => (p.rent.eligible ? `최대 ${won(p.rent.max)}` : '대상 아님'))}
            </tr>
          </tbody>
        </table>
      </div>
      <ul className="rules">
        <li>
          <b>표준세액공제(13만원)</b>와 비교됩니다. 보장성보험·의료비·교육비·기부금 공제를 합쳐도 13만원이 안 되면 항목별 공제는 의미가 없고 표준공제가 자동 적용됩니다.
        </li>
        <li>
          자녀 교육비는 1인당 초·중·고 연 300만원, 대학 900만원 한도에 15% 공제입니다 (학원비는 취학 전 아동만). 공제받는 부모 명의로 결제하세요.
        </li>
        {bp.deps.length > 0 && (
          <li>
            <b>부양가족 배정 추천</b>: {bp.deps.map((d) => `${d.name} → ${nm(d.to)}${d.to !== d.from ? ' (현재와 다름)' : ''}`).join(', ')}.
            인적공제는 한계세율이 높은 쪽이 유리하고, 자녀를 올린 사람의 카드 한도가 늘어납니다.
          </li>
        )}
        {(hh.housing.rent > 0 || hh.housing.leaseLoanRepay > 0 || hh.husband.housingSubscription + hh.wife.housingSubscription > 0) && (
          <li>주택 관련 공제는 <b>{nm(bp.head)}</b>이(가) 세대주일 때 유리합니다.</li>
        )}
      </ul>
    </div>
  );
}
