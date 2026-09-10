'use client';

import type { EnvironmentDetail, EnvironmentMetadata } from '@cairn/shared';

import { CardActions } from './CardActions';
import { FIELD_LABELS, KIND_LABELS } from './constants';
import type { IProps } from './types';

/** Окружение проекта: состав полей задан уровнем доступа (ТЗ 4.3). */
export function EnvironmentCard({ environment, canWrite = false, onEdit, onDelete }: IProps) {
  const detail = isDetailed(environment) ? environment : null;

  return (
    <article className="space-y-3 rounded-md border border-border p-4">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-medium">{environment.name}</h3>
        <span className="text-sm text-muted-foreground">{KIND_LABELS[environment.kind]}</span>
      </header>

      {environment.domains.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {environment.domains.map((domain) => (
            <li key={domain} className="rounded bg-muted px-2 py-1 text-sm">
              {domain}
            </li>
          ))}
        </ul>
      )}

      {detail && (
        <dl className="grid gap-2 sm:grid-cols-2">
          {/* Адрес окружения перекрывает адрес машины: окружение может жить
              на поддомене или нестандартном порту (спека этапа 9, раздел 2). */}
          <Field label={FIELD_LABELS.host} value={detail.host ?? detail.server?.host ?? null} />
          <Field label={FIELD_LABELS.server} value={detail.server?.name ?? 'Сервер не привязан'} />
          <Field label={FIELD_LABELS.owner} value={detail.server?.owner ?? null} />
          <Field label={FIELD_LABELS.ip} value={detail.server?.ip ?? null} />
          <Field label={FIELD_LABELS.provider} value={detail.server?.provider ?? null} />
          <Field label={FIELD_LABELS.specs} value={detail.server?.specs ?? null} />
          <Field label={FIELD_LABELS.healthCheckUrl} value={detail.healthCheckUrl} />
          <Field label={FIELD_LABELS.notes} value={detail.notes} />
        </dl>
      )}

      {canWrite && <CardActions onEdit={onEdit} onDelete={onDelete} />}
    </article>
  );
}

/** Одно поле серверных параметров. Пустые значения не показываются. */
function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) {
    return null;
  }

  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

/** Отличает проекцию чтения от проекции метаданных. */
function isDetailed(
  environment: EnvironmentMetadata | EnvironmentDetail,
): environment is EnvironmentDetail {
  return 'server' in environment;
}
