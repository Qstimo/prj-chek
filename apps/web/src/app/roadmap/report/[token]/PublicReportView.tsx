'use client';

import type { PublicReleaseReport } from '@cairn/shared';

import { ReleaseReport } from '@/components/ReleaseReport';

/** Пропсы публичного представления отчёта. */
interface IProps {
  report: PublicReleaseReport;
}

/**
 * Публичное представление отчёта по релизу.
 *
 * Ни одной ссылки внутрь системы: страница живёт вне группы `(app)`, и
 * навигации приложения, входа и адресов задач во внешнем трекере на ней
 * нет. Последнее — не решение разметки, а свойство выдачи: у публичного
 * отчёта поля `url` у чекпоинтов нет вовсе.
 *
 * Разметка та же, что на внутренней странице: состав отчёта один, и текст
 * для копирования приходит готовым с сервера — внутренний и публичный
 * совпадают побайтово.
 */
export function PublicReportView({ report }: IProps) {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">{report.projectName} — отчёт по релизу</h1>
      <ReleaseReport report={report} />
    </main>
  );
}
