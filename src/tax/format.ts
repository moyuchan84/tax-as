export const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;

/** 만원 단위 표기 (소수점 1자리까지) */
export const man = (n: number) => {
  const v = Math.round(n / 1000) / 10;
  return `${v.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}만원`;
};

export const pct = (r: number) => `${(Math.round(r * 1000) / 10).toLocaleString('ko-KR')}%`;

/** 만원 단위 정수 표기 (경계 금액 등 어림값용) */
export const man0 = (n: number) => `${Math.round(n / 10_000).toLocaleString('ko-KR')}만원`;
