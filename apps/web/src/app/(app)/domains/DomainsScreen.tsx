'use client';

import {
  useMutationDeleteDomain,
  useMutationRemoveEnvironmentDomain,
  useQueryDomains,
} from '@/api/hooks';
import { DomainList } from '@/components/DomainList';
import { describeApiError } from '@/api';

/** Реестр корневых доменов с удалением. */
export function DomainsScreen() {
  const domains = useQueryDomains();
  const remove = useMutationDeleteDomain();
  const removeSubdomain = useMutationRemoveEnvironmentDomain();

  if (domains.isPending) {
    return <p className="text-muted-foreground">Загрузка…</p>;
  }

  if (domains.isError) {
    return (
      <p role="alert" className="text-destructive">
        Не удалось загрузить реестр доменов.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {remove.isError && (
        <p role="alert" className="text-destructive">
          {describeApiError(remove.error)}
        </p>
      )}

      {removeSubdomain.isError && (
        <p role="alert" className="text-destructive">
          {describeApiError(removeSubdomain.error)}
        </p>
      )}

      <DomainList
        domains={domains.data}
        onDelete={(id) => remove.mutate(id)}
        onDeleteSubdomain={(subdomain) =>
          removeSubdomain.mutate({
            projectId: subdomain.projectId,
            environmentId: subdomain.environmentId,
            domainId: subdomain.id,
          })
        }
      />
    </div>
  );
}
