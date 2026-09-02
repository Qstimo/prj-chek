import { ProjectLifecycle } from '@cairn/shared';

/** Названия состояний жизненного цикла на русском. */
export const LIFECYCLE_LABELS: Record<ProjectLifecycle, string> = {
  [ProjectLifecycle.Development]: 'В разработке',
  [ProjectLifecycle.Active]: 'Работает',
  [ProjectLifecycle.Paused]: 'Приостановлен',
  [ProjectLifecycle.Archived]: 'Архив',
};

/** Оформление состояний. Приостановленный намеренно нейтрален, не тревожен. */
export const LIFECYCLE_STYLES: Record<ProjectLifecycle, string> = {
  [ProjectLifecycle.Development]: 'bg-muted text-muted-foreground',
  [ProjectLifecycle.Active]: 'bg-accent-soft text-accent-soft-foreground',
  [ProjectLifecycle.Paused]: 'bg-muted text-muted-foreground',
  [ProjectLifecycle.Archived]: 'bg-muted text-muted-foreground',
};
