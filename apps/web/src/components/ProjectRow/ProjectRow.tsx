import Link from 'next/link';

import { LIFECYCLE_LABELS, LIFECYCLE_STYLES } from '../ProjectCard/constants';
import { StatusIndicator } from '../StatusIndicator';
import { formatUpdatedAt } from './formatUpdatedAt';
import type { IProps } from './types';

/**
 * Компактная строка проекта в сводке.
 *
 * Кликом по строке открывается карточка; домен при наличии — отдельная
 * внешняя ссылка, чтобы не уводить с обзора в чужой стенд случайно.
 */
export function ProjectRow({ project, indicator }: IProps) {
  const platforms =
    project.platforms.length > 0
      ? project.platforms.map((platform) => platform.name).join(', ')
      : '—';

  return (
    <tr className="border-b border-border last:border-0 hover:bg-surface-strong/60">
      <td className="px-3 py-2.5">
        <Link href={`/projects/${project.id}`} className="font-medium hover:underline">
          {project.name}
        </Link>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className={`rounded-full px-2 py-0.5 text-xs ${LIFECYCLE_STYLES[project.lifecycle]}`}>
          {LIFECYCLE_LABELS[project.lifecycle]}
        </span>
      </td>
      <td className="max-w-[12rem] truncate px-3 py-2.5 text-sm text-muted-foreground" title={platforms}>
        {platforms}
      </td>
      <td className="px-3 py-2.5 text-sm whitespace-nowrap">
        {project.productionDomain ? (
          <a
            href={`https://${project.productionDomain}`}
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {project.productionDomain}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="max-w-[10rem] truncate px-3 py-2.5 text-sm text-muted-foreground">
        {project.productionServerName ?? '—'}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {indicator ? (
          <StatusIndicator indicator={indicator} />
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-sm text-muted-foreground whitespace-nowrap">
        {formatUpdatedAt(project.updatedAt)}
      </td>
    </tr>
  );
}
