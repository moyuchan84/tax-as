import { useMemo } from 'react';
import { man, pct, won } from '../tax/format';

const n = (v: number) => Math.round(v / 10_000).toLocaleString('ko-KR');
import type { OptimizeResult } from '../tax/optimizer';
import { STYLES, STYLE_LABEL, cardPlan, milestones, type Milestone, type PlanCell } from '../tax/plan';
import type { HouseholdInput } from '../tax/types';
import { CardChart } from './CardChart';

function Bar({ m }: { m: Milestone }) {
  const pos = (v: number) => `${Math.min(100, Math.max(0, (v / m.max) * 100))}%`;
  return (
    <div className={`ms ${m.tone}`}>
      <div className="ms-head">
        <span>{m.title}</span>
        <b>{man(m.current)}</b>
      </div>
      <div className="bar" role="img" aria-label={`${m.title} ${man(m.current)}`}>
        <div className="fill" style={{ width: pos(m.current) }} />
        {m.marks.map((k) => (
          <i key={k.label} className="tick" style={{ left: pos(k.at) }} />
        ))}
      </div>
      <div className="ms-marks">
        {m.marks.map((k) => (
          <span key={k.label}>
            {k.label} <b>{man(k.at)}</b>
          </span>
        ))}
      </div>
      <p>{m.note}</p>
    </div>
  );
}

function Cell({ c, nH, nW }: { c: PlanCell; nH: string; nW: string }) {
  return (
    <td>
      <div className="split">
        <span className="h">
          {nH} {n(c.hAmount)}
        </span>
        <span className="w">
          {nW} {n(c.wAmount)}
        </span>
      </div>
      <div className="mini-bar" aria-hidden>
        <span style={{ width: `${(c.hAmount / Math.max(1, c.hAmount + c.wAmount)) * 100}%` }} />
      </div>
      <small className="muted">
        {nH} 몫: 신용 {Math.round(c.creditShareH * 100)}% · 그 외 {Math.round(c.otherShareH * 100)}%
      </small>
      {c.saving > 0 && <small className="good">반반보다 −{won(c.saving)}</small>}
    </td>
  );
}

export function PlanPanel({ hh, opt }: { hh: HouseholdInput; opt: OptimizeResult }) {
  const nH = hh.husband.name || '남편';
  const nW = hh.wife.name || '아내';
  const rows = useMemo(() => cardPlan(hh, opt.best), [hh, opt.best]);
  const ms = useMemo(() => milestones(hh, opt.best, opt.bestResult), [hh, opt.best, opt.bestResult]);
  const r = opt.bestResult;

  return (
    <div className="plan">
      <h3>지금 어디까지 왔나</h3>
      <p className="muted">최적 배분 기준으로, 각자의 지출이 공제 문턱·한도의 어디쯤인지 보여줍니다.</p>
      <div className="two">
        {(['h', 'w'] as const).map((who) => (
          <div key={who} className="person">
            <h4>{who === 'h' ? nH : nW}</h4>
            {ms[who].length === 0 && <p className="muted">총급여를 입력하세요.</p>}
            {ms[who].map((m) => (
              <Bar key={m.key} m={m} />
            ))}
          </div>
        ))}
      </div>

      <h3>카드 지출 규모별 플랜</h3>
      <p className="muted">
        부부가 한 해 카드·현금영수증을 합쳐 <b>얼마를 쓰는가</b>, 그리고 <b>어떤 결제수단 위주인가</b>에 따라 누구 명의로 얼마씩 쓰는 게 가장 유리한지입니다. 다른 항목은 최적 배분
        상태로 고정했습니다.
      </p>
      <div className="table-scroll">
        <table className="planTable">
          <thead>
            <tr>
              <th>연 총지출 (단위: 만원)</th>
              {STYLES.map((s) => (
                <th key={s}>{STYLE_LABEL[s]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.total} className={row.isCurrent ? 'current' : ''}>
                <td>
                  <b>{n(row.total)}</b>
                  {row.isCurrent && <small className="badge">내 입력</small>}
                </td>
                {STYLES.map((s) => (
                  <Cell key={s} c={row.cells[s]} nH={nH} nW={nW} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="rules">
        <li>
          <b>공제 문턱</b>은 총급여의 25%입니다 ({nH} {man(r.h.card.minSpend)}, {nW} {man(r.w.card.minSpend)}). 문턱까지는 공제가 0원이고, 최저사용금액은{' '}
          <b>신용카드 사용분부터</b> 차감됩니다 → 문턱 구간은 혜택 좋은 신용카드로 쓰세요.
        </li>
        <li>
          문턱을 넘은 뒤에는 공제율이 <b>신용 15% &lt; 체크·현금 30% &lt; 전통시장·대중교통 40%</b>입니다. 기본한도({nH} {man(r.h.card.baseLimit)}, {nW}{' '}
          {man(r.w.card.baseLimit)})를 채우려면 문턱 위로 체크·현금 기준 {man(r.h.card.baseLimit / 0.3)} / {man(r.w.card.baseLimit / 0.3)} 정도가 필요합니다.
        </li>
        <li>
          한도를 넘기면 더 써도 공제가 늘지 않으므로, 한 사람이 한도를 채우면 <b>나머지 지출은 배우자 명의</b>로 돌리세요. 한계세율이 높은 쪽(현재 {nH} {pct(r.h.marginalRate)}, {nW}{' '}
          {pct(r.w.marginalRate)})의 소득공제가 더 큰 효과를 냅니다.
        </li>
      </ul>

      <h3>카드 배분 비중별 세금</h3>
      <p className="muted">
        내 카드 사용액 전체 중 {nH} 몫의 비중을 바꿀 때 부부 합산 세금입니다. 계단이 있는 곡선이라면 한 사람에게 몰아줄 때 효과가 급격히 변하는 구간입니다.
      </p>
      <CardChart hh={hh} best={opt.best} nH={nH} nW={nW} />
    </div>
  );
}
