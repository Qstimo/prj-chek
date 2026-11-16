'use client';

import type { Platform, ProjectUpdate, Tag } from '@cairn/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { describeApiError } from '@/api';
import {
  useMutationCreatePlatform,
  useMutationDeletePlatform,
  useMutationSetProjectTags,
  useMutationUpdateProject,
  useQueryPlatforms,
  useQueryTagVocabulary,
} from '@/api/hooks';
import { Drawer, DrawerWidth } from '@/components/Drawer';
import { PlatformsField } from '@/components/PlatformsField';
import { ProjectForm, type ProjectFormValues } from '@/components/ProjectForm';
import { TagsField } from '@/components/TagsField';

/** Пропсы панели правки проекта. */
interface IProps {
  projectId: string;
  initial: ProjectFormValues;
  /**
   * Право записи в «Инфо».
   *
   * Пропом от страницы, а не клиентским запросом: страница и так
   * серверная, и уровни доступа ей всё равно нужны, а запрос прав
   * заставлял бы кнопку мигать на время загрузки.
   */
  canWrite: boolean;
  /** Платформы, уже полученные страницей: подставляются в кэш запроса. */
  initialPlatforms?: Platform[];
  /**
   * Теги, уже пришедшие в паспорте проекта.
   *
   * Пропом, а не запросом: набор лежит в самой проекции проекта, и
   * второй источник того же разошёлся бы с ней.
   */
  initialTags: Tag[];
}

/**
 * Правка паспорта проекта в выезжающей панели.
 *
 * Платформы приходят из запроса, а чипы действуют мутациями сразу — как
 * галочки чекпоинтов. Поэтому список перерисовывается от кэша, а не от
 * состояния формы, которое с пропом не ресинхронизируется. Теги устроены
 * так же, только набор уходит целиком одной ручкой.
 */
export function EditProjectPanel({
  projectId,
  initial,
  canWrite,
  initialPlatforms,
  initialTags,
}: IProps) {
  const router = useRouter();
  const mutation = useMutationUpdateProject(projectId);
  const platforms = useQueryPlatforms(projectId, { initialData: initialPlatforms });
  const createPlatform = useMutationCreatePlatform(projectId);
  const deletePlatform = useMutationDeletePlatform(projectId);
  const setTags = useMutationSetProjectTags(projectId);
  const [isOpen, setIsOpen] = useState(false);
  const vocabulary = useQueryTagVocabulary({ enabled: isOpen });

  if (!canWrite) {
    return null;
  }

  /**
   * Показываемый набор тегов.
   *
   * Пока запрос в пути — отправленное: чип обязан появиться по щелчку,
   * а не через круг по сети. Отказ сам возвращает прежний набор, потому
   * что `variables` перестаёт читаться с концом запроса, — отдельного
   * откатывающего состояния для этого не нужно.
   */
  const tags =
    setTags.isPending && setTags.variables
      ? setTags.variables
      : (setTags.data ?? initialTags).map((tag) => tag.label);

  function submit(input: ProjectUpdate): void {
    mutation.mutate(input, {
      onSuccess: () => {
        setIsOpen(false);
        router.refresh();
      },
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-md border px-3 py-1 text-sm"
      >
        Править
      </button>

      <Drawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Правка проекта"
        width={DrawerWidth.Half}
      >
        <ProjectForm
          initial={initial}
          onSubmit={submit}
          isSubmitting={mutation.isPending}
          // Отказ в тегах показывается там же: действуют они своей
          // ручкой, но для человека это одна форма.
          error={describeApiError(mutation.error) ?? describeApiError(setTags.error)}
          tagsSlot={
            <TagsField
              tags={tags}
              // `router.refresh()` и здесь: паспорт под панелью
              // отрисован на сервере, и без него чипы в нём остались бы
              // прежними до перезагрузки страницы.
              onChange={(next) => setTags.mutate(next, { onSuccess: () => router.refresh() })}
              suggestions={(vocabulary.data ?? []).map((tag) => tag.label)}
            />
          }
          platformsSlot={
            <PlatformsField
              platforms={platforms.data ?? []}
              onAdd={(input) => createPlatform.mutate(input)}
              onRemove={(platform) => {
                if (platform.id) {
                  deletePlatform.mutate(platform.id);
                }
              }}
            />
          }
        />
      </Drawer>
    </>
  );
}
