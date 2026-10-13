'use client';

/** Пропсы кнопки сохранения черновика. */
interface IProps {
  canSave: boolean;
  isSaving: boolean;
  onSave: () => void;
}

/**
 * Кнопка сохранения черновика версии — в шапке панели.
 *
 * Наверху, а не под формой: паспорт, платформы и чекпоинты вместе длиннее
 * экрана, и кнопка в конце требовала бы прокрутки до упора. Пока нечего
 * сохранять, кнопка спит — она же и есть признак несохранённого.
 */
export function SaveButton({ canSave, isSaving, onSave }: IProps) {
  return (
    <button
      type="button"
      disabled={!canSave || isSaving}
      onClick={onSave}
      className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50"
    >
      {isSaving ? 'Сохранение…' : 'Сохранить'}
    </button>
  );
}
