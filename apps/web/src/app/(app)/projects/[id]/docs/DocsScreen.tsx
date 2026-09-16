'use client';

import { AccessLevel, Section, type DocPageCreate } from '@cairn/shared';
import { useState } from 'react';

import {
  useMutationCreateDocPage,
  useMutationDeleteDocPage,
  useMutationUpdateDocPage,
  useQueryDocPage,
  useQueryDocs,
  useQuerySections,
} from '@/api/hooks';
import { DocPageForm } from '@/components/DocPageForm';
import { DocPageList } from '@/components/DocPageList';
import { Markdown } from '@/components/Markdown';
import { describeApiError } from '@/api';

/** Пропсы экрана документации. */
interface IProps {
  projectId: string;
}

/** Страницы «как это устроено сейчас» (спека 7). */
export function DocsScreen({ projectId }: IProps) {
  const docs = useQueryDocs(projectId);
  const sections = useQuerySections(projectId);
  const create = useMutationCreateDocPage(projectId);
  const update = useMutationUpdateDocPage(projectId);
  const remove = useMutationDeleteDocPage(projectId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const page = useQueryDocPage(projectId, selectedId);

  if (docs.isPending || sections.isPending) {
    return <p className="text-muted-foreground">Загрузка…</p>;
  }

  if (docs.isError || sections.isError) {
    return (
      <p role="alert" className="text-destructive">
        Не удалось загрузить документацию.
      </p>
    );
  }

  const canWrite = sections.data[Section.Docs] === AccessLevel.Write;
  const selectedContent =
    page.data && 'content' in page.data ? page.data : null;

  function submit(input: DocPageCreate): void {
    if (isEditing && selectedId) {
      update.mutate({ id: selectedId, input }, { onSuccess: () => setIsEditing(false) });

      return;
    }

    create.mutate(input, { onSuccess: () => setIsCreating(false) });
  }

  return (
    <div className="space-y-4">
      {canWrite && !isCreating && !isEditing && (
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >
          Создать страницу
        </button>
      )}

      {(isCreating || (isEditing && selectedContent)) && (
        <DocPageForm
          initial={
            isEditing && selectedContent
              ? { title: selectedContent.title, content: selectedContent.content }
              : undefined
          }
          isSubmitting={create.isPending || update.isPending}
          error={describeApiError(create.error ?? update.error)}
          onSubmit={submit}
        />
      )}

      <DocPageList
        pages={docs.data}
        selectedId={selectedId}
        canWrite={canWrite}
        onSelect={(id) => {
          setSelectedId(id === selectedId ? null : id);
          setIsEditing(false);
          setIsConfirmingDelete(false);
        }}
      />

      {selectedId && page.isPending && <p className="text-muted-foreground">Загрузка страницы…</p>}

      {selectedContent && !isEditing && (
        <article className="space-y-3 rounded-md border border-border p-4">
          <h2 className="text-xl font-semibold">{selectedContent.title}</h2>
          <Markdown content={selectedContent.content} />

          {canWrite && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="rounded-md border px-3 py-1 text-sm"
              >
                Править
              </button>
              {isConfirmingDelete ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      remove.mutate(selectedId!, {
                        onSuccess: () => {
                          setSelectedId(null);
                          setIsConfirmingDelete(false);
                        },
                      })
                    }
                    className="rounded-md bg-destructive px-3 py-1 text-sm text-destructive-foreground"
                  >
                    Подтвердить удаление
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDelete(false)}
                    className="rounded-md border px-3 py-1 text-sm"
                  >
                    Отмена
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(true)}
                  className="rounded-md border px-3 py-1 text-sm"
                >
                  Удалить
                </button>
              )}
            </div>
          )}
        </article>
      )}
    </div>
  );
}
