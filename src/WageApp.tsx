import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ActionBoard } from './components/ActionBoard';
import { InputPanel } from './components/InputPanel';
import { ResultPanel, type Tab } from './components/ResultPanel';
import { won } from './tax/format';
import { optimizeHousehold } from './tax/optimizer';
import { describeProfile, newWageHousehold, profileKey, type Profile } from './tax/profile';
import { RULES } from './tax/rules';
import { emptyPerson, sampleHousehold, sampleSingle } from './tax/sample';
import { buildStrategy } from './tax/strategy';
import type { HouseholdInput } from './tax/types';

const STORAGE_KEY = 'tax-as:wage:v2';

/** 저장·공유로 들어온 데이터를 현재 스키마에 맞게 보정한다 (누락 필드는 기본값) */
function normalize(raw: unknown, single: boolean): HouseholdInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<HouseholdInput>;
  if (!r.husband || !r.wife || !Array.isArray(r.dependents)) return null;
  const b = newWageHousehold({ kind: single ? 'single' : 'couple', a: { wage: true, business: false, rental: false }, b: { wage: true, business: false, rental: false }, children: 0 });
  return {
    husband: { ...emptyPerson('본인'), ...r.husband, cards: { ...b.husband.cards, ...r.husband.cards }, donations: { ...b.husband.donations, ...r.husband.donations } },
    wife: { ...emptyPerson('배우자'), ...r.wife, cards: { ...b.wife.cards, ...r.wife.cards }, donations: { ...b.wife.donations, ...r.wife.donations } },
    dependents: r.dependents,
    housing: { ...b.housing, ...r.housing },
    flex: { ...b.flex, ...r.flex },
    single,
  };
}

const encode = (hh: HouseholdInput) => btoa(unescape(encodeURIComponent(JSON.stringify(hh))));
const decode = (s: string) => JSON.parse(decodeURIComponent(escape(atob(s))));

function load(profile: Profile, seed?: 'sample'): HouseholdInput {
  const single = profile.kind === 'single';
  if (seed === 'sample') return single ? sampleSingle() : sampleHousehold();
  if (!single) {
    try {
      const m = location.hash.match(/^#d=(.+)$/);
      if (m) {
        const fromLink = normalize(decode(m[1]), false);
        if (fromLink) return fromLink;
      }
    } catch {
      /* 잘못된 링크는 무시 */
    }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { pk: string; hh: unknown };
      if (saved.pk === profileKey(profile)) {
        const n = normalize(saved.hh, single);
        if (n) return n;
      }
    }
  } catch {
    /* 저장소를 쓸 수 없으면 새로 시작 */
  }
  return newWageHousehold(profile);
}

export default function WageApp({ profile, seed, onRestart }: { profile: Profile; seed?: 'sample'; onRestart: () => void }) {
  const single = profile.kind === 'single';
  const [hh, setHh] = useState<HouseholdInput>(() => load(profile, seed));
  const [tab, setTab] = useState<Tab>('guide');
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
    const opt = optimizeHousehold(deferred);
    return { opt, tips: buildStrategy(deferred, opt) };
  }, [deferred]);

  const copyLink = async () => {
    const url = `${location.origin}${location.pathname}#d=${encode(hh)}`;
    try {
      await navigator.clipboard.writeText(url);
      setToast('입력값이 담긴 링크를 복사했어요. 배우자에게 보내면 같은 화면이 열립니다.');
    } catch {
      history.replaceState(null, '', url);
      setToast('주소창의 링크를 복사해 공유하세요.');
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(hh, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `연말정산-${RULES.year}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    try {
      const n = normalize(JSON.parse(await file.text()), single);
      if (!n) throw new Error('형식 오류');
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

  return (
    <div className="app">
      <header>
        <div>
          <h1>연말정산 시뮬레이터</h1>
          <p>
            {RULES.year}년 귀속 · {describeProfile(profile)} ·{' '}
            {single ? '소득과 올해 지출을 넣으면 공제를 어디까지 채우면 좋은지 알려드려요.' : <>카드·의료비·부양가족·기부금을 <b>누구 명의로 몰아야</b> 세금이 가장 적은지 알려드려요.</>}
          </p>
        </div>
        <div className="actions">
          <button type="button" className="primary" onClick={onRestart}>구성 변경</button>
          <button type="button" onClick={() => setHh(single ? sampleSingle() : sampleHousehold())}>예시</button>
          <button type="button" onClick={() => setHh(newWageHousehold(profile))}>초기화</button>
          {!single && (
            <button type="button" onClick={copyLink}>링크 공유</button>
          )}
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

      <ActionBoard opt={opt} tips={tips} onMore={goMore} single={single} />

      <main>
        <section className="left" aria-label="입력">
          <InputPanel hh={hh} onChange={setHh} />
        </section>
        <section className="right" id="results" ref={resultsRef} aria-label="결과">
          <ResultPanel hh={deferred} opt={opt} tips={tips} tab={tab} onTab={setTab} />
        </section>
      </main>

      <a className="mobile-bar" href="#results">
        {!single && opt.savings > 0 ? (
          <>
            절세 <b>{won(opt.savings)}</b> · 결과 보기 ↓
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
        <p>
          입력한 정보는 이 브라우저에만 저장되고 서버로 전송되지 않습니다. ‘링크 공유’는 입력값을 주소(#) 안에 담는 방식이라 링크를 가진 사람은 내용을 볼 수 있으니 주의하세요.
        </p>
        <p>
          모의 계산이며 실제 세액과 다를 수 있습니다. 근로소득만 있고 부양가족 소득 요건(연 소득금액 100만원 이하)을 충족한다고 가정했습니다. 사업·임대 소득이 있으면 ‘구성 변경’에서 종합소득세
          시뮬레이터를 선택하세요. 자녀 수별 카드 한도, 자녀세액공제 연령(9세 이상), 고향사랑기부금 10만~20만원 구간 공제율은 언론 보도 기준이므로 신고 전에 홈택스 연말정산 미리보기로 꼭 확인하세요.
        </p>
      </footer>
    </div>
  );
}
