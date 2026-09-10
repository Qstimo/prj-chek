/** Секции проекта. Список закрытый: секции являются единицами выдачи доступа (ТЗ 3). */
export enum Section {
  /** Паспорт проекта. */
  Info = 'info',
  /** Окружения, серверы, домены. */
  Infrastructure = 'infrastructure',
  /** Конфигурация по окружениям. */
  Variables = 'variables',
  /** Страницы документации. */
  Docs = 'docs',
  /** Версии и чекпоинты. */
  Roadmap = 'roadmap',
  /** Лента событий проекта. */
  Chronicle = 'chronicle',
}

/**
 * Уровни доступа к секции.
 *
 * Уровень «нет» из ТЗ 4.2 здесь отсутствует намеренно: он выражается
 * отсутствием строки выдачи. Два способа записать одно состояние неизбежно
 * разошлись бы в выборках (спека 4.3).
 */
export enum AccessLevel {
  /** Видно, что объекты есть, и их описания; содержимое скрыто. */
  Metadata = 'metadata',
  /** Видно содержимое. */
  Read = 'read',
  /** Можно изменять. */
  Write = 'write',
}

/** Виды субъектов доступа. Люди и машины живут в одной модели прав (ТЗ 2). */
export enum SubjectKind {
  /** Человек с аутентификацией. */
  User = 'user',
  /** Машинный субъект для доступа нейросети. */
  AgentToken = 'agent_token',
  /** Машинный субъект для входящих данных. */
  IntakeAddress = 'intake_address',
}

/**
 * Виды действующих лиц в журнале.
 *
 * Отдельный перечень, расширяющий {@link SubjectKind} значением `system` для
 * действий с консоли сервера, у которых субъекта нет вовсе (спека 4.7).
 * Объединять эти два перечисления нельзя.
 */
export enum AuditSubjectKind {
  User = 'user',
  AgentToken = 'agent_token',
  IntakeAddress = 'intake_address',
  /** Действие оператора с консоли сервера. */
  System = 'system',
}

/** Состояние жизненного цикла проекта. Означает намерение, а не доступность (ТЗ 3.1). */
export enum ProjectLifecycle {
  Development = 'development',
  Active = 'active',
  Paused = 'paused',
  Archived = 'archived',
}

/**
 * Источник записи хроники: как она попала в систему (ТЗ 5.3).
 *
 * Значение `email` появится вместе с приёмом почты.
 */
export enum ChronicleSource {
  /** Добавлена человеком в интерфейсе. */
  Manual = 'manual',
  /** Пришла на приёмный адрес по webhook. */
  Webhook = 'webhook',
}

/**
 * Вид окружения (ТЗ 3.2).
 *
 * Список закрытый, но значение `Other` оставляет место окружениям,
 * которых в нём нет: ТЗ прямо допускает «любые другие». Вид нужен, чтобы
 * система отличала прод от остального, не угадывая это по названию.
 */
export enum EnvironmentKind {
  Production = 'production',
  Staging = 'staging',
  Development = 'development',
  Other = 'other',
}

/**
 * Индикатор статуса проекта (ТЗ 6). Вычисляется, руками не задаётся;
 * единственное ручное состояние — «приостановлен» — приходит из
 * жизненного цикла проекта.
 */
export enum StatusIndicator {
  Ok = 'ok',
  Warning = 'warning',
  Down = 'down',
  Unknown = 'unknown',
  Paused = 'paused',
}

/** Результат health-проверки окружения. */
export enum HealthState {
  Up = 'up',
  Down = 'down',
}

/** Вид предупреждения о статусе. */
export enum StatusWarningKind {
  HealthDown = 'health_down',
  TlsExpiring = 'tls_expiring',
  TlsError = 'tls_error',
  DomainExpiring = 'domain_expiring',
  /** Близок или прошёл срок оплаты сервера. */
  ServerExpiring = 'server_expiring',
  /**
   * Близок или прошёл срок продления домена по данным реестра CAIRN.
   *
   * Отдельно от {@link StatusWarningKind.DomainExpiring}: тот приходит из
   * RDAP и говорит о регистрации в зоне, этот — о нашей оплате. Зоны без
   * RDAP молчат, и ручная дата для них единственный источник.
   */
  DomainRenewalExpiring = 'domain_renewal_expiring',
}

/** Состояние версии роадмапа. Намерение, задаётся вручную (ТЗ 3.5). */
export enum RoadmapVersionState {
  Planned = 'planned',
  InProgress = 'in_progress',
  Released = 'released',
}

/** Вид одноразовой ссылки на установку пароля (спека 4.6). */
export enum InvitationKind {
  /** Первичное приглашение. */
  Invitation = 'invitation',
  /** Сброс пароля действующему пользователю. */
  PasswordReset = 'password_reset',
}
