'use client';

import {
  AccessLevel,
  EnvironmentKind,
  Section,
  type EnvironmentCreate,
  type EnvironmentDetail,
  type EnvironmentMetadata,
} from '@cairn/shared';
import { useState } from 'react';

import {
  useMutationCreateEnvironment,
  useMutationDeleteEnvironment,
  useMutationUpdateEnvironment,
  useQueryEnvironments,
  useQuerySections,
} from '@/api/hooks';
import { EnvironmentForm, type EnvironmentFormValues } from '@/components/EnvironmentForm';
import { EnvironmentList } from '@/components/EnvironmentList';

/** Пропсы экрана инфраструктуры. */
interface IProps {
  projectId: string;
}

/** Окружения проекта: просмотр и правка (спека 8). */
export function InfrastructureScreen({ projectId }: IProps) {
  const environments = useQueryEnvironments(projectId);
  const sections = useQuerySections(projectId);
  const create = useMutationCreateEnvironment(projectId);
  const update = useMutationUpdateEnvironment(projectId);
  const remove = useMutationDeleteEnvironment(projectId);
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
          isSubmitting={create.isPending || update.isPending}
          error={(create.error ?? update.error)?.message}
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
  return {
    name: editing?.name ?? '',
    kind: editing?.kind ?? EnvironmentKind.Production,
    host: null,
    ip: null,
    provider: null,
    specs: null,
    healthCheckUrl: null,
    notes: null,
    domains: editing?.domains ?? [],
    ...(editing && 'ip' in editing ? editing : {}),
  };
}
