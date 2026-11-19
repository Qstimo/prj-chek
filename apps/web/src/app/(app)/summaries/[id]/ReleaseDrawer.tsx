'use client';

import { Drawer, DrawerWidth } from '@/components/Drawer';
import { SummaryReleaseForm } from '@/components/SummaryReleaseForm';

import { SUMMARY_TEXTS } from '../constants';
import type { IReleaseDrawerProps } from './types';

/**
 * Панель релиза: версия роадмапа из отмеченных задач.
 *
 * Своего блока на экране у релиза больше нет — он стал действием над
 * выбором в полосе задач (дизайн, 4.3), а панель открывается нажатием и
 * помнит только то, что сказано в её форме. Отмеченные задачи приходят
 * сюда списком и уезжают в ручку вместе с целью: порядок чекпоинтов
 * задаёт `position` в базе, а не порядок отметок (дизайн, 3.6).
 *
 * Своей ссылки на уже сформированную версию здесь нет: версия у каждой
 * уехавшей задачи своя, и называет её список уехавших (дизайн, 3.6).
 */
export function ReleaseDrawer({
  isOpen,
  onClose,
  suggestedLabel,
  taskCount,
  isRoadmapPublic,
  isReleasing,
  releaseError,
  onRelease,
}: IReleaseDrawerProps) {
  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={SUMMARY_TEXTS.releaseTitle}
      width={DrawerWidth.Half}
    >
      <SummaryReleaseForm
        suggestedLabel={suggestedLabel}
        taskCount={taskCount}
        isRoadmapPublic={isRoadmapPublic}
        isSubmitting={isReleasing}
        error={releaseError}
        onSubmit={onRelease}
      />
    </Drawer>
  );
}
