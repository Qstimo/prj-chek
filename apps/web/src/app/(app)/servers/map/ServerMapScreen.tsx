'use client';

import { Loader } from '@/components/Loader';
import { useQueryServerMap } from '@/api/hooks';
import { ServerMap } from '@/components/ServerMap';

/** Карта размещения проектов по серверам. */
export function ServerMapScreen() {
  const map = useQueryServerMap();

  if (map.isPending) {
    return <Loader />;
  }

  if (map.isError) {
    return (
      <p role="alert" className="text-destructive">
        Не удалось загрузить карту размещения.
      </p>
    );
  }

  return <ServerMap map={map.data} />;
}
