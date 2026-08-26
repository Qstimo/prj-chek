import { AuditSubjectKind, SubjectKind } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { subjectKindEnum, subjects } from './subjects';

describe('субъекты', () => {
  it('перечисление вида субъекта совпадает с контрактом', () => {
    expect(subjectKindEnum.enumValues).toEqual(Object.values(SubjectKind));
  });

  it('не знает про значение system', () => {
    // Оно принадлежит перечислению журнала — это разные перечисления (спека 4.7).
    expect(subjectKindEnum.enumValues).not.toContain(AuditSubjectKind.System);
  });

  it('содержит признак отзыва', () => {
    // Физического удаления нет: оно разорвало бы связи в журнале (спека 4.1).
    expect(subjects.revokedAt).toBeDefined();
  });
});
