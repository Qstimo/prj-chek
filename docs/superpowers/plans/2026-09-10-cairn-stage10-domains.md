# CAIRN этап 10 «Реестр доменов» — план реализации

> **Для исполнителя:** ОБЯЗАТЕЛЬНО веди работу через superpowers:executing-plans (или superpowers:subagent-driven-development, если доступны субагенты). Шаги отмечаются чекбоксами (`- [ ]`).

**Цель:** корневой домен становится записью реестра — с владельцем, регистратором, сроком продления и предупреждением за 30 дней; поддомены остаются доменами окружений и привязываются к корню автоматически.

**Архитектура:** глобальная таблица `domains` вне модели выдач, доступная только суперадмину; `environment_domains.domain_id` со ссылкой `restrict`; корень вычисляется чистой функцией `rootDomainOf` и заводится автоматически при сохранении домена окружения; предупреждение о сроке — чистая функция рядом с серверной; карта доменов на общем ядре, выделенном из карты серверов.

**Стек:** прежний.

**Основание:** `docs/superpowers/specs/2026-09-10-cairn-stage10-domains-design.md`.

---

## Ключевые правила

1. **TDD**; коммит после каждой задачи; `pnpm test` и `pnpm typecheck` перед коммитом.
2. **Домены окружения по-прежнему заводит подрядчик** с уровнем записи. Свойства корня — только суперадмин.
3. **Проекция окружения не меняется**: домены на уровне метаданных, свойства корня в неё не попадают.
4. **RDAP не трогаем.** Ручная дата — отдельный вид предупреждения.
5. **Порог 30 дней** — константа `DOMAIN_RENEWAL_WARN_DAYS` в `packages/shared`, рядом с `SERVER_WARN_DAYS`.
6. Компоненты до 100 строк, `IProps` в `types.ts`, тесты рядом.

---

## Структура файлов

**`packages/shared/src/`** — `enums.ts` (`DomainRenewalExpiring`), `schemas/domain.ts` + `.test.ts` (схемы, `DOMAIN_RENEWAL_WARN_DAYS`, `rootDomainOf`, `TWO_LEVEL_SUFFIXES`), `index.ts`.

**`apps/api/src/`** — `db/schema/domains.ts` + `.test.ts`; правка `db/schema/environments.ts`; `domains/domains.repository.ts`, `domains.service.ts`, `domains.controller.ts`, `domains.module.ts`, `domain-map.ts` (+ тесты); `environments/environments.repository.ts` (автозаведение корня); `status/indicator.ts` (`domainRenewalWarningsOf`); `status/status.repository.ts`; `app.module.ts`.

**`apps/api/drizzle/`** — `0019_domains.sql`, `0020_domain_privileges.sql`, запись в `meta/_journal.json`.

**`apps/api/test/`** — `domains.e2e.test.ts`, `domains-migration.test.ts`.

**`apps/web/src/`** — хуки `useQueryDomains.ts`, `useMutationDomain.ts`; компоненты `TopologyMap/` (ядро, выделенное из `ServerMap`), `DomainList/`, `DomainForm/`, `DomainCard/`, `DomainMap/`; правка `PaidUntilBadge` (проп `warnDays`), `AppNav/constants.ts`; страницы `app/(app)/domains/**`.

**`scripts/e2e.mjs`** — сценарий домена.

---

## Chunk 1: Контракт и данные

### Task 1: Контракт домена

`enums.ts`: `StatusWarningKind.DomainRenewalExpiring = 'domain_renewal_expiring'`.

`schemas/domain.ts`:

```ts
/** Предупреждать о продлении домена за месяц: просроченный домен могут перехватить. */
export const DOMAIN_RENEWAL_WARN_DAYS = 30;

/** Зоны, у которых регистрируемое имя — третьего уровня. Закрытый список (спека 2). */
export const TWO_LEVEL_SUFFIXES = ['co.uk', 'org.uk', 'com.ua', 'com.br', 'com.au', 'co.jp', 'com.tr', 'co.il'];

/** Корневой домен: то, за что платят. */
export function rootDomainOf(name: string): string;

export const domainCreateSchema = z.object({
  name: domainSchema,
  owner: z.string().trim().max(200).nullable().optional(),
  registrar: z.string().trim().max(200).nullable().optional(),
  paidUntil: isoDateSchema.nullable().optional(),
  notes: z.string().max(10_000).nullable().optional(),
});

export const domainUpdateSchema = domainCreateSchema.partial();
export const domainRowSchema = /* поля + indicator, warnings, subdomainCount, projectCount, createdAt, updatedAt */;
export const domainDetailSchema = domainRowSchema.extend({ subdomains: z.array(domainSubdomainSchema) });
export const domainMapSchema = /* domains, projects, edges с поддоменами на рёбрах */;
```

`domainSchema` и `isoDateSchema` переиспользуются из `schemas/environment.ts` и `schemas/server.ts`.

Тесты `rootDomainOf`: `example.com` → сам себя; `stage.example.com` → `example.com`; `a.b.example.com` → `example.com`; `shop.co.uk` → `shop.co.uk`; `stage.shop.co.uk` → `shop.co.uk`; `localhost` (без точки) → сам себя. Тесты схем: имя обязательно и нормализуется, `paidUntil` только календарной датой, `DOMAIN_RENEWAL_WARN_DAYS` равен 30.

Коммит: `Добавить контракт домена`.

### Task 2: Таблица доменов

`db/schema/domains.ts`: `domains` — `id`, `name` (unique, notNull), `owner`, `registrar`, `paidUntil` (`date`), `notes`, `createdAt`, `updatedAt`.

`db/schema/environments.ts`: `environmentDomains` получает `domainId: uuid('domain_id').notNull().references(() => domains.id, { onDelete: 'restrict' })` и индекс по нему.

Подключить в `index.ts`, `ALL_TABLES` (`invariants.test.ts`), `db-fixture.ts` (TRUNCATE — `domains` после `environment_domains`).

Тесты: имя уникально; `paid_until` типа `date`; ссылка поддомена на корень `restrict`; поддомен обязан иметь корень.

Коммит: `Добавить таблицу доменов`.

### Task 3: Миграция и привилегии

`db:generate` → `0019_domains.sql`, дополнить переносом (порядок строгий):

1. `CREATE TABLE domains`, `ALTER TABLE environment_domains ADD COLUMN domain_id uuid`;
2. вставка корней — SQL-выражение, повторяющее `rootDomainOf`: последние две метки, кроме списка двухуровневых суффиксов, для которых три. Выражение оформить отдельным CTE, чтобы правило читалось;
3. `UPDATE environment_domains SET domain_id = ...` по вычисленному корню;
4. `ALTER COLUMN domain_id SET NOT NULL` и внешний ключ.

`0020_domain_privileges.sql`: `GRANT SELECT, INSERT, UPDATE, DELETE ON domains TO cairn_app;` + запись в `meta/_journal.json`.

Тест `apps/api/test/domains-migration.test.ts` (Testcontainers, по образцу `servers-migration.test.ts`): применить миграции до `0019`, вставить окружение с доменами `shop.example.com`, `stage.example.com`, `api.shop.co.uk`, применить `0019`+`0020`, проверить: созданы корни `example.com` и `shop.co.uk`; первые два поддомена ссылаются на первый корень; колонка `not null`; роль приложения имеет права на `domains`.

Коммит: `Привязать домены окружений к реестру корней`.

---

## Chunk 2: API доменов

### Task 4: Предупреждение о продлении

`status/indicator.ts`: `domainRenewalWarningsOf(name, paidUntil, now)` — по образцу `serverWarningsOf`, порог из контракта, вид `DomainRenewalExpiring`. Вспомогательные `daysUntil` и `daysAgoOf` уже есть — переиспользовать, не копировать.

Тесты: без даты молчит; за 31 день молчит; ровно 30 — предупреждает «оплачен до …»; просрочка — «оплата истекла N дней назад» со склонением.

Коммит: `Добавить предупреждение о продлении домена`.

### Task 5: Репозиторий доменов

`domains/domains.repository.ts` — `list`, `findById`, `create`, `update`, `remove`, `map`, плюс `ensureRoot(tx, name)` для автозаведения. Субъекта в сигнатуре нет по той же причине, что у серверов; TSDoc обязан это объяснить.

`list` возвращает корни с индикатором (`warning` при близком или прошедшем сроке, `unknown` без даты, иначе `ok`), предупреждениями и счётчиками поддоменов и различных проектов. `remove` при непустом корне — `ConflictException`. `ensureRoot` возвращает существующий корень либо заводит новый с пустыми свойствами.

Тесты (Testcontainers): создание и чтение; повтор имени → `409`; счётчики считают проекты, а не поддомены; удаление занятого корня → `409`; `ensureRoot` дважды подряд не плодит записи; неизвестный id → `404`.

Коммит: `Добавить репозиторий доменов`.

### Task 6: Автозаведение корня при сохранении окружения

`environments/environments.repository.ts`: в `replaceDomains` для каждого имени вычисляется корень и вызывается `ensureRoot` в той же транзакции; `domainId` пишется в строку поддомена.

Тесты `environments.repository.test.ts`: подрядчик с уровнем записи заводит окружение с доменом — корень появился в реестре, поддомен на него ссылается; два окружения с поддоменами одного корня дают один корень; свойства корня подрядчик не задаёт (в реестре они пустые).

Коммит: `Заводить корень домена при сохранении окружения`.

### Task 7: Сервис, контроллер, модуль

`audit.types.ts`: `DomainCreated`, `DomainUpdated`, `DomainDeleted`. Автозаведение корня журналируется как `domain.created` с пометкой `auto: true` в метаданных — иначе в журнале появлялись бы записи без объяснения, откуда взялся корень.

`domains.service.ts`, `domains.controller.ts` (`@Controller('domains')`, `SessionGuard + SuperadminGuard`, маршрут `map` объявлен до `:id`), `domains.module.ts`, регистрация в `app.module.ts`.

Тесты сервиса: создание/правка/удаление пишут в журнал; правка пишет имена полей, но не значения; ошибка откатывает запись.

Коммит: `Добавить API доменов`.

### Task 8: Предупреждения в статусе проекта, карта, e2e

`status.repository.ts`: подтянуть корни доменов окружений проекта и добавить `domainRenewalWarningsOf` к предупреждениям — по одному на корень, независимо от числа поддоменов.

`domains/domain-map.ts`: `buildDomainMap(input, now)` — чистая функция, группирует поддомены в рёбра «корень → проект».

`apps/api/test/domains.e2e.test.ts`: суперадмин ведёт реестр; подрядчик получает `403` на `/domains`, но успешно добавляет домен окружению, и корень появляется; срок продления попадает в статус проекта; карта отдаёт ребро; занятый корень не удаляется.

Коммит: `Добавить карту доменов и e2e`.

---

## Chunk 3: Интерфейс

### Task 9: Общее ядро карты

Выделить из `components/ServerMap/` в `components/TopologyMap/`: `TopologyMap.tsx` (канва, зум, выделение, слот панели), `MapNode.tsx`, `MapEdges.tsx`, `utils/layout.ts` (`layoutTopology` — бывшая `layoutServerGraph`, тело не меняется), `constants.ts`.

`ServerMap` становится обёрткой: готовит узлы и рёбра из `ServerMap` контракта и отдаёт `ServerCard` как панель.

**Существующие тесты `ServerMap.test.tsx` и `layout.test.ts` должны пройти без правок содержания** (допускается только правка путей импорта) — это и есть проверка, что рефакторинг ничего не сломал.

Коммит: `Выделить общее ядро карты топологии`.

### Task 10: Хуки и плашка

`useQueryDomains`, `useQueryDomain`, `useQueryDomainMap`, `useMutationDomain` (создание, правка, удаление; инвалидация `['domains']`, `['status']`, `['status-summary']`).

`PaidUntilBadge` получает необязательный проп `warnDays` со значением по умолчанию `SERVER_WARN_DAYS`; `paidUntilView` принимает порог аргументом.

Тесты: мутация сбрасывает и статусы; плашка с порогом 30 загорается на 25 днях, а с порогом по умолчанию — нет.

Коммит: `Добавить хуки доменов`.

### Task 11: Реестр и форма доменов

`DomainForm` (имя, владелец, регистратор, оплачен до, заметки), `DomainList` (имя, владелец, регистратор, плашка срока, «N проектов», удаление с подтверждением внутри интерфейса), страницы `/domains`, `/domains/new`, `/domains/[id]/edit`, пункт «Домены» в `ADMIN_LINKS`.

Склонение проектов уже есть в `ServerList/utils.ts` — вынести в общее место, а не копировать.

Тесты: без имени не отправляется; поле имени нормализует регистр; пустой реестр объясняет, что доменов нет; удаление только после подтверждения.

Коммит: `Добавить реестр доменов`.

### Task 12: Карта доменов и завершение

`DomainCard` (панель узла: владелец, регистратор, срок, поддомены с проектами), `DomainMap` (обёртка над `TopologyMap`), страница `/domains/map`.

`scripts/e2e.mjs`: сценарий `runDomainScenario` — подрядчик добавляет домен окружению, суперадмин видит корень в реестре, ставит срок через 5 дней, видит предупреждение в статусе проекта и ребро на карте, получает `409` на удалении занятого корня.

README и CLAUDE.md: этап 10 в состоянии репозитория, экран «Домены» в списке.

Финальная проверка: `pnpm test`, `pnpm typecheck`, `pnpm build`.

Коммит: `Завершить этап 10: реестр доменов`.
