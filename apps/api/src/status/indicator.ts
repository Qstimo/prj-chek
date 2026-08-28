import {
  HealthState,
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
 */
export function indicatorOf(
  lifecycle: ProjectLifecycle,
  environments: EnvironmentStatus[],
  domains: DomainStatus[],
  now: Date,
): StatusIndicator {
  if (lifecycle === ProjectLifecycle.Paused) {
    return StatusIndicator.Paused;
  }

  if (environments.some((environment) => environment.health === HealthState.Down)) {
    return StatusIndicator.Down;
  }

  if (warningsOf(environments, domains, now).length > 0) {
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
