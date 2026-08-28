# CAIRN этап 3 «Приёмный канал и хроника» — план реализации

> **Для исполнителя:** ОБЯЗАТЕЛЬНО веди работу через superpowers:executing-plans (или superpowers:subagent-driven-development, если доступны субагенты). Шаги отмечаются чекбоксами (`- [ ]`).

**Цель:** реализовать секцию «Хроника» и приёмный канал: уникальный адрес проекта, по которому внешние инструменты кладут сводки в хронику без входа в интерфейс.

**Архитектура:** модуль `apps/api/src/chronicle/` повторяет рисунок `environments/`; приёмный адрес — не таблица, а субъект вида `intake_address` с обычной выдачей «хроника × запись», и webhook пишет через тот же репозиторий с той же проверкой прав. Контракт в `packages/shared`.

**Стек:** тот же — NestJS, Drizzle, PostgreSQL, zod, Next.js 15, TanStack Query, Vitest, Testcontainers.

**Основание:** `docs/superpowers/specs/2026-08-28-cairn-stage3-design.md`.

---

## Ключевые правила для исполнителя

1. **TDD без исключений**: падающий тест → реализация → зелёный прогон → коммит.
2. **Проверка прав только в репозитории** (субъект первым аргументом, `requireLevel` внутри). Webhook не обходит проверку, а исполняет её от лица машинного субъекта.
3. **Проекция до контроллера** через `projectByLevel`.
4. **Отсутствие доступа — `404`**, недостаточный уровень — `403`; ошибки — `SectionNotVisibleError` / `InsufficientLevelError` из этапа 1.
5. **Каскадов нет** — все внешние ключи `restrict`; проверяет `invariants.test.ts`.
6. **Журнал в одной транзакции** с изменением.
7. **Коммит после каждой задачи**, сообщения по-русски в повелительном наклонении.

---

## Структура файлов

**`packages/shared/src/`**
- `enums.ts` — `ChronicleSource` (`manual` / `webhook`).
- `schemas/chronicle.ts` — проекции, создание, правка записи.
- `schemas/intake.ts` — ответ с адресом, тело webhook.
- `index.ts` — barrel export.

**`apps/api/src/db/schema/`**
- `chronicle.ts` — таблица `chronicle_entries` и перечисление источника.
- `index.ts`, `invariants.test.ts` — дополняются.

**`apps/api/src/chronicle/`** — секция «Хроника».
- `chronicle.projection.ts`, `chronicle.repository.ts`, `chronicle.service.ts`, `chronicle.controller.ts`, `chronicle.module.ts`.

**`apps/api/src/intake/`** — приёмный канал.
- `intake.service.ts` — адрес: создание, отзыв, поиск; разрешение токена.
- `intake.controller.ts` — управление адресом (в проекте) и `POST /intake/:token`.
- `intake.module.ts`.

**`apps/api/src/audit/audit.types.ts`** — пять новых действий.

**`apps/api/src/main.ts`** — разбор `text/plain` для webhook.

**`apps/api/test/`** — `chronicle.e2e.test.ts`, `intake.e2e.test.ts`; `access-matrix.e2e.test.ts` дополняется.

**`apps/web/src/`**
- `api/hooks/useQueryChronicle.ts`, `useMutationChronicleEntry.ts`, `useQueryIntakeAddress.ts`, `useMutationIntakeAddress.ts`.
- `components/ChronicleEntry/`, `ChronicleList/`, `ChronicleForm/`, `IntakeAddressPanel/`.
- `app/(app)/projects/[id]/chronicle/page.tsx`, `ChronicleScreen.tsx`.
- `components/ProjectSections/` — ссылка «Хроника».

**`scripts/e2e.mjs`** — сценарий канала.

---

## Порядок чанков

1. Контракт и схема данных.
2. Хроника: данные и HTTP.
3. Приёмный канал.
4. Интерфейс.
5. Завершение: сквозная проверка и документация.

---

## Chunk 1: Контракт и схема данных

### Task 1: Контракт хроники и канала

**Files:**
- Modify: `packages/shared/src/enums.ts`, `packages/shared/src/index.ts`
- Create: `packages/shared/src/schemas/chronicle.ts`, `packages/shared/src/schemas/intake.ts`
- Test: `packages/shared/src/schemas/chronicle.test.ts`

- [ ] **Step 1: Написать падающий тест `packages/shared/src/schemas/chronicle.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';

import { chronicleEntryCreateSchema, chronicleEntryUpdateSchema } from './chronicle';
import { intakePayloadSchema } from './intake';

describe('схема записи хроники', () => {
  it('принимает запись с датой, заголовком и содержимым', () => {
    const parsed = chronicleEntryCreateSchema.parse({
      occurredOn: '2026-08-27',
      title: 'Встреча по релизу',
      content: 'Решили выпускать в пятницу.',
    });

    expect(parsed.occurredOn).toBe('2026-08-27');
  });

  it('требует заголовок и содержимое', () => {
    expect(() =>
      chronicleEntryCreateSchema.parse({ occurredOn: '2026-08-27', content: 'Текст' }),
    ).toThrow();
    expect(() =>
      chronicleEntryCreateSchema.parse({ occurredOn: '2026-08-27', title: 'Заголовок' }),
    ).toThrow();
  });

  it('отвергает дату не в формате ISO', () => {
    expect(() =>
      chronicleEntryCreateSchema.parse({
        occurredOn: '27.08.2026',
        title: 'З',
        content: 'С',
      }),
    ).toThrow();
  });

  it('правка допускает частичные данные', () => {
    expect(chronicleEntryUpdateSchema.parse({ title: 'Новый заголовок' }).title).toBe(
      'Новый заголовок',
    );
  });
});

describe('тело webhook', () => {
  it('принимает JSON с содержимым', () => {
    const parsed = intakePayloadSchema.parse({ content: 'Сводка встречи' });

    expect(parsed.content).toBe('Сводка встречи');
  });

  it('заголовок и дата необязательны', () => {
    const parsed = intakePayloadSchema.parse({
      title: 'Встреча',
      content: 'Сводка',
      occurredOn: '2026-08-27',
    });

    expect(parsed.title).toBe('Встреча');
  });

  it('отвергает пустое содержимое', () => {
    expect(() => intakePayloadSchema.parse({ content: '' })).toThrow();
  });
});
```

- [ ] **Step 2: Запустить и убедиться в падении**

Run: `pnpm --filter @cairn/shared test src/schemas/chronicle`
Expected: FAIL — «Failed to resolve import».

- [ ] **Step 3: Добавить перечисление в `enums.ts`**

```typescript
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
```

- [ ] **Step 4: Создать `schemas/chronicle.ts`**

```typescript
import { z } from 'zod';

import { ChronicleSource } from '../enums';

/** Дата события: день без времени. Точное время хранит `createdAt`. */
const occurredOnSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата ГГГГ-ММ-ДД');

/** Запись хроники на уровне метаданных: дата, заголовок, источник (ТЗ 4.3). */
export const chronicleMetadataSchema = z.object({
  id: z.string().uuid(),
  occurredOn: occurredOnSchema,
  title: z.string(),
  source: z.nativeEnum(ChronicleSource),
});

/** Запись на уровне чтения: плюс содержимое и служебные поля. */
export const chronicleDetailSchema = chronicleMetadataSchema.extend({
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Поля для создания записи вручную. */
export const chronicleEntryCreateSchema = z.object({
  occurredOn: occurredOnSchema,
  title: z.string().trim().min(1).max(300),
  content: z.string().trim().min(1).max(65_536),
});

/** Поля для правки. Источник не правится: он описывает происхождение. */
export const chronicleEntryUpdateSchema = chronicleEntryCreateSchema.partial();

/** Запись на уровне метаданных. */
export type ChronicleMetadata = z.infer<typeof chronicleMetadataSchema>;

/** Запись на уровне чтения. */
export type ChronicleDetail = z.infer<typeof chronicleDetailSchema>;

/** Данные создания записи. */
export type ChronicleEntryCreate = z.infer<typeof chronicleEntryCreateSchema>;

/** Данные правки записи. */
export type ChronicleEntryUpdate = z.infer<typeof chronicleEntryUpdateSchema>;
```

- [ ] **Step 5: Создать `schemas/intake.ts`**

```typescript
import { z } from 'zod';

/** Тело webhook: содержимое обязательно, остальное выводится. */
export const intakePayloadSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  content: z.string().trim().min(1).max(65_536),
  occurredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата ГГГГ-ММ-ДД')
    .optional(),
});

/** Приёмный адрес проекта в обеих формах (ТЗ 5.2). */
export const intakeAddressSchema = z.object({
  /** Токен — общая часть обеих форм. */
  token: z.string(),
  /** Полный адрес webhook. */
  webhookUrl: z.string(),
  /** Почтовая форма. Приём почты появится позже. */
  emailAddress: z.string(),
});

/** Тело webhook. */
export type IntakePayload = z.infer<typeof intakePayloadSchema>;

/** Приёмный адрес проекта. */
export type IntakeAddress = z.infer<typeof intakeAddressSchema>;
```

- [ ] **Step 6: Дополнить `index.ts`** экспортами `./schemas/chronicle` и `./schemas/intake` в алфавитном порядке.

- [ ] **Step 7: Прогнать и собрать**

```bash
pnpm --filter @cairn/shared test src/schemas/chronicle
pnpm --filter @cairn/shared build
```

Expected: PASS, 7 тестов; сборка чистая.

- [ ] **Step 8: Коммит** — `git add packages/shared/src && git commit -m "Добавить контракт хроники и канала"`

---

### Task 2: Таблица записей хроники и миграция

**Files:**
- Create: `apps/api/src/db/schema/chronicle.ts`
- Modify: `apps/api/src/db/schema/index.ts`, `invariants.test.ts`, `apps/api/test/db-fixture.ts`
- Create: `apps/api/drizzle/0004_*.sql` (генерируется), `apps/api/drizzle/0005_chronicle_privileges.sql`
- Test: `apps/api/src/db/schema/chronicle.test.ts`

- [ ] **Step 1: Падающий тест `apps/api/src/db/schema/chronicle.test.ts`**

```typescript
import { ChronicleSource } from '@cairn/shared';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { chronicleEntries, chronicleSourceEnum } from './chronicle';

describe('записи хроники', () => {
  it('перечисление источника совпадает с контрактом', () => {
    expect(chronicleSourceEnum.enumValues).toEqual(Object.values(ChronicleSource));
  });

  it('требует дату, заголовок, содержимое и автора', () => {
    expect(chronicleEntries.occurredOn.notNull).toBe(true);
    expect(chronicleEntries.title.notNull).toBe(true);
    expect(chronicleEntries.content.notNull).toBe(true);
    expect(chronicleEntries.createdBySubjectId.notNull).toBe(true);
  });

  it('лента читается по проекту и дате', () => {
    const index = getTableConfig(chronicleEntries).indexes.find(
      (candidate) => candidate.config.name === 'chronicle_entries_project_date_idx',
    );

    expect(index).toBeDefined();
  });
});
```

- [ ] **Step 2: Убедиться в падении** — `pnpm --filter @cairn/api test src/db/schema/chronicle` → FAIL.

- [ ] **Step 3: Создать `apps/api/src/db/schema/chronicle.ts`**

```typescript
import { ChronicleSource } from '@cairn/shared';
import { date, index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { projects } from './projects';
import { subjects } from './subjects';

/** Источник записи. Значения совпадают с контрактом. */
export const chronicleSourceEnum = pgEnum('chronicle_source', [
  ChronicleSource.Manual,
  ChronicleSource.Webhook,
]);

/**
 * Записи хроники: лента «как мы к этому пришли» (ТЗ 3.6).
 *
 * `occurredOn` — дата события, отдельная от `createdAt`: сводка вчерашней
 * встречи — событие вчера, а не в момент пересылки. День без времени:
 * хроника оперирует днями, точный момент фиксирует `createdAt`.
 *
 * `createdBySubjectId` ссылается на субъект, а не на пользователя:
 * записи создают и люди, и приёмные адреса (ТЗ 2). Автор остаётся
 * в записи и после отзыва адреса — потому `restrict`, как везде.
 */
export const chronicleEntries = pgTable(
  'chronicle_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    source: chronicleSourceEnum('source').notNull().default(ChronicleSource.Manual),
    createdBySubjectId: uuid('created_by_subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('chronicle_entries_project_date_idx').on(table.projectId, table.occurredOn)],
);

/** Строка таблицы записей хроники. */
export type ChronicleEntry = typeof chronicleEntries.$inferSelect;
```

- [ ] **Step 4: Подключить таблицу**

В `schema/index.ts` — `export * from './chronicle';` (по алфавиту). В `invariants.test.ts` — импорт и строка `{ name: 'chronicle_entries', table: chronicleEntries }` в `ALL_TABLES`. В `db-fixture.ts` — `chronicle_entries` в `TRUNCATE` (перед `projects`).

- [ ] **Step 5: Прогнать тесты схемы** — `pnpm --filter @cairn/api test src/db/schema` → PASS.

- [ ] **Step 6: Сгенерировать миграцию и выдать права**

```bash
pnpm --filter @cairn/api db:generate
```

Проверь `0004_*.sql`: только `CREATE TYPE` и `CREATE TABLE`, без `DROP`. Создай `0005_chronicle_privileges.sql`:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON chronicle_entries TO cairn_app;
```

Зарегистрируй `0005` в `drizzle/meta/_journal.json` по образцу соседей (`idx: 5`, `when` на единицу больше).

- [ ] **Step 7: Тест прав роли**

Дополни `apps/api/test/environments-privileges.test.ts` — переименовывать не нужно, добавь случай:

```typescript
  it('роль приложения читает и пишет хронику', async () => {
    await expect(
      testDb.appDb.execute(sql`SELECT count(*) FROM chronicle_entries`),
    ).resolves.toBeDefined();
  });
```

Run: `pnpm --filter @cairn/api test test/environments-privileges` → PASS (3 теста).

- [ ] **Step 8: Коммит** — `git add apps/api/src/db apps/api/drizzle apps/api/test && git commit -m "Добавить таблицу записей хроники"`

---

**Результат чанка 1:** контракт и таблица готовы, права роли выданы и проверены.

---

## Chunk 2: Хроника — данные и HTTP

### Task 3: Проекция и репозиторий хроники

**Files:**
- Create: `apps/api/src/chronicle/chronicle.projection.ts`, `chronicle.repository.ts`
- Test: `apps/api/src/chronicle/chronicle.projection.test.ts`, `chronicle.repository.test.ts`

- [ ] **Step 1: Падающий тест проекции `chronicle.projection.test.ts`**

```typescript
import { AccessLevel, ChronicleSource, type ChronicleDetail } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { chronicleProjection } from './chronicle.projection';
import type { ChronicleEntry } from '../db/schema';

const row: ChronicleEntry = {
  id: '11111111-1111-1111-1111-111111111111',
  projectId: '22222222-2222-2222-2222-222222222222',
  occurredOn: '2026-08-27',
  title: 'Встреча по релизу',
  content: 'Решили выпускать в пятницу.',
  source: ChronicleSource.Webhook,
  createdBySubjectId: '33333333-3333-3333-3333-333333333333',
  createdAt: new Date('2026-08-27T10:00:00Z'),
  updatedAt: new Date('2026-08-27T10:00:00Z'),
};

describe('проекция записи хроники', () => {
  it('на уровне метаданных отдаёт дату, заголовок и источник', () => {
    expect(chronicleProjection(row, AccessLevel.Metadata)).toEqual({
      id: row.id,
      occurredOn: '2026-08-27',
      title: 'Встреча по релизу',
      source: ChronicleSource.Webhook,
    });
  });

  it('на уровне метаданных скрывает содержимое', () => {
    expect('content' in chronicleProjection(row, AccessLevel.Metadata)).toBe(false);
  });

  it('на уровне чтения отдаёт содержимое', () => {
    const projected = chronicleProjection(row, AccessLevel.Read) as ChronicleDetail;

    expect(projected.content).toBe('Решили выпускать в пятницу.');
    expect(projected.createdAt).toBe('2026-08-27T10:00:00.000Z');
  });
});
```

- [ ] **Step 2: Убедиться в падении, создать проекцию**

`chronicle.projection.ts` — через `projectByLevel`, метаданные `{ id, occurredOn, title, source }`, подробность `{ content, createdAt, updatedAt }` строками ISO. TSDoc: ссылка на ТЗ 4.3 «даты и заголовки событий».

- [ ] **Step 3: Прогнать** — PASS, 3 теста.

- [ ] **Step 4: Падающий тест репозитория `chronicle.repository.test.ts`**

По образцу `environments.repository.test.ts` (та же обвязка: testDb, admin/member, `grant(level)` на `Section.Chronicle`). Случаи:

- создание: запись появляется, `createdBySubjectId` равен субъекту создателя, источник по умолчанию `manual`;
- создание с источником `webhook` сохраняет источник;
- отказ на `read` (`InsufficientLevelError`), скрытие без выдачи (`SectionNotVisibleError`);
- лента: `metadata` не отдаёт `content`, `read` отдаёт;
- лента отсортирована по `occurredOn` по убыванию, при равной дате — по `createdAt` по убыванию;
- выдача на другую секцию (`Info` write) хронику не открывает;
- `findById` по чужому проекту — `SectionNotVisibleError`;
- правка меняет переданные поля, обновляет `updatedAt`, отказывает на `read`;
- удаление: запись исчезает, метод возвращает удалённую строку, повторное удаление — `SectionNotVisibleError`.

- [ ] **Step 5: Убедиться в падении, создать репозиторий**

`chronicle.repository.ts` по образцу `environments.repository.ts`, но проще — без доменов:

```typescript
import {
  AccessLevel,
  ChronicleSource,
  Section,
  type ChronicleDetail,
  type ChronicleEntryCreate,
  type ChronicleEntryUpdate,
  type ChronicleMetadata,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';

import { SectionNotVisibleError } from '../access/access.errors';
import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { DATABASE } from '../db/db.module';
import type { Database, Executor, Transaction } from '../db/db.types';
import { chronicleEntries, type ChronicleEntry } from '../db/schema';
import { chronicleProjection } from './chronicle.projection';

/**
 * Доступ к записям хроники.
 *
 * Каждый метод принимает субъект первым аргументом и проверяет права сам
 * (спека 5.4). Через этот же репозиторий пишет приёмный канал: машинный
 * субъект проходит ту же проверку, что и человек (ТЗ 2).
 */
@Injectable()
export class ChronicleRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly access: AccessService,
  ) {}

  /** Лента проекта в проекции по уровню: свежие события сверху. */
  async findForProject(
    subject: RequestSubject,
    projectId: string,
  ): Promise<(ChronicleMetadata | ChronicleDetail)[]> {
    const level = await this.access.requireLevel(
      subject,
      projectId,
      Section.Chronicle,
      AccessLevel.Metadata,
    );

    const rows = await this.db
      .select()
      .from(chronicleEntries)
      .where(eq(chronicleEntries.projectId, projectId))
      .orderBy(desc(chronicleEntries.occurredOn), desc(chronicleEntries.createdAt));

    return rows.map((row) => chronicleProjection(row, level));
  }

  /** Одна запись в проекции по уровню. */
  async findById(
    subject: RequestSubject,
    projectId: string,
    entryId: string,
  ): Promise<ChronicleMetadata | ChronicleDetail> {
    const level = await this.access.requireLevel(
      subject,
      projectId,
      Section.Chronicle,
      AccessLevel.Metadata,
    );

    return chronicleProjection(await this.requireEntry(this.db, projectId, entryId), level);
  }

  /** Создаёт запись от лица субъекта: человека или приёмного адреса. */
  async create(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    input: ChronicleEntryCreate,
    source: ChronicleSource = ChronicleSource.Manual,
  ): Promise<ChronicleEntry> {
    await this.access.requireLevel(subject, projectId, Section.Chronicle, AccessLevel.Write, tx);

    const [created] = await tx
      .insert(chronicleEntries)
      .values({ ...input, projectId, source, createdBySubjectId: subject.id })
      .returning();

    return created!;
  }

  /** Изменяет запись. Источник не правится: он описывает происхождение. */
  async update(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    entryId: string,
    input: ChronicleEntryUpdate,
  ): Promise<ChronicleEntry> {
    await this.access.requireLevel(subject, projectId, Section.Chronicle, AccessLevel.Write, tx);
    await this.requireEntry(tx, projectId, entryId);

    const [updated] = await tx
      .update(chronicleEntries)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(chronicleEntries.id, entryId))
      .returning();

    return updated!;
  }

  /** Удаляет запись и возвращает её: журналу нужны заголовок и дата. */
  async remove(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    entryId: string,
  ): Promise<ChronicleEntry> {
    await this.access.requireLevel(subject, projectId, Section.Chronicle, AccessLevel.Write, tx);

    const entry = await this.requireEntry(tx, projectId, entryId);

    await tx.delete(chronicleEntries).where(eq(chronicleEntries.id, entryId));

    return entry;
  }

  /** Находит запись, принадлежащую проекту; чужая выглядит несуществующей. */
  private async requireEntry(
    executor: Executor,
    projectId: string,
    entryId: string,
  ): Promise<ChronicleEntry> {
    const [entry] = await executor
      .select()
      .from(chronicleEntries)
      .where(and(eq(chronicleEntries.id, entryId), eq(chronicleEntries.projectId, projectId)))
      .limit(1);

    if (!entry) {
      throw new SectionNotVisibleError();
    }

    return entry;
  }
}
```

- [ ] **Step 6: Прогнать** — `pnpm --filter @cairn/api test src/chronicle` → PASS.

- [ ] **Step 7: Коммит** — `Добавить репозиторий хроники`.

---

### Task 4: Сервис хроники с журналом

**Files:**
- Modify: `apps/api/src/audit/audit.types.ts`
- Create: `apps/api/src/chronicle/chronicle.service.ts`
- Test: `apps/api/src/chronicle/chronicle.service.test.ts`

- [ ] **Step 1: Добавить действия в `AuditAction`** (после действий окружений):

```typescript
  ChronicleEntryCreated = 'chronicle_entry.created',
  ChronicleEntryUpdated = 'chronicle_entry.updated',
  ChronicleEntryDeleted = 'chronicle_entry.deleted',
  IntakeAddressCreated = 'intake_address.created',
  IntakeAddressRevoked = 'intake_address.revoked',
```

- [ ] **Step 2: Падающий тест сервиса** по образцу `environments.service.test.ts`:

- создание пишет `chronicle_entry.created` с `projectId`, `entityId` и заголовком в метаданных;
- правка пишет перечень изменённых полей, но не содержимое (`JSON.stringify(entry.metadata)` не содержит текста записи);
- удаление пишет заголовок и дату удалённой записи;
- отказ по правам не оставляет записей в журнале.

- [ ] **Step 3: Создать `chronicle.service.ts`** по образцу `environments.service.ts`: `list`, `findById`, `create(subject, projectId, input, source)`, `update`, `remove`; журнал в транзакции, `actorOf` — тот же приём. В `create` метаданные журнала — `{ title, occurredOn, source }`; в `remove` — `{ title, occurredOn }`.

- [ ] **Step 4: Прогнать** — PASS, 4 теста.

- [ ] **Step 5: Коммит** — `Добавить сервис хроники с журналом`.

---

### Task 5: HTTP-слой хроники и матрица доступа

**Files:**
- Create: `apps/api/src/chronicle/chronicle.controller.ts`, `chronicle.module.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/test/access-matrix.e2e.test.ts`
- Test: `apps/api/test/chronicle.e2e.test.ts`

- [ ] **Step 1: Падающий e2e-тест `chronicle.e2e.test.ts`** по образцу `environments.e2e.test.ts` (обвязка с AppModule): создание с ответом `201`, отказ без заголовка (`400`), `404` без выдачи, `metadata` не отдаёт содержимого, `403` на правку при `metadata`, удаление (`204` и пустая лента), `401` без входа.

- [ ] **Step 2: Создать контроллер и модуль**

`chronicle.controller.ts` — `@Controller('projects/:projectId/chronicle')`, `@UseGuards(SessionGuard)`, маршруты по образцу окружений: `GET /`, `GET /:id`, `POST /` (валидация `chronicleEntryCreateSchema`, возврат через `findById`), `PATCH /:id`, `DELETE /:id` с кодом `204`. `chronicle.module.ts` — imports `[DbModule, AccessModule, AuditModule, AuthModule]`, экспорт репозитория и сервиса. Подключить `ChronicleModule` в `app.module.ts` после `EnvironmentsModule`.

- [ ] **Step 3: Прогнать e2e** — PASS, 7 тестов.

- [ ] **Step 4: Дополнить матрицу доступа**

В `access-matrix.e2e.test.ts` — по образцу блока инфраструктуры: `signInAsChronicle(level)` и `describe.each` из четырёх строк (`list: 404/200/200/200`, `create: 404/403/403/201`, `seesContent: false/false/true/true`). Запись заводится в `beforeEach` напрямую в таблицу (нужен `createdBySubjectId` — субъект админа уже есть в обвязке).

- [ ] **Step 5: Прогнать матрицу и весь набор API**

```bash
pnpm --filter @cairn/api test test/access-matrix
pnpm --filter @cairn/api test
```

Expected: PASS целиком.

- [ ] **Step 6: Коммит** — `Добавить HTTP-слой хроники`.

---

**Результат чанка 2:** хроника работает по HTTP для людей, поведение уровней зафиксировано матрицей.

---

## Chunk 3: Приёмный канал

### Task 6: Сервис канала — адрес и разрешение токена

**Files:**
- Create: `apps/api/src/intake/intake.service.ts`
- Test: `apps/api/src/intake/intake.service.test.ts`

- [ ] **Step 1: Падающий тест `intake.service.test.ts`** (Testcontainers, обвязка как у сервисов):

- `createAddress`: появляется субъект вида `intake_address` с непустой меткой и выдача «хроника × запись» на проект; журнал содержит `intake_address.created`;
- повторное создание при живом адресе бросает `ConflictException`;
- после отзыва создание разрешено;
- `findAddress`: возвращает токен для проекта; после отзыва и для проекта без адреса — `null`;
- `revokeAddress`: субъект получает `revokedAt`, журнал содержит `intake_address.revoked`; отзыв без адреса — `NotFoundException`;
- `resolveToken`: по токену возвращает `{ subject, projectId }`; по мусорному токену, отозванному адресу — `null`.

- [ ] **Step 2: Создать `intake.service.ts`**

```typescript
import { AccessLevel, AuditSubjectKind, Section, SubjectKind } from '@cairn/shared';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { generateToken } from '../auth/token';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { grants, subjects, users } from '../db/schema';

/** Разрешённый приёмный адрес: субъект и его проект. */
export interface ResolvedIntake {
  subject: RequestSubject;
  projectId: string;
}

/**
 * Приёмный канал (ТЗ 5): адрес проекта как машинный субъект.
 *
 * Адрес — не отдельная сущность, а субъект вида `intake_address` с обычной
 * выдачей «хроника × запись». Привязка к проекту читается из выдачи,
 * отзыв гасит канал штатным механизмом отзыва субъекта.
 *
 * Токен хранится открыто в `label`: его нужно показывать пишущим, и он же
 * станет локальной частью почтового адреса. Утечка раскрывает лишь право
 * писать в хронику; перебор невозможен — 32 байта случайности.
 */
@Injectable()
export class IntakeService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /** Создаёт адрес проекта. У проекта не больше одного действующего адреса. */
  async createAddress(actor: RequestSubject, projectId: string): Promise<string> {
    if (await this.findAddress(projectId)) {
      throw new ConflictException(
        'У проекта уже есть приёмный адрес. Сначала отзовите действующий.',
      );
    }

    const token = generateToken();
    const grantedBy = await this.userIdOf(actor);

    await this.db.transaction(async (tx) => {
      const [subject] = await tx
        .insert(subjects)
        .values({ kind: SubjectKind.IntakeAddress, label: token })
        .returning();

      await tx.insert(grants).values({
        subjectId: subject!.id,
        projectId,
        section: Section.Chronicle,
        level: AccessLevel.Write,
        grantedBy,
      });

      await this.audit.record(tx, actorOf(actor), {
        action: AuditAction.IntakeAddressCreated,
        entityType: 'intake_address',
        entityId: subject!.id,
        projectId,
      });
    });

    return token;
  }

  /** Возвращает токен действующего адреса проекта либо `null`. */
  async findAddress(projectId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ label: subjects.label })
      .from(subjects)
      .innerJoin(grants, eq(grants.subjectId, subjects.id))
      .where(
        and(
          eq(subjects.kind, SubjectKind.IntakeAddress),
          isNull(subjects.revokedAt),
          eq(grants.projectId, projectId),
          eq(grants.section, Section.Chronicle),
        ),
      )
      .limit(1);

    return row?.label ?? null;
  }

  /** Отзывает действующий адрес проекта. */
  async revokeAddress(actor: RequestSubject, projectId: string): Promise<void> {
    const token = await this.findAddress(projectId);

    if (!token) {
      throw new NotFoundException('У проекта нет действующего приёмного адреса');
    }

    await this.db.transaction(async (tx) => {
      const [revoked] = await tx
        .update(subjects)
        .set({ revokedAt: new Date() })
        .where(and(eq(subjects.label, token), eq(subjects.kind, SubjectKind.IntakeAddress)))
        .returning();

      await this.audit.record(tx, actorOf(actor), {
        action: AuditAction.IntakeAddressRevoked,
        entityType: 'intake_address',
        entityId: revoked!.id,
        projectId,
      });
    });
  }

  /**
   * Разрешает токен из адреса в субъект и проект.
   *
   * Мусорный токен, отозванный адрес и адрес без выдачи неразличимы:
   * все три — `null`, снаружи одинаковый `404`.
   */
  async resolveToken(token: string): Promise<ResolvedIntake | null> {
    const [row] = await this.db
      .select({ subject: subjects, projectId: grants.projectId })
      .from(subjects)
      .innerJoin(grants, eq(grants.subjectId, subjects.id))
      .where(
        and(
          eq(subjects.kind, SubjectKind.IntakeAddress),
          eq(subjects.label, token),
          isNull(subjects.revokedAt),
          eq(grants.section, Section.Chronicle),
        ),
      )
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      subject: {
        id: row.subject.id,
        kind: SubjectKind.IntakeAddress,
        label: row.subject.label,
        isSuperadmin: false,
        isRevoked: false,
      },
      projectId: row.projectId,
    };
  }

  /** Находит запись пользователя: поле «кто выдал» в выдаче ссылается на неё. */
  private async userIdOf(subject: RequestSubject): Promise<string> {
    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.subjectId, subject.id))
      .limit(1);

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    return user.id;
  }
}

/** Строит действующее лицо журнала из субъекта запроса. */
function actorOf(subject: RequestSubject): AuditActor {
  return {
    kind: subject.kind as unknown as Exclude<AuditSubjectKind, AuditSubjectKind.System>,
    id: subject.id,
    label: subject.label,
  };
}
```

- [ ] **Step 3: Прогнать** — PASS.

- [ ] **Step 4: Коммит** — `Добавить сервис приёмного адреса`.

---

### Task 7: HTTP канала: webhook и управление адресом

**Files:**
- Create: `apps/api/src/intake/intake.controller.ts`, `intake.module.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/main.ts`
- Test: `apps/api/test/intake.e2e.test.ts`

- [ ] **Step 1: Падающий e2e-тест `intake.e2e.test.ts`**

Обвязка с AppModule; в приложение добавь разбор текста — тем же вызовом, что попадёт в `main.ts`:

```typescript
import { text } from 'express';
// после app.use(cookieParser()):
app.use(text({ type: 'text/plain', limit: '64kb' }));
```

Случаи:

- суперадмин создаёт адрес: `POST /projects/:id/intake-address` → `201`, в ответе `token`, `webhookUrl` с токеном, `emailAddress`;
- повторное создание — `409`;
- `GET` адреса при `write` на хронике — `200`; при `read` — `403`; без выдачи — `404`; не-суперадмин с `write` видит адрес (выдай подрядчику `write` на хронику);
- `POST /intake/:token` с JSON `{ content }` без сессии → `201`; запись появляется в ленте с источником `webhook`, заголовок — первая строка содержимого;
- JSON с `title` и `occurredOn` сохраняет их;
- `text/plain` телом: `201`, содержимое — весь текст;
- мусорный токен — `404`; после `DELETE /projects/:id/intake-address` (суперадмин, `204`) прежний токен — `404`;
- журнал: запись от канала имеет `subjectKind: 'intake_address'`.

- [ ] **Step 2: Создать `intake.controller.ts`**

Два контроллера в одном файле — управление и приём:

```typescript
import {
  intakePayloadSchema,
  type ChronicleDetail,
  type ChronicleMetadata,
  type IntakeAddress,
} from '@cairn/shared';
// ...импорты по образцу других контроллеров

/** Управление приёмным адресом проекта (спека 5.2). */
@Controller('projects/:projectId/intake-address')
export class IntakeAddressController {
  constructor(
    private readonly intake: IntakeService,
    private readonly access: AccessService,
  ) {}

  /**
   * Показывает адрес пишущим в хронику: им и пересылать сводки.
   *
   * Право проверяется явно через `requireLevel`: данных секции маршрут
   * не отдаёт, поэтому репозиторий секции здесь ни при чём.
   */
  @Get()
  @UseGuards(SessionGuard)
  async find(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<IntakeAddress> {
    await this.access.requireLevel(subject, projectId, Section.Chronicle, AccessLevel.Write);

    const token = await this.intake.findAddress(projectId);

    if (!token) {
      throw new NotFoundException('У проекта нет приёмного адреса');
    }

    return addressForms(token);
  }

  /** Создаёт адрес. Управление субъектами — право суперадмина. */
  @Post()
  @UseGuards(SessionGuard, SuperadminGuard)
  async create(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<IntakeAddress> {
    return addressForms(await this.intake.createAddress(subject, projectId));
  }

  /** Отзывает адрес: старые интеграции гаснут явно. */
  @Delete()
  @HttpCode(204)
  @UseGuards(SessionGuard, SuperadminGuard)
  async revoke(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<void> {
    await this.intake.revokeAddress(subject, projectId);
  }
}

/** Приём входящих: единственный маршрут записи без сессии (спека 5.1). */
@Controller('intake')
export class IntakeController {
  constructor(
    private readonly intake: IntakeService,
    private readonly chronicle: ChronicleService,
  ) {}

  @Post(':token')
  async receive(
    @Param('token') token: string,
    @Body() body: unknown,
  ): Promise<ChronicleMetadata | ChronicleDetail> {
    const resolved = await this.intake.resolveToken(token);

    if (!resolved) {
      // Мусорный и отозванный токены неразличимы (спека 3.2).
      throw new NotFoundException();
    }

    const payload = normalizePayload(body);
    const created = await this.chronicle.create(
      resolved.subject,
      resolved.projectId,
      payload,
      ChronicleSource.Webhook,
    );

    return this.chronicle.findById(resolved.subject, resolved.projectId, created.id);
  }
}

/** Приводит тело запроса к данным записи: JSON или чистый текст. */
function normalizePayload(body: unknown): ChronicleEntryCreate {
  const raw =
    typeof body === 'string'
      ? { content: body.trim() }
      : intakePayloadSchema.parse(body);

  if (!raw.content) {
    throw new BadRequestException('Содержимое не должно быть пустым');
  }

  return {
    content: raw.content,
    // Заголовок — первая строка содержимого: у пересланной сводки
    // отдельного заголовка обычно нет.
    title: ('title' in raw ? raw.title : undefined) ?? firstLineOf(raw.content),
    occurredOn: ('occurredOn' in raw ? raw.occurredOn : undefined) ?? todayIso(),
  };
}

/** Первая непустая строка, обрезанная до длины заголовка. */
function firstLineOf(content: string): string {
  return (content.split('\n').find((line) => line.trim()) ?? 'Входящее').trim().slice(0, 300);
}

/** Сегодняшняя дата в формате ISO. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Обе формы адреса из токена (спека 5.2: одна строка — два канала). */
function addressForms(token: string): IntakeAddress {
  const base = process.env.CAIRN_WEB_URL ?? 'http://localhost:3000';
  const host = new URL(base).hostname;

  return {
    token,
    webhookUrl: `${base}/api/intake/${token}`,
    emailAddress: `${token}@intake.${host}`,
  };
}
```

`intakePayloadSchema.parse` бросает `ZodError` — там, где остальные контроллеры получают `400` от `ZodValidationPipe`. Здесь тело разнородное (JSON или текст), поэтому разбор внутри; оберни `parse` в `try/catch` с `BadRequestException(поясняющее сообщение)`.

- [ ] **Step 3: Создать `intake.module.ts`** — imports `[DbModule, AccessModule, AuditModule, AuthModule, ChronicleModule]`, оба контроллера, провайдер `IntakeService`. Подключить в `app.module.ts`.

- [ ] **Step 4: Добавить разбор текста в `main.ts`**

```typescript
import { text } from 'express';
// после app.use(cookieParser()):
app.use(text({ type: 'text/plain', limit: '64kb' }));
```

- [ ] **Step 5: Прогнать** — `pnpm --filter @cairn/api test test/intake` → PASS; затем весь набор API.

- [ ] **Step 6: Коммит** — `Добавить приёмный канал`.

---

**Результат чанка 3:** внешний инструмент кладёт сводку в хронику по адресу, отзыв адреса гасит канал, всё в журнале с пометкой машины.

---

## Chunk 4: Интерфейс

### Task 8: Хуки данных

**Files:**
- Create: `apps/web/src/api/hooks/useQueryChronicle.ts`, `useMutationChronicleEntry.ts`, `useQueryIntakeAddress.ts`, `useMutationIntakeAddress.ts`
- Modify: `apps/web/src/api/hooks/index.ts`
- Test: `apps/web/src/api/hooks/useMutationChronicleEntry.test.tsx`

По образцу хуков окружений. Тест мутаций: создание бьёт в `/api/projects/:id/chronicle` методом `POST`, удаление — в `/api/projects/:id/chronicle/:entryId` методом `DELETE`, отказ в правах становится `isError`. `useQueryIntakeAddress` — с `retry: false` и обработкой `404` как «адреса нет» (данные `null`), чтобы отсутствие адреса не выглядело ошибкой загрузки:

```typescript
    queryFn: async () => {
      try {
        return await apiClient<IntakeAddress>(`/projects/${projectId}/intake-address`);
      } catch (cause) {
        if (cause instanceof ApiError && (cause.status === 404 || cause.status === 403)) {
          return null;
        }

        throw cause;
      }
    },
```

Мутации адреса: `useMutationCreateIntakeAddress`, `useMutationRevokeIntakeAddress` — инвалидируют ключ адреса.

TDD-цикл и коммит — `Добавить хуки хроники и адреса`.

---

### Task 9: Компоненты ленты

**Files:**
- Create: `apps/web/src/components/ChronicleEntry/` (`ChronicleEntry.tsx`, `EntryActions.tsx`, `types.ts`, `constants.ts`, `index.ts`, `ChronicleEntry.test.tsx`)
- Create: `apps/web/src/components/ChronicleList/` (`ChronicleList.tsx`, `types.ts`, `index.ts`, `ChronicleList.test.tsx`)

`ChronicleEntry` по образцу `EnvironmentCard`: дата (локализованная через `toLocaleDateString('ru-RU')`), заголовок, бейдж источника (`SOURCE_LABELS: { manual: 'Вручную', webhook: 'Webhook' }`), содержимое при его наличии в проекции (`'content' in entry`), кнопки «Править»/«Удалить» с подтверждением на месте (вынеси в `EntryActions` — как `CardActions`). Тесты: метаданные не показывают содержимого; чтение показывает; без `canWrite` нет кнопок; удаление требует подтверждения; отмена возвращает кнопку.

`ChronicleList`: `ul` с `aria-label="Хроника"` (в карточке записей нет вложенных списков, но имя оставляет место бейджам), пустое состояние с разными текстами для пишущего и читателя. Тесты: список, пустые состояния.

TDD-цикл и коммит — `Добавить ленту хроники`.

---

### Task 10: Форма записи и панель адреса

**Files:**
- Create: `apps/web/src/components/ChronicleForm/` (`ChronicleForm.tsx`, `types.ts`, `constants.ts`, `index.ts`, `ChronicleForm.test.tsx`)
- Create: `apps/web/src/components/IntakeAddressPanel/` (`IntakeAddressPanel.tsx`, `types.ts`, `index.ts`, `IntakeAddressPanel.test.tsx`)

`ChronicleForm` по образцу `EnvironmentForm`: поля даты (`input type="date"`), заголовка, содержимого (`multiline`); отправка запрещена при пустом заголовке или содержимом; ошибка сервера через `role="alert"`. Значения — интерфейс `ChronicleFormValues { occurredOn, title, content }`.

`IntakeAddressPanel` — пропсы `IProps { address: IntakeAddress | null; isSuperadmin: boolean; onCreate: () => void; onRevoke: () => void; isPending?: boolean }`:

- адрес есть: показывает `webhookUrl` моноширинно, кнопку «Скопировать» (`navigator.clipboard.writeText`, после копирования подпись «Скопировано»), почтовую форму с пометкой «приём почты появится позже»; суперадмину — «Отозвать адрес» с подтверждением на месте;
- адреса нет: пишущему — «Приёмного адреса нет. Его создаёт администратор»; суперадмину — кнопка «Создать адрес».

Тесты: показ адреса, копирование (мок `navigator.clipboard`), состояния без адреса для обеих ролей, подтверждение отзыва.

TDD-цикл и коммит — `Добавить форму записи и панель адреса`.

---

### Task 11: Страница секции и навигация

**Files:**
- Create: `apps/web/src/app/(app)/projects/[id]/chronicle/page.tsx`, `ChronicleScreen.tsx`
- Modify: `apps/web/src/components/ProjectSections/ProjectSections.tsx`, `ProjectSections.test.tsx`

`ChronicleScreen` по образцу `InfrastructureScreen`: `useQueryChronicle` + `useQuerySections` + `useQueryIntakeAddress` + `useQueryMe`-аналог для признака суперадмина — признак бери из `useQuerySections`? Нет: суперадминство уже приходит в `CurrentSubjectResponse`; используй существующий серверный проброс — страница серверная, передай `isSuperadmin` пропсом из `page.tsx`, получив `/auth/me` через `apiServer` (образец — `apps/web/src/app/(app)/page.tsx`). Состояния: загрузка, ошибка, кнопка «Добавить запись», форма создания/правки, лента, панель адреса (только при `write`).

В `ProjectSections` навигация секций становится перечнем: ссылка «Инфраструктура» при `sections[Section.Infrastructure]`, ссылка «Хроника» при `sections[Section.Chronicle]`. Тесты — два новых случая по образцу инфраструктуры.

Прогнать весь набор веба и typecheck:

```bash
pnpm --filter @cairn/web test
pnpm --filter @cairn/web typecheck
```

Коммит — `Добавить экран хроники`.

---

**Результат чанка 4:** лента читается и правится в интерфейсе, адрес виден пишущим, суперадмин управляет им с той же страницы.

---

## Chunk 5: Завершение этапа

### Task 12: Сквозная проверка и документация

**Files:**
- Modify: `scripts/e2e.mjs`, `README.md`, `CLAUDE.md`

- [ ] **Step 1: Дополнить `scripts/e2e.mjs`**

В сценарий суперадмина после создания окружения:

```javascript
  const intake = await admin(`/api/projects/${created.json.id}/intake-address`, {
    method: 'POST',
  });
  checkCritical('приёмный адрес создан', intake.status === 201, `статус ${intake.status}`);

  const inbound = await admin(`/api/intake/${intake.json.token}`, {
    method: 'POST',
    body: { title: 'Сводка встречи', content: 'Решили выпускать в пятницу.' },
  });
  check('входящее принято без сессии', inbound.status === 201, `статус ${inbound.status}`);

  const feed = await admin(`/api/projects/${created.json.id}/chronicle`);
  check(
    'входящее видно в хронике с источником webhook',
    feed.json?.some((entry) => entry.title === 'Сводка встречи' && entry.source === 'webhook'),
    JSON.stringify(feed.json).slice(0, 160),
  );
```

Отправку `inbound` выполняй агентом без cookie (заведи третьего агента `machine = makeAgent()`), чтобы проверка «без сессии» была честной. Выдай гостю уровень `metadata` на секцию `chronicle` рядом с выдачами на «Инфо» и инфраструктуру; в сценарий гостя добавь: лента видна, заголовок есть, `content` отсутствует. В конец сценария суперадмина — отзыв адреса и проверка, что прежний токен получает `404`.

- [ ] **Step 2: Обновить `README.md` и `CLAUDE.md`** — этап 3 реализован: хроника и приёмный канал (webhook и ручная вставка; приём почты позже); в CLAUDE.md добавить спеку и план этапа 3 в источники правды.

- [ ] **Step 3: Полная проверка**

```bash
pnpm --filter @cairn/shared build && pnpm test && pnpm typecheck && pnpm build
```

- [ ] **Step 4: Сквозной прогон на чистой системе** (порты 18080/18443, как в этапе 2): `docker compose down -v`, сборка, миграции, суперадмин, `pnpm e2e`. Expected: все проверки, включая канал.

- [ ] **Step 5: Коммит** — `Завершить этап 3: приёмный канал и хроника`.

---

**Результат этапа 3:** сводка встречи из любого инструмента попадает в хронику проекта одним запросом; лента отвечает на вопрос «как мы к этому пришли», не смешиваясь с документацией; канал живёт в единой модели прав и гаснет штатным отзывом субъекта.
