'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  useMutationAddEnvironmentDomain,
  useMutationCreateDomain,
  useQueryDomains,
  useQueryEnvironments,
  useQueryProjects,
} from '@/api/hooks';
import { describeApiError } from '@/api';
import { DomainAddressForm } from '@/components/DomainAddressForm';

/** Добавление адреса в реестр: корня со свойствами либо поддомена окружения. */
export function NewDomainScreen() {
  const router = useRouter();
  const [projectId, setProjectId] = useState('');

  const domains = useQueryDomains();
  const projects = useQueryProjects();
  const environments = useQueryEnvironments(projectId, { enabled: projectId.length > 0 });

  const createRoot = useMutationCreateDomain();
  const addSubdomain = useMutationAddEnvironmentDomain();

  function goToRegistry(): void {
    router.push('/domains');
    router.refresh();
  }

  return (
    <DomainAddressForm
      knownRoots={(domains.data ?? []).map((domain) => domain.name)}
      projects={projects.data ?? []}
      environments={environments.data ?? []}
      projectId={projectId}
      onProjectChange={setProjectId}
      isSubmitting={createRoot.isPending || addSubdomain.isPending}
      error={describeApiError(createRoot.error ?? addSubdomain.error)}
      onSubmitRoot={(input) => createRoot.mutate(input, { onSuccess: goToRegistry })}
      onSubmitSubdomain={({ name, projectId: target, environmentId }) =>
        addSubdomain.mutate(
          { projectId: target, environmentId, name },
          { onSuccess: goToRegistry },
        )
      }
    />
  );
}
