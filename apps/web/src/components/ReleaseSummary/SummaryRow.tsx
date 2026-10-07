import { PlatformReleaseState, type ReleaseSummaryRow } from '@cairn/shared';

import { formatDate } from '@/utils';

import { NO_RELEASES } from './constants';
import { ReleaseBadge } from './ReleaseBadge';

/** Пропсы строки сводки. */
interface IProps {
  row: ReleaseSummaryRow;
}

/** Строка сводки: платформа, её релиз и то, что идёт за ним. */
export function SummaryRow({ row }: IProps) {
  return (
    <>
      <dt className="font-medium">{row.platform.name}</dt>
      <dd className="flex flex-wrap items-center gap-2 sm:col-span-2">
        {row.released ? (
          <>
            <ReleaseBadge
              state={PlatformReleaseState.Released}
              label={row.released.buildLabel ?? row.released.versionLabel}
            />
            {row.released.date && (
              <span className="text-sm text-muted-foreground">
                {formatDate(row.released.date)}
              </span>
            )}
          </>
        ) : (
          <span className="text-sm text-muted-foreground">{NO_RELEASES}</span>
        )}

        {row.pending.map((entry) => (
          <ReleaseBadge
            key={`${entry.versionId}-${entry.state}`}
            state={entry.state}
            label={entry.buildLabel ?? entry.versionLabel}
          />
        ))}
      </dd>
    </>
  );
}
