import { useMemo } from 'react';
import { man, pct, won } from '../tax/format';
import { isActual } from '../tax/household';
import type { OptimizeResult } from '../tax/optimizer';
import { CHECKPOINTS, actualSummary, cardRoutes, monthlyActions, monthsLeft, remainingPlan, yearEndChecklist } from '../tax/timeline';
import type { HouseholdInput, Spouse } from '../tax/types';

const LABEL: Record<string, string> = { credit: '신용카드', debitCash: '체크·현금영수증', market: '전통시장', transport: '대중교통', culture: '문화·체육' };

export function RoadmapPanel({ hh, opt, onSwitchMode }: { hh: HouseholdInput; opt: OptimizeResult; onSwitchMode: (m: 'plan' | 'actual') => void }) {
  const actual = isActual(hh);
  const nm = (s: Spouse) => (s === 'h' ? hh.husband.name || '남편' : hh.wife.name || '아내');

  return actual ? <ActualView hh={hh} opt={opt} nm={nm} onSwitchMode={onSwitchMode} /> : <PlanView hh={hh} opt={opt} nm={nm} onSwitchMode={onSwitchMode} />;
}

type ViewProps = { hh: HouseholdInput; opt: OptimizeResult; nm: (s: Spouse) => string; onSwitchMode: (m: 'plan' | 'actual') => void };

/** 계획 모드: 올해 한 해를 어떻게 굴릴지 */
function PlanView({ hh, opt, nm, onSwitchMode }: ViewProps) {
  const routes = useMemo(() => cardRoutes(hh, opt), [hh, opt]);
  const monthly = useMemo(() => monthlyActions(hh, opt), [hh, opt]);
  const r = opt.bestResult;
  const people: Spouse[] = hh.single ? ['h'] : ['h', 'w'];
  const medOf = (s: Spouse) => r[s].medical.general + r[s].medical.specific;
  const medWho: Spouse = medOf('w') > medOf('h') ? 'w' : 'h';

  return (
    <div className="roadmap">
      <h3>올해 월별 실행 플랜</h3>
      <p className="muted">입력한 올해 예상을 월별로 풀어 쓴 로드맵입니다. 연초에 세우고, 연말이 가까워지면 ‘연말 점검’으로 실제값을 넣어 고치세요.</p>

      {!hh.single && (
        <div className="who-box">
          <h4>① 누가 무엇을 맡을까 (올해 합의할 것)</h4>
          <ul>
            {hh.dependents.length > 0 && (
              <li>
                <b>인적공제</b>: {hh.dependents.map((d, i) => `${d.name || `부양가족 ${i + 1}`} → ${nm(opt.best.deps[i])}`).join(', ')}
              </li>
            )}
            <li>
              <b>카드</b>: {people.map((s) => `${nm(s)} 연 ${man(r[s].card.total)}`).join(' · ')} (월 평균 {people.map((s) => `${nm(s)} ${man(r[s].card.total / 12)}`).join(' / ')})
            </li>
            {people.some((s) => medOf(s) > 0) && (
              <li>
                <b>의료비 영수증</b>은 {nm(medWho)} 앞으로 모으기 (문턱 {man(r[medWho].medical.threshold)})
              </li>
            )}
            {(hh.housing.rent > 0 || hh.housing.leaseLoanRepay > 0) && (
              <li>
                <b>주택 관련 공제</b>(월세·전세대출·청약): {nm(opt.best.head)} 명의
              </li>
            )}
          </ul>
        </div>
      )}

      <h4>{hh.single ? '①' : '②'} 카드는 이 순서로 (월 평균 지출 기준)</h4>
      <div className="route-grid">
        {routes.length === 0 && <p className="muted">총급여와 카드 사용 계획을 입력하면 로드맵이 만들어집니다.</p>}
        {routes.map((rt) => (
          <div key={rt.who} className="route">
            <div className="route-head">
              <b>{rt.name}</b>
              <span>
                연 {man(rt.total)} · 월 {man(rt.monthly)}
              </span>
            </div>
            <ol>
              {rt.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            {rt.thrMonth !== null && (
              <div className="timeline" aria-hidden>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <span key={m} className={m <= rt.thrMonth! ? 'm credit' : rt.limitMonth !== null && m <= rt.limitMonth ? 'm debit' : rt.limitMonth !== null ? 'm done' : 'm debit'}>
                    {m}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="legend-line">
        <span className="chip-c credit">신용(문턱 구간)</span>
        <span className="chip-c debit">체크·현금·시장</span>
        <span className="chip-c done">한도 도달 → 신용 혜택</span>
      </p>

      <h4>{hh.single ? '②' : '③'} 매달 자동으로 해 둘 것</h4>
      {monthly.length === 0 ? (
        <p className="muted">추가로 자동이체할 항목이 없습니다.</p>
      ) : (
        <div className="table-scroll">
          <table className="basic">
            <thead>
              <tr>
                <th>항목</th>
                <th>월 금액</th>
                <th>연 절세</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((a, i) => (
                <tr key={i}>
                  <td>
                    {hh.single ? '' : `${a.name} · `}
                    {a.title}
                    <small>{a.note}</small>
                  </td>
                  <td>{man(a.monthly)}</td>
                  <td>{won(a.gain)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h4>{hh.single ? '③' : '④'} 한 해 체크포인트</h4>
      <ol className="checkpoints">
        {CHECKPOINTS.map((c) => (
          <li key={c.when}>
            <b>{c.when}</b>
            <span>{c.text}</span>
          </li>
        ))}
      </ol>
      <div className="cta-box">
        <span>이미 연말이 가까웠다면 실제로 쓴 금액을 넣어 점검해 보세요.</span>
        <button type="button" className="primary" onClick={() => onSwitchMode('actual')}>
          연말 점검으로 전환
        </button>
      </div>
    </div>
  );
}

/** 연말 점검 모드: 이미 쓴 건 고정, 남은 기간에 할 일 */
function ActualView({ hh, opt, nm, onSwitchMode }: ViewProps) {
  const sum = useMemo(() => actualSummary(hh, opt), [hh, opt]);
  const rows = useMemo(() => remainingPlan(hh, opt), [hh, opt]);
  const items = useMemo(() => yearEndChecklist(hh, opt), [hh, opt]);
  const left = monthsLeft(hh);
  const month = hh.time?.month ?? 12;
  const r = opt.bestResult;
  const people: Spouse[] = hh.single ? ['h'] : ['h', 'w'];
  const moved = sum.pace - sum.best;
  const kinds = Object.keys(LABEL).filter((k) => rows.some((row) => (row.amounts as Record<string, number>)[k] > 0));

  return (
    <div className="roadmap">
      <h3>
        연말 점검 <small className="muted">{month}월 말까지 실제 · 남은 {left}개월</small>
      </h3>
      <div className="sum3">
        <div>
          <span className="muted">지금부터 더 안 쓰면</span>
          <b>{won(sum.stopNow)}</b>
        </div>
        <div>
          <span className="muted">남은 지출을 지금 비율대로 쓰면</span>
          <b>{won(sum.pace)}</b>
        </div>
        <div className="best">
          <span>남은 지출을 이렇게 배분하면</span>
          <b>{won(sum.best)}</b>
          {!hh.single && <small>{moved > 0 ? `${won(moved)} 절세` : '이미 최적'}</small>}
        </div>
      </div>

      {!hh.single && (
        <>
          <h4>① 남은 기간 카드, 누구 카드로 얼마나</h4>
          {rows.reduce((s, row) => s + row.total, 0) <= 0 ? (
            <p className="muted">‘남은 기간 예상 지출’을 입력하면 배분 계획이 나옵니다. (입력창의 ‘지금 속도로 채우기’)</p>
          ) : (
            <div className="table-scroll">
              <table className="basic">
                <thead>
                  <tr>
                    <th>결제수단</th>
                    {rows.map((row) => (
                      <th key={row.who}>{row.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {kinds.map((k) => (
                    <tr key={k}>
                      <td>{LABEL[k]}</td>
                      {rows.map((row) => (
                        <td key={row.who}>{man((row.amounts as Record<string, number>)[k])}</td>
                      ))}
                    </tr>
                  ))}
                  <tr className="key">
                    <td>합계 (월 환산)</td>
                    {rows.map((row) => (
                      <td key={row.who}>
                        {man(row.total)} <small>월 {man(row.perMonth)}</small>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <h4>{hh.single ? '①' : '②'} 이 계획대로 쓰면 연말에는</h4>
      <div className="route-grid">
        {people.map((s) => {
          const c = r[s].card;
          const fixed = Object.values(s === 'h' ? hh.husband.cards : hh.wife.cards).reduce((a, b) => a + b, 0);
          return (
            <div key={s} className="route">
              <div className="route-head">
                <b>{nm(s)}</b>
                <span>
                  실제 {man(fixed)} + 남은 계획 {man(c.total - fixed)} = {man(c.total)}
                </span>
              </div>
              <p className="muted" style={{ margin: 0 }}>
                {c.total < c.minSpend
                  ? `문턱 ${man(c.minSpend)}에 ${man(c.minSpend - c.total)} 모자라 카드 공제 0원입니다. 이 사람 카드로는 공제를 노리지 말고 배우자 카드로 몰아주세요.`
                  : c.baseDeduction >= c.baseLimit
                    ? `기본한도 ${man(c.baseLimit)}을 채웠습니다. 더 써도 일반 결제는 공제가 늘지 않으니 전통시장·대중교통(추가한도 ${man(c.extraLimit)}) 외에는 혜택 위주로 쓰세요.`
                    : `공제 ${man(c.deduction)} / 한도 ${man(c.baseLimit)}. 체크·현금영수증으로 ${man((c.baseLimit - c.baseDeduction) / 0.3)} 더 쓰면 한도를 채웁니다.`}
              </p>
            </div>
          );
        })}
      </div>

      <h4>{hh.single ? '②' : '③'} 12월 31일 전에 할 일 (효과 큰 순)</h4>
      <ol className="todo">
        {items.map((it, i) => (
          <li key={i} className={it.tone}>
            <div className="todo-head">
              <span>{it.title}</span>
              {it.gain ? <b>−{won(it.gain)}</b> : null}
            </div>
            <p>{it.detail}</p>
          </li>
        ))}
      </ol>
      <div className="cta-box">
        <span>연초라서 아직 실제값이 없다면 예상값으로 전략부터 세워 보세요.</span>
        <button type="button" onClick={() => onSwitchMode('plan')}>
          계획 모드로 전환
        </button>
      </div>
      <p className="muted">절세 비율 참고: 한계세율 {pct(r.h.marginalRate * 1.1)}{hh.single ? '' : ` / ${pct(r.w.marginalRate * 1.1)}`} (지방세 포함)</p>
    </div>
  );
}
