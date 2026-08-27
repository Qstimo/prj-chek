import { z } from 'zod';

/** Ответ на запрос привязки второго фактора. */
export const totpSetupResponseSchema = z.object({
  /** Ссылка для приложения-аутентификатора. */
  keyUri: z.string(),
  /** Секрет в текстовом виде — на случай ручного ввода. */
  secret: z.string(),
});

/** Подтверждение привязки: код из приложения. */
export const totpConfirmSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Код состоит из шести цифр'),
});

/** Ответ на запрос привязки. */
export type TotpSetupResponse = z.infer<typeof totpSetupResponseSchema>;

/** Данные подтверждения привязки. */
export type TotpConfirmInput = z.infer<typeof totpConfirmSchema>;
