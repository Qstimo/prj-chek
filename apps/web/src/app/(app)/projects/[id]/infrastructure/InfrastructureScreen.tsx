'use client';

import { AccessLevel, Section } from '@cairn/shared';
import { useState } from 'react';

import {
  useMutationDeleteEnvironment,
  useQueryDomains,
  useQueryEnvironments,
  useQueryPlatforms,
  useQuerySections,
  useQueryServers,
} from '@/api/hooks';
import { EnvironmentList } from '@/components/EnvironmentList';

import { EnvironmentPanel } from './EnvironmentPanel';
import { sharedFormProps } from './utils';

/** Пропсы экрана инфраструктуры. */
interface IProps {
  projectId: string;
  /** Привязку окружения к машине задаёт только суперадмин (спека этапа 9, раздел 3). */
  isSuperadmin: boolean;
}

/** Окружения проекта: список и две выезжающие панели (спека 8). */
export function InfrastructureScreen({ projectId, isSuperadmin }: IProps) {
  const environments = useQueryEnvironments(projectId);
  const sections = useQuerySections(projectId);
  const remove = useMutationDeleteEnvironment(projectId);
  // Признаки доступа к реестрам объяснены в `sharedFormProps`. Предикат
  // платформ терпит незагруженные уровни: хук вызывается до раннего
  // возврата по `isPending`.
  const servers = useQueryServers({ enabled: isSuperadmin });
  const domains = useQueryDomains({ enabled: isSuperadmin });
  const platforms = useQueryPlatforms(projectId, {
    enabled: sections.data?.[Section.Info] !== undefined,
  });
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
  const shared = sharedFormProps({
    isSuperadmin,
    servers: servers.data,
    domains: domains.data,
    platforms: platforms.data,
  });

  return (
    <div className="space-y-4">
      {canWrite && (
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >
          Добавить окружение
        </button>
      )}

      <EnvironmentPanel
        projectId={projectId}
        environment={editing ?? null}
        isOpen={isCreating || editing !== undefined}
        onClose={() => {
          setIsCreating(false);
          setEditingId(null);
        }}
        {...shared}
      />

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
