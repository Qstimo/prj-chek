# Выравнивание снапшотов Drizzle — план реализации

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Снапшоты `drizzle/meta` снова описывают фактическую схему, и `drizzle-kit generate` перестаёт выдавать чужие операторы вместе с новыми.

**Architecture:** Одна миграция-выравнивание: генератор пишет снапшот, а её SQL опустошается. Операторы, которые генератор считает недостающими, уже применены миграциями 0023 и 0024, и повторять их нельзя — а снапшот нужен, потому что именно от него генератор отсчитывает следующую миграцию.

**Tech Stack:** Drizzle Kit 0.30.6, drizzle-orm 0.38.4, PostgreSQL 17.

**Основание:** находка ревью плана релизов по платформам. Эта работа — предварительная для `2026-10-07-cairn-releases-platforms.md`: без неё Chunk 2 того плана неисполним.

---

## Что не так

`0021_environment_host_into_domains.sql`, `0023_health_by_address.sql` и `0024_server_by_address.sql` писались руками через `drizzle-kit generate --custom`. В этом режиме генератор пишет снапшот **копией предыдущего**, не глядя на схему. В результате `meta/0022_snapshot.json`, `0023_snapshot.json` и `0024_snapshot.json` одинакового размера (60 158 байт) и описывают схему двухлетней… точнее, двухмиграционной давности:

| Что в снапшоте 0024 | Что в схеме сейчас |
|---|---|
| таблица `environment_statuses` | удалена (`0023_health_by_address.sql`) |
| `environments.health_check_url` | `environments.health_check_path` |
| `domain_statuses` без `health`, `latency_ms`, `health_error`, `resolved_ip`, `resolve_error` | все пять колонок есть |
| у `servers` нет индекса по `ip` | `servers_ip_idx` есть |

Пока никто не звал `generate`, это молчало. Первый же вызов выдаёт **десять посторонних операторов** вместе с настоящей миграцией — включая `DROP TABLE "environment_statuses" CASCADE` и пять `ADD COLUMN`, которые уже применены. Такую миграцию нельзя ни применить, ни отредактировать безопасно: применение падает на первом операторе, а удаление лишнего оставляет снапшот рассогласованным навсегда.

Хуже того: при наличии в схеме новых таблиц генератор видит удаление одной таблицы и появление других и **спрашивает в интерактивном режиме**, не переименование ли это. Без терминала процесс висит.

## Почему именно так, а не правкой JSON

Снапшот — 60 КБ машинного JSON с идентификаторами, связывающими цепочку (`id`, `prevId`). Править его руками значит отвечать за консистентность цепочки вместо генератора. Генератор умеет писать снапшот сам; нужно лишь не дать ему заодно написать SQL, который уже применён.

Опустошить SQL безопасно: операторы, которых генератор «не хватает», лежат в `0023_health_by_address.sql` и `0024_server_by_address.sql`, и чистая база получает их оттуда. Снапшот — метаданные генератора, а не источник схемы для `migrate`.

---

## Как работать с этим планом

| Что | Команда |
|---|---|
| Все тесты | `pnpm test` |
| Интеграционный набор API | `cd apps/api && npx vitest run src/roadmap/roadmap.repository.test.ts` |
| Миграция | `cd apps/api && npx drizzle-kit generate --name=<имя>` |

Шаги с генератором запускаются **в терминале**: генератор может задать вопрос.

---

## Task 1: Миграция-выравнивание

**Files:**
- Create: `apps/api/drizzle/0025_snapshot_realign.sql`
- Create: `apps/api/drizzle/meta/0025_snapshot.json` (генератором)
- Modify: `apps/api/drizzle/meta/_journal.json` (генератором)

- [ ] **Step 1: Убедиться, что дрейф именно такой**

Run:
```bash
cd apps/api && python3 - <<'PY'
import json
t = json.load(open('drizzle/meta/0024_snapshot.json'))['tables']
print('environment_statuses в снапшоте:', any(k.endswith('.environment_statuses') for k in t))
print('environments:', sorted(t['public.environments']['columns']))
print('domain_statuses:', sorted(t['public.domain_statuses']['columns']))
print('индексы servers:', list(t['public.servers']['indexes']))
PY
```
Expected: `True`; у `environments` присутствует `health_check_url` и отсутствует `health_check_path`; у `domain_statuses` семь колонок без `health`; индексов у `servers` нет.

Если вывод другой — дрейф уже чинили, и дальше идти не нужно.

- [ ] **Step 2: Сгенерировать выравнивание**

Run: `cd apps/api && npx drizzle-kit generate --name=snapshot_realign`
Expected: создан `0025_snapshot_realign.sql`, `meta/0025_snapshot.json` и запись в журнале.

Вопросов генератор задать не должен: новых таблиц в схеме нет, значит кандидатов на переименование у удаляемой `environment_statuses` тоже нет. Если вопрос всё же задан — ответить «удаление», а не «переименование».

- [ ] **Step 3: Проверить состав файла**

Run: `cd apps/api && grep -c ";" drizzle/0025_snapshot_realign.sql && cat drizzle/0025_snapshot_realign.sql`

Expected: ровно десять операторов, все — из списка ниже, и **ничего больше**:

```
ALTER TABLE "environment_statuses" DISABLE ROW LEVEL SECURITY;
DROP TABLE "environment_statuses" CASCADE;
ALTER TABLE "environments" ADD COLUMN "health_check_path" text;
ALTER TABLE "domain_statuses" ADD COLUMN "health" "health_state";
ALTER TABLE "domain_statuses" ADD COLUMN "latency_ms" integer;
ALTER TABLE "domain_statuses" ADD COLUMN "health_error" text;
ALTER TABLE "domain_statuses" ADD COLUMN "resolved_ip" text;
ALTER TABLE "domain_statuses" ADD COLUMN "resolve_error" text;
CREATE INDEX "servers_ip_idx" ON "servers" USING btree ("ip");
ALTER TABLE "environments" DROP COLUMN "health_check_url";
```

Любой оператор вне этого списка означает, что дрейф шире предполагаемого: остановиться и разобраться, а не продолжать.

- [ ] **Step 4: Опустошить SQL, оставив объяснение**

Заменить содержимое `0025_snapshot_realign.sql` целиком на:

```sql
--> Миграция без операторов: она существует ради снапшота.
--> 0021, 0023 и 0024 писались через `--custom`, а в этом режиме генератор
--> копирует предыдущий снапшот, не глядя на схему. К 0024 снапшот отстал
--> на две миграции, и первый же `generate` стал выдавать десять уже
--> применённых операторов вместе с новой миграцией.
--> Сами операторы лежат в 0023 и 0024, и чистая база получает их оттуда;
--> повторять их здесь нельзя — применение упало бы на первом же.
--> Снапшот рядом (meta/0025_snapshot.json) описывает фактическую схему,
--> и следующая миграция отсчитывается уже от него.
SELECT 1;
```

`SELECT 1;` оставлен намеренно: `migrate` в drizzle-orm пропускает файл без операторов молча, а с ним в журнале применений остаётся честная запись.

- [ ] **Step 5: Применить на чистой базе**

Run: `cd apps/api && npx vitest run src/roadmap/roadmap.repository.test.ts`
Expected: PASS. Набор поднимает PostgreSQL в контейнере и применяет все миграции с нуля — то есть проверяет, что выравнивание ничего не сломало и что схема чистой базы по-прежнему собирается из 0000–0025.

- [ ] **Step 6: Убедиться, что генератор успокоился**

Run: `cd apps/api && npx drizzle-kit generate --name=should_be_empty`
Expected: `No schema changes, nothing to migrate` — и ни файла, ни записи в журнале, ни снапшота (при пустом наборе операторов генератор возвращается до записи).

Если файл создан — выравнивание неполное: посмотреть, что в нём, и вернуться к Step 3.

- [ ] **Step 7: Коммит**

```bash
git add apps/api/drizzle
git commit -m "Выровнять снапшоты со схемой"
```

## Task 2: Правило, чтобы дрейф не вернулся

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Записать правило рядом с командами миграций**

В разделе про миграции `README.md` добавить:

```markdown
Структурные изменения схемы заводятся обычным `drizzle-kit generate`:
в этом режиме снапшот в `drizzle/meta` пишется по схеме, и следующая
миграция отсчитывается от него верно.

`--custom` — только для того, чего генератор не умеет: прав роли,
переноса данных, функций. В этом режиме снапшот копируется с предыдущего
**без оглядки на схему**, поэтому структурную правку руками обязательно
сопровождать выравниванием: отдельной `generate`-миграцией, SQL которой
опустошается (образец — `0025_snapshot_realign.sql`). Иначе первый же
`generate` выдаст чужие операторы вместе с новыми, а на схеме с новыми
таблицами ещё и спросит про переименование и повиснет без терминала.
```

- [ ] **Step 2: Коммит**

```bash
git add README.md
git commit -m "Объяснить, когда миграция пишется руками"
```

---

## Финальная проверка

- [ ] `cd apps/api && npx drizzle-kit generate --name=should_be_empty` — «No schema changes», файла нет.
- [ ] `pnpm test` — зелено (интеграционные наборы применяют миграции с нуля).
- [ ] `python3` из Task 1 Step 1 на снапшоте `0025`: `environment_statuses` отсутствует, у `environments` есть `health_check_path` и нет `health_check_url`, у `domain_statuses` двенадцать колонок, у `servers` есть `servers_ip_idx`.
