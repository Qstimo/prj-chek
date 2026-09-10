'use client';

import { useRouter } from 'next/navigation';

import { useMutationCreateDomain } from '@/api/hooks';
import { DomainForm } from '@/components/DomainForm';

/** Добавление корневого домена в реестр. */
export function NewDomainScreen() {
  const router = useRouter();
  const mutation = useMutationCreateDomain();

  return (
    <DomainForm
      initial={{ name: '', owner: null, registrar: null, paidUntil: null, notes: null }}
      isSubmitting={mutation.isPending}
      error={mutation.error?.message}
      onSubmit={(input) =>
        mutation.mutate(input, {
          onSuccess: () => {
            router.push('/domains');
            router.refresh();
          },
        })
      }
    />
  );
}
