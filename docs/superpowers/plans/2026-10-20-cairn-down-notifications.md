# Уведомления о падении: инциденты и веб-пуши — план реализации

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Падение адреса окружения становится инцидентом в базе; подтверждённое открытие и закрытие инцидента уходят подписавшимся людям веб-пушем в пределах их прав; у адреса появляется «лежит с» и история падений на экране «Инфраструктура».

**Architecture:** Шесть частей по возрастанию связности. Сначала контракт и схема базы — они ничего не ломают и нужны всему остальному. Затем инциденты на сервере: чистое правило перехода, репозиторий, трёхфазный прогон с переспросом. Затем пуши тремя независимыми единицами — текст, адресаты, транспорт — и уведомитель, который их связывает. Затем ручки, журнал и генерация ключей. Затем веб. Напоследок документация и полная проверка.

**Tech Stack:** pnpm workspaces, NestJS, Drizzle + PostgreSQL, zod в `packages/shared`, `web-push`, Next.js 15, Vitest + React Testing Library, Testcontainers.

**Основание:** `docs/superpowers/specs/2026-10-20-cairn-down-notifications-design.md`

---

## Как работать с этим планом

TDD: сначала падающий тест, затем реализация. Линтера в проекте нет.

| Что | Команда |
|---|---|
| Все тесты | `pnpm test` |
| Точечно API | `cd apps/api && npx vitest run src/путь` |
| Точечно веб | `cd apps/web && npx vitest run src/путь` |
| Точечно контракт | `cd packages/shared && npx vitest run src/путь` |
| Типы | `pnpm typecheck` |
| Миграция по схеме | `cd apps/api && pnpm db:generate` |

**Осторожно с `pnpm --filter ... test -- --run <путь>`**: двойное `--` съедает фильтр, и запускается весь набор, включая Testcontainers. Точечно — через `npx vitest run` из каталога приложения.

Соглашения: компонент до 100 строк в своей директории с `index.ts`, пропсы — `IProps` в `types.ts`, TSDoc на русском, `any` запрещён, массивы и объекты из JSX — в `constants.ts`, значение, использованное дважды, — `enum`, а не union.

**Интеграционные тесты поднимают PostgreSQL через Testcontainers** — нужен работающий docker. Фикстура — `apps/api/test/db-fixture.ts`, привилегии в ней не выдаются намеренно: их выдаёт миграция, которую тест и проверяет.

### Структура файлов

| Файл | Ответственность |
|---|---|
| `packages/shared/src/schemas/incident.ts` | контракт инцидента и выдачи по проекту |
| `packages/shared/src/schemas/push.ts` | контракт подписки и публичного ключа |
| `apps/api/src/db/schema/incidents.ts` | таблица `address_incidents` |
| `apps/api/src/db/schema/push.ts` | таблица `push_subscriptions` |
| `apps/api/src/incidents/incident-decision.ts` | чистое правило: что делать с адресом |
| `apps/api/src/incidents/incidents.repository.ts` | открыть, закрыть, прочитать инциденты |
| `apps/api/src/incidents/incidents.service.ts` | сведение состояния адресов в события |
| `apps/api/src/incidents/incidents.controller.ts` | `GET /projects/:id/incidents` |
| `apps/api/src/push/notification-text.ts` | чистые тексты уведомлений |
| `apps/api/src/push/push.repository.ts` | подписки устройств |
| `apps/api/src/push/push.sender.ts` | транспорт и разбор отказов |
| `apps/api/src/push/push.notifier.ts` | события → адресаты → тексты → отправка |
| `apps/api/src/push/push.controller.ts` | ручки подписки и публичного ключа |
| `apps/api/src/access/access.service.ts` | новый метод «субъекты с уровнем на секции» |
| `apps/api/src/status/status-runner.service.ts` | третья фаза: переспрос, сведение, рассылка |
| `apps/api/src/status/status.repository.ts` | цели обхода с проектом и жизненным циклом |
| `apps/api/src/common/plural.ts` | склонение единиц времени, общее с `indicator.ts` |
| `apps/web/public/sw.js` | service worker: показ уведомления и переход |
| `apps/web/src/components/PushToggle/` | кнопка подписки на этом устройстве |
| `apps/web/src/components/AddressIncidents/` | «лежит с» и история падений адреса |
| `apps/web/src/api/hooks/usePush.ts` | подписка и отписка |
| `apps/web/src/api/hooks/useQueryIncidents.ts` | инциденты проекта |

### Порядок частей

1. **Чанк 1** — контракт и база: схемы, таблицы, миграции, уборка при удалении.
2. **Чанк 2** — инциденты: правило перехода, репозиторий, трёхфазный прогон.
3. **Чанк 3** — пуши: текст, адресаты, транспорт, уведомитель.
4. **Чанк 4** — ручки, журнал, генерация ключей.
5. **Чанк 5** — веб: service worker, кнопка, история у адреса.
6. **Чанк 6** — документация и полная проверка.

После чанков 2 и 3 система уже полезна: инциденты пишутся и видны в базе, пуши уходят. Веб завершает картину.

---

## Чанк 1: Контракт и база

### Task 1: Контракт инцидента

**Files:**
- Create: `packages/shared/src/schemas/incident.ts`
- Create: `packages/shared/src/schemas/incident.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Написать падающий тест**

`packages/shared/src/schemas/incident.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { addressIncidentsSchema, incidentSchema } from './incident';

describe('схема инцидента', () => {
  it('принимает открытый инцидент', () => {
    const parsed = incidentSchema.parse({
      id: '00000000-0000-0000-0000-000000000001',
      domainId: '00000000-0000-0000-0000-000000000002',
      startedAt: '2026-10-20T10:00:00.000Z',
      resolvedAt: null,
      cause: 'HTTP 500',
    });

    expect(parsed.resolvedAt).toBeNull();
  });

  it('принимает инцидент без причины', () => {
    // Причина — данные проверки: её может не быть, а инцидент есть.
    expect(() =>
      incidentSchema.parse({
        id: '00000000-0000-0000-0000-000000000001',
        domainId: '00000000-0000-0000-0000-000000000002',
        startedAt: '2026-10-20T10:00:00.000Z',
        resolvedAt: '2026-10-20T10:40:00.000Z',
        cause: null,
      }),
    ).not.toThrow();
  });

  it('отвергает инцидент без момента начала', () => {
    expect(() =>
      incidentSchema.parse({
        id: '00000000-0000-0000-0000-000000000001',
        domainId: '00000000-0000-0000-0000-000000000002',
        resolvedAt: null,
        cause: null,
      }),
    ).toThrow();
  });

  it('у адреса открытый инцидент отделён от закрытых', () => {
    const parsed = addressIncidentsSchema.parse({
      domainId: '00000000-0000-0000-0000-000000000002',
      name: 'project.ru',
      open: null,
      past: [],
    });

    expect(parsed).toEqual({
      domainId: '00000000-0000-0000-0000-000000000002',
      name: 'project.ru',
      open: null,
      past: [],
    });
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd packages/shared && npx vitest run src/schemas/incident.test.ts`
Expected: FAIL — `Cannot find module './incident'`

- [ ] **Step 3: Написать схему**

`packages/shared/src/schemas/incident.ts`:

```ts
import { z } from 'zod';

/**
 * Падение адреса как отрезок времени.
 *
 * Статус отвечает на вопрос «как сейчас», инцидент — «когда и сколько».
 * Пустой `resolvedAt` означает, что адрес не отвечает до сих пор, и он же
 * отвечает на вопрос «лежит с какого момента»: второй колонки для этого
 * не завели намеренно — она разошлась бы с инцидентом.
 */
export const incidentSchema = z.object({
  id: z.string().uuid(),
  domainId: z.string().uuid(),
  startedAt: z.string(),
  /** Пусто — инцидент открыт. */
  resolvedAt: z.string().nullable(),
  /** Причина на момент падения: «HTTP 500», «таймаут». */
  cause: z.string().nullable(),
});

/** Инциденты одного адреса: открытый отдельно от закрытых. */
export const addressIncidentsSchema = z.object({
  domainId: z.string().uuid(),
  name: z.string(),
  open: incidentSchema.nullable(),
  /** Закрытые, свежие первыми. Глубина ограничена сервером. */
  past: z.array(incidentSchema),
});

/** Инциденты адресов проекта. */
export const projectIncidentsSchema = z.array(addressIncidentsSchema);

/** Инцидент адреса. */
export type Incident = z.infer<typeof incidentSchema>;

/** Инциденты одного адреса. */
export type AddressIncidents = z.infer<typeof addressIncidentsSchema>;

/** Инциденты адресов проекта. */
export type ProjectIncidents = z.infer<typeof projectIncidentsSchema>;
```

Добавить в `packages/shared/src/index.ts` строку `export * from './schemas/incident';` в алфавитном порядке — после `'./schemas/grant'`.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd packages/shared && npx vitest run src/schemas/incident.test.ts`
Expected: PASS, 4 теста

- [ ] **Step 5: Коммит**

```bash
git add packages/shared/src/schemas/incident.ts packages/shared/src/schemas/incident.test.ts packages/shared/src/index.ts
git commit -m "Завести контракт инцидента адреса"
```

### Task 2: Контракт подписки на пуши

**Files:**
- Create: `packages/shared/src/schemas/push.ts`
- Create: `packages/shared/src/schemas/push.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Написать падающий тест**

`packages/shared/src/schemas/push.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { pushKeySchema, pushSubscribeSchema, pushUnsubscribeSchema } from './push';

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123';

describe('схема подписки на пуши', () => {
  it('принимает то, что отдаёт браузер', () => {
    const parsed = pushSubscribeSchema.parse({
      endpoint: ENDPOINT,
      p256dh: 'BFx…ключ',
      auth: 'секрет',
    });

    expect(parsed.endpoint).toBe(ENDPOINT);
  });

  it('отвергает адрес, который не адрес', () => {
    expect(() =>
      pushSubscribeSchema.parse({ endpoint: 'не адрес', p256dh: 'к', auth: 'с' }),
    ).toThrow();
  });

  it('отвергает подписку без ключей: шифровать будет нечем', () => {
    expect(() => pushSubscribeSchema.parse({ endpoint: ENDPOINT, p256dh: '', auth: '' })).toThrow();
  });

  it('снятие подписки опознаёт устройство адресом', () => {
    expect(pushUnsubscribeSchema.parse({ endpoint: ENDPOINT })).toEqual({ endpoint: ENDPOINT });
  });

  it('выключенные уведомления отдают пустой ключ', () => {
    expect(pushKeySchema.parse({ publicKey: null }).publicKey).toBeNull();
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd packages/shared && npx vitest run src/schemas/push.test.ts`
Expected: FAIL — `Cannot find module './push'`

- [ ] **Step 3: Написать схему**

`packages/shared/src/schemas/push.ts`:

```ts
import { z } from 'zod';

/** Предел длины адреса push-службы: у вендоров он укладывается в 2000. */
const ENDPOINT_MAX = 2000;

/** Предел длины ключей браузера. */
const KEY_MAX = 500;

/**
 * Подписка устройства на пуши — то, что отдаёт `PushManager`.
 *
 * `endpoint` опознаёт устройство и наружу не отдаётся ни в каком ответе:
 * владение им позволяет посылать пуши в этот браузер.
 */
export const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(ENDPOINT_MAX),
  /** Открытый ключ браузера для шифрования нагрузки. */
  p256dh: z.string().min(1).max(KEY_MAX),
  /** Секрет аутентификации браузера. */
  auth: z.string().min(1).max(KEY_MAX),
});

/** Снятие подписки. Адрес в теле, а не в URL: ему не место в логах. */
export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(ENDPOINT_MAX),
});

/** Публичный VAPID-ключ. `null` — уведомления выключены на сервере. */
export const pushKeySchema = z.object({
  publicKey: z.string().nullable(),
});

/** Запрос подписки. */
export type PushSubscribeRequest = z.infer<typeof pushSubscribeSchema>;

/** Запрос снятия подписки. */
export type PushUnsubscribeRequest = z.infer<typeof pushUnsubscribeSchema>;

/** Ответ с публичным ключом. */
export type PushKeyResponse = z.infer<typeof pushKeySchema>;
```

Добавить в `packages/shared/src/index.ts` строку `export * from './schemas/push';` после `'./schemas/project'`.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd packages/shared && npx vitest run src/schemas/push.test.ts`
Expected: PASS, 5 тестов

- [ ] **Step 5: Коммит**

```bash
git add packages/shared/src/schemas/push.ts packages/shared/src/schemas/push.test.ts packages/shared/src/index.ts
git commit -m "Завести контракт подписки на пуши"
```

### Task 3: Таблицы инцидентов и подписок

**Files:**
- Create: `apps/api/src/db/schema/incidents.ts`
- Create: `apps/api/src/db/schema/incidents.test.ts`
- Create: `apps/api/src/db/schema/push.ts`
- Create: `apps/api/src/db/schema/push.test.ts`
- Modify: `apps/api/src/db/schema/index.ts`

- [ ] **Step 1: Написать падающие тесты**

`apps/api/src/db/schema/incidents.test.ts`:

```ts
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { addressIncidents } from './incidents';

describe('инциденты адреса', () => {
  it('хранит отрезок времени и причину', () => {
    const columns = getTableConfig(addressIncidents).columns.map((column) => column.name);

    expect(columns).toEqual(
      expect.arrayContaining(['domain_id', 'started_at', 'resolved_at', 'cause']),
    );
  });

  it('открытый инцидент не имеет момента закрытия', () => {
    expect(addressIncidents.resolvedAt.notNull).toBe(false);
  });

  it('у адреса не больше одного открытого инцидента', () => {
    // Это и есть защита от второго пуша об одном падении: правило живёт
    // в базе, а не в памяти процесса, и перезапуск API его не теряет.
    const index = getTableConfig(addressIncidents).indexes.find(
      (candidate) => candidate.config.name === 'address_incidents_open',
    );

    expect(index?.config.unique).toBe(true);
    expect(index?.config.where).toBeDefined();
  });

  it('ссылка на адрес не каскадная: уборка явная', () => {
    // Каскадов в проекте нет: строки уносит репозиторий окружений явно,
    // в той же транзакции, что и строки статусов.
    expect(getTableConfig(addressIncidents).foreignKeys[0]?.onDelete).toBe('restrict');
  });
});
```

`apps/api/src/db/schema/push.test.ts`:

```ts
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { pushSubscriptions } from './push';

describe('подписки на пуши', () => {
  it('хранит адрес службы и ключи браузера', () => {
    const columns = getTableConfig(pushSubscriptions).columns.map((column) => column.name);

    expect(columns).toEqual(
      expect.arrayContaining(['subject_id', 'endpoint', 'p256dh', 'auth']),
    );
  });

  it('адрес службы опознаёт устройство и потому уникален', () => {
    // Браузер пересоздаёт подписку сам: повторная не должна плодить строку.
    expect(pushSubscriptions.endpoint.isUnique).toBe(true);
  });

  it('подписка принадлежит субъекту, а не пользователю', () => {
    // Права живут у субъекта — модель прав для людей и машин единая.
    const columns = getTableConfig(pushSubscriptions).columns.map((column) => column.name);

    expect(columns).not.toContain('user_id');
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падают**

Run: `cd apps/api && npx vitest run src/db/schema/incidents.test.ts src/db/schema/push.test.ts`
Expected: FAIL — модули не найдены

- [ ] **Step 3: Написать схемы**

`apps/api/src/db/schema/incidents.ts`:

```ts
import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { environmentDomains } from './environments';

/**
 * Падение адреса как отрезок времени (дизайн уведомлений, раздел 3).
 *
 * Строка статуса отвечает на вопрос «как сейчас» и перезаписывается; здесь
 * лежит «когда и сколько». Открытый инцидент — он же ответ на «лежит с
 * какого момента», и колонки `down_since` в статусе нет намеренно: второе
 * место хранения того же факта разошлось бы с первым.
 *
 * Частичный уникальный индекс делает второй пуш об одном падении
 * невозможным: правило живёт в базе, а не в памяти процесса, и перезапуск
 * API не рассылает заново то, что уже известно.
 *
 * Ссылка `restrict`, а не каскад: каскадов в проекте нет, строки уносит
 * репозиторий окружений явно, в той же транзакции, что и строки статусов.
 */
export const addressIncidents = pgTable(
  'address_incidents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id')
      .notNull()
      .references(() => environmentDomains.id, { onDelete: 'restrict' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    /** Обнуляемый: пусто — адрес не отвечает до сих пор. */
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    /** Причина на момент падения; могла и не определиться. */
    cause: text('cause'),
  },
  (table) => [
    uniqueIndex('address_incidents_open')
      .on(table.domainId)
      .where(sql`${table.resolvedAt} is null`),
  ],
);

/** Строка инцидента. */
export type AddressIncidentRow = typeof addressIncidents.$inferSelect;
```

`apps/api/src/db/schema/push.ts`:

```ts
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { subjects } from './subjects';

/**
 * Подписка устройства на веб-пуши (дизайн уведомлений, раздел 3).
 *
 * Принадлежит субъекту, а не пользователю: модель прав для людей и машин
 * единая, и адресаты считаются по выдачам субъекта. Подписываться при этом
 * может только субъект вида `user` — у токена агента браузера нет.
 *
 * `endpoint` уникален, потому что он и опознаёт устройство: браузер
 * пересоздаёт подписку сам, когда push-служба меняет ключи, и повторная
 * подписка должна обновлять строку, а не плодить вторую.
 */
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  subjectId: uuid('subject_id')
    .notNull()
    .references(() => subjects.id, { onDelete: 'restrict' }),
  /** Адрес push-службы. Наружу не отдаётся ни в каком ответе. */
  endpoint: text('endpoint').notNull().unique(),
  /** Открытый ключ браузера. */
  p256dh: text('p256dh').notNull(),
  /** Секрет аутентификации браузера. */
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Строка подписки. */
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
```

В `apps/api/src/db/schema/index.ts` добавить в алфавитном порядке:

```ts
export * from './incidents';
export * from './push';
```

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/db/schema/incidents.test.ts src/db/schema/push.test.ts`
Expected: PASS, 7 тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/db/schema/incidents.ts apps/api/src/db/schema/incidents.test.ts apps/api/src/db/schema/push.ts apps/api/src/db/schema/push.test.ts apps/api/src/db/schema/index.ts
git commit -m "Завести таблицы инцидентов и подписок на пуши"
```

### Task 4: Миграции

**Files:**
- Create: `apps/api/drizzle/0028_*.sql` (имя сгенерирует drizzle-kit)
- Create: `apps/api/drizzle/0029_incidents_push_privileges.sql`
- Modify: `apps/api/drizzle/meta/_journal.json` (генератор сам; вторую миграцию — вручную по образцу)

- [ ] **Step 1: Сгенерировать миграцию по схеме**

Run: `cd apps/api && pnpm db:generate`
Expected: появился `drizzle/0028_<слово>.sql` и запись в `meta/_journal.json`

- [ ] **Step 2: Прочитать сгенерированное и проверить глазами**

Run: `cat apps/api/drizzle/0028_*.sql`

Обязательно должно быть:

- `CREATE TABLE "address_incidents"` и `CREATE TABLE "push_subscriptions"`;
- `CREATE UNIQUE INDEX "address_incidents_open" ON "address_incidents" ("domain_id") WHERE "address_incidents"."resolved_at" is null` — **условие `WHERE` обязательно**. Если генератор его потерял, допиши вручную: без условия индекс запретит второе падение адреса за всё время, а не второе одновременное.

- [ ] **Step 3: Написать миграцию привилегий**

`apps/api/drizzle/0029_incidents_push_privileges.sql` по образцу `0011_status_privileges.sql`:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON
  address_incidents, push_subscriptions
TO cairn_app;
```

Зарегистрировать её в `apps/api/drizzle/meta/_journal.json` вручную, по образцу соседних записей (`idx` на единицу больше, `tag` — имя файла без расширения, `when` — текущая метка времени в миллисекундах, `breakpoints: true`).

- [ ] **Step 4: Прогнать интеграционный тест, который применяет миграции**

Run: `cd apps/api && npx vitest run src/db/schema/invariants.test.ts`
Expected: PASS — миграции применились в контейнере без ошибок

- [ ] **Step 5: Коммит**

```bash
git add apps/api/drizzle
git commit -m "Применить таблицы инцидентов и подписок миграцией"
```

### Task 5: Уборка инцидентов при удалении адреса

**Files:**
- Modify: `apps/api/src/environments/environments.repository.ts` (три места рядом с `domainStatuses`: строки ~251, ~355, ~455)
- Modify: `apps/api/src/environments/environments.repository.test.ts`

- [ ] **Step 1: Написать падающий тест**

В `apps/api/src/environments/environments.repository.test.ts` — рядом с существующими проверками уборки статусов (найти их `grep -n "domainStatuses" apps/api/src/environments/environments.repository.test.ts` и писать тем же стилем, с той же подготовкой данных):

```ts
it('удаление адреса уносит его инциденты', async () => {
  // Каскадов в проекте нет, ссылка restrict: не унесём — удаление упадёт
  // на внешнем ключе, и адрес станет неудаляемым.
  const { environmentId, domainId } = await seedEnvironmentWithDomain();

  await testDb.db.insert(addressIncidents).values({ domainId, cause: 'таймаут' });

  await repository.removeDomain(subject, environmentId, domainId);

  expect(await testDb.rowsOf(addressIncidents)).toHaveLength(0);
});
```

Имена `seedEnvironmentWithDomain`, `repository.removeDomain` и порядок аргументов взять из соседних тестов файла — они там уже есть в том или ином виде. Такой же тест нужен для удаления окружения и удаления проекта, если соседние проверки статусов покрывают все три пути.

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/environments/environments.repository.test.ts`
Expected: FAIL — строка инцидента осталась либо удаление упало на внешнем ключе

- [ ] **Step 3: Добавить уборку**

В `apps/api/src/environments/environments.repository.ts` рядом с каждым `tx.delete(domainStatuses)` добавить такое же удаление инцидентов — **до** удаления самих адресов и с тем же условием по `domainId`:

```ts
await tx.delete(addressIncidents).where(eq(addressIncidents.domainId, domain.id));
```

и, где удаление идёт пачкой по списку адресов:

```ts
await tx.delete(addressIncidents).where(
  inArray(addressIncidents.domainId, /* тот же подзапрос или список, что у статусов */),
);
```

Импорт `addressIncidents` добавить к существующему импорту из `../db/schema`.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/environments/environments.repository.test.ts`
Expected: PASS

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/environments
git commit -m "Уносить инциденты вместе с адресом"
```

---

## Чанк 2: Инциденты на сервере

### Task 6: Чистое правило перехода

**Files:**
- Create: `apps/api/src/incidents/incident-decision.ts`
- Create: `apps/api/src/incidents/incident-decision.test.ts`

Образец для подражания — `apps/api/src/servers/server-discovery.ts`: решение отделено от записи чистой функцией, и именно она покрыта таблицей случаев.

- [ ] **Step 1: Написать падающий тест**

`apps/api/src/incidents/incident-decision.test.ts`:

```ts
import { HealthState } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { decideIncident, IncidentAction } from './incident-decision';

/** Живой адрес непаузированного проекта без открытого инцидента. */
const CALM = { health: HealthState.Up, isPaused: false, hasOpenIncident: false };

describe('решение об инциденте', () => {
  it('спокойное состояние ничего не меняет', () => {
    expect(decideIncident(CALM)).toBe(IncidentAction.None);
  });

  it('упавший адрес без инцидента открывает инцидент', () => {
    expect(decideIncident({ ...CALM, health: HealthState.Down })).toBe(IncidentAction.Open);
  });

  it('упавший адрес с открытым инцидентом не открывает второй', () => {
    // Иначе пуш повторялся бы каждые пятнадцать минут.
    expect(
      decideIncident({ ...CALM, health: HealthState.Down, hasOpenIncident: true }),
    ).toBe(IncidentAction.None);
  });

  it('ответивший адрес закрывает открытый инцидент', () => {
    expect(decideIncident({ ...CALM, hasOpenIncident: true })).toBe(IncidentAction.Resolve);
  });

  it('непроверенный адрес не трогает ничего', () => {
    // Отсутствие результата — не падение, и уведомлять о собственной
    // слепоте система не должна.
    expect(decideIncident({ ...CALM, health: null })).toBe(IncidentAction.None);
    expect(decideIncident({ ...CALM, health: null, hasOpenIncident: true })).toBe(
      IncidentAction.None,
    );
  });

  it('приостановленный проект инцидента не открывает', () => {
    // ТЗ 6: намеренно отключённый проект не выглядит аварийным.
    expect(
      decideIncident({ health: HealthState.Down, isPaused: true, hasOpenIncident: false }),
    ).toBe(IncidentAction.None);
  });

  it('приостановленный проект всё равно закрывает открытый инцидент', () => {
    // Паузу могли поставить поверх уже начавшегося падения. «Отвечает
    // снова» — правда, и держать инцидент открытым вечно незачем.
    expect(
      decideIncident({ health: HealthState.Up, isPaused: true, hasOpenIncident: true }),
    ).toBe(IncidentAction.Resolve);
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/incidents/incident-decision.test.ts`
Expected: FAIL — `Cannot find module './incident-decision'`

- [ ] **Step 3: Написать функцию**

`apps/api/src/incidents/incident-decision.ts`:

```ts
import { HealthState } from '@cairn/shared';

/** Что сделать с инцидентом адреса по итогам проверки. */
export enum IncidentAction {
  /** Открыть новый: адрес упал, и об этом ещё не сообщали. */
  Open = 'open',
  /** Закрыть открытый: адрес ответил. */
  Resolve = 'resolve',
  /** Ничего не делать. */
  None = 'none',
}

/** Состояние адреса на момент решения. */
export interface AddressVerdict {
  /** `null` — адрес ещё не проверялся либо проверка не состоялась. */
  health: HealthState | null;
  /** Проект приостановлен: намеренно отключённый не аварийный (ТЗ 6). */
  isPaused: boolean;
  /** Есть ли уже открытый инцидент у этого адреса. */
  hasOpenIncident: boolean;
}

/**
 * Решает судьбу инцидента адреса (дизайн уведомлений, раздел 5).
 *
 * Пауза гасит только открытие, но не закрытие: её могли поставить поверх
 * уже начавшегося падения, и «отвечает снова» в этом случае — правда.
 * Обратное правило оставило бы инцидент открытым навсегда.
 */
export function decideIncident(verdict: AddressVerdict): IncidentAction {
  if (verdict.health === null) {
    return IncidentAction.None;
  }

  if (verdict.health === HealthState.Down) {
    if (verdict.isPaused || verdict.hasOpenIncident) {
      return IncidentAction.None;
    }

    return IncidentAction.Open;
  }

  return verdict.hasOpenIncident ? IncidentAction.Resolve : IncidentAction.None;
}
```

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/incidents/incident-decision.test.ts`
Expected: PASS, 7 тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/incidents/incident-decision.ts apps/api/src/incidents/incident-decision.test.ts
git commit -m "Завести правило перехода состояния адреса в инцидент"
```

### Task 7: Репозиторий инцидентов

**Files:**
- Create: `apps/api/src/incidents/incidents.repository.ts`
- Create: `apps/api/src/incidents/incidents.repository.test.ts`
- Create: `apps/api/src/incidents/constants.ts`

Подготовку данных и структуру теста брать из `apps/api/src/status/status-runner.service.test.ts` — там уже есть проект, субъект, окружение и адрес.

- [ ] **Step 1: Написать падающий тест**

`apps/api/src/incidents/incidents.repository.test.ts` — интеграционный, на `startTestDatabase()`:

```ts
describe('репозиторий инцидентов', () => {
  it('открывает инцидент с причиной', async () => {
    const incident = await repository.open(domainId, 'HTTP 500');

    expect(incident.cause).toBe('HTTP 500');
    expect(incident.resolvedAt).toBeNull();
  });

  it('второй открытый инцидент на адрес не заводится', async () => {
    // База держит это сама: частичный уникальный индекс.
    await repository.open(domainId, 'таймаут');

    await expect(repository.open(domainId, 'таймаут')).rejects.toThrow();
  });

  it('закрывает открытый инцидент и отдаёт закрытую строку', async () => {
    await repository.open(domainId, 'таймаут');

    const resolved = await repository.resolve(domainId, new Date('2026-10-20T11:00:00Z'));

    expect(resolved?.resolvedAt).toEqual(new Date('2026-10-20T11:00:00Z'));
  });

  it('закрывать нечего — отдаёт пусто, а не падает', async () => {
    expect(await repository.resolve(domainId, new Date())).toBeNull();
  });

  it('после закрытия адрес снова может упасть', async () => {
    // Иначе индекс запретил бы второе падение за всё время.
    await repository.open(domainId, 'раз');
    await repository.resolve(domainId, new Date());

    await expect(repository.open(domainId, 'два')).resolves.toBeDefined();
  });

  it('открытые инциденты отдаются картой по адресу', async () => {
    await repository.open(domainId, 'таймаут');

    expect((await repository.openByDomain()).get(domainId)?.cause).toBe('таймаут');
  });

  it('выдача по проекту делит открытый и закрытые', async () => {
    await repository.open(domainId, 'раз');
    await repository.resolve(domainId, new Date('2026-10-20T11:00:00Z'));
    await repository.open(domainId, 'два');

    const [address] = await repository.forProject(superadmin, projectId);

    expect(address?.open?.cause).toBe('два');
    expect(address?.past).toHaveLength(1);
  });

  it('без доступа к инфраструктуре проект не раскрывается', async () => {
    // Отсутствие доступа — 404, а не 403: иначе ответ подтвердил бы,
    // что проект существует.
    await expect(repository.forProject(outsider, projectId)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/incidents/incidents.repository.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Написать репозиторий**

`apps/api/src/incidents/constants.ts`:

```ts
/**
 * Сколько закрытых инцидентов показывать на адрес.
 *
 * Экран наблюдения, а не архив: глубже смотрят в базу. Чистки старых
 * инцидентов нет намеренно — дизайн, раздел 15.
 */
export const PAST_INCIDENTS_LIMIT = 20;
```

`apps/api/src/incidents/incidents.repository.ts`:

```ts
import {
  AccessLevel,
  Section,
  type Incident,
  type ProjectIncidents,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';

import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import {
  addressIncidents,
  environmentDomains,
  environments,
  type AddressIncidentRow,
} from '../db/schema';
import { PAST_INCIDENTS_LIMIT } from './constants';

/**
 * Хранилище инцидентов адресов (дизайн уведомлений, раздел 3).
 *
 * Запись без субъекта: инциденты заводит прогон, а не человек. Чтение —
 * с проверкой прав: история падений принадлежит уровню «метаданные»
 * секции «Инфраструктура», как и сам статус (ТЗ 4.3).
 */
@Injectable()
export class IncidentsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly access: AccessService,
  ) {}

  /** Открывает инцидент адреса. Второй открытый запретит индекс базы. */
  async open(domainId: string, cause: string | null): Promise<AddressIncidentRow> {
    const [incident] = await this.db
      .insert(addressIncidents)
      .values({ domainId, cause })
      .returning();

    return incident!;
  }

  /** Закрывает открытый инцидент адреса; пусто — закрывать было нечего. */
  async resolve(domainId: string, at: Date): Promise<AddressIncidentRow | null> {
    const [incident] = await this.db
      .update(addressIncidents)
      .set({ resolvedAt: at })
      .where(and(eq(addressIncidents.domainId, domainId), isNull(addressIncidents.resolvedAt)))
      .returning();

    return incident ?? null;
  }

  /** Открытые инциденты всех адресов картой: ключ — адрес. */
  async openByDomain(): Promise<Map<string, AddressIncidentRow>> {
    const rows = await this.db
      .select()
      .from(addressIncidents)
      .where(isNull(addressIncidents.resolvedAt));

    return new Map(rows.map((row) => [row.domainId, row]));
  }

  /** Инциденты адресов проекта. Право — метаданные инфраструктуры. */
  async forProject(subject: RequestSubject, projectId: string): Promise<ProjectIncidents> {
    await this.access.requireLevel(
      subject,
      projectId,
      Section.Infrastructure,
      AccessLevel.Metadata,
    );

    const addresses = await this.db
      .select({ id: environmentDomains.id, name: environmentDomains.name })
      .from(environmentDomains)
      .innerJoin(environments, eq(environments.id, environmentDomains.environmentId))
      .where(eq(environments.projectId, projectId))
      .orderBy(asc(environmentDomains.name));

    if (addresses.length === 0) {
      return [];
    }

    const rows = await this.db
      .select()
      .from(addressIncidents)
      .where(
        inArray(
          addressIncidents.domainId,
          addresses.map((address) => address.id),
        ),
      )
      .orderBy(desc(addressIncidents.startedAt));

    return addresses.map((address) => {
      const own = rows.filter((row) => row.domainId === address.id);

      return {
        domainId: address.id,
        name: address.name,
        open: own.filter((row) => row.resolvedAt === null).map(viewOf)[0] ?? null,
        past: own
          .filter((row) => row.resolvedAt !== null)
          .slice(0, PAST_INCIDENTS_LIMIT)
          .map(viewOf),
      };
    });
  }
}

/** Проекция строки в контракт: наружу уходят только строки времени. */
function viewOf(row: AddressIncidentRow): Incident {
  return {
    id: row.id,
    domainId: row.domainId,
    startedAt: row.startedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    cause: row.cause,
  };
}
```

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/incidents/incidents.repository.test.ts`
Expected: PASS, 8 тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/incidents
git commit -m "Завести репозиторий инцидентов"
```

### Task 8: Сведение состояния в события

**Files:**
- Create: `apps/api/src/incidents/incidents.service.ts`
- Create: `apps/api/src/incidents/incidents.service.test.ts`

- [ ] **Step 1: Написать падающий тест**

`apps/api/src/incidents/incidents.service.test.ts` — интеграционный, по образцу предыдущего:

```ts
describe('сведение инцидентов', () => {
  it('падение даёт событие открытия с причиной', async () => {
    const events = await service.reconcile([downState()]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: IncidentEventKind.Opened, cause: 'HTTP 500' });
  });

  it('повторный прогон при том же падении событий не даёт', async () => {
    await service.reconcile([downState()]);

    expect(await service.reconcile([downState()])).toEqual([]);
  });

  it('ответивший адрес даёт событие закрытия с длительностью', async () => {
    await service.reconcile([downState()]);

    const events = await service.reconcile([upState()]);

    expect(events[0]?.kind).toBe(IncidentEventKind.Resolved);
    expect(events[0]?.startedAt).toBeInstanceOf(Date);
    expect(events[0]?.resolvedAt).toBeInstanceOf(Date);
  });

  it('событие несёт имя проекта и окружения для текста уведомления', async () => {
    const events = await service.reconcile([downState()]);

    expect(events[0]).toMatchObject({ projectName: 'CAIRN', environmentName: 'прод' });
  });

  it('приостановленный проект событий не даёт', async () => {
    expect(await service.reconcile([{ ...downState(), isPaused: true }])).toEqual([]);
  });

  it('падение одного адреса не мешает свести остальные', async () => {
    // Адрес с несуществующим идентификатором уронит запись, но второй
    // адрес обязан быть сведён.
    const events = await service.reconcile([
      { ...downState(), domainId: '00000000-0000-0000-0000-0000000000ff' },
      downState(),
    ]);

    expect(events).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/incidents/incidents.service.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Написать службу**

`apps/api/src/incidents/incidents.service.ts`:

```ts
import type { HealthState } from '@cairn/shared';
import { Injectable, Logger } from '@nestjs/common';

import { decideIncident, IncidentAction } from './incident-decision';
import { IncidentsRepository } from './incidents.repository';

/** Состояние адреса на входе сведения. */
export interface AddressState {
  domainId: string;
  /** Имя адреса: оно же попадёт в заголовок уведомления. */
  name: string;
  projectId: string;
  projectName: string;
  environmentName: string;
  isPaused: boolean;
  health: HealthState | null;
  healthError: string | null;
}

/** Что случилось с инцидентом. */
export enum IncidentEventKind {
  Opened = 'opened',
  Resolved = 'resolved',
}

/**
 * Событие инцидента — всё, что нужно уведомителю.
 *
 * Имена проекта и окружения кладутся в событие, а не вычитываются
 * уведомителем: иначе он знал бы о схеме базы, и подключение второго
 * канала потребовало бы повторить эти запросы.
 */
export interface IncidentEvent {
  kind: IncidentEventKind;
  domainId: string;
  address: string;
  projectId: string;
  projectName: string;
  environmentName: string;
  cause: string | null;
  startedAt: Date;
  resolvedAt: Date | null;
}

/**
 * Сводит состояние адресов в инциденты (дизайн уведомлений, раздел 5).
 *
 * Про уведомления не знает ничего: отдаёт события, а кому их разослать —
 * забота уведомителя. Поэтому второй канал подключается, не трогая это
 * место.
 */
@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(private readonly repository: IncidentsRepository) {}

  /** Применяет правило к каждому адресу и возвращает случившиеся события. */
  async reconcile(states: AddressState[]): Promise<IncidentEvent[]> {
    const open = await this.repository.openByDomain();
    const events: IncidentEvent[] = [];
    const now = new Date();

    for (const state of states) {
      const action = decideIncident({
        health: state.health,
        isPaused: state.isPaused,
        hasOpenIncident: open.has(state.domainId),
      });

      if (action === IncidentAction.None) {
        continue;
      }

      try {
        // Отказ одного адреса не прерывает обход — то же правило, что
        // у прогона проверок.
        if (action === IncidentAction.Open) {
          const incident = await this.repository.open(state.domainId, state.healthError);

          events.push(eventOf(IncidentEventKind.Opened, state, incident.startedAt, null));
          continue;
        }

        const incident = await this.repository.resolve(state.domainId, now);

        if (incident) {
          events.push(
            eventOf(IncidentEventKind.Resolved, state, incident.startedAt, incident.resolvedAt),
          );
        }
      } catch (cause) {
        this.logger.warn(`Инцидент адреса ${state.name} не записан: ${cause}`);
      }
    }

    return events;
  }
}

/** Собирает событие из состояния адреса и строки инцидента. */
function eventOf(
  kind: IncidentEventKind,
  state: AddressState,
  startedAt: Date,
  resolvedAt: Date | null,
): IncidentEvent {
  return {
    kind,
    domainId: state.domainId,
    address: state.name,
    projectId: state.projectId,
    projectName: state.projectName,
    environmentName: state.environmentName,
    cause: state.healthError,
    startedAt,
    resolvedAt,
  };
}
```

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/incidents/incidents.service.test.ts`
Expected: PASS, 6 тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/incidents
git commit -m "Сводить состояние адресов в события инцидентов"
```

### Task 9: Цели обхода знают проект и жизненный цикл

**Files:**
- Modify: `apps/api/src/status/status.repository.ts` (интерфейс `AddressTarget`, метод `listTargets`, новый метод `updateAddressHealth`)
- Modify: `apps/api/src/status/status.repository.test.ts`

- [ ] **Step 1: Написать падающий тест**

В `apps/api/src/status/status.repository.test.ts`:

```ts
it('цель обхода несёт проект, окружение и жизненный цикл', async () => {
  // Сведение инцидентов решает по проекту (пауза) и пишет в уведомление
  // имена проекта и окружения: второй запрос за ними был бы лишним.
  const { addresses } = await repository.listTargets();

  expect(addresses[0]).toMatchObject({
    projectId: expect.any(String),
    projectName: 'CAIRN',
    environmentName: 'прод',
    lifecycle: ProjectLifecycle.Development,
  });
});

it('переспрос правит только здоровье, не затирая сроки', async () => {
  await repository.upsertAddressStatus(domainId, fullStatusInput());

  await repository.updateAddressHealth(domainId, {
    health: HealthState.Down,
    latencyMs: null,
    healthError: 'таймаут',
  });

  const [row] = await testDb.rowsOf(domainStatuses);

  expect(row?.health).toBe(HealthState.Down);
  expect(row?.tlsValidTo).not.toBeNull();
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/status/status.repository.test.ts`
Expected: FAIL — в цели нет новых полей, метода `updateAddressHealth` нет

- [ ] **Step 3: Расширить репозиторий**

В `apps/api/src/status/status.repository.ts`:

```ts
/** Адрес окружения как цель обхода: имя, путь ручки и чей он. */
export interface AddressTarget {
  id: string;
  name: string;
  healthCheckPath: string | null;
  /** Проект адреса: по нему считаются адресаты уведомления. */
  projectId: string;
  projectName: string;
  environmentName: string;
  /** Жизненный цикл проекта: приостановленный инцидентов не открывает. */
  lifecycle: ProjectLifecycle;
}

/** Итог переспроса: только здоровье, сроки переспрашивать незачем. */
export interface AddressHealthInput {
  health: HealthState;
  latencyMs: number | null;
  healthError: string | null;
}
```

`listTargets` — добавить соединение с проектами:

```ts
const addresses = await this.db
  .select({
    id: environmentDomains.id,
    name: environmentDomains.name,
    healthCheckPath: environments.healthCheckPath,
    projectId: projects.id,
    projectName: projects.name,
    environmentName: environments.name,
    lifecycle: projects.lifecycle,
  })
  .from(environmentDomains)
  .innerJoin(environments, eq(environments.id, environmentDomains.environmentId))
  .innerJoin(projects, eq(projects.id, environments.projectId))
  .orderBy(asc(environmentDomains.name));
```

Новый метод рядом с `upsertAddressStatus`:

```ts
/**
 * Пишет итог переспроса: только здоровье.
 *
 * Отдельно от `upsertAddressStatus`, потому что переспрашивается один
 * health: TLS, разрешение имени и срок регистрации за полминуты не
 * меняются, а перезапись их пустыми затёрла бы работу первой фазы.
 */
async updateAddressHealth(domainId: string, input: AddressHealthInput): Promise<void> {
  await this.db
    .update(domainStatuses)
    .set({ ...input, checkedAt: new Date() })
    .where(eq(domainStatuses.domainId, domainId));
}
```

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/status/status.repository.test.ts`
Expected: PASS

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/status/status.repository.ts apps/api/src/status/status.repository.test.ts
git commit -m "Дать целям обхода проект и починить переспрос здоровья"
```

### Task 10: Трёхфазный прогон

**Files:**
- Modify: `apps/api/src/status/status-runner.service.ts`
- Modify: `apps/api/src/status/status-runner.service.test.ts`
- Modify: `apps/api/src/status/status.module.ts`

**Осторожно:** по умолчанию пауза переспроса — 30 секунд. В `beforeAll` теста обязательно выставить `process.env.CAIRN_HEALTH_RECHECK_DELAY_SECONDS = '0'`, иначе каждый тест прогона будет ждать полминуты.

- [ ] **Step 1: Написать падающий тест**

В `apps/api/src/status/status-runner.service.test.ts`:

```ts
it('одиночный отказ переспрашивается и инцидента не даёт', async () => {
  // Сетевая икота не должна будить человека: спрашиваем ещё раз.
  const health = vi
    .fn()
    .mockResolvedValueOnce({ health: HealthState.Down, latencyMs: 0, error: 'таймаут' })
    .mockResolvedValueOnce({ health: HealthState.Up, latencyMs: 12, error: null });

  await runnerWith({ checkHealth: health }).runAll();

  expect(health).toHaveBeenCalledTimes(2);
  expect(await testDb.rowsOf(addressIncidents)).toHaveLength(0);
});

it('подтверждённый отказ открывает инцидент', async () => {
  const health = vi
    .fn()
    .mockResolvedValue({ health: HealthState.Down, latencyMs: 0, error: 'HTTP 500' });

  await runnerWith({ checkHealth: health }).runAll();

  const [incident] = await testDb.rowsOf(addressIncidents);

  expect(incident?.cause).toBe('HTTP 500');
});

it('переспрос не затирает сроки первой фазы', async () => {
  await runnerWith({
    checkHealth: vi.fn().mockResolvedValue({ health: HealthState.Down, latencyMs: 0, error: 'т' }),
  }).runAll();

  const [status] = await testDb.rowsOf(domainStatuses);

  expect(status?.tlsValidTo).not.toBeNull();
});

it('живой адрес не переспрашивается', async () => {
  const health = vi
    .fn()
    .mockResolvedValue({ health: HealthState.Up, latencyMs: 10, error: null });

  await runnerWith({ checkHealth: health }).runAll();

  expect(health).toHaveBeenCalledTimes(1);
});

it('события уходят уведомителю', async () => {
  const notify = vi.fn();

  await runnerWith(
    { checkHealth: vi.fn().mockResolvedValue({ health: HealthState.Down, latencyMs: 0, error: null }) },
    { notify },
  ).runAll();

  expect(notify).toHaveBeenCalledWith([
    expect.objectContaining({ kind: IncidentEventKind.Opened }),
  ]);
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/status/status-runner.service.test.ts`
Expected: FAIL — переспроса нет, health зовётся один раз

- [ ] **Step 3: Переписать `runAll`**

В `apps/api/src/status/status-runner.service.ts` — конструктор принимает `IncidentsService` и `PushNotifier`, а `runAll` становится таким:

```ts
/**
 * Обходит адреса, переспрашивает упавшие и сводит инциденты.
 *
 * Три фазы вместо одной: проверить, подтвердить, записать. Переспрос
 * нужен затем, что результат проверки теперь не только красит индикатор,
 * но и будит человека, — а цена ложной тревоги много выше цены неверного
 * цвета на четверть часа.
 */
async runAll(): Promise<void> {
  const targets = await this.repository.listTargets();
  const health = new Map<string, HealthResult>();
  const suspects: AddressTarget[] = [];

  for (const address of targets.addresses) {
    try {
      const result = await this.checkers.checkHealth(address.name, address.healthCheckPath);
      const resolved = await this.checkers.resolveAddress(address.name);
      const tls = await this.checkers.checkTls(address.name);
      const registry = await this.checkers.checkDomainExpiry(address.name);

      health.set(address.id, result);

      if (result.health === HealthState.Down) {
        suspects.push(address);
      }

      await this.repository.upsertAddressStatus(address.id, {
        health: result.health,
        latencyMs: result.latencyMs,
        healthError: result.error,
        resolvedIp: resolved.ip,
        resolveError: resolved.error,
        tlsValidTo: tls.validTo,
        tlsError: tls.error,
        registryExpiresAt: registry.expiresAt,
        registryError: registry.error,
      });
    } catch (cause) {
      this.logger.warn(`Проверка адреса ${address.name} упала: ${cause}`);
    }
  }

  await this.recheck(suspects, health);
  await this.adoptMachines();
  await this.settleIncidents(targets.addresses, health);
}

/**
 * Переспрашивает упавшие адреса после одной общей паузы.
 *
 * Пауза одна на прогон, а не на адрес: десять лежащих адресов не должны
 * растягивать обход на пять минут.
 */
private async recheck(
  suspects: AddressTarget[],
  health: Map<string, HealthResult>,
): Promise<void> {
  if (suspects.length === 0) {
    return;
  }

  await this.pause();

  for (const address of suspects) {
    try {
      const result = await this.checkers.checkHealth(address.name, address.healthCheckPath);

      health.set(address.id, result);
      await this.repository.updateAddressHealth(address.id, {
        health: result.health,
        latencyMs: result.latencyMs,
        healthError: result.error,
      });
    } catch (cause) {
      this.logger.warn(`Переспрос адреса ${address.name} упал: ${cause}`);
    }
  }
}

/** Пауза перед переспросом; `0` — без переспроса (так в тестах). */
private async pause(): Promise<void> {
  const seconds = Number(process.env.CAIRN_HEALTH_RECHECK_DELAY_SECONDS ?? '30');

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

/**
 * Сводит инциденты и отдаёт события на рассылку.
 *
 * По всем адресам, а не только по подозреваемым: инцидент закрывает как
 * раз тот адрес, который ответил и в подозреваемых не был.
 *
 * Сначала запись, потом рассылка: падение процесса между ними теряет
 * пуш, но не теряет инцидент, — а человек увидит падение на экране.
 * Обратный порядок оставил бы уведомление без того, на что в нём нажимают.
 */
private async settleIncidents(
  addresses: AddressTarget[],
  health: Map<string, HealthResult>,
): Promise<void> {
  const events = await this.incidents.reconcile(
    addresses.map((address) => ({
      domainId: address.id,
      name: address.name,
      projectId: address.projectId,
      projectName: address.projectName,
      environmentName: address.environmentName,
      isPaused: address.lifecycle === ProjectLifecycle.Paused,
      health: health.get(address.id)?.health ?? null,
      healthError: health.get(address.id)?.error ?? null,
    })),
  );

  if (events.length === 0) {
    return;
  }

  try {
    // Отказ рассылки не должен валить прогон: статус важнее уведомления.
    await this.notifier.notify(events);
  } catch (cause) {
    this.logger.warn(`Рассылка уведомлений упала: ${cause}`);
  }
}
```

В `status.module.ts` добавить `IncidentsModule` и `PushModule` в `imports` (они появятся в чанках 2 и 3; на этом шаге `PushNotifier` можно внедрить как `@Optional()`, чтобы чанк 2 собирался до чанка 3 — но тогда не забыть снять `@Optional()` в Task 17).

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/status/status-runner.service.test.ts`
Expected: PASS, включая прежние восемь тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/status
git commit -m "Переспрашивать упавшие адреса и сводить инциденты в прогоне"
```

---

## Чанк 3: Пуши

### Task 11: Склонение единиц времени общей утилитой

**Files:**
- Create: `apps/api/src/common/plural.ts`
- Create: `apps/api/src/common/plural.test.ts`
- Modify: `apps/api/src/status/indicator.ts` (приватная `daysAgoOf` переходит на общую утилиту)

Это не попутный рефакторинг: текст уведомления склоняет минуты и часы, а `indicator.ts` уже склоняет дни тем же правилом. Второй экземпляр правила разошёлся бы с первым.

- [ ] **Step 1: Написать падающий тест**

`apps/api/src/common/plural.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { pluralOf } from './plural';

const MINUTES: [string, string, string] = ['минуту', 'минуты', 'минут'];

describe('склонение', () => {
  it('одна форма для единицы', () => {
    expect(pluralOf(1, MINUTES)).toBe('минуту');
    expect(pluralOf(21, MINUTES)).toBe('минуту');
  });

  it('вторая форма для двух, трёх и четырёх', () => {
    expect(pluralOf(2, MINUTES)).toBe('минуты');
    expect(pluralOf(44, MINUTES)).toBe('минуты');
  });

  it('третья форма для остальных', () => {
    expect(pluralOf(5, MINUTES)).toBe('минут');
    expect(pluralOf(0, MINUTES)).toBe('минут');
  });

  it('второй десяток — всегда третья форма', () => {
    // «одиннадцать минут», а не «одиннадцать минуту».
    expect(pluralOf(11, MINUTES)).toBe('минут');
    expect(pluralOf(112, MINUTES)).toBe('минуты');
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/common/plural.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Написать утилиту и перевести `indicator.ts`**

`apps/api/src/common/plural.ts`:

```ts
/**
 * Склоняет единицу по числу: формы для 1, для 2–4 и для остальных.
 *
 * Правило живёт в одном месте: его просят и предупреждения о просрочке,
 * и длительность падения в уведомлении.
 */
export function pluralOf(count: number, forms: [string, string, string]): string {
  const lastTwo = count % 100;
  const last = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return forms[2];
  }

  if (last === 1) {
    return forms[0];
  }

  if (last >= 2 && last <= 4) {
    return forms[1];
  }

  return forms[2];
}
```

В `apps/api/src/status/indicator.ts` заменить тело `daysAgoOf` на `return \`${days} ${pluralOf(days, ['день', 'дня', 'дней'])}\`;` и убрать ручную арифметику.

- [ ] **Step 4: Прогнать оба набора**

Run: `cd apps/api && npx vitest run src/common/plural.test.ts src/status/indicator.test.ts`
Expected: PASS — 4 новых и 30 прежних тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/common/plural.ts apps/api/src/common/plural.test.ts apps/api/src/status/indicator.ts
git commit -m "Вынести склонение в общую утилиту"
```

### Task 12: Текст уведомления

**Files:**
- Create: `apps/api/src/push/notification-text.ts`
- Create: `apps/api/src/push/notification-text.test.ts`

- [ ] **Step 1: Написать падающий тест**

`apps/api/src/push/notification-text.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { IncidentEventKind, type IncidentEvent } from '../incidents/incidents.service';
import { notificationOf } from './notification-text';

const BASE: IncidentEvent = {
  kind: IncidentEventKind.Opened,
  domainId: '00000000-0000-0000-0000-000000000002',
  address: 'project.ru',
  projectId: '00000000-0000-0000-0000-000000000001',
  projectName: 'CAIRN',
  environmentName: 'прод',
  cause: 'HTTP 500',
  startedAt: new Date('2026-10-20T10:00:00Z'),
  resolvedAt: null,
};

describe('текст уведомления', () => {
  it('падение называет адрес в заголовке', () => {
    // Заголовок — единственное, что человек прочитает наверняка, и
    // чинить ему предстоит адрес, а не окружение.
    expect(notificationOf(BASE).title).toBe('project.ru не отвечает');
  });

  it('падение называет причину, проект и окружение', () => {
    expect(notificationOf(BASE).body).toBe('HTTP 500 · CAIRN · прод');
  });

  it('падение без причины не врёт о ней', () => {
    expect(notificationOf({ ...BASE, cause: null }).body).toBe('CAIRN · прод');
  });

  it('восстановление сообщает длительность', () => {
    const text = notificationOf({
      ...BASE,
      kind: IncidentEventKind.Resolved,
      resolvedAt: new Date('2026-10-20T10:40:00Z'),
    });

    expect(text.title).toBe('project.ru отвечает снова');
    expect(text.body).toBe('лежал 40 минут · CAIRN · прод');
  });

  it('длительность больше часа считается часами', () => {
    const text = notificationOf({
      ...BASE,
      kind: IncidentEventKind.Resolved,
      resolvedAt: new Date('2026-10-20T13:00:00Z'),
    });

    expect(text.body).toContain('лежал 3 часа');
  });

  it('падение короче минуты не превращается в ноль минут', () => {
    const text = notificationOf({
      ...BASE,
      kind: IncidentEventKind.Resolved,
      resolvedAt: new Date('2026-10-20T10:00:30Z'),
    });

    expect(text.body).toContain('меньше минуты');
  });

  it('метка равна адресу: новый пуш заменяет прежний', () => {
    // Иначе лоток забьётся повторами об одном и том же адресе.
    expect(notificationOf(BASE).tag).toBe(BASE.domainId);
  });

  it('ведёт на инфраструктуру проекта', () => {
    expect(notificationOf(BASE).url).toBe(
      `/projects/${BASE.projectId}/infrastructure`,
    );
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/push/notification-text.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Написать функцию**

`apps/api/src/push/notification-text.ts`:

```ts
import { pluralOf } from '../common/plural';
import { IncidentEventKind, type IncidentEvent } from '../incidents/incidents.service';

/** Готовое уведомление: то, что уходит в браузер нагрузкой. */
export interface NotificationText {
  title: string;
  body: string;
  /** Куда ведёт нажатие. */
  url: string;
  /** Метка замены в лотке. */
  tag: string;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Собирает текст уведомления по событию инцидента.
 *
 * Чистая функция без обращений к базе: текст — самое спорное место
 * уведомления, и его надо проверять таблицей случаев, а не глазами на
 * настоящем падении.
 */
export function notificationOf(event: IncidentEvent): NotificationText {
  const place = `${event.projectName} · ${event.environmentName}`;
  const isResolved = event.kind === IncidentEventKind.Resolved;

  const title = isResolved
    ? `${event.address} отвечает снова`
    : `${event.address} не отвечает`;

  const prefix = isResolved
    ? `лежал ${durationOf(event.startedAt, event.resolvedAt ?? event.startedAt)}`
    : event.cause;

  return {
    title,
    body: prefix ? `${prefix} · ${place}` : place,
    url: `/projects/${event.projectId}/infrastructure`,
    // Метка — адрес: новый пуш о том же адресе заменяет прежний, а не
    // ложится рядом с ним.
    tag: event.domainId,
  };
}

/** Длительность падения: минуты до часа, дальше часы. */
function durationOf(from: Date, to: Date): string {
  const elapsed = to.getTime() - from.getTime();

  if (elapsed < MINUTE_MS) {
    // Ноль минут выглядел бы ошибкой, а не коротким падением.
    return 'меньше минуты';
  }

  if (elapsed < HOUR_MS) {
    const minutes = Math.round(elapsed / MINUTE_MS);

    return `${minutes} ${pluralOf(minutes, ['минуту', 'минуты', 'минут'])}`;
  }

  const hours = Math.round(elapsed / HOUR_MS);

  return `${hours} ${pluralOf(hours, ['час', 'часа', 'часов'])}`;
}
```

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/push/notification-text.test.ts`
Expected: PASS, 8 тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/push/notification-text.ts apps/api/src/push/notification-text.test.ts
git commit -m "Собрать текст уведомления о падении чистой функцией"
```

### Task 13: Адресаты — субъекты с уровнем на секции

**Files:**
- Modify: `apps/api/src/access/access.service.ts`
- Modify: `apps/api/src/access/access.service.test.ts`

- [ ] **Step 1: Написать падающий тест**

В `apps/api/src/access/access.service.test.ts`:

```ts
describe('субъекты с уровнем на секции', () => {
  it('выдача на инфраструктуре попадает в список', async () => {
    await grant(contractorSubjectId, Section.Infrastructure, AccessLevel.Metadata);

    expect(
      await service.subjectsWithLevel(projectId, Section.Infrastructure, AccessLevel.Metadata),
    ).toContain(contractorSubjectId);
  });

  it('выдача на другой секции в список не попадает', async () => {
    await grant(contractorSubjectId, Section.Roadmap, AccessLevel.Write);

    expect(
      await service.subjectsWithLevel(projectId, Section.Infrastructure, AccessLevel.Metadata),
    ).not.toContain(contractorSubjectId);
  });

  it('суперадмин попадает без всякой выдачи', async () => {
    expect(
      await service.subjectsWithLevel(projectId, Section.Infrastructure, AccessLevel.Metadata),
    ).toContain(adminSubjectId);
  });

  it('отозванный субъект не попадает, даже будучи суперадмином', async () => {
    // Отзыв сильнее суперадминства — иначе отозвать администратора
    // было бы нечем.
    await revoke(adminSubjectId);

    expect(
      await service.subjectsWithLevel(projectId, Section.Infrastructure, AccessLevel.Metadata),
    ).not.toContain(adminSubjectId);
  });

  it('уровень ниже требуемого не попадает', async () => {
    await grant(contractorSubjectId, Section.Infrastructure, AccessLevel.Metadata);

    expect(
      await service.subjectsWithLevel(projectId, Section.Infrastructure, AccessLevel.Write),
    ).not.toContain(contractorSubjectId);
  });

  it('чужой проект своих подписчиков не отдаёт', async () => {
    await grant(contractorSubjectId, Section.Infrastructure, AccessLevel.Read);

    expect(
      await service.subjectsWithLevel(otherProjectId, Section.Infrastructure, AccessLevel.Metadata),
    ).not.toContain(contractorSubjectId);
  });
});
```

Вспомогательные `grant`, `revoke` и идентификаторы — по образцу соседних наборов файла.

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/access/access.service.test.ts`
Expected: FAIL — метода `subjectsWithLevel` нет

- [ ] **Step 3: Добавить метод**

В `apps/api/src/access/access.service.ts` после `levelsForProject`:

```ts
/**
 * Субъекты, которым секция проекта видна не ниже указанного уровня.
 *
 * Обратное направление к {@link levelsForProject}: тот отвечает «что видит
 * этот субъект», этот — «кто видит это». Нужен рассылке уведомлений, и
 * именно он делает ненужным второй список адресатов: право видеть статус
 * и есть право узнать о падении.
 *
 * Суперадмины попадают без выдачи, отозванные не попадают вовсе.
 */
async subjectsWithLevel(
  projectId: string,
  section: Section,
  minimum: AccessLevel,
  executor: Executor = this.db,
): Promise<string[]> {
  const allowed = Object.values(AccessLevel).filter(
    (level) => LEVEL_ORDER[level] >= LEVEL_ORDER[minimum],
  );

  const granted = await executor
    .selectDistinct({ subjectId: grants.subjectId })
    .from(grants)
    .innerJoin(subjects, eq(subjects.id, grants.subjectId))
    .where(
      and(
        eq(grants.projectId, projectId),
        eq(grants.section, section),
        inArray(grants.level, allowed),
        isNull(subjects.revokedAt),
      ),
    );

  const superadmins = await executor
    .select({ subjectId: users.subjectId })
    .from(users)
    .innerJoin(subjects, eq(subjects.id, users.subjectId))
    .where(and(eq(users.isSuperadmin, true), isNull(subjects.revokedAt)));

  return [
    ...new Set([
      ...granted.map((row) => row.subjectId),
      ...superadmins.map((row) => row.subjectId),
    ]),
  ];
}
```

Импорты: добавить `inArray`, `isNull` из `drizzle-orm` и `subjects`, `users` к импорту из `../db/schema`.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/access/access.service.test.ts`
Expected: PASS

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/access
git commit -m "Отвечать, кто видит секцию проекта"
```

### Task 14: Репозиторий подписок

**Files:**
- Create: `apps/api/src/push/push.repository.ts`
- Create: `apps/api/src/push/push.repository.test.ts`

- [ ] **Step 1: Написать падающий тест**

`apps/api/src/push/push.repository.test.ts` — интеграционный:

```ts
describe('репозиторий подписок', () => {
  it('заводит подписку субъекта', async () => {
    await repository.save(subjectId, SUBSCRIPTION);

    expect(await repository.forSubjects([subjectId])).toHaveLength(1);
  });

  it('повторная подписка тем же адресом обновляет ключи, а не плодит строку', async () => {
    // Браузер пересоздаёт подписку сам, когда служба меняет ключи.
    await repository.save(subjectId, SUBSCRIPTION);
    await repository.save(subjectId, { ...SUBSCRIPTION, p256dh: 'новый' });

    const stored = await repository.forSubjects([subjectId]);

    expect(stored).toHaveLength(1);
    expect(stored[0]?.p256dh).toBe('новый');
  });

  it('снимает только свою подписку', async () => {
    await repository.save(subjectId, SUBSCRIPTION);

    await repository.remove(otherSubjectId, SUBSCRIPTION.endpoint);

    expect(await repository.forSubjects([subjectId])).toHaveLength(1);
  });

  it('снимает свою подписку по адресу', async () => {
    await repository.save(subjectId, SUBSCRIPTION);

    await repository.remove(subjectId, SUBSCRIPTION.endpoint);

    expect(await repository.forSubjects([subjectId])).toHaveLength(0);
  });

  it('подписки чужих субъектов не отдаются', async () => {
    await repository.save(otherSubjectId, SUBSCRIPTION);

    expect(await repository.forSubjects([subjectId])).toHaveLength(0);
  });

  it('пустой список субъектов не превращается в выборку всех', async () => {
    // Иначе падение проекта без адресатов ушло бы всем подряд.
    await repository.save(subjectId, SUBSCRIPTION);

    expect(await repository.forSubjects([])).toHaveLength(0);
  });

  it('мёртвая подписка удаляется по идентификатору', async () => {
    await repository.save(subjectId, SUBSCRIPTION);
    const [stored] = await repository.forSubjects([subjectId]);

    await repository.drop(stored!.id);

    expect(await repository.forSubjects([subjectId])).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/push/push.repository.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Написать репозиторий**

`apps/api/src/push/push.repository.ts`:

```ts
import type { PushSubscribeRequest } from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { pushSubscriptions } from '../db/schema';

/** Подписка в том виде, в каком её берёт отправитель. */
export interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Хранилище подписок на пуши (дизайн уведомлений, раздел 3).
 *
 * Проверки прав здесь нет намеренно: подписка ничего не раскрывает, а что
 * именно по ней придёт, решает проверка в уведомителе — в момент отправки,
 * а не в момент подписки. Поэтому потеря доступа гасит пуши сама собой.
 */
@Injectable()
export class PushRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Заводит подписку либо обновляет ключи существующей. */
  async save(subjectId: string, input: PushSubscribeRequest): Promise<void> {
    await this.db
      .insert(pushSubscriptions)
      .values({ subjectId, ...input })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        // Владелец тоже обновляется: устройство могли передать другому
        // человеку, и адресатом должен стать он.
        set: { subjectId, p256dh: input.p256dh, auth: input.auth },
      });
  }

  /** Снимает свою подписку. Чужую снять нельзя. */
  async remove(subjectId: string, endpoint: string): Promise<void> {
    await this.db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.subjectId, subjectId),
          eq(pushSubscriptions.endpoint, endpoint),
        ),
      );
  }

  /** Подписки перечисленных субъектов. Пустой список — пустой ответ. */
  async forSubjects(subjectIds: string[]): Promise<StoredSubscription[]> {
    if (subjectIds.length === 0) {
      // `inArray` с пустым списком — отдельная ловушка: без этой проверки
      // падение проекта без адресатов ушло бы всем подряд.
      return [];
    }

    return this.db
      .select({
        id: pushSubscriptions.id,
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.subjectId, subjectIds));
  }

  /** Удаляет мёртвую подписку: push-служба ответила «такой нет». */
  async drop(id: string): Promise<void> {
    await this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
  }
}
```

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/push/push.repository.test.ts`
Expected: PASS, 7 тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/push/push.repository.ts apps/api/src/push/push.repository.test.ts
git commit -m "Завести репозиторий подписок на пуши"
```

### Task 15: Транспорт и разбор отказов

**Files:**
- Create: `apps/api/src/push/push.sender.ts`
- Create: `apps/api/src/push/push.sender.test.ts`
- Modify: `apps/api/package.json` (`web-push`, `@types/web-push`)

- [ ] **Step 1: Поставить зависимость**

Run: `cd apps/api && pnpm add web-push && pnpm add -D @types/web-push`
Expected: обе строки в `apps/api/package.json`, lock обновлён

- [ ] **Step 2: Написать падающий тест**

`apps/api/src/push/push.sender.test.ts` — юнит, подделкой транспорта:

```ts
import { describe, expect, it, vi } from 'vitest';

import { PushSender, SendOutcome, type PushTransport } from './push.sender';

const SUBSCRIPTION = { id: 'п1', endpoint: 'https://push/1', p256dh: 'к', auth: 'с' };

/** Отказ push-службы с кодом, как его отдаёт web-push. */
function failure(statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(`отказ ${statusCode}`), { statusCode });
}

describe('отправитель пушей', () => {
  it('доставленная нагрузка — доставлена', async () => {
    const transport: PushTransport = vi.fn().mockResolvedValue(undefined);

    expect(await new PushSender(transport).send(SUBSCRIPTION, '{}')).toBe(SendOutcome.Delivered);
  });

  it('передаёт ключи подписки транспорту', async () => {
    const transport: PushTransport = vi.fn().mockResolvedValue(undefined);

    await new PushSender(transport).send(SUBSCRIPTION, '{"a":1}');

    expect(transport).toHaveBeenCalledWith(
      { endpoint: 'https://push/1', keys: { p256dh: 'к', auth: 'с' } },
      '{"a":1}',
    );
  });

  it('404 и 410 означают мёртвую подписку', async () => {
    for (const code of [404, 410]) {
      const transport: PushTransport = vi.fn().mockRejectedValue(failure(code));

      expect(await new PushSender(transport).send(SUBSCRIPTION, '{}')).toBe(SendOutcome.Gone);
    }
  });

  it('прочий отказ подписку не убивает', async () => {
    // 429 и 5xx — беда службы, а не устройства: удалить подписку
    // значило бы потерять адресата из-за чужой перегрузки.
    const transport: PushTransport = vi.fn().mockRejectedValue(failure(503));

    expect(await new PushSender(transport).send(SUBSCRIPTION, '{}')).toBe(SendOutcome.Failed);
  });

  it('отказ без кода — тоже просто отказ', async () => {
    const transport: PushTransport = vi.fn().mockRejectedValue(new Error('сеть'));

    expect(await new PushSender(transport).send(SUBSCRIPTION, '{}')).toBe(SendOutcome.Failed);
  });

  it('выключенные уведомления не отправляют ничего', async () => {
    expect(await new PushSender(null).send(SUBSCRIPTION, '{}')).toBe(SendOutcome.Disabled);
  });
});
```

- [ ] **Step 3: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/push/push.sender.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 4: Написать отправитель**

`apps/api/src/push/push.sender.ts`:

```ts
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import webpush from 'web-push';

import type { StoredSubscription } from './push.repository';

/** Цель отправки в том виде, в каком её ждёт push-служба. */
export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Отправка одной нагрузки; в тестах подменяется подделкой. */
export type PushTransport = (target: PushTarget, payload: string) => Promise<void>;

/** Токен внедрения транспорта. `null` — уведомления выключены. */
export const PUSH_TRANSPORT = Symbol('PUSH_TRANSPORT');

/** Итог отправки: что делать с подпиской дальше. */
export enum SendOutcome {
  Delivered = 'delivered',
  /** Подписки больше нет: устройство отозвало её. */
  Gone = 'gone',
  /** Беда службы, а не устройства: подписку не трогать. */
  Failed = 'failed',
  /** Ключи не заданы: отправлять нечем. */
  Disabled = 'disabled',
}

/** Коды, означающие, что подписки больше не существует. */
const GONE_CODES = [404, 410];

/**
 * Боевой транспорт на `web-push`.
 *
 * `null`, когда ключи не заданы: уведомления выключаются целиком, как
 * прогон проверок при `CAIRN_STATUS_CHECK_INTERVAL_MINUTES=0`. Отдельного
 * флага «включить уведомления» нет — наличие ключей и есть флаг.
 */
export function realTransport(): PushTransport | null {
  const publicKey = process.env.CAIRN_VAPID_PUBLIC_KEY;
  const privateKey = process.env.CAIRN_VAPID_PRIVATE_KEY;
  const subject = process.env.CAIRN_VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    return null;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  return async (target, payload) => {
    await webpush.sendNotification(target, payload);
  };
}

/**
 * Отправка пуша по одной подписке.
 *
 * Не знает ни о правах, ни об инцидентах: умеет послать и разобрать
 * отказ. Поэтому второй канал — это второй отправитель, и ничего больше.
 */
@Injectable()
export class PushSender {
  private readonly logger = new Logger(PushSender.name);

  constructor(@Optional() @Inject(PUSH_TRANSPORT) private readonly transport: PushTransport | null) {}

  /** Посылает нагрузку и говорит, что делать с подпиской. */
  async send(subscription: StoredSubscription, payload: string): Promise<SendOutcome> {
    if (!this.transport) {
      return SendOutcome.Disabled;
    }

    try {
      await this.transport(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
      );

      return SendOutcome.Delivered;
    } catch (cause) {
      const statusCode = (cause as { statusCode?: number }).statusCode;

      if (statusCode !== undefined && GONE_CODES.includes(statusCode)) {
        return SendOutcome.Gone;
      }

      // Адрес службы в лог не пишется: им владеют как ключом.
      this.logger.warn(`Пуш не доставлен: ${statusCode ?? 'без кода'}`);

      return SendOutcome.Failed;
    }
  }
}
```

- [ ] **Step 5: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/push/push.sender.test.ts`
Expected: PASS, 6 тестов

- [ ] **Step 6: Коммит**

```bash
git add apps/api/src/push/push.sender.ts apps/api/src/push/push.sender.test.ts apps/api/package.json pnpm-lock.yaml
git commit -m "Отправлять пуши и разбирать отказы службы"
```

### Task 16: Уведомитель

**Files:**
- Create: `apps/api/src/push/push.notifier.ts`
- Create: `apps/api/src/push/push.notifier.test.ts`

- [ ] **Step 1: Написать падающий тест**

`apps/api/src/push/push.notifier.test.ts` — интеграционный: нужны настоящие выдачи и подписки, подделка только у транспорта.

```ts
describe('уведомитель', () => {
  it('падение уходит подписчику с доступом к инфраструктуре', async () => {
    await grant(contractorSubjectId, Section.Infrastructure, AccessLevel.Metadata);
    await push.save(contractorSubjectId, SUBSCRIPTION);

    await notifier.notify([openedEvent()]);

    expect(transport).toHaveBeenCalledTimes(1);
    expect(JSON.parse(transport.mock.calls[0]![1]).title).toContain('не отвечает');
  });

  it('подписчик без доступа к проекту не получает ничего', async () => {
    await push.save(contractorSubjectId, SUBSCRIPTION);

    await notifier.notify([openedEvent()]);

    expect(transport).not.toHaveBeenCalled();
  });

  it('мёртвая подписка удаляется', async () => {
    await grant(contractorSubjectId, Section.Infrastructure, AccessLevel.Metadata);
    await push.save(contractorSubjectId, SUBSCRIPTION);
    transport.mockRejectedValue(Object.assign(new Error('нет'), { statusCode: 410 }));

    await notifier.notify([openedEvent()]);

    expect(await push.forSubjects([contractorSubjectId])).toHaveLength(0);
  });

  it('отказ службы подписку оставляет', async () => {
    await grant(contractorSubjectId, Section.Infrastructure, AccessLevel.Metadata);
    await push.save(contractorSubjectId, SUBSCRIPTION);
    transport.mockRejectedValue(Object.assign(new Error('занято'), { statusCode: 503 }));

    await notifier.notify([openedEvent()]);

    expect(await push.forSubjects([contractorSubjectId])).toHaveLength(1);
  });

  it('отказ одной подписки не мешает второй', async () => {
    await grant(contractorSubjectId, Section.Infrastructure, AccessLevel.Metadata);
    await push.save(contractorSubjectId, SUBSCRIPTION);
    await push.save(adminSubjectId, { ...SUBSCRIPTION, endpoint: 'https://push/2' });
    transport.mockRejectedValueOnce(new Error('первая не вышла'));

    await notifier.notify([openedEvent()]);

    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('два события дают два пуша', async () => {
    await push.save(adminSubjectId, SUBSCRIPTION);

    await notifier.notify([openedEvent(), resolvedEvent()]);

    expect(transport).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/push/push.notifier.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Написать уведомитель**

`apps/api/src/push/push.notifier.ts`:

```ts
import { AccessLevel, Section } from '@cairn/shared';
import { Injectable, Logger } from '@nestjs/common';

import { AccessService } from '../access/access.service';
import type { IncidentEvent } from '../incidents/incidents.service';
import { notificationOf } from './notification-text';
import { PushRepository } from './push.repository';
import { PushSender, SendOutcome } from './push.sender';

/**
 * Рассылка уведомлений об инцидентах (дизайн уведомлений, раздел 7).
 *
 * О проверках не знает ничего — только о событиях. Адресаты считаются в
 * момент отправки по выдачам: отдельного списка подписчиков на проект нет
 * намеренно, иначе он разошёлся бы с правами в первый же месяц.
 */
@Injectable()
export class PushNotifier {
  private readonly logger = new Logger(PushNotifier.name);

  constructor(
    private readonly access: AccessService,
    private readonly subscriptions: PushRepository,
    private readonly sender: PushSender,
  ) {}

  /** Рассылает события тем, кому виден статус их проекта. */
  async notify(events: IncidentEvent[]): Promise<void> {
    for (const event of events) {
      try {
        await this.notifyOne(event);
      } catch (cause) {
        // Падение рассылки по одному событию не должно съедать остальные.
        this.logger.warn(`Уведомление об адресе ${event.address} не ушло: ${cause}`);
      }
    }
  }

  /** Одно событие: адресаты, нагрузка, отправка, уборка мёртвых подписок. */
  private async notifyOne(event: IncidentEvent): Promise<void> {
    const subjectIds = await this.access.subjectsWithLevel(
      event.projectId,
      Section.Infrastructure,
      AccessLevel.Metadata,
    );
    const targets = await this.subscriptions.forSubjects(subjectIds);

    if (targets.length === 0) {
      return;
    }

    const payload = JSON.stringify(notificationOf(event));

    for (const target of targets) {
      try {
        const outcome = await this.sender.send(target, payload);

        if (outcome === SendOutcome.Gone) {
          await this.subscriptions.drop(target.id);
        }
      } catch (cause) {
        // Отказ одной подписки не мешает остальным.
        this.logger.warn(`Подписка не обслужена: ${cause}`);
      }
    }
  }
}
```

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/push/push.notifier.test.ts`
Expected: PASS, 6 тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/push/push.notifier.ts apps/api/src/push/push.notifier.test.ts
git commit -m "Рассылать уведомления об инцидентах по правам"
```

---

## Чанк 4: Ручки, журнал, ключи

### Task 17: Модули инцидентов и пушей, ручка инцидентов

**Files:**
- Create: `apps/api/src/incidents/incidents.controller.ts`
- Create: `apps/api/src/incidents/incidents.module.ts`
- Create: `apps/api/src/incidents/incidents.controller.test.ts`
- Create: `apps/api/src/push/push.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/status/status.module.ts`
- Modify: `apps/api/src/app.module.test.ts`

- [ ] **Step 1: Написать падающий тест**

В `apps/api/src/app.module.test.ts` — по образцу существующих проверок состава:

```ts
it('инциденты и пуши зарегистрированы', async () => {
  const { AppModule } = await import('./app.module');
  const imports = Reflect.getMetadata('imports', AppModule) as unknown[];

  expect(imports.map((module) => (module as { name: string }).name)).toEqual(
    expect.arrayContaining(['IncidentsModule', 'PushModule']),
  );
});
```

`apps/api/src/incidents/incidents.controller.test.ts` — по образцу существующих тестов контроллеров (если таких в проекте нет, этот шаг покрывается тестом репозитория, и контроллер проверяется сквозным `scripts/e2e.mjs`; тогда шаг пропустить и отметить это в коммите).

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/app.module.test.ts`
Expected: FAIL — модулей нет в списке

- [ ] **Step 3: Написать контроллер и модули**

`apps/api/src/incidents/incidents.controller.ts`:

```ts
import type { ProjectIncidents } from '@cairn/shared';
import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { IncidentsRepository } from './incidents.repository';

/** История падений адресов: часть секции «Инфраструктура» (ТЗ 4.3). */
@Controller('projects/:projectId/incidents')
@UseGuards(SessionGuard)
export class IncidentsController {
  constructor(private readonly incidents: IncidentsRepository) {}

  /** Инциденты адресов проекта. Уровень — метаданные инфраструктуры. */
  @Get()
  async list(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<ProjectIncidents> {
    return this.incidents.forProject(subject, projectId);
  }
}
```

`apps/api/src/incidents/incidents.module.ts`:

```ts
import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { IncidentsController } from './incidents.controller';
import { IncidentsRepository } from './incidents.repository';
import { IncidentsService } from './incidents.service';

/** Модуль инцидентов адресов. */
@Module({
  imports: [DbModule, AccessModule, AuthModule],
  controllers: [IncidentsController],
  providers: [IncidentsRepository, IncidentsService],
  exports: [IncidentsRepository, IncidentsService],
})
export class IncidentsModule {}
```

`apps/api/src/push/push.module.ts`:

```ts
import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { PushController } from './push.controller';
import { PushNotifier } from './push.notifier';
import { PushRepository } from './push.repository';
import { PushSender, PUSH_TRANSPORT, realTransport } from './push.sender';
import { PushService } from './push.service';

/** Модуль веб-пушей. */
@Module({
  imports: [DbModule, AccessModule, AuditModule, AuthModule],
  controllers: [PushController],
  providers: [
    PushRepository,
    PushSender,
    PushNotifier,
    PushService,
    // Транспорт собирается один раз при старте: ключи читаются оттуда же,
    // откуда интервал прогона, и меняются перезапуском.
    { provide: PUSH_TRANSPORT, useFactory: realTransport },
  ],
  exports: [PushNotifier],
})
export class PushModule {}
```

В `app.module.ts` добавить `IncidentsModule` и `PushModule` в импорты (после `StatusModule`). В `status.module.ts` добавить их же в `imports` и снять `@Optional()` с `PushNotifier` в конструкторе прогона, если он был поставлен в Task 10.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/app.module.test.ts`
Expected: PASS

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/incidents apps/api/src/push apps/api/src/app.module.ts apps/api/src/app.module.test.ts apps/api/src/status/status.module.ts
git commit -m "Подключить модули инцидентов и пушей"
```

### Task 18: Ручки подписки и журнал

**Files:**
- Create: `apps/api/src/push/push.controller.ts`
- Create: `apps/api/src/push/push.service.ts`
- Create: `apps/api/src/push/push.service.test.ts`
- Modify: `apps/api/src/audit/audit.types.ts`

- [ ] **Step 1: Написать падающий тест**

`apps/api/src/push/push.service.test.ts` — интеграционный:

```ts
describe('служба подписок', () => {
  it('подписка пишется в журнал', async () => {
    // По образцу totp.enabled: канал несёт имена проектов и адреса,
    // и суперадмину стоит видеть, что устройство его получило.
    await service.subscribe(userSubject, SUBSCRIPTION);

    const [entry] = await testDb.rowsOf(auditLog);

    expect(entry?.action).toBe(AuditAction.PushSubscribed);
  });

  it('адрес службы в журнал не попадает', async () => {
    // Им владеют как ключом: попав в журнал, он стал бы доступен всем,
    // кто журнал читает.
    await service.subscribe(userSubject, SUBSCRIPTION);

    const [entry] = await testDb.rowsOf(auditLog);

    expect(JSON.stringify(entry?.metadata ?? {})).not.toContain(SUBSCRIPTION.endpoint);
  });

  it('снятие подписки тоже пишется в журнал', async () => {
    await service.subscribe(userSubject, SUBSCRIPTION);
    await service.unsubscribe(userSubject, SUBSCRIPTION.endpoint);

    const actions = (await testDb.rowsOf(auditLog)).map((entry) => entry.action);

    expect(actions).toContain(AuditAction.PushUnsubscribed);
  });

  it('токен агента подписаться не может', async () => {
    // Браузера у него нет, а субъект в таблице подписок — есть,
    // и без проверки вида там завелась бы бессмысленная строка.
    await expect(service.subscribe(agentSubject, SUBSCRIPTION)).rejects.toThrow();
  });

  it('публичный ключ отдаётся как есть', async () => {
    process.env.CAIRN_VAPID_PUBLIC_KEY = 'ключ';

    expect(service.publicKey()).toEqual({ publicKey: 'ключ' });
  });

  it('без ключа уведомления объявлены выключенными', async () => {
    delete process.env.CAIRN_VAPID_PUBLIC_KEY;

    expect(service.publicKey()).toEqual({ publicKey: null });
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/push/push.service.test.ts`
Expected: FAIL — модуля нет, значений журнала нет

- [ ] **Step 3: Написать службу, контроллер и значения журнала**

В `apps/api/src/audit/audit.types.ts` в `AuditAction` добавить рядом с `TotpEnabled`:

```ts
  PushSubscribed = 'push.subscribed',
  PushUnsubscribed = 'push.unsubscribed',
```

`apps/api/src/push/push.service.ts`:

```ts
import {
  AuditSubjectKind,
  SubjectKind,
  type PushKeyResponse,
  type PushSubscribeRequest,
} from '@cairn/shared';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { PushRepository } from './push.repository';

/**
 * Подписки устройств: заведение, снятие, публичный ключ.
 *
 * Уровень доступа к проектам здесь не проверяется: подписка ничего не
 * раскрывает, а что по ней придёт, решает уведомитель в момент отправки.
 * Проверяется вид субъекта — у токена агента и приёмного адреса браузера
 * нет, и строка подписки у них была бы мёртвой.
 */
@Injectable()
export class PushService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly subscriptions: PushRepository,
    private readonly audit: AuditService,
  ) {}

  /** Публичный VAPID-ключ. `null` — уведомления выключены. */
  publicKey(): PushKeyResponse {
    return { publicKey: process.env.CAIRN_VAPID_PUBLIC_KEY ?? null };
  }

  /** Заводит подписку устройства и пишет действие в журнал. */
  async subscribe(subject: RequestSubject, input: PushSubscribeRequest): Promise<void> {
    requireHuman(subject);

    await this.db.transaction(async (tx) => {
      await this.subscriptions.save(subject.id, input);
      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.PushSubscribed,
        entityType: 'push_subscription',
      });
    });
  }

  /** Снимает подписку устройства и пишет действие в журнал. */
  async unsubscribe(subject: RequestSubject, endpoint: string): Promise<void> {
    requireHuman(subject);

    await this.db.transaction(async (tx) => {
      await this.subscriptions.remove(subject.id, endpoint);
      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.PushUnsubscribed,
        entityType: 'push_subscription',
      });
    });
  }
}

/** Пускает к подпискам только человека. */
function requireHuman(subject: RequestSubject): void {
  if (subject.kind !== SubjectKind.User) {
    throw new ForbiddenException('Подписка на уведомления — только для людей');
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

**Важно:** `PushRepository` пишет через `this.db`, а не через переданную транзакцию. Чтобы журнал и подписка легли одной транзакцией (инвариант журнала), добавь в `save` и `remove` необязательный параметр `executor: Executor = this.db` — так же, как это сделано в `AccessService`, — и передавай `tx` из службы. Без этого тест на журнал пройдёт, но инвариант «запись в журнал в той же транзакции» будет нарушен.

`apps/api/src/push/push.controller.ts`:

```ts
import {
  pushSubscribeSchema,
  pushUnsubscribeSchema,
  type PushKeyResponse,
  type PushSubscribeRequest,
  type PushUnsubscribeRequest,
} from '@cairn/shared';
import { Body, Controller, Delete, Get, HttpCode, Post, UseGuards } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PushService } from './push.service';

/** Веб-пуши: публичный ключ и подписки устройств. */
@Controller('push')
@UseGuards(SessionGuard)
export class PushController {
  constructor(private readonly push: PushService) {}

  /** Публичный VAPID-ключ. Ручкой, а не вшитым в сборку значением. */
  @Get('key')
  key(): PushKeyResponse {
    return this.push.publicKey();
  }

  /** Заводит подписку этого устройства. */
  @Post('subscriptions')
  @HttpCode(204)
  async subscribe(
    @CurrentSubject() subject: RequestSubject,
    @Body(new ZodValidationPipe(pushSubscribeSchema)) body: PushSubscribeRequest,
  ): Promise<void> {
    await this.push.subscribe(subject, body);
  }

  /** Снимает подписку этого устройства. Адрес в теле, не в URL. */
  @Delete('subscriptions')
  @HttpCode(204)
  async unsubscribe(
    @CurrentSubject() subject: RequestSubject,
    @Body(new ZodValidationPipe(pushUnsubscribeSchema)) body: PushUnsubscribeRequest,
  ): Promise<void> {
    await this.push.unsubscribe(subject, body.endpoint);
  }
}
```

Точное имя и способ применения `ZodValidationPipe` взять из любого существующего контроллера с телом запроса — например `apps/api/src/environments/environments.controller.ts`.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/push/push.service.test.ts`
Expected: PASS, 6 тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/push apps/api/src/audit/audit.types.ts
git commit -m "Завести ручки подписки на пуши и след в журнале"
```

### Task 19: Генерация VAPID-ключей командой консоли

**Files:**
- Modify: `apps/api/src/cli/main.ts`
- Create: `apps/api/src/cli/vapid.ts`
- Create: `apps/api/src/cli/vapid.test.ts`

**Осторожно:** `main.ts` сейчас требует второй аргумент (`email`) для любой команды и падает без него. Генерация ключей аргументов не принимает — проверку `!email` надо перенести в те ветви, которым почта нужна.

- [ ] **Step 1: Написать падающий тест**

`apps/api/src/cli/vapid.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { formatVapidKeys, generateVapidKeys } from './vapid';

describe('генерация ключей VAPID', () => {
  it('отдаёт пару непустых ключей', () => {
    const keys = generateVapidKeys();

    expect(keys.publicKey.length).toBeGreaterThan(0);
    expect(keys.privateKey.length).toBeGreaterThan(0);
  });

  it('каждый вызов даёт новую пару', () => {
    expect(generateVapidKeys().privateKey).not.toBe(generateVapidKeys().privateKey);
  });

  it('печатает готовые строки окружения', () => {
    const text = formatVapidKeys({ publicKey: 'откр', privateKey: 'закр' });

    expect(text).toContain('CAIRN_VAPID_PUBLIC_KEY=откр');
    expect(text).toContain('CAIRN_VAPID_PRIVATE_KEY=закр');
  });

  it('напоминает про третью переменную', () => {
    // Без CAIRN_VAPID_SUBJECT транспорт не соберётся, и уведомления
    // молча не заработают.
    expect(formatVapidKeys({ publicKey: 'о', privateKey: 'з' })).toContain(
      'CAIRN_VAPID_SUBJECT',
    );
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/cli/vapid.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Написать модуль и ветвь команды**

`apps/api/src/cli/vapid.ts`:

```ts
import webpush from 'web-push';

/** Пара ключей VAPID. */
export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/**
 * Генерирует пару ключей для подписи пушей.
 *
 * Своей командой, а не сторонним инструментом: ключи нужны один раз при
 * развёртывании, и отправлять человека за ними в чужой пакет значило бы
 * сделать обязательный шаг развёртывания необязательно сложным.
 */
export function generateVapidKeys(): VapidKeys {
  return webpush.generateVAPIDKeys();
}

/** Печатает пару готовыми строками окружения. */
export function formatVapidKeys(keys: VapidKeys): string {
  return [
    'Ключи уведомлений. Приватный — секрет: храни вне базы, рядом с ключом шифрования.',
    '',
    `CAIRN_VAPID_PUBLIC_KEY=${keys.publicKey}`,
    `CAIRN_VAPID_PRIVATE_KEY=${keys.privateKey}`,
    'CAIRN_VAPID_SUBJECT=mailto:admin@example.com',
    '',
    'Без всех трёх переменных уведомления выключены.',
    '',
  ].join('\n');
}
```

В `apps/api/src/cli/main.ts`:

- заменить `if (!command || !email)` на `if (!command)`;
- до создания контекста Nest добавить ветвь, которой контекст не нужен:

```ts
  if (command === 'generate-vapid-keys') {
    writeSync(1, formatVapidKeys(generateVapidKeys()));
    process.exit(0);
  }

  if (!email) {
    writeSync(2, USAGE);
    process.exit(1);
  }
```

- дописать команду в `USAGE`.

- [ ] **Step 4: Прогнать и проверить команду вживую**

Run: `cd apps/api && npx vitest run src/cli/vapid.test.ts`
Expected: PASS, 4 теста

Run: `cd apps/api && pnpm cli generate-vapid-keys`
Expected: три строки `CAIRN_VAPID_*` в выводе

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/cli
git commit -m "Генерировать ключи уведомлений командой консоли"
```

---

## Чанк 5: Веб

### Task 20: Service worker

**Files:**
- Create: `apps/web/public/sw.js`

Каталога `public` в проекте пока нет — он появляется здесь. Next.js отдаёт его содержимое с корня, и `/sw.js` получает область видимости `/`, которая нужна подписке.

Тестом это не покрывается: файл исполняется браузером, а не сборкой, и проверяется вживую (шаг 3). Это единственный непокрытый файл правки, и так и должно быть — логики в нём нет.

- [ ] **Step 1: Написать файл**

`apps/web/public/sw.js`:

```js
// Service worker уведомлений CAIRN.
//
// Собирать его компонентом нельзя: браузер требует отдельный файл в
// корневой области видимости. Логики здесь нет намеренно — всё, что
// можно решить на сервере, решено там: заголовок, текст, адрес перехода
// и метка замены приходят готовыми.

self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }

  const payload = event.data.json();

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      // Метка равна адресу: новый пуш о том же адресе заменяет прежний,
      // а не копится рядом с ним.
      tag: payload.tag,
      data: { url: payload.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data && event.notification.data.url;

  if (!url) {
    return;
  }

  // Уже открытое окно приложения переиспользуется: второй таб CAIRN
  // человеку не нужен.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }

      return self.clients.openWindow(url);
    }),
  );
});
```

- [ ] **Step 2: Проверить, что файл отдаётся**

Run: `cd apps/web && pnpm dev` (в отдельном терминале), затем `curl -s http://localhost:3000/sw.js | head -3`
Expected: первые строки комментария

- [ ] **Step 3: Коммит**

```bash
git add apps/web/public/sw.js
git commit -m "Завести service worker уведомлений"
```

### Task 21: Хуки подписки

**Files:**
- Create: `apps/web/src/api/hooks/usePush.ts`
- Create: `apps/web/src/api/hooks/useQueryIncidents.ts`
- Modify: `apps/web/src/api/hooks/index.ts`

- [ ] **Step 1: Написать хуки**

`apps/web/src/api/hooks/usePush.ts`:

```ts
'use client';

import type { PushKeyResponse, PushSubscribeRequest } from '@cairn/shared';
import { useMutation, useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';

/** Ключи кэша пушей. */
export const PUSH_KEYS = {
  publicKey: ['push', 'key'] as const,
};

/**
 * Публичный VAPID-ключ. `null` означает, что уведомления выключены на
 * сервере, и кнопку показывать незачем.
 */
export function useQueryPushKey() {
  return useQuery({
    queryKey: PUSH_KEYS.publicKey,
    queryFn: () => apiClient<PushKeyResponse>('/push/key'),
  });
}

/** Заводит подписку этого устройства. */
export function useMutationPushSubscribe() {
  return useMutation({
    mutationFn: (body: PushSubscribeRequest) =>
      apiClient('/push/subscriptions', { method: 'POST', body }),
  });
}

/** Снимает подписку этого устройства. */
export function useMutationPushUnsubscribe() {
  return useMutation({
    mutationFn: (endpoint: string) =>
      apiClient('/push/subscriptions', { method: 'DELETE', body: { endpoint } }),
  });
}
```

`apps/web/src/api/hooks/useQueryIncidents.ts`:

```ts
'use client';

import type { ProjectIncidents } from '@cairn/shared';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';
import { ApiError } from '../errors';

/** Ключи кэша инцидентов. */
export const INCIDENT_KEYS = {
  forProject: (projectId: string) => ['incidents', projectId] as const,
};

/**
 * Инциденты адресов проекта.
 *
 * Отсутствие доступа к инфраструктуре — обычное состояние экрана, а не
 * ошибка загрузки: превращается в пустой список, как и статус.
 */
export function useQueryIncidents(projectId: string) {
  return useQuery({
    queryKey: INCIDENT_KEYS.forProject(projectId),
    retry: false,
    queryFn: async (): Promise<ProjectIncidents> => {
      try {
        return await apiClient<ProjectIncidents>(`/projects/${projectId}/incidents`);
      } catch (cause) {
        if (cause instanceof ApiError && (cause.status === 404 || cause.status === 403)) {
          return [];
        }

        throw cause;
      }
    },
  });
}
```

Точную подпись `apiClient` (как передаётся тело и метод) взять из `apps/web/src/api/hooks/useMutationEnvironment.ts`. Добавить оба файла в `apps/web/src/api/hooks/index.ts`.

- [ ] **Step 2: Проверить типы**

Run: `pnpm typecheck`
Expected: без ошибок

- [ ] **Step 3: Коммит**

```bash
git add apps/web/src/api/hooks
git commit -m "Завести хуки подписки на пуши и инцидентов"
```

### Task 22: Кнопка подписки

**Files:**
- Create: `apps/web/src/components/PushToggle/PushToggle.tsx`
- Create: `apps/web/src/components/PushToggle/types.ts`
- Create: `apps/web/src/components/PushToggle/constants.ts`
- Create: `apps/web/src/components/PushToggle/index.ts`
- Create: `apps/web/src/components/PushToggle/PushToggle.test.tsx`
- Create: `apps/web/src/components/PushToggle/utils.ts`

Компонент до 100 строк: работа с `navigator.serviceWorker` и `PushManager` уходит в `utils.ts`, чтобы в самом компоненте остались только состояния.

- [ ] **Step 1: Написать падающий тест**

`apps/web/src/components/PushToggle/PushToggle.test.tsx` — рендер с подделками браузерных API:

```ts
describe('кнопка уведомлений', () => {
  it('без Push API не рисует ничего', () => {
    // Браузер без поддержки — не повод показывать кнопку, которая
    // ничего не сделает.
    renderWithout('PushManager');

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('без ключа на сервере не рисует ничего', () => {
    render(<PushToggle publicKey={null} permission="default" subscribed={false} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('предлагает включить, когда разрешение не спрашивали', () => {
    render(<PushToggle publicKey="к" permission="default" subscribed={false} />);

    expect(screen.getByRole('button')).toHaveTextContent('Уведомлять на этом устройстве');
  });

  it('предлагает выключить, когда подписка есть', () => {
    render(<PushToggle publicKey="к" permission="granted" subscribed />);

    expect(screen.getByRole('button')).toHaveTextContent('выключить');
  });

  it('при запрете объясняет, а не предлагает повтор', () => {
    // Отказ браузер помнит намертво: кнопка, которая ничего не делает,
    // хуже её отсутствия.
    render(<PushToggle publicKey="к" permission="denied" subscribed={false} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/настройках браузера/)).toBeInTheDocument();
  });

  it('нажатие зовёт подписку', async () => {
    const onSubscribe = vi.fn();

    render(
      <PushToggle publicKey="к" permission="default" subscribed={false} onSubscribe={onSubscribe} />,
    );
    await userEvent.click(screen.getByRole('button'));

    expect(onSubscribe).toHaveBeenCalled();
  });
});
```

Точные имена пропсов и способ подделки браузерных API подогнать под то, как устроены соседние тесты (`apps/web/src/components/TotpSetup/TotpSetup.test.tsx` — ближайший по духу). Состояния лучше передавать пропсами, а обращения к `navigator` держать в контейнере на экране: тогда компонент остаётся чистым и проверяется без моков глобалей.

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/web && npx vitest run src/components/PushToggle`
Expected: FAIL — компонента нет

- [ ] **Step 3: Написать компонент, типы, тексты и утилиты**

`constants.ts` — все тексты кнопки (`UPPER_SNAKE_CASE`), включая объяснение при запрете: «Уведомления запрещены. Разрешение возвращают в настройках браузера.»

`utils.ts` — три функции без React: `isPushSupported()`, `subscribeDevice(publicKey)` (регистрация `/sw.js`, `pushManager.subscribe` с `applicationServerKey`, разбор `toJSON()` в `{ endpoint, p256dh, auth }`), `unsubscribeDevice()`. Преобразование base64url-ключа в `Uint8Array` — тоже здесь, отдельной функцией с тестом.

`PushToggle.tsx` — только состояния и вызовы коллбэков, без обращений к `navigator`.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/web && npx vitest run src/components/PushToggle`
Expected: PASS

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/PushToggle
git commit -m "Завести кнопку подписки на уведомления"
```

### Task 23: Кнопка на сводке

**Files:**
- Create: `apps/web/src/app/(app)/PushTogglePanel.tsx`
- Modify: `apps/web/src/app/(app)/page.tsx`

Контейнер клиентский: он и трогает `navigator`, `Notification.permission` и `pushManager.getSubscription()`, а сама сводка остаётся серверным компонентом.

- [ ] **Step 1: Написать контейнер**

`PushTogglePanel.tsx` — `'use client'`, читает ключ хуком `useQueryPushKey`, определяет текущее разрешение и наличие подписки в `useEffect`, зовёт `subscribeDevice`/`unsubscribeDevice` и мутации, отдаёт `PushToggle` пропсами.

- [ ] **Step 2: Встроить в сводку**

В `apps/web/src/app/(app)/page.tsx` — над панелями предупреждений, рядом с заголовком:

```tsx
<div className="flex items-center justify-between gap-3">
  <h1 className="text-2xl font-semibold">Проекты</h1>
  <PushTogglePanel />
</div>
```

- [ ] **Step 3: Проверить вживую**

Run: `cd apps/web && pnpm dev`, открыть `http://localhost:3000/`
Expected: кнопка «Уведомлять на этом устройстве» видна, если на сервере заданы ключи; нажатие спрашивает разрешение браузера; после согласия подпись меняется на «Уведомления включены · выключить»

- [ ] **Step 4: Коммит**

```bash
git add "apps/web/src/app/(app)/PushTogglePanel.tsx" "apps/web/src/app/(app)/page.tsx"
git commit -m "Поставить кнопку уведомлений на сводку"
```

### Task 24: История падений у адреса

**Files:**
- Create: `apps/web/src/components/AddressIncidents/AddressIncidents.tsx`
- Create: `apps/web/src/components/AddressIncidents/types.ts`
- Create: `apps/web/src/components/AddressIncidents/utils.ts`
- Create: `apps/web/src/components/AddressIncidents/index.ts`
- Create: `apps/web/src/components/AddressIncidents/AddressIncidents.test.tsx`
- Modify: `apps/web/src/components/StatusByEnvironment/StatusByEnvironment.tsx`
- Modify: `apps/web/src/components/StatusByEnvironment/types.ts`
- Modify: `apps/web/src/components/StatusByEnvironment/AddressStatusLine.tsx`
- Modify: `apps/web/src/app/(app)/projects/[id]/infrastructure/InfrastructureStatusPanel.tsx`

- [ ] **Step 1: Написать падающий тест**

`apps/web/src/components/AddressIncidents/AddressIncidents.test.tsx`:

```ts
describe('инциденты адреса', () => {
  it('открытый инцидент говорит, с каких пор лежит', () => {
    render(<AddressIncidents incidents={{ ...EMPTY, open: OPEN_INCIDENT }} />);

    expect(screen.getByText(/не отвечает с/)).toBeInTheDocument();
  });

  it('без инцидентов не рисует ничего', () => {
    const { container } = render(<AddressIncidents incidents={EMPTY} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('закрытые инциденты считаются числом', () => {
    render(<AddressIncidents incidents={{ ...EMPTY, past: [PAST_INCIDENT, PAST_INCIDENT] }} />);

    expect(screen.getByText(/падал 2 раза/)).toBeInTheDocument();
  });

  it('один закрытый инцидент склоняется правильно', () => {
    render(<AddressIncidents incidents={{ ...EMPTY, past: [PAST_INCIDENT] }} />);

    expect(screen.getByText(/падал 1 раз/)).toBeInTheDocument();
  });

  it('список закрытых раскрывается', async () => {
    render(<AddressIncidents incidents={{ ...EMPTY, past: [PAST_INCIDENT] }} />);
    await userEvent.click(screen.getByText(/падал/));

    expect(screen.getByText(/40 минут/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/web && npx vitest run src/components/AddressIncidents`
Expected: FAIL — компонента нет

- [ ] **Step 3: Написать компонент**

`utils.ts` — чистые функции текста: «не отвечает с 14:20», «падал 3 раза», длительность одного инцидента. Склонение — своей функцией: на вебе общей утилиты пока нет, и тащить её из API нельзя (это другое приложение). Если склонение понадобится вебу во втором месте, его место — `apps/web/src/utils/`.

`AddressIncidents.tsx` — свёрнутый `<details>` со списком закрытых; пустые инциденты не рисуют ничего.

Встроить: `StatusByEnvironment` принимает новый проп `incidents: ProjectIncidents` и передаёт строке адреса её запись; `AddressStatusLine` рисует `AddressIncidents` под строкой проверок; `InfrastructureStatusPanel` берёт их хуком `useQueryIncidents`.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/web && npx vitest run src/components/AddressIncidents src/components/StatusByEnvironment`
Expected: PASS, включая прежние тесты `StatusByEnvironment`

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/AddressIncidents apps/web/src/components/StatusByEnvironment "apps/web/src/app/(app)/projects/[id]/infrastructure/InfrastructureStatusPanel.tsx"
git commit -m "Показать историю падений у адреса"
```

---

## Чанк 6: Доводка

### Task 25: Документация и развёртывание

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `docker-compose.yml` и образец окружения (точные имена найти: `ls scripts/ *.yml .env*`)

- [ ] **Step 1: Дописать переменные окружения**

В README — в раздел про автопроверки: `CAIRN_HEALTH_RECHECK_DELAY_SECONDS` (по умолчанию 30, `0` — без переспроса) и три `CAIRN_VAPID_*` с указанием, что без них уведомления выключены, а пара генерируется `pnpm cli generate-vapid-keys`. Отдельно назвать, что приватный ключ — секрет и живёт вне базы, рядом с ключом шифрования.

В `docker-compose.yml` и образец окружения — прокинуть три `CAIRN_VAPID_*` и `CAIRN_HEALTH_RECHECK_DELAY_SECONDS` в сервис API.

- [ ] **Step 2: Обновить состояние репозитория в CLAUDE.md**

Дописать в раздел «Состояние репозитория» абзацем: падение адреса стало инцидентом (отрезком времени с частичным уникальным индексом «один открытый на адрес»), прогон переспрашивает упавшие адреса одной паузой на прогон, события открытия и закрытия уходят веб-пушами тем, кому видна «Инфраструктура» проекта, подписка — на устройство и со следом в журнале, история падений видна у адреса.

В разделе «Архитектурные инварианты», в пункте про автоматический статус, дописать: уведомление о падении посылается по подтверждённому переходу, а не по каждой проверке; адресаты считаются выдачами, а не отдельным списком; канал ретранслируется push-службой браузера — полезная нагрузка шифрована, факт отправки ей виден.

В «Источники правды» — строку про `2026-10-20-cairn-down-notifications-design.md` и одноимённый план.

- [ ] **Step 3: Коммит**

```bash
git add README.md CLAUDE.md docker-compose.yml
git commit -m "Описать уведомления в README и CLAUDE.md"
```

### Task 26: Полная проверка

- [ ] **Step 1: Все тесты**

Run: `pnpm test`
Expected: все рабочие пространства зелёные. Интеграционные поднимают PostgreSQL в контейнерах — нужен работающий docker.

- [ ] **Step 2: Типы**

Run: `pnpm typecheck`
Expected: без ошибок

- [ ] **Step 3: Сборка**

Run: `pnpm build`
Expected: без ошибок

- [ ] **Step 4: Проверка вживую**

Поднять приложение, завести окружение с адресом, который заведомо не отвечает (например `http://127.0.0.1:9/`), подписаться на уведомления и выставить короткий интервал:

```bash
CAIRN_STATUS_CHECK_INTERVAL_MINUTES=1 CAIRN_HEALTH_RECHECK_DELAY_SECONDS=5 pnpm --filter @cairn/api dev
```

Expected: через минуту-полторы приходит пуш «адрес не отвечает»; нажатие ведёт на экран инфраструктуры проекта; у адреса видно «не отвечает с …»; второй прогон второго пуша не присылает.

- [ ] **Step 5: Итоговый коммит**

```bash
git add -A
git commit -m "Завершить уведомления о падении"
```

---

## Что сознательно не делается

Полный список — в разделе 15 дизайна. Коротко: ни почты, ни webhook, ни повторов, пока адрес лежит, ни очереди исходящих с повторной доставкой, ни уведомлений о сроках TLS и регистрации, ни чистки старых инцидентов, ни межпроектного экрана падений, ни настройки подписки по проектам. Частота прогона не меняется.
