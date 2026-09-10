'use client';

import { useMutationDeleteServer, useQueryServers } from '@/api/hooks';
import { ServerList } from '@/components/ServerList';

/** Реестр серверов с удалением. */
export function ServersScreen() {
  const servers = useQueryServers();
  const remove = useMutationDeleteServer();

  if (servers.isPending) {
    return <p className="text-muted-foreground">Загрузка…</p>;
  }

  if (servers.isError) {
    return (
      <p role="alert" className="text-destructive">
        Не удалось загрузить реестр серверов.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {remove.isError && (
        <p role="alert" className="text-destructive">
          {remove.error.message}
        </p>
      )}

      <ServerList servers={servers.data} onDelete={(id) => remove.mutate(id)} />
    </div>
  );
}
