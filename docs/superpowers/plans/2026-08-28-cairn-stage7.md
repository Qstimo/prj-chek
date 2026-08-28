# CAIRN этап 7 «Документация» — план реализации

> **Для исполнителя:** ОБЯЗАТЕЛЬНО веди работу через superpowers:executing-plans (или superpowers:subagent-driven-development, если доступны субагенты). Шаги отмечаются чекбоксами (`- [ ]`).

**Цель:** секция «Документация» — Markdown-страницы «как это устроено сейчас», подъём записей хроники в страницы.

**Архитектура:** модуль `apps/api/src/docs/` в точности по рисунку хроники (без канала); Markdown — собственный безопасный парсер+рендер на веб-стороне без зависимостей; подъём из хроники — панель поверх обычного `POST`.

**Основание:** `docs/superpowers/specs/2026-08-28-cairn-stage7-design.md`.

---

## Правила

1. TDD; права в репозитории; чужое — `404`; каскадов нет; журнал в транзакции; коммит на задачу.
2. Никакого `dangerouslySetInnerHTML` — рендер только React-элементами.
3. Содержимое страниц в журнал не пишется.

---

## Chunk 1: Контракт и схема

### Task 1: Контракт документации

`packages/shared/src/schemas/doc.ts`: `docPageMetadataSchema { id, title, updatedAt }`, `docPageDetailSchema + { content, createdAt }`, `docPageCreateSchema { title: trim 1..300, content: max 200_000 }`, `docPageUpdateSchema = partial`. Тест: создание требует заголовок и содержимое; правка частична. Экспорт в `index.ts`. Коммит `Добавить контракт документации`.

### Task 2: Таблица и миграция

`db/schema/docs.ts`: `docPages` (unique `(project_id, title)` — `doc_pages_project_title`, index по проекту, `created_by_subject_id` restrict). Тест схемы. Подключение (index, ALL_TABLES, TRUNCATE перед projects). `db:generate` → `0012_*`; `0013_doc_privileges.sql` + регистрация; случай прав роли. Коммит `Добавить таблицу страниц документации`.

---

## Chunk 2: Данные и HTTP

### Task 3: Репозиторий, сервис, контроллер

Точно по рисунку хроники (проекция `docPageProjection` через `projectByLevel`; `DocsRepository` — `findForProject` (сортировка по title), `findById`, `create`, `update` (уникальность заголовка даст ошибку БД), `remove`; `DocsService` с журналом `doc_page.created/updated/deleted` (+3 действия в `AuditAction`; метаданные — title и fields, содержимого нет — тест это проверяет строкой content в JSON журнала); `DocsController` `projects/:projectId/docs` + модуль + `app.module.ts`).

Тесты: репозиторий (уровни: список `metadata+`, содержимое скрыто на metadata, создание `write`; уникальный заголовок; чужой проект), сервис (журнал; отказ без следов; содержимое не в журнале), e2e HTTP (CRUD, 401/404/403). Коммит `Добавить секцию документации в API`.

### Task 4: Матрица доступа

Блок `describe.each` по образцу хроники (`Section.Docs`): `list 404/200/200/200`, содержимое скрыто/видно, `create 404/403/403/201`. Страница заводится админом по HTTP в `beforeEach`. Полный прогон API. Коммит `Добавить матрицу доступа для документации`.

---

## Chunk 3: Markdown

### Task 5: Парсер

`apps/web/src/components/Markdown/parseMarkdown.ts` — типы блоков:

```typescript
type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; href: string };

type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; inlines: Inline[] }
  | { kind: 'paragraph'; inlines: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'codeBlock'; text: string };
```

Тесты (TDD): заголовки трёх уровней; `####` — обычный абзац; маркированный и нумерованный списки; кодовый блок с сохранением строк и без разбора инлайнов; строчный код внутри абзаца; жирный и курсив; ссылка http/https → link; `javascript:alert(1)` → текст, не ссылка; пустые строки разделяют абзацы; смешанный документ.

### Task 6: Рендер

`Markdown.tsx` — блоки в React-элементы (`h2/h3/h4` со стилями — h1 страницы занят заголовком, уровень+1; `ul/ol`, `pre><code`, `p`, `strong/em/code`, `a` с `rel="noopener noreferrer" target="_blank"`). Тесты разметки: заголовок рендерится, ссылка имеет href, `javascript:` не становится ссылкой, кодовый блок сохраняет текст. Коммит `Добавить безопасный рендер Markdown`.

---

## Chunk 4: Интерфейс

### Task 7: Хуки и компоненты

- `useDocs.ts`: `useQueryDocs(projectId)`, `useQueryDocPage(projectId, pageId | null)` (enabled), мутации create/update/delete с инвалидацией. Тест мутаций.
- `DocPageList/` (заголовки с датами, выбор, пустые состояния для читателя/пишущего), `DocPageView/` (заголовок + `<Markdown>`), `DocPageForm/` (title + textarea `font-mono`, при правке предзаполнена), удаление с подтверждением (рисунок EntryActions). Тесты.

Коммит `Добавить компоненты документации`.

### Task 8: Страница, навигация, подъём из хроники

- `app/(app)/projects/[id]/docs/page.tsx` + `DocsScreen.tsx`: список слева/сверху, просмотр выбранной (ленивая загрузка содержимого `useQueryDocPage`), форма создания/правки, `canWrite` из карты секций.
- `ProjectSections`: ссылка «Документация» (+2 теста).
- `PromoteToDoc/` в хронике: кнопка «В документацию» в `ChronicleEntry` (`onPromoteToDoc`, видна при `write` на Docs), панель: title (из заголовка) + content (из содержимого записи — есть только на уровне чтения записи: кнопку показываем при наличии `content` в проекции), отправка `useMutationCreateDocPage`. Прокладка через `ChronicleList`/`ChronicleScreen` — как для чекпоинта. Тест компонента.

Полный прогон веба + typecheck. Коммит `Добавить экран документации и подъём из хроники`.

---

## Chunk 5: Завершение

### Task 9: Сквозная проверка и документация

`scripts/e2e.mjs`: выдать гостю `metadata` на `docs`; админ создаёт страницу «Развёртывание» с Markdown (`# Заголовок`, блок кода); гость видит title без содержимого; админ читает содержимое. README/CLAUDE.md: этап 7. Полная проверка + контейнерный прогон. Коммит `Завершить этап 7: документация`.

---

**Результат этапа 7:** у проекта есть страницы «как это устроено сейчас» с безопасным Markdown; запись хроники поднимается и в чекпоинт, и в страницу; остаётся последний этап — MCP-доступ, которому уже есть что читать (ТЗ 10, пункт 8).
