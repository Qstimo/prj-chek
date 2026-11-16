import { AccessLevel, type ProjectDetail, type ProjectMetadata, type Tag } from '@cairn/shared';

import type { Project } from '../db/schema';

/**
 * Приводит проект к набору полей, разрешённому уровнем доступа (спека 5.5).
 *
 * Применяется в сервисном слое до сериализации, поэтому скрытые поля
 * не доходят до контроллера и не могут просочиться в ответ по недосмотру.
 *
 * Теги приходят отдельным аргументом: они лежат в своих таблицах, и
 * проекция их не добывает — она решает, что показать. На уровне
 * метаданных они гаснут вместе с остальным паспортом.
 */
export function projectProjection(
  project: Project,
  level: AccessLevel,
  tags: Tag[] = [],
): ProjectMetadata | ProjectDetail {
  const metadata: ProjectMetadata = {
    id: project.id,
    slug: project.slug,
    name: project.name,
    lifecycle: project.lifecycle,
  };

  if (level === AccessLevel.Metadata) {
    return metadata;
  }

  return {
    ...metadata,
    tags,
    purpose: project.purpose,
    stack: project.stack,
    repoUrl: project.repoUrl,
    ownerUserId: project.ownerUserId,
    notes: project.notes,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}
