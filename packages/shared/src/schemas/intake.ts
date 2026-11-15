import { z } from 'zod';

import { DAY_PATTERN, NO_SUCH_DAY, isCalendarDay } from './day-date';

/** Тело webhook: содержимое обязательно, остальное выводится. */
export const intakePayloadSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  content: z.string().trim().min(1).max(65_536),
  occurredOn: z
    .string()
    .regex(DAY_PATTERN, 'Ожидается дата ГГГГ-ММ-ДД')
    .refine(isCalendarDay, NO_SUCH_DAY)
    .optional(),
});

/** Приёмный адрес проекта в обеих формах (ТЗ 5.2). */
export const intakeAddressSchema = z.object({
  /** Токен — общая часть обеих форм. */
  token: z.string(),
  /** Полный адрес webhook. */
  webhookUrl: z.string(),
  /** Почтовая форма. Приём почты появится позже. */
  emailAddress: z.string(),
});

/** Тело webhook. */
export type IntakePayload = z.infer<typeof intakePayloadSchema>;

/** Приёмный адрес проекта. */
export type IntakeAddress = z.infer<typeof intakeAddressSchema>;
