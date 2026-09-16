'use client';

import { ProjectLifecycle, type ProjectCreate } from '@cairn/shared';
import { useRouter } from 'next/navigation';

import { useMutationCreateProject } from '@/api/hooks';
import { ProjectForm } from '@/components/ProjectForm';
import { describeApiError } from '@/api';

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
      error={describeApiError(mutation.error)}
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
