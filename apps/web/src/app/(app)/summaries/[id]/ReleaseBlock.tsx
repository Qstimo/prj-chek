'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Drawer, DrawerWidth } from '@/components/Drawer';
import { SummaryReleaseForm } from '@/components/SummaryReleaseForm';

import { SUMMARY_TEXTS } from '../constants';
import type { IReleaseProps } from './types';

/**
 * Шаг «Релиз»: версия роадмапа из черновика задач.
 *
 * После успеха шаг превращается в ссылку на версию, а кнопка исчезает:
 * чекпоинты живут в роадмапе и правятся там. Без выдачи на «Роадмап»
 * кнопка показана выключенной с объяснением — `404` от ручки ничего
 * нового субъекту не сообщил бы, у него уже есть выдача на хронику
 * (дизайн, раздел 1.4).
 */
export function ReleaseBlock({
  summary,
  blockedNote,
  isRoadmapPublic,
  onRelease,
  isReleasing,
  releaseError,
}: IReleaseProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (summary.isReleased) {
    return (
      <section className="space-y-2">
        <h2 className="text-lg font-medium">{SUMMARY_TEXTS.releaseHeading}</h2>
        <p className="text-sm text-muted-foreground">{SUMMARY_TEXTS.released}</p>

        {summary.releasedVersionId !== null && (
          <Link
            href={`/projects/${summary.projectId}/roadmap?version=${summary.releasedVersionId}`}
            className="text-sm hover:underline"
          >
            {summary.releasedVersionLabel === null
              ? 'Открыть версию в роадмапе'
              : `Версия ${summary.releasedVersionLabel} в роадмапе`}
          </Link>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-medium">{SUMMARY_TEXTS.releaseHeading}</h2>

      <button
        type="button"
        onClick={() => setIsOpen(true)}
        disabled={blockedNote !== undefined || summary.tasks.length === 0}
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
      >
        {SUMMARY_TEXTS.release}
      </button>

      {blockedNote !== undefined && (
        <p className="text-sm text-muted-foreground">{blockedNote}</p>
      )}

      <Drawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={SUMMARY_TEXTS.releaseTitle}
        width={DrawerWidth.Half}
      >
        <SummaryReleaseForm
          suggestedLabel={summary.suggestedVersionLabel}
          taskCount={summary.tasks.length}
          isRoadmapPublic={isRoadmapPublic}
          isSubmitting={isReleasing}
          error={releaseError}
          onSubmit={onRelease}
        />
      </Drawer>
    </section>
  );
}
