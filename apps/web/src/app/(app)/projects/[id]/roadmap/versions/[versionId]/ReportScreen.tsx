'use client';

import { Loader } from '@/components/Loader';
import Link from 'next/link';

import { describeApiError } from '@/api';
import { useQueryReport } from '@/api/hooks';
import { ReleaseReport } from '@/components/ReleaseReport';

import { ReportPublicLink } from './ReportPublicLink';

/** Пропсы страницы отчёта по релизу. */
interface IProps {
  projectId: string;
  versionId: string;
  /** Публикация отчёта наружу — право суперадмина. */
  isSuperadmin: boolean;
}

/**
 * Отчёт по релизу версии: состав, копирование, публичная ссылка.
 *
 * Уровня доступа экран не спрашивает: отчёт отдаётся с уровня «чтение», и
 * удавшийся запрос уже означает право его видеть. Вторая проверка в
 * интерфейсе разошлась бы с проверкой на выборке, которая и есть
 * единственная (ТЗ 4.1).
 *
 * Загрузка, отказ и содержимое разведены: панель статуса однажды гасила
 * первые два одним `return null`, и человек с доступом не видел ничего.
 */
export function ReportScreen({ projectId, versionId, isSuperadmin }: IProps) {
  const report = useQueryReport(projectId, versionId);

  if (report.isPending) {
    return <Loader />;
  }

  if (report.isError) {
    return (
      <p role="alert" className="text-destructive">
        Не удалось загрузить отчёт. {describeApiError(report.error)}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <ReleaseReport report={report.data} />

      {/*
        Путь к правке: паспорт версии и чекпоинты правятся в панели
        роадмапа, и отчёт обязан вести туда — адрес открытой панели это
        умеет (`?version=<id>`).
      */}
      <p className="text-sm">
        <Link href={`/projects/${projectId}/roadmap?version=${versionId}`} className="underline">
          Открыть версию в роадмапе
        </Link>
      </p>

      <ReportPublicLink
        projectId={projectId}
        versionId={versionId}
        isSuperadmin={isSuperadmin}
      />
    </div>
  );
}
