import type { RoadmapProgress, RoadmapVersionState } from '@cairn/shared';

/** Версия на диаграмме: только то, что нужно отметке и подписи. */
export interface TimelineVersion {
  id: string;
  label: string;
  state: RoadmapVersionState;
  plannedDate: string | null;
  releasedDate: string | null;
  progress: RoadmapProgress;
  unfinished?: number;
  hasUnfinishedOnRelease?: boolean;
}

/**
 * Укладка полосы.
 *
 * `strip` — лента отметок в одну строку, `serpentine` — та же лента,
 * сложенная змейкой по измеренной ширине места, `list` — вертикальный
 * список строк.
 *
 * Укладку выбирает человек: переключатель живёт в экране, а число версий
 * задаёт лишь умолчание (см. `formOf`). Прежде форму диктовал объём, и
 * роадмап из одиннадцати версий было нечем показать картой.
 */
export type TimelineForm = 'strip' | 'serpentine' | 'list';

/** Видимая часть набора версий и сколько осталось за окном. */
export interface TimelineWindow<T> {
  items: T[];
  hidden: number;
  /**
   * Номер первого показанного в исходном наборе.
   *
   * Отдаётся наружу, потому что окно умеет съезжать к текущей версии:
   * считать позицию как «отрезано с конца» нельзя — у съехавшего окна
   * номера расходятся с набором, и метка «вы здесь» не достаётся никому.
   */
  start: number;
}

/** Место версии в сетке серпантина. */
export interface TimelineCell {
  /** Строка серпантина, с нуля. */
  row: number;
  /** Столбец сетки CSS, с единицы: первый занят коленом поворота. */
  gridColumn: number;
  /** Строка сетки CSS, с единицы: строки версий чередуются с поворотами. */
  gridRow: number;
  /** Строка идёт справа налево, и соседи версии лежат наоборот. */
  isReversed: boolean;
}

/** Перемычка-колено между двумя строками серпантина. */
export interface TimelineKnee {
  side: 'left' | 'right';
  gridColumn: number;
  /** Первая из трёх строк сетки, которые занимает колено. */
  gridRow: number;
}

/** Раскладка серпантина целиком. */
export interface TimelinePlan {
  /** Сколько версий умещается в строку. */
  columns: number;
  /** Сколько строк вышло. */
  rows: number;
  /** Место каждой версии окна по порядку. */
  cells: TimelineCell[];
  knees: TimelineKnee[];
}

/** Пропсы диаграммы роадмапа. */
export interface IProps {
  /** Версии по порядку последовательности. */
  versions: TimelineVersion[];
  /** Индекс текущей версии (0-based) либо null. */
  currentIndex: number | null;
  /** Укладка. Без неё — серпантин. */
  form?: TimelineForm;
  /**
   * Сколько последних версий показывать: число — столько, `null` — все,
   * без пропа — умолчание укладки.
   */
  last?: number | null;
  /** Меняет предел у владельца вида; на экранах он хранится в URL. */
  onChangeLast?: (last: number | null) => void;
  /** Клик по версии. Отсутствие — диаграмма статична. */
  onSelect?: (versionId: string) => void;
}
