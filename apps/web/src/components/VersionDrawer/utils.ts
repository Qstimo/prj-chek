import type { RoadmapVersionDetail, RoadmapVersionMetadata } from '@cairn/shared';

/** Отличает проекцию чтения от проекции метаданных. */
export function isDetailed(
  version: RoadmapVersionMetadata | RoadmapVersionDetail,
): version is RoadmapVersionDetail {
  return 'checkpoints' in version;
}
