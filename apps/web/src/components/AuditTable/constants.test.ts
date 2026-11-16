import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ACTION_LABELS } from './constants';

/**
 * Исходник перечисления действий журнала.
 *
 * Читается файлом, а не импортируется: `AuditAction` живёт в API, и типы
 * бэкенда в сборку страницы не ходят — у веба нет ни пути до них, ни
 * права их тянуть. Чтение исходника даёт то, что нужно сторожу: список
 * значений, который невозможно забыть пополнить вручную.
 */
const SOURCE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../api/src/audit/audit.types.ts',
);

/** Значения `AuditAction` в порядке объявления. */
function auditActions(): string[] {
  const source = readFileSync(SOURCE, 'utf8');
  const body = /export enum AuditAction \{([\s\S]*?)\n\}/.exec(source)?.[1];

  if (!body) {
    throw new Error(`Перечисление AuditAction не найдено в ${SOURCE}`);
  }

  return [...body.matchAll(/=\s*'([^']+)'/g)].map((match) => match[1]!);
}

describe('ACTION_LABELS', () => {
  it('список действий правда вычитывается', () => {
    // Сторож самого сторожа: сломанный разбор дал бы пустой список, и
    // проверка полноты прошла бы на любой таблице названий.
    const actions = auditActions();

    expect(actions.length).toBeGreaterThan(40);
    expect(actions).toContain('checkpoint.carried_over');
  });

  it('у каждого действия журнала есть русское название', () => {
    // Инвариант дизайна: новое действие получает и значение в
    // `AuditAction`, и название на экране журнала. Сырой ключ вида
    // `checkpoint.carried_over` человеку не говорит ничего.
    const missing = auditActions().filter((action) => !(action in ACTION_LABELS));

    expect(missing).toEqual([]);
  });

  it('названий для несуществующих действий в таблице нет', () => {
    // Иначе переименованное действие оставляет за собой мёртвую строку,
    // и таблица тихо расходится с журналом.
    const actions = new Set(auditActions());
    const stale = Object.keys(ACTION_LABELS).filter((action) => !actions.has(action));

    expect(stale).toEqual([]);
  });
});
