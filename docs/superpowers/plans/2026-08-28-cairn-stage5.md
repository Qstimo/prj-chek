# CAIRN этап 5 «Роадмап» — план реализации

> **Для исполнителя:** ОБЯЗАТЕЛЬНО веди работу через superpowers:executing-plans (или superpowers:subagent-driven-development, если доступны субагенты). Шаги отмечаются чекбоксами (`- [ ]`).

**Цель:** секция «Роадмап» — версии с чекпоинтами, вычисляемый прогресс, диаграмма и публичная ссылка; плюс «поднять запись хроники в чекпоинт».

**Архитектура:** модуль `apps/api/src/roadmap/` по рисунку секций 2–4: репозиторий с правами, проекция `projectByLevel` (метаданные — версия с прогрессом, подробность — чекпоинты), сервис с журналом, публичный контроллер без сессии по токену из `roadmap_public_links` (строка есть = опубликовано). Прогресс и стадия вычисляются в выборке.

**Стек:** прежний.

**Основание:** `docs/superpowers/specs/2026-08-28-cairn-stage5-design.md`.

---

## Ключевые правила для исполнителя

1. **TDD**: падающий тест → реализация → зелёный прогон → коммит.
2. **Права в репозитории**, субъект первым аргументом; чужое — `404`.
3. **Прогресс и стадия не хранятся** — только вычисляются.
4. **У чекпоинта нет** исполнителей, оценок, дат, комментариев, вложенности — не добавлять ни при каком рефакторинге (ТЗ 1.4).
5. **Каскадов нет**; чекпоинты версии удаляются явной строкой.
6. **Коммит после каждой задачи.**

---

## Структура файлов

**`packages/shared/src/`**: `enums.ts` (+`RoadmapVersionState`), `schemas/roadmap.ts`.

**`apps/api/src/db/schema/roadmap.ts`** — три таблицы; `index.ts`, `invariants.test.ts`, `test/db-fixture.ts` дополняются; миграции `0008_*` + `0009_roadmap_privileges.sql`.

**`apps/api/src/roadmap/`**: `roadmap.projection.ts`, `roadmap.repository.ts`, `roadmap.service.ts`, `roadmap.controller.ts` (секция + публичный), `roadmap.module.ts`.

**`apps/api/test/`**: `roadmap.e2e.test.ts`; `access-matrix.e2e.test.ts` дополняется.

**`apps/web/src/`**: хуки (`useQueryRoadmap.ts`, `useMutationRoadmap.ts`, `usePublicLink.ts`), компоненты (`RoadmapTimeline/`, `VersionCard/`, `VersionForm/`, `CheckpointForm/`, `PublicLinkPanel/`, `PromoteToCheckpoint/`), страницы `app/(app)/projects/[id]/roadmap/` и `app/roadmap/[token]/` (публичная, вне группы `(app)`), правки `ProjectSections` и `ChronicleScreen`.

**`scripts/e2e.mjs`** — сценарий роадмапа.

---

## Chunk 1: Контракт и схема данных

### Task 1: Контракт роадмапа

**Files:** `packages/shared/src/enums.ts`, `schemas/roadmap.ts`, `index.ts`; Test: `schemas/roadmap.test.ts`.

- [ ] Падающий тест: создание версии требует `label` (непустой, ≤100); `plannedDate` — ISO-дата или null; чекпоинт требует `title`; правка частична; **схемы не принимают лишних полей** — `roadmapCheckpointCreateSchema.parse({ title: 'X', assignee: 'y' })` не содержит `assignee` (страховка ТЗ 1.4; используем `.strict()` — тест ждёт `throw`).
- [ ] Реализация:

```typescript
/** Состояние версии роадмапа. Намерение, задаётся вручную (ТЗ 3.5). */
export enum RoadmapVersionState {
  Planned = 'planned',
  InProgress = 'in_progress',
  Released = 'released',
}
```

`schemas/roadmap.ts`: `roadmapCheckpointSchema { id, title, isDone, position }`; `roadmapVersionMetadataSchema { id, label, state, plannedDate: nullable, position, progress: { done, total } }`; `roadmapVersionDetailSchema = metadata + { checkpoints: [] }`; `roadmapResponseSchema { stage: { current: number|null, total: number }, versions: [] }` (versions — metadata|detail); `roadmapVersionCreateSchema/UpdateSchema` (`.strict()`), `roadmapCheckpointCreateSchema/UpdateSchema` (`.strict()`: `title?`, `isDone?`, `position?`); `publicLinkSchema { token, url }`; `publicRoadmapSchema { projectName, stage, versions: detail[] }`. Типы экспортом.

- [ ] PASS → build → **Коммит** `Добавить контракт роадмапа`.

### Task 2: Таблицы и миграция

**Files:** `db/schema/roadmap.ts`, `index.ts`, `invariants.test.ts`, `db-fixture.ts`, `drizzle/0008_*` + `0009_roadmap_privileges.sql`; Test: `db/schema/roadmap.test.ts`.

- [ ] Падающий тест: enum состояния совпадает с контрактом; `label` уникален в проекте (`roadmap_versions_project_label`); `project_id` у публичной ссылки уникален (`roadmap_public_links_project`); у чекпоинтов **нет колонок** `assignee`/`due_date`/`estimate` (страховка ТЗ 1.4 на уровне схемы).
- [ ] Таблицы по образцу прежних (`restrict` везде): `roadmapVersions` (unique `(project_id, label)`, index по проекту), `roadmapCheckpoints` (index по версии), `roadmapPublicLinks` (unique `project_id`, unique `token`). Подключение в `index.ts` (алфавит), `ALL_TABLES` (+3), `TRUNCATE` (+3 перед `projects`: `roadmap_public_links, roadmap_checkpoints, roadmap_versions`).
- [ ] `db:generate` (без `DROP`), `0009`: `GRANT SELECT, INSERT, UPDATE, DELETE ON roadmap_versions, roadmap_checkpoints, roadmap_public_links TO cairn_app;`, регистрация в `_journal.json` (python-приём этапа 4). Случай в `environments-privileges.test.ts`.
- [ ] PASS → **Коммит** `Добавить таблицы роадмапа`.

---

## Chunk 2: Данные и журнал

### Task 3: Проекция, репозиторий

**Files:** `roadmap/roadmap.projection.ts`, `roadmap.repository.ts`; тесты рядом.

Проекция: `versionProjection(row, checkpoints, level)` через `projectByLevel` — метаданные `{ id, label, state, plannedDate, position, progress: { done: закрытые, total: все } }`, подробность `{ checkpoints }`. Тесты: метаданные без формулировок, прогресс считается, `read` содержит чекпоинты.

Репозиторий (Testcontainers, обвязка секций; `Section.Roadmap`):

- `findForProject(subject, projectId)` → `{ stage, versions }`: версии по `position`, чекпоинты по `position`, проекция по уровню; **стадия**: `current` = позиция (1-based) первой `in_progress`, иначе первой `planned`, все `released` — `total`, нет версий — `null`;
- `createVersion` (`position = max+1`), `updateVersion`, `removeVersion` (чекпоинты явной строкой), `createCheckpoint` (`position = max+1`), `updateCheckpoint`, `removeCheckpoint`;
- публичная ссылка: `findPublicLink(projectId)`, `publish(tx, projectId)` (существует — `ConflictException`), `unpublish(tx, projectId)` (нет — `NotFoundException`), `findByPublicToken(token)` → `{ projectId, projectName } | null`;
- `publicRoadmap(token)` → полный роадмап (уровень чтения) без субъекта — публичный путь работает **только** через токен.

Ключевые случаи тестов: уровни (list `metadata+`, правка `write`), прогресс `1/2`, стадия по трём раскладам, уникальный label, чужой проект/версия/чекпоинт — `SectionNotVisibleError`, удаление версии стирает чекпоинты, публичный токен: валиден/мусор/после unpublish.

**Коммит** `Добавить репозиторий роадмапа`.

### Task 4: Сервис с журналом

**Files:** `audit.types.ts` (+8 действий из спеки 5), `roadmap.service.ts`; тест рядом.

Действия: `roadmap_version.created/updated/deleted`, `checkpoint.created/updated/deleted`, `roadmap.published`, `roadmap.unpublished`. Сервис по рисунку секций: транзакция + журнал; чтения (`get`, `publicRoadmap`, `findPublicLink`) без журнала — публичная страница не пишет в журнал (анонимное чтение, субъекта нет). Тесты: создание версии/чекпоинта пишет обозначение/формулировку; удаление версии пишет label; публикация/отключение — суперадминский актор; отказ — без следов.

**Коммит** `Добавить сервис роадмапа с журналом`.

---

## Chunk 3: HTTP и матрица

### Task 5: Контроллеры

**Files:** `roadmap.controller.ts` (два контроллера: `projects/:projectId/roadmap` под SessionGuard; `public/roadmap` без guard'ов), `roadmap.module.ts`, `app.module.ts`; Test: `test/roadmap.e2e.test.ts`.

Маршруты из спеки 5. Публикация: `POST public-link` — `@UseGuards(SessionGuard, SuperadminGuard)`, `201` с `{ token, url }` (`url` = `CAIRN_WEB_URL /roadmap/token`); `GET public-link` — уровень `read` через `AccessService.requireLevel` (как intake-address); `DELETE` — суперадмин, `204`. Публичный: `GET /public/roadmap/:token` → `404` на мусор.

Тесты e2e: CRUD версии (`201`, label в ответе), чекпоинта, переключение `isDone` через PATCH, прогресс в ответе `GET roadmap`, `metadata`-гость не видит формулировок, `write`-операции с уровнем `read` — `403`, публичный маршрут без cookie отдаёт формулировки, мусорный токен `404`, повторная публикация `409`, после `DELETE` прежний токен `404`, `401` без входа на секции.

**Коммит** `Добавить HTTP-слой роадмапа`.

### Task 6: Матрица доступа

`access-matrix.e2e.test.ts`, блок по образцу переменных (`signInWithSection(Section.Roadmap, ...)`); данные — версия с чекпоинтом через админский HTTP в `beforeEach`:

| level | list | формулировки | create version |
|---|---|---|---|
| null | 404 | — | 404 |
| metadata | 200 | скрыты | 403 |
| read | 200 | видны | 403 |
| write | 200 | видны | 201 |

**Коммит** `Добавить матрицу доступа для роадмапа`.

---

## Chunk 4: Интерфейс

### Task 7: Хуки

`useQueryRoadmap(projectId)`; `useMutationRoadmap.ts`: версии (create/update/delete), чекпоинты (create/update/delete — инвалидация ключа роадмапа); `usePublicLink.ts`: `useQueryPublicLink` (404→`null`, как intake), `useMutationPublishRoadmap`, `useMutationUnpublishRoadmap`. Тест мутаций по образцу. **Коммит** `Добавить хуки роадмапа`.

### Task 8: Диаграмма

`RoadmapTimeline/` — чистый SVG-компонент. Пропсы: `versions: { id, label, state, progress }[]`, `currentIndex: number | null`. Рисунок: линия, круги r=16 с шагом, сектор-«пирог» долей `done/total` (path-арк от 12 часов по часовой; полный круг — отдельный `circle`, арк на 100% вырождается), `released` — всегда полный, текущая — внешнее кольцо (`data-current`), подписи под отметками. Вспомогательная `sectorPath(cx, cy, r, fraction)` экспортируется и тестируется отдельно (0 → пусто, 0.5 → полукруг с ожидаемыми координатами, 1 → полный круг флагом). Тесты разметки: у `released` полный круг, у текущей кольцо, подписи присутствуют.

**Коммит** `Добавить диаграмму роадмапа`.

### Task 9: Карточки, формы, публичная панель

- `VersionCard/` (+`CheckpointList` внутри): обозначение, состояние (подписи `STATE_LABELS`), дата, прогресс `1/2`; чекпоинты списком: при `read` — текст + признак; при `write` — галочка-переключатель (`onToggle`), правка/удаление версии и чекпоинта с подтверждением на месте (переиспользуй рисунок `EntryActions`);
- `VersionForm/` (label, дата `type="date"`, состояние select, при правке — позиция числом), `CheckpointForm/` (формулировка);
- `PublicLinkPanel/` по образцу `IntakeAddressPanel`: включение с предупреждением «страница станет доступна всем, у кого есть ссылка», копирование, отключение с подтверждением; не-суперадмину с `read` — только просмотр ссылки или «не опубликовано».

Тесты каждого компонента (пример набора: формулировки не рендерятся без них в данных; галочка зовёт `onToggle`; панель — предупреждение и подтверждение). **Коммит** `Добавить компоненты роадмапа`.

### Task 10: Страницы и «В чекпоинт»

- `app/(app)/projects/[id]/roadmap/page.tsx` + `RoadmapScreen.tsx`: таймлайн (данные из `useQueryRoadmap`, `currentIndex` из `stage`), карточки версий, формы, панель ссылки (признак суперадмина — серверным пропсом, как в хронике); `ProjectSections` — ссылка «Роадмап» (+2 теста);
- публичная страница `app/roadmap/[token]/page.tsx` — **вне группы `(app)`** (без разметки с навигацией и без редиректов на вход): серверный `fetch` на `${serverApiUrl()}/public/roadmap/${token}` без cookie; `404` → `notFound()`; рендер: название, таймлайн, версии с чекпоинтами (только чтение);
- `PromoteToCheckpoint/` в хронике: кнопка «В чекпоинт» в `ChronicleEntry` при `canPromote` (новый необязательный пропс; `ChronicleScreen` передаёт `sections[Section.Roadmap] === write` и список версий из `useQueryRoadmap` — запрос включается только при праве); разворачивается на месте: select версии + input с заголовком записи, отправка через `useMutationCreateCheckpoint`.

Полный прогон веба + typecheck. **Коммит** `Добавить экран и публичную страницу роадмапа`.

---

## Chunk 5: Завершение

### Task 11: Сквозная проверка и документация

`scripts/e2e.mjs` — в сценарий админа: создать версию `v1.0` с двумя чекпоинтами, закрыть один (PATCH `isDone`), проверить `progress { done: 1, total: 2 }` в `GET roadmap`; выдать гостю `metadata` на `roadmap`; опубликовать ссылку (`201`, критично). Гость: версии с прогрессом видны, формулировок нет в тексте ответа. Машинный агент без cookie: `GET /api/public/roadmap/:token` — `200`, формулировка видна; после `DELETE public-link` — `404`. Плюс страница `/roadmap/:token` до отключения — `200`.

README + CLAUDE.md: этап 5 реализован (упомянуть публичную ссылку). Полная проверка: build shared, `pnpm test`, `typecheck`, `build`. Сквозной прогон на чистой системе (порты 18080/18443). **Коммит** `Завершить этап 5: роадмап`.

---

**Результат этапа 5:** у проекта есть последовательность версий с чекпоинтами; прогресс и стадия вычисляются; диаграмма читается за две секунды; роадмап — единственная секция с публичной ссылкой, включаемой и гасимой администратором; запись хроники поднимается в чекпоинт одним действием.
