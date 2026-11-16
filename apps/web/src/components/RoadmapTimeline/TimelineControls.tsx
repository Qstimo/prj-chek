'use client';

import { DEFAULT_LAST, FORM_LABELS } from './constants';
import type { TimelineForm } from './types';

/** Пропсы переключателей вида роадмапа. */
interface IProps {
  /** Действующая укладка — с учётом серпантина по умолчанию. */
  form: TimelineForm;
  /** Показаны все версии, а не последние {@link DEFAULT_LAST}. */
  isAll: boolean;
  onChangeForm: (form: TimelineForm) => void;
  onChangeLast: (last: number | null) => void;
}

/** Укладки в порядке «одна строка — змейка — перечень». */
const FORMS: TimelineForm[] = ['strip', 'serpentine', 'list'];

/**
 * Переключатель вида роадмапа: укладка и сколько версий показывать.
 *
 * Живёт в экране, а не в полосе: вид воспроизводится ссылкой, то есть
 * хранится в адресе, а адрес — дело экрана. Полоса только принимает
 * укладку и предел пропами.
 *
 * Кнопки с `aria-pressed`, а не селект: выбор из трёх значений виден
 * целиком, и переключение стоит один щелчок вместо открыть-выбрать.
 */
export function TimelineControls({ form, isAll, onChangeForm, onChangeLast }: IProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div role="group" aria-label="Вид роадмапа" className="flex items-center gap-1">
        {FORMS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === form}
            onClick={() => onChangeForm(option)}
            className={classOf(option === form)}
          >
            {FORM_LABELS[option]}
          </button>
        ))}
      </div>

      <div role="group" aria-label="Сколько версий" className="flex items-center gap-1">
        <button
          type="button"
          aria-pressed={!isAll}
          onClick={() => onChangeLast(DEFAULT_LAST)}
          className={classOf(!isAll)}
        >
          Последние {DEFAULT_LAST}
        </button>
        <button
          type="button"
          aria-pressed={isAll}
          onClick={() => onChangeLast(null)}
          className={classOf(isAll)}
        >
          Все
        </button>
      </div>
    </div>
  );
}

/** Классы кнопки: нажатая обведена цветом, прочие — обычной рамкой. */
function classOf(isPressed: boolean): string {
  return isPressed
    ? 'rounded-md border border-primary px-2 py-0.5 text-xs text-primary'
    : 'rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground';
}
