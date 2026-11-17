import { pluralize } from '@/utils';

/** Тексты формы релиза. */
export const RELEASE_TEXTS = {
  submit: 'Сформировать релиз',
  noSuggestion: 'Версий, из которых выводится следующее обозначение, нет — впишите своё.',
  publicWarning:
    'Роадмап проекта опубликован: новые чекпоинты попадут в публичную выдачу. Текст саммари в неё не попадает.',
} as const;

/** Подписи полей формы релиза. */
export const FIELD_LABELS = {
  label: 'Обозначение',
  plannedDate: 'Плановая дата',
} as const;

/** Сколько чекпоинтов создастся: число названо до нажатия, а не после. */
export function checkpointsNoteOf(count: number): string {
  return `Версия будет создана с ${pluralize(count, 'незакрытым чекпоинтом', 'незакрытыми чекпоинтами', 'незакрытыми чекпоинтами')}.`;
}
