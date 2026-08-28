import { z } from 'zod';

import { EnvironmentKind } from '../enums';

/** Ключ в стиле переменных окружения: заглавные латинские, цифры, подчёркивание. */
const keySchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]*$/, 'Ключ: заглавные латинские буквы, цифры и подчёркивание')
  .max(200);

/**
 * Переменная в списке. Значения здесь нет ни на одном уровне доступа:
 * оно раскрывается только отдельным действием (ТЗ 3.3).
 */
export const variableSchema = z.object({
  id: z.string().uuid(),
  key: keySchema,
  description: z.string().nullable(),
  /** Номер текущей версии — последней по счёту. */
  currentVersion: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Создание: значение обязательно — оно станет первой версией. */
export const variableCreateSchema = z.object({
  key: keySchema,
  description: z.string().trim().max(500).nullable().optional(),
  value: z.string().max(65_536),
});

/** Правка. Поле `value` создаёт новую версию. */
export const variableUpdateSchema = z.object({
  key: keySchema.optional(),
  description: z.string().trim().max(500).nullable().optional(),
  value: z.string().max(65_536).optional(),
});

/** Версия в истории: без значения — его раскрывают отдельно. */
export const variableVersionSchema = z.object({
  versionNo: z.number().int().positive(),
  createdAt: z.string(),
  createdByLabel: z.string(),
});

/** Раскрытое значение. */
export const revealResponseSchema = z.object({
  value: z.string(),
  versionNo: z.number().int().positive(),
});

/** Откат к версии. */
export const rollbackSchema = z.object({
  toVersion: z.number().int().positive(),
});

/** Итог импорта `.env`. */
export const importResultSchema = z.object({
  created: z.array(z.string()),
  updated: z.array(z.string()),
  unchanged: z.array(z.string()),
});

/** Тело импорта: текст `.env` из формы. */
export const importEnvSchema = z.object({
  content: z.string().max(1_048_576),
});

/** Окружение в переключателе страницы переменных. */
export const variablesEnvironmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  kind: z.nativeEnum(EnvironmentKind),
});

/** Переменная в списке. */
export type Variable = z.infer<typeof variableSchema>;

/** Данные создания переменной. */
export type VariableCreate = z.infer<typeof variableCreateSchema>;

/** Данные правки переменной. */
export type VariableUpdate = z.infer<typeof variableUpdateSchema>;

/** Версия в истории. */
export type VariableVersion = z.infer<typeof variableVersionSchema>;

/** Раскрытое значение. */
export type RevealResponse = z.infer<typeof revealResponseSchema>;

/** Откат к версии. */
export type RollbackInput = z.infer<typeof rollbackSchema>;

/** Итог импорта. */
export type ImportResult = z.infer<typeof importResultSchema>;

/** Тело импорта. */
export type ImportEnvInput = z.infer<typeof importEnvSchema>;

/** Окружение в переключателе переменных. */
export type VariablesEnvironment = z.infer<typeof variablesEnvironmentSchema>;
