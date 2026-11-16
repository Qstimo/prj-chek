import {
  DOMAIN_RENEWAL_WARN_DAYS,
  HealthState,
  SERVER_WARN_DAYS,
  ProjectLifecycle,
  StatusCheckCode,
  StatusIndicator,
  StatusWarningKind,
  type DomainStatus,
  type EnvironmentStatus,
  type StatusWarning,
} from '@cairn/shared';

import { pluralOf } from '../common/plural';
import { isMisconfigured } from './checkers/failure';

/** Предупреждать о TLS за две недели. */
export const TLS_WARN_DAYS = 14;

/** Предупреждать о сроке домена за месяц. */
export const DOMAIN_WARN_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Собирает предупреждения из статусов адресов (ТЗ 6): мёртвые адреса,
 * неверно настроенные ручки, недоверенные и истекающие сертификаты,
 * близкие сроки регистрации, ошибки проверок.
 *
 * Окружения в сигнатуру не входят: всё, о чём предупреждают, принадлежит
 * адресу. «Стейдж не отвечает» не говорит, что чинить, — адрес говорит.
 *
 * Рядом с фразой каждое предупреждение несёт структурные поля — код,
 * срок, порог, день: `kind` доезжал до веба и выбрасывался, а
 * расшифровать «что это значит и что делать» по склеенному тексту нельзя.
 */
export function warningsOf(domains: DomainStatus[], now: Date): StatusWarning[] {
  const warnings: StatusWarning[] = [];

  for (const domain of domains) {
    warnings.push(...healthWarningsOf(domain));
    warnings.push(...tlsWarningsOf(domain, now));
    warnings.push(...registryWarningsOf(domain, now));
  }

  return warnings;
}

/**
 * Предупреждения о доступности адреса.
 *
 * Падение и неверно настроенная ручка — разные беды с разным лечением:
 * первую чинят на сервере, вторую в поле «путь проверки». Пометки
 * «закрыто авторизацией» и «метод не разрешён» предупреждениями не
 * становятся вовсе: это рабочее состояние стенда, и будить по нему
 * некого.
 */
function healthWarningsOf(domain: DomainStatus): StatusWarning[] {
  if (domain.health === HealthState.Down) {
    return [
      {
        kind: StatusWarningKind.HealthDown,
        subject: domain.name,
        detail: domain.healthError ?? 'не отвечает',
        ...codeOf(domain.healthCode),
      },
    ];
  }

  if (isMisconfigured(domain.healthCode)) {
    return [
      {
        kind: StatusWarningKind.HealthCheckMisconfigured,
        subject: domain.name,
        detail: domain.healthError ?? 'ручка проверки отвечает отказом',
        ...codeOf(domain.healthCode),
      },
    ];
  }

  return [];
}

/**
 * Предупреждения о сертификате: доверие прежде срока.
 *
 * Порядок правил и есть решение. Сертификат, которому не доверяют,
 * уже закрыл доступ клиентам — и сообщать о его далёком сроке значит
 * успокаивать ложно; именно отсюда росло «не отвечает» рядом с зелёным
 * «TLS до 2027-03-01». Истёкший отделён от истекающего: пока срок
 * считался одним условием «меньше порога», они были неотличимы.
 */
function tlsWarningsOf(domain: DomainStatus, now: Date): StatusWarning[] {
  const date = domain.tlsValidTo ? dayOf(domain.tlsValidTo) : undefined;
  const days = domain.tlsValidTo ? daysUntil(domain.tlsValidTo, now) : undefined;

  if (domain.tlsTrusted === false) {
    const expired = domain.tlsCode === StatusCheckCode.CertificateExpired || (days ?? 0) < 0;

    return [
      {
        kind: expired ? StatusWarningKind.TlsExpired : StatusWarningKind.TlsInvalid,
        subject: domain.name,
        detail: domain.tlsError ?? 'сертификат не вызывает доверия',
        ...codeOf(domain.tlsCode),
        ...(days === undefined ? {} : { days }),
        ...(date === undefined ? {} : { date }),
      },
    ];
  }

  // Рукопожатия не было: о сертификате не известно ничего — ни срока, ни
  // доверия. Это не то же, что «сертификату не доверяем».
  if (domain.tlsError) {
    return [
      {
        kind: StatusWarningKind.TlsError,
        subject: domain.name,
        detail: domain.tlsError,
        ...codeOf(domain.tlsCode),
      },
    ];
  }

  if (days === undefined || date === undefined) {
    return [];
  }

  if (days < 0) {
    return [
      {
        kind: StatusWarningKind.TlsExpired,
        subject: domain.name,
        detail: `TLS истёк ${date}`,
        days,
        date,
      },
    ];
  }

  return days <= TLS_WARN_DAYS
    ? [
        {
          kind: StatusWarningKind.TlsExpiring,
          subject: domain.name,
          detail: `TLS истекает ${date}`,
          days,
          threshold: TLS_WARN_DAYS,
          date,
        },
      ]
    : [];
}

/** Предупреждение о сроке регистрации по данным реестра зоны. */
function registryWarningsOf(domain: DomainStatus, now: Date): StatusWarning[] {
  if (!domain.registryExpiresAt) {
    return [];
  }

  const days = daysUntil(domain.registryExpiresAt, now);
  const date = dayOf(domain.registryExpiresAt);

  if (days > DOMAIN_WARN_DAYS) {
    return [];
  }

  return [
    {
      kind: StatusWarningKind.DomainExpiring,
      subject: domain.name,
      detail: days < 0 ? `домен истёк ${date}` : `домен истекает ${date}`,
      days,
      threshold: DOMAIN_WARN_DAYS,
      date,
    },
  ];
}

/** Код в предупреждении, когда он есть: пустого поля в выдаче не бывает. */
function codeOf(code: StatusCheckCode | null): { code?: StatusCheckCode } {
  return code === null ? {} : { code };
}

/**
 * Индикатор проекта (спека 5): приостановлен → авария → предупреждение →
 * в порядке → неизвестно. Порядок правил и есть приоритет.
 *
 * Считается только по адресам проекта. Предупреждения реестра — сроки
 * оплаты машин, сроки продления корней, расхождение привязки — сюда не
 * входят: межпроектную машину и корневой домен правит один суперадмин, и
 * проекту по такому предупреждению делать нечего. Красный индикатор, на
 * который нельзя ответить действием, обесценивает красный индикатор,
 * на который ответить можно.
 */
export function indicatorOf(
  lifecycle: ProjectLifecycle,
  domains: DomainStatus[],
  now: Date,
): StatusIndicator {
  if (lifecycle === ProjectLifecycle.Paused) {
    return StatusIndicator.Paused;
  }

  if (domains.some((domain) => domain.health === HealthState.Down)) {
    return StatusIndicator.Down;
  }

  if (warningsOf(domains, now).length > 0) {
    return StatusIndicator.Warning;
  }

  return domains.some((domain) => domain.checkedAt !== null)
    ? StatusIndicator.Ok
    : StatusIndicator.Unknown;
}

/** День без времени для человеческого текста и для поля `date`. */
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

/**
 * Индикатор корневого домена.
 *
 * У домена нет наблюдаемой доступности — он не «падает», — поэтому
 * `Down` здесь не бывает вовсе, а `Unknown` означает, что срок продления
 * не задан и оплата не отслеживается.
 */
export function domainIndicatorOf(
  name: string,
  paidUntil: string | null,
  now: Date,
): StatusIndicator {
  if (!paidUntil) {
    return StatusIndicator.Unknown;
  }

  return domainRenewalWarningsOf(name, paidUntil, now).length > 0
    ? StatusIndicator.Warning
    : StatusIndicator.Ok;
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
  const date = dayOf(paidUntil);

  if (days < 0) {
    return [
      {
        kind,
        subject,
        detail: `оплата истекла ${daysAgoOf(-days)} назад`,
        days,
        threshold: warnDays,
        date,
      },
    ];
  }

  if (days > warnDays) {
    return [];
  }

  return [{ kind, subject, detail: `оплачен до ${date}`, days, threshold: warnDays, date }];
}

/**
 * Индикатор сервера: агрегат health его окружений плюс срок оплаты.
 *
 * Просрочка даёт предупреждение, а не аварию: авария означает наблюдаемую
 * недоступность, а неоплаченная машина может работать ещё неделю.
 * Смешивать бухгалтерию с наблюдением значит обесценить красный индикатор.
 *
 * Срок оплаты здесь индикатор красит — в отличие от индикатора проекта:
 * это экран реестра, и смотрит на него тот самый суперадмин, который
 * оплату и продлевает.
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

/**
 * Полных суток от начала сегодняшних суток до начала суток срока;
 * отрицательное — просрочка.
 *
 * Одна договорённость на все сроки системы — сертификат, регистрацию,
 * оплату машины и корня: граница суток по UTC. Сроки считались по-разному
 * (у сертификата — вычитанием отметок времени, у оплаты — по календарным
 * суткам), и «истекает через 14 дней» означало разное у разных сроков, а
 * день в тексте приходил из третьего места. Часовой пояс — UTC и только
 * он: день без времени не должен зависеть от того, где стоит сервер.
 *
 * Принимает и отметку времени, и день `ГГГГ-ММ-ДД`: берутся первые десять
 * знаков, то есть день по UTC — тот же, что уезжает в поле `date`.
 */
function daysUntil(iso: string, now: Date): number {
  const target = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return Math.round((target - today) / DAY_MS);
}

/** Склоняет дни для текста о просрочке. */
function daysAgoOf(days: number): string {
  return `${days} ${pluralOf(days, ['день', 'дня', 'дней'])}`;
}
