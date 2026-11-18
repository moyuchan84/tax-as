import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { InputPanel } from './components/InputPanel';
import { ResultPanel } from './components/ResultPanel';
import { optimizeHousehold } from './tax/optimizer';
import { RULES } from './tax/rules';
import { emptyPerson, sampleHousehold } from './tax/sample';
import { buildStrategy } from './tax/strategy';
import type { HouseholdInput } from './tax/types';

const STORAGE_KEY = 'tax-as:household:v1';

function load(): HouseholdInput {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as HouseholdInput;
  } catch {
    /* 저장소를 쓸 수 없으면 예시로 시작 */
  }
  return sampleHousehold();
}

function blank(): HouseholdInput {
  return {
    husband: emptyPerson('남편'),
    wife: emptyPerson('아내'),
    dependents: [],
    housing: { head: 'h', headLocked: false, rent: 0, leaseLoanRepay: 0 },
    flex: { cards: true, medical: true, donations: true },
  };
}

export default function App() {
  const [hh, setHh] = useState<HouseholdInput>(load);
  const deferred = useDeferredValue(hh);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(hh));
    } catch {
      /* 무시 */
    }
  }, [hh]);

  const { opt, tips } = useMemo(() => {
    const opt = optimizeHousehold(deferred);
    return { opt, tips: buildStrategy(deferred, opt) };
  }, [deferred]);

  return (
    <div className="app">
      <header>
        <div>
          <h1>맞벌이 연말정산 시뮬레이터</h1>
          <p>
            {RULES.year}년 귀속 근로소득 · 부부 소득을 넣으면 카드·의료비·부양가족·기부금을 <b>누구 명의로 몰아야</b> 세금이
            가장 적은지 계산합니다.
          </p>
        </div>
        <div className="actions">
          <button onClick={() => setHh(sampleHousehold())}>예시 불러오기</button>
          <button onClick={() => setHh(blank())}>초기화</button>
        </div>
      </header>
      <main>
        <section className="left">
          <InputPanel hh={hh} onChange={setHh} />
        </section>
        <section className="right">
          <ResultPanel hh={deferred} opt={opt} tips={tips} />
        </section>
      </main>
      <footer>
        모의 계산 결과이며 실제 세액과 다를 수 있습니다. 근로소득만 있는 경우를 가정하고, 부양가족의 소득 요건(연 소득금액 100만원 이하)은 충족한다고
        봅니다. 자녀 수별 카드 공제 한도, 자녀세액공제 대상 연령(9세 이상), 고향사랑기부금 10만~20만원 구간 공제율 등 2026년 개정 사항은 언론 보도를
        기준으로 했으므로, 신고 전에 국세청 홈택스 연말정산 미리보기로 꼭 확인하세요.
      </footer>
    </div>
  );
}
