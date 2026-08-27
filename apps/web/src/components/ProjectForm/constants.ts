import { ProjectLifecycle } from '@cairn/shared';

/** Подписи полей паспорта. */
export const FIELD_LABELS = {
  name: 'Название',
  purpose: 'Назначение',
  stack: 'Стек',
  repoUrl: 'Репозиторий',
  notes: 'Заметки',
  lifecycle: 'Состояние',
} as const;

/** Варианты состояния жизненного цикла. */
export const LIFECYCLE_OPTIONS: { value: ProjectLifecycle; label: string }[] = [
  { value: ProjectLifecycle.Development, label: 'В разработке' },
  { value: ProjectLifecycle.Active, label: 'Работает' },
  { value: ProjectLifecycle.Paused, label: 'Приостановлен' },
  { value: ProjectLifecycle.Archived, label: 'Архив' },
];
