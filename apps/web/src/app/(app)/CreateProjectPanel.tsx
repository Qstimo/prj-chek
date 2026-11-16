'use client';

import type { PlatformCreate, ProjectCreate } from '@cairn/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { describeApiError } from '@/api';
import { useMutationCreateProject, useQueryTagVocabulary } from '@/api/hooks';
import { Drawer, DrawerWidth } from '@/components/Drawer';
import { PlatformsField } from '@/components/PlatformsField';
import { ProjectForm } from '@/components/ProjectForm';
import { TagsField } from '@/components/TagsField';

import { EMPTY_PROJECT } from './constants';

/**
 * Создание проекта в выезжающей панели.
 *
 * Платформы и теги живут в состоянии панели и уходят вместе с проектом:
 * при создании затирать нечего, а требовать сначала создать проект и лишь
 * потом вернуться за ними — лишний шаг.
 */
export function CreateProjectPanel() {
  const router = useRouter();
  const mutation = useMutationCreateProject();
  const [isOpen, setIsOpen] = useState(false);
  const [platforms, setPlatforms] = useState<PlatformCreate[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  // Словарь спрашивается только с открытой панелью: на самой сводке
  // кнопки фильтра собираются из её же строк, и второй запрос за теми
  // же словами там не нужен.
  const vocabulary = useQueryTagVocabulary({ enabled: isOpen });

  function close(): void {
    setIsOpen(false);
    setPlatforms([]);
    setTags([]);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
      >
        Создать проект
      </button>

      <Drawer isOpen={isOpen} onClose={close} title="Новый проект" width={DrawerWidth.Half}>
        <ProjectForm
          initial={EMPTY_PROJECT}
          isSubmitting={mutation.isPending}
          error={describeApiError(mutation.error)}
          platformsSlot={
            <PlatformsField
              platforms={platforms}
              onAdd={(input) => setPlatforms((current) => [...current, input])}
              onRemove={(platform) =>
                setPlatforms((current) => current.filter((item) => item.name !== platform.name))
              }
            />
          }
          tagsSlot={
            <TagsField
              tags={tags}
              onChange={setTags}
              suggestions={(vocabulary.data ?? []).map((tag) => tag.label)}
            />
          }
          onSubmit={(input) =>
            mutation.mutate(
              {
                ...input,
                ...(platforms.length > 0 ? { platforms } : {}),
                ...(tags.length > 0 ? { tags } : {}),
              } as ProjectCreate,
              {
                onSuccess: (created) => {
                  close();
                  router.push(`/projects/${created.id}`);
                  router.refresh();
                },
              },
            )
          }
        />
      </Drawer>
    </>
  );
}
