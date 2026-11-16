import type { PublicReleaseReport } from '@cairn/shared';
import { notFound } from 'next/navigation';

import { serverApiUrl } from '@/api/config';

import { PublicReportView } from './PublicReportView';

/**
 * Публичная страница отчёта по релизу: чтение по токену без входа.
 *
 * Живёт вне группы `(app)` намеренно — как и публичный роадмап: ни
 * навигации приложения, ни редиректов на вход, ни ссылок внутрь системы.
 *
 * Токен у отчёта свой: ссылка на весь роадмап раскрыла бы заодно все
 * планы, поэтому у каждой версии отдельная публикация и отдельный адрес.
 */
export default async function PublicReleaseReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Запрос без cookie: у публичного читателя нет и не должно быть сессии.
  const response = await fetch(
    `${serverApiUrl()}/public/roadmap-report/${encodeURIComponent(token)}`,
    { cache: 'no-store' },
  );

  // Мусорный токен и снятая публикация неразличимы — так и показываем.
  if (!response.ok) {
    notFound();
  }

  const report = (await response.json()) as PublicReleaseReport;

  return <PublicReportView report={report} />;
}
