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
  ProjectCreated = 'project.created',
  ProjectUpdated = 'project.updated',
  EnvironmentCreated = 'environment.created',
  EnvironmentUpdated = 'environment.updated',
  EnvironmentDeleted = 'environment.deleted',
  ChronicleEntryCreated = 'chronicle_entry.created',
  ChronicleEntryUpdated = 'chronicle_entry.updated',
  ChronicleEntryDeleted = 'chronicle_entry.deleted',
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
  RoadmapPublished = 'roadmap.published',
  RoadmapUnpublished = 'roadmap.unpublished',
  StatusCheckRun = 'status_check.run',
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
