import {
  DOMAIN_RENEWAL_WARN_DAYS,
  HealthState,
  SERVER_WARN_DAYS,
  ProjectLifecycle,
  StatusIndicator,
  StatusWarningKind,
  type DomainStatus,
  type EnvironmentStatus,
  type StatusWarning,
} from '@cairn/shared';

/** Предупреждать о TLS за две недели. */
export const TLS_WARN_DAYS = 14;

/** Предупреждать о сроке домена за месяц. */
export const DOMAIN_WARN_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Собирает предупреждения из статусов (ТЗ 6): близкие сроки TLS
 * и регистрации, ошибки проверок, упавшие окружения.
 */
export function warningsOf(
  environments: EnvironmentStatus[],
  domains: DomainStatus[],
  now: Date,
): StatusWarning[] {
  const warnings: StatusWarning[] = [];

  for (const environment of environments) {
    if (environment.health === HealthState.Down) {
      warnings.push({
        kind: StatusWarningKind.HealthDown,
        subject: environment.name,
        detail: environment.error ?? 'не отвечает',
      });
    }
  }

  for (const domain of domains) {
    if (domain.tlsError) {
      warnings.push({
        kind: StatusWarningKind.TlsError,
        subject: domain.name,
        detail: domain.tlsError,
      });
    } else if (domain.tlsValidTo && expiresWithin(domain.tlsValidTo, TLS_WARN_DAYS, now)) {
      warnings.push({
        kind: StatusWarningKind.TlsExpiring,
        subject: domain.name,
        detail: `TLS истекает ${dayOf(domain.tlsValidTo)}`,
      });
    }

    if (
      domain.registryExpiresAt &&
      expiresWithin(domain.registryExpiresAt, DOMAIN_WARN_DAYS, now)
    ) {
      warnings.push({
        kind: StatusWarningKind.DomainExpiring,
        subject: domain.name,
        detail: `домен истекает ${dayOf(domain.registryExpiresAt)}`,
      });
    }
  }

  return warnings;
}

/**
 * Индикатор проекта (спека 5): приостановлен → авария → предупреждение →
 * в порядке → неизвестно. Порядок правил и есть приоритет.
 *
 * `extraWarnings` — предупреждения, собранные не из проверок окружений
 * и доменов: сегодня это сроки оплаты серверов проекта. Они приходят
 * готовыми, потому что считаются от машин, а не от окружений.
 */
export function indicatorOf(
  lifecycle: ProjectLifecycle,
  environments: EnvironmentStatus[],
  domains: DomainStatus[],
  now: Date,
  extraWarnings: StatusWarning[] = [],
): StatusIndicator {
  if (lifecycle === ProjectLifecycle.Paused) {
    return StatusIndicator.Paused;
  }

  if (environments.some((environment) => environment.health === HealthState.Down)) {
    return StatusIndicator.Down;
  }

  if (warningsOf(environments, domains, now).length + extraWarnings.length > 0) {
    return StatusIndicator.Warning;
  }

  const hasAnyResult =
    environments.some((environment) => environment.checkedAt !== null) ||
    domains.some((domain) => domain.checkedAt !== null);

  return hasAnyResult ? StatusIndicator.Ok : StatusIndicator.Unknown;
}

/** Истекает ли срок в ближайшие `days` дней (включая уже истёкший). */
function expiresWithin(isoDate: string, days: number, now: Date): boolean {
  return new Date(isoDate).getTime() - now.getTime() < days * DAY_MS;
}

/** День без времени для человеческого текста предупреждения. */
function dayOf(isoDate: string): string {
  return isoDate.slice(0, 10);
}

/**
 * Предупреждения сервера: срок оплаты близок либо уже прошёл.
 *
 * Порог берётся из контракта: то же число нужно плашке срока в интерфейсе,
 * а второе объявление неизбежно разошлось бы с первым.
 */
export function serverWarningsOf(
  name: string,
  paidUntil: string | null,
  now: Date,
): StatusWarning[] {
  return paymentWarningsOf(
    StatusWarningKind.ServerExpiring,
    name,
    paidUntil,
    SERVER_WARN_DAYS,
    now,
  );
}

/**
 * Предупреждения о продлении домена по данным реестра CAIRN.
 *
 * Отдельно от RDAP-предупреждения: то говорит о регистрации в зоне, это —
 * о нашей оплате. Зоны без RDAP молчат, и ручная дата для них единственный
 * источник. Порог месяц, а не две недели: неоплаченная машина продолжает
 * работать, а освободившийся домен могут перехватить в тот же день.
 */
export function domainRenewalWarningsOf(
  name: string,
  paidUntil: string | null,
  now: Date,
): StatusWarning[] {
  return paymentWarningsOf(
    StatusWarningKind.DomainRenewalExpiring,
    name,
    paidUntil,
    DOMAIN_RENEWAL_WARN_DAYS,
    now,
  );
}

/** Общая машинка сроков оплаты: близкий срок и просрочка звучат одинаково. */
function paymentWarningsOf(
  kind: StatusWarningKind,
  subject: string,
  paidUntil: string | null,
  warnDays: number,
  now: Date,
): StatusWarning[] {
  if (!paidUntil) {
    return [];
  }

  const days = daysUntil(paidUntil, now);

  if (days < 0) {
    return [{ kind, subject, detail: `оплата истекла ${daysAgoOf(-days)} назад` }];
  }

  if (days > warnDays) {
    return [];
  }

  return [{ kind, subject, detail: `оплачен до ${dayOf(paidUntil)}` }];
}

/**
 * Индикатор сервера: агрегат health его окружений плюс срок оплаты.
 *
 * Просрочка даёт предупреждение, а не аварию: авария означает наблюдаемую
 * недоступность, а неоплаченная машина может работать ещё неделю.
 * Смешивать бухгалтерию с наблюдением значит обесценить красный индикатор.
 */
export function serverIndicatorOf(
  environments: EnvironmentStatus[],
  paidUntil: string | null,
  now: Date,
): StatusIndicator {
  const checked = environments.filter((environment) => environment.health !== null);
  const warnings = serverWarningsOf('', paidUntil, now);

  if (checked.length > 0 && checked.every((environment) => environment.health === HealthState.Down)) {
    return StatusIndicator.Down;
  }

  const hasDown = checked.some((environment) => environment.health === HealthState.Down);

  if (hasDown || warnings.length > 0) {
    return StatusIndicator.Warning;
  }

  // Оплата — не наблюдение: машина, которую никто не проверяет, не может
  // быть «в порядке», сколько бы вперёд она ни была оплачена. Так же
  // поступает indicatorOf с проектом без единого результата проверки.
  return checked.length === 0 ? StatusIndicator.Unknown : StatusIndicator.Ok;
}

/** Полных суток от начала сегодняшнего дня до даты срока; отрицательное — просрочка. */
function daysUntil(isoDay: string, now: Date): number {
  const target = Date.parse(`${isoDay}T00:00:00Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return Math.round((target - today) / DAY_MS);
}

/** Склоняет дни для текста о просрочке. */
function daysAgoOf(days: number): string {
  const lastTwo = days % 100;
  const last = days % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return `${days} дней`;
  }

  if (last === 1) {
    return `${days} день`;
  }

  if (last >= 2 && last <= 4) {
    return `${days} дня`;
  }

  return `${days} дней`;
}
