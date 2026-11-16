'use client';

import type { EnvironmentDetail, EnvironmentMetadata } from '@cairn/shared';
import Link from 'next/link';

import { CardActions } from './CardActions';
import { PlatformChips } from '../PlatformChips';
import {
  DOMAINS_HREF,
  FIELD_LABELS,
  KIND_LABELS,
  rootDomainHref,
  rootDomainLabel,
  serverHref,
} from './constants';
import type { IProps } from './types';

/** Окружение проекта: состав полей задан уровнем доступа (ТЗ 4.3). */
export function EnvironmentCard({
  environment,
  canWrite = false,
  isSuperadmin = false,
  onEdit,
  onDelete,
}: IProps) {
  const detail = isDetailed(environment) ? environment : null;
  const server = detail?.server ?? null;
  const roots = detail?.rootDomains ?? [];

  return (
    <article className="space-y-3 rounded-md border border-border p-4">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-medium">{environment.name}</h3>
        <span className="text-sm text-muted-foreground">{KIND_LABELS[environment.kind]}</span>
      </header>

      {environment.domains.length > 0 && (
        <div className="space-y-1">
          <ul className="flex flex-wrap gap-2">
            {environment.domains.map((domain) => (
              <li key={domain} className="rounded bg-muted px-2 py-1 text-sm">
                {domain}
              </li>
            ))}
          </ul>

          {/* Корневой домен — межпроектная сущность: владелец, регистратор
              и срок продления принадлежат суперадмину, и переход в реестр
              показывается только ему. Идентификаторы корней приходят тоже
              только ему — пустой список означает «их не выдали», и тогда
              остаётся ссылка в реестр целиком. */}
          {isSuperadmin && (
            <div className="flex flex-wrap gap-3">
              {roots.length > 0 ? (
                roots.map((root) => (
                  <Link
                    key={root.id}
                    href={rootDomainHref(root.id)}
                    className="text-sm text-muted-foreground hover:underline"
                  >
                    {rootDomainLabel(root.name)}
                  </Link>
                ))
              ) : (
                <Link href={DOMAINS_HREF} className="text-sm text-muted-foreground hover:underline">
                  Реестр доменов
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      {detail && (
        <dl className="grid gap-2 sm:grid-cols-2">
          {/* Адрес самого окружения — его домены, показанные выше. Здесь
              адрес машины: на ней окружение живёт, и это разные вещи. */}
          <Field label={FIELD_LABELS.host} value={detail.server?.host ?? null} />
          <Field
            label={FIELD_LABELS.server}
            value={server?.name ?? 'Сервер не привязан'}
            // Реестр машин закрыт правом суперадмина: остальным ссылка
            // обещала бы экран, который ответит отказом.
            href={isSuperadmin && server ? serverHref(server.id) : null}
          />
          <Field label={FIELD_LABELS.owner} value={detail.server?.owner ?? null} />
          <Field label={FIELD_LABELS.ip} value={detail.server?.ip ?? null} />
          <Field label={FIELD_LABELS.provider} value={detail.server?.provider ?? null} />
          <Field label={FIELD_LABELS.specs} value={detail.server?.specs ?? null} />
          <Field label={FIELD_LABELS.healthCheckPath} value={detail.healthCheckPath} />
          <Field label={FIELD_LABELS.notes} value={detail.notes} />
        </dl>
      )}

      {detail && detail.platforms.length > 0 && (
        <div className="space-y-1">
          <span className="text-sm text-muted-foreground">{FIELD_LABELS.platforms}</span>
          <PlatformChips platforms={detail.platforms} />
        </div>
      )}

      {canWrite && <CardActions onEdit={onEdit} onDelete={onDelete} />}
    </article>
  );
}

/**
 * Одно поле серверных параметров. Пустые значения не показываются.
 *
 * Адрес необязателен и задаётся снаружи: право на реестр знает экран, а
 * не карточка, и без адреса значение остаётся текстом, а не мёртвой
 * ссылкой.
 */
function Field({
  label,
  value,
  href = null,
}: {
  label: string;
  value: string | null;
  href?: string | null;
}) {
  if (!value) {
    return null;
  }

  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap">
        {href ? (
          <Link href={href} className="hover:underline">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

/** Отличает проекцию чтения от проекции метаданных. */
function isDetailed(
  environment: EnvironmentMetadata | EnvironmentDetail,
): environment is EnvironmentDetail {
  return 'server' in environment;
}
