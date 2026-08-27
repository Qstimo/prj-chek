# CAIRN этап 2 «Инфраструктура» — план реализации

> **Для исполнителя:** ОБЯЗАТЕЛЬНО веди работу через superpowers:executing-plans (или superpowers:subagent-driven-development, если доступны субагенты). Шаги отмечаются чекбоксами (`- [ ]`).

**Цель:** реализовать вторую секцию проекта — окружения с серверными параметрами и доменами, доступные по той же модели прав, что и «Инфо».

**Архитектура:** новый модуль `apps/api/src/environments/` повторяет рисунок `projects/`: репозиторий принимает субъект первым аргументом и проверяет права сам, проекция по уровню применяется до контроллера, запись в журнал идёт в одной транзакции с изменением. Контракт живёт в `packages/shared`. Интерфейс — отдельная страница секции в карточке проекта.

**Стек:** тот же, что на этапе 1 — NestJS, Drizzle, PostgreSQL, zod, Next.js 15, TanStack Query, Vitest, Testcontainers.

**Основание:** `docs/superpowers/specs/2026-08-27-cairn-stage2-design.md`.

---

## Ключевые правила для исполнителя

1. **TDD без исключений.** Сначала падающий тест, потом реализация. Шаг «убедиться, что тест падает» — не формальность: тест, который проходит до реализации, ничего не проверяет.
2. **Проверка прав только в репозитории.** Ни контроллер, ни сервис, ни компонент не решают, что показывать. Репозиторий принимает `subject` первым аргументом и вызывает `requireLevel` сам (ТЗ 4.1, спека этапа 1, 5.4).
3. **Проекция до контроллера.** Поля, недоступные уровню, отсекаются в слое данных. Если поле дошло до контроллера, оно уже разрешено.
4. **Отсутствие доступа — `404`.** Недостаточный уровень — `403`. Коды даёт слой ошибок этапа 1 (`SectionNotVisibleError`, `InsufficientLevelError`), собственных исключений заводить не нужно.
5. **Каскадов нет.** Все внешние ключи — `restrict`. Связанные строки удаляются явно в той же транзакции. Это проверяет `invariants.test.ts`.
6. **Комментарии объясняют «почему», а не «что».** Код показывает, что он делает, сам.
7. **Коммит после каждой задачи.** Сообщение — по-русски, в повелительном наклонении, как в истории репозитория: «Добавить окружения проекта».
8. **Язык интерфейса и сообщений — русский.**

---

## Структура файлов

**`packages/shared/src/`**
- `enums.ts` — дополняется перечислением `EnvironmentKind`.
- `schemas/environment.ts` — схемы метаданных, подробностей, создания и правки окружения.
- `index.ts` — barrel export дополняется.

**`apps/api/src/db/schema/`**
- `environments.ts` — таблицы `environments` и `environment_domains`, перечисление вида окружения.
- `index.ts`, `invariants.test.ts` — дополняются новыми таблицами.

**`apps/api/src/environments/`** — новый модуль.
- `environment.projection.ts` — проекция по уровню доступа.
- `environments.repository.ts` — выборки и изменения с проверкой прав.
- `environments.service.ts` — изменения вместе с записью в журнал.
- `environments.controller.ts` — маршруты `projects/:projectId/environments`.
- `environments.module.ts` — сборка модуля.

**`apps/api/src/access/`**
- `projection.ts` — общий помощник «метаданные → чтение», которым пользуются проекции секций.

**`apps/api/src/audit/audit.types.ts`** — три новых действия журнала.

**`apps/api/test/`**
- `environments.e2e.test.ts` — HTTP-поведение секции.
- `access-matrix.e2e.test.ts` — дополняется секцией «Инфраструктура».

**`apps/web/src/`**
- `api/hooks/useQueryEnvironments.ts`, `useMutationEnvironment.ts` — данные секции.
- `components/EnvironmentList/`, `EnvironmentCard/`, `EnvironmentForm/`, `DomainsField/` — представление и правка.
- `app/(app)/projects/[id]/infrastructure/page.tsx`, `InfrastructureScreen.tsx` — страница секции.
- `components/ProjectSections/` — дополняется блоком со ссылкой на секцию.

**`scripts/e2e.mjs`** — сквозная проверка дополняется сценарием инфраструктуры.

---

## Порядок чанков

Пять чанков, каждый заканчивается работающим состоянием.

1. Контракт и схема данных — типы и таблицы, ещё без поведения.
2. Доступ к данным — проекция, репозиторий, сервис с журналом.
3. HTTP-слой — контроллер и матрица доступа в тестах.
4. Интерфейс — хуки, компоненты, страница секции.
5. Завершение — сквозная проверка и документация.

---

## Chunk 1: Контракт и схема данных

Результат чанка: типы окружения доступны обеим сторонам, таблицы созданы миграцией, права роли приложения выданы.

### Task 1: Перечисление и схемы контракта

**Files:**
- Modify: `packages/shared/src/enums.ts`
- Create: `packages/shared/src/schemas/environment.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/schemas/environment.test.ts`

- [ ] **Step 1: Написать падающий тест `packages/shared/src/schemas/environment.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';

import { EnvironmentKind } from '../enums';
import { environmentCreateSchema, environmentUpdateSchema } from './environment';

describe('схема создания окружения', () => {
  it('принимает минимальное окружение', () => {
    const parsed = environmentCreateSchema.parse({
      name: 'Прод',
      kind: EnvironmentKind.Production,
    });

    expect(parsed.name).toBe('Прод');
  });

  it('требует имя и вид', () => {
    expect(() => environmentCreateSchema.parse({ name: 'Прод' })).toThrow();
    expect(() => environmentCreateSchema.parse({ kind: EnvironmentKind.Production })).toThrow();
  });

  it('отвергает пустое имя', () => {
    expect(() =>
      environmentCreateSchema.parse({ name: '   ', kind: EnvironmentKind.Production }),
    ).toThrow();
  });
});

describe('домены окружения', () => {
  it('приводит домен к нижнему регистру', () => {
    const parsed = environmentUpdateSchema.parse({ domains: ['Example.COM'] });

    expect(parsed.domains).toEqual(['example.com']);
  });

  it('обрезает пробелы вокруг домена', () => {
    const parsed = environmentUpdateSchema.parse({ domains: ['  example.com  '] });

    expect(parsed.domains).toEqual(['example.com']);
  });

  it('отвергает строку, не похожую на домен', () => {
    // Иначе в реестр попадёт «мой сервер» вместо адреса, и проверки
    // сроков на этапе 6 будут падать на бессмысленных данных.
    expect(() => environmentUpdateSchema.parse({ domains: ['не домен'] })).toThrow();
  });

  it('отвергает повторяющиеся домены', () => {
    expect(() =>
      environmentUpdateSchema.parse({ domains: ['example.com', 'EXAMPLE.com'] }),
    ).toThrow();
  });
});

describe('серверные параметры', () => {
  it('принимает адрес IPv4 и IPv6', () => {
    expect(environmentUpdateSchema.parse({ ip: '203.0.113.10' }).ip).toBe('203.0.113.10');
    expect(environmentUpdateSchema.parse({ ip: '2001:db8::1' }).ip).toBe('2001:db8::1');
  });

  it('отвергает произвольную строку вместо адреса', () => {
    expect(() => environmentUpdateSchema.parse({ ip: 'сервер в углу' })).toThrow();
  });

  it('принимает пустые значения как отсутствие', () => {
    // Реестр заполняется постепенно: «провайдер неизвестен» — рабочее состояние.
    const parsed = environmentUpdateSchema.parse({ ip: null, provider: null, notes: null });

    expect(parsed.ip).toBeNull();
  });

  it('требует адрес health-check в виде ссылки', () => {
    expect(() => environmentUpdateSchema.parse({ healthCheckUrl: 'localhost' })).toThrow();
    expect(
      environmentUpdateSchema.parse({ healthCheckUrl: 'https://example.com/health' })
        .healthCheckUrl,
    ).toBe('https://example.com/health');
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/shared test src/schemas/environment`
Expected: FAIL — «Failed to resolve import "./environment"».

- [ ] **Step 3: Добавить перечисление в `packages/shared/src/enums.ts`**

Добавь в конец файла:

```typescript
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
```

- [ ] **Step 4: Создать `packages/shared/src/schemas/environment.ts`**

```typescript
import { z } from 'zod';

import { EnvironmentKind } from '../enums';

/**
 * Домен окружения.
 *
 * Приводится к нижнему регистру и обрезается по краям до проверки:
 * `Example.COM ` и `example.com` — один и тот же адрес, и хранить их
 * как разные записи значило бы дважды проверять один сертификат (этап 6).
 */
export const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, 'Ожидается домен');

/** Окружение на уровне метаданных: видно, что оно есть, и его публичный адрес. */
export const environmentMetadataSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  kind: z.nativeEnum(EnvironmentKind),
  domains: z.array(z.string()),
});

/** Окружение на уровне чтения: серверные параметры и заметки. */
export const environmentDetailSchema = environmentMetadataSchema.extend({
  host: z.string().nullable(),
  ip: z.string().nullable(),
  provider: z.string().nullable(),
  specs: z.string().nullable(),
  healthCheckUrl: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Поля, доступные для правки при уровне записи. */
export const environmentUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  kind: z.nativeEnum(EnvironmentKind).optional(),
  host: z.string().trim().max(253).nullable().optional(),
  ip: z.string().ip().nullable().optional(),
  provider: z.string().trim().max(200).nullable().optional(),
  specs: z.string().trim().max(500).nullable().optional(),
  healthCheckUrl: z.string().url().max(500).nullable().optional(),
  notes: z.string().max(10_000).nullable().optional(),
  domains: z
    .array(domainSchema)
    .max(20)
    .refine((domains) => new Set(domains).size === domains.length, 'Домены повторяются')
    .optional(),
});

/** Поля для создания окружения. Имя и вид обязательны, остальное дополняется позже. */
export const environmentCreateSchema = environmentUpdateSchema.extend({
  name: z.string().trim().min(1).max(100),
  kind: z.nativeEnum(EnvironmentKind),
});

/** Окружение на уровне метаданных. */
export type EnvironmentMetadata = z.infer<typeof environmentMetadataSchema>;

/** Окружение на уровне чтения. */
export type EnvironmentDetail = z.infer<typeof environmentDetailSchema>;

/** Данные для правки окружения. */
export type EnvironmentUpdate = z.infer<typeof environmentUpdateSchema>;

/** Данные для создания окружения. */
export type EnvironmentCreate = z.infer<typeof environmentCreateSchema>;
```

- [ ] **Step 5: Дополнить `packages/shared/src/index.ts`**

Добавь строку в алфавитном порядке:

```typescript
export * from './schemas/environment';
```

- [ ] **Step 6: Запустить тест**

Run: `pnpm --filter @cairn/shared test src/schemas/environment`
Expected: PASS, 11 тестов.

- [ ] **Step 7: Собрать пакет**

Run: `pnpm --filter @cairn/shared build`
Expected: без ошибок. Сборка обязательна — API и веб импортируют собранные типы.

- [ ] **Step 8: Коммит**

```bash
git add packages/shared/src
git commit -m "Добавить контракт окружений"
```

---

### Task 2: Таблицы окружений и доменов

**Files:**
- Create: `apps/api/src/db/schema/environments.ts`
- Modify: `apps/api/src/db/schema/index.ts`, `apps/api/src/db/schema/invariants.test.ts`
- Test: `apps/api/src/db/schema/environments.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/db/schema/environments.test.ts`**

```typescript
import { EnvironmentKind } from '@cairn/shared';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { environmentDomains, environmentKindEnum, environments } from './environments';

describe('окружения', () => {
  it('перечисление вида совпадает с контрактом', () => {
    expect(environmentKindEnum.enumValues).toEqual(Object.values(EnvironmentKind));
  });

  it('имя уникально в пределах проекта', () => {
    // Глобальная уникальность была бы бессмысленной: «прод» есть у каждого проекта.
    const unique = getTableConfig(environments).uniqueConstraints.find(
      (constraint) => constraint.name === 'environments_project_name',
    );

    expect(unique?.columns.map((column) => column.name).sort()).toEqual(['name', 'project_id']);
  });

  it('требует имя и вид', () => {
    expect(environments.name.notNull).toBe(true);
    expect(environments.kind.notNull).toBe(true);
  });

  it('допускает окружение без серверных параметров', () => {
    // Реестр заполняется постепенно, пустое поле честнее выдуманного.
    expect(environments.host.notNull).toBe(false);
    expect(environments.ip.notNull).toBe(false);
    expect(environments.healthCheckUrl.notNull).toBe(false);
  });
});

describe('домены окружения', () => {
  it('домен уникален в пределах окружения', () => {
    const unique = getTableConfig(environmentDomains).uniqueConstraints.find(
      (constraint) => constraint.name === 'environment_domains_environment_name',
    );

    expect(unique?.columns.map((column) => column.name).sort()).toEqual([
      'environment_id',
      'name',
    ]);
  });

  it('домен не удаляется каскадом вместе с окружением', () => {
    // Запрет каскадов в системе абсолютный (спека этапа 1, 4.1):
    // домены удаляет репозиторий явной строкой в той же транзакции.
    const cascading = getTableConfig(environmentDomains)
      .foreignKeys.map((key) => key.onDelete)
      .filter((action) => action !== 'restrict');

    expect(cascading).toEqual([]);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/db/schema/environments`
Expected: FAIL — «Failed to resolve import "./environments"».

- [ ] **Step 3: Создать `apps/api/src/db/schema/environments.ts`**

```typescript
import { EnvironmentKind } from '@cairn/shared';
import { index, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { projects } from './projects';

/** Вид окружения. Значения совпадают с контрактом. */
export const environmentKindEnum = pgEnum('environment_kind', [
  EnvironmentKind.Production,
  EnvironmentKind.Staging,
  EnvironmentKind.Development,
  EnvironmentKind.Other,
]);

/**
 * Окружения проекта (ТЗ 3.2).
 *
 * Двухуровневая схема «проект → окружение» обязательна: без неё нельзя
 * описать проект, у которого прод и стейдж на разных машинах.
 *
 * Все поля, кроме имени и вида, необязательны: реестр заполняется
 * постепенно, и запись, заведённая за минуту до совещания, полезнее
 * отсутствующей.
 */
export const environments = pgTable(
  'environments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    kind: environmentKindEnum('kind').notNull(),
    host: text('host'),
    ip: text('ip'),
    provider: text('provider'),
    specs: text('specs'),
    healthCheckUrl: text('health_check_url'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('environments_project_name').on(table.projectId, table.name),
    index('environments_project_idx').on(table.projectId),
  ],
);

/**
 * Домены окружения.
 *
 * Отдельная таблица нужна не сегодня, а этапу 6: проверки будут писать
 * по каждому домену срок регистрации и состояние сертификата, и хранить
 * это в строке пришлось бы разбором текста.
 */
export const environmentDomains = pgTable(
  'environment_domains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('environment_domains_environment_name').on(table.environmentId, table.name),
    index('environment_domains_environment_idx').on(table.environmentId),
  ],
);

/** Строка таблицы окружений. */
export type Environment = typeof environments.$inferSelect;

/** Строка таблицы доменов. */
export type EnvironmentDomain = typeof environmentDomains.$inferSelect;
```

- [ ] **Step 4: Дополнить `apps/api/src/db/schema/index.ts`**

```typescript
export * from './environments';
```

Строку добавь в алфавитном порядке — после `./audit-log`.

- [ ] **Step 5: Включить новые таблицы в проверку инвариантов**

В `apps/api/src/db/schema/invariants.test.ts` добавь импорт и две строки в `ALL_TABLES`:

```typescript
import { environmentDomains, environments } from './environments';
```

```typescript
  { name: 'environments', table: environments },
  { name: 'environment_domains', table: environmentDomains },
```

Порядок в массиве — после `projects`. Это включает новые таблицы в проверку «каскадов нет».

- [ ] **Step 6: Запустить тесты схемы**

Run: `pnpm --filter @cairn/api test src/db/schema`
Expected: PASS. Тесты инвариантов проходят с двумя новыми таблицами.

- [ ] **Step 7: Коммит**

```bash
git add apps/api/src/db/schema
git commit -m "Добавить таблицы окружений и доменов"
```

---

### Task 3: Миграция и права роли приложения

**Files:**
- Create: `apps/api/drizzle/0002_*.sql` (генерируется), `apps/api/drizzle/0003_environment_privileges.sql`
- Modify: `apps/api/test/db-fixture.ts`

- [ ] **Step 1: Сгенерировать миграцию схемы**

```bash
pnpm --filter @cairn/api db:generate
```

Drizzle создаст `apps/api/drizzle/0002_<случайное_имя>.sql` с созданием перечисления `environment_kind` и двух таблиц. Открой файл и убедись, что в нём нет `DROP` — ничего существующего этап не удаляет.

- [ ] **Step 2: Написать падающий тест прав роли `apps/api/test/environments-privileges.test.ts`**

```typescript
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startTestDatabase, type TestDatabase } from './db-fixture';

describe('права роли приложения на окружения', () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  });

  afterAll(async () => {
    await testDb.stop();
  });

  it('роль приложения читает и пишет окружения', async () => {
    // Права выдаются миграцией из репозитория, а не фикстурой: иначе тест
    // остался бы зелёным при сломанной миграции (см. комментарий в db-fixture).
    await expect(testDb.appDb.execute(sql`SELECT count(*) FROM environments`)).resolves.toBeDefined();
    await expect(
      testDb.appDb.execute(sql`SELECT count(*) FROM environment_domains`),
    ).resolves.toBeDefined();
  });

  it('роль приложения не меняет схему', async () => {
    await expect(
      testDb.appDb.execute(sql`ALTER TABLE environments ADD COLUMN sneaky text`),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test test/environments-privileges`
Expected: FAIL — «permission denied for table environments».

- [ ] **Step 4: Создать `apps/api/drizzle/0003_environment_privileges.sql`**

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON
  environments, environment_domains
TO cairn_app;
```

- [ ] **Step 5: Зарегистрировать миграцию в журнале Drizzle**

Проверь `apps/api/drizzle/meta/_journal.json`: генератор добавил запись для `0002`, но `0003` написан вручную и в журнале отсутствует — без записи `migrate` его пропустит. Добавь запись по образцу соседней, увеличив `idx` и `when` (миллисекунды эпохи).

- [ ] **Step 6: Дополнить очистку в `apps/api/test/db-fixture.ts`**

В `truncate` добавь новые таблицы **перед** `projects` (порядок в `TRUNCATE` не важен из-за `CASCADE`, но перечисление читается сверху вниз как «сначала зависимые»):

```typescript
      await db.execute(sql`
        TRUNCATE TABLE audit_log, grants, sessions, invitations, totp_challenges,
                       environment_domains, environments,
                       projects, users, subjects
        RESTART IDENTITY CASCADE
      `);
```

- [ ] **Step 7: Запустить тест**

Run: `pnpm --filter @cairn/api test test/environments-privileges`
Expected: PASS, 2 теста.

- [ ] **Step 8: Применить миграции к локальной базе**

```bash
pnpm --filter @cairn/api db:migrate
```

Expected: без ошибок. Если база не поднята — `docker compose up -d --wait postgres`.

- [ ] **Step 9: Коммит**

```bash
git add apps/api/drizzle apps/api/test
git commit -m "Добавить миграцию окружений"
```

---

**Результат чанка 1:** типы окружения доступны обеим сторонам, таблицы существуют, роль приложения имеет к ним права, и это проверено тестом.

---

## Chunk 2: Доступ к данным

Результат чанка: окружения читаются и изменяются через репозиторий с проверкой прав, изменения попадают в журнал.

### Task 4: Общий помощник проекции и проекция окружения

**Files:**
- Create: `apps/api/src/access/projection.ts`, `apps/api/src/environments/environment.projection.ts`
- Test: `apps/api/src/access/projection.test.ts`, `apps/api/src/environments/environment.projection.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/access/projection.test.ts`**

```typescript
import { AccessLevel } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { projectByLevel } from './projection';

describe('projectByLevel', () => {
  const metadata = { id: '1', name: 'Прод' };
  const details = { ip: '203.0.113.10' };

  it('на уровне метаданных отдаёт только метаданные', () => {
    expect(projectByLevel(AccessLevel.Metadata, metadata, () => details)).toEqual(metadata);
  });

  it('на уровне чтения добавляет подробности', () => {
    expect(projectByLevel(AccessLevel.Read, metadata, () => details)).toEqual({
      ...metadata,
      ...details,
    });
  });

  it('на уровне записи отдаёт то же, что на чтении', () => {
    // Запись отличается правом менять, а не составом видимых полей (ТЗ 4.3).
    expect(projectByLevel(AccessLevel.Write, metadata, () => details)).toEqual({
      ...metadata,
      ...details,
    });
  });

  it('не вычисляет подробности на уровне метаданных', () => {
    // Подробности могут стоить запроса в базу или расшифровки (этап 4),
    // и делать эту работу ради выброшенного результата нельзя.
    let calls = 0;

    projectByLevel(AccessLevel.Metadata, metadata, () => {
      calls += 1;

      return details;
    });

    expect(calls).toBe(0);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/access/projection`
Expected: FAIL — «Failed to resolve import "./projection"».

- [ ] **Step 3: Создать `apps/api/src/access/projection.ts`**

```typescript
import { AccessLevel } from '@cairn/shared';

/**
 * Собирает представление объекта по уровню доступа (спека 5.5).
 *
 * Подробности передаются функцией, а не значением: на уровне метаданных
 * они не нужны, а их вычисление может стоить запроса в базу или расшифровки
 * значения (этап 4). Работа ради выброшенного результата здесь недопустима.
 *
 * Помощник намеренно не знает ни об одной секции: секций шесть, форма
 * проекции у всех одна, и повторять её шесть раз незачем.
 */
export function projectByLevel<M extends object, D extends object>(
  level: AccessLevel,
  metadata: M,
  details: () => D,
): M | (M & D) {
  if (level === AccessLevel.Metadata) {
    return metadata;
  }

  return { ...metadata, ...details() };
}
```

- [ ] **Step 4: Запустить тест**

Run: `pnpm --filter @cairn/api test src/access/projection`
Expected: PASS, 4 теста.

- [ ] **Step 5: Написать падающий тест `apps/api/src/environments/environment.projection.test.ts`**

```typescript
import { AccessLevel, EnvironmentKind, type EnvironmentDetail } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { environmentProjection } from './environment.projection';
import type { Environment } from '../db/schema';

const row: Environment = {
  id: '11111111-1111-1111-1111-111111111111',
  projectId: '22222222-2222-2222-2222-222222222222',
  name: 'Прод',
  kind: EnvironmentKind.Production,
  host: 'srv-1.example.com',
  ip: '203.0.113.10',
  provider: 'Hetzner',
  specs: '2 vCPU, 4 ГБ',
  healthCheckUrl: 'https://example.com/health',
  notes: 'Заметка',
  createdAt: new Date('2026-08-27T10:00:00Z'),
  updatedAt: new Date('2026-08-27T10:00:00Z'),
};

const domains = ['example.com'];

describe('проекция окружения', () => {
  it('на уровне метаданных показывает имя, вид и домены', () => {
    const projected = environmentProjection(row, domains, AccessLevel.Metadata);

    expect(projected).toEqual({
      id: row.id,
      name: 'Прод',
      kind: EnvironmentKind.Production,
      domains: ['example.com'],
    });
  });

  it('на уровне метаданных скрывает серверные параметры', () => {
    // Домен виден каждому, кто откроет сайт; IP и провайдер — нет (спека 4).
    const projected = environmentProjection(row, domains, AccessLevel.Metadata);

    expect('ip' in projected).toBe(false);
    expect('provider' in projected).toBe(false);
    expect('notes' in projected).toBe(false);
  });

  it('на уровне чтения показывает серверные параметры', () => {
    const projected = environmentProjection(row, domains, AccessLevel.Read) as EnvironmentDetail;

    expect(projected.ip).toBe('203.0.113.10');
    expect(projected.host).toBe('srv-1.example.com');
    expect(projected.healthCheckUrl).toBe('https://example.com/health');
  });

  it('отдаёт время строками', () => {
    // Через HTTP уходит JSON, и дата обязана быть сериализуемой однозначно.
    const projected = environmentProjection(row, domains, AccessLevel.Read) as EnvironmentDetail;

    expect(projected.createdAt).toBe('2026-08-27T10:00:00.000Z');
  });
});
```

- [ ] **Step 6: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/environments/environment.projection`
Expected: FAIL — модуль не найден.

- [ ] **Step 7: Создать `apps/api/src/environments/environment.projection.ts`**

```typescript
import {
  AccessLevel,
  type EnvironmentDetail,
  type EnvironmentMetadata,
} from '@cairn/shared';

import { projectByLevel } from '../access/projection';
import type { Environment } from '../db/schema';

/**
 * Приводит окружение к набору полей, разрешённому уровнем доступа (ТЗ 4.3).
 *
 * Домены отнесены к метаданным вместе с именем и видом: домен — публичный
 * адрес окружения, видимый любому, кто откроет сайт. IP, провайдер и
 * характеристики к публично наблюдаемому не относятся.
 */
export function environmentProjection(
  environment: Environment,
  domains: string[],
  level: AccessLevel,
): EnvironmentMetadata | EnvironmentDetail {
  return projectByLevel(
    level,
    {
      id: environment.id,
      name: environment.name,
      kind: environment.kind,
      domains,
    },
    () => ({
      host: environment.host,
      ip: environment.ip,
      provider: environment.provider,
      specs: environment.specs,
      healthCheckUrl: environment.healthCheckUrl,
      notes: environment.notes,
      createdAt: environment.createdAt.toISOString(),
      updatedAt: environment.updatedAt.toISOString(),
    }),
  );
}
```

- [ ] **Step 8: Запустить тесты**

Run: `pnpm --filter @cairn/api test src/environments src/access`
Expected: PASS.

- [ ] **Step 9: Коммит**

```bash
git add apps/api/src/access apps/api/src/environments
git commit -m "Добавить проекцию окружения по уровню доступа"
```

---

### Task 5: Репозиторий окружений

Самая содержательная задача этапа: здесь живёт проверка прав, и от неё зависит вся секция.

**Files:**
- Create: `apps/api/src/environments/environments.repository.ts`
- Test: `apps/api/src/environments/environments.repository.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/environments/environments.repository.test.ts`**

```typescript
import { AccessLevel, EnvironmentKind, Section, SubjectKind } from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import { InsufficientLevelError, SectionNotVisibleError } from '../access/access.errors';
import type { RequestSubject } from '../access/access.types';
import { environmentDomains, environments, grants, projects, subjects, users } from '../db/schema';
import { EnvironmentsRepository } from './environments.repository';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('репозиторий окружений', () => {
  let testDb: TestDatabase;
  let repository: EnvironmentsRepository;
  let projectId: string;
  let otherProjectId: string;
  let subjectId: string;
  let adminUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new EnvironmentsRepository(testDb.db, new AccessService(testDb.db));
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    const [admin] = await testDb.db
      .insert(users)
      .values({
        subjectId: adminSubject!.id,
        email: 'admin@cairn.local',
        passwordHash: 'хэш',
        isSuperadmin: true,
      })
      .returning();
    adminUserId = admin!.id;

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    subjectId = subject!.id;
    await testDb.db
      .insert(users)
      .values({ subjectId, email: 'user@cairn.local', passwordHash: 'хэш' });

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;

    const [other] = await testDb.db
      .insert(projects)
      .values({ slug: 'chuzhoj', name: 'Чужой' })
      .returning();
    otherProjectId = other!.id;
  });

  /** Субъект без суперадминства: права даёт только выдача. */
  const member = (): RequestSubject => ({
    id: subjectId,
    kind: SubjectKind.User,
    label: 'user@cairn.local',
    isSuperadmin: false,
    isRevoked: false,
  });

  const admin = (): RequestSubject => ({
    id: 'неважно',
    kind: SubjectKind.User,
    label: 'admin@cairn.local',
    isSuperadmin: true,
    isRevoked: false,
  });

  async function grant(level: AccessLevel): Promise<void> {
    await testDb.db.insert(grants).values({
      subjectId,
      projectId,
      section: Section.Infrastructure,
      level,
      grantedBy: adminUserId,
    });
  }

  async function createProd(): Promise<string> {
    const created = await testDb.db.transaction((tx) =>
      repository.create(admin(), tx, projectId, {
        name: 'Прод',
        kind: EnvironmentKind.Production,
        ip: '203.0.113.10',
        domains: ['example.com'],
      }),
    );

    return created.id;
  }

  describe('создание', () => {
    it('создаёт окружение с доменами', async () => {
      const id = await createProd();

      const [row] = await testDb.db.select().from(environments).where(eq(environments.id, id));
      const domains = await testDb.db
        .select()
        .from(environmentDomains)
        .where(eq(environmentDomains.environmentId, id));

      expect(row?.name).toBe('Прод');
      expect(domains.map((domain) => domain.name)).toEqual(['example.com']);
    });

    it('отказывает субъекту с уровнем чтения', async () => {
      await grant(AccessLevel.Read);

      await expect(
        testDb.db.transaction((tx) =>
          repository.create(member(), tx, projectId, {
            name: 'Стейдж',
            kind: EnvironmentKind.Staging,
          }),
        ),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
    });

    it('скрывает существование проекта от субъекта без выдачи', async () => {
      await expect(
        testDb.db.transaction((tx) =>
          repository.create(member(), tx, projectId, {
            name: 'Стейдж',
            kind: EnvironmentKind.Staging,
          }),
        ),
      ).rejects.toBeInstanceOf(SectionNotVisibleError);
    });

    it('не допускает двух окружений с одним именем в проекте', async () => {
      await createProd();

      await expect(
        testDb.db.transaction((tx) =>
          repository.create(admin(), tx, projectId, {
            name: 'Прод',
            kind: EnvironmentKind.Production,
          }),
        ),
      ).rejects.toThrow();
    });

    it('допускает одноимённые окружения в разных проектах', async () => {
      await createProd();

      const created = await testDb.db.transaction((tx) =>
        repository.create(admin(), tx, otherProjectId, {
          name: 'Прод',
          kind: EnvironmentKind.Production,
        }),
      );

      expect(created.id).toBeDefined();
    });
  });

  describe('чтение', () => {
    it('на уровне метаданных не отдаёт IP', async () => {
      await createProd();
      await grant(AccessLevel.Metadata);

      const [environment] = await repository.findForProject(member(), projectId);

      expect(environment).toMatchObject({ name: 'Прод', domains: ['example.com'] });
      expect('ip' in environment!).toBe(false);
    });

    it('на уровне чтения отдаёт IP', async () => {
      await createProd();
      await grant(AccessLevel.Read);

      const [environment] = await repository.findForProject(member(), projectId);

      expect(environment).toMatchObject({ ip: '203.0.113.10' });
    });

    it('скрывает секцию от субъекта без выдачи', async () => {
      await createProd();

      await expect(repository.findForProject(member(), projectId)).rejects.toBeInstanceOf(
        SectionNotVisibleError,
      );
    });

    it('выдача на другую секцию доступа к инфраструктуре не даёт', async () => {
      // Выдачи адресуются паре «проект × секция», и доступ к «Инфо»
      // не должен открывать окружения (ТЗ 4.1).
      await createProd();
      await testDb.db.insert(grants).values({
        subjectId,
        projectId,
        section: Section.Info,
        level: AccessLevel.Write,
        grantedBy: adminUserId,
      });

      await expect(repository.findForProject(member(), projectId)).rejects.toBeInstanceOf(
        SectionNotVisibleError,
      );
    });

    it('показывает прод раньше остальных окружений', async () => {
      await testDb.db.transaction(async (tx) => {
        await repository.create(admin(), tx, projectId, {
          name: 'Дев',
          kind: EnvironmentKind.Development,
        });
        await repository.create(admin(), tx, projectId, {
          name: 'Прод',
          kind: EnvironmentKind.Production,
        });
      });

      const list = await repository.findForProject(admin(), projectId);

      expect(list.map((environment) => environment.name)).toEqual(['Прод', 'Дев']);
    });

    it('возвращает окружение по идентификатору', async () => {
      const id = await createProd();
      await grant(AccessLevel.Read);

      const environment = await repository.findById(member(), projectId, id);

      expect(environment).toMatchObject({ id, name: 'Прод' });
    });

    it('не отдаёт окружение через чужой проект', async () => {
      // Иначе идентификатор окружения из доступного проекта стал бы
      // ключом к окружению недоступного.
      const id = await createProd();

      await expect(repository.findById(admin(), otherProjectId, id)).rejects.toBeInstanceOf(
        SectionNotVisibleError,
      );
    });
  });

  describe('правка', () => {
    it('меняет переданные поля и не трогает остальные', async () => {
      const id = await createProd();

      const updated = await testDb.db.transaction((tx) =>
        repository.update(admin(), tx, projectId, id, { provider: 'Hetzner' }),
      );

      expect(updated.provider).toBe('Hetzner');
      expect(updated.ip).toBe('203.0.113.10');
    });

    it('заменяет набор доменов целиком', async () => {
      const id = await createProd();

      await testDb.db.transaction((tx) =>
        repository.update(admin(), tx, projectId, id, { domains: ['api.example.com'] }),
      );

      const domains = await testDb.db
        .select()
        .from(environmentDomains)
        .where(eq(environmentDomains.environmentId, id));

      expect(domains.map((domain) => domain.name)).toEqual(['api.example.com']);
    });

    it('не трогает домены, если поле не передано', async () => {
      // Иначе правка одного лишь провайдера стирала бы адреса.
      const id = await createProd();

      await testDb.db.transaction((tx) =>
        repository.update(admin(), tx, projectId, id, { provider: 'Hetzner' }),
      );

      const domains = await testDb.db
        .select()
        .from(environmentDomains)
        .where(eq(environmentDomains.environmentId, id));

      expect(domains).toHaveLength(1);
    });

    it('отказывает субъекту с уровнем чтения', async () => {
      const id = await createProd();
      await grant(AccessLevel.Read);

      await expect(
        testDb.db.transaction((tx) =>
          repository.update(member(), tx, projectId, id, { provider: 'Hetzner' }),
        ),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
    });

    it('обновляет отметку времени', async () => {
      const id = await createProd();

      const updated = await testDb.db.transaction((tx) =>
        repository.update(admin(), tx, projectId, id, { provider: 'Hetzner' }),
      );

      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(updated.createdAt.getTime());
    });
  });

  describe('удаление', () => {
    it('удаляет окружение вместе с доменами', async () => {
      const id = await createProd();

      await testDb.db.transaction((tx) => repository.remove(admin(), tx, projectId, id));

      const rows = await testDb.db.select().from(environments);
      const domains = await testDb.db.select().from(environmentDomains);

      expect(rows).toHaveLength(0);
      expect(domains).toHaveLength(0);
    });

    it('возвращает удалённое окружение', async () => {
      // Имя нужно журналу: после удаления строки его больше неоткуда взять.
      const id = await createProd();

      const removed = await testDb.db.transaction((tx) =>
        repository.remove(admin(), tx, projectId, id),
      );

      expect(removed.name).toBe('Прод');
    });

    it('отказывает субъекту с уровнем чтения', async () => {
      const id = await createProd();
      await grant(AccessLevel.Read);

      await expect(
        testDb.db.transaction((tx) => repository.remove(member(), tx, projectId, id)),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
    });

    it('сообщает «не найдено» об уже удалённом окружении', async () => {
      const id = await createProd();
      await testDb.db.transaction((tx) => repository.remove(admin(), tx, projectId, id));

      await expect(
        testDb.db.transaction((tx) => repository.remove(admin(), tx, projectId, id)),
      ).rejects.toBeInstanceOf(SectionNotVisibleError);
    });
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/environments/environments.repository`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать `apps/api/src/environments/environments.repository.ts`**

```typescript
import {
  AccessLevel,
  Section,
  type EnvironmentCreate,
  type EnvironmentDetail,
  type EnvironmentMetadata,
  type EnvironmentUpdate,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';

import { SectionNotVisibleError } from '../access/access.errors';
import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { DATABASE } from '../db/db.module';
import type { Database, Executor, Transaction } from '../db/db.types';
import { environmentDomains, environments, type Environment } from '../db/schema';
import { environmentProjection } from './environment.projection';

/**
 * Доступ к окружениям проекта.
 *
 * Каждый метод принимает субъект первым аргументом и проверяет права сам:
 * отдельного вызова проверки, который можно забыть, не существует (спека 5.4).
 *
 * Методы записи принимают транзакцию, потому что сервис пишет в журнал
 * в той же транзакции (спека 7.3).
 */
@Injectable()
export class EnvironmentsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly access: AccessService,
  ) {}

  /**
   * Возвращает окружения проекта в проекции, соответствующей уровню.
   *
   * Проекция здесь по уровню, а не всегда метаданных, как в списке проектов:
   * этот список и есть экран секции, и второй запрос за теми же данными
   * был бы лишним.
   */
  async findForProject(
    subject: RequestSubject,
    projectId: string,
  ): Promise<(EnvironmentMetadata | EnvironmentDetail)[]> {
    const level = await this.access.requireLevel(
      subject,
      projectId,
      Section.Infrastructure,
      AccessLevel.Metadata,
    );

    const rows = await this.db
      .select()
      .from(environments)
      .where(eq(environments.projectId, projectId))
      // Порядок значений перечисления в базе — от прода к прочему,
      // поэтому сортировка по нему ставит прод первым без отдельного поля.
      .orderBy(asc(environments.kind), asc(environments.name));

    const domains = await this.domainsOf(rows.map((row) => row.id));

    return rows.map((row) => environmentProjection(row, domains.get(row.id) ?? [], level));
  }

  /** Возвращает окружение проекта в проекции, соответствующей уровню. */
  async findById(
    subject: RequestSubject,
    projectId: string,
    environmentId: string,
  ): Promise<EnvironmentMetadata | EnvironmentDetail> {
    const level = await this.access.requireLevel(
      subject,
      projectId,
      Section.Infrastructure,
      AccessLevel.Metadata,
    );

    const environment = await this.requireEnvironment(this.db, projectId, environmentId);
    const domains = await this.domainsOf([environmentId]);

    return environmentProjection(environment, domains.get(environmentId) ?? [], level);
  }

  /** Создаёт окружение вместе с его доменами. */
  async create(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    input: EnvironmentCreate,
  ): Promise<Environment> {
    await this.access.requireLevel(
      subject,
      projectId,
      Section.Infrastructure,
      AccessLevel.Write,
      tx,
    );

    const { domains, ...fields } = input;

    const [created] = await tx
      .insert(environments)
      .values({ ...fields, projectId })
      .returning();

    await this.replaceDomains(tx, created!.id, domains ?? []);

    return created!;
  }

  /**
   * Изменяет окружение.
   *
   * Домены заменяются целиком, но только если поле передано: правка одного
   * лишь провайдера не должна стирать адреса.
   */
  async update(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    environmentId: string,
    input: EnvironmentUpdate,
  ): Promise<Environment> {
    await this.access.requireLevel(
      subject,
      projectId,
      Section.Infrastructure,
      AccessLevel.Write,
      tx,
    );

    await this.requireEnvironment(tx, projectId, environmentId);

    const { domains, ...fields } = input;

    const [updated] = await tx
      .update(environments)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(environments.id, environmentId))
      .returning();

    if (domains) {
      await this.replaceDomains(tx, environmentId, domains);
    }

    return updated!;
  }

  /**
   * Удаляет окружение вместе с доменами и возвращает удалённую строку.
   *
   * Домены удаляются явно, а не каскадом: запрет каскадов в системе
   * абсолютный и проверяется тестом инвариантов (спека этапа 1, 4.1).
   */
  async remove(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    environmentId: string,
  ): Promise<Environment> {
    await this.access.requireLevel(
      subject,
      projectId,
      Section.Infrastructure,
      AccessLevel.Write,
      tx,
    );

    const environment = await this.requireEnvironment(tx, projectId, environmentId);

    await tx.delete(environmentDomains).where(eq(environmentDomains.environmentId, environmentId));
    await tx.delete(environments).where(eq(environments.id, environmentId));

    return environment;
  }

  /** Возвращает домены окружений, сгруппированные по окружению. */
  private async domainsOf(environmentIds: string[]): Promise<Map<string, string[]>> {
    if (environmentIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .select()
      .from(environmentDomains)
      .where(inArray(environmentDomains.environmentId, environmentIds))
      .orderBy(asc(environmentDomains.name));

    const grouped = new Map<string, string[]>();

    for (const row of rows) {
      grouped.set(row.environmentId, [...(grouped.get(row.environmentId) ?? []), row.name]);
    }

    return grouped;
  }

  /** Заменяет набор доменов окружения целиком. */
  private async replaceDomains(
    tx: Transaction,
    environmentId: string,
    domains: string[],
  ): Promise<void> {
    await tx.delete(environmentDomains).where(eq(environmentDomains.environmentId, environmentId));

    if (domains.length === 0) {
      return;
    }

    await tx
      .insert(environmentDomains)
      .values(domains.map((name) => ({ environmentId, name })));
  }

  /**
   * Находит окружение, принадлежащее указанному проекту.
   *
   * Принадлежность проверяется в самом запросе: окружение из чужого проекта
   * обязано выглядеть несуществующим, а не «чужим» (спека 6).
   */
  private async requireEnvironment(
    executor: Executor,
    projectId: string,
    environmentId: string,
  ): Promise<Environment> {
    const [environment] = await executor
      .select()
      .from(environments)
      .where(and(eq(environments.id, environmentId), eq(environments.projectId, projectId)))
      .limit(1);

    if (!environment) {
      throw new SectionNotVisibleError();
    }

    return environment;
  }
}
```

- [ ] **Step 4: Запустить тесты**

Run: `pnpm --filter @cairn/api test src/environments/environments.repository`
Expected: PASS, 19 тестов.

Если падает «relation environment_domains does not exist» — миграция из Task 3 не зарегистрирована в `_journal.json`.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/environments
git commit -m "Добавить репозиторий окружений"
```

---

### Task 6: Сервис окружений и записи журнала

**Files:**
- Modify: `apps/api/src/audit/audit.types.ts`
- Create: `apps/api/src/environments/environments.service.ts`
- Test: `apps/api/src/environments/environments.service.test.ts`

- [ ] **Step 1: Добавить действия в `apps/api/src/audit/audit.types.ts`**

В перечисление `AuditAction`, после `ProjectUpdated`:

```typescript
  EnvironmentCreated = 'environment.created',
  EnvironmentUpdated = 'environment.updated',
  EnvironmentDeleted = 'environment.deleted',
```

- [ ] **Step 2: Написать падающий тест `apps/api/src/environments/environments.service.test.ts`**

```typescript
import { EnvironmentKind, SubjectKind } from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { auditLog, projects, subjects, users } from '../db/schema';
import { EnvironmentsRepository } from './environments.repository';
import { EnvironmentsService } from './environments.service';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('сервис окружений', () => {
  let testDb: TestDatabase;
  let service: EnvironmentsService;
  let projectId: string;
  let subjectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    service = new EnvironmentsService(
      testDb.db,
      new EnvironmentsRepository(testDb.db, new AccessService(testDb.db)),
      new AuditService(),
    );
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    subjectId = subject!.id;
    await testDb.db.insert(users).values({
      subjectId,
      email: 'admin@cairn.local',
      passwordHash: 'хэш',
      isSuperadmin: true,
    });

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;
  });

  const admin = (): RequestSubject => ({
    id: subjectId,
    kind: SubjectKind.User,
    label: 'admin@cairn.local',
    isSuperadmin: true,
    isRevoked: false,
  });

  async function entriesOf(action: AuditAction) {
    return testDb.db.select().from(auditLog).where(eq(auditLog.action, action));
  }

  it('пишет создание в журнал', async () => {
    await service.create(admin(), projectId, { name: 'Прод', kind: EnvironmentKind.Production });

    const [entry] = await entriesOf(AuditAction.EnvironmentCreated);

    expect(entry?.projectId).toBe(projectId);
    expect(entry?.metadata).toMatchObject({ name: 'Прод' });
  });

  it('пишет правку с перечнем изменённых полей', async () => {
    // Значения полей в журнал не попадают: тем же путём на этапе 4 пойдут
    // переменные, и запись значений свела бы на нет их шифрование (ТЗ 9).
    const created = await service.create(admin(), projectId, {
      name: 'Прод',
      kind: EnvironmentKind.Production,
    });

    await service.update(admin(), projectId, created.id, { ip: '203.0.113.10' });

    const [entry] = await entriesOf(AuditAction.EnvironmentUpdated);

    expect(entry?.metadata).toMatchObject({ fields: ['ip'] });
    expect(JSON.stringify(entry?.metadata)).not.toContain('203.0.113.10');
  });

  it('пишет удаление вместе с именем', async () => {
    // После удаления строки имя больше неоткуда взять, а запись журнала
    // обязана оставаться читаемой.
    const created = await service.create(admin(), projectId, {
      name: 'Прод',
      kind: EnvironmentKind.Production,
    });

    await service.remove(admin(), projectId, created.id);

    const [entry] = await entriesOf(AuditAction.EnvironmentDeleted);

    expect(entry?.metadata).toMatchObject({ name: 'Прод' });
    expect(entry?.entityId).toBe(created.id);
  });

  it('не пишет в журнал, когда изменение не состоялось', async () => {
    // Отказ по правам обязан оставить базу нетронутой: и окружение,
    // и запись журнала откатываются одной транзакцией.
    await expect(
      service.remove(admin(), projectId, '11111111-1111-1111-1111-111111111111'),
    ).rejects.toThrow();

    expect(await entriesOf(AuditAction.EnvironmentDeleted)).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/environments/environments.service`
Expected: FAIL — модуль не найден.

- [ ] **Step 4: Создать `apps/api/src/environments/environments.service.ts`**

```typescript
import {
  AuditSubjectKind,
  type EnvironmentCreate,
  type EnvironmentDetail,
  type EnvironmentMetadata,
  type EnvironmentUpdate,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import type { Environment } from '../db/schema';
import { EnvironmentsRepository } from './environments.repository';

/**
 * Окружения: изменения вместе с журналированием.
 *
 * Права проверяет репозиторий — он единственный путь к данным (спека 5.4).
 * Сервис добавляет запись в журнал в той же транзакции (спека 7.3).
 */
@Injectable()
export class EnvironmentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: EnvironmentsRepository,
    private readonly audit: AuditService,
  ) {}

  /** Возвращает окружения проекта в проекции по уровню доступа. */
  async list(
    subject: RequestSubject,
    projectId: string,
  ): Promise<(EnvironmentMetadata | EnvironmentDetail)[]> {
    return this.repository.findForProject(subject, projectId);
  }

  /** Возвращает окружение в проекции по уровню доступа. */
  async findById(
    subject: RequestSubject,
    projectId: string,
    environmentId: string,
  ): Promise<EnvironmentMetadata | EnvironmentDetail> {
    return this.repository.findById(subject, projectId, environmentId);
  }

  /** Создаёт окружение. */
  async create(
    subject: RequestSubject,
    projectId: string,
    input: EnvironmentCreate,
  ): Promise<Environment> {
    return this.db.transaction(async (tx) => {
      const created = await this.repository.create(subject, tx, projectId, input);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.EnvironmentCreated,
        entityType: 'environment',
        entityId: created.id,
        projectId,
        metadata: { name: created.name, kind: created.kind },
      });

      return created;
    });
  }

  /** Изменяет окружение. В журнал попадают имена изменённых полей, но не значения. */
  async update(
    subject: RequestSubject,
    projectId: string,
    environmentId: string,
    input: EnvironmentUpdate,
  ): Promise<Environment> {
    return this.db.transaction(async (tx) => {
      const updated = await this.repository.update(subject, tx, projectId, environmentId, input);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.EnvironmentUpdated,
        entityType: 'environment',
        entityId: environmentId,
        projectId,
        metadata: { name: updated.name, fields: Object.keys(input) },
      });

      return updated;
    });
  }

  /** Удаляет окружение вместе с доменами. */
  async remove(
    subject: RequestSubject,
    projectId: string,
    environmentId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const removed = await this.repository.remove(subject, tx, projectId, environmentId);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.EnvironmentDeleted,
        entityType: 'environment',
        entityId: environmentId,
        projectId,
        metadata: { name: removed.name },
      });
    });
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

- [ ] **Step 5: Запустить тесты**

Run: `pnpm --filter @cairn/api test src/environments`
Expected: PASS, 4 теста сервиса плюс прежние.

- [ ] **Step 6: Коммит**

```bash
git add apps/api/src/environments apps/api/src/audit
git commit -m "Добавить сервис окружений с журналом"
```

---

**Результат чанка 2:** окружения читаются и изменяются с проверкой прав, каждое изменение попадает в журнал, значения полей в журнал не утекают.

---

## Chunk 3: HTTP-слой

Результат чанка: секция доступна по HTTP, поведение уровней зафиксировано исполняемой матрицей.

### Task 7: Контроллер и модуль окружений

**Files:**
- Create: `apps/api/src/environments/environments.controller.ts`, `apps/api/src/environments/environments.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/environments.e2e.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/test/environments.e2e.test.ts`**

```typescript
import { AccessLevel, EnvironmentKind, Section, SubjectKind } from '@cairn/shared';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/auth/password.service';
import { DATABASE } from '../src/db/db.module';
import { grants, projects, subjects, users } from '../src/db/schema';
import { startTestDatabase, type TestDatabase } from './db-fixture';

describe('HTTP: окружения', () => {
  let testDb: TestDatabase;
  let app: INestApplication;
  let projectId: string;
  let memberSubjectId: string;
  let adminUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE)
      .useValue(testDb.db)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const passwordHash = await new PasswordService().hash('очень длинный пароль');

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    const [admin] = await testDb.db
      .insert(users)
      .values({
        subjectId: adminSubject!.id,
        email: 'admin@cairn.local',
        passwordHash,
        isSuperadmin: true,
      })
      .returning();
    adminUserId = admin!.id;

    const [memberSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    memberSubjectId = memberSubject!.id;
    await testDb.db
      .insert(users)
      .values({ subjectId: memberSubjectId, email: 'user@cairn.local', passwordHash });

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;
  });

  /** Входит и возвращает cookie сессии. */
  async function signIn(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'очень длинный пароль' });

    return response.headers['set-cookie'][0];
  }

  async function grantLevel(level: AccessLevel): Promise<void> {
    await testDb.db.insert(grants).values({
      subjectId: memberSubjectId,
      projectId,
      section: Section.Infrastructure,
      level,
      grantedBy: adminUserId,
    });
  }

  const PROD = {
    name: 'Прод',
    kind: EnvironmentKind.Production,
    ip: '203.0.113.10',
    domains: ['example.com'],
  };

  it('создаёт окружение и возвращает его', async () => {
    const cookie = await signIn('admin@cairn.local');

    const response = await request(app.getHttpServer())
      .post(`/projects/${projectId}/environments`)
      .set('Cookie', cookie)
      .send(PROD);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ name: 'Прод', domains: ['example.com'] });
  });

  it('отвергает окружение без вида', async () => {
    const cookie = await signIn('admin@cairn.local');

    const response = await request(app.getHttpServer())
      .post(`/projects/${projectId}/environments`)
      .set('Cookie', cookie)
      .send({ name: 'Прод' });

    expect(response.status).toBe(400);
  });

  it('не раскрывает секцию субъекту без выдачи', async () => {
    const cookie = await signIn('user@cairn.local');

    const response = await request(app.getHttpServer())
      .get(`/projects/${projectId}/environments`)
      .set('Cookie', cookie);

    expect(response.status).toBe(404);
  });

  it('на уровне метаданных не отдаёт IP', async () => {
    const adminCookie = await signIn('admin@cairn.local');
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/environments`)
      .set('Cookie', adminCookie)
      .send(PROD);

    await grantLevel(AccessLevel.Metadata);
    const cookie = await signIn('user@cairn.local');

    const response = await request(app.getHttpServer())
      .get(`/projects/${projectId}/environments`)
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({ name: 'Прод', domains: ['example.com'] });
    expect(response.body[0].ip).toBeUndefined();
  });

  it('на уровне метаданных отказывает в правке кодом 403', async () => {
    // Доступ есть, но уровень ниже требуемого — существование объекта
    // уже не секрет (спека этапа 1, 5.3).
    const adminCookie = await signIn('admin@cairn.local');
    const created = await request(app.getHttpServer())
      .post(`/projects/${projectId}/environments`)
      .set('Cookie', adminCookie)
      .send(PROD);

    await grantLevel(AccessLevel.Metadata);
    const cookie = await signIn('user@cairn.local');

    const response = await request(app.getHttpServer())
      .patch(`/projects/${projectId}/environments/${created.body.id}`)
      .set('Cookie', cookie)
      .send({ provider: 'Hetzner' });

    expect(response.status).toBe(403);
  });

  it('удаляет окружение', async () => {
    const cookie = await signIn('admin@cairn.local');
    const created = await request(app.getHttpServer())
      .post(`/projects/${projectId}/environments`)
      .set('Cookie', cookie)
      .send(PROD);

    const response = await request(app.getHttpServer())
      .delete(`/projects/${projectId}/environments/${created.body.id}`)
      .set('Cookie', cookie);

    expect(response.status).toBe(204);

    const list = await request(app.getHttpServer())
      .get(`/projects/${projectId}/environments`)
      .set('Cookie', cookie);

    expect(list.body).toHaveLength(0);
  });

  it('требует входа', async () => {
    const response = await request(app.getHttpServer()).get(
      `/projects/${projectId}/environments`,
    );

    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test test/environments.e2e`
Expected: FAIL — маршрут отвечает `404` на создание, потому что контроллера нет.

- [ ] **Step 3: Создать `apps/api/src/environments/environments.controller.ts`**

```typescript
import {
  environmentCreateSchema,
  environmentUpdateSchema,
  type EnvironmentCreate,
  type EnvironmentDetail,
  type EnvironmentMetadata,
  type EnvironmentUpdate,
} from '@cairn/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { EnvironmentsService } from './environments.service';

/**
 * Секция «Инфраструктура» (спека 6).
 *
 * Guard'а уровня доступа здесь нет намеренно: уровень проверяет репозиторий,
 * и дублирующая проверка в HTTP-слое создала бы второе место, где правило
 * можно изменить и разойтись с первым (ТЗ 4.1).
 */
@Controller('projects/:projectId/environments')
@UseGuards(SessionGuard)
export class EnvironmentsController {
  constructor(private readonly environments: EnvironmentsService) {}

  /** Окружения проекта в проекции по уровню доступа. */
  @Get()
  async list(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<(EnvironmentMetadata | EnvironmentDetail)[]> {
    return this.environments.list(subject, projectId);
  }

  /** Одно окружение в проекции по уровню доступа. */
  @Get(':id')
  async findById(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EnvironmentMetadata | EnvironmentDetail> {
    return this.environments.findById(subject, projectId, id);
  }

  /** Создаёт окружение. Требуется уровень записи на секции. */
  @Post()
  async create(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(environmentCreateSchema)) body: EnvironmentCreate,
  ): Promise<EnvironmentMetadata | EnvironmentDetail> {
    const created = await this.environments.create(subject, projectId, body);

    return this.environments.findById(subject, projectId, created.id);
  }

  /** Изменяет окружение. */
  @Patch(':id')
  async update(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(environmentUpdateSchema)) body: EnvironmentUpdate,
  ): Promise<EnvironmentMetadata | EnvironmentDetail> {
    await this.environments.update(subject, projectId, id, body);

    return this.environments.findById(subject, projectId, id);
  }

  /** Удаляет окружение вместе с доменами. */
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.environments.remove(subject, projectId, id);
  }
}
```

Возврат через `findById` после создания и правки не лишний запрос ради красоты: он собирает домены и применяет проекцию по уровню, а сервис возвращает голую строку таблицы.

- [ ] **Step 4: Создать `apps/api/src/environments/environments.module.ts`**

```typescript
import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { EnvironmentsController } from './environments.controller';
import { EnvironmentsRepository } from './environments.repository';
import { EnvironmentsService } from './environments.service';

/** Модуль секции «Инфраструктура». */
@Module({
  imports: [DbModule, AccessModule, AuditModule, AuthModule],
  controllers: [EnvironmentsController],
  providers: [EnvironmentsRepository, EnvironmentsService],
  exports: [EnvironmentsRepository, EnvironmentsService],
})
export class EnvironmentsModule {}
```

- [ ] **Step 5: Подключить модуль в `apps/api/src/app.module.ts`**

Добавь импорт и строку `EnvironmentsModule` в массив `imports` — после `ProjectsModule`.

- [ ] **Step 6: Запустить тесты**

Run: `pnpm --filter @cairn/api test test/environments.e2e`
Expected: PASS, 7 тестов.

- [ ] **Step 7: Коммит**

```bash
git add apps/api/src
git commit -m "Добавить HTTP-слой окружений"
```

---

### Task 8: Матрица доступа для секции «Инфраструктура»

Матрица из ТЗ 4.3 уже существует в исполняемом виде для секции «Инфо». Задача — распространить её на инфраструктуру, не копируя файл.

**Files:**
- Modify: `apps/api/test/access-matrix.e2e.test.ts`

- [ ] **Step 1: Прочитать существующий набор**

Открой `apps/api/test/access-matrix.e2e.test.ts` целиком. Он проверяет секцию «Инфо»: таблица `MATRIX` задаёт ожидаемые коды для каждого уровня, `signInAs` выдаёт нужный уровень и входит.

- [ ] **Step 2: Написать падающий тест — блок инфраструктуры**

Добавь в конец файла, внутри `describe('матрица доступа')`, новый блок:

```typescript
  /**
   * Инфраструктура (ТЗ 4.3, строка «Инфраструктура»).
   *
   * Отличается от «Инфо» тем, что уровень метаданных скрывает не весь
   * объект, а его часть: список окружений виден, серверные параметры — нет.
   */
  describe.each([
    { level: null, list: 404, create: 404, seesIp: false },
    { level: AccessLevel.Metadata, list: 200, create: 403, seesIp: false },
    { level: AccessLevel.Read, list: 200, create: 403, seesIp: true },
    { level: AccessLevel.Write, list: 200, create: 201, seesIp: true },
  ])('инфраструктура на уровне $level', ({ level, list, create, seesIp }) => {
    beforeEach(async () => {
      // Окружение заводится суперадмином до выдачи уровня: проверяется
      // видимость существующих данных, а не право их создать.
      await testDb.db.insert(environments).values({
        projectId,
        name: 'Прод',
        kind: EnvironmentKind.Production,
        ip: '203.0.113.10',
      });
    });

    it(`отдаёт список кодом ${list}`, async () => {
      const cookie = await signInAsInfrastructure(level);

      const response = await request(app.getHttpServer())
        .get(`/projects/${projectId}/environments`)
        .set('Cookie', cookie);

      expect(response.status).toBe(list);
    });

    it(`${seesIp ? 'показывает' : 'скрывает'} серверные параметры`, async () => {
      const cookie = await signInAsInfrastructure(level);

      const response = await request(app.getHttpServer())
        .get(`/projects/${projectId}/environments`)
        .set('Cookie', cookie);

      if (list !== 200) {
        expect(response.body.ip).toBeUndefined();

        return;
      }

      expect(response.body[0]?.ip !== undefined).toBe(seesIp);
    });

    it(`создание отвечает кодом ${create}`, async () => {
      const cookie = await signInAsInfrastructure(level);

      const response = await request(app.getHttpServer())
        .post(`/projects/${projectId}/environments`)
        .set('Cookie', cookie)
        .send({ name: 'Стейдж', kind: EnvironmentKind.Staging });

      expect(response.status).toBe(create);
    });
  });
```

Добавь рядом с `signInAs` вспомогательную функцию, выдающую уровень на секцию инфраструктуры:

```typescript
  /** Выдаёт уровень на секцию «Инфраструктура» и входит. */
  async function signInAsInfrastructure(level: AccessLevel | null) {
    if (level) {
      await testDb.db.insert(grants).values({
        subjectId: contractorSubjectId,
        projectId,
        section: Section.Infrastructure,
        level,
        grantedBy: adminUserId,
      });
    }

    return signIn();
  }
```

Если в существующем файле вход выполняется прямо внутри `signInAs`, вынеси из него сам вход в отдельную функцию `signIn()` и вызови её из обеих — дублировать запрос входа не нужно.

Импорты файла дополни: `EnvironmentKind` из `@cairn/shared`, `environments` из `../src/db/schema`.

- [ ] **Step 3: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test test/access-matrix`
Expected: FAIL до реализации Task 7 — но она уже сделана, поэтому набор должен пройти сразу. Если он проходит с первого запуска, убедись, что тесты действительно исполняются (в выводе видны строки «инфраструктура на уровне …»), а не пропущены.

- [ ] **Step 4: Запустить весь набор тестов API**

Run: `pnpm --filter @cairn/api test`
Expected: PASS целиком.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/test
git commit -m "Добавить матрицу доступа для инфраструктуры"
```

---

**Результат чанка 3:** секция работает по HTTP, а поведение всех четырёх уровней зафиксировано тестами, которые падут при любой попытке его изменить.

---

## Chunk 4: Уровни субъекта и интерфейс

Результат чанка: интерфейс показывает окружения, даёт править их тем, у кого есть право, и не показывает недоступные секции.

### Task 9: Карта уровней текущего субъекта

Интерфейсу нужно знать свой уровень: по составу полей `read` от `write` не отличить (спека 6.1).

**Files:**
- Modify: `apps/api/src/access/access.service.ts`, `apps/api/src/projects/projects.controller.ts`, `apps/api/src/projects/projects.service.ts`
- Create: `packages/shared/src/schemas/section-levels.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `apps/api/src/access/section-levels.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/access/section-levels.test.ts`**

```typescript
import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from './access.service';
import type { RequestSubject } from './access.types';
import { grants, projects, subjects, users } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('уровни субъекта по секциям', () => {
  let testDb: TestDatabase;
  let access: AccessService;
  let projectId: string;
  let subjectId: string;
  let adminUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    access = new AccessService(testDb.db);
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    const [admin] = await testDb.db
      .insert(users)
      .values({
        subjectId: adminSubject!.id,
        email: 'admin@cairn.local',
        passwordHash: 'хэш',
        isSuperadmin: true,
      })
      .returning();
    adminUserId = admin!.id;

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    subjectId = subject!.id;

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;
  });

  const member = (): RequestSubject => ({
    id: subjectId,
    kind: SubjectKind.User,
    label: 'user@cairn.local',
    isSuperadmin: false,
    isRevoked: false,
  });

  it('перечисляет только секции с выдачей', async () => {
    // Секция без выдачи отсутствует в карте, а не приходит с уровнем «нет»:
    // отсутствие доступа выражается отсутствием записи (спека 4.3).
    await testDb.db.insert(grants).values({
      subjectId,
      projectId,
      section: Section.Infrastructure,
      level: AccessLevel.Read,
      grantedBy: adminUserId,
    });

    const levels = await access.levelsForProject(member(), projectId);

    expect(levels).toEqual({ [Section.Infrastructure]: AccessLevel.Read });
  });

  it('суперадмину отдаёт запись по всем секциям', async () => {
    const levels = await access.levelsForProject(
      { ...member(), isSuperadmin: true },
      projectId,
    );

    expect(Object.keys(levels)).toHaveLength(Object.values(Section).length);
    expect(levels[Section.Variables]).toBe(AccessLevel.Write);
  });

  it('отозванному субъекту не отдаёт ничего', async () => {
    // Отзыв сильнее суперадминства (спека 5.1).
    const levels = await access.levelsForProject(
      { ...member(), isSuperadmin: true, isRevoked: true },
      projectId,
    );

    expect(levels).toEqual({});
  });

  it('субъекту без выдач отдаёт пустую карту', async () => {
    expect(await access.levelsForProject(member(), projectId)).toEqual({});
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/access/section-levels`
Expected: FAIL — `access.levelsForProject is not a function`.

- [ ] **Step 3: Создать `packages/shared/src/schemas/section-levels.ts`**

```typescript
import { z } from 'zod';

import { AccessLevel, Section } from '../enums';

/** Карта «секция → уровень» для текущего субъекта. */
export const sectionLevelsSchema = z.record(z.nativeEnum(Section), z.nativeEnum(AccessLevel));

/**
 * Уровни текущего субъекта по секциям проекта.
 *
 * Тип переопределён как частичная запись по той же причине, что и уровни
 * в матрице выдач: `z.record` с перечислением в ключе выводится в zod как
 * полная запись, и клиент получил бы `undefined` там, где типы обещают
 * значение. Отсутствие ключа и означает отсутствие доступа.
 */
export type SectionLevels = Partial<Record<Section, AccessLevel>>;
```

Добавь экспорт в `packages/shared/src/index.ts`.

- [ ] **Step 4: Добавить метод в `apps/api/src/access/access.service.ts`**

```typescript
  /**
   * Возвращает уровни субъекта по секциям проекта.
   *
   * Нужен интерфейсу: по данным, прошедшим проекцию, нельзя отличить
   * уровень чтения от уровня записи, а значит нельзя решить, показывать ли
   * кнопки правки (спека этапа 2, 6.1).
   *
   * Секции без выдачи в карту не попадают.
   */
  async levelsForProject(
    subject: RequestSubject,
    projectId: string,
    executor: Executor = this.db,
  ): Promise<SectionLevels> {
    if (subject.isRevoked) {
      return {};
    }

    if (subject.isSuperadmin) {
      return Object.fromEntries(
        Object.values(Section).map((section) => [section, AccessLevel.Write]),
      );
    }

    const rows = await executor
      .select({ section: grants.section, level: grants.level })
      .from(grants)
      .where(and(eq(grants.subjectId, subject.id), eq(grants.projectId, projectId)));

    return Object.fromEntries(rows.map((row) => [row.section, row.level]));
  }
```

Импорты файла дополни: `Section` (уже импортирован как тип — сделай импортом значения), `type SectionLevels` из `@cairn/shared`.

- [ ] **Step 5: Запустить тест**

Run: `pnpm --filter @cairn/shared build && pnpm --filter @cairn/api test src/access/section-levels`
Expected: PASS, 4 теста.

- [ ] **Step 6: Написать падающий тест маршрута**

Добавь в `apps/api/test/projects.e2e.test.ts` два случая:

```typescript
  it('отдаёт уровни текущего субъекта по секциям', async () => {
    const cookie = await signIn('admin@cairn.local');

    const response = await request(app.getHttpServer())
      .get(`/projects/${projectId}/sections`)
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ info: 'write' });
  });

  it('скрывает уровни проекта, к которому нет доступа', async () => {
    // Пустая карта сообщила бы, что проект существует (ТЗ 4.1).
    const cookie = await signIn('user@cairn.local');

    const response = await request(app.getHttpServer())
      .get(`/projects/${projectId}/sections`)
      .set('Cookie', cookie);

    expect(response.status).toBe(404);
  });
```

Имена вспомогательных функций сверь с существующим файлом.

- [ ] **Step 7: Добавить маршрут в `apps/api/src/projects/projects.controller.ts`**

```typescript
  /**
   * Уровни текущего субъекта по секциям проекта.
   *
   * Объявлен до маршрута `:id`, иначе `sections` будет разобран как
   * идентификатор проекта и не пройдёт проверку формата.
   */
  @Get(':id/sections')
  async sections(
    @CurrentSubject() subject: RequestSubject,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SectionLevels> {
    return this.projects.sectionsFor(subject, id);
  }
```

И метод в `apps/api/src/projects/projects.service.ts`:

```typescript
  /**
   * Возвращает уровни субъекта по секциям проекта.
   *
   * Проект, к которому нет ни одной выдачи, обязан выглядеть
   * несуществующим: пустая карта сообщила бы о его существовании.
   */
  async sectionsFor(subject: RequestSubject, projectId: string): Promise<SectionLevels> {
    const levels = await this.access.levelsForProject(subject, projectId);

    if (Object.keys(levels).length === 0) {
      throw new SectionNotVisibleError();
    }

    return levels;
  }
```

`ProjectsService` получает `AccessService` через конструктор — добавь зависимость, если её там нет, и импортируй `SectionNotVisibleError` из `../access/access.errors`.

- [ ] **Step 8: Запустить тесты**

Run: `pnpm --filter @cairn/api test test/projects.e2e`
Expected: PASS.

- [ ] **Step 9: Коммит**

```bash
git add apps/api/src packages/shared/src apps/api/test
git commit -m "Добавить уровни субъекта по секциям"
```

---

### Task 10: Хуки данных секции

**Files:**
- Create: `apps/web/src/api/hooks/useQueryEnvironments.ts`, `apps/web/src/api/hooks/useMutationEnvironment.ts`, `apps/web/src/api/hooks/useQuerySections.ts`
- Modify: `apps/web/src/api/hooks/index.ts`
- Test: `apps/web/src/api/hooks/useMutationEnvironment.test.tsx`

- [ ] **Step 1: Написать падающий тест `apps/web/src/api/hooks/useMutationEnvironment.test.tsx`**

```tsx
import { EnvironmentKind } from '@cairn/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  useMutationCreateEnvironment,
  useMutationDeleteEnvironment,
} from './useMutationEnvironment';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('мутации окружения', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('создаёт окружение по адресу проекта', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: '1', name: 'Прод' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationCreateEnvironment(PROJECT_ID), { wrapper });

    result.current.mutate({ name: 'Прод', kind: EnvironmentKind.Production });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/projects/${PROJECT_ID}/environments`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
  });

  it('удаляет окружение по его адресу', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 204, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutationDeleteEnvironment(PROJECT_ID), { wrapper });

    result.current.mutate('22222222-2222-2222-2222-222222222222');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/projects/${PROJECT_ID}/environments/22222222-2222-2222-2222-222222222222`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' });
  });

  it('сообщает об отказе в правах', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }),
    );

    const { result } = renderHook(() => useMutationDeleteEnvironment(PROJECT_ID), { wrapper });

    result.current.mutate('22222222-2222-2222-2222-222222222222');

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/web test src/api/hooks/useMutationEnvironment`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать `apps/web/src/api/hooks/useQueryEnvironments.ts`**

```typescript
'use client';

import type { EnvironmentDetail, EnvironmentMetadata } from '@cairn/shared';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';

/** Ключи кэша окружений. */
export const ENVIRONMENT_KEYS = {
  forProject: (projectId: string) => ['environments', projectId] as const,
};

/** Окружения проекта в проекции, соответствующей уровню доступа. */
export function useQueryEnvironments(projectId: string) {
  return useQuery({
    queryKey: ENVIRONMENT_KEYS.forProject(projectId),
    queryFn: () =>
      apiClient<(EnvironmentMetadata | EnvironmentDetail)[]>(
        `/projects/${projectId}/environments`,
      ),
  });
}
```

- [ ] **Step 4: Создать `apps/web/src/api/hooks/useQuerySections.ts`**

```typescript
'use client';

import type { SectionLevels } from '@cairn/shared';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';

/** Ключи кэша уровней доступа. */
export const SECTION_KEYS = {
  forProject: (projectId: string) => ['sections', projectId] as const,
};

/** Уровни текущего субъекта по секциям проекта. */
export function useQuerySections(projectId: string) {
  return useQuery({
    queryKey: SECTION_KEYS.forProject(projectId),
    queryFn: () => apiClient<SectionLevels>(`/projects/${projectId}/sections`),
  });
}
```

- [ ] **Step 5: Создать `apps/web/src/api/hooks/useMutationEnvironment.ts`**

```typescript
'use client';

import type { EnvironmentCreate, EnvironmentUpdate } from '@cairn/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';
import { ENVIRONMENT_KEYS } from './useQueryEnvironments';

/** Создание окружения. Требуется уровень записи на секции. */
export function useMutationCreateEnvironment(projectId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: EnvironmentCreate) =>
      apiClient(`/projects/${projectId}/environments`, { method: 'POST', body: input }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ENVIRONMENT_KEYS.forProject(projectId) });
    },
  });
}

/** Правка окружения. */
export function useMutationUpdateEnvironment(projectId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: EnvironmentUpdate }) =>
      apiClient(`/projects/${projectId}/environments/${id}`, { method: 'PATCH', body: input }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ENVIRONMENT_KEYS.forProject(projectId) });
    },
  });
}

/** Удаление окружения вместе с доменами. */
export function useMutationDeleteEnvironment(projectId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/projects/${projectId}/environments/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ENVIRONMENT_KEYS.forProject(projectId) });
    },
  });
}
```

- [ ] **Step 6: Дополнить `apps/web/src/api/hooks/index.ts`**

Добавь три экспорта в алфавитном порядке.

- [ ] **Step 7: Запустить тесты**

Run: `pnpm --filter @cairn/web test src/api/hooks`
Expected: PASS.

- [ ] **Step 8: Коммит**

```bash
git add apps/web/src/api
git commit -m "Добавить хуки данных инфраструктуры"
```

---

### Task 11: Карточка и список окружений

**Files:**
- Create: `apps/web/src/components/EnvironmentCard/` (`EnvironmentCard.tsx`, `types.ts`, `constants.ts`, `index.ts`, `EnvironmentCard.test.tsx`)
- Create: `apps/web/src/components/EnvironmentList/` (`EnvironmentList.tsx`, `types.ts`, `index.ts`, `EnvironmentList.test.tsx`)

- [ ] **Step 1: Написать падающий тест `apps/web/src/components/EnvironmentCard/EnvironmentCard.test.tsx`**

```tsx
import { EnvironmentKind } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EnvironmentCard } from './EnvironmentCard';

const metadata = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Прод',
  kind: EnvironmentKind.Production,
  domains: ['example.com'],
};

const detail = {
  ...metadata,
  host: 'srv-1.example.com',
  ip: '203.0.113.10',
  provider: 'Hetzner',
  specs: '2 vCPU, 4 ГБ',
  healthCheckUrl: 'https://example.com/health',
  notes: 'Заметка',
  createdAt: '2026-08-27T10:00:00.000Z',
  updatedAt: '2026-08-27T10:00:00.000Z',
};

describe('EnvironmentCard', () => {
  it('показывает имя, вид и домены', () => {
    render(<EnvironmentCard environment={metadata} />);

    expect(screen.getByText('Прод')).toBeInTheDocument();
    expect(screen.getByText('Продакшен')).toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('на уровне метаданных не показывает серверные параметры', () => {
    // Их отсутствие в ответе — это и есть уровень доступа; показывать
    // «скрыто» здесь не нужно, секция сама объясняет ограничение.
    render(<EnvironmentCard environment={metadata} />);

    expect(screen.queryByText(/203\.0\.113\.10/)).not.toBeInTheDocument();
  });

  it('на уровне чтения показывает серверные параметры', () => {
    render(<EnvironmentCard environment={detail} />);

    expect(screen.getByText('203.0.113.10')).toBeInTheDocument();
    expect(screen.getByText('Hetzner')).toBeInTheDocument();
  });

  it('без права записи не показывает кнопок', () => {
    render(<EnvironmentCard environment={detail} />);

    expect(screen.queryByRole('button', { name: 'Править' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Удалить' })).not.toBeInTheDocument();
  });

  it('с правом записи вызывает правку', async () => {
    const onEdit = vi.fn();
    render(<EnvironmentCard environment={detail} canWrite onEdit={onEdit} onDelete={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Править' }));

    expect(onEdit).toHaveBeenCalled();
  });

  it('удаление требует подтверждения', async () => {
    // Браузерный диалог заблокировал бы страницу, поэтому подтверждение
    // спрашивается на месте.
    const onDelete = vi.fn();
    render(<EnvironmentCard environment={detail} canWrite onEdit={vi.fn()} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }));
    expect(onDelete).toHaveBeenCalled();
  });

  it('отменяет удаление', async () => {
    const onDelete = vi.fn();
    render(<EnvironmentCard environment={detail} canWrite onEdit={vi.fn()} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Удалить' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/web test src/components/EnvironmentCard`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать `apps/web/src/components/EnvironmentCard/constants.ts`**

```typescript
import { EnvironmentKind } from '@cairn/shared';

/** Названия видов окружения на языке интерфейса. */
export const KIND_LABELS: Record<EnvironmentKind, string> = {
  [EnvironmentKind.Production]: 'Продакшен',
  [EnvironmentKind.Staging]: 'Стейдж',
  [EnvironmentKind.Development]: 'Разработка',
  [EnvironmentKind.Other]: 'Иное',
};

/** Подписи серверных параметров. */
export const FIELD_LABELS = {
  host: 'Хост',
  ip: 'IP-адрес',
  provider: 'Провайдер',
  specs: 'Характеристики',
  healthCheckUrl: 'Адрес проверки',
  notes: 'Заметки',
} as const;
```

- [ ] **Step 4: Создать `apps/web/src/components/EnvironmentCard/types.ts`**

```typescript
import type { EnvironmentDetail, EnvironmentMetadata } from '@cairn/shared';

/** Пропсы карточки окружения. */
export interface IProps {
  /** Окружение в той проекции, которую вернул API. */
  environment: EnvironmentMetadata | EnvironmentDetail;
  /** Есть ли право менять секцию. */
  canWrite?: boolean;
  /** Вызывается при переходе к правке. */
  onEdit?: () => void;
  /** Вызывается после подтверждения удаления. */
  onDelete?: () => void;
}
```

- [ ] **Step 5: Создать `apps/web/src/components/EnvironmentCard/EnvironmentCard.tsx`**

Компонент держится в пределах ста строк; подтверждение удаления вынесено в подкомпонент.

```tsx
'use client';

import type { EnvironmentDetail, EnvironmentMetadata } from '@cairn/shared';
import { useState } from 'react';

import { FIELD_LABELS, KIND_LABELS } from './constants';
import type { IProps } from './types';

/** Окружение проекта: состав полей задан уровнем доступа (ТЗ 4.3). */
export function EnvironmentCard({ environment, canWrite = false, onEdit, onDelete }: IProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const detail = isDetailed(environment) ? environment : null;

  return (
    <article className="space-y-3 rounded-md border border-border p-4">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-medium">{environment.name}</h3>
        <span className="text-sm text-muted-foreground">{KIND_LABELS[environment.kind]}</span>
      </header>

      {environment.domains.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {environment.domains.map((domain) => (
            <li key={domain} className="rounded bg-muted px-2 py-1 text-sm">
              {domain}
            </li>
          ))}
        </ul>
      )}

      {detail && (
        <dl className="grid gap-2 sm:grid-cols-2">
          <Field label={FIELD_LABELS.host} value={detail.host} />
          <Field label={FIELD_LABELS.ip} value={detail.ip} />
          <Field label={FIELD_LABELS.provider} value={detail.provider} />
          <Field label={FIELD_LABELS.specs} value={detail.specs} />
          <Field label={FIELD_LABELS.healthCheckUrl} value={detail.healthCheckUrl} />
          <Field label={FIELD_LABELS.notes} value={detail.notes} />
        </dl>
      )}

      {canWrite && (
        <div className="flex gap-2">
          <button type="button" onClick={onEdit} className="rounded-md border px-3 py-1 text-sm">
            Править
          </button>

          {isConfirming ? (
            <>
              <button
                type="button"
                onClick={onDelete}
                className="rounded-md bg-destructive px-3 py-1 text-sm text-destructive-foreground"
              >
                Подтвердить удаление
              </button>
              <button
                type="button"
                onClick={() => setIsConfirming(false)}
                className="rounded-md border px-3 py-1 text-sm"
              >
                Отмена
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setIsConfirming(true)}
              className="rounded-md border px-3 py-1 text-sm"
            >
              Удалить
            </button>
          )}
        </div>
      )}
    </article>
  );
}

/** Одно поле серверных параметров. Пустые значения не показываются. */
function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) {
    return null;
  }

  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

/** Отличает проекцию чтения от проекции метаданных. */
function isDetailed(
  environment: EnvironmentMetadata | EnvironmentDetail,
): environment is EnvironmentDetail {
  return 'ip' in environment;
}
```

- [ ] **Step 6: Создать `apps/web/src/components/EnvironmentCard/index.ts`**

```typescript
export { EnvironmentCard } from './EnvironmentCard';
export type { IProps } from './types';
```

- [ ] **Step 7: Написать падающий тест `apps/web/src/components/EnvironmentList/EnvironmentList.test.tsx`**

```tsx
import { EnvironmentKind } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EnvironmentList } from './EnvironmentList';

const environment = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Прод',
  kind: EnvironmentKind.Production,
  domains: ['example.com'],
};

describe('EnvironmentList', () => {
  it('перечисляет окружения списком', () => {
    render(<EnvironmentList environments={[environment]} onEdit={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getByText('Прод')).toBeInTheDocument();
  });

  it('объясняет пустую секцию', () => {
    render(<EnvironmentList environments={[]} onEdit={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText(/окружени/i)).toBeInTheDocument();
  });

  it('в пустой секции зовёт завести окружение того, кто вправе', () => {
    render(
      <EnvironmentList environments={[]} canWrite onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    expect(screen.getByText(/добавьте первое окружение/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Создать `apps/web/src/components/EnvironmentList/types.ts` и `EnvironmentList.tsx`**

```typescript
import type { EnvironmentDetail, EnvironmentMetadata } from '@cairn/shared';

/** Пропсы списка окружений. */
export interface IProps {
  environments: (EnvironmentMetadata | EnvironmentDetail)[];
  canWrite?: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}
```

```tsx
'use client';

import { EnvironmentCard } from '../EnvironmentCard';
import type { IProps } from './types';

/** Список окружений проекта (ТЗ 3.2). */
export function EnvironmentList({ environments, canWrite = false, onEdit, onDelete }: IProps) {
  if (environments.length === 0) {
    return (
      <p className="text-muted-foreground">
        {canWrite
          ? 'Окружений пока нет. Добавьте первое окружение — прод, стейдж или дев.'
          : 'Окружений пока нет.'}
      </p>
    );
  }

  return (
    <ul className="grid gap-3">
      {environments.map((environment) => (
        <li key={environment.id}>
          <EnvironmentCard
            environment={environment}
            canWrite={canWrite}
            onEdit={() => onEdit(environment.id)}
            onDelete={() => onDelete(environment.id)}
          />
        </li>
      ))}
    </ul>
  );
}
```

Не забудь `index.ts` с barrel-экспортом.

- [ ] **Step 9: Запустить тесты**

Run: `pnpm --filter @cairn/web test src/components/Environment`
Expected: PASS, 10 тестов.

- [ ] **Step 10: Коммит**

```bash
git add apps/web/src/components
git commit -m "Добавить карточку и список окружений"
```

---

### Task 12: Форма окружения и поле доменов

**Files:**
- Create: `apps/web/src/components/DomainsField/` (`DomainsField.tsx`, `types.ts`, `index.ts`, `DomainsField.test.tsx`)
- Create: `apps/web/src/components/EnvironmentForm/` (`EnvironmentForm.tsx`, `types.ts`, `constants.ts`, `index.ts`, `EnvironmentForm.test.tsx`)

- [ ] **Step 1: Написать падающий тест `apps/web/src/components/DomainsField/DomainsField.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DomainsField } from './DomainsField';

describe('DomainsField', () => {
  it('показывает добавленные домены', () => {
    render(<DomainsField value={['example.com']} onChange={vi.fn()} />);

    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('добавляет домен', async () => {
    const onChange = vi.fn();
    render(<DomainsField value={[]} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Домены'), 'example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить домен' }));

    expect(onChange).toHaveBeenCalledWith(['example.com']);
  });

  it('не добавляет пустую строку', async () => {
    const onChange = vi.fn();
    render(<DomainsField value={[]} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Добавить домен' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('не добавляет повторяющийся домен', async () => {
    // Сервер отверг бы такой набор, и лучше сказать об этом сразу.
    const onChange = vi.fn();
    render(<DomainsField value={['example.com']} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Домены'), 'EXAMPLE.com');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить домен' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/уже добавлен/i);
  });

  it('удаляет домен', async () => {
    const onChange = vi.fn();
    render(<DomainsField value={['example.com', 'api.example.com']} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Убрать example.com' }));

    expect(onChange).toHaveBeenCalledWith(['api.example.com']);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/web test src/components/DomainsField`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать `apps/web/src/components/DomainsField/types.ts` и `DomainsField.tsx`**

```typescript
/** Пропсы поля доменов. */
export interface IProps {
  value: string[];
  onChange: (domains: string[]) => void;
}
```

```tsx
'use client';

import { useState } from 'react';

import type { IProps } from './types';

/**
 * Набор доменов окружения.
 *
 * Домены нормализуются здесь так же, как на сервере: пользователь должен
 * видеть ровно то, что будет сохранено, а не узнавать о приведении
 * к нижнему регистру после сохранения.
 */
export function DomainsField({ value, onChange }: IProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  function add(): void {
    const domain = draft.trim().toLowerCase();

    if (!domain) {
      return;
    }

    if (value.includes(domain)) {
      setError('Такой домен уже добавлен');

      return;
    }

    onChange([...value, domain]);
    setDraft('');
    setError(null);
  }

  return (
    <div className="space-y-2">
      <label htmlFor="domain" className="block text-sm font-medium">
        Домены
      </label>

      <div className="flex gap-2">
        <input
          id="domain"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="flex-1 rounded-md border border-border px-3 py-2"
        />
        <button type="button" onClick={add} className="rounded-md border px-3 py-2 text-sm">
          Добавить домен
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((domain) => (
            <li key={domain} className="flex items-center gap-2 rounded bg-muted px-2 py-1">
              <span className="text-sm">{domain}</span>
              <button
                type="button"
                aria-label={`Убрать ${domain}`}
                onClick={() => onChange(value.filter((item) => item !== domain))}
                className="text-sm text-muted-foreground"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Написать падающий тест `apps/web/src/components/EnvironmentForm/EnvironmentForm.test.tsx`**

```tsx
import { EnvironmentKind } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EnvironmentForm } from './EnvironmentForm';

const initial = {
  name: '',
  kind: EnvironmentKind.Production,
  host: null,
  ip: null,
  provider: null,
  specs: null,
  healthCheckUrl: null,
  notes: null,
  domains: [],
};

describe('EnvironmentForm', () => {
  it('не отправляет форму без имени', async () => {
    const onSubmit = vi.fn();
    render(<EnvironmentForm initial={initial} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('отправляет заполненные поля', async () => {
    const onSubmit = vi.fn();
    render(<EnvironmentForm initial={initial} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Название'), 'Прод');
    await userEvent.type(screen.getByLabelText('IP-адрес'), '203.0.113.10');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Прод', ip: '203.0.113.10' }),
    );
  });

  it('превращает пустые поля в отсутствие значения', async () => {
    // Пустая строка и «не заполнено» — разные вещи: контракт ждёт null.
    const onSubmit = vi.fn();
    render(<EnvironmentForm initial={initial} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Название'), 'Прод');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ provider: null }));
  });

  it('показывает ошибку сервера', () => {
    render(<EnvironmentForm initial={initial} onSubmit={vi.fn()} error="Имя занято" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Имя занято');
  });
});
```

- [ ] **Step 5: Создать форму**

`constants.ts`:

```typescript
/** Подписи полей формы окружения. */
export const FIELD_LABELS = {
  name: 'Название',
  kind: 'Вид',
  host: 'Хост',
  ip: 'IP-адрес',
  provider: 'Провайдер',
  specs: 'Характеристики',
  healthCheckUrl: 'Адрес проверки',
  notes: 'Заметки',
} as const;
```

`types.ts`:

```typescript
import type { EnvironmentCreate, EnvironmentKind } from '@cairn/shared';

/** Значения полей формы окружения. */
export interface EnvironmentFormValues {
  name: string;
  kind: EnvironmentKind;
  host: string | null;
  ip: string | null;
  provider: string | null;
  specs: string | null;
  healthCheckUrl: string | null;
  notes: string | null;
  domains: string[];
}

/** Пропсы формы окружения. */
export interface IProps {
  initial: EnvironmentFormValues;
  onSubmit: (input: EnvironmentCreate) => void;
  error?: string;
  isSubmitting?: boolean;
}
```

`EnvironmentForm.tsx` строится по образцу `ProjectForm`: поля через `TextField`, вид — через `select` с подписями из `KIND_LABELS`, домены — через `DomainsField`, пустые строки превращаются в `null` тем же приёмом `emptyToNull`. Кнопка недоступна, пока имя пустое или идёт отправка.

Если файл выходит длиннее ста строк, вынеси подкомпонент выбора вида в `KindField.tsx` — как сделано с `LifecycleField` в форме проекта.

- [ ] **Step 6: Запустить тесты**

Run: `pnpm --filter @cairn/web test src/components/DomainsField src/components/EnvironmentForm`
Expected: PASS, 9 тестов.

- [ ] **Step 7: Коммит**

```bash
git add apps/web/src/components
git commit -m "Добавить форму окружения"
```

---

### Task 13: Страница секции и блок на карточке проекта

**Files:**
- Create: `apps/web/src/app/(app)/projects/[id]/infrastructure/page.tsx`, `InfrastructureScreen.tsx`
- Modify: `apps/web/src/components/ProjectSections/ProjectSections.tsx`, `types.ts`, `ProjectSections.test.tsx`

- [ ] **Step 1: Создать `apps/web/src/app/(app)/projects/[id]/infrastructure/InfrastructureScreen.tsx`**

```tsx
'use client';

import { AccessLevel, EnvironmentKind, Section, type EnvironmentCreate } from '@cairn/shared';
import { useState } from 'react';

import {
  useMutationCreateEnvironment,
  useMutationUpdateEnvironment,
  useMutationDeleteEnvironment,
  useQueryEnvironments,
  useQuerySections,
} from '@/api/hooks';
import { EnvironmentForm } from '@/components/EnvironmentForm';
import { EnvironmentList } from '@/components/EnvironmentList';

/** Пропсы экрана инфраструктуры. */
interface IProps {
  projectId: string;
}

/** Окружения проекта: просмотр и правка (спека 8). */
export function InfrastructureScreen({ projectId }: IProps) {
  const environments = useQueryEnvironments(projectId);
  const sections = useQuerySections(projectId);
  const create = useMutationCreateEnvironment(projectId);
  const update = useMutationUpdateEnvironment(projectId);
  const remove = useMutationDeleteEnvironment(projectId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  if (environments.isPending || sections.isPending) {
    return <p className="text-muted-foreground">Загрузка…</p>;
  }

  if (environments.isError || sections.isError) {
    return (
      <p role="alert" className="text-destructive">
        Не удалось загрузить окружения.
      </p>
    );
  }

  const canWrite = sections.data[Section.Infrastructure] === AccessLevel.Write;
  const editing = environments.data.find((environment) => environment.id === editingId);

  function submit(input: EnvironmentCreate): void {
    if (editingId) {
      update.mutate({ id: editingId, input }, { onSuccess: () => setEditingId(null) });

      return;
    }

    create.mutate(input, { onSuccess: () => setIsCreating(false) });
  }

  return (
    <div className="space-y-4">
      {canWrite && !isCreating && !editingId && (
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >
          Добавить окружение
        </button>
      )}

      {(isCreating || editing) && (
        <EnvironmentForm
          initial={{
            name: editing?.name ?? '',
            kind: editing?.kind ?? EnvironmentKind.Production,
            host: null,
            ip: null,
            provider: null,
            specs: null,
            healthCheckUrl: null,
            notes: null,
            domains: editing?.domains ?? [],
            ...(editing && 'ip' in editing ? editing : {}),
          }}
          isSubmitting={create.isPending || update.isPending}
          error={(create.error ?? update.error)?.message}
          onSubmit={submit}
        />
      )}

      <EnvironmentList
        environments={environments.data}
        canWrite={canWrite}
        onEdit={(id) => {
          setIsCreating(false);
          setEditingId(id);
        }}
        onDelete={(id) => remove.mutate(id)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Создать `apps/web/src/app/(app)/projects/[id]/infrastructure/page.tsx`**

```tsx
import { InfrastructureScreen } from './InfrastructureScreen';

/** Страница секции «Инфраструктура». */
export default async function InfrastructurePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Инфраструктура</h1>
      <InfrastructureScreen projectId={id} />
    </main>
  );
}
```

- [ ] **Step 3: Написать падающий тест блока на карточке**

Дополни `apps/web/src/components/ProjectSections/ProjectSections.test.tsx`:

```tsx
  it('показывает ссылку на инфраструктуру при доступе к секции', () => {
    render(<ProjectSections project={project} sections={{ infrastructure: 'metadata' }} />);

    expect(screen.getByRole('link', { name: /инфраструктура/i })).toHaveAttribute(
      'href',
      `/projects/${project.id}/infrastructure`,
    );
  });

  it('не показывает недоступную секцию', () => {
    // Недоступные секции отсутствуют, а не выглядят заблокированными (ТЗ 8).
    render(<ProjectSections project={project} sections={{}} />);

    expect(screen.queryByRole('link', { name: /инфраструктура/i })).not.toBeInTheDocument();
  });
```

Значения существующих тестов дополни пропсом `sections={{}}`, если он обязателен, либо сделай его необязательным со значением по умолчанию `{}`.

- [ ] **Step 4: Дополнить `ProjectSections`**

Добавь в `types.ts` необязательный пропс `sections?: SectionLevels` и выводи после паспорта список доступных секций ссылками. На этом этапе в списке одна ссылка — «Инфраструктура»; последующие этапы добавят остальные пять, поэтому оформи перечнем, а не отдельной строкой:

```tsx
      {sections[Section.Infrastructure] && (
        <nav className="flex gap-3">
          <Link href={`/projects/${project.id}/infrastructure`} className="underline">
            Инфраструктура
          </Link>
        </nav>
      )}
```

- [ ] **Step 5: Передать уровни со страницы проекта**

В `apps/web/src/app/(app)/projects/[id]/page.tsx` запроси уровни тем же серверным клиентом и передай их в `ProjectSections`:

```tsx
  const [project, sections] = await Promise.all([
    apiServer<ProjectMetadata | ProjectDetail>(`/projects/${id}`),
    apiServer<SectionLevels>(`/projects/${id}/sections`),
  ]);
```

Обработку `401` и `404` оставь прежней — она уже написана вокруг запроса.

- [ ] **Step 6: Запустить тесты и проверку типов**

```bash
pnpm --filter @cairn/web test
pnpm --filter @cairn/web typecheck
```

Expected: без ошибок.

- [ ] **Step 7: Коммит**

```bash
git add apps/web/src
git commit -m "Добавить экран инфраструктуры"
```

---

**Результат чанка 4:** окружения видны и правятся в интерфейсе, кнопки показываются по действительному уровню доступа, недоступная секция отсутствует на карточке проекта.

---

## Chunk 5: Завершение этапа

### Task 14: Сквозная проверка и документация

**Files:**
- Modify: `scripts/e2e.mjs`, `README.md`, `CLAUDE.md`

- [ ] **Step 1: Дополнить `scripts/e2e.mjs` сценарием инфраструктуры**

Добавь в путь суперадмина, после выдачи уровня «метаданные», создание окружения:

```javascript
  const environment = await admin(`/api/projects/${created.json.id}/environments`, {
    method: 'POST',
    body: {
      name: 'Прод',
      kind: 'production',
      ip: '203.0.113.10',
      provider: 'Hetzner',
      domains: ['example.com'],
    },
  });
  check('окружение создано', environment.status === 201, `статус ${environment.status}`);
```

И в путь приглашённого — проверку уровня:

```javascript
  const guestEnvironments = await guest(`/api/projects/${projectId}/environments`);
  check(
    'приглашённому видно окружение',
    guestEnvironments.json?.length === 1,
    JSON.stringify(guestEnvironments.json),
  );
  check(
    'на уровне «метаданные» виден домен, но не IP',
    guestEnvironments.json?.[0]?.domains?.includes('example.com') &&
      guestEnvironments.json?.[0]?.ip === undefined,
    JSON.stringify(guestEnvironments.json?.[0]),
  );

  const guestWrite = await guest(`/api/projects/${projectId}/environments`, {
    method: 'POST',
    body: { name: 'Стейдж', kind: 'staging' },
  });
  check('правка инфраструктуры отклонена', guestWrite.status === 403, `статус ${guestWrite.status}`);
```

Выдача доступа приглашённому в скрипте сейчас касается только секции «Инфо» — добавь вторую выдачу на `infrastructure` с уровнем `metadata` рядом с ней.

- [ ] **Step 2: Обновить `README.md`**

В разделе про этапы добавь строку об окружениях: реестр хранит окружения проекта с серверными параметрами и доменами; проверки статуса появятся на этапе 6.

- [ ] **Step 3: Обновить `CLAUDE.md`**

В разделе «Состояние репозитория» добавь, что реализован этап 2, и укажи спеку и план этапа 2 в источниках правды.

- [ ] **Step 4: Полная проверка**

```bash
pnpm --filter @cairn/shared build
pnpm test
pnpm typecheck
pnpm build
```

Expected: всё зелёное.

- [ ] **Step 5: Прогнать сквозную проверку на чистой системе**

```bash
docker compose down -v
docker compose build
docker compose up -d --wait
docker compose run --rm api node dist/db/migrate.js
docker compose run --rm api node dist/cli/main.js create-superadmin admin@example.com
pnpm e2e '<ссылка из предыдущей команды>'
```

Expected: все проверки пройдены, включая новые шаги инфраструктуры.

- [ ] **Step 6: Коммит**

```bash
git add scripts README.md CLAUDE.md
git commit -m "Завершить этап 2: инфраструктура проекта"
```

---

**Результат этапа 2:** у проекта появились окружения с серверными параметрами и доменами, доступные по той же модели прав, что и паспорт. Уровень «метаданные» показывает, что окружение есть и по какому адресу оно живёт, не раскрывая, как оно устроено. Модель готова принять переменные (этап 4) и автопроверки статуса (этап 6) без переделки.
