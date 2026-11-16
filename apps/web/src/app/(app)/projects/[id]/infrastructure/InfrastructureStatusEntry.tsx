'use client';

import Link from 'next/link';
import { useQueryProjectStatus } from '@/api/hooks';
import { Loader } from '@/components/Loader';
import { StatusIndicator } from '@/components/StatusIndicator';

export function InfrastructureStatusEntry({ projectId }: { projectId: string }) {
  const status = useQueryProjectStatus(projectId);
  if (status.isPending) return <Loader />;
  if (!status.data && !status.isError) return null;
  return <Link href={`/projects/${projectId}/infrastructure/status`} className="group flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm transition-colors hover:border-primary/50">
    <div><h2 className="font-medium">Статус и история доступности <span aria-hidden="true" className="ml-2 text-primary">→</span></h2><p className="mt-1 text-sm text-muted-foreground">Проверки адресов, сертификаты и графики инцидентов</p>{status.isError && <p className="mt-1 text-xs text-muted-foreground">Статус не обновлён. Откройте экран для повторной загрузки.</p>}</div>
    <div className="flex items-center gap-3">{status.data?.checkRunning && <span className="w-10 [&_.cairn-loader]:min-h-0 [&_.cairn-loader]:py-0"><Loader label="Проверки выполняются…" /></span>}{status.data && <StatusIndicator indicator={status.data.indicator} />}</div>
  </Link>;
}
