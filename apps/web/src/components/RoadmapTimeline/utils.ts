import { RoadmapVersionState } from '@cairn/shared';

import { formatDate } from '@/utils';

import { FILL_MAX, FILL_MIN, LIST_WINDOW, STRIP_MAX_VERSIONS } from './constants';
import type { TimelineForm, TimelineVersion, TimelineWindow } from './types';

/**
 * Заполненность отметки: выпущенная всегда полная — выпущена, значит завершена.
 *
 * Края зажимаются (см. {@link FILL_MIN}): на больших наборах чекпоинтов
 * честная доля перестаёт различать «не начинали» и «сделали одно из трёхсот»,
 * а также «осталось одно» и «готово». Ноль и единица остаются точными — они
 * обозначают не количество, а состояние, и подменять их нельзя.
 */
export function fillOf(version: TimelineVersion): number {
  if (version.state === RoadmapVersionState.Released) {
    return 1;
  }

  if (version.progress.total === 0 || version.progress.done === 0) {
    return 0;
  }

  if (version.progress.done >= version.progress.total) {
    return 1;
  }

  const fraction = version.progress.done / version.progress.total;

  return Math.min(FILL_MAX, Math.max(FILL_MIN, fraction));
}

/** Заполненность процентами — для подписи, которую читает скринридер. */
export function percentOf(version: TimelineVersion): number {
  return Math.round(fillOf(version) * 100);
}

/**
 * Счёт чекпоинтов словами.
 *
 * Рядом с отметкой нужна точность, которой зажатая доля не даёт: «0 из 347»
 * и «чекпоинтов нет» рисуются одинаково пустым кругом, а значат разное.
 * У выпущенной версии счёта нет — под ней стоит дата релиза, и «1 из 3»
 * рядом с полным кругом противоречило бы правилу «выпущена, значит завершена».
 */
export function noteOf(version: TimelineVersion): string {
  if (version.state === RoadmapVersionState.Released) {
    return '';
  }

  if (version.progress.total === 0) {
    return 'чекпоинтов нет';
  }

  return `${version.progress.done} из ${version.progress.total}`;
}

/** Укладка по числу версий. См. {@link STRIP_MAX_VERSIONS}. */
export function formOf(count: number): TimelineForm {
  return count > STRIP_MAX_VERSIONS ? 'list' : 'strip';
}

/**
 * Видимая часть списка.
 *
 * Режется с конца: свежие версии нужнее давних. Если текущая версия в это
 * окно не попала, окно съезжает к ней — иначе роадмап с длинным хвостом
 * перестал бы показывать «вы здесь», ради чего на него и смотрят. Съезжает,
 * а не растягивается: растянутое от текущей до конца окно при текущей версии
 * в середине сотни показало бы полсотни строк и перестало быть окном.
 */
export function windowOf<T>(
  items: T[],
  currentIndex: number | null,
  isExpanded: boolean,
): TimelineWindow<T> {
  if (isExpanded || items.length <= LIST_WINDOW) {
    return { items, hidden: 0 };
  }

  const fromEnd = items.length - LIST_WINDOW;
  const start = currentIndex === null ? fromEnd : Math.min(fromEnd, Math.max(0, currentIndex));

  return { items: items.slice(start, start + LIST_WINDOW), hidden: items.length - LIST_WINDOW };
}

/**
 * Подпись даты под названием версии (спека, раздел 2).
 *
 * Выпущенная без даты — пусто: фактическая дата неизвестна, показывать
 * плановую с «ожидается» для случившегося релиза было бы ложью.
 */
export function dateLabelOf(version: TimelineVersion): string {
  const { prefix, date } = datePartsOf(version);

  return date ? `${prefix}${date}` : '';
}

/**
 * Та же подпись, разобранная на пояснение и само число.
 *
 * Ленте нужны части, а не строка: «ожидается 01.12.2026» — это 116 px при
 * шаге в 96, и целиком оно не помещается ни при каком числе версий. Две
 * строки по 57 px помещаются обе, и дата перестаёт обрезаться многоточием.
 */
export function datePartsOf(version: TimelineVersion): { prefix: string; date: string } {
  if (version.state === RoadmapVersionState.Released) {
    return { prefix: '', date: version.releasedDate ? formatDate(version.releasedDate) : '' };
  }

  return {
    prefix: 'ожидается ',
    date: version.plannedDate ? formatDate(version.plannedDate) : '',
  };
}
