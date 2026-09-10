'use client';

import { useRouter } from 'next/navigation';

import { useMutationCreateServer } from '@/api/hooks';
import { ServerForm } from '@/components/ServerForm';

/** Добавление сервера в реестр. */
export function NewServerScreen() {
  const router = useRouter();
  const mutation = useMutationCreateServer();

  return (
    <ServerForm
      initial={{
        name: '',
        owner: null,
        host: null,
        ip: null,
        provider: null,
        specs: null,
        paidUntil: null,
        notes: null,
      }}
      isSubmitting={mutation.isPending}
      error={mutation.error?.message}
      onSubmit={(input) =>
        mutation.mutate(input, {
          onSuccess: () => {
            router.push('/servers');
            router.refresh();
          },
        })
      }
    />
  );
}
