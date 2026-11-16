'use client';

import { describeApiError } from '@/api';
import {
  useMutationPublishReport,
  useMutationUnpublishReport,
  useQueryReportLink,
} from '@/api/hooks';
import { ReportLinkPanel } from '@/components/ReleaseReport';

/** Пропсы блока публичной ссылки на отчёт. */
interface IProps {
  projectId: string;
  versionId: string;
  isSuperadmin: boolean;
}

/**
 * Публичная ссылка на отчёт: собирает запрос и мутации публикации.
 *
 * Отдельный связующий слой, как у ссылки роадмапа: панель остаётся
 * презентационной, и её поведение проверяется без поднятого кэша запросов.
 */
export function ReportPublicLink({ projectId, versionId, isSuperadmin }: IProps) {
  const link = useQueryReportLink(projectId, versionId);
  const publish = useMutationPublishReport(projectId, versionId);
  const unpublish = useMutationUnpublishReport(projectId, versionId);

  return (
    <ReportLinkPanel
      link={link.data ?? null}
      isSuperadmin={isSuperadmin}
      isPending={publish.isPending || unpublish.isPending}
      onPublish={() => publish.mutate()}
      onUnpublish={() => unpublish.mutate()}
      error={describeApiError(publish.error ?? unpublish.error)}
    />
  );
}
