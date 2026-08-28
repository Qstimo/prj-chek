import { describe, expect, it } from 'vitest';

import { requiresTotpBinding } from './requiresTotpBinding';

describe('requiresTotpBinding', () => {
  it('суперадмин без фактора упирается в привязку', () => {
    expect(requiresTotpBinding({ isSuperadmin: true, isTotpEnabled: false }, false)).toBe(true);
  });

  it('суперадмин с фактором проходит', () => {
    expect(requiresTotpBinding({ isSuperadmin: true, isTotpEnabled: true }, false)).toBe(false);
  });

  it('обычный пользователь не обязан привязывать фактор', () => {
    expect(requiresTotpBinding({ isSuperadmin: false, isTotpEnabled: false }, false)).toBe(false);
  });

  it('небезопасный флаг снимает требование', () => {
    expect(requiresTotpBinding({ isSuperadmin: true, isTotpEnabled: false }, true)).toBe(false);
  });
});
