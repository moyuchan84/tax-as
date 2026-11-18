import { useState } from 'react';
import CompApp from './CompApp';
import { StartPage } from './components/StartPage';
import WageApp from './WageApp';
import { defaultProfile, modeOf, NO_INCOME, type Profile } from './tax/profile';

const PROFILE_KEY = 'tax-as:profile:v1';

function loadSavedProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) return JSON.parse(raw) as Profile;
  } catch {
    /* 저장소를 쓸 수 없으면 시작 페이지부터 */
  }
  return null;
}

export default function App() {
  const [saved] = useState<Profile | null>(loadSavedProfile);
  // 공유 링크(#d=...)는 부부 연말정산 화면으로 바로 연결, 그 외에는 시작 페이지에서 시작
  const [profile, setProfile] = useState<Profile | null>(() => (/^#d=/.test(location.hash) ? { ...defaultProfile(), kind: 'couple' } : null));
  const [seed, setSeed] = useState<'sample' | undefined>();
  const [runKey, setRunKey] = useState(0);

  const start = (p: Profile, s?: 'sample') => {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    } catch {
      /* 무시 */
    }
    setSeed(s);
    setProfile(p);
    setRunKey((k) => k + 1);
    window.scrollTo(0, 0);
  };

  if (!profile) {
    return (
      <StartPage
        initial={saved}
        resumable={!!saved}
        onStart={(p) => start(p)}
        onSample={(kind) =>
          start(
            kind === 'wage'
              ? { ...defaultProfile(), children: 2 }
              : { kind: 'couple', a: { ...NO_INCOME, business: true, rental: true }, b: { ...NO_INCOME, wage: true }, children: 2 },
            'sample',
          )
        }
      />
    );
  }

  const restart = () => {
    history.replaceState(null, '', location.pathname);
    setProfile(null);
  };
  return modeOf(profile) === 'wage' ? (
    <WageApp key={runKey} profile={profile} seed={seed} onRestart={restart} />
  ) : (
    <CompApp key={runKey} profile={profile} seed={seed} onRestart={restart} />
  );
}
