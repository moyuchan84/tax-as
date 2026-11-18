import { useState } from 'react';
import { NO_INCOME, defaultProfile, describeProfile, modeOf, profileValid, type IncomeKinds, type Profile } from '../tax/profile';

const KINDS: { key: keyof IncomeKinds; label: string; hint: string }[] = [
  { key: 'wage', label: '직장인 (근로소득)', hint: '월급을 받는 회사원·공무원' },
  { key: 'business', label: '사업자·프리랜서 (사업소득)', hint: '개인사업자, 3.3% 떼고 받는 프리랜서' },
  { key: 'rental', label: '임대소득', hint: '주택 월세, 상가·사무실 임대' },
];

function PersonCard({ title, value, onChange, optional }: { title: string; value: IncomeKinds; onChange: (k: IncomeKinds) => void; optional?: boolean }) {
  return (
    <fieldset className="sp-person">
      <legend>{title}</legend>
      {KINDS.map((k) => (
        <label key={k.key} className={value[k.key] ? 'sp-opt on' : 'sp-opt'}>
          <input type="checkbox" checked={value[k.key]} onChange={(e) => onChange({ ...value, [k.key]: e.target.checked })} />
          <span>
            <b>{k.label}</b>
            <small>{k.hint}</small>
          </span>
        </label>
      ))}
      {optional && <p className="muted sp-note">아무것도 선택하지 않으면 소득 없는 배우자(전업)로 계산하고, 배우자 기본공제를 자동 반영합니다.</p>}
    </fieldset>
  );
}

export function StartPage({ initial, resumable, onStart, onSample }: { initial: Profile | null; resumable: boolean; onStart: (p: Profile) => void; onSample: (kind: 'wage' | 'comp') => void }) {
  const [p, setP] = useState<Profile>(initial ?? defaultProfile());
  const mode = modeOf(p);
  const valid = profileValid(p);

  return (
    <div className="start-page">
      <header className="sp-head">
        <h1>세금 시뮬레이터</h1>
        <p>
          우리 집 상황을 먼저 알려주세요. 직장인은 <b>연말정산</b>, 사업자·임대인은 <b>종합소득세</b> 계산기로 연결하고, 부부라면 누구에게 몰아야 세금이 줄어드는지 알려드려요.
        </p>
      </header>

      <section className="sp-step">
        <h2>1. 가구 구성</h2>
        <div className="sp-kind">
          {(['single', 'couple'] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={p.kind === k ? 'sp-card on' : 'sp-card'}
              aria-pressed={p.kind === k}
              onClick={() => setP({ ...p, kind: k })}
            >
              <b>{k === 'single' ? '싱글 (미혼·1인 가구)' : '부부 (기혼)'}</b>
              <small>{k === 'single' ? '본인 소득만 계산' : '맞벌이·외벌이 모두 가능, 명의 분산 전략 제공'}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="sp-step">
        <h2>2. 소득 유형 <small>해당하는 것을 모두 선택</small></h2>
        <div className={p.kind === 'couple' ? 'sp-persons two' : 'sp-persons'}>
          <PersonCard title={p.kind === 'couple' ? '본인' : '나'} value={p.a} onChange={(a) => setP({ ...p, a })} />
          {p.kind === 'couple' && <PersonCard title="배우자" value={p.b} onChange={(b) => setP({ ...p, b })} optional />}
        </div>
      </section>

      <section className="sp-step">
        <h2>3. 자녀 수 <small>(부양가족은 나중에 더 자세히 입력)</small></h2>
        <div className="sp-kids">
          <button type="button" aria-label="자녀 줄이기" onClick={() => setP({ ...p, children: Math.max(0, p.children - 1) })}>−</button>
          <b>{p.children}명</b>
          <button type="button" aria-label="자녀 늘리기" onClick={() => setP({ ...p, children: Math.min(6, p.children + 1) })}>＋</button>
        </div>
      </section>

      <section className="sp-result" aria-live="polite">
        <div>
          <div className="muted">선택한 구성</div>
          <b>{valid ? describeProfile(p) : '본인의 소득 유형을 하나 이상 선택하세요'}</b>
          {valid && (
            <div className={mode === 'wage' ? 'sp-mode wage' : 'sp-mode comp'}>
              → {mode === 'wage' ? '연말정산 시뮬레이터' : '종합소득세 시뮬레이터 (근로·사업·임대 소득 합산)'}
            </div>
          )}
        </div>
        <div className="sp-actions">
          <button type="button" className="primary" disabled={!valid} onClick={() => onStart(p)}>
            시작하기
          </button>
          {resumable && (
            <button type="button" onClick={() => onStart(initial!)}>
              이전 입력 이어서
            </button>
          )}
          <button type="button" onClick={() => onSample('wage')}>
            연말정산 예시
          </button>
          <button type="button" onClick={() => onSample('comp')}>
            종합소득세 예시
          </button>
        </div>
      </section>

      <p className="muted sp-foot">
        입력한 정보는 이 브라우저에만 저장되며 서버로 전송되지 않습니다. 모의 계산이므로 실제 신고 전에 홈택스·세무사 확인이 필요합니다.
      </p>
      <button type="button" className="link" onClick={() => setP({ ...p, a: { ...NO_INCOME }, b: { ...NO_INCOME } })}>
        선택 초기화
      </button>
    </div>
  );
}
