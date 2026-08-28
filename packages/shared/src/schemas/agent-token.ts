import { z } from 'zod';

/** Токен агента в списке: без хэша и без открытого значения. */
export const agentTokenSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  canRevealVariables: z.boolean(),
  expiresAt: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
});

/** Создание токена. Срок обязателен: бессрочных токенов не бывает (ТЗ 7.4). */
export const agentTokenCreateSchema = z
  .object({
    label: z.string().trim().min(1).max(200),
    ttlDays: z.number().int().min(1).max(3650).default(90),
    canRevealVariables: z.boolean().default(false),
  })
  .strict();

/**
 * Правка токена: только флаг доступа к значениям (ТЗ 7.3).
 *
 * Имя и срок не правятся: нужен другой срок — выпустите новый токен.
 */
export const agentTokenUpdateSchema = z
  .object({
    canRevealVariables: z.boolean(),
  })
  .strict();

/** Ответ создания: токен открытым текстом — единственный раз. */
export const agentTokenCreatedSchema = agentTokenSchema.extend({
  token: z.string(),
  mcpUrl: z.string(),
});

/** Токен агента в списке. */
export type AgentToken = z.infer<typeof agentTokenSchema>;

/** Данные создания токена. */
export type AgentTokenCreate = z.infer<typeof agentTokenCreateSchema>;

/** Правка токена. */
export type AgentTokenUpdate = z.infer<typeof agentTokenUpdateSchema>;

/** Созданный токен с открытым значением. */
export type AgentTokenCreated = z.infer<typeof agentTokenCreatedSchema>;
