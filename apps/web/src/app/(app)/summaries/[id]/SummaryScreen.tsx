'use client';

import { useQuerySummaries } from '@/api/hooks';
import { Loader } from '@/components/Loader';

import { SUMMARY_TEXTS } from '../constants';
import { SummaryBody } from './SummaryBody';
import type { IProps } from './types';

/**
 * Экран одного саммари.
 *
 * Проект берётся из сводной выдачи `GET /summaries`, а не из адреса:
 * деталь живёт под проектом (`/projects/:projectId/summaries/:id`), потому
 * что там же живёт проверка права, а в адресе экрана проекта нет. Нет
 * строки в сводной выдаче — показывать нечего, и это тот же ответ, что
 * дал бы сервер: существование чужого саммари не раскрывается.
 */
export function SummaryScreen({ summaryId }: IProps) {
  const summaries = useQuerySummaries();

  if (summaries.isPending) {
    return <Loader size="page" />;
  }

  if (summaries.isError) {
    return (
      <p role="alert" className="text-destructive">
        {SUMMARY_TEXTS.loadFailed}
      </p>
    );
  }

  const item = summaries.data.find((candidate) => candidate.id === summaryId);

  if (!item) {
    return <p className="text-sm text-muted-foreground">{SUMMARY_TEXTS.notFound}</p>;
  }

  return <SummaryBody projectId={item.projectId} summaryId={summaryId} />;
}
