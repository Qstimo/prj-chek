'use client';

import { useMutationCreateVersion } from '@/api/hooks';
import { Drawer } from '@/components/Drawer';
import { VersionForm } from '@/components/VersionForm';

/** Пропсы панели создания версии. */
interface IProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

/** Панель «Новая версия»: форма создания в выезжающем Drawer. */
export function CreateVersionPanel({ projectId, isOpen, onClose }: IProps) {
  const createVersion = useMutationCreateVersion(projectId);

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Новая версия">
      <VersionForm
        isSubmitting={createVersion.isPending}
        error={createVersion.error?.message}
        onSubmit={(input) => createVersion.mutate(input, { onSuccess: onClose })}
      />
    </Drawer>
  );
}
