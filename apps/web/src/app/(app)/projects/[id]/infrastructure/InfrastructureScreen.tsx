'use client';

import {
  AccessLevel,
  EnvironmentKind,
  Section,
  type EnvironmentCreate,
  type DomainRow,
  type EnvironmentDetail,
  type EnvironmentMetadata,
} from '@cairn/shared';
import { useState } from 'react';

import {
  useMutationCreateEnvironment,
  useMutationDeleteEnvironment,
  useMutationUpdateEnvironment,
  useQueryEnvironments,
  useQueryDomains,
  useQuerySections,
  useQueryServers,
} from '@/api/hooks';
import { EnvironmentForm, type EnvironmentFormValues } from '@/components/EnvironmentForm';
import { EnvironmentList } from '@/components/EnvironmentList';
import { describeApiError } from '@/api';

/** Пропсы экрана инфраструктуры. */
interface IProps {
  projectId: string;
  /** Привязку окружения к машине задаёт только суперадмин (спека этапа 9, раздел 3). */
  isSuperadmin: boolean;
}

/** Окружения проекта: просмотр и правка (спека 8). */
export function InfrastructureScreen({ projectId, isSuperadmin }: IProps) {
  const environments = useQueryEnvironments(projectId);
  const sections = useQuerySections(projectId);
  const create = useMutationCreateEnvironment(projectId);
  const update = useMutationUpdateEnvironment(projectId);
  const remove = useMutationDeleteEnvironment(projectId);
  // Реестр машин запрашивается только суперадмином: остальным API ответит
  // отказом, а список ему всё равно не показывается.
  const servers = useQueryServers({ enabled: isSuperadmin });
  // Реестр адресов — тем же признаком и по той же причине: подрядчику он
  // раскрыл бы чужие адреса, а через них — существование чужих проектов.
  const domains = useQueryDomains({ enabled: isSuperadmin });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  if (environments.isPending || sections.isPending) {
    return <p className="text-muted-foreground">Загрузка…</p>;
  }

  if (environments.isError || sections.isError) {
    return (
      <p role="alert" className="text-destructive">
        Не удалось загрузить окружения.
      </p>
    );
  }

  const canWrite = sections.data[Section.Infrastructure] === AccessLevel.Write;
  const editing = environments.data.find((environment) => environment.id === editingId);

  function submit(input: EnvironmentCreate): void {
    if (editingId) {
      update.mutate({ id: editingId, input }, { onSuccess: () => setEditingId(null) });

      return;
    }

    create.mutate(input, { onSuccess: () => setIsCreating(false) });
  }

  return (
    <div className="space-y-4">
      {canWrite && !isCreating && !editingId && (
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >
          Добавить окружение
        </button>
      )}

      {(isCreating || editing) && (
        <EnvironmentForm
          initial={formValuesOf(editing)}
          servers={servers.data ?? []}
          canAssignServer={isSuperadmin}
          knownDomains={isSuperadmin ? knownAddressesOf(domains.data ?? []) : undefined}
          isSubmitting={create.isPending || update.isPending}
          error={describeApiError(create.error ?? update.error)}
          onSubmit={submit}
        />
      )}

      <EnvironmentList
        environments={environments.data}
        canWrite={canWrite}
        onEdit={(id) => {
          setIsCreating(false);
          setEditingId(id);
        }}
        onDelete={(id) => remove.mutate(id)}
      />
    </div>
  );
}

/** Собирает значения формы из окружения либо даёт пустые для создания. */
function formValuesOf(
  editing: EnvironmentMetadata | EnvironmentDetail | undefined,
): EnvironmentFormValues {
  const detail = editing && 'server' in editing ? editing : null;

  return {
    name: editing?.name ?? '',
    kind: editing?.kind ?? EnvironmentKind.Production,
    serverId: detail?.server?.id ?? null,
    serverName: detail?.server?.name ?? null,
    healthCheckPath: detail?.healthCheckPath ?? null,
    notes: detail?.notes ?? null,
    domains: editing?.domains ?? [],
  };
}

/**
 * Известные адреса для подсказки: корни реестра и растущие из них имена.
 *
 * Корни тоже годятся в адрес окружения — прод часто отвечает по самому
 * `example.com`. Повторы отсекаются: тогда корень попал бы в список дважды.
 */
function knownAddressesOf(domains: DomainRow[]): string[] {
  const names = domains.flatMap((domain) => [
    domain.name,
    ...domain.subdomains.map((subdomain) => subdomain.name),
  ]);

  return [...new Set(names)].sort();
}
