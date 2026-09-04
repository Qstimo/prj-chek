import type { RoadmapVersionDetail, RoadmapVersionMetadata } from '@cairn/shared';

import { formatDate } from '@/utils';

import { STATE_LABELS } from './constants';

/** Пропсы паспорта версии. */
interface IProps {
  version: RoadmapVersionMetadata | RoadmapVersionDetail;
  isCurrent: boolean;
}

/** Паспорт версии: состояние, даты, прогресс. */
export function VersionPassport({ version, isCurrent }: IProps) {
  return (
    <dl className="space-y-1 text-sm">
      <PassportRow name="Состояние">
        <span>{STATE_LABELS[version.state]}</span>
        {isCurrent && <span className="text-muted-foreground"> — текущая</span>}
      </PassportRow>
      {version.plannedDate && (
        <PassportRow name="Плановая дата">{formatDate(version.plannedDate)}</PassportRow>
      )}
      {version.releasedDate && (
        <PassportRow name="Дата релиза">{formatDate(version.releasedDate)}</PassportRow>
      )}
      <PassportRow name="Прогресс">
        {version.progress.done} из {version.progress.total}
      </PassportRow>
    </dl>
  );
}

/** Строка паспорта: подпись и значение. */
function PassportRow({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground">{name}</dt>
      <dd>{children}</dd>
    </div>
  );
}
