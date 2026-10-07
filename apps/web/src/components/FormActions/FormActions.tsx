import { FormError } from '../FormError';
import type { IProps } from './types';

/**
 * Панель действий формы, прилипшая к низу выезжающей панели.
 *
 * Паспорт проекта и окружение длиннее экрана, и кнопка в конце документа
 * заставляла бы прокручивать до упора, чтобы сохранить. Прилипшая полоса
 * держит действие под рукой и оставляет рядом с ним отказ сервера.
 *
 * Отрицательные поля гасят внутренний отступ панели (`p-6` у `Drawer`):
 * полоса доходит до её краёв, а не висит в воздухе. Отсюда и связь
 * с панелью — прилипающий вариант рассчитан на форму внутри `Drawer`.
 */
export function FormActions({
  submitLabel,
  canSubmit,
  isSubmitting = false,
  onCancel,
  error,
  isSticky = true,
}: IProps) {
  const stickyClassName = isSticky
    ? 'sticky bottom-0 -mx-6 -mb-6 border-t border-border bg-background px-6 py-4'
    : '';

  return (
    <div className={`flex flex-wrap items-center gap-3 ${stickyClassName}`}>
      <button
        type="submit"
        disabled={!canSubmit}
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
      >
        {isSubmitting ? 'Сохранение…' : submitLabel}
      </button>

      {onCancel && (
        <button type="button" onClick={onCancel} className="rounded-md border px-3 py-2 text-sm">
          Отмена
        </button>
      )}

      <FormError message={error} />
    </div>
  );
}
