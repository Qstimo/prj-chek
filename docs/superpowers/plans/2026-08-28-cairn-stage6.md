# CAIRN этап 6 «Автопроверки статуса» — план реализации

> **Для исполнителя:** ОБЯЗАТЕЛЬНО веди работу через superpowers:executing-plans (или superpowers:subagent-driven-development, если доступны субагенты). Шаги отмечаются чекбоксами (`- [ ]`).

**Цель:** автоматический статус проектов — health-check окружений, сроки TLS и регистрации доменов, индикатор и предупреждения на сводке.

**Архитектура:** три чистых проверщика с внедряемыми сетевыми функциями; таблицы последних результатов (`environment_statuses`, `domain_statuses`); runner с фоновым интервалом и ручным запуском; агрегат `indicatorOf` как чистая функция; права — уровень `metadata` секции «Инфраструктура».

**Стек:** прежний.

**Основание:** `docs/superpowers/specs/2026-08-28-cairn-stage6-design.md`.

---

## Ключевые правила

1. **TDD**; проверщики не бросают исключений — ошибка есть данные.
2. **Статус не вводится руками нигде** (ТЗ 6).
3. **Фоновые прогоны не журналируются**, ручной запуск — журналируется.
4. **Каскадов нет**: строки статусов удаляются явной строкой при удалении окружения/домена.
5. Пороги: TLS 14 дней, домен 30 — константы в одном месте.
6. Коммит после каждой задачи.

---

## Структура файлов

**`packages/shared/src/schemas/status.ts`** — `ProjectStatus`, `StatusSummaryRow`, `StatusIndicator` enum (в `enums.ts`), `StatusWarning`.

**`apps/api/src/db/schema/status.ts`** — две таблицы; `index.ts`, `invariants.test.ts`, фикстура, миграции `0010_*` + `0011_status_privileges.sql`.

**`apps/api/src/status/`**
- `checkers/health.checker.ts`, `checkers/tls.checker.ts`, `checkers/domain.checker.ts` (+ тесты).
- `indicator.ts` — `indicatorOf` + константы порогов (+ тест).
- `status.repository.ts` — upsert результатов, выборка по проекту/видимым проектам с правами.
- `status-runner.service.ts` — `runAll`, фон `onModuleInit`/`onModuleDestroy`.
- `status.service.ts` — агрегаты + журнал ручного запуска.
- `status.controller.ts`, `status.module.ts`.

**`apps/api/src/environments/environments.repository.ts`** — удаление статусов при удалении окружения (домены уже удаляются — статусы доменов туда же).

**`apps/api/test/status.e2e.test.ts`**.

**`apps/web/src/`** — хуки `useStatus.ts`; компоненты `StatusIndicator/`, `WarningsPanel/`, `RunChecksButton/` и дополнение `EnvironmentCard`/страницы инфраструктуры и сводки.

**`scripts/e2e.mjs`** — сценарий статуса.

---

## Chunk 1: Контракт, схема, проверщики

### Task 1: Контракт статуса

`enums.ts`: `StatusIndicator { Ok='ok', Warning='warning', Down='down', Unknown='unknown', Paused='paused' }`, `HealthState { Up='up', Down='down' }`, `StatusWarningKind { HealthDown='health_down', TlsExpiring='tls_expiring', TlsError='tls_error', DomainExpiring='domain_expiring' }`.

`schemas/status.ts`: `environmentStatusSchema { environmentId, name, health: nullable, latencyMs: nullable, error: nullable, checkedAt: nullable }`; `domainStatusSchema { domainId, name, tlsValidTo, tlsError, registryExpiresAt, registryError, checkedAt — все nullable кроме id/name }`; `statusWarningSchema { kind, subject, detail }`; `projectStatusSchema { indicator, environments, domains, warnings }`; `statusSummaryRowSchema { projectId, indicator, warnings }`. Тест: схема собирается на образце, indicator ограничен перечислением. Коммит `Добавить контракт статуса`.

### Task 2: Таблицы и миграция

`db/schema/status.ts`: `environmentStatuses` (unique `environment_id`, restrict; `health` pgEnum `health_state`; `latency_ms` integer; `error` text; `checked_at`), `domainStatuses` (unique `domain_id` → `environment_domains`, restrict; `tls_valid_to`/`registry_expires_at` timestamp(tz); `tls_error`/`registry_error` text; `checked_at`). Тест схемы: уникальность, restrict. Подключение в `index.ts`, `ALL_TABLES`, `TRUNCATE` (первыми). `db:generate` → `0010_*`; `0011_status_privileges.sql` (GRANT на обе таблицы), регистрация в журнале; случай в `environments-privileges.test.ts`. Коммит `Добавить таблицы статусов`.

### Task 3: Проверщики

Все три — TDD с подделками:

- `health.checker.ts`: `checkHealth(url, fetchFn)` → `{ health: 'up'|'down', latencyMs, error: string|null }`. Тесты: 200 → up c latency; 500 → down «HTTP 500»; reject(TypeError) → down с сообщением; таймаут через AbortSignal (подделка, читающая signal) → down «таймаут». Реализация: `AbortSignal.timeout(10_000)`, `redirect: 'manual'`, up = status < 400.
- `tls.checker.ts`: `checkTls(domain, connectFn)` → `{ validTo: Date|null, error }`. `connectFn` по умолчанию оборачивает `tls.connect` (port 443, servername, timeout) и отдаёт `peerCertificate.valid_to`; тесты подделкой: валидная дата, ошибка соединения.
- `domain.checker.ts`: `checkDomainExpiry(domain, fetchFn)` → `{ expiresAt: Date|null, error }`. RDAP `https://rdap.org/domain/<domain>`; тесты: JSON с `events: [{eventAction: 'expiration', eventDate}]` → дата; 404 → error «зона не отдаёт RDAP»; без события expiration → error; сетевая ошибка → error.

Коммит `Добавить проверщики статуса`.

### Task 4: Индикатор

`indicator.ts`: константы `TLS_WARN_DAYS = 14`, `DOMAIN_WARN_DAYS = 30`; `warningsOf(envStatuses, domainStatuses, now)` → предупреждения; `indicatorOf(lifecycle, envStatuses, domainStatuses, now)` → индикатор по пяти правилам спеки (5). Тесты: paused бьёт down; down бьёт warning; TLS 13 дней → warning, 15 — нет; истёкший TLS → warning; домен 29 дней → warning; tls_error → warning; всё up без данных доменов → ok; пусто → unknown. Коммит `Добавить вычисление индикатора`.

---

## Chunk 2: Данные и запуск

### Task 5: Репозиторий статусов

`status.repository.ts` (Testcontainers-тест):

- `upsertEnvironmentStatus(environmentId, result)`, `upsertDomainStatus(domainId, result)` — вставка/обновление по уникальному ключу (`onConflictDoUpdate`);
- `listTargets()` → `{ environments: [{id, healthCheckUrl}], domains: [{id, name}] }` — все окружения с url и все домены (без прав: это внутренняя машинерия);
- `statusForProject(subject, projectId)` — `requireLevel(Infrastructure, Metadata)`; окружения проекта со статусами (left join), домены со статусами, `lifecycle` проекта; собирает `ProjectStatus` через `indicatorOf`;
- `summary(subject)` — по `visibleProjectIds`, отфильтрованным по наличию уровня на инфраструктуре (`levelsForProject` по каждому — проектов десятки; или join grants), отдаёт строки summary.

Тесты: upsert обновляет, а не дублирует; статус по уровням (metadata — ок, без выдачи — 404 через `SectionNotVisibleError`); summary опускает проекты без инфра-уровня; удаление окружения уносит статус (доработка `environments.repository.remove`: удалить `environment_statuses` и `domain_statuses` доменов — падающий случай в его тестах). Коммит `Добавить репозиторий статусов`.

### Task 6: Runner и сервис

- `status-runner.service.ts`: конструктор принимает репозиторий и проверщики; `runAll()` — по `listTargets()`: health для окружений, TLS+RDAP для доменов, upsert результатов; ошибки отдельных целей не прерывают обход. `onModuleInit`: интервал из `CAIRN_STATUS_CHECK_INTERVAL_MINUTES` (default 15, `0`/NaN — выключено), `onModuleDestroy` — clearInterval. Тест (Testcontainers, с подделками проверщиков): runAll пишет статусы обеих таблиц; ошибка одной цели не мешает другой.
- `status.service.ts`: `projectStatus`, `summary` (проксируют репозиторий), `runNow(subject)` — `runAll` + журнал `status_check.run` (новое действие в `AuditAction`). Тест: журнал после runNow.
- `status.controller.ts`: `GET /projects/:projectId/status` (SessionGuard), `GET /status/summary` (SessionGuard), `POST /status/run` (SessionGuard+SuperadminGuard, 202 → `{ ok: true }`). `status.module.ts` (+CryptoModule не нужен; Db, Access, Audit, Auth), подключить в `app.module.ts`.
- e2e `test/status.e2e.test.ts`: статус по уровням (metadata видит, без выдачи 404), summary содержит проект с выдачей и не содержит без, run — суперадмин 202/обычный 403, после run с подделкой... в e2e реальные проверщики: окружение без health_check_url — статус environments пустой/unknown; создать окружение с URL на несуществующий хост → после POST /status/run статус `down` с ошибкой (реальный fetch на localhost:1 — быстрый отказ). Индикатор проекта становится `down`.

Коммит `Добавить runner и HTTP-слой статуса`.

---

## Chunk 3: Интерфейс

### Task 7: Хуки и компоненты

- `useStatus.ts`: `useQueryProjectStatus(projectId)` (404/403 → null — секция может быть недоступна), `useQueryStatusSummary()`, `useMutationRunChecks(projectId?)` (инвалидация статуса и summary). Тест мутации.
- `StatusIndicator/`: точка + подпись (`INDICATOR_LABELS`: в порядке/предупреждение/авария/неизвестно/приостановлен; цвета tailwind: green/amber/red/gray/slate). Тест: подпись и `data-indicator`.
- `WarningsPanel/`: список предупреждений `kind → текст` («example.com: TLS истекает 2026-09-05»); пустой → null. Тест.
- `RunChecksButton/`: кнопка с состоянием «Проверяю…». Тест.

Коммит `Добавить компоненты статуса`.

### Task 8: Встраивание

- Сводка (`app/(app)/page.tsx` + `ProjectList`/`ProjectCard`): `ProjectCard` получает необязательный `indicator`; сводка грузит summary клиентским компонентом? Сводка серверная — проще: `ProjectList` остаётся, добавить клиентский `StatusStrip` на страницу: `WarningsPanel` из `useQueryStatusSummary` + передача индикаторов картам нельзя без переделки на клиент. Решение: сводка остаётся серверной; добавить клиентский блок `<SummaryStatus/>` над списком (предупреждения по всем проектам + перечень «проект → индикатор» бейджами со ссылками). Карточки не трогаем — индикатор живёт в этом блоке и на странице инфраструктуры.
- Страница инфраструктуры: `InfrastructureScreen` дополняется `useQueryProjectStatus`; статус окружения в `EnvironmentCard` (новый необязательный пропс `status`), сроки доменов списком под карточкой; `RunChecksButton` для суперадмина (признак — серверным пропсом со страницы, аналогично хронике: страница `infrastructure/page.tsx` становится серверной обёрткой с `/auth/me`).
- Тесты дополненных компонентов; полный прогон веба + typecheck.

Коммит `Показать статус на сводке и в инфраструктуре`.

---

## Chunk 4: Завершение

### Task 9: Сквозная проверка и документация

`scripts/e2e.mjs`: у окружения задать `healthCheckUrl: 'http://web:3000/login'` (изнутри compose доступен) при создании; после всех выдач — админ `POST /api/status/run` (202); `GET /api/projects/:id/status` → `environments[0].health === 'up'`, индикатор не `unknown`; `GET /api/status/summary` содержит проект; гость (metadata на инфраструктуре) видит статус; не-суперадмин на `/api/status/run` — 403.

README/CLAUDE.md: этап 6 (автостатус, интервал `CAIRN_STATUS_CHECK_INTERVAL_MINUTES`). Полная проверка + контейнерный прогон. Коммит `Завершить этап 6: автопроверки статуса`.

---

**Результат этапа 6:** статус проектов обновляется сам: система опрашивает health-check, следит за сроками TLS и доменов, сводка показывает индикаторы и предупреждения — именно то, что теряется первым, когда проектов больше трёх (ТЗ 6).
