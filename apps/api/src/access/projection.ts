import { AccessLevel } from '@cairn/shared';

/**
 * Собирает представление объекта по уровню доступа (спека 5.5).
 *
 * Подробности передаются функцией, а не значением: на уровне метаданных
 * они не нужны, а их вычисление может стоить запроса в базу или расшифровки
 * значения (этап 4). Работа ради выброшенного результата здесь недопустима.
 *
 * Помощник намеренно не знает ни об одной секции: секций шесть, форма
 * проекции у всех одна, и повторять её шесть раз незачем.
 */
export function projectByLevel<M extends object, D extends object>(
  level: AccessLevel,
  metadata: M,
  details: () => D,
): M | (M & D) {
  if (level === AccessLevel.Metadata) {
    return metadata;
  }

  return { ...metadata, ...details() };
}
