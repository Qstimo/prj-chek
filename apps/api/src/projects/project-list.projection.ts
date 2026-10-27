import {
  AccessLevel,
  Section,
  type PlatformRef,
  type ProjectListItem,
  type SectionLevels,
} from '@cairn/shared';

import type { Project } from '../db/schema';

/** Порядок уровней для сравнения. */
const LEVEL_ORDER: Record<AccessLevel, number> = {
  [AccessLevel.Metadata]: 1,
  [AccessLevel.Read]: 2,
  [AccessLevel.Write]: 3,
};

function meets(level: AccessLevel | undefined, minimum: AccessLevel): boolean {
  return level !== undefined && LEVEL_ORDER[level] >= LEVEL_ORDER[minimum];
}

/**
 * Собирает строку сводки из проекта и заранее отобранных обзорных полей.
 *
 * Гейты Info/Infra применяются здесь: репозиторий подтягивает данные
 * батчем, а проекция решает, что можно показать субъекту.
 */
export function projectListItemProjection(
  project: Project,
  levels: SectionLevels,
  platforms: PlatformRef[],
  productionDomain: string | null,
  productionServerName: string | null,
): ProjectListItem {
  const info = levels[Section.Info];
  const infra = levels[Section.Infrastructure];

  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    lifecycle: project.lifecycle,
    updatedAt: meets(info, AccessLevel.Read) ? project.updatedAt.toISOString() : null,
    platforms: meets(info, AccessLevel.Metadata) ? platforms : [],
    productionDomain: meets(infra, AccessLevel.Metadata) ? productionDomain : null,
    productionServerName: meets(infra, AccessLevel.Read) ? productionServerName : null,
  };
}
