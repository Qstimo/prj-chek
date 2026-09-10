'use client';

/** Пропсы подтверждения удаления домена. */
interface IProps {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Подтверждение удаления корня.
 *
 * Своё, а не браузерный `confirm()`: модальный диалог браузера блокирует
 * страницу целиком и не поддаётся ни тестам, ни автоматизации.
 */
export function DeleteConfirmDialog({ name, onConfirm, onCancel }: IProps) {
  return (
    <div
      role="dialog"
      aria-label="Подтверждение удаления"
      className="rounded-md border border-border p-4"
    >
      <p>Удалить домен «{name}» из реестра? Срок продления перестанет отслеживаться.</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="rounded-md bg-destructive px-3 py-1 text-destructive-foreground"
          onClick={onConfirm}
        >
          Да, удалить
        </button>
        <button
          type="button"
          className="rounded-md border border-border px-3 py-1"
          onClick={onCancel}
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
