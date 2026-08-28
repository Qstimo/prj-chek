'use client';

import { VersionRow } from './VersionRow';
import type { IProps } from './types';

/**
 * История версий значения (ТЗ 3.3): линейна, откат создаёт новую версию.
 */
export function VersionHistory({ versions, canWrite = false, onReveal, onRollback }: IProps) {
  return (
    <ul aria-label="История версий" className="grid gap-1">
      {versions.map((version) => (
        <VersionRow
          key={version.versionNo}
          version={version}
          canWrite={canWrite}
          onReveal={onReveal}
          onRollback={onRollback}
        />
      ))}
    </ul>
  );
}
