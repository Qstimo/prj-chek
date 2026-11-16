import { RoadmapVersionState } from '@cairn/shared';

import { formatDate } from '@/utils';

import {
  DEFAULT_COLUMNS,
  FILL_MAX,
  FILL_MIN,
  KNEE_HEIGHT,
  LIST_WINDOW,
  SLOT_HEIGHT,
  STEP,
  TURN_WIDTH,
  WINDOW_SIZES,
} from './constants';
import type {
  TimelineCell,
  TimelineForm,
  TimelineKnee,
  TimelinePlan,
  TimelineVersion,
  TimelineWindow,
} from './types';

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

/**
 * Основная укладка — серпантин при любом числе версий.
 * Полосу и список человек выбирает переключателем.
 */
export function formOf(_count: number): TimelineForm {
  return 'serpentine';
}

/**
 * Размер окна: сколько последних версий показывать.
 *
 * `null` — все: предела нет. Отсутствие — умолчание укладки: лента и
 * серпантин смотрят на последние десять, список — на двадцать строк.
 */
export function windowSizeOf(form: TimelineForm, last: number | null | undefined): number {
  if (last === null) {
    return Number.POSITIVE_INFINITY;
  }

  if (last === undefined) {
    return WINDOW_SIZES[form];
  }

  return Math.max(1, Math.trunc(last));
}

/**
 * Видимая часть списка.
 *
 * Режется с конца: свежие версии нужнее давних. Если текущая версия в это
 * окно не попала, окно съезжает к ней — иначе роадмап с длинным хвостом
 * перестал бы показывать «вы здесь», ради чего на него и смотрят. Съезжает,
 * а не растягивается: растянутое от текущей до конца окно при текущей версии
 * в середине сотни показало бы полсотни строк и перестало быть окном.
 *
 * Отдаётся и начало окна: раз оно умеет съезжать, вычислить его снаружи
 * по размеру набора нельзя.
 */
export function windowOf<T>(
  items: T[],
  currentIndex: number | null,
  isExpanded: boolean,
  size: number = LIST_WINDOW,
): TimelineWindow<T> {
  if (isExpanded || items.length <= size) {
    return { items, hidden: 0, start: 0 };
  }

  const fromEnd = items.length - size;
  const start = currentIndex === null ? fromEnd : Math.min(fromEnd, Math.max(0, currentIndex));

  return { items: items.slice(start, start + size), hidden: items.length - size, start };
}

/**
 * Сколько версий умещается в строку серпантина.
 *
 * По измеренной ширине места, а не по зашитому порогу: внутренний экран
 * даёт 976 px, публичная страница — 720, и выведенное из первой число
 * уводило вторую в прокрутку. Ноль означает «ещё не измерено» — в этом
 * случае берётся умолчание, а не нулевая строка.
 */
export function columnsFor(width: number): number {
  if (width <= 0) {
    return DEFAULT_COLUMNS;
  }

  return Math.max(1, Math.floor((width - TURN_WIDTH * 2) / STEP));
}

/**
 * Раскладка серпантина: место каждой версии и перемычки между строками.
 *
 * Строки чередуют направление, поэтому место версии задаётся столбцом
 * явно: переносом строк змейку не выразить, а разворот направления через
 * CSS развернул бы заодно и подписи. Строки версий чередуются в сетке со
 * строками поворота, и перемычка занимает три строки сетки подряд —
 * строку, поворот и следующую строку, — соединяя центры отметок.
 */
export function serpentinePlan(count: number, columns: number): TimelinePlan {
  const safeColumns = Math.max(1, columns);
  const cells: TimelineCell[] = [];

  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / safeColumns);
    const offset = index % safeColumns;
    const isReversed = row % 2 === 1;
    const column = isReversed ? safeColumns - 1 - offset : offset;

    // Первый столбец сетки — поворот, поэтому версии начинаются со второго.
    cells.push({ row, isReversed, gridColumn: column + 2, gridRow: row * 2 + 1 });
  }

  const rows = Math.max(1, Math.ceil(count / safeColumns));
  const knees: TimelineKnee[] = [];

  for (let row = 0; row + 1 < rows; row += 1) {
    const side = row % 2 === 0 ? 'right' : 'left';

    knees.push({
      side,
      gridColumn: side === 'right' ? safeColumns + 2 : 1,
      gridRow: row * 2 + 1,
    });
  }

  return { columns: safeColumns, rows, cells, knees };
}

/** Столбцы сетки серпантина: крайние под колено, остальные шагом оси. */
export function columnsTemplate(columns: number): string {
  return `${TURN_WIDTH}px repeat(${columns}, ${STEP}px) ${TURN_WIDTH}px`;
}

/** Строки сетки серпантина: строки версий через строки поворота. */
export function rowsTemplate(rows: number): string {
  return Array.from({ length: Math.max(1, rows) }, () => `${SLOT_HEIGHT}px`).join(
    ` ${KNEE_HEIGHT}px `,
  );
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
