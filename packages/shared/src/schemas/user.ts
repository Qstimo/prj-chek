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
  email: z.string().email().toLowerCase(),
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

/** Выданная ссылка. */
export type IssuedLinkResponse = z.infer<typeof issuedLinkSchema>;
