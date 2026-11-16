import type { SummaryTask, SummaryTasksReplace } from '@cairn/shared';

/**
 * Строка черновика в памяти редактора.
 *
 * `id` отсутствует у строки, набранной здесь и ещё не сохранённой:
 * именно так её отличает сервер. `key` нужен только React — у новых
 * строк нет ничего устойчивого, а индекс при перестановках переиспользовал
 * бы состояние чужого поля.
 */
export interface IDraftTask {
  key: string;
  id?: string;
  title: string;
  /** Пришла от модели: строка несёт метку «предложено моделью». */
  isFromModel: boolean;
}

/** Пропсы одной строки черновика. */
export interface IRowProps {
  task: IDraftTask;
  /** Первая строка не поднимается, последняя не опускается. */
  isFirst: boolean;
  isLast: boolean;
  /** Релиз сформирован: правка ушла в роадмап. */
  isReadOnly: boolean;
  /** Поставить фокус при появлении: только у строки, добавленной руками. */
  shouldFocus: boolean;
  onChange: (title: string) => void;
  onMove: (step: number) => void;
  onRemove: () => void;
}

/** Пропсы редактора черновика. */
export interface IProps {
  /** Загруженный набор: от него считается `isDirty`. */
  tasks: SummaryTask[];
  /** Сохранение целиком: порядок задаёт порядок массива. */
  onSave: (input: SummaryTasksReplace) => void;
  /**
   * Релиз сформирован: редактор только для чтения.
   *
   * Чекпоинты живут в роадмапе и правятся там; вторая дверь к ним
   * разошлась бы с первой.
   */
  isReleased?: boolean;
  /** Сохранение в процессе. */
  isSaving?: boolean;
  /** Отказ сервера рядом с кнопкой. */
  error?: string;
}
