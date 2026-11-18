import { NO_INCOME, defaultProfile, describeProfile, modeOf, newCompHousehold, newWageHousehold, profileKey, profileValid, type Profile } from './profile';

const mk = (over: Partial<Profile>): Profile => ({ ...defaultProfile(), ...over });

describe('가구 구성 → 시뮬레이터 선택', () => {
  it('근로소득만 있으면 연말정산, 사업·임대가 하나라도 있으면 종합소득세', () => {
    expect(modeOf(defaultProfile())).toBe('wage');
    expect(modeOf(mk({ kind: 'single', a: { ...NO_INCOME, wage: true } }))).toBe('wage');
    expect(modeOf(mk({ kind: 'single', a: { ...NO_INCOME, business: true } }))).toBe('comprehensive');
    expect(modeOf(mk({ a: { ...NO_INCOME, wage: true, rental: true } }))).toBe('comprehensive');
    expect(modeOf(mk({ b: { ...NO_INCOME, business: true } }))).toBe('comprehensive');
  });
  it('싱글이면 배우자 선택값은 무시된다', () => {
    const a = mk({ kind: 'single', b: { ...NO_INCOME, business: true } });
    expect(modeOf(a)).toBe('wage');
    expect(profileKey(a)).toBe(profileKey(mk({ kind: 'single', b: NO_INCOME })));
  });
  it('본인 소득 유형이 하나도 없으면 시작할 수 없다', () => {
    expect(profileValid(mk({ a: NO_INCOME }))).toBe(false);
    expect(profileValid(defaultProfile())).toBe(true);
  });
  it('설명 문구: 맞벌이/외벌이/싱글', () => {
    expect(describeProfile(defaultProfile())).toContain('맞벌이');
    expect(describeProfile(mk({ b: NO_INCOME }))).toContain('외벌이');
    expect(describeProfile(mk({ kind: 'single' }))).toContain('싱글');
  });
  it('초기 입력: 싱글은 single 플래그, 자녀 수만큼 부양가족', () => {
    const w = newWageHousehold(mk({ kind: 'single', children: 2 }));
    expect(w.single).toBe(true);
    expect(w.dependents).toHaveLength(2);
    const c = newCompHousehold(mk({ a: { ...NO_INCOME, business: true }, children: 1 }));
    expect(c.people).toHaveLength(2);
    expect(c.people[0].hasBusiness).toBe(true);
    expect(c.people[1].hasWage).toBe(true);
    expect(newCompHousehold(mk({ kind: 'single' })).people).toHaveLength(1);
  });
});
