import { z } from 'zod';

import type { SuggestResult } from './task-suggester';

/**
 * Разбор и чистка вывода модели (дизайн, раздел 5.5).
 *
 * Вывод недоверен и по форме, и по содержанию. Разбор при этом
 * **снисходительный**: обёртку в ```` ```json ```` маленькие модели ставят
 * постоянно, и строгий отказ на любое отклонение от схемы означал бы
 * неработающую кнопку на исправном ответе. Худшее последствие
 * снисходительности — список формулировок, который человек всё равно
 * вычитывает перед нажатием; худшее последствие строгости — кнопка,
 * которая не работает никогда.
 *
 * Снисходительность не распространяется на **состав**: из вывода берётся
 * только формулировка. Ни адресов, ни тегов платформ, ни идентификаторов,
 * ни обозначения версии — модель не может назвать объект системы, ей
 * нечем (раздел 5.6, пункт 3).
 */

/** Предел формулировки: столько принимает чекпоинт роадмапа. */
export const MAX_TASK_TITLE = 300;

/**
 * Элементы — строки, и только строки.
 *
 * Объект `{ title }` не принимается намеренно: это проще защищать, чем
 * строгий объект с выброшенными лишними полями — нечего «ремонтировать»
 * и невозможно случайно пропустить новое поле, уехавшее в роадмап.
 */
const outputSchema = z.object({ tasks: z.array(z.unknown()) });

/** Ведущий маркер списка: модель ставит его, несмотря на запрос JSON. */
const LIST_MARKER = /^(?:[-*•–—]|\d+[.)])\s+/;

/**
 * Превращает тело ответа модели в список формулировок.
 *
 * Пусто — законный итог, а не исключение: решение, что делать с пустым
 * разбором, принимает вызывающий, он же и отвечает отказом.
 */
export function tasksOf(raw: string, maxTasks: number): SuggestResult {
  const parsed = outputSchema.safeParse(jsonOf(raw));

  if (!parsed.success) {
    return { tasks: [], dropped: 0 };
  }

  const seen = new Set<string>();
  const titles: string[] = [];

  for (const item of parsed.data.tasks) {
    if (typeof item !== 'string') {
      continue;
    }

    const title = cleanTitle(item);
    const key = title.toLowerCase();

    if (title === '' || seen.has(key) || titles.length >= maxTasks) {
      continue;
    }

    seen.add(key);
    titles.push(title);
  }

  return {
    tasks: titles.map((title) => ({ title })),
    // Отброшенное называется числом: тихое урезание читалось бы как
    // «столько и предложили».
    dropped: parsed.data.tasks.length - titles.length,
  };
}

/**
 * Объект JSON из тела ответа либо `undefined`.
 *
 * Берётся подстрока от первой `{` до последней `}`: так снимается и
 * обёртка в заборе из кавычек, и болтовня вокруг объекта.
 */
function jsonOf(raw: string): unknown {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');

  if (start < 0 || end <= start) {
    return undefined;
  }

  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/** Чистит одну формулировку: невидимое, пробелы, маркер, предел длины. */
function cleanTitle(raw: string): string {
  const visible = [...raw].map((char) => (isInvisible(char) ? ' ' : char)).join('');
  const collapsed = visible.replace(/\s+/g, ' ').trim();

  return truncate(collapsed.replace(LIST_MARKER, '').trim());
}

/**
 * Управляющий символ или невидимый пробел.
 *
 * Такие символы заменяются пробелом, а не вырезаются: вырезанный
 * разделитель склеил бы два слова в одно, и формулировка стала бы другой.
 * Перевод строки и табуляция попадают сюда же — их всё равно сворачивает
 * общая свёртка пробелов.
 *
 * Проверка по коду, а не классом символов в регулярном выражении: класс с
 * управляющими символами пришлось бы записать их настоящими байтами, и
 * исходник стал бы для инструментов двоичным файлом.
 */
function isInvisible(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;

  return (
    code < 0x20 ||
    code === 0x7f ||
    // Неразрывный и узкий неразрывный пробелы: на вид пробел, по коду нет.
    code === 0xa0 ||
    code === 0x202f ||
    // Нулевой ширины и метки направления письма.
    (code >= 0x200b && code <= 0x200f) ||
    // Разделители строки и абзаца.
    code === 0x2028 ||
    code === 0x2029 ||
    // BOM в середине строки.
    code === 0xfeff
  );
}

/**
 * Обрезает формулировку до предела чекпоинта по границе слова.
 *
 * Границы слова может не оказаться вовсе — тогда режется по знакам:
 * предел остаётся пределом, иначе отказ пришёл бы из базы.
 */
function truncate(title: string): string {
  if (title.length <= MAX_TASK_TITLE) {
    return title;
  }

  const head = title.slice(0, MAX_TASK_TITLE);
  const boundary = head.lastIndexOf(' ');

  return boundary > 0 ? head.slice(0, boundary).trimEnd() : head;
}
