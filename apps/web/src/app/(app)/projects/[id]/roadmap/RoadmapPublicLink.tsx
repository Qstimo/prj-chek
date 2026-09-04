'use client';

import {
  useMutationPublishRoadmap,
  useMutationUnpublishRoadmap,
  useQueryPublicLink,
} from '@/api/hooks';
import { PublicLinkPanel } from '@/components/PublicLinkPanel';

/** Пропсы блока публичной ссылки роадмапа. */
interface IProps {
  projectId: string;
  isSuperadmin: boolean;
}

/** Публичная ссылка роадмапа: собирает запрос и мутации публикации. */
export function RoadmapPublicLink({ projectId, isSuperadmin }: IProps) {
  const publicLink = useQueryPublicLink(projectId);
  const publish = useMutationPublishRoadmap(projectId);
  const unpublish = useMutationUnpublishRoadmap(projectId);

  return (
    <PublicLinkPanel
      link={publicLink.data ?? null}
      isSuperadmin={isSuperadmin}
      isPending={publish.isPending || unpublish.isPending}
      onPublish={() => publish.mutate()}
      onUnpublish={() => unpublish.mutate()}
    />
  );
}
