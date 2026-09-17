'use client';

import type { DomainDetail } from '@cairn/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  useMutationAddEnvironmentDomain,
  useMutationUpdateDomain,
  useQueryEnvironments,
  useQueryProjects,
} from '@/api/hooks';
import { describeApiError } from '@/api';
import { DomainAddressForm } from '@/components/DomainAddressForm';
import { DomainForm } from '@/components/DomainForm';

/** Правка корневого домена вместе со списком его поддоменов. */
export function EditDomainScreen({ domain }: { domain: DomainDetail }) {
  const router = useRouter();
  const [projectId, setProjectId] = useState('');

  const mutation = useMutationUpdateDomain();
  const projects = useQueryProjects();
  const environments = useQueryEnvironments(projectId, { enabled: projectId.length > 0 });
  const addSubdomain = useMutationAddEnvironmentDomain();

  return (
    <div className="space-y-6">
      <DomainForm
        initial={{
          name: domain.name,
          owner: domain.owner,
          registrar: domain.registrar,
          paidUntil: domain.paidUntil,
          notes: domain.notes,
        }}
        isNameLocked
        isSubmitting={mutation.isPending}
        error={mutation.error?.message}
        onSubmit={({ name: _unused, ...input }) =>
          // Имя в правку не уходит: за корнем висят поддомены, вычисленные
          // из него же, и переименование оставило бы их на чужом родителе.
          mutation.mutate(
            { id: domain.id, input },
            {
              onSuccess: () => {
                router.push('/domains');
                router.refresh();
              },
            },
          )
        }
      />

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Добавить поддомен</h2>
        {/* Та же форма адреса, но корень уже выбран самой карточкой:
            вводится только левая часть имени. */}
        <DomainAddressForm
          knownRoots={[domain.name]}
          rootSuffix={domain.name}
          projects={projects.data ?? []}
          environments={environments.data ?? []}
          projectId={projectId}
          onProjectChange={setProjectId}
          isSubmitting={addSubdomain.isPending}
          error={describeApiError(addSubdomain.error)}
          onSubmitSubdomain={({ name, projectId: target, environmentId }) =>
            addSubdomain.mutate(
              { projectId: target, environmentId, name },
              {
                onSuccess: () => {
                  router.refresh();
                },
              },
            )
          }
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Поддомены</h2>
        {domain.subdomains.length === 0 ? (
          <p className="text-muted-foreground">Поддоменов пока нет.</p>
        ) : (
          <ul className="space-y-1">
            {domain.subdomains.map((subdomain) => (
              <li key={subdomain.id} className="text-sm">
                {subdomain.name}
                <span className="text-muted-foreground">
                  {' '}
                  — {subdomain.projectName}, {subdomain.environmentName}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
