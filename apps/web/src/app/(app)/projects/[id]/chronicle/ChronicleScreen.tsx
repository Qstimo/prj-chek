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
  useMutationCreateCheckpoint,
  useMutationCreateChronicleEntry,
  useMutationCreateDocPage,
  useMutationCreateIntakeAddress,
  useMutationDeleteChronicleEntry,
  useMutationRevokeIntakeAddress,
  useMutationUpdateChronicleEntry,
  useQueryChronicle,
  useQueryIntakeAddress,
  useQueryRoadmap,
  useQuerySections,
} from '@/api/hooks';
import { ChronicleForm, type ChronicleFormValues } from '@/components/ChronicleForm';
import { ChronicleList } from '@/components/ChronicleList';
import { IntakeAddressPanel } from '@/components/IntakeAddressPanel';
import { PromoteToCheckpoint } from '@/components/PromoteToCheckpoint';
import { PromoteToDoc } from '@/components/PromoteToDoc';

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
  const createCheckpoint = useMutationCreateCheckpoint(projectId);
  const createDocPage = useMutationCreateDocPage(projectId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [promoting, setPromoting] = useState<{ id: string; title: string } | null>(null);
  const [promotingToDoc, setPromotingToDoc] = useState<{ title: string; content: string } | null>(
    null,
  );

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
  const canPromote = sections.data[Section.Roadmap] === AccessLevel.Write;
  const canPromoteToDoc = sections.data[Section.Docs] === AccessLevel.Write;
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

      {promoting && (
        <PromotePanel
          projectId={projectId}
          entryTitle={promoting.title}
          isSubmitting={createCheckpoint.isPending}
          onSubmit={(versionId, title) =>
            createCheckpoint.mutate(
              { versionId, input: { title } },
              { onSuccess: () => setPromoting(null) },
            )
          }
          onCancel={() => setPromoting(null)}
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
        onPromote={canPromote ? (id, title) => setPromoting({ id, title }) : undefined}
        onPromoteToDoc={
          canPromoteToDoc
            ? (_id, title, content) => setPromotingToDoc({ title, content })
            : undefined
        }
      />

      {promotingToDoc && (
        <PromoteToDoc
          entryTitle={promotingToDoc.title}
          entryContent={promotingToDoc.content}
          isSubmitting={createDocPage.isPending}
          error={createDocPage.error?.message}
          onSubmit={(input) =>
            createDocPage.mutate(input, { onSuccess: () => setPromotingToDoc(null) })
          }
          onCancel={() => setPromotingToDoc(null)}
        />
      )}

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

/** Пропсы панели поднятия: версии загружаются только когда панель открыта. */
interface PromotePanelProps {
  projectId: string;
  entryTitle: string;
  isSubmitting: boolean;
  onSubmit: (versionId: string, title: string) => void;
  onCancel: () => void;
}

/** Загружает версии роадмапа и отдаёт их панели «В чекпоинт». */
function PromotePanel({ projectId, entryTitle, isSubmitting, onSubmit, onCancel }: PromotePanelProps) {
  const roadmap = useQueryRoadmap(projectId);

  if (roadmap.isPending) {
    return <p className="text-muted-foreground">Загрузка версий…</p>;
  }

  if (roadmap.isError) {
    return (
      <p role="alert" className="text-destructive">
        Не удалось загрузить роадмап.
      </p>
    );
  }

  return (
    <PromoteToCheckpoint
      entryTitle={entryTitle}
      versions={roadmap.data.versions}
      isSubmitting={isSubmitting}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
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
