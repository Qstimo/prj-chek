import Link from 'next/link';

import { LIFECYCLE_LABELS, LIFECYCLE_STYLES } from '../ProjectCard/constants';
import { StatusIndicator } from '../StatusIndicator';
import { TagChips } from '../TagChips';
import { PROJECT_COLUMN_CLASS } from './columns';
import { formatUpdatedAt } from './formatUpdatedAt';
import type { IProps } from './types';

/**
 * Компактная строка проекта в сводке.
 *
 * Ссылка названия растянута на всю строку (`after:inset-0`): человек целит
 * в строку — в состояние, в статус, в дату, — а нажималась одна клетка.
 * Ссылка при этом остаётся одна и настоящая, поэтому работают и
 * клавиатура, и «открыть в новой вкладке». То же решение в истории
 * саммари.
 *
 * Домен — отдельная внешняя ссылка со своим слоем (`relative`): без него
 * он утонул бы под растянутой и уводил бы на карточку вместо стенда.
 */
export function ProjectRow({ project, indicator }: IProps) {
  const platforms =
    project.platforms.length > 0
      ? project.platforms.map((platform) => platform.name).join(', ')
      : '—';

  return (
    <tr className="relative border-b border-border last:border-0 hover:bg-surface-strong/60">
      <td className={`truncate px-3 py-2.5 ${PROJECT_COLUMN_CLASS.name}`}>
        <Link
          href={`/projects/${project.id}`}
          title={project.name}
          className="font-medium hover:underline after:absolute after:inset-0"
        >
          {project.name}
        </Link>
      </td>
      <td className={`px-3 py-2.5 ${PROJECT_COLUMN_CLASS.tags}`}>
        {project.tags.length > 0 ? (
          <TagChips tags={project.tags} />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className={`px-3 py-2.5 ${PROJECT_COLUMN_CLASS.lifecycle}`}>
        <span
          className={`inline-block max-w-full truncate rounded-full px-2 py-0.5 text-xs ${LIFECYCLE_STYLES[project.lifecycle]}`}
        >
          {LIFECYCLE_LABELS[project.lifecycle]}
        </span>
      </td>
      <td
        className={`truncate px-3 py-2.5 text-xs text-muted-foreground ${PROJECT_COLUMN_CLASS.platforms}`}
        title={platforms}
      >
        {platforms}
      </td>
      <td className={`truncate px-3 py-2.5 text-sm ${PROJECT_COLUMN_CLASS.domain}`}>
        {project.productionDomain ? (
          <a
            href={`https://${project.productionDomain}`}
            target="_blank"
            rel="noreferrer"
            title={project.productionDomain}
            className="relative hover:underline"
          >
            {project.productionDomain}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td
        className={`truncate px-3 py-2.5 text-xs text-muted-foreground ${PROJECT_COLUMN_CLASS.server}`}
        title={project.productionServerName ?? undefined}
      >
        {project.productionServerName ?? '—'}
      </td>
      <td className={`truncate px-3 py-2.5 ${PROJECT_COLUMN_CLASS.indicator}`}>
        {indicator ? (
          <StatusIndicator indicator={indicator} />
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </td>
      <td
        className={`truncate px-3 py-2.5 text-xs text-muted-foreground ${PROJECT_COLUMN_CLASS.updatedAt}`}
      >
        {formatUpdatedAt(project.updatedAt)}
      </td>
    </tr>
  );
}
