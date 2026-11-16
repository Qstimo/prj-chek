import type { AuditSubjectKind } from '@cairn/shared';

/** Типы действий, фиксируемых в журнале на этапе 1 (спека 7.2). */
export enum AuditAction {
  LoginSucceeded = 'login.succeeded',
  LoginFailed = 'login.failed',
  LogoutPerformed = 'logout.performed',
  TotpFailed = 'totp.failed',
  TotpChallengeExhausted = 'totp.challenge_exhausted',
  TotpEnabled = 'totp.enabled',
  TotpReset = 'totp.reset',
  PushSubscribed = 'push.subscribed',
  PushUnsubscribed = 'push.unsubscribed',
  ProjectCreated = 'project.created',
  ProjectUpdated = 'project.updated',
  PlatformCreated = 'platform.created',
  PlatformUpdated = 'platform.updated',
  PlatformDeleted = 'platform.deleted',
  PlatformReleaseSet = 'platform_release.set',
  PlatformReleaseCleared = 'platform_release.cleared',
  EnvironmentCreated = 'environment.created',
  EnvironmentUpdated = 'environment.updated',
  EnvironmentDeleted = 'environment.deleted',
  ChronicleEntryCreated = 'chronicle_entry.created',
  ChronicleEntryUpdated = 'chronicle_entry.updated',
  ChronicleEntryDeleted = 'chronicle_entry.deleted',
  SummaryCreated = 'summary.created',
  /**
   * Пишется **до** обращения к предложителю задач, в своей короткой
   * транзакции, и означает ровно одно: «текст ушёл на такой-то адрес».
   *
   * Отступление от правила «журнал в одной транзакции с действием»
   * названное: действие здесь — не изменение в базе, а исходящая
   * передача, и запись после успеха потерялась бы при падении процесса,
   * оставив текст созвона ушедшим наружу без следа. Обратный порядок даёт
   * обратную гарантию: нет записи — нет и передачи. Цена — запись, после
   * которой может не оказаться пары; это читается как «исход неизвестен»,
   * а не как «отказ», и так честнее. Удача отдельной записи не получает.
   */
  SummaryTasksSuggested = 'summary.tasks_suggested',
  SummaryTasksSuggestionFailed = 'summary.tasks_suggestion_failed',
  SummaryDeleted = 'summary.deleted',
  IntakeAddressCreated = 'intake_address.created',
  IntakeAddressRevoked = 'intake_address.revoked',
  VariableCreated = 'variable.created',
  VariableUpdated = 'variable.updated',
  VariableDeleted = 'variable.deleted',
  VariableRevealed = 'variable.revealed',
  VariableRolledBack = 'variable.rolled_back',
  VariablesImported = 'variables.imported',
  VariablesExported = 'variables.exported',
  RoadmapVersionCreated = 'roadmap_version.created',
  RoadmapVersionUpdated = 'roadmap_version.updated',
  RoadmapVersionDeleted = 'roadmap_version.deleted',
  CheckpointCreated = 'checkpoint.created',
  CheckpointUpdated = 'checkpoint.updated',
  CheckpointDeleted = 'checkpoint.deleted',
  /**
   * Своё действие, а не `checkpoint.updated`: перенос в другую версию
   * иначе был бы в журнале неотличим от переименования, а метаданные
   * записи на экране журнала не показываются.
   */
  CheckpointCarriedOver = 'checkpoint.carried_over',
  RoadmapPublished = 'roadmap.published',
  RoadmapUnpublished = 'roadmap.unpublished',
  /**
   * Свои действия, а не `roadmap.published`: ссылка на отчёт раскрывает
   * одну версию, а не весь роадмап, и по журналу обязано быть видно, что
   * именно открыли наружу. Публичное чтение в журнал не пишется — у
   * анонимного читателя субъекта нет.
   */
  ReleaseReportPublished = 'release_report.published',
  ReleaseReportUnpublished = 'release_report.unpublished',
  StatusCheckRun = 'status_check.run',
  DomainCreated = 'domain.created',
  DomainUpdated = 'domain.updated',
  DomainDeleted = 'domain.deleted',
  ServerCreated = 'server.created',
  ServerUpdated = 'server.updated',
  ServerDeleted = 'server.deleted',
  DocPageCreated = 'doc_page.created',
  DocPageUpdated = 'doc_page.updated',
  DocPageDeleted = 'doc_page.deleted',
  AgentTokenCreated = 'agent_token.created',
  AgentTokenUpdated = 'agent_token.updated',
  AgentTokenRevoked = 'agent_token.revoked',
  AgentToolCalled = 'agent.tool_called',
  UserUpdated = 'user.updated',
  GrantCreated = 'grant.created',
  GrantUpdated = 'grant.updated',
  GrantRevoked = 'grant.revoked',
  InvitationCreated = 'invitation.created',
  InvitationReissued = 'invitation.reissued',
  InvitationAccepted = 'invitation.accepted',
  PasswordResetRequested = 'password_reset.requested',
  PasswordResetCompleted = 'password_reset.completed',
  SubjectRevoked = 'subject.revoked',
  SubjectRestored = 'subject.restored',
  SuperadminCreated = 'superadmin.created',
}

/**
 * Действующее лицо записи: субъект системы либо консоль сервера.
 *
 * Размеченное объединение: у действий с консоли субъекта нет вовсе,
 * и тип обязан это отражать (спека 4.7).
 */
export type AuditActor =
  | { kind: Exclude<AuditSubjectKind, AuditSubjectKind.System>; id: string; label: string }
  | { kind: AuditSubjectKind.System; id: null; label: string };

/** Данные для записи в журнал. */
export interface AuditEntryInput {
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  projectId?: string;
  metadata?: Record<string, unknown>;
}
