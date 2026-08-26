/**
 * Строит слаг проекта из названия.
 *
 * Слаг задаётся один раз при создании и потом не меняется, чтобы ссылки
 * не ломались (спека 4.4). Уникальность обеспечивает вызывающий код.
 */
export function generateSlug(name: string): string {
  const transliterated = name
    .toLowerCase()
    .split('')
    .map((char) => TRANSLITERATION[char] ?? char)
    .join('');

  const slug = transliterated
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || FALLBACK_SLUG;
}

/** Запасной слаг для названий без пригодных символов. */
const FALLBACK_SLUG = 'proekt';

/** Таблица транслитерации кириллицы. */
const TRANSLITERATION: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh',
  з: 'z', и: 'i', й: 'j', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c',
  ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
  я: 'ya',
};
