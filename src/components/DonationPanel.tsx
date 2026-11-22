import { useMemo, useState } from 'react';
import { computePersonTax, type DonationKey } from '../tax/engine';
import { man, pct, won } from '../tax/format';
import { buildPersonInputs } from '../tax/household';
import type { OptimizeResult } from '../tax/optimizer';
import { RULES } from '../tax/rules';
import type { DonationInput, HouseholdInput, Spouse } from '../tax/types';
import { MoneyInput } from './inputs';

const KEY_TO_FIELD: Record<DonationKey, keyof DonationInput> = {
  statutory: 'statutory',
  designated: 'general',
  religious: 'religious',
  political: 'political',
  hometown: 'hometown',
};
const KIND_LABEL: Record<DonationKey, string> = {
  statutory: '법정기부금 (국가·지자체·국방헌금·이재민)',
  designated: '지정기부금 (종교 외: 복지·학교·장학 등)',
  religious: '종교단체 (헌금·십일조·시주)',
  political: '정치자금',
  hometown: '고향사랑',
};
const STEPS = [10, 50, 100, 300, 500, 1000, 2000].map((v) => v * 10_000);

const REF: { kind: string; limit: string; rate: string; carry: string }[] = [
  { kind: '법정기부금', limit: '근로소득금액의 100%', rate: '인정액 합계 1천만원 이하 15%, 초과분 30%', carry: '10년 이월' },
  { kind: '지정기부금 (종교 외)', limit: '소득금액의 30%', rate: '〃 (법정·지정·종교 합산)', carry: '10년 이월' },
  { kind: '종교단체 (헌금)', limit: '소득금액의 10% (지정기부금 전체 한도는 30% 안에서)', rate: '〃 (법정·지정·종교 합산)', carry: '10년 이월' },
  { kind: '정치자금', limit: '소득금액의 100%', rate: '10만원 이하 100/110, 10만~3천만원 15%, 3천만원 초과 25%', carry: '이월 없음' },
  { kind: '고향사랑', limit: '연 2,000만원', rate: '10만원 이하 100/110, 10~20만원 40%, 20만원 초과 15% (지방세 포함 44%·16.5%)', carry: '이월 없음' },
];

export function DonationPanel({ hh, opt }: { hh: HouseholdInput; opt: OptimizeResult }) {
  const people: Spouse[] = hh.single ? ['h'] : ['h', 'w'];
  const nm = (s: Spouse) => (s === 'h' ? hh.husband.name || '남편' : hh.wife.name || '아내');
  const [view, setView] = useState<'best' | 'input'>('best');
  const res = view === 'best' ? opt.bestResult : opt.baselineResult;
  const alloc = view === 'best' ? opt.best : opt.baseline;
  const inputs = useMemo(() => buildPersonInputs(hh, alloc), [hh, alloc]);

  const [who, setWho] = useState<Spouse>('h');
  const [kind, setKind] = useState<DonationKey>('designated');
  const [amount, setAmount] = useState(100 * 10_000);
  const w = people.includes(who) ? who : 'h';

  /** 선택한 종류를 x원 더 기부했을 때 늘어나는 환급(소득세+지방세) */
  const gainFor = (x: number) => {
    const p = inputs[w];
    const field = KEY_TO_FIELD[kind];
    const base = computePersonTax(p);
    const more = computePersonTax({ ...p, donations: { ...p.donations, [field]: p.donations[field] + x } });
    return base.totalTax - more.totalTax;
  };
  const gain = gainFor(amount);
  const steps = useMemo(() => STEPS.map((x) => ({ x, g: gainFor(x) })), [hh, alloc, w, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const anyPaid = people.some((s) => res[s].donation.paid > 0);

  return (
    <div className="donation">
      <h3>
        기부금·헌금 세액공제
        <span className="toggle">
          <button className={view === 'best' ? 'on' : ''} onClick={() => setView('best')}>추천 배분</button>
          <button className={view === 'input' ? 'on' : ''} onClick={() => setView('input')}>입력 그대로</button>
        </span>
      </h3>
      <p className="muted">
        한도는 <b>근로소득금액</b> 기준이고, 법정 → 종교 외 지정 → 종교단체 순으로 적용합니다. 공제는 소득세 기준이며 지방소득세 10%가 따로 줄어 실제 환급은 1.1배입니다.
      </p>

      {!anyPaid && <p className="callout">왼쪽 ‘더 입력하기: 주택·기부금’에서 법정·지정·종교(헌금)·정치자금·고향사랑 기부금을 입력하면 한도와 세액공제가 여기에 나옵니다.</p>}

      {people.map((s) => {
        const r = res[s];
        const d = r.donation;
        const shown = d.lines.filter((l) => l.paid > 0);
        if (d.paid <= 0) return null;
        const withLocal = d.total * (1 + RULES.localTaxRate);
        return (
          <div key={s} className="don-person">
            <h4>
              {nm(s)} <small className="muted">근로소득금액 {man(d.incomeBase)}</small>
            </h4>
            <div className="table-scroll">
              <table className="basic don-table">
                <thead>
                  <tr>
                    <th>구분</th>
                    <th>낸 금액</th>
                    <th>올해 한도</th>
                    <th>인정액</th>
                    <th>세액공제</th>
                    <th>공제 비율</th>
                    <th>이월</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((l) => (
                    <tr key={l.key}>
                      <td>{l.label}</td>
                      <td>{man(l.paid)}</td>
                      <td>{man(l.limit)}</td>
                      <td>{man(l.allowed)}</td>
                      <td>{won(l.credit)}</td>
                      <td>{l.paid > 0 ? pct(l.credit / l.paid) : '-'}</td>
                      <td>{l.carryover > 0 ? man(l.carryover) : '-'}</td>
                    </tr>
                  ))}
                  <tr className="key">
                    <td>합계</td>
                    <td>{man(d.paid)}</td>
                    <td />
                    <td />
                    <td>{won(d.total)}</td>
                    <td>{pct(d.effectiveRate)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
            <ul className="rules">
              {d.mainAllowed > 0 && (
                <li>
                  법정·지정·종교 인정액 <b>{man(d.mainAllowed)}</b> 중 15% 구간 {man(d.lowPart)}
                  {d.highPart > 0 ? <>, <b>30% 구간 {man(d.highPart)}</b> (1천만원 초과분)</> : ' (1천만원 이하라 전부 15%)'} → 세액공제 {won(d.creditMain)}
                </li>
              )}
              {r.usedStandard && d.creditMain > 0 && (
                <li className="warnline">
                  이 사람은 <b>표준세액공제({won(RULES.standardCredit)})</b>가 더 유리해 법정·지정·종교 기부금 공제가 세액에 반영되지 않았습니다. 정치자금·고향사랑 공제만 적용됩니다.
                </li>
              )}
              {shown.some((l) => l.carryover > 0) && (
                <li>
                  한도를 넘은 기부금은 <b>{RULES.donation.carryYears}년간 이월</b>해 다음 해에 공제받을 수 있으니 영수증을 보관하세요 (정치자금·고향사랑은 이월 불가).
                </li>
              )}
              <li>
                지방소득세까지 합친 환급은 약 <b>{won(withLocal)}</b>이라, 낸 돈 {man(d.paid)} 기준 <b>{pct(withLocal / d.paid)}</b>를 돌려받고 실제 부담은 {man(Math.max(0, d.paid - withLocal))}입니다.
              </li>
            </ul>
          </div>
        );
      })}

      <h4>기부를 더 하면 얼마나 돌려받을까</h4>
      <div className="don-sim">
        {!hh.single && (
          <label>
            누가
            <select value={w} onChange={(e) => setWho(e.target.value as Spouse)} aria-label="기부자">
              {people.map((s) => (
                <option key={s} value={s}>
                  {nm(s)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          종류
          <select value={kind} onChange={(e) => setKind(e.target.value as DonationKey)} aria-label="기부 종류">
            {(Object.keys(KIND_LABEL) as DonationKey[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          추가 금액
          <MoneyInput ariaLabel="추가 기부 금액" value={amount} onChange={setAmount} />
        </label>
      </div>
      <p className={gain > 0 ? 'callout good' : 'callout'}>
        {amount > 0 ? (
          gain > 0 ? (
            <>
              {man(amount)}을 더 기부하면 소득세+지방세 <b>{won(gain)}</b> 환급 → 낸 돈의 <b>{pct(gain / amount)}</b>
            </>
          ) : (
            '이 금액은 한도 초과이거나 표준세액공제가 더 유리해 추가 환급이 없습니다.'
          )
        ) : (
          '추가 금액을 입력하세요.'
        )}
      </p>
      <div className="table-scroll">
        <table className="basic">
          <thead>
            <tr>
              <th>추가 기부액</th>
              {steps.map((s) => (
                <th key={s.x}>{man(s.x)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>환급(지방세 포함)</td>
              {steps.map((s) => (
                <td key={s.x}>{won(s.g)}</td>
              ))}
            </tr>
            <tr className="key">
              <td>환급 비율</td>
              {steps.map((s) => (
                <td key={s.x}>{pct(s.g / s.x)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="muted">선택한 사람·종류에 현재 입력(또는 추천 배분)한 기부금 위에 더 얹었을 때의 값입니다. 한도에 닿으면 비율이 낮아집니다.</p>

      <h4>기부금 종류별 한도·공제율</h4>
      <div className="table-scroll">
        <table className="basic ref-table">
          <thead>
            <tr>
              <th>구분</th>
              <th>한도</th>
              <th>공제율 (소득세)</th>
              <th>한도 초과</th>
            </tr>
          </thead>
          <tbody>
            {REF.map((r) => (
              <tr key={r.kind}>
                <td>{r.kind}</td>
                <td>{r.limit}</td>
                <td>{r.rate}</td>
                <td>{r.carry}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="rules">
        <li>종교단체 기부금: 지정기부금 전체 한도 = (소득금액 − 법정) × 10% + min(소득금액 × 20%, 종교 외 지정기부금). 그래서 종교 몫은 최대 소득금액의 10%이고, 종교 외 지정기부금을 많이 하면 줄어듭니다.</li>
        <li>종교단체 기부금이 1천만원 15%/30% 구간에 법정·지정과 합산되는지는 출처별 설명이 달라 합산하는 방식으로 계산했습니다. 신고 전 홈택스 안내를 확인하세요.</li>
        <li>우리사주조합 기부금, 전년도 이월분 입력, 특별재난지역 고향사랑 우대, 2027년 고향사랑 지역 차등안(개편안)은 반영하지 않았습니다. 3년 이상 연속 기부 우대율은 확인되지 않아 적용하지 않았습니다.</li>
        <li>기부금 영수증은 <b>기부한 사람 명의</b>로 발급되며, 정치자금·고향사랑은 본인만 공제됩니다. 연말 점검에서는 이미 한 기부의 명의를 옮길 수 없습니다.</li>
      </ul>
    </div>
  );
}
