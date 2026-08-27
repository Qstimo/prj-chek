import { AuditSubjectKind } from '@cairn/shared';

/**
 * Названия действий на русском.
 *
 * Ключи совпадают со значениями перечисления бэкенда. Действие без перевода
 * показывается как есть: пропущенный перевод не должен прятать событие.
 */
export const ACTION_LABELS: Record<string, string> = {
  'login.succeeded': 'Вход',
  'login.failed': 'Неудачная попытка входа',
  'logout.performed': 'Выход',
  'totp.failed': 'Неверный код второго фактора',
  'totp.challenge_exhausted': 'Попытки кода исчерпаны',
  'totp.enabled': 'Привязан второй фактор',
  'totp.reset': 'Сброшен второй фактор',
  'project.created': 'Создан проект',
  'project.updated': 'Изменён проект',
  'grant.created': 'Выдан доступ',
  'grant.updated': 'Изменён доступ',
  'grant.revoked': 'Отозван доступ',
  'invitation.created': 'Создано приглашение',
  'invitation.reissued': 'Приглашение выдано повторно',
  'invitation.accepted': 'Приглашение принято',
  'password_reset.requested': 'Запрошен сброс пароля',
  'password_reset.completed': 'Пароль установлен',
  'subject.revoked': 'Отозван доступ субъекту',
  'subject.restored': 'Доступ субъекта восстановлен',
  'superadmin.created': 'Создан суперадминистратор',
};

/** Названия видов действующих лиц. */
export const SUBJECT_KIND_LABELS: Record<AuditSubjectKind, string> = {
  [AuditSubjectKind.User]: 'Человек',
  [AuditSubjectKind.AgentToken]: 'Агент',
  [AuditSubjectKind.IntakeAddress]: 'Приёмный адрес',
  [AuditSubjectKind.System]: 'Консоль',
};
