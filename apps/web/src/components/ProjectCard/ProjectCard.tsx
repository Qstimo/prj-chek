import Link from 'next/link';

import { StatusIndicator } from '../StatusIndicator';
import { LIFECYCLE_LABELS, LIFECYCLE_STYLES } from './constants';
import type { IProps } from './types';

/**
 * Карточка проекта в сводке.
 *
 * Стадия жизненного цикла — намерение, задаваемое вручную; индикатор —
 * вычисляемый факт. Соседство этих двух вещей и есть ответ на вопрос
 * «что с проектом», ради которого сводка существует.
 */
export function ProjectCard({ project, indicator }: IProps) {
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

      {indicator && (
        <div className="mt-2">
          <StatusIndicator indicator={indicator} />
        </div>
      )}
    </Link>
  );
}
