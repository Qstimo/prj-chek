'use client';

import type { RevealResponse } from '@cairn/shared';

import { useQueryVariableVersions } from '@/api/hooks';
import { VersionHistory } from '@/components/VersionHistory';

/** Пропсы панели истории. */
interface IProps {
  projectId: string;
  environmentId: string;
  variableId: string;
  canWrite: boolean;
  onReveal: (versionNo: number) => Promise<RevealResponse>;
  onRollback: (versionNo: number) => void;
}

/** История версий выбранной переменной. */
export function VariableHistoryPanel({
  projectId,
  environmentId,
  variableId,
  canWrite,
  onReveal,
  onRollback,
}: IProps) {
  const versions = useQueryVariableVersions(projectId, environmentId, variableId);

  if (versions.isPending) {
    return <p className="text-muted-foreground">Загрузка истории…</p>;
  }

  if (versions.isError) {
    return (
      <p role="alert" className="text-destructive">
        Не удалось загрузить историю версий.
      </p>
    );
  }

  return (
    <section className="space-y-2 rounded-md border border-border p-4">
      <h2 className="text-lg font-medium">История версий</h2>
      <VersionHistory
        versions={versions.data}
        canWrite={canWrite}
        onReveal={onReveal}
        onRollback={onRollback}
      />
    </section>
  );
}
