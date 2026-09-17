'use client';

import { useMutationRunChecks, useQueryProjectStatus } from '@/api/hooks';
import { StatusByEnvironment } from '@/components/StatusByEnvironment';
import { StatusIndicator } from '@/components/StatusIndicator';
import { WarningsPanel } from '@/components/WarningsPanel';

/** Пропсы панели статуса. */
interface IProps {
  projectId: string;
  /** Запуск проверок — право суперадмина. */
  isSuperadmin: boolean;
}

/** Статус адресов проекта под их окружениями (ТЗ 6). Руками не задаётся. */
export function InfrastructureStatusPanel({ projectId, isSuperadmin }: IProps) {
  const status = useQueryProjectStatus(projectId);
  const runChecks = useMutationRunChecks();

  if (status.isPending || status.isError || !status.data) {
    return null;
  }

  return (
    <section className="space-y-3 rounded-md border border-border p-4">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium">Статус</h2>
        <div className="flex items-center gap-3">
          <StatusIndicator indicator={status.data.indicator} />
          {isSuperadmin && (
            <button
              type="button"
              disabled={runChecks.isPending}
              onClick={() => runChecks.mutate()}
              className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
            >
              {runChecks.isPending ? 'Проверяю…' : 'Проверить сейчас'}
            </button>
          )}
        </div>
      </header>

      <WarningsPanel warnings={status.data.warnings} />

      <StatusByEnvironment
        environments={status.data.environments}
        addresses={status.data.domains}
      />
    </section>
  );
}
