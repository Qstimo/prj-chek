'use client';

import { HealthState } from '@cairn/shared';

import { useMutationRunChecks, useQueryProjectStatus } from '@/api/hooks';
import { StatusIndicator } from '@/components/StatusIndicator';
import { WarningsPanel } from '@/components/WarningsPanel';

/** Пропсы панели статуса. */
interface IProps {
  projectId: string;
  /** Запуск проверок — право суперадмина. */
  isSuperadmin: boolean;
}

/** Статус окружений и доменов проекта (ТЗ 6). Руками не задаётся. */
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

      <ul className="space-y-1 text-sm">
        {status.data.environments.map((environment) => (
          <li key={environment.environmentId}>
            <span className="font-medium">{environment.name}</span>:{' '}
            {environment.health === null
              ? 'не проверялось'
              : environment.health === HealthState.Up
                ? `работает${environment.latencyMs !== null ? `, ${environment.latencyMs} мс` : ''}`
                : `не отвечает (${environment.error ?? 'без причины'})`}
          </li>
        ))}
        {status.data.domains.map((domain) => (
          <li key={domain.domainId}>
            <span className="font-medium">{domain.name}</span>:{' '}
            {domain.tlsError
              ? `TLS: ${domain.tlsError}`
              : domain.tlsValidTo
                ? `TLS до ${domain.tlsValidTo.slice(0, 10)}`
                : 'TLS не проверялся'}
            {'; '}
            {domain.registryError
              ? `регистрация: ${domain.registryError}`
              : domain.registryExpiresAt
                ? `регистрация до ${domain.registryExpiresAt.slice(0, 10)}`
                : 'срок регистрации не проверялся'}
          </li>
        ))}
      </ul>
    </section>
  );
}
