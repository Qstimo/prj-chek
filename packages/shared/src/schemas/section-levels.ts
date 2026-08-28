import { z } from 'zod';

import { AccessLevel, Section } from '../enums';

/** Карта «секция → уровень» для текущего субъекта. */
export const sectionLevelsSchema = z.record(z.nativeEnum(Section), z.nativeEnum(AccessLevel));

/**
 * Уровни текущего субъекта по секциям проекта.
 *
 * Тип переопределён как частичная запись по той же причине, что и уровни
 * в матрице выдач: `z.record` с перечислением в ключе выводится в zod как
 * полная запись, и клиент получил бы `undefined` там, где типы обещают
 * значение. Отсутствие ключа и означает отсутствие доступа.
 */
export type SectionLevels = Partial<Record<Section, AccessLevel>>;
