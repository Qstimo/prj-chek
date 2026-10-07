'use client';

import type { Platform } from '@cairn/shared';

import { useMutationCreateVersion } from '@/api/hooks';
import { Drawer } from '@/components/Drawer';
import { VersionForm } from '@/components/VersionForm';

/** Пропсы панели создания версии. */
interface IProps {
  projectId: string;
  /** Платформы проекта: при них дата релиза задаётся выпуском, не версией. */
  platforms: Platform[];
  isOpen: boolean;
  onClose: () => void;
}

/** Панель «Новая версия»: форма создания в выезжающем Drawer. */
export function CreateVersionPanel({ projectId, platforms, isOpen, onClose }: IProps) {
  const createVersion = useMutationCreateVersion(projectId);

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Новая версия">
      <VersionForm
        hasPlatforms={platforms.length > 0}
        isSubmitting={createVersion.isPending}
        error={createVersion.error?.message}
        onSubmit={(input) => createVersion.mutate(input, { onSuccess: onClose })}
      />
    </Drawer>
  );
}
