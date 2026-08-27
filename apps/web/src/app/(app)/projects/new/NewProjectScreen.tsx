'use client';

import { ProjectLifecycle, type ProjectCreate } from '@cairn/shared';
import { useRouter } from 'next/navigation';

import { useMutationCreateProject } from '@/api/hooks';
import { ProjectForm } from '@/components/ProjectForm';

/** Создание проекта. */
export function NewProjectScreen() {
  const router = useRouter();
  const mutation = useMutationCreateProject();

  return (
    <ProjectForm
      initial={{
        name: '',
        purpose: null,
        stack: null,
        repoUrl: null,
        notes: null,
        lifecycle: ProjectLifecycle.Development,
      }}
      isSubmitting={mutation.isPending}
      error={mutation.error?.message}
      onSubmit={(input) =>
        mutation.mutate(input as ProjectCreate, {
          onSuccess: (created) => {
            router.push(`/projects/${created.id}`);
            router.refresh();
          },
        })
      }
    />
  );
}
