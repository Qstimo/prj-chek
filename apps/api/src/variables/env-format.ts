/**
 * Разбор и сборка текста в формате `.env` (спека 6).
 *
 * Чистые функции без привязки к HTTP: ошибки — обычные `Error`
 * с человеческим объяснением, контроллер оборачивает их в ответ `400`.
 */

/** Пара «ключ — значение». */
export interface EnvPair {
  key: string;
  value: string;
}

/** Формат ключа — тот же, что в контракте переменных. */
const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/**
 * Разбирает текст `.env` в пары.
 *
 * Понимает комментарии, пустые строки, одинарные и двойные кавычки;
 * в двойных кавычках раскрываются `\n`, `\"` и `\\`. При повторе ключа
 * побеждает последнее вхождение — как ведут себя оболочки.
 */
export function parseEnv(text: string): EnvPair[] {
  const byKey = new Map<string, string>();

  text.split('\n').forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const separator = trimmed.indexOf('=');

    if (separator === -1) {
      throw new Error(`Строка ${index + 1} не похожа на пару КЛЮЧ=значение`);
    }

    const key = trimmed.slice(0, separator).trim();

    if (!KEY_PATTERN.test(key)) {
      throw new Error(
        `Строка ${index + 1}: недопустимый ключ «${key}» — ожидаются заглавные латинские буквы, цифры и подчёркивание`,
      );
    }

    byKey.set(key, parseValue(trimmed.slice(separator + 1)));
  });

  return [...byKey.entries()].map(([key, value]) => ({ key, value }));
}

/** Собирает пары в текст `.env`, пригодный для обратного разбора. */
export function serializeEnv(pairs: EnvPair[]): string {
  return pairs.map(({ key, value }) => `${key}=${serializeValue(value)}\n`).join('');
}

/** Разбирает значение: кавычки двух видов либо сырое с обрезкой пробелов. */
function parseValue(raw: string): string {
  const trimmed = raw.trim();

  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed
      .slice(1, -1)
      .replace(/\\(["\\n])/g, (_, escaped: string) => (escaped === 'n' ? '\n' : escaped));
  }

  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

/**
 * Собирает значение: кавычки нужны, когда без них разбор исказил бы
 * значение — пробелы по краям, решётка, кавычки, переводы строк.
 */
function serializeValue(value: string): string {
  if (value === '' || !/[\s#"'\\]/.test(value)) {
    return value;
  }

  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');

  return `"${escaped}"`;
}
