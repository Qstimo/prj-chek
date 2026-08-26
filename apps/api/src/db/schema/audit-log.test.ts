import { AuditSubjectKind } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { auditLog, auditSubjectKindEnum } from './audit-log';

describe('журнал действий', () => {
  it('перечисление действующих лиц включает system', () => {
    expect(auditSubjectKindEnum.enumValues).toEqual(Object.values(AuditSubjectKind));
  });

  it('допускает записи без субъекта', () => {
    // Действия с консоли субъекта не имеют (спека 4.7).
    expect(auditLog.subjectId.notNull).toBe(false);
  });

  it('денормализует вид и метку субъекта', () => {
    // Запись должна оставаться информативной после отзыва субъекта.
    expect(auditLog.subjectKind).toBeDefined();
    expect(auditLog.subjectLabel).toBeDefined();
  });
});
