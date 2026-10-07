import {
  EnvironmentKind,
  type DomainRow,
  type EnvironmentDetail,
  type EnvironmentMetadata,
  type Platform,
} from '@cairn/shared';

import type { EnvironmentFormValues, ServerOption } from '@/components/EnvironmentForm';

/**
 * Собирает значения формы из окружения либо даёт пустые для создания.
 *
 * Платформы берутся из самого окружения: иначе правка любого поля
 * отправила бы пустой набор и сняла бы все уже стоящие галочки.
 */
export function formValuesOf(
  editing: EnvironmentMetadata | EnvironmentDetail | undefined,
): EnvironmentFormValues {
  const detail = editing && 'server' in editing ? editing : null;

  return {
    name: editing?.name ?? '',
    kind: editing?.kind ?? EnvironmentKind.Production,
    serverId: detail?.server?.id ?? null,
    serverName: detail?.server?.name ?? null,
    healthCheckPath: detail?.healthCheckPath ?? null,
    notes: detail?.notes ?? null,
    domains: editing?.domains ?? [],
    platformIds: detail?.platforms.map((platform) => platform.id) ?? [],
  };
}

/**
 * Известные адреса для подсказки: корни реестра и растущие из них имена.
 *
 * Корни тоже годятся в адрес окружения — прод часто отвечает по самому
 * `example.com`. Повторы отсекаются: тогда корень попал бы в список дважды.
 */
export function knownAddressesOf(domains: DomainRow[]): string[] {
  const names = domains.flatMap((domain) => [
    domain.name,
    ...domain.subdomains.map((subdomain) => subdomain.name),
  ]);

  return [...new Set(names)].sort();
}

/** Что экран знает о правах и доступных ему реестрах. */
interface FormContext {
  isSuperadmin: boolean;
  servers?: ServerOption[];
  domains?: DomainRow[];
  platforms?: Platform[];
}

/**
 * Общие пропы формы для обеих панелей.
 *
 * Два списка прячутся от подрядчика и по-разному. Машины и адреса — по
 * признаку суперадмина: реестры межпроектные, и показать их значило бы
 * раскрыть чужие адреса. Платформы гейтятся уровнем «Инфо», а не
 * суперадминством: подрядчик с записью в «Инфо» галочки получить должен.
 *
 * Платформы передаются как есть, без `?? []`: «список недоступен» и
 * «список пуст» для формы разные вещи — пустой набор снял бы привязки,
 * сделанные тем, у кого доступ к «Инфо» есть.
 */
export function sharedFormProps({ isSuperadmin, servers, domains, platforms }: FormContext) {
  return {
    servers: servers ?? [],
    canAssignServer: isSuperadmin,
    knownDomains: isSuperadmin ? knownAddressesOf(domains ?? []) : undefined,
    platforms,
  };
}
