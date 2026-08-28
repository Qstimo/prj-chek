# CAIRN этап 8 «MCP-доступ для агентов» — план реализации

> **Для исполнителя:** ОБЯЗАТЕЛЬНО веди работу через superpowers:executing-plans. Шаги — чекбоксами.

**Цель:** MCP-сервер с инструментами только на чтение; токены агентов как субъекты в общей модели прав.

**Архитектура:** таблица `agent_tokens` + субъект + шесть выдач закрытого профиля при создании; `@modelcontextprotocol/sdk` в stateless Streamable HTTP на `POST /api/mcp` с Bearer-аутентификацией; инструменты зовут существующие репозитории с `RequestSubject` токена; каждый вызов — `agent.tool_called` в журнале.

**Основание:** `docs/superpowers/specs/2026-08-28-cairn-stage8-design.md`.

---

## Правила

1. TDD; ни одного пишущего инструмента; значения переменных не попадают в записи журнала.
2. `reveal_variable` регистрируется только при включённом флаге.
3. Токен хэшируется; открытым показывается один раз.
4. Коммит после каждой задачи.

---

## Chunk 1: Токены

### Task 1: Контракт и таблица

`shared/schemas/agent-token.ts`: `agentTokenSchema { id, label, canRevealVariables, expiresAt, createdAt, lastUsedAt: nullable }`, `agentTokenCreateSchema { label: 1..200, ttlDays?: 1..3650 (default 90), canRevealVariables?: bool }`, `agentTokenUpdateSchema { canRevealVariables: bool }` (`.strict()`), `agentTokenCreatedSchema = agentTokenSchema + { token, mcpUrl }`. Тесты. `db/schema/agent-tokens.ts`: таблица по спеке 2 (unique `subject_id` — `agent_tokens_subject`, index по проекту). Тест схемы (уникальность, notNull expires_at/token_hash). Подключение (index/ALL_TABLES/TRUNCATE перед projects), миграция `0014_*` + `0015_agent_token_privileges.sql` (GRANT) + журнал + случай прав роли. Коммит `Добавить контракт и таблицу токенов агентов`.

### Task 2: Сервис токенов

`apps/api/src/agents/agent-tokens.service.ts` (+3 действия `AuditAction`: `agent_token.created/updated/revoked`):

- `create(actor, projectId, input)` → `{ row, token }`: транзакция — субъект (`kind: AgentToken`, label = имя), 6 выдач профиля (константа `DEFAULT_AGENT_PROFILE: [секция, уровень][]` — info/docs/roadmap/chronicle=read, variables/infrastructure=metadata; `grantedBy` = userId актора), строка agent_tokens (`token_hash: hashToken(generateToken())`, `expires_at = now + ttlDays`), журнал;
- `list(projectId)` → без хэшей;
- `setRevealFlag(actor, projectId, tokenId, value)` — журнал `updated` с полем;
- `revoke(actor, projectId, tokenId)` — `revoked_at` субъекта, журнал;
- `authenticate(token)` → `{ subject: RequestSubject, projectId, canRevealVariables } | null`: по хэшу, живой субъект, `expires_at > now`; обновляет `last_used_at`.

Тесты (Testcontainers): создание даёт ровно 6 выдач с нужными уровнями; токен аутентифицируется; отозванный/просроченный/мусорный → null; setRevealFlag и revoke пишут журнал. Коммит `Добавить сервис токенов агентов`.

### Task 3: HTTP управления

`agent-tokens.controller.ts` — `projects/:projectId/agent-tokens` (SessionGuard+SuperadminGuard): `GET` список, `POST` → 201 c `{ ...row, token, mcpUrl }` (`mcpUrl` = `CAIRN_WEB_URL /api/mcp`), `PATCH /:tokenId` флаг, `DELETE /:tokenId` отзыв 204. Модуль (Db/Access/Audit/Auth), app.module. e2e: создание отдаёт токен один раз (в списке хэшей и токенов нет), не-суперадмин 403, PATCH/DELETE работают. Коммит `Добавить управление токенами агентов`.

---

## Chunk 2: MCP-сервер

### Task 4: Зависимость и инструменты

`pnpm --filter @cairn/api add @modelcontextprotocol/sdk`. `apps/api/src/agents/mcp-tools.ts` — чистая фабрика: `registerTools(server: McpServer, deps: { subject, projectId, canRevealVariables, repos... })` — регистрирует 7 инструментов + условно `reveal_variable`. Каждый инструмент: zod-схема аргументов, вызов репозитория, ответ `content: [{ type: 'text', text: JSON.stringify(...) }]`; `search_docs` — ILIKE-выборка по title/content с фрагментом ±120 символов вокруг совпадения (метод `DocsRepository.search(subject, projectId, query)` — добавить с тестом: ищет по обоим полям, требует уровня read, чужой проект — SectionNotVisible).

### Task 5: HTTP-обработчик MCP

`mcp.controller.ts` — `POST /mcp` БЕЗ SessionGuard: Bearer из заголовка → `authenticate`; null → 401. На каждый запрос — новый `McpServer` + `StreamableHTTPServerTransport` в stateless-режиме (`sessionIdGenerator: undefined`), `registerTools`, `handleRequest(req.raw?, ...)` — в Nest нужен доступ к сырым req/res: `@Req()/@Res()` Express + `server.connect(transport)` + `transport.handleRequest(req, res, req.body)`. Журнал `agent.tool_called` (+1 действие) — обёрткой вокруг каждого handler'а фабрики: имя инструмента, аргументы без значений (для reveal_variable — только environment и key). Модуль/app.module.

e2e (supertest, JSON-RPC): `initialize` (протокол согласован); `tools/list` — 7 без флага, 8 с флагом; `tools/call get_project_info` возвращает паспорт; `search_docs` находит страницу по фрагменту содержимого; `list_variable_keys` без значений; `reveal_variable` с флагом возвращает значение, журнал получает `agent.tool_called` (subjectKind agent_token) и `variable.revealed`; без токена/с мусорным/после отзыва — 401. Заголовок `Accept: application/json, text/event-stream` обязателен для SDK — учесть в тестах.

Коммит `Добавить MCP-сервер`.

---

## Chunk 3: Интерфейс и завершение

### Task 6: Панель токенов

Хук `useAgentTokens.ts` (list/create/update/revoke, инвалидация). `AgentTokensPanel/` на экране доступов (`AccessScreen`): список (имя, срок `до …`, последний вызов, бейдж «значения переменных»), форма создания (имя, срок в днях, флаг с предупреждением «значения уйдут в контекст модели» — ТЗ 7.4), после создания — показ токена один раз (моно, копирование) + фрагмент конфигурации:

```json
{ "url": "https://…/api/mcp", "headers": { "Authorization": "Bearer <токен>" } }
```

Переключение флага, отзыв с подтверждением. Тесты компонента. Коммит `Добавить панель токенов агентов`.

### Task 7: Сквозная проверка и документация

`scripts/e2e.mjs`: админ создаёт токен (без флага) → JSON-RPC `initialize` + `tools/call get_project_info` (паспорт читается) + `list_variable_keys` (ключ есть, значения нет) + `tools/list` не содержит reveal → PATCH флаг → `reveal_variable` возвращает значение → журнал содержит `agent.tool_called` → отзыв → 401. README/CLAUDE.md: этап 8, продукт завершён; README — раздел «Подключение агента». Полная проверка + контейнерный прогон. Коммит `Завершить этап 8: MCP-доступ`.

---

**Результат:** все восемь этапов ТЗ реализованы. Агент читает документацию, паспорт, роадмап, хронику и ключи конфигурации по одному адресу с токеном; каждое обращение — в журнале с пометкой машины; значения переменных — только по явному решению администратора.
