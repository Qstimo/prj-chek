/** Обозначение версии и её место в последовательности. */
export interface VersionLabel {
  label: string;
  position: number;
}

/** Последняя группа цифр в строке: `v1.09` → префикс `v1.`, число `09`. */
const TRAILING_NUMBER = /^(.*?)(\d+)(\D*)$/;

/** Сколько раз перешагнуть занятое обозначение. */
const ATTEMPTS = 10;

/**
 * Подсказывает обозначение следующей версии (дизайн, раздел 7.4).
 *
 * Обозначение в CAIRN — свободная строка, и универсального «следующего»
 * у неё нет. Поэтому правило узкое и честное: берётся последняя версия
 * по `position`, в ней находится **последняя группа цифр где угодно**, и
 * она увеличивается на единицу с сохранением ширины. Цифр нет — `null`:
 * выдумывать `v1.0` поверх чужой схемы версионирования хуже, чем не
 * подсказать ничего.
 *
 * Полное соответствие числовому шаблону рассматривалось и отвергнуто:
 * `release7` и `v2 beta` встречаются, и отказ на них лишил бы подсказки
 * ровно тех, у кого обозначения не похожи на semver.
 */
export function nextVersionLabel(versions: VersionLabel[]): string | null {
  const last = [...versions].sort((a, b) => a.position - b.position).at(-1);

  if (!last) {
    return null;
  }

  const match = TRAILING_NUMBER.exec(last.label);

  if (!match) {
    return null;
  }

  const [, prefix = '', digits = '', suffix = ''] = match;
  const taken = new Set(versions.map((version) => version.label));
  let value = Number(digits);

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    value += 1;

    // Ширина сохраняется, пока число в неё помещается: `v1.08` → `v1.09`,
    // но `v1.99` → `v1.100`, а не `v1.00`.
    const candidate = `${prefix}${String(value).padStart(digits.length, '0')}${suffix}`;

    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  return null;
}
