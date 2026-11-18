import { useEffect, useState, type ReactNode } from 'react';

const M = 10_000;

/** 원 단위 값을 만원 단위로 입력받는다. */
export function MoneyInput({
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const toText = (v: number) => (v ? String(Math.round((v / M) * 10) / 10) : '');
  const [text, setText] = useState(toText(value));
  useEffect(() => {
    if (Math.round(parseFloat(text || '0') * M) !== value) setText(toText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <label className="money">
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={text}
        disabled={disabled}
        placeholder="0"
        onChange={(e) => {
          const t = e.target.value.replace(/[^0-9.]/g, '');
          setText(t);
          const n = parseFloat(t);
          onChange(Number.isFinite(n) ? Math.round(n * M) : 0);
        }}
      />
      <span>만원</span>
    </label>
  );
}

export function IntInput({ value, onChange, suffix, ariaLabel }: { value: number; onChange: (v: number) => void; suffix?: string; ariaLabel?: string }) {
  return (
    <label className="money small">
      <input
        type="number"
        min={0}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value || '0', 10)))}
      />
      {suffix && <span>{suffix}</span>}
    </label>
  );
}

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

export function Section({ title, hint, children, defaultOpen = true }: { title: string; hint?: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="section" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        {hint && <small>{hint}</small>}
      </summary>
      <div className="section-body">{children}</div>
    </details>
  );
}

/** 라벨 | 남편 | 아내 3열 행 */
export function PairRow({ label, hint, h, w }: { label: string; hint?: string; h: ReactNode; w: ReactNode }) {
  return (
    <div className="pair-row">
      <div className="pair-label">
        {label}
        {hint && <small>{hint}</small>}
      </div>
      <div>{h}</div>
      <div>{w}</div>
    </div>
  );
}
