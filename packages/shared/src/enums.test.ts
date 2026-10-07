import { describe, expect, it } from 'vitest';

import {
  AccessLevel,
  AuditSubjectKind,
  PlatformKind,
  PlatformReleaseState,
  Section,
  SubjectKind,
} from './enums';

describe('Section', () => {
  it('содержит ровно шесть секций', () => {
    expect(Object.values(Section)).toHaveLength(6);
  });

  it('содержит все секции из ТЗ', () => {
    expect(Object.values(Section)).toEqual([
      'info',
      'infrastructure',
      'variables',
      'docs',
      'roadmap',
      'chronicle',
    ]);
  });
});

describe('AccessLevel', () => {
  it('содержит три уровня без значения «нет»', () => {
    expect(Object.values(AccessLevel)).toEqual(['metadata', 'read', 'write']);
  });
});

describe('AuditSubjectKind', () => {
  it('расширяет виды субъектов значением system', () => {
    expect(Object.values(AuditSubjectKind)).toEqual([
      ...Object.values(SubjectKind),
      'system',
    ]);
  });
});

describe('платформы', () => {
  it('вид отвечает на два вопроса поведения, а не перечисляет магазины', () => {
    // Магазинов много и новые появляются каждый год: значением перечня
    // их не удержать, поэтому имя платформы свободное.
    expect(Object.values(PlatformKind)).toEqual(['server', 'store', 'other']);
  });

  it('состояние выпуска не повторяет состояний версии', () => {
    // «Запланирована» и «в работе» — это состояние версии. Строка выпуска
    // с таким значением не сообщала бы ничего нового, и её отсутствие
    // как раз и означает «платформа идёт вместе с версией».
    const states = Object.values(PlatformReleaseState) as string[];

    expect(states).not.toContain('planned');
    expect(states).not.toContain('in_progress');
    expect(states).toEqual(['on_test', 'in_review', 'released', 'rejected']);
  });
});
