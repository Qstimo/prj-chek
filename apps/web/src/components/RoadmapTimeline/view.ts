'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import type { TimelineForm } from './types';

/** Параметр адреса с укладкой полосы. */
export const VIEW_PARAM = 'view';

/** Параметр адреса с числом показываемых версий. */
export const LAST_PARAM = 'last';

/** Параметр адреса с открытой версией. */
export const VERSION_PARAM = 'version';

/** Значение {@link LAST_PARAM}, означающее «без предела». */
const ALL = 'all';

/** Укладки в том порядке, в каком они стоят в переключателе. */
const FORMS: TimelineForm[] = ['strip', 'serpentine', 'list'];

/** Укладка из адреса. Чужое значение — как будто параметра нет. */
export function formFromParam(value: string | null): TimelineForm | undefined {
  return FORMS.find((form) => form === value);
}

/**
 * Предел из адреса: `all` — все, число — столько последних.
 *
 * Отсутствие и бессмыслица дают `undefined` — умолчание укладки: подменять
 * чужое значение нулём или единицей значило бы показать пустую полосу по
 * испорченной ссылке.
 */
export function lastFromParam(value: string | null): number | null | undefined {
  if (value === ALL) {
    return null;
  }

  if (value === null) {
    return undefined;
  }

  const count = Number(value);

  return Number.isInteger(count) && count > 0 ? count : undefined;
}

/** Вид роадмапа, прочитанный из адреса, и способ его переписать. */
export interface TimelineViewState {
  /** Укладка из адреса либо `undefined` — серпантин по умолчанию. */
  form: TimelineForm | undefined;
  /** Предел из адреса: число, `null` — все, `undefined` — умолчание. */
  last: number | null | undefined;
  /** Открытая версия либо `null`. */
  versionId: string | null;
  setForm: (form: TimelineForm) => void;
  setLast: (last: number | null) => void;
  setVersionId: (versionId: string | null) => void;
}

/**
 * Вид роадмапа живёт в адресе, а не в состоянии экрана.
 *
 * Иначе ни «покажи, где мы» ссылкой, ни кнопки «назад» у открытой панели:
 * выбранная версия была локальным `useState`, и сослаться на неё было
 * нечем. Адрес — он же источник правды: экран читает параметры, а не
 * заводит вторую копию состояния, которая разойдётся с ними.
 */
export function useTimelineView(): TimelineViewState {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = (key: string, value: string | null, isStep: boolean) => {
    const next = new URLSearchParams(params.toString());

    if (value === null) {
      next.delete(key);
    } else {
      next.set(key, value);
    }

    const query = next.toString();
    const url = query ? `${pathname}?${query}` : pathname;

    // Выбор версии — шаг в истории: «назад» закрывает панель. Укладка и
    // предел шагом не являются — иначе «назад» вместо возврата к списку
    // отщёлкивал бы переключатели по одному.
    if (isStep) {
      router.push(url, { scroll: false });
    } else {
      router.replace(url, { scroll: false });
    }
  };

  return {
    form: formFromParam(params.get(VIEW_PARAM)),
    last: lastFromParam(params.get(LAST_PARAM)),
    versionId: params.get(VERSION_PARAM),
    setForm: (form) => set(VIEW_PARAM, form, false),
    setLast: (last) => set(LAST_PARAM, last === null ? ALL : String(last), false),
    setVersionId: (versionId) => set(VERSION_PARAM, versionId, true),
  };
}
