import { isActual } from '../tax/household';
import { defaultMonth, monthsLeft } from '../tax/timeline';
import type { HouseholdInput } from '../tax/types';

/** 계획(연초~연중, 예상값) ↔ 연말 점검(지금까지 실제 + 남은 기간) 전환 */
export function TimeControl({ hh, onChange, onMode }: { hh: HouseholdInput; onChange: (hh: HouseholdInput) => void; onMode: (m: 'plan' | 'actual') => void }) {
  const actual = isActual(hh);
  const month = hh.time?.month ?? defaultMonth();
  return (
    <div className="timebar">
      <div className="seg" role="group" aria-label="시점">
        <button type="button" className={!actual ? 'on' : ''} aria-pressed={!actual} onClick={() => onMode('plan')}>
          <b>계획</b>
          <small>연초~연중 · 올해 예상값으로 전략 세우기</small>
        </button>
        <button type="button" className={actual ? 'on' : ''} aria-pressed={actual} onClick={() => onMode('actual')}>
          <b>연말 점검</b>
          <small>지금까지 실제값 + 남은 기간</small>
        </button>
      </div>
      {actual && (
        <div className="time-detail">
          <label>
            실제 입력 기준
            <select value={month} onChange={(e) => onChange({ ...hh, time: { mode: 'actual', month: Number(e.target.value) } })} aria-label="기준 월">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}월 말까지
                </option>
              ))}
            </select>
          </label>
          <span>
            남은 기간 <b>{monthsLeft(hh)}개월</b> + 12월 31일까지
          </span>
        </div>
      )}
      <p className="muted time-note">
        {actual
          ? '이미 쓴 카드는 명의를 바꿀 수 없습니다. 아래 “지금까지 실제”는 고정하고, “남은 기간 예상 지출”을 누구 카드로 쓸지만 추천합니다.'
          : '입력값 전체가 올해 예상이라 누구 카드로 쓸지 처음부터 배분해 드립니다. 연말이 가까워지면 “연말 점검”으로 바꿔 실제값을 넣으세요.'}
      </p>
    </div>
  );
}
