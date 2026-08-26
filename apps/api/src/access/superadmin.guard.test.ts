import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { SubjectKind } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { SuperadminGuard } from './superadmin.guard';
import type { RequestSubject } from './access.types';

function contextWith(subject: RequestSubject | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ subject }) }),
  } as unknown as ExecutionContext;
}

const base: RequestSubject = {
  id: '11111111-1111-1111-1111-111111111111',
  kind: SubjectKind.User,
  label: 'кто-то',
  isSuperadmin: false,
  isRevoked: false,
};

describe('SuperadminGuard', () => {
  const guard = new SuperadminGuard();

  it('пропускает суперадмина', () => {
    expect(guard.canActivate(contextWith({ ...base, isSuperadmin: true }))).toBe(true);
  });

  it('отклоняет обычного пользователя', () => {
    // Именно 403, а не 404: существование администрирования не секрет (спека 8).
    expect(() => guard.canActivate(contextWith(base))).toThrow(ForbiddenException);
  });

  it('отклоняет отозванного суперадмина', () => {
    expect(() => guard.canActivate(contextWith({ ...base, isSuperadmin: true, isRevoked: true }))).toThrow(
      ForbiddenException,
    );
  });

  it('отклоняет запрос без субъекта', () => {
    expect(() => guard.canActivate(contextWith(undefined))).toThrow(ForbiddenException);
  });
});
