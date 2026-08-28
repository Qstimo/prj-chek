'use client';

import {
  AccessLevel,
  Section,
  type ChronicleDetail,
  type ChronicleEntryCreate,
  type ChronicleMetadata,
} from '@cairn/shared';
import { useState } from 'react';

import {
  useMutationCreateChronicleEntry,
  useMutationCreateIntakeAddress,
  useMutationDeleteChronicleEntry,
  useMutationRevokeIntakeAddress,
  useMutationUpdateChronicleEntry,
  useQueryChronicle,
  useQueryIntakeAddress,
  useQuerySections,
} from '@/api/hooks';
import { ChronicleForm, type ChronicleFormValues } from '@/components/ChronicleForm';
import { ChronicleList } from '@/components/ChronicleList';
import { IntakeAddressPanel } from '@/components/IntakeAddressPanel';

/** Пропсы экрана хроники. */
interface IProps {
  projectId: string;
  /** Признак суперадмина: управление приёмным адресом. */
  isSuperadmin: boolean;
}

/** Лента хроники и приёмный адрес проекта (спека 8). */
export function ChronicleScreen({ projectId, isSuperadmin }: IProps) {
  const chronicle = useQueryChronicle(projectId);
  const sections = useQuerySections(projectId);
  const address = useQueryIntakeAddress(projectId);
  const create = useMutationCreateChronicleEntry(projectId);
  const update = useMutationUpdateChronicleEntry(projectId);
  const remove = useMutationDeleteChronicleEntry(projectId);
  const createAddress = useMutationCreateIntakeAddress(projectId);
  const revokeAddress = useMutationRevokeIntakeAddress(projectId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  if (chronicle.isPending || sections.isPending) {
    return <p className="text-muted-foreground">Загрузка…</p>;
  }

  if (chronicle.isError || sections.isError) {
    return (
      <p role="alert" className="text-destructive">
        Не удалось загрузить хронику.
      </p>
    );
  }

  const canWrite = sections.data[Section.Chronicle] === AccessLevel.Write;
  const editing = chronicle.data.find((entry) => entry.id === editingId);

  function submit(input: ChronicleEntryCreate): void {
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
          Добавить запись
        </button>
      )}

      {(isCreating || editing) && (
        <ChronicleForm
          initial={formValuesOf(editing)}
          isSubmitting={create.isPending || update.isPending}
          error={(create.error ?? update.error)?.message}
          onSubmit={submit}
        />
      )}

      <ChronicleList
        entries={chronicle.data}
        canWrite={canWrite}
        onEdit={(id) => {
          setIsCreating(false);
          setEditingId(id);
        }}
        onDelete={(id) => remove.mutate(id)}
      />

      {canWrite && (
        <IntakeAddressPanel
          address={address.data ?? null}
          isSuperadmin={isSuperadmin}
          isPending={createAddress.isPending || revokeAddress.isPending}
          onCreate={() => createAddress.mutate()}
          onRevoke={() => revokeAddress.mutate()}
        />
      )}
    </div>
  );
}

/** Собирает значения формы из записи либо даёт пустые для создания. */
function formValuesOf(
  editing: ChronicleMetadata | ChronicleDetail | undefined,
): ChronicleFormValues {
  return {
    occurredOn: editing?.occurredOn ?? new Date().toISOString().slice(0, 10),
    title: editing?.title ?? '',
    content: editing && 'content' in editing ? editing.content : '',
  };
}
