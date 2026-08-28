'use client';

import Link from 'next/link';

import { useQueryStatusSummary } from '@/api/hooks';
import { StatusIndicator } from '@/components/StatusIndicator';
import { WarningsPanel } from '@/components/WarningsPanel';

/**
 * Статусы на сводке (ТЗ 8): предупреждения о сроках и индикаторы
 * по проектам, к инфраструктуре которых у субъекта есть доступ.
 */
export function SummaryStatus() {
  const summary = useQueryStatusSummary();

  if (summary.isPending || summary.isError || summary.data.length === 0) {
    // Ошибка статусов не должна ломать сводку: список проектов важнее.
    return null;
  }

  const warnings = summary.data.flatMap((row) =>
    row.warnings.map((warning) => ({
      ...warning,
      subject: `${row.projectName} · ${warning.subject}`,
    })),
  );

  return (
    <div className="space-y-3">
      <WarningsPanel warnings={warnings} />

      <ul className="flex flex-wrap gap-3">
        {summary.data.map((row) => (
          <li key={row.projectId}>
            <Link
              href={`/projects/${row.projectId}/infrastructure`}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1"
            >
              <span className="text-sm">{row.projectName}</span>
              <StatusIndicator indicator={row.indicator} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
