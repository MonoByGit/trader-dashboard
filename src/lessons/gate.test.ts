import { lessonAllowsBuy } from './gate.js';

describe('lessonAllowsBuy', () => {
  it('rejects string "false" and missing allow (fail closed)', () => {
    expect(lessonAllowsBuy({ allow: 'false' })).toBe(false);
    expect(lessonAllowsBuy({})).toBe(false);
  });

  it('accepts only strict boolean true', () => {
    expect(lessonAllowsBuy({ allow: true })).toBe(true);
    expect(lessonAllowsBuy({ allow: 'true' })).toBe(false);
  });
});
