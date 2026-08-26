import { z } from 'zod';

import { AccessLevel, Section, SubjectKind } from '../enums';

/** Установка уровня доступа для пары «субъект × секция». */
export const grantSetSchema = z.object({
  subjectId: z.string().uuid(),
  section: z.nativeEnum(Section),
  level: z.nativeEnum(AccessLevel),
});

/** Отзыв выдачи. Адресуется парой, а не идентификатором строки (спека 8). */
export const grantRevokeSchema = z.object({
  subjectId: z.string().uuid(),
  section: z.nativeEnum(Section),
});

/**
 * Строка матрицы доступов: субъект и его уровни по секциям.
 *
 * `levels` содержит только те секции, на которые есть выдача: отсутствие
 * ключа и означает отсутствие доступа (спека 4.3).
 */
export const grantMatrixRowSchema = z.object({
  subjectId: z.string().uuid(),
  subjectKind: z.nativeEnum(SubjectKind),
  subjectLabel: z.string(),
  isRevoked: z.boolean(),
  levels: z.record(z.nativeEnum(Section), z.nativeEnum(AccessLevel)),
});

/** Установка уровня доступа. */
export type GrantSet = z.infer<typeof grantSetSchema>;

/** Отзыв выдачи. */
export type GrantRevoke = z.infer<typeof grantRevokeSchema>;

/**
 * Строка матрицы доступов.
 *
 * `levels` переопределён как частичная запись: `z.record` с перечислением
 * в ключе выводится в zod как **полный** `Record<Section, AccessLevel>`,
 * то есть тип утверждал бы, что все шесть секций всегда присутствуют.
 * Клиент получил бы непустое значение по типам и `undefined` в рантайме.
 */
export type GrantMatrixRow = Omit<z.infer<typeof grantMatrixRowSchema>, 'levels'> & {
  levels: Partial<Record<Section, AccessLevel>>;
};
