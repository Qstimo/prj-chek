'use client';

import type { ProjectUpdate } from '@cairn/shared';
import { useRouter } from 'next/navigation';

import { ApiError, describeApiError } from '@/api';
import { useMutationUpdateProject } from '@/api/hooks';
import { ProjectForm, type ProjectFormValues } from '@/components/ProjectForm';

/** Пропсы экрана правки. */
interface IProps {
  projectId: string;
  initial: ProjectFormValues;
}

/** Правка паспорта проекта. Требует уровень записи (спека 4.3). */
export function EditProjectScreen({ projectId, initial }: IProps) {
  const router = useRouter();
  const mutation = useMutationUpdateProject(projectId);

  function submit(input: ProjectUpdate): void {
    mutation.mutate(input, {
      onSuccess: () => {
        router.push(`/projects/${projectId}`);
        router.refresh();
      },
    });
  }

  return (
    <ProjectForm
      initial={initial}
      onSubmit={submit}
      isSubmitting={mutation.isPending}
      error={
        describeApiError(mutation.error)
      }
    />
  );
}
