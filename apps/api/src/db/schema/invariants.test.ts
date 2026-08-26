import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { auditLog } from './audit-log';
import { grants } from './grants';
import { invitations } from './invitations';
import { projects } from './projects';
import { sessions } from './sessions';
import { subjects } from './subjects';
import { totpChallenges } from './totp-challenges';
import { users } from './users';

/**
 * Все таблицы системы. Перечислены явно, а не собраны из barrel-экспорта:
 * так добавление таблицы требует осознанного включения её в проверки.
 */
const ALL_TABLES = [
  { name: 'subjects', table: subjects },
  { name: 'users', table: users },
  { name: 'projects', table: projects },
  { name: 'grants', table: grants },
  { name: 'sessions', table: sessions },
  { name: 'invitations', table: invitations },
  { name: 'totp_challenges', table: totpChallenges },
  { name: 'audit_log', table: auditLog },
];

describe('внешние ключи', () => {
  it.each(ALL_TABLES)('$name не удаляет строки каскадом', ({ table }) => {
    // Каскад разорвал бы связи в журнале, который обязан оставаться полным
    // (спека 4.1). Проверяется на всех ссылках, а не выборочно: одна забытая
    // ссылка с каскадом обесценивает правило целиком.
    const cascading = getTableConfig(table)
      .foreignKeys.map((key) => key.onDelete)
      .filter((action) => action !== 'restrict');

    expect(cascading).toEqual([]);
  });

  it('в системе объявлены внешние ключи', () => {
    // Страховка от вырожденной проверки выше: если бы ссылок не было вовсе,
    // предыдущий тест проходил бы, ничего не проверяя.
    const total = ALL_TABLES.reduce(
      (count, { table }) => count + getTableConfig(table).foreignKeys.length,
      0,
    );

    expect(total).toBeGreaterThanOrEqual(10);
  });
});

describe('уникальные ограничения', () => {
  it('выдача уникальна по тройке «субъект × проект × секция»', () => {
    // Две выдачи на одну пару разошлись бы в выборках, и часть запросов
    // начала бы отдавать лишнее (спека 4.3).
    const unique = getTableConfig(grants).uniqueConstraints.find(
      (constraint) => constraint.name === 'grants_subject_project_section',
    );

    expect(unique?.columns.map((column) => column.name).sort()).toEqual([
      'project_id',
      'section',
      'subject_id',
    ]);
  });

  it('адрес пользователя уникален', () => {
    expect(users.email.isUnique).toBe(true);
  });

  it('субъект пользователя уникален', () => {
    // Связь с субъектом — один к одному (спека 4.2).
    expect(users.subjectId.isUnique).toBe(true);
  });

  it('токены сессий, ссылок и челленджей уникальны', () => {
    expect(sessions.tokenHash.isUnique).toBe(true);
    expect(invitations.tokenHash.isUnique).toBe(true);
    expect(totpChallenges.tokenHash.isUnique).toBe(true);
  });
});

describe('индексы', () => {
  it('выдачи проиндексированы по проекту', () => {
    // Горячий путь матрицы доступов.
    expect(indexNames(grants)).toContain('grants_project_idx');
  });

  it('выдачи проиндексированы по субъекту', () => {
    // Горячий путь разрешения уровня доступа (спека 5.2).
    expect(indexNames(grants)).toContain('grants_subject_idx');
  });

  it('сессии проиндексированы по субъекту', () => {
    // Массовый отзыв сессий при отзыве субъекта (спека 4.5).
    expect(indexNames(sessions)).toContain('sessions_subject_idx');
  });

  it('журнал проиндексирован по дате, субъекту и проекту', () => {
    // Три фильтра экрана журнала (спека 9.1).
    expect(indexNames(auditLog)).toEqual(
      expect.arrayContaining([
        'audit_log_created_at_idx',
        'audit_log_subject_idx',
        'audit_log_project_idx',
      ]),
    );
  });
});

describe('обязательность полей', () => {
  it('счётчик попыток второго фактора обязателен и числовой', () => {
    // Необязательный счётчик означал бы, что попытки можно не считать,
    // и предел из спеки 6.2 перестал бы работать.
    expect(totpChallenges.attempts.notNull).toBe(true);
    expect(totpChallenges.attempts.dataType).toBe('number');
  });

  it('метка и вид действующего лица в журнале обязательны', () => {
    // Запись без них нечитаема после отзыва субъекта (спека 4.7).
    expect(auditLog.subjectKind.notNull).toBe(true);
    expect(auditLog.subjectLabel.notNull).toBe(true);
  });

  it('вид ссылки обязателен', () => {
    // По нему различаются приглашение и сброс пароля (спека 4.6).
    expect(invitations.kind.notNull).toBe(true);
  });

  it('автор выдачи обязателен', () => {
    // Журнал выдач без автора не отвечает на вопрос «кто выдал» (ТЗ 4.4).
    expect(grants.grantedBy.notNull).toBe(true);
  });

  it('секрет второго фактора и ссылка на репозиторий необязательны', () => {
    expect(users.totpSecretEncrypted.notNull).toBe(false);
    expect(projects.repoUrl.notNull).toBe(false);
  });
});

/** Возвращает имена индексов таблицы. */
function indexNames(table: (typeof ALL_TABLES)[number]['table']): string[] {
  return getTableConfig(table).indexes.map((index) => index.config.name ?? '');
}
