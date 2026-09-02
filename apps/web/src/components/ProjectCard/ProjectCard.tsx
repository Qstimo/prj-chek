import Link from 'next/link';

import { LIFECYCLE_LABELS, LIFECYCLE_STYLES } from './constants';
import type { IProps } from './types';

/**
 * Карточка проекта в сводке.
 *
 * Место под индикатор технического статуса появится на этапе 6; сейчас
 * показывается только состояние жизненного цикла, задаваемое вручную.
 */
export function ProjectCard({ project }: IProps) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="block rounded-lg border border-border bg-surface p-4 transition hover:border-border-strong hover:bg-surface-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-medium">{project.name}</h2>
        <span className={`rounded-full px-2 py-1 text-xs ${LIFECYCLE_STYLES[project.lifecycle]}`}>
          {LIFECYCLE_LABELS[project.lifecycle]}
        </span>
      </div>
    </Link>
  );
}
