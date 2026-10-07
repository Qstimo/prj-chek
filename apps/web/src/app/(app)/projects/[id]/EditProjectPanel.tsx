'use client';

import type { Platform, ProjectUpdate } from '@cairn/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { describeApiError } from '@/api';
import {
  useMutationCreatePlatform,
  useMutationDeletePlatform,
  useMutationUpdateProject,
  useQueryPlatforms,
} from '@/api/hooks';
import { Drawer, DrawerWidth } from '@/components/Drawer';
import { PlatformsField } from '@/components/PlatformsField';
import { ProjectForm, type ProjectFormValues } from '@/components/ProjectForm';

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
}

/**
 * Правка паспорта проекта в выезжающей панели.
 *
 * Платформы приходят из запроса, а чипы действуют мутациями сразу — как
 * галочки чекпоинтов. Поэтому список перерисовывается от кэша, а не от
 * состояния формы, которое с пропом не ресинхронизируется.
 */
export function EditProjectPanel({ projectId, initial, canWrite, initialPlatforms }: IProps) {
  const router = useRouter();
  const mutation = useMutationUpdateProject(projectId);
  const platforms = useQueryPlatforms(projectId, { initialData: initialPlatforms });
  const createPlatform = useMutationCreatePlatform(projectId);
  const deletePlatform = useMutationDeletePlatform(projectId);
  const [isOpen, setIsOpen] = useState(false);

  if (!canWrite) {
    return null;
  }

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
          error={describeApiError(mutation.error)}
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
