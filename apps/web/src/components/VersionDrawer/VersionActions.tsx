'use client';

import { DeleteVersionButton } from './DeleteVersionButton';

/** Пропсы органов правки версии. */
interface IProps {
  onDelete: () => void;
}

/**
 * Удаление версии внизу панели.
 *
 * Кнопки «Редактировать» здесь больше нет: поля паспорта правятся на
 * месте, и переход в режим правки был третьей манерой поведения в одной
 * панели. Удаление осталось отдельным действием — его нечем отменить.
 */
export function VersionActions({ onDelete }: IProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <DeleteVersionButton onDelete={onDelete} />
    </div>
  );
}
