import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { CompInputPanel } from './components/CompInputPanel';
import { CompBoard, CompResultPanel, type CompTab } from './components/CompResultPanel';
import type { CompHousehold } from './tax/comp';
import { optimizeComp } from './tax/compHousehold';
import { buildCompStrategy } from './tax/compStrategy';
import { sampleComp, sampleCompSingle } from './tax/compSample';
import { won } from './tax/format';
import { describeProfile, newCompHousehold, profileKey, type Profile } from './tax/profile';
import { RULES } from './tax/rules';

const STORAGE_KEY = 'tax-as:comp:v1';

function load(profile: Profile, seed?: 'sample'): CompHousehold {
  const single = profile.kind === 'single';
  if (seed === 'sample') return single ? sampleCompSingle() : sampleComp();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { pk: string; hh: CompHousehold };
      if (saved.pk === profileKey(profile) && saved.hh?.people?.length) return saved.hh;
    }
  } catch {
    /* 저장소를 쓸 수 없으면 새로 시작 */
  }
  return newCompHousehold(profile);
}

export default function CompApp({ profile, seed, onRestart }: { profile: Profile; seed?: 'sample'; onRestart: () => void }) {
  const [hh, setHh] = useState<CompHousehold>(() => load(profile, seed));
  const [tab, setTab] = useState<CompTab>('tips');
  const [includeShift, setIncludeShift] = useState(false);
  const [toast, setToast] = useState('');
  const deferred = useDeferredValue(hh);
  const resultsRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ pk: profileKey(profile), hh }));
    } catch {
      /* 무시 */
    }
  }, [hh, profile]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const { opt, tips } = useMemo(() => {
    const opt = optimizeComp(deferred);
    return { opt, tips: buildCompStrategy(deferred, opt) };
  }, [deferred]);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(hh, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `종합소득세-${RULES.year}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    try {
      const n = JSON.parse(await file.text()) as CompHousehold;
      if (!Array.isArray(n.people) || !n.people.length || !Array.isArray(n.dependents)) throw new Error('형식 오류');
      setHh(n);
      setToast('불러왔어요.');
    } catch {
      setToast('불러오지 못했어요. 이 앱에서 저장한 JSON 파일인지 확인하세요.');
    }
  };

  const goMore = () => {
    setTab('tips');
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const shown = includeShift && opt.bestShift ? opt.baselineResult.total - opt.bestShift.result.total : opt.savings;

  return (
    <div className="app">
      <header>
        <div>
          <h1>종합소득세 시뮬레이터</h1>
          <p>
            {RULES.year}년 귀속(2027년 5월 신고) · {describeProfile(profile)} · 근로·사업·임대 소득을 합산해 세금을 줄이는 방법을 알려드려요.
          </p>
        </div>
        <div className="actions">
          <button type="button" className="primary" onClick={onRestart}>구성 변경</button>
          <button type="button" onClick={() => setHh(profile.kind === 'single' ? sampleCompSingle() : sampleComp())}>예시</button>
          <button type="button" onClick={() => setHh(newCompHousehold(profile))}>초기화</button>
          <button type="button" onClick={exportJson}>저장</button>
          <button type="button" onClick={() => fileRef.current?.click()}>불러오기</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importJson(f);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      <CompBoard hh={deferred} opt={opt} tips={tips} includeShift={includeShift} onMore={goMore} />

      <main>
        <section className="left" aria-label="입력">
          <CompInputPanel hh={hh} onChange={setHh} includeShift={includeShift} onIncludeShift={setIncludeShift} />
        </section>
        <section className="right" id="results" ref={resultsRef} aria-label="결과">
          <CompResultPanel hh={deferred} opt={opt} tips={tips} tab={tab} onTab={setTab} includeShift={includeShift} />
        </section>
      </main>

      <a className="mobile-bar" href="#results">
        {shown > 0 ? (
          <>
            절세 <b>{won(shown)}</b> · 결과 보기 ↓
          </>
        ) : (
          <>결과 보기 ↓</>
        )}
      </a>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      <footer>
        <p>입력한 정보는 이 브라우저에만 저장되고 서버로 전송되지 않습니다.</p>
        <p>
          모의 계산이며 실제 세액과 다를 수 있습니다. 금융소득(이자·배당) 종합과세, 간주임대료, 성실신고확인, 가산세, 건강보험료, 양도·상속·증여세는 반영하지 않았습니다. 주택임대 경비율·분리과세 기본공제
          조건·기장세액공제 요건은 고시·개정에 따라 달라질 수 있으니 신고 전에 홈택스 안내 또는 세무사 확인이 필요합니다.
        </p>
      </footer>
    </div>
  );
}
