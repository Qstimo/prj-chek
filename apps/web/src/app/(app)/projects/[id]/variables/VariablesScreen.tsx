'use client';

import {
  AccessLevel,
  Section,
  type VariableCreate,
  type VariableUpdate,
} from '@cairn/shared';
import { useState } from 'react';

import {
  useMutationCreateVariable,
  useMutationDeleteVariable,
  useMutationExportEnv,
  useMutationImportEnv,
  useMutationRevealVariable,
  useMutationRevealVersion,
  useMutationRollbackVariable,
  useMutationUpdateVariable,
  useQuerySections,
  useQueryVariables,
} from '@/api/hooks';
import { EnvTransferPanel } from '@/components/EnvTransferPanel';
import { VariableForm } from '@/components/VariableForm';
import { VariableTable } from '@/components/VariableTable';

import { VariableHistoryPanel } from './VariableHistoryPanel';
import { describeApiError } from '@/api';

/** Пропсы экрана переменных одного окружения. */
interface IProps {
  projectId: string;
  environmentId: string;
}

/** Переменные выбранного окружения: список, правка, импорт и выгрузка. */
export function VariablesScreen({ projectId, environmentId }: IProps) {
  const variables = useQueryVariables(projectId, environmentId);
  const sections = useQuerySections(projectId);
  const create = useMutationCreateVariable(projectId, environmentId);
  const update = useMutationUpdateVariable(projectId, environmentId);
  const remove = useMutationDeleteVariable(projectId, environmentId);
  const reveal = useMutationRevealVariable(projectId, environmentId);
  const revealVersion = useMutationRevealVersion(projectId, environmentId);
  const rollback = useMutationRollbackVariable(projectId, environmentId);
  const importEnv = useMutationImportEnv(projectId, environmentId);
  const exportEnv = useMutationExportEnv(projectId, environmentId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  if (variables.isPending || sections.isPending) {
    return <p className="text-muted-foreground">Загрузка…</p>;
  }

  if (variables.isError || sections.isError) {
    return (
      <p role="alert" className="text-destructive">
        Не удалось загрузить переменные.
      </p>
    );
  }

  const level = sections.data[Section.Variables];
  const canReveal = level === AccessLevel.Read || level === AccessLevel.Write;
  const canWrite = level === AccessLevel.Write;
  const editing = variables.data.find((variable) => variable.id === editingId);

  function submit(input: VariableCreate | VariableUpdate): void {
    if (editingId) {
      update.mutate(
        { id: editingId, input: input as VariableUpdate },
        { onSuccess: () => setEditingId(null) },
      );

      return;
    }

    create.mutate(input as VariableCreate, { onSuccess: () => setIsCreating(false) });
  }

  return (
    <div className="space-y-4">
      {canWrite && !isCreating && !editingId && (
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >
          Добавить переменную
        </button>
      )}

      {(isCreating || editing) && (
        <VariableForm
          initial={editing ? { key: editing.key, description: editing.description } : undefined}
          isEditing={Boolean(editing)}
          isSubmitting={create.isPending || update.isPending}
          error={describeApiError(create.error ?? update.error)}
          onSubmit={submit}
        />
      )}

      <VariableTable
        variables={variables.data}
        canReveal={canReveal}
        canWrite={canWrite}
        onReveal={(id) => reveal.mutateAsync(id)}
        onEdit={(id) => {
          setIsCreating(false);
          setEditingId(id);
        }}
        onDelete={(id) => remove.mutate(id)}
        onHistory={(id) => setHistoryId(historyId === id ? null : id)}
      />

      {historyId && (
        <VariableHistoryPanel
          projectId={projectId}
          environmentId={environmentId}
          variableId={historyId}
          canWrite={canWrite}
          onReveal={(versionNo) => revealVersion.mutateAsync({ id: historyId, versionNo })}
          onRollback={(toVersion) => rollback.mutate({ id: historyId, toVersion })}
        />
      )}

      <EnvTransferPanel
        canWrite={canWrite}
        canReveal={canReveal}
        isPending={importEnv.isPending || exportEnv.isPending}
        importResult={importEnv.data}
        error={describeApiError(importEnv.error ?? exportEnv.error)}
        onImport={(content) => importEnv.mutate(content)}
        onExport={() => exportEnv.mutateAsync()}
      />
    </div>
  );
}
