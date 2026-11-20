import { z } from 'zod';

import { DAY_PATTERN, NO_SUCH_DAY, isCalendarDay } from './day-date';
import { HAS_NUL, isNulFree } from './plain-text';

/**
 * Предел содержимого, присланного в приёмный канал, в знаках.
 *
 * Своё число, а не предел записи хроники, и это решение: канал открыт
 * машине, адрес которой знает кто угодно с этим адресом, а приём чужого
 * тела — наша память и наш диск. Руками человек вправе написать страницы
 * созвона, машине столько присылать незачем.
 *
 * Разборщик `text/plain` стоит **выше** этого числа и считается от него
 * (`apps/api/src/common/body-parsers.ts`): предел разборщика, равный числу
 * знаков, отвергал русский текст вдвое раньше схемы, и отвергал
 * неназванным `request entity too large`.
 */
export const MAX_INTAKE_CONTENT_CHARS = 65_536;

/**
 * Тело webhook: содержимое обязательно, остальное выводится.
 *
 * Нулевой байт отвергается так же, как у рукописной записи: это одна и та
 * же колонка, и прислать его может именно машина.
 */
export const intakePayloadSchema = z.object({
  title: z.string().trim().min(1).max(300).refine(isNulFree, HAS_NUL).optional(),
  content: z.string().trim().min(1).max(MAX_INTAKE_CONTENT_CHARS).refine(isNulFree, HAS_NUL),
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
