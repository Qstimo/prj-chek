# Панель версии: один черновик, одна кнопка — план реализации

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Поля версии и клетки выпусков собираются в черновик и уходят одной кнопкой «Сохранить» в прилипающей шапке панели; у выпуска появляются дата и обозначение сборки; `releasedDate` при платформах отвергается на сервере; удаление платформы спрашивает подтверждение; селекты получают общий вид.

**Architecture:** Шесть частей по возрастанию связности. Сервер первым — он закрывает инвариант и ничего не ломает в интерфейсе. Затем общие компоненты (`Select`, `ConfirmDialog`, шапка `Drawer`), на которые опирается всё остальное. Затем черновик панели: чистые функции разницы, поля версии, клетка выпуска, сама панель. Затем связь с мутациями. Потом удаление платформы и доводка документации.

**Tech Stack:** pnpm workspaces, NestJS, Drizzle + PostgreSQL, zod в `packages/shared`, Next.js 15, Vitest + React Testing Library, Testcontainers.

**Основание:** `docs/superpowers/specs/2026-10-13-cairn-version-drawer-draft-design.md`

---

## Как работать с этим планом

TDD: сначала падающий тест, затем реализация. Линтера в проекте нет.

| Что | Команда |
|---|---|
| Все тесты | `pnpm test` |
| Точечно API | `cd apps/api && npx vitest run src/путь` |
| Точечно веб | `cd apps/web && npx vitest run src/путь` |
| Типы | `pnpm typecheck` |

Соглашения: компонент до 100 строк в своей директории с `index.ts`, пропсы — `IProps` в `types.ts`, TSDoc на русском, `any` запрещён, массивы и объекты из JSX — в `constants.ts`.

**Осторожно с `pnpm --filter ... test -- --run <путь>`**: двойное `--` съедает фильтр, и запускается весь набор, включая Testcontainers. Точечно — через `npx vitest run` из каталога приложения.

**Схема базы не меняется, миграции нет.** Ни одной новой колонки: число унесённых выпусков считается при удалении, черновик живёт в памяти браузера.

### Структура файлов

| Файл | Ответственность |
|---|---|
| `apps/api/src/roadmap/roadmap.repository.ts` | отказ `409` на `releasedDate` при платформах |
| `apps/api/src/platforms/platforms.repository.ts` | `remove` возвращает число унесённых выпусков |
| `apps/api/src/platforms/platforms.service.ts` | число выпусков в метаданных журнала |
| `apps/web/src/assets/icons/ChevronDownIcon.tsx` | стрелка селекта |
| `apps/web/src/components/Select/` | общий контрол выбора |
| `apps/web/src/components/ConfirmDialog/` | общее подтверждение действия |
| `apps/web/src/components/Drawer/Drawer.tsx` | прилипающая шапка и слот `actions` |
| `apps/web/src/components/VersionFields/` | поля версии без кнопок |
| `apps/web/src/components/VersionDrawer/utils.ts` | `versionPatchOf`, `releaseOpsOf`, `isDirtyOf` |
| `apps/web/src/components/VersionDrawer/ReleaseRow.tsx` | клетка выпуска: состояние, дата, сборка |
| `apps/web/src/components/PlatformsField/PlatformsField.tsx` | подтверждение удаления платформы |
| `apps/web/src/api/hooks/useMutationSaveVersion.ts` | патч версии и операции выпусков одной мутацией |

---

## Chunk 1: Сервер

### Task 1.1: `409` на `releasedDate` у проекта с платформами

**Files:**
- Modify: `apps/api/src/roadmap/roadmap.repository.ts`
- Modify: `apps/api/src/roadmap/roadmap.repository.test.ts`

- [ ] **Step 1: Падающие тесты**

В `describe` правки версии (рядом с «пишет дату релиза» на строках ~220):

```ts
it('отвергает дату релиза у проекта с платформами', async () => {
  // Дизайн релизов §6: дата версии вычисляется из выпусков, и запись
  // в колонку завела бы вторую правду уже после появления первой.
  await platform(project.id, 'API', PlatformKind.Server);

  await expect(
    repository.updateVersion(superadmin, tx, project.id, version.id, {
      releasedDate: '2026-09-01',
    }),
  ).rejects.toThrow(ConflictException);
});

it('отвергает и обнуление даты релиза у проекта с платформами', async () => {
  // Отвергается присутствие ключа, а не значение: `null` — такая же
  // запись в колонку.
  ...{ releasedDate: null } → ConflictException
});

it('создание версии с датой релиза при платформах тоже отвергается', async () => {
  ...createVersion(..., { label: 'v2', releasedDate: '2026-09-01' }) → ConflictException
});

it('у проекта без платформ дата релиза пишется как прежде', async () => {
  // Существующий тест остаётся зелёным — проверка смотрит на платформы,
  // а не на само поле.
});
```

Платформу в тестах заводить вставкой в таблицу, как уже делает файл (комментарий на строке ~123: репозиторий платформ потребовал бы доступа к «Инфо»).

- [ ] **Step 2: Реализация**

Приватный метод репозитория:

```ts
/**
 * Дата релиза у проекта с платформами задаётся выпуском, а не версией.
 *
 * Отвергается присутствие ключа, а не значение: `null` — такая же запись
 * в колонку, как и дата. Случай «платформы завели позже, в колонке
 * прежняя дата» остаётся без прямой починки сознательно (дизайн §6):
 * первый же выпущенный выпуск перекрывает хранимую дату.
 */
private async requireNoStoredReleasedDate(
  tx: Transaction,
  projectId: string,
  input: { releasedDate?: string | null },
): Promise<void>
```

Проверяет `'releasedDate' in input`, затем наличие хотя бы одной строки `projectPlatforms` проекта (`limit(1)`), и бросает `ConflictException('Дата релиза задаётся выпуском платформы.')`.

Зовётся в `createVersion` и `updateVersion` после проверки права и до записи.

- [ ] **Step 3: Проверка**

`cd apps/api && npx vitest run src/roadmap/roadmap.repository.test.ts`

### Task 1.2: Число унесённых выпусков в журнале

**Files:**
- Modify: `apps/api/src/platforms/platforms.repository.ts`
- Modify: `apps/api/src/platforms/platforms.service.ts`
- Modify: `apps/api/src/platforms/platforms.repository.test.ts`
- Modify: `apps/api/src/platforms/platforms.service.test.ts`

- [ ] **Step 1: Падающие тесты**

В `platforms.repository.test.ts`, дополняя существующий «удаление платформы снимает выпуски, теги и связи» (строка ~192):

```ts
it('сообщает, сколько выпусков унесло удаление', async () => {
  // Выпуски — единственное место, где у проекта с платформами живут
  // фактические даты релизов. Журнал обязан назвать потерю числом.
  // две версии с выпусками на этой платформе
  const removed = await repository.remove(superadmin, tx, project.id, platform.id);

  expect(removed.releases).toBe(2);
});
```

В `platforms.service.test.ts` — метаданные записи журнала содержат `{ name: 'App Store', releases: 2 }`.

- [ ] **Step 2: Реализация**

`remove` возвращает `ProjectPlatformRow & { releases: number }`: удаление выпусков идёт с `.returning({ id: versionPlatformReleases.versionId })`, длина массива — число. Служба кладёт его в `metadata` (`metadata?: Record<string, unknown>`, новых типов не нужно).

- [ ] **Step 3: Проверка**

`cd apps/api && npx vitest run src/platforms`

### Task 1.3: Весь набор API

- [ ] `cd apps/api && npx vitest run` и `pnpm typecheck`

---

## Chunk 2: Общие компоненты

### Task 2.1: `Select` и иконка стрелки

**Files:**
- Create: `apps/web/src/assets/icons/{ChevronDownIcon.tsx,index.ts}`
- Create: `apps/web/src/components/Select/{Select.tsx,types.ts,Select.test.tsx,index.ts}`

- [ ] **Step 1: Падающие тесты** (`Select.test.tsx`)

- отдаёт выбранное значение в `onChange`;
- находится по `aria-label`, когда подписи рядом нет;
- связывается с подписью по `id`;
- показывает переданные `children` как опции.

- [ ] **Step 2: Реализация**

`IProps`: `value`, `onChange(value: string)`, `children`, необязательные `id`, `aria-label`, `disabled`. Разметка — обёртка `relative`, нативный `<select>` с `appearance-none h-9 w-full rounded-md border border-border bg-surface px-3 pr-8 text-sm transition focus:border-border-strong`, иконка абсолютом справа с `pointer-events-none`.

Иконка — функциональный компонент со `<svg aria-hidden="true">`; каталог `assets/icons/` заводится здесь.

- [ ] **Step 3: Проверка** `cd apps/web && npx vitest run src/components/Select`

### Task 2.2: Замена нативных селектов на `Select`

**Files (по одному `<select>` в каждом):**
- `apps/web/src/components/VersionForm/StateField.tsx`
- `apps/web/src/components/ProjectForm/LifecycleField.tsx`
- `apps/web/src/components/EnvironmentForm/{KindField.tsx,ServerField.tsx}`
- `apps/web/src/components/DomainAddressForm/SubdomainFields.tsx`
- `apps/web/src/components/PlatformsField/CustomPlatformForm.tsx`
- `apps/web/src/components/PromoteToCheckpoint/PromoteToCheckpoint.tsx`
- `apps/web/src/components/AccessMatrix/AccessMatrix.tsx`
- `apps/web/src/components/UserGrantsMatrix/{UserGrantsMatrix.tsx,AddProjectField.tsx}`

- [ ] **Step 1**: ничего не пишем — тесты этих мест уже есть и обязаны остаться зелёными без правок. Это и есть проверка: `userEvent.selectOptions` работает с нативным контролом.
- [ ] **Step 2**: заменить разметку, снять собственные классы рамки и отступов, подпись оставить как была (`htmlFor`/`aria-label`).
- [ ] **Step 3**: `cd apps/web && npx vitest run` — весь набор веба зелёный.

`ReleaseRow` в этом списке нет: он переписывается целиком в Chunk 3.

### Task 2.3: `ConfirmDialog`

**Files:**
- Create: `apps/web/src/components/ConfirmDialog/{ConfirmDialog.tsx,types.ts,ConfirmDialog.test.tsx,index.ts}`

- [ ] **Step 1: Падающие тесты**

- находится по роли `dialog` и подписи;
- «подтвердить» зовёт `onConfirm`, «отмена» — `onCancel`;
- подпись кнопки подтверждения задаётся пропом.

- [ ] **Step 2: Реализация**

По образцу `ServerList/DeleteConfirmDialog`: блок `role="dialog"` с `aria-label`, вопрос как `children`, две кнопки. `IProps`: `label`, `confirmLabel`, `onConfirm`, `onCancel`, `children`. Браузерный `confirm()` не используется — он не поддаётся тестам.

Существующие три диалога (`ServerList`, `DomainList`, `UserCard`) не переписываются (дизайн §13).

- [ ] **Step 3: Проверка** `cd apps/web && npx vitest run src/components/ConfirmDialog`

### Task 2.4: Прилипающая шапка и слот действий в `Drawer`

**Files:**
- Modify: `apps/web/src/components/Drawer/{Drawer.tsx,types.ts,Drawer.test.tsx}`

- [ ] **Step 1: Падающие тесты**

- переданный `actions` показывается в панели;
- без `actions` шапка выглядит как прежде (кнопка «Закрыть» на месте).

- [ ] **Step 2: Реализация**

`actions?: ReactNode` в `IProps`; в шапке — `actions` слева от `Dialog.Close`. Шапка получает `sticky top-0 z-10 -mx-6 -mt-6 mb-0 bg-background px-6 pt-6 pb-4`: контент панели имеет свой `p-6`, и шапка должна перекрывать его по ширине, иначе из-под неё при прокрутке будет видно текст.

- [ ] **Step 3: Проверка** `cd apps/web && npx vitest run src/components/Drawer`

---

## Chunk 3: Черновик панели

### Task 3.1: Чистые функции разницы

**Files:**
- Modify: `apps/web/src/components/VersionDrawer/{utils.ts,utils.test.ts,types.ts}`

- [ ] **Step 1: Падающие тесты** — таблицей случаев, без рендера:

`versionPatchOf(version, draft, hasPlatforms)`:
- черновик равен версии → `{}`;
- изменено одно поле → только оно;
- пустая строка в дате → `null` в патче;
- `releasedDate` изменён, платформы есть → ключа в патче нет;
- `releasedDate` изменён, платформ нет → ключ есть.

`releaseOpsOf(version, draft)`:
- клетка не менялась → операций нет;
- новая клетка → `{ kind: 'set' }` со всей тройкой;
- изменена только дата → `{ kind: 'set' }` со всей тройкой (`PUT` заменяет клетку целиком);
- клетка снята в прочерк → `{ kind: 'clear' }`;
- порядок операций — порядок платформ.

`isDirtyOf`: пусто+пусто → `false`; любой из двух непустой → `true`.

- [ ] **Step 2: Реализация**

Типы `IVersionDraft`, `IReleaseCell`, `ReleaseOp` — в `types.ts`. Функции — в `utils.ts` рядом с существующим `isDetailed`. Пустая строка в полях черновика означает «не задано» и уходит в контракт как `null`.

- [ ] **Step 3: Проверка** `cd apps/web && npx vitest run src/components/VersionDrawer/utils.test.ts`

### Task 3.2: Поля версии отдельно от формы

**Files:**
- Create: `apps/web/src/components/VersionFields/{VersionFields.tsx,types.ts,VersionFields.test.tsx,index.ts}`
- Modify: `apps/web/src/components/VersionForm/{VersionForm.tsx,VersionForm.test.tsx}`

- [ ] **Step 1: Падающие тесты**

`VersionFields`: показывает обозначение, состояние и плановую дату; «Дата релиза» видна только при состоянии «выпущена» и отсутствии платформ; правка поля зовёт `onChange` с новым черновиком.

`VersionForm`: существующие тесты остаются зелёными — поведение прежнее, меняется только внутреннее устройство.

- [ ] **Step 2: Реализация**

`VersionFields` принимает `draft`, `onChange`, `hasPlatforms`. Подстановка сегодняшней даты при переходе в «выпущена» переезжает сюда из `VersionForm`. `VersionForm` остаётся обёрткой: своё состояние черновика, `VersionFields` и `FormActions`.

- [ ] **Step 3: Проверка** `cd apps/web && npx vitest run src/components/Version`

### Task 3.3: Клетка выпуска — состояние, дата, сборка

**Files:**
- Modify: `apps/web/src/components/VersionDrawer/{ReleaseRow.tsx,ReleaseList.tsx}`
- Modify: `apps/web/src/components/VersionDrawer/VersionDrawer.test.tsx`

- [ ] **Step 1: Падающие тесты**

- поле даты появляется при выборе «в релизе» и подставляет сегодняшнюю;
- дату можно исправить, в том числе на прошлое число;
- обозначение сборки правится, подсказка поля — обозначение версии;
- прочерк «как у версии» убирает дату и сборку;
- подписи органов называют платформу («Дата App Store»);
- без `actions` органов нет, значения видны.

- [ ] **Step 2: Реализация**

`ReleaseRow` получает `cell: IReleaseCell | null`, `versionLabel` (для подсказки) и `onChange(platformId, cell | null)`; запросов не делает. Состояние — `Select`, дата — `input type="date"`, сборка — `input type="text"`. Отправки по уходу из поля не нужно: черновик локальный, запрос будет один по кнопке.

- [ ] **Step 3: Проверка** `cd apps/web && npx vitest run src/components/VersionDrawer`

### Task 3.4: Панель: черновик, кнопка, предупреждение, подтверждение закрытия

**Files:**
- Modify: `apps/web/src/components/VersionDrawer/{VersionDrawer.tsx,types.ts,VersionDrawer.test.tsx}`
- Modify: `apps/web/src/components/VersionDrawer/{CheckpointList.tsx,constants.ts}`

- [ ] **Step 1: Падающие тесты**

- кнопка «Сохранить» в панели неактивна, пока ничего не меняли;
- правка поля версии делает её активной и показывает «Есть несохранённые изменения»;
- правка клетки выпуска — то же самое;
- «Сохранить» зовёт `onSaveVersion` с патчем и операциями;
- успех гасит предупреждение и кнопку;
- ошибка сохранения показывается и панель не закрывается;
- закрытие при грязном черновике спрашивает подтверждение; «Остаться» не закрывает, «Закрыть» зовёт `onClose`;
- закрытие при чистом черновике не спрашивает;
- без `actions` нет ни кнопки, ни полей, ни подтверждения — только паспорт и значения;
- блок чекпоинтов подписан так, что видно: он меняется сразу.

- [ ] **Step 2: Реализация**

`IVersionActions` меняется: вместо `onSubmitVersion`, `onSetRelease`, `onClearRelease` — `onSaveVersion(patch, ops, onSaved)`, `isSavingVersion`, `saveError`. Состояние `isEditing` и кнопка «Править» уходят, `VersionActions` остаётся только с удалением.

Черновик — `useState`, начальное значение из версии чистой функцией `draftOf(version, platforms)`; после успеха — `setDraft(draftOf(...))` в колбэке. `useEffect` не заводится.

Закрытие: собственный `handleCloseRequest` — при грязном черновике ставит `isConfirming`, иначе закрывает. Подтверждение рисуется под шапкой через `ConfirmDialog`.

Подпись блока чекпоинтов — в `constants.ts`.

- [ ] **Step 3: Проверка** `cd apps/web && npx vitest run src/components/VersionDrawer`

---

## Chunk 4: Связь с сервером

### Task 4.1: `useMutationSaveVersion`

**Files:**
- Create: `apps/web/src/api/hooks/{useMutationSaveVersion.ts,useMutationSaveVersion.test.tsx}`
- Modify: `apps/web/src/api/hooks/index.ts`

- [ ] **Step 1: Падающие тесты**

- пустой патч — запроса версии нет;
- патч и две операции — три запроса в порядке «версия, затем операции по порядку»;
- `clear` уходит методом `DELETE`;
- роадмап перечитывается один раз;
- ошибка на второй операции отвергает мутацию, но перечитывание всё равно происходит.

- [ ] **Step 2: Реализация**

`mutationFn` принимает `{ versionId, patch, ops }`, выполняет запросы последовательно (`for...of` с `await`), `onSettled` сбрасывает `ROADMAP_KEYS.forProject(projectId)`. Существующие `useMutationSetRelease`/`useMutationClearRelease` остаются: они описывают по одной ручке и используются тестами.

- [ ] **Step 3: Проверка** `cd apps/web && npx vitest run src/api/hooks`

### Task 4.2: Панель роадмапа на новой мутации

**Files:**
- Modify: `apps/web/src/app/(app)/projects/[id]/roadmap/RoadmapVersionPanel.tsx`
- Modify: `apps/web/src/app/(app)/projects/[id]/roadmap/RoadmapScreen.test.tsx`

- [ ] **Step 1: Падающие тесты** (на уровне экрана)

- правка поля версии и клетки выпуска, затем «Сохранить» — уходят `PATCH` и `PUT` на нужные адреса;
- после сохранения роадмап перечитывается.

- [ ] **Step 2: Реализация**

`onSaveVersion` зовёт `saveVersion.mutate({ versionId, patch, ops }, { onSuccess: onSaved })`; `isSavingVersion` и `saveError` — из мутации. Мутации `setRelease`/`clearRelease` из панели уходят.

- [ ] **Step 3: Проверка** `cd apps/web && npx vitest run "src/app/(app)/projects"`

### Task 4.3: Публичная страница не изменилась

- [ ] `cd apps/web && npx vitest run src/app/roadmap` — `PublicRoadmapView` передаёт панель без `actions`, и панель обязана остаться читающей: ни кнопки, ни полей, ни подтверждения.

---

## Chunk 5: Удаление платформы

### Task 5.1: Подтверждение в поле платформ

**Files:**
- Modify: `apps/web/src/components/PlatformsField/{PlatformsField.tsx,types.ts,PlatformsField.test.tsx,constants.ts}`

- [ ] **Step 1: Падающие тесты**

- «×» у записанной платформы не зовёт `onRemove`, а показывает подтверждение;
- текст называет платформу и говорит, что исчезнут выпуски во всех версиях и теги чекпоинтов;
- «Да, убрать» зовёт `onRemove`, «Отмена» — нет;
- у платформы без `id` (панель создания проекта, чип ещё не записан) подтверждения нет — терять нечего.

- [ ] **Step 2: Реализация**

Состояние «что подтверждаем» — `platform | null`. `ConfirmDialog` под списком чипов. Текст — в `constants.ts`.

Компонент близок к лимиту 100 строк: если переступит, чипы уезжают в подкомпонент `PlatformChipList`.

- [ ] **Step 3: Проверка** `cd apps/web && npx vitest run src/components/PlatformsField`

---

## Chunk 6: Доводка

### Task 6.1: Полный набор и типы

- [ ] `pnpm test`
- [ ] `pnpm typecheck`
- [ ] `pnpm build`

### Task 6.2: Документация репозитория

**Files:**
- Modify: `CLAUDE.md`

- [ ] Абзац состояния репозитория дописывается последней доводкой: панель версии правится черновиком с одной кнопкой наверху, у выпуска есть дата и обозначение сборки, дата релиза при платформах закрыта на сервере.
- [ ] В списке источников правды появляется `2026-10-13-cairn-version-drawer-draft-design.md` и его план.
- [ ] Утверждение про `409` в разделе о роадмапе перестаёт быть обещанием: теперь оно описывает код.

### Task 6.3: Ручная проверка

- [ ] проект с платформами: смена состояния версии и двух клеток выпусков одной кнопкой; дата выпуска задним числом доезжает в диаграмму и сводку;
- [ ] проект без платформ: «Дата релиза» на месте, сводки нет, панель ведёт себя как прежде;
- [ ] закрытие панели с правками спрашивает подтверждение по Esc, по клику в подложку и по «Закрыть»;
- [ ] удаление платформы спрашивает подтверждение, в журнале появляется число выпусков;
- [ ] публичная страница роадмапа: панель только на чтение, кнопки нет;
- [ ] селекты одинаковы на всех экранах, включая матрицы доступов.
