'use client';

import type { ServerDetail } from '@cairn/shared';
import { useRouter } from 'next/navigation';

import { useMutationUpdateServer } from '@/api/hooks';
import { ServerForm } from '@/components/ServerForm';

/** Правка сервера. */
export function EditServerScreen({ server }: { server: ServerDetail }) {
  const router = useRouter();
  const mutation = useMutationUpdateServer();

  return (
    <ServerForm
      initial={{
        name: server.name,
        owner: server.owner,
        host: server.host,
        ip: server.ip,
        provider: server.provider,
        specs: server.specs,
        paidUntil: server.paidUntil,
        notes: server.notes,
      }}
      isSubmitting={mutation.isPending}
      error={mutation.error?.message}
      onSubmit={(input) =>
        mutation.mutate(
          { id: server.id, input },
          {
            onSuccess: () => {
              router.push('/servers');
              router.refresh();
            },
          },
        )
      }
    />
  );
}
