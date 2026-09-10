'use client';

import type { DomainDetail } from '@cairn/shared';
import { useRouter } from 'next/navigation';

import { useMutationUpdateDomain } from '@/api/hooks';
import { DomainForm } from '@/components/DomainForm';

/** Правка корневого домена вместе со списком его поддоменов. */
export function EditDomainScreen({ domain }: { domain: DomainDetail }) {
  const router = useRouter();
  const mutation = useMutationUpdateDomain();

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
        onSubmit={(input) =>
          mutation.mutate(
            { id: domain.id, input: { ...input, name: undefined } },
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
