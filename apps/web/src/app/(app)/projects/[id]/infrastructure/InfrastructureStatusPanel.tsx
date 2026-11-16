'use client';

import { Loader } from '@/components/Loader';
import { useState } from 'react';

import { describeApiError } from '@/api/errors';
import {
  useMutationRunChecks,
  useQueryIncidents,
  useQueryProjectStatus,
} from '@/api/hooks';
import { AddressStatusPanel } from '@/components/AddressStatusPanel';
import { StatusIndicator } from '@/components/StatusIndicator';
import { StatusOverview } from '@/components/StatusOverview';
import { WarningsPanel, WarningTone } from '@/components/WarningsPanel';
import { splitWarnings } from '@/utils';

/** Пропсы панели статуса. */
interface IProps {
  projectId: string;
  /** Запуск проверок — право суперадмина. */
  isSuperadmin: boolean;
}

/**
 * Статус адресов проекта под их окружениями (ТЗ 6). Руками не задаётся.
 *
 * Загрузка, отказ и отсутствие доступа разведены: прежде все три гасились
 * одним `return null`, и при `500` человек с доступом видел пустое место,
 * не зная, сломался статус или его просто нет.
 */
export function InfrastructureStatusPanel({ projectId, isSuperadmin }: IProps) {
  const status = useQueryProjectStatus(projectId);
  const runChecks = useMutationRunChecks();
  // Инциденты — вторая половина той же секции: пока секция не открылась,
  // спрашивать их не за чем, а прежде запрос уходил безусловно.
  const incidents = useQueryIncidents(projectId, { enabled: Boolean(status.data) });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (status.isPending) {
    return <Loader />;
  }

  if (status.isError && !status.data) {
    return (
      <p role="alert" className="text-destructive">
        Не удалось загрузить статус.
      </p>
    );
  }

  // Секции не видно: её существование не раскрывается (ТЗ 4.2), и
  // сообщать здесь нечего — экран секции объяснит сам.
  if (!status.data) {
    return null;
  }

  const { critical, attention } = splitWarnings(status.data.warnings);
  const selected = status.data.domains.find((domain) => domain.domainId === selectedId) ?? null;
  const isEmpty = status.data.environments.length === 0 && status.data.domains.length === 0;
  const running = runChecks.isPending || status.data.checkRunning === true;

  return (
    <section className="space-y-6">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">Обзор проверок</h2>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <StatusIndicator indicator={status.data.indicator} />
          {isSuperadmin && (
            <button
              type="button"
              disabled={running || status.isError}
              onClick={() => runChecks.mutate()}
              className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
            >
              {running ? 'Проверяю…' : 'Проверить сейчас'}
            </button>
          )}
        </div>
      </header>

      {running && <div className="grid grid-cols-[3rem_1fr] items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 [&_.cairn-loader]:min-h-0 [&_.cairn-loader]:py-0"><Loader label="Проверки выполняются…" /><p className="text-sm">Проверки выполняются в фоне. Результаты обновляются автоматически.</p></div>}
      {status.isError && <p role="alert" className="text-sm text-destructive">Не удалось обновить статус. Показаны ранее загруженные данные; завершение проверок пока не подтверждено.</p>}

      {runChecks.error && (
        <p role="alert" className="text-sm text-destructive">
          {describeApiError(runChecks.error) ?? 'Не удалось запустить проверки.'}
        </p>
      )}

      <WarningsPanel title="Не отвечает" tone={WarningTone.Critical} warnings={critical} />
      <WarningsPanel title="Требует внимания" warnings={attention} />
      {/* Предупреждения реестров не красят индикатор проекта и приходят
          непустыми только суперадмину: межпроектную машину и корневой
          домен правит он один, и проекту по ним делать нечего. */}
      <WarningsPanel title="Реестры" warnings={status.data.registryWarnings} />

      {isEmpty ? (
        <p className="text-muted-foreground">
          Проверять нечего: у проекта нет окружений с адресами.
        </p>
      ) : (
        <StatusOverview
          projectId={projectId}
          status={status.data}
          incidents={incidents.data}
          incidentsPending={incidents.isPending}
          incidentsError={incidents.isError}
          onSelect={setSelectedId}
        />
      )}

      <AddressStatusPanel
        projectId={projectId}
        address={selected}
        warnings={status.data.warnings}
        onClose={() => setSelectedId(null)}
      />
    </section>
  );
}
