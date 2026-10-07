'use client';

import { DeleteVersionButton } from './DeleteVersionButton';

/** Пропсы органов правки версии. */
interface IProps {
  onEdit: () => void;
  onDelete: () => void;
}

/** Кнопки правки и удаления версии. Вынесены, чтобы панель осталась короткой. */
export function VersionActions({ onEdit, onDelete }: IProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={onEdit} className="rounded-md border px-3 py-1 text-sm">
        Редактировать
      </button>
      <DeleteVersionButton onDelete={onDelete} />
    </div>
  );
}
