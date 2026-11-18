import { useMemo, useState } from 'react';
import { COMP, type CompHousehold, type CompResult } from '../tax/comp';
import { shiftCurve, type CompOptimizeResult, type ShiftKind } from '../tax/compHousehold';
import { man, pct, won } from '../tax/format';
import { RULES } from '../tax/rules';
import type { Tip } from '../tax/strategy';

export type CompTab = 'tips' | 'calendar' | 'shift' | 'detail' | 'ref';

/** 화면 맨 위 요약 보드 */
export function CompBoard({ hh, opt, tips, includeShift, onMore }: { hh: CompHousehold; opt: CompOptimizeResult; tips: Tip[]; includeShift: boolean; onMore: () => void }) {
  const best = includeShift && opt.bestShift ? opt.bestShift.result : opt.bestResult;
  const saving = opt.baselineResult.total - best.total;
  const moves = tips.filter((t) => t.level === 'action' && t.kind !== 'extra' && (t.saving ?? 0) > 0).sort((a, b) => (b.saving ?? 0) - (a.saving ?? 0));
  const extras = tips.filter((t) => t.kind === 'extra').sort((a, b) => (b.saving ?? 0) - (a.saving ?? 0));
  const payable = best.people.reduce((s, r) => s + r.payable, 0);
  const anyPrepaid = best.people.some((r) => r.prepaid > 0);

  return (
    <section className="board" aria-label="추천 요약">
      <div className="board-hero">
        <div className="hero-label">{hh.single ? '예상 종합소득세(소득세+지방세)' : '부부 합산 종합소득세(소득세+지방세) 예상'}</div>
        <div className="hero-flow">
          {saving > 0 && <span className="from">{won(opt.baselineResult.total)}</span>}
          {saving > 0 && <span className="arrow">→</span>}
          <span className="to">{won(best.total)}</span>
        </div>
        <div className={saving > 0 ? 'hero-save' : 'hero-save none'}>
          {saving > 0 ? (
            <>
              입력 조정만으로 <b>{won(saving)}</b> 절세
            </>
          ) : (
            '현재 입력 기준으로 바꿀 수 있는 항목이 적어요'
          )}
        </div>
        {!includeShift && opt.shiftSavings > 0 && (
          <div className="hero-note">
            부부 간 소득 분산까지 고려하면 <b>{won(opt.shiftSavings)}</b> 더 줄일 수 있어요 (‘소득 분산’ 탭, 부수 효과 확인 필요)
          </div>
        )}
        {anyPrepaid && (
          <div className="hero-note">
            이미 낸 세금 반영 시 {payable >= 0 ? '5월 추가 납부' : '환급'} 예상 <b>{won(Math.abs(payable))}</b>
          </div>
        )}
      </div>
      <div className="board-actions">
        <h2>이렇게 하세요</h2>
        {moves.length === 0 ? (
          <p className="muted">명의·방식 변경만으로 줄일 수 있는 세금은 없습니다. 아래 추가 항목을 확인하세요.</p>
        ) : (
          <ol className="steps">
            {moves.slice(0, 4).map((t, i) => (
              <li key={i}>
                <details>
                  <summary>
                    <span className="num">{i + 1}</span>
                    <span className="t">{t.title}</span>
                    <b className="s">−{won(t.saving ?? 0)}</b>
                  </summary>
                  <p>{t.detail}</p>
                </details>
              </li>
            ))}
          </ol>
        )}
        {extras.length > 0 && (
          <div className="extras">
            {extras.slice(0, 4).map((t, i) => (
              <details key={i}>
                <summary>
                  <span className="plus">＋</span>
                  <span className="t">{t.title}</span>
                </summary>
                <p>{t.detail}</p>
              </details>
            ))}
          </div>
        )}
        <button type="button" className="link" onClick={onMore}>
          전체 전략 가이드 보기 →
        </button>
      </div>
    </section>
  );
}

const SHIFT_NOTES: Record<ShiftKind, string> = {
  rental: '임대 소득 분산은 부동산 지분(공동명의) 이전이 필요합니다. 배우자 증여는 10년간 6억원까지 공제되지만 취득세·등기비용이 들 수 있고, 양도 시 취득가액 이월과세 등 후속 세금이 달라집니다. 지분만큼만 소득이 나뉘며, 세무사 확인이 필요합니다.',
  business: '사업 소득 분산은 배우자가 실제로 사업에 참여하는 공동사업자(동업계약서·공동 사업자등록)여야 합니다. 명목상 분산은 세무조사에서 부인되고, 배우자 급여 지급도 실제 근로 증빙이 필요합니다.',
};

function ShiftTab({ hh, opt }: { hh: CompHousehold; opt: CompOptimizeResult }) {
  const options = useMemo(() => {
    const o: { key: string; from: 'h' | 'w'; kind: ShiftKind; label: string }[] = [];
    hh.people.forEach((p, i) => {
      const from = i === 0 ? ('h' as const) : ('w' as const);
      if (p.hasRental && p.rental.houseRevenue + p.rental.shopRevenue > 0) o.push({ key: `${i}-rental`, from, kind: 'rental', label: `${p.name}의 임대소득 → ${hh.people[1 - i].name}` });
      if (p.hasBusiness && p.business.revenue > 0) o.push({ key: `${i}-business`, from, kind: 'business', label: `${p.name}의 사업소득 → ${hh.people[1 - i].name}` });
    });
    return o;
  }, [hh]);
  // 옵션별 최대 절세액을 미리 계산해 효과가 가장 큰 옵션을 기본으로 보여준다
  const curves = useMemo(() => options.map((o) => shiftCurve(hh, opt.best.deps, o.from, o.kind)), [hh, opt.best.deps, options]);
  const gains = curves.map((c) => c[0].total - Math.min(...c.map((q) => q.total)));
  const bestIdx = Math.max(0, gains.indexOf(Math.max(...gains)));
  const [sel, setSel] = useState<number | null>(null);
  const idx = Math.min(sel ?? bestIdx, options.length - 1);
  const cur = options[idx];
  const pts = curves[idx] ?? [];

  if (!cur) return <p className="muted">사업·임대 소득이 있는 쪽의 수입을 입력하면 분산 효과를 계산합니다.</p>;
  const min = pts.reduce((m, p) => (p.total < m.total ? p : m), pts[0]);
  const base = pts[0];
  const W = 560;
  const H = 220;
  const pad = { l: 64, r: 12, t: 12, b: 32 };
  const ys = pts.flatMap((p) => [p.total, p.a, p.b]);
  const yMin = Math.min(...ys);
  const span = Math.max(...ys) - yMin || 1;
  const x = (s: number) => pad.l + s * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - yMin) / span) * (H - pad.t - pad.b);
  const line = (f: (p: (typeof pts)[number]) => number) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.share).toFixed(1)},${y(f(p)).toFixed(1)}`).join('');

  return (
    <div>
      <h3>소득 분산 시뮬레이션</h3>
      <p className="muted">소득을 한쪽에 몰아두면 누진세율(6%~45%)이 높아집니다. 일부를 배우자에게 나누면 부부 합산 세금이 줄 수 있습니다.</p>
      <label className="row-inline">
        <span>분산할 소득</span>
        <select value={idx} onChange={(e) => setSel(Number(e.target.value))} aria-label="분산할 소득">
          {options.map((o, i) => (
            <option key={o.key} value={i}>
              {o.label}
              {gains[i] > 0 ? ` (최대 −${won(gains[i])})` : ' (효과 없음)'}
            </option>
          ))}
        </select>
      </label>
      <div className="chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="소득 이전 비율별 세금">
          {[yMin, yMin + span / 2, yMin + span].map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
              <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="axis">
                {man(t)}
              </text>
            </g>
          ))}
          {[0, 0.25, 0.5, 0.75, 1].map((s) => (
            <text key={s} x={x(s)} y={H - 10} textAnchor="middle" className="axis">
              {Math.round(s * 100)}%
            </text>
          ))}
          <path d={line((p) => p.a)} className="line s1" />
          <path d={line((p) => p.b)} className="line s2" />
          <path d={line((p) => p.total)} className="line total" />
          <circle cx={x(min.share)} cy={y(min.total)} r={5} className="dot" />
        </svg>
        <div className="legend">
          <span className="k total">부부 합산</span>
          <span className="k s1">{hh.people[0].name}</span>
          <span className="k s2">{hh.people[1].name}</span>
          <span className="readout">가로축: 배우자에게 넘기는 비율</span>
        </div>
      </div>
      <p className={base.total - min.total > 0 ? 'callout good' : 'callout'}>
        {base.total - min.total > 0 ? (
          <>
            약 <b>{Math.round(min.share * 100)}%</b>를 배우자에게 나누면 {won(base.total)} → <b>{won(min.total)}</b> (연 <b>{won(base.total - min.total)}</b> 절세)
          </>
        ) : (
          '현재 소득 분포에서는 분산해도 세금이 줄지 않습니다.'
        )}
      </p>
      <ul className="rules">
        <li>{SHIFT_NOTES[cur.kind]}</li>
        <li>지역가입자 건강보험료, 부양가족 요건(배우자 소득 100만원 이하), 임대 분리과세 가능 여부가 분산으로 바뀔 수 있으며 이 계산에는 반영하지 않았습니다.</li>
      </ul>
    </div>
  );
}

function Detail({ hh, opt, includeShift }: { hh: CompHousehold; opt: CompOptimizeResult; includeShift: boolean }) {
  const [view, setView] = useState<'best' | 'now'>('best');
  const res = view === 'best' ? (includeShift && opt.bestShift ? opt.bestShift.result : opt.bestResult) : opt.baselineResult;
  const rows: [string, (r: CompResult) => string, string?][] = [
    ['근로소득금액', (r) => won(r.wageIncome)],
    ['사업소득금액', (r) => won(r.businessIncome)],
    ['상가 등 임대소득금액', (r) => won(r.shopIncome)],
    ['주택임대(종합과세 합산)', (r) => (r.houseMode === 'comprehensive' ? won(r.houseIncomeComp) : '-')],
    ['= 종합소득금액', (r) => won(r.totalIncome), 'sum'],
    ['인적공제', (r) => `${won(r.deductions.personal)} (${r.basicCount}명)`],
    ['연금보험료공제', (r) => won(r.deductions.pension)],
    ['건강·고용보험(근로)', (r) => won(r.deductions.social)],
    ['노란우산공제', (r) => `${won(r.deductions.yellow)}${r.yellowLimit ? ` (한도 ${man(r.yellowLimit)})` : ''}`],
    ['기타 소득공제(연말정산)', (r) => won(r.deductions.wageOther)],
    ['= 과세표준', (r) => won(r.taxBase), 'sum'],
    ['산출세액', (r) => `${won(r.computedTax)} (${pct(r.marginalRate)})`, 'sum'],
    ['근로소득세액공제', (r) => won(r.credits.earned)],
    ['자녀세액공제', (r) => won(r.credits.child)],
    ['연금계좌세액공제', (r) => won(r.credits.pension)],
    ['기장세액공제', (r) => won(r.credits.bookkeeping)],
    ['전자신고세액공제', (r) => won(r.credits.eFiling)],
    ['표준세액공제(등)', (r) => won(r.credits.standard)],
    ['= 결정세액(종합)', (r) => won(r.determinedTax), 'sum'],
    ['주택임대 분리과세(14%)', (r) => (r.houseMode === 'separate' ? won(r.houseSeparateTax) : '-')],
    ['지방소득세 (10%)', (r) => won(r.localTax)],
    ['총 부담 세액', (r) => won(r.totalTax), 'sum'],
    ['기납부세액', (r) => won(r.prepaid)],
    ['예상 납부(+) / 환급(−)', (r) => won(r.payable), 'sum'],
  ];
  return (
    <div>
      <h3>
        세금 계산 상세
        <span className="toggle">
          <button className={view === 'best' ? 'on' : ''} onClick={() => setView('best')}>최적</button>
          <button className={view === 'now' ? 'on' : ''} onClick={() => setView('now')}>현재</button>
        </span>
      </h3>
      <div className="table-scroll">
        <table className="breakdown">
          <thead>
            <tr>
              <th />
              {hh.people.map((p, i) => (
                <th key={i}>{p.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, f, cls]) => (
              <tr key={label} className={cls}>
                <td>{label}</td>
                {res.people.map((r, i) => (
                  <td key={i}>{f(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const SCHEDULE: { m: number; when: string; text: string; show: (hh: CompHousehold) => boolean }[] = [
  { m: 1, when: '1월 25일', text: '부가가치세 확정신고(7~12월분) — 과세사업자. 간이과세자는 1월 25일까지 연 1회 신고', show: (h) => h.people.some((p) => p.hasBusiness || p.hasRental) },
  { m: 2, when: '2월 10일', text: '사업장현황신고(면세사업자) · 직원이 있으면 지급명세서 제출(원천세 연말정산)', show: (h) => h.people.some((p) => p.hasBusiness) },
  { m: 5, when: '5월 1~31일', text: '종합소득세 신고·납부 (성실신고확인 대상은 6월 30일). 근로소득이 있어도 사업·임대 소득이 있으면 합산 신고. 지방소득세는 별도 신고', show: () => true },
  { m: 7, when: '7월 25일', text: '부가가치세 예정·확정신고(1~6월분) — 일반과세자. 상가 임대인도 해당', show: (h) => h.people.some((p) => p.hasBusiness || p.hasRental) },
  { m: 9, when: '9~10월', text: '올해 매출·경비 중간 정리. 경비 증빙(세금계산서·현금영수증·카드) 누락 점검, 간편장부 기장 시작', show: (h) => h.people.some((p) => p.hasBusiness) },
  { m: 11, when: '11월 30일', text: '중간예납 납부 (직전연도 종합소득세의 1/2, 고지서 기준). 소규모 사업자 등은 면제', show: (h) => h.people.some((p) => p.hasBusiness) },
  { m: 12, when: '12월 31일', text: '마감: 노란우산공제·연금저축·IRP 납입, 기부, 사업용 지출·장비 구입(올해 비용 처리) — 이후 건은 내년', show: () => true },
];

function Calendar({ hh, tips }: { hh: CompHousehold; tips: Tip[] }) {
  const now = new Date().getMonth() + 1;
  const items = SCHEDULE.filter((s) => s.show(hh));
  const upcoming = items.find((s) => s.m >= now) ?? items[0];
  const extras = tips.filter((t) => t.kind === 'extra').sort((a, b) => (b.saving ?? 0) - (a.saving ?? 0));
  return (
    <div className="roadmap">
      <h3>연간 세금 일정</h3>
      <p className="muted">해당하는 것만 챙기세요. 지금은 {now}월이고, 다음 일정은 <b>{upcoming.when}</b>입니다.</p>
      <ol className="checkpoints">
        {items.map((s) => (
          <li key={s.when} className={s === upcoming ? 'now' : ''}>
            <b>{s.when}{s === upcoming ? ' · 다음 일정' : ''}</b>
            <span>{s.text}</span>
          </li>
        ))}
      </ol>
      <h4>12월 31일 전에 하면 효과 있는 것 (효과 큰 순)</h4>
      {extras.length === 0 ? (
        <p className="muted">추가로 납입해서 줄일 수 있는 항목이 없습니다.</p>
      ) : (
        <ol className="todo">
          {extras.map((t, i) => (
            <li key={i} className="do">
              <div className="todo-head">
                <span>{t.title}</span>
              </div>
              <p>{t.detail}</p>
            </li>
          ))}
        </ol>
      )}
      <p className="muted">모든 일정은 휴일·연도에 따라 달라질 수 있으니 홈택스 공지를 확인하세요.</p>
    </div>
  );
}

function Reference() {
  const R = RULES.brackets;
  let prev = 0;
  return (
    <div className="start">
      <h3>종합소득세 기준 정보</h3>
      <h4>소득세율 (과세표준 구간)</h4>
      <div className="table-scroll">
        <table className="basic">
          <thead>
            <tr>
              <th>과세표준</th>
              <th>세율</th>
              <th>지방세 포함</th>
            </tr>
          </thead>
          <tbody>
            {R.map((b) => {
              const row = (
                <tr key={b.upTo}>
                  <td>
                    {man(prev)} ~ {b.upTo === Infinity ? '' : man(b.upTo)}
                  </td>
                  <td>{pct(b.rate)}</td>
                  <td>{pct(b.rate * 1.1)}</td>
                </tr>
              );
              prev = b.upTo;
              return row;
            })}
          </tbody>
        </table>
      </div>
      <h4>소득 유형별 핵심</h4>
      <ul className="rules">
        <li>
          <b>사업소득</b> = 매출 − 필요경비. 장부(실제 경비)와 경비율(추계) 중 선택하며, 추계는 수입 규모 등 요건이 필요합니다. 간편장부 기장 시 기장세액공제(산출세액의 20%, 한도 100만원).
        </li>
        <li>
          <b>프리랜서 3.3%</b>: 받을 때 떼는 3%는 기납부세액입니다. 5월에 경비·공제 반영 후 정산해 환급 또는 추가 납부합니다.
        </li>
        <li>
          <b>주택임대 분리과세</b>: 수입 {man(COMP.rental.revenueLimit)} 이하만 선택 가능, 세율 14%. 필요경비율 미등록 50%·등록 60%, 기본공제 미등록 200만·등록 400만원(다른 소득 {man(COMP.rental.otherIncomeLimit)} 이하 조건). 1주택은 비과세(고가주택 제외)입니다.
        </li>
        <li>
          <b>상가 임대</b>는 사업소득(부동산임대업)으로 항상 종합과세됩니다. 결손은 다른 소득과 합산하지 못합니다.
        </li>
        <li>
          <b>노란우산공제</b>: 사업소득금액 4천만 이하 600만, 4천만~1억 400만, 1억 초과 200만원까지 소득공제.
        </li>
        <li>
          <b>근로소득 + 사업·임대 소득</b>이 함께 있으면 연말정산 후에도 5월에 합산 신고해야 합니다.
        </li>
      </ul>
      <h4>일정</h4>
      <ul className="rules">
        <li>종합소득세 신고·납부: 다음 해 5월 1~31일 (성실신고확인 대상은 6월 30일), 지방소득세는 신고 후 별도 납부</li>
        <li>중간예납: 11월 (직전연도 종합소득세의 1/2, 11월 30일까지 납부)</li>
        <li>노란우산·연금저축·IRP 등은 12월 31일까지 납입한 분만 해당 연도 공제</li>
      </ul>
      <p className="muted">
        표시된 수치 중 주택임대 단순경비율, 분리과세 기본공제 조건, 기장세액공제 요건은 연도별 고시·개정에 따라 달라질 수 있어 신고 전 국세청 안내를 확인하세요.
      </p>
    </div>
  );
}

export function CompResultPanel({ hh, opt, tips, tab, onTab, includeShift }: { hh: CompHousehold; opt: CompOptimizeResult; tips: Tip[]; tab: CompTab; onTab: (t: CompTab) => void; includeShift: boolean }) {
  const tabs: { id: CompTab; label: string }[] = [
    { id: 'tips', label: '전략 가이드' },
    { id: 'calendar', label: '연간 일정' },
    ...(!hh.single && hh.people.some((p) => p.hasBusiness || p.hasRental) ? [{ id: 'shift' as const, label: '소득 분산' }] : []),
    { id: 'detail', label: '세금 계산' },
    { id: 'ref', label: '기준 정보' },
  ];
  return (
    <div className="results">
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'tab on' : 'tab'} onClick={() => onTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'tips' && (
        <div>
          <h3>전략 가이드</h3>
          <p className="muted">각 절세액은 그 항목 하나만 바꿨을 때의 값이라 합계가 전체 절세액과 다를 수 있습니다.</p>
          <ul className="tips">
            {tips.map((t, i) => (
              <li key={i} className={t.level}>
                <div className="tip-title">
                  <span>{t.title}</span>
                  {t.saving ? <b>{won(t.saving)} ↓</b> : null}
                </div>
                <p>{t.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {tab === 'calendar' && <Calendar hh={hh} tips={tips} />}
      {tab === 'shift' && <ShiftTab hh={hh} opt={opt} />}
      {tab === 'detail' && <Detail hh={hh} opt={opt} includeShift={includeShift} />}
      {tab === 'ref' && <Reference />}
    </div>
  );
}
