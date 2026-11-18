import { won } from '../tax/format';
import type { OptimizeResult } from '../tax/optimizer';
import type { Tip } from '../tax/strategy';

/** 화면 맨 위: 입력하자마자 보이는 "올해 이렇게 하세요" 요약 */
export function ActionBoard({ opt, tips, onMore, single }: { opt: OptimizeResult; tips: Tip[]; onMore: () => void; single?: boolean }) {
  const moves = tips
    .filter((t) => t.level === 'action' && t.kind !== 'extra' && (t.saving ?? 0) > 0)
    .sort((a, b) => (b.saving ?? 0) - (a.saving ?? 0));
  const extras = tips.filter((t) => t.kind === 'extra').sort((a, b) => (b.saving ?? 0) - (a.saving ?? 0));
  const warns = tips.filter((t) => t.level === 'warn');
  const b = opt.baselineResult;
  const r = opt.bestResult;

  return (
    <section className="board" aria-label="추천 요약">
      <div className="board-hero">
        <div className="hero-label">{single ? '예상 세금(소득세+지방세)' : '부부 합산 세금(소득세+지방세) 예상'}</div>
        <div className="hero-flow">
          {!single && <span className="from">{won(b.total)}</span>}
          {!single && <span className="arrow">→</span>}
          <span className="to">{won(r.total)}</span>
        </div>
        <div className={single || opt.savings > 0 ? 'hero-save' : 'hero-save none'}>
          {single ? (
            '아래 항목을 챙기면 더 줄일 수 있어요'
          ) : opt.savings > 0 ? (
            <>
              명의만 바꿔도 <b>{won(opt.savings)}</b> 절세
            </>
          ) : (
            '지금 배분이 이미 최적에 가깝습니다'
          )}
        </div>
      </div>

      <div className="board-actions">
        <h2>{single ? '추가로 챙기면 좋은 것' : '이렇게 하세요'}</h2>
        {moves.length === 0 && single ? null : moves.length === 0 ? (
          <p className="muted">명의를 바꿔서 줄일 수 있는 세금이 없습니다. 아래 ‘추가로 하면 좋은 것’을 확인하세요.</p>
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
        {(extras.length > 0 || warns.length > 0) && (
          <div className="extras">
            {extras.map((t, i) => (
              <details key={i}>
                <summary>
                  <span className="plus">＋</span>
                  <span className="t">{t.title}</span>
                </summary>
                <p>{t.detail}</p>
              </details>
            ))}
            {warns.map((t, i) => (
              <details key={`w${i}`} className="warn">
                <summary>
                  <span className="plus">!</span>
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
