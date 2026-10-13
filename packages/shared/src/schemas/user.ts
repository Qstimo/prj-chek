import { z } from 'zod';

import { InvitationKind, SubjectKind } from '../enums';

/**
 * Пользователь в списке.
 *
 * Состояние «нет действующего пароля» не различает приглашённого и того,
 * кому пароль сбросили; их различает вид последней выданной ссылки (спека 4.2).
 */
export const userRowSchema = z.object({
  id: z.string().uuid(),
  subjectId: z.string().uuid(),
  subjectKind: z.nativeEnum(SubjectKind),
  /**
   * Имя для показа. Хранится в `subjects.label`.
   *
   * Логином остаётся почта: имя не уникально и меняется свободно.
   */
  name: z.string(),
  email: z.string().email(),
  isSuperadmin: z.boolean(),
  isTotpEnabled: z.boolean(),
  hasPassword: z.boolean(),
  isRevoked: z.boolean(),
  /** Вид последней ссылки; пусто, если ссылок не выдавалось. */
  lastLinkKind: z.nativeEnum(InvitationKind).nullable(),
  createdAt: z.string(),
});

/** Приглашение нового пользователя. */
export const inviteUserSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().email().toLowerCase(),
});

/**
 * Правка учётки: имя и почта.
 *
 * Оба поля необязательны по отдельности, но пустая правка отвергается:
 * запрос без изменений завершился бы успехом, ничего не изменив.
 */
export const userUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    email: z.string().email().toLowerCase().optional(),
  })
  .refine((value) => value.name !== undefined || value.email !== undefined, {
    message: 'Нужно изменить имя или почту',
  });

/** Выданная ссылка. Показывается суперадмину один раз. */
export const issuedLinkSchema = z.object({
  url: z.string().url(),
  expiresAt: z.string(),
});

/** Пользователь в списке. */
export type UserRow = z.infer<typeof userRowSchema>;

/** Данные приглашения. */
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

/** Данные правки учётки. */
export type UserUpdate = z.infer<typeof userUpdateSchema>;

/** Выданная ссылка. */
export type IssuedLinkResponse = z.infer<typeof issuedLinkSchema>;
