'use client';

import { useQueryDomainMap } from '@/api/hooks';
import { DomainMap } from '@/components/DomainMap';

/** Карта доменов и проектов, которые на них держатся. */
export function DomainMapScreen() {
  const map = useQueryDomainMap();

  if (map.isPending) {
    return <p className="text-muted-foreground">Загрузка…</p>;
  }

  if (map.isError) {
    return (
      <p role="alert" className="text-destructive">
        Не удалось загрузить карту доменов.
      </p>
    );
  }

  return <DomainMap map={map.data} />;
}
