import { z } from 'zod';

/** Первый шаг входа: адрес и пароль (спека 6.1). */
export const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

/** Второй шаг входа: код из приложения-аутентификатора. */
export const totpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Код состоит из шести цифр'),
});

/** Тело запроса второго шага: челлендж из первого шага и код. */
export const totpVerifySchema = totpSchema.extend({
  challengeToken: z.string().min(1),
});

/** Установка пароля по одноразовой ссылке. */
export const acceptInvitationSchema = z.object({
  password: z.string().min(12, 'Пароль должен быть не короче 12 символов'),
});

/**
 * Ответ на первый шаг входа.
 *
 * Размеченное объединение, а не необязательные поля: клиент обязан
 * различить готовую сессию и требование второго фактора (спека 8).
 */
export const loginResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('session') }),
  z.object({ kind: z.literal('totp_required'), challengeToken: z.string() }),
]);

/** Текущий пользователь. */
export const currentSubjectSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  isSuperadmin: z.boolean(),
  isTotpEnabled: z.boolean(),
});

/** Данные первого шага входа. */
export type LoginInput = z.infer<typeof loginSchema>;

/** Данные второго шага входа. */
export type TotpInput = z.infer<typeof totpSchema>;

/** Данные установки пароля. */
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

/** Ответ на первый шаг входа. */
export type LoginResponse = z.infer<typeof loginResponseSchema>;

/** Текущий пользователь. */
export type CurrentSubjectResponse = z.infer<typeof currentSubjectSchema>;
