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
  /**
   * Своё действие, а не `project.updated`: набор тегов правится своей
   * ручкой и целиком, и запись «изменены поля паспорта» не сказала бы,
   * что проект перестал быть «Web».
   */
  ProjectTagsSet = 'project_tags.set',
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
  SummaryTasksArchived = 'summary.tasks_archived',
  SummaryTasksRestored = 'summary.tasks_restored',
  SummaryTasksDeleted = 'summary.tasks_deleted',
  SummaryReleased = 'summary.released',
  SummaryTasksTransferred = 'summary.tasks_transferred',
  SummaryDeleted = 'summary.deleted',
  /** Запись созвона дотекла на том: задача расшифровки заведена. */
  SummaryRecordingUploaded = 'summary.recording_uploaded',
  /**
   * Пишется **до** первого байта наружу, в своей короткой транзакции.
   *
   * То же осознанное отступление от правила «журнал в одной транзакции с
   * действием», что у разбивки текста, и здесь оно весит больше: **в
   * записи созвона есть всё сказанное**, включая то, чего в саммари нет.
   * Нет записи — нет и передачи.
   *
   * В метаданных размер и тип **дорожки**: наружу уходит она, а не
   * загруженный файл. Размер загруженного там же, но отвечает на другой
   * вопрос — «из чего это сделано» (дизайн расшифровки, 9.1).
   */
  SummaryTranscriptionRequested = 'summary.transcription_requested',
  SummaryTranscriptionFailed = 'summary.transcription_failed',
  /**
   * **Каждый** переход в `done`: текст уложен.
   *
   * Пишется и у первой расшифровки, хотя её саммари уже журналируется
   * парой `chronicle_entry.created` + `summary.created`. Причина не в
   * полноте описания, а в том, что первый успех делает кое-что ещё: **он
   * уничтожает загруженный человеком файл**. Удаление данных, которые
   * человек нам дал, обязано быть в неизменяемом журнале — иначе на вопрос
   * «куда девался мой файл на полгигабайта» отвечать нечем, кроме
   * исходного кода.
   */
  SummaryTranscribed = 'summary.transcribed',
  /** Удалена задача расшифровки, не ставшая саммари. */
  SummaryTranscriptionDeleted = 'summary.transcription_deleted',
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
  /**
   * Задача реестра проекта. Три действия, а не два: удаление уносит
   * формулировку целиком, и отличить его от правки по журналу обязано
   * быть можно — метаданные на экране журнала не показываются.
   */
  TaskCreated = 'task.created',
  TaskUpdated = 'task.updated',
  TaskDeleted = 'task.deleted',
  /**
   * Задачу вынули из версии. Своё действие, а не `task.updated`: это
   * правка **роадмапа** (прогресс версии меняется), а не правка задачи,
   * и в журнале одно от другого отличаться обязано.
   */
  TaskDetached = 'task.detached',
  /**
   * Формулировка задачи ушла во внешний трекер.
   *
   * Пишется **до первого байта наружу**, своей короткой транзакцией — то же
   * названное отступление от правила «журнал в одной транзакции с
   * действием», что у разбивки текста и расшифровки записи, и по той же
   * причине: действие здесь не изменение в базе, а исходящая передача
   * содержимого проекта. Запись после успеха потерялась бы при падении
   * процесса, оставив формулировки ушедшими наружу без следа. Обратный
   * порядок даёт обратную гарантию: нет записи — нет и передачи; цена —
   * запись, после которой может не оказаться пары, и это читается как
   * «исход неизвестен», а не как «уехало».
   *
   * Отдельной записи об удаче нет: исход виден в строке выгрузки
   * (`task_exports.failure_code` и зеркало) и на экране задачи, а вторая
   * запись о том же событии разошлась бы с первой на первой же правке.
   *
   * Формулировка в метаданных **есть**, в отличие от правки задачи: она и
   * так уходит наружу, и журнал передачи, умалчивающий о том, что передали,
   * не отвечает на единственный вопрос, ради которого он пишется. Токена в
   * метаданных нет никогда — ни под каким именем.
   */
  TaskExported = 'task.exported',
  /**
   * Та же передача, но задача в трекере уже была: повторная выгрузка её
   * правит (`PUT /tm/tasks/{id}`), а не заводит вторую.
   *
   * Своё действие, а не метаданные у `task.exported`: метаданные на экране
   * журнала не показываются ни у одного действия, значит название обязано
   * отвечать на вопрос «что произошло» само. «Задача выгружена» о задаче,
   * которая уехала в прошлом месяце, читалось бы как появление второй
   * задачи в чужом трекере — а её там не появилось.
   */
  TaskExportUpdated = 'task.export_updated',
  TaskTrackerLinked = 'task.tracker_linked',
  TaskImported = 'task.imported',
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
  ModelServiceUpdated = 'model_service.updated',
  /**
   * Своё действие, а не метаданные у `model_service.updated`: метаданные
   * записи на экране журнала не показываются ни у одного действия, значит
   * название обязано отвечать на вопрос «что произошло» само. «Изменена
   * настройка службы модели» с `secretChanged: true` в метаданных
   * прочитать глазами нельзя; «Изменён ключ службы модели» — можно.
   *
   * И смена ключа — единственная правка здесь, которая невосстановима
   * (версий значения нет) и способна сломать работающую установку молча,
   * до первого вызова (дизайн, 11.2).
   */
  ModelServiceSecretSet = 'model_service.secret_set',
  ModelServiceCleared = 'model_service.cleared',
  ModelServiceProbed = 'model_service.probed',
  /**
   * Подключение внешнего трекера задач. **Четыре действия, а не пять**
   * (дизайн задач и Weeek, 7).
   *
   * Пятого, «подключение снято», нет намеренно: у узла модели
   * `model_service.cleared` означает событие — «настройка вернулась к
   * окружению», — а у трекера возвращаться некуда (запасного источника в
   * окружении нет вовсе, дизайн 3.4), и снятие подключения это просто его
   * правка. Отличается она значением `action` в метаданных.
   */
  TrackerConnectionUpdated = 'tracker.connection_updated',
  /**
   * Своё действие, а не метаданные у правки подключения, — по тому же
   * правилу, что `model_service.secret_set`: метаданные на экране журнала
   * не показываются, значит название обязано отвечать на вопрос «что
   * произошло» само. Токен невосстановим (версий у него нет) и способен
   * сломать выгрузку молча, до первого вызова.
   */
  TrackerSecretSet = 'tracker.secret_set',
  /**
   * Куда выгружать задачи проекта. Принадлежит проекту, в отличие от трёх
   * остальных: `projectId` у записи назван.
   */
  TrackerBindingSet = 'tracker.binding_set',
  TrackerProbed = 'tracker.probed',
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
