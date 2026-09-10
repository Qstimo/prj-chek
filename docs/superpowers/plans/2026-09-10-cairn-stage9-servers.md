# CAIRN этап 9 «Серверы и карта размещения» — план реализации

> **Для исполнителя:** ОБЯЗАТЕЛЬНО веди работу через superpowers:executing-plans (или superpowers:subagent-driven-development, если доступны субагенты). Шаги отмечаются чекбоксами (`- [ ]`).

**Цель:** сервер становится самостоятельной сущностью реестра — со сроком оплаты, предупреждением за две недели, страницей ведения и интерактивной картой «серверы → проекты».

**Архитектура:** глобальная таблица `servers` вне модели выдач, доступная только суперадмину (как `users`); `environments.server_id` со ссылкой `restrict`; `ip`/`provider`/`specs` переезжают из окружения на сервер, `host` остаётся адресом окружения с приоритетом над адресом машины; статус сервера — чистая функция-агрегат поверх уже собираемых health-проверок; карта — своя SVG-канва с детерминированной раскладкой в чистой функции.

**Стек:** прежний.

**Основание:** `docs/superpowers/specs/2026-09-10-cairn-stage9-servers-design.md`.

---

## Ключевые правила

1. **TDD**: сначала падающий тест, потом реализация. Коммит после каждой задачи.
2. **Модель выдач не трогаем.** Никаких новых секций и видов выдач: сервер защищён `SuperadminGuard`, как `/users`.
3. **Права проверяет репозиторий.** У серверов проверять нечего (нет проекта), но у окружений — по-прежнему репозиторий, а не контроллер.
4. **Финансы вне объёма** (ТЗ 1.4): только дата `paid_until`, ни сумм, ни истории.
5. **Порог предупреждения — одна константа** `SERVER_WARN_DAYS = 14`, и живёт она в `packages/shared`, а не рядом с `TLS_WARN_DAYS` в API: порог нужен и вычислению статуса, и плашке в интерфейсе, а из веба в `apps/api` импортировать нечего.
6. **Просрочка оплаты — `warning`, не `down`.** `down` означает наблюдаемую недоступность.
7. **Компоненты до 100 строк**, каждый в своей директории, `IProps` в `types.ts`.
8. Проверки перед коммитом: `pnpm test`, `pnpm typecheck`.

---

## Структура файлов

**`packages/shared/src/`**
- `enums.ts` — `StatusWarningKind.ServerExpiring`.
- `schemas/server.ts` (+ `.test.ts`) — `serverSchema`, `serverCreateSchema`, `serverUpdateSchema`, `serverRowSchema`, `serverDetailSchema`, `serverMapSchema`.
- `schemas/environment.ts` (+ `.test.ts`) — `environmentServerSchema`, `serverId` в правках, `server` в детали.
- `index.ts` — экспорт `./schemas/server`.

**`apps/api/src/`**
- `db/schema/servers.ts` (+ `.test.ts`) — таблица; подключение в `db/schema/index.ts` и `db/schema/invariants.test.ts`.
- `db/schema/environments.ts` — `serverId`, минус `ip`/`provider`/`specs`.
- `servers/servers.repository.ts` (+ `.test.ts`) — CRUD, агрегаты, `409` на занятом сервере.
- `servers/servers.service.ts` (+ `.test.ts`) — журнал в той же транзакции.
- `servers/server-map.ts` (+ `.test.ts`) — сборка узлов и рёбер.
- `servers/servers.controller.ts`, `servers/servers.module.ts`.
- `environments/environment.projection.ts` (+ `.test.ts`) — вложенный `server`.
- `environments/environments.repository.ts` — join сервера, запрет `serverId` не-суперадмину.
- `status/indicator.ts` (+ `.test.ts`) — `SERVER_WARN_DAYS`, `serverWarningsOf`, `serverIndicatorOf`.
- `status/status.repository.ts` — серверные предупреждения в статус проекта.
- `app.module.ts` — регистрация `ServersModule`.

**`apps/api/drizzle/`** — `0017_*.sql` (DDL + перенос данных), `0018_server_privileges.sql`, запись в `meta/_journal.json`.

**`apps/api/test/`** — `servers.e2e.test.ts`, `servers-migration.test.ts`.

**`apps/web/src/`**
- `api/hooks/useQueryServers.ts`, `useQueryServerMap.ts`, `useMutationServer.ts` (+ тесты, экспорт в `hooks/index.ts`).
- `components/PaidUntilBadge/`, `ServerList/`, `ServerForm/`, `ServerCard/`, `ServerMap/` (+ `utils/layout.ts`).
- `components/EnvironmentForm/`, `EnvironmentCard/` — доработка.
- `app/(app)/servers/page.tsx`, `servers/ServersScreen.tsx`, `servers/new/page.tsx`, `servers/[id]/edit/page.tsx`, `servers/map/page.tsx`.
- `components/AppNav/constants.ts` — пункт «Серверы».

**`scripts/e2e.mjs`** — сценарий сервера.

---

## Chunk 1: Контракт и данные

### Task 1: Контракт сервера

`packages/shared/src/enums.ts`: в `StatusWarningKind` добавить `ServerExpiring = 'server_expiring'`.

`packages/shared/src/schemas/server.ts`:

Файл импортирует `StatusIndicator`, `EnvironmentKind`, `HealthState`, `ProjectLifecycle` из `../enums` и `statusWarningSchema` из `./status`.

```ts
/** Предупреждать об оплате сервера за две недели. */
export const SERVER_WARN_DAYS = 14;

/** Дата в формате YYYY-MM-DD: у срока оплаты нет часа, и зона ему не нужна. */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата');

export const serverCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  owner: z.string().trim().max(200).nullable().optional(),
  host: z.string().trim().max(253).nullable().optional(),
  ip: z.string().ip().nullable().optional(),
  provider: z.string().trim().max(200).nullable().optional(),
  specs: z.string().trim().max(500).nullable().optional(),
  paidUntil: isoDateSchema.nullable().optional(),
  notes: z.string().max(10_000).nullable().optional(),
});

export const serverUpdateSchema = serverCreateSchema.partial();

/** Строка реестра: поля сервера, агрегированный статус и счётчики. */
export const serverRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  owner: z.string().nullable(),
  host: z.string().nullable(),
  ip: z.string().nullable(),
  provider: z.string().nullable(),
  specs: z.string().nullable(),
  paidUntil: z.string().nullable(),
  notes: z.string().nullable(),
  indicator: z.nativeEnum(StatusIndicator),
  warnings: z.array(statusWarningSchema),
  projectCount: z.number().int().nonnegative(),
  environmentCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Детали сервера: строка реестра плюс что именно на нём живёт. */
export const serverDetailSchema = serverRowSchema.extend({
  environments: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      kind: z.nativeEnum(EnvironmentKind),
      projectId: z.string().uuid(),
      projectName: z.string(),
      health: z.nativeEnum(HealthState).nullable(),
    }),
  ),
});

/** Данные карты: узлы серверов, узлы проектов, рёбра с окружениями. */
export const serverMapSchema = z.object({
  servers: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      owner: z.string().nullable(),
      indicator: z.nativeEnum(StatusIndicator),
      paidUntil: z.string().nullable(),
      warnings: z.array(statusWarningSchema),
    }),
  ),
  projects: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      lifecycle: z.nativeEnum(ProjectLifecycle),
      indicator: z.nativeEnum(StatusIndicator),
    }),
  ),
  edges: z.array(
    z.object({
      serverId: z.string().uuid(),
      projectId: z.string().uuid(),
      environments: z.array(
        z.object({ id: z.string().uuid(), name: z.string(), kind: z.nativeEnum(EnvironmentKind) }),
      ),
    }),
  ),
});
```

Экспорт `./schemas/server` в `packages/shared/src/index.ts`.

Тесты `schemas/server.test.ts`: имя обязательно и обрезается по краям; `paidUntil` принимает `2026-10-12` и отвергает `12.10.2026` и `2026-10-12T00:00:00Z`; `owner` длиннее 200 символов отвергается; `ip` проверяется как адрес; `serverUpdateSchema` принимает пустой объект; `serverMapSchema` собирается на образце с одним ребром; `SERVER_WARN_DAYS` равен 14.

Коммит: `Добавить контракт сервера`.

### Task 2: Контракт окружения

`packages/shared/src/schemas/environment.ts`:

- новый `environmentServerSchema` — `{ id, name, owner, host, ip, provider, specs }` (всё, кроме `id`/`name`, nullable);
- `environmentDetailSchema` теряет `ip`, `provider`, `specs` и получает `server: environmentServerSchema.nullable()`; `host` остаётся;
- `environmentUpdateSchema` теряет `ip`, `provider`, `specs` и получает `serverId: z.string().uuid().nullable().optional()`.

TSDoc на `host` объясняет приоритет: адрес окружения перекрывает адрес машины, потому что окружение может жить на поддомене или нестандартном порту.

Тесты `schemas/environment.test.ts`: деталь собирается с `server: null` и с заполненным сервером; правка принимает `serverId: null` (отвязка) и отвергает `serverId: 'нет'`; правка больше не принимает `ip`/`provider`/`specs` (лишние ключи отбрасываются zod, поэтому проверяем, что результат парсинга их не содержит).

Коммит: `Перенести серверные поля окружения в контракт сервера`.

### Task 3: Таблица серверов

`apps/api/src/db/schema/servers.ts`:

```ts
export const servers = pgTable(
  'servers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    owner: text('owner'),
    host: text('host'),
    ip: text('ip'),
    provider: text('provider'),
    specs: text('specs'),
    paidUntil: date('paid_until'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('servers_name').on(table.name)],
);
```

`apps/api/src/db/schema/environments.ts`: добавить `serverId: uuid('server_id').references(() => servers.id, { onDelete: 'restrict' })` и индекс `servers_environments_idx` по нему; удалить `ip`, `provider`, `specs`. TSDoc пояснением: `restrict` — удаление сервера должно быть осознанным переносом, а не каскадом.

Подключить в `db/schema/index.ts`, в `ALL_TABLES` файла `db/schema/invariants.test.ts` и в фикстуру `apps/api/test/db-fixture.ts` (TRUNCATE — после окружений, потому что окружения ссылаются на серверы).

Тест `db/schema/servers.test.ts`: имя уникально; `paid_until` имеет тип `date`; ссылка окружения на сервер объявлена с `restrict`.

Коммит: `Добавить таблицу серверов`.

### Task 4: Миграция и привилегии

`pnpm --filter @cairn/api db:generate` → `0017_*.sql`. Сгенерированный DDL **дополнить переносом данных вручную**, порядок операторов строго такой:

1. `CREATE TABLE servers …` и `ALTER TABLE environments ADD COLUMN server_id …` (из генерации);
2. вставка серверов по уникальным непустым парам `(host, ip)`:

```sql
INSERT INTO servers (name, host, ip, provider, specs, notes)
SELECT DISTINCT ON (coalesce(host, ''), coalesce(ip, ''))
       coalesce(host, ip), host, ip, provider, specs, NULL
FROM environments
WHERE host IS NOT NULL OR ip IS NOT NULL
ORDER BY coalesce(host, ''), coalesce(ip, ''), created_at, name;
```

3. `UPDATE environments SET server_id = s.id FROM servers s WHERE …` по совпадению `(host, ip)` с учётом NULL через `IS NOT DISTINCT FROM`;
4. перенос расхождений: для окружений, чьи `provider`/`specs` отличаются от значений своего сервера, дописать в `servers.notes` строку `'из окружения «<имя>»: <specs>'` (агрегация `string_agg`, разделитель — перевод строки);
5. `UPDATE environments SET host = NULL WHERE host IS NOT DISTINCT FROM (SELECT host FROM servers WHERE id = server_id)` — иначе адрес дублировался бы;
6. `ALTER TABLE environments DROP COLUMN ip, DROP COLUMN provider, DROP COLUMN specs` (из генерации).

`apps/api/drizzle/0018_server_privileges.sql`: `GRANT SELECT, INSERT, UPDATE, DELETE ON servers TO cairn_app;` — плюс запись в `meta/_journal.json` по образцу `0015_agent_token_privileges`.

Тест `apps/api/test/servers-migration.test.ts` (Testcontainers, по образцу `environments-privileges.test.ts`): поднять чистую базу, применить миграции по `0016` включительно, вставить проект и три окружения — два с одинаковыми `host`/`ip` и разными `specs`, одно без адреса, — применить `0017`, проверить: создан ровно один сервер; оба окружения ссылаются на него; третье имеет `server_id IS NULL`; расхождение `specs` попало в `notes`; `host` первых двух очищен; колонок `ip`/`provider`/`specs` в `environments` больше нет.

Тест привилегий: добавить случай в `apps/api/test/environments-privileges.test.ts` — роль `cairn_app` читает и пишет `servers`.

Коммит: `Перенести серверные поля окружений в таблицу серверов`.

---

## Chunk 2: API серверов

### Task 5: Статус сервера

`apps/api/src/status/indicator.ts`:

`SERVER_WARN_DAYS` импортируется из `@cairn/shared` — своё число здесь стало бы вторым местом правки.

```ts
/** Предупреждения сервера: срок оплаты близок либо уже прошёл. */
export function serverWarningsOf(name: string, paidUntil: string | null, now: Date): StatusWarning[];

/**
 * Индикатор сервера: агрегат health его окружений плюс срок оплаты.
 * Просрочка даёт warning, а не down: down означает наблюдаемую
 * недоступность, а неоплаченная машина может работать ещё неделю.
 */
export function serverIndicatorOf(
  environments: EnvironmentStatus[],
  paidUntil: string | null,
  now: Date,
): StatusIndicator;
```

Правила по порядку: нет окружений с проверкой и нет `paidUntil` → `unknown`; все проверяемые окружения `down` → `down`; часть `down`, либо `paidUntil` в пределах 14 дней, либо срок прошёл → `warning`; иначе `ok`.

Тесты `indicator.test.ts`: пусто → `unknown`; одно окружение `up`, `paidUntil` через год → `ok`; все `down` → `down`; одно из двух `down` → `warning`; `paidUntil` через 13 дней → `warning`, через 15 — `ok`; вчерашний `paidUntil` → `warning` с текстом «оплата истекла 1 день назад»; `paidUntil` через 3 дня при всех `up` → `warning` с текстом «оплачен до 13.09.2026»; ровно 14 дней → `warning` (граница включительно).

Коммит: `Добавить вычисление статуса сервера`.

### Task 6: Репозиторий серверов

`apps/api/src/servers/servers.repository.ts` — методы `list`, `findById`, `create`, `update`, `remove`, `mapData`. Субъект в сигнатуре не нужен: контроллер закрыт `SuperadminGuard`, а проверять уровень доступа не к чему — у сервера нет проекта. TSDoc обязан это объяснить, иначе отсутствие проверки выглядит забытым.

`list` возвращает `ServerRow[]`: строка сервера + `indicator` через `serverIndicatorOf` + `warnings` через `serverWarningsOf` + счётчики окружений и различных проектов (`count(distinct project_id)`), сортировка по имени. `findById` добавляет список окружений с именами проектов и последним `health`; отсутствующий сервер → `NotFoundException`. `remove` при непустом сервере → `ConflictException('На сервере есть окружения')`.

Тесты `servers.repository.test.ts` (интеграционные, Testcontainers, по образцу `environments.repository.test.ts`): создание и чтение; уникальность имени → ошибка; счётчики считают проекты, а не окружения (два окружения одного проекта → `projectCount: 1`); удаление занятого сервера → `409`; удаление пустого проходит; `findById` неизвестного id → `404`; индикатор собирается из статусов окружений.

Коммит: `Добавить репозиторий серверов`.

### Task 7: Сервис, контроллер, модуль

`apps/api/src/audit/audit.types.ts`: `ServerCreated = 'server.created'`, `ServerUpdated = 'server.updated'`, `ServerDeleted = 'server.deleted'`.

`servers.service.ts` — по образцу `EnvironmentsService`: транзакция, репозиторий, запись в журнал той же транзакцией. В журнал правки попадают **имена изменённых полей, но не значения** (как у окружений). `projectId` у записи `null` — сервер межпроектен.

`servers.controller.ts` — `@Controller('servers')`, `@UseGuards(SessionGuard, SuperadminGuard)`, шесть маршрутов из спеки; `DELETE` отвечает `204`; тела проверяются `ZodValidationPipe` со схемами из контракта.

`servers.module.ts` регистрирует репозиторий, сервис и контроллер; модуль подключается в `app.module.ts`.

Тесты `servers.service.test.ts` (подделки репозитория и журнала): создание пишет `server.created` с именем; правка пишет `server.updated` со списком изменённых полей и без значений; удаление пишет `server.deleted`; ошибка репозитория откатывает запись журнала.

Коммит: `Добавить API серверов`.

### Task 8: Сервер в проекции окружения

`apps/api/src/environments/environment.projection.ts`: сигнатура получает четвёртым аргументом `server: ServerRowLike | null`; на уровне метаданных сервер не отдаётся вовсе, на уровне чтения — вложенным объектом `{ id, name, owner, host, ip, provider, specs }`. `ip`, `provider`, `specs` из окружения уходят.

`environments.repository.ts`: `findForProject` и `findById` делают `leftJoin(servers)`; `create`/`update` принимают `serverId`. **Не-суперадмину `serverId` в теле запрещён**: если `input.serverId !== undefined` и субъект не суперадмин — `ForbiddenException('Привязку к серверу задаёт суперадмин')`. Это тот случай, когда `403` уместен: доступ к секции есть, уровень для операции недостаточен.

Тесты `environment.projection.test.ts`: уровень метаданных — ключа `server` нет; уровень чтения без сервера — `server: null`; уровень чтения с сервером — поля машины на месте, а `ip` в корне окружения отсутствует.

Тесты `environments.repository.test.ts`: обычный пользователь с уровнем записи, передавший `serverId`, получает `403`; суперадмин привязывает и отвязывает (`serverId: null`); удаление окружения не трогает сервер.

Коммит: `Показывать сервер в карточке окружения`.

### Task 9: Серверные предупреждения в статусе проекта

`apps/api/src/status/status.repository.ts`: выборка статуса проекта подтягивает серверы его окружений (`join servers on environments.server_id`) и добавляет к предупреждениям проекта результат `serverWarningsOf(server.name, server.paidUntil, now)`; те же предупреждения участвуют в `indicatorOf`, поднимая индикатор проекта до `warning`. Сводка `statusSummary` — тем же путём.

Тесты `status.repository.test.ts`: проект с окружением на сервере, оплаченным на три дня вперёд, получает предупреждение `server_expiring` с именем сервера в `subject` и индикатор `warning`; проект без сервера — без изменений; два окружения одного проекта на одном сервере дают **одно** предупреждение, а не два.

Коммит: `Предупреждать о сроке оплаты сервера в статусе проекта`.

### Task 10: Данные карты и e2e

`apps/api/src/servers/server-map.ts` — чистая функция `buildServerMap(servers, environments, projects, statuses, now)`, собирающая `ServerMap` из плоских строк: группирует окружения по паре «сервер + проект» в рёбра, считает индикаторы. Репозиторий делает один запрос и передаёт строки в функцию — так сборка тестируется без базы.

Тесты `server-map.test.ts`: пустой вход → пустые массивы; проект с двумя окружениями на одном сервере → одно ребро с двумя окружениями; проект с прод на одном сервере и стейдж на другом → два ребра и один узел проекта; окружение без сервера в карту не попадает.

`apps/api/test/servers.e2e.test.ts`: суперадмин создаёт сервер, видит его в списке; обычный пользователь получает `404` на всех шести маршрутах; привязка окружения суперадмином отражается в `GET /servers/:id` и в карточке окружения; удаление занятого сервера → `409`, после отвязки → `204`; `GET /servers/map` отдаёт ребро; журнал содержит `server.created`.

Коммит: `Добавить карту размещения и e2e серверов`.

---

## Chunk 3: Интерфейс

### Task 11: Хуки данных

`apps/web/src/api/hooks/`: `useQueryServers` (`['servers']`), `useQueryServer(id)`, `useQueryServerMap` (`['servers', 'map']`), `useMutationServer` (создание, правка, удаление; инвалидация `['servers']`, `['status']` и `['projects']` — серверные предупреждения меняют индикаторы проектов). Экспорт в `hooks/index.ts`.

Тест `useMutationServer.test.tsx` по образцу `useMutationEnvironment.test.tsx`: успешное создание инвалидирует `['servers']` и `['status']`.

Коммит: `Добавить хуки серверов`.

### Task 12: Плашка срока оплаты

`components/PaidUntilBadge/`: `IProps { paidUntil: string | null }`. Показывает «оплачен до 12.10.2026», при сроке в пределах 14 дней — предупреждающим цветом и с суффиксом «через N дней», при прошедшем сроке — «оплата истекла N дней назад» цветом `destructive`, при `null` — «срок не указан» приглушённо. Порог берётся из `SERVER_WARN_DAYS` контракта, а не дублируется числом.

Тесты: три состояния и `null`; дата форматируется по русской локали.

Коммит: `Добавить плашку срока оплаты сервера`.

### Task 13: Форма сервера

`components/ServerForm/` по образцу `EnvironmentForm`: поля имя, владелец, хост, IP, провайдер, характеристики, оплачен до (`<input type="date">`), заметки; подписи — в `constants.ts` (`FIELD_LABELS`); пустая строка приводится к `null`; кнопка неактивна при пустом имени и во время отправки; ошибка — `role="alert"`.

Страницы `app/(app)/servers/new/page.tsx` и `app/(app)/servers/[id]/edit/page.tsx` — клиентские экраны поверх формы и хуков, по образцу `projects/new`.

Тесты `ServerForm.test.tsx`: имя обязательно (кнопка выключена); заполнение и отправка отдают ожидаемый объект с `null` в пустых полях; дата уходит строкой `YYYY-MM-DD`; сообщение об ошибке видно.

Коммит: `Добавить форму сервера`.

### Task 14: Реестр серверов

`components/ServerList/`: строки со `StatusIndicator`, именем (ссылкой на правку), владельцем, провайдером, `PaidUntilBadge` и счётчиком «N проектов»; кнопка удаления с подтверждением внутри интерфейса (не `confirm()` — браузерный диалог блокирует автоматизацию); пустое состояние — «Серверов пока нет».

`app/(app)/servers/page.tsx` + `ServersScreen.tsx` по образцу `users/`. Пункт `{ href: '/servers', label: 'Серверы' }` в `ADMIN_LINKS`.

Тесты `ServerList.test.tsx`: строки отрисованы с индикатором и счётчиком; пустой список даёт пустое состояние; клик по удалению просит подтверждения и только потом зовёт обработчик.

Коммит: `Добавить реестр серверов`.

### Task 15: Раскладка карты

`components/ServerMap/utils/layout.ts`:

```ts
/** Узел карты с посчитанными координатами. */
export interface LayoutNode { id: string; kind: 'server' | 'project'; x: number; y: number; }

/**
 * Раскладка графа «серверы → проекты».
 *
 * Детерминированная: серверы колонкой слева в порядке имени, проекты
 * веером справа от своего сервера, проект на нескольких серверах — по
 * среднему Y. Без физики и случайности, иначе раскладку нельзя проверить
 * тестом.
 */
export function layoutServerGraph(map: ServerMap): { nodes: LayoutNode[]; width: number; height: number };
```

`utils/index.ts` — barrel.

Тесты `layout.test.ts`: пустая карта → пустые узлы и нулевые размеры; два сервера стоят по X одинаково и различаются по Y на постоянный шаг; проекты сервера правее его; проект на двух серверах получает средний Y; повторный вызов на тех же данных даёт те же координаты.

Коммит: `Добавить раскладку карты размещения`.

### Task 16: Карта

`components/ServerMap/ServerMap.tsx` — клиентский компонент: `<svg>` рисует рёбра (кривые между координатами), поверх — слой `<button>` с именем и индикатором каждого узла. Зум колесом и кнопками «+/−», панорама перетаскиванием фона — обе операции меняют один `transform` обёртки. Клик по узлу подсвечивает его рёбра (`data-active`) и открывает `ServerCard` в существующем `Drawer`; `Esc` снимает выделение; узлы обходятся `Tab`, у каждого `aria-label` вида «Сервер hetzner-fsn-1, предупреждение».

`components/ServerCard/` — панель узла: поля сервера, `PaidUntilBadge`, список окружений с проектами, ссылки на проекты, кнопка «Править».

`app/(app)/servers/map/page.tsx` + клиентский экран поверх `useQueryServerMap`.

Тесты `ServerMap.test.tsx`: узлы отрисованы кнопками с доступными именами; клик по узлу открывает панель и помечает его рёбра активными; `Esc` закрывает; пустая карта показывает «Ни одно окружение не привязано к серверу».

Коммит: `Добавить интерактивную карту размещения`.

### Task 17: Окружение в интерфейсе

`components/EnvironmentForm/`: убрать поля `ip`, `provider`, `specs`; добавить `ServerField` — выпадающий список серверов, отрисовываемый **только при `canAssignServer`** (проп, приходящий из `subject.isSuperadmin`); остальным на его месте — текст «Сервер: hetzner-fsn-1» либо «Сервер не привязан». Поле `host` остаётся с подписью «Адрес окружения» и подсказкой «если отличается от адреса машины».

`components/EnvironmentCard/`: показывать блок сервера (имя, владелец, хост, IP, провайдер, характеристики), когда `server` пришёл в проекции; адрес окружения — `environment.host ?? server.host`.

Тесты: `EnvironmentForm.test.tsx` — селект серверов есть при `canAssignServer` и отсутствует без него, отправка отдаёт `serverId`; `EnvironmentCard.test.tsx` — блок сервера виден с сервером и скрыт без него, адрес окружения перекрывает адрес машины.

Коммит: `Показывать сервер в интерфейсе окружения`.

### Task 18: Сквозной сценарий и документация

`scripts/e2e.mjs`: сценарий `runServerScenario` — суперадмин создаёт сервер со сроком оплаты через 5 дней, привязывает окружение, видит предупреждение `server_expiring` в статусе проекта, видит ребро в `/servers/map`, получает `409` на удалении занятого сервера; гость получает `404` на `/servers`. Вызов добавить в конец файла рядом с остальными.

`README.md` — раздел про серверы в списке экранов. `CLAUDE.md` — в «Состояние репозитория» добавить девятый этап и упоминание сервера как отдельной сущности; в «Открытые вопросы» ничего не меняется.

Финальная проверка: `pnpm test`, `pnpm typecheck`, `pnpm build`.

Коммит: `Завершить этап 9: серверы и карта размещения`.
