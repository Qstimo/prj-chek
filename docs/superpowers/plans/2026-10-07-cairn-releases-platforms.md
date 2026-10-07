# Релизы по платформам — план реализации

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Релиз перестаёт быть одной датой у версии: у проекта появляются платформы, у версии — выпуск на каждой из них со своим состоянием и датой, а наверху роадмапа — сводка, отвечающая без чтения текста на «был ли релиз, что в сторе, что на модерации, что на тесте».

**Architecture:** Шесть частей по возрастанию цены ошибки: контракт, база, API платформ, API выпусков и сводки, веб-панели, веб-экраны. Платформа — поле паспорта проекта, а не реестр и не окружение: своего экрана у неё нет, окружение лишь отмечает галочками, что в нём живёт. Состояние выпуска — лестница из четырёх значений, ни одно из которых не повторяет состояние версии; отсутствие строки выпуска означает «идёт вместе с версией». Сводка вычисляется на сервере, как прогресс и стадия.

**Tech Stack:** pnpm workspaces, NestJS, Drizzle + PostgreSQL, zod в `packages/shared`, Next.js 15, Vitest + React Testing Library, Testcontainers.

**Основание:** `docs/superpowers/specs/2026-10-07-cairn-releases-platforms-design.md`

**Предварительная работа, обязательная:**
`docs/superpowers/plans/2026-10-07-cairn-snapshot-realign.md`. Снапшоты
`drizzle/meta` отстали от схемы на две миграции, и до выравнивания
`drizzle-kit generate` выдаёт десять чужих операторов вместе с новой
миграцией, а на схеме с новыми таблицами ещё и зависает на интерактивном
вопросе о переименовании. Chunk 2 без этого неисполним. Нумерация миграций
в этом плане — `0026` и `0027`: выравнивание занимает `0025`.

---

## Как работать с этим планом

TDD: сначала падающий тест, затем реализация. Линтера в проекте нет.

| Что | Команда |
|---|---|
| Все тесты | `pnpm test` |
| Точечно API | `cd apps/api && npx vitest run src/путь` |
| Точечно веб | `cd apps/web && npx vitest run src/путь` |
| Точечно контракт | `cd packages/shared && npx vitest run` |
| Типы | `pnpm typecheck` **из корня репозитория** |
| Миграция | `cd apps/api && npx drizzle-kit generate --name=<имя>` |
| Миграция вручную | `cd apps/api && npx drizzle-kit generate --custom --name=<имя>` |

Соглашения: компонент до 100 строк в своей директории с `index.ts`, пропсы — `IProps` в `types.ts`, TSDoc на русском, `any` запрещён, значения из перечней — `enum`, а не union.

**`pnpm typecheck` только из корня.** В `apps/web` нет пути на `@cairn/shared`, а пакет объявляет `types: ./dist/index.d.ts` — локальный прогон сверит веб со **старым собранным** контрактом и промолчит о расхождениях. Корневой скрипт начинается со сборки `@cairn/shared`, поэтому проверяет то, что нужно.

**Осторожно с `pnpm --filter ... test -- --run <путь>`**: двойное `--` съедает фильтр, и запускается весь набор, включая Testcontainers. Точечно — через `npx vitest run` из каталога приложения.

**Пути с `(app)` и `[id]` в кавычках работают.** Vitest сравнивает фильтр подстрокой, а не регуляркой; кавычки нужны только чтобы их не развернул bash.

**Порядок чанков обязателен**: Chunk 1 ломает типы в API и вебе, и `pnpm typecheck` станет зелёным только к концу Chunk 6. Это ожидаемо.

Тесты при этом зелёные на каждом коммите — но только если правки существующих фикстур и вызовов делаются **в том же шаге**, что ломающее изменение. Там, где это невозможно (смена подписи `versionProjection` затрагивает репозиторий, который правится следующей задачей), задача называет оба файла сразу.

### Обвязка тестов

Это главный источник ошибок при исполнении: в проекте пять разных обвязок, и писать тест не в той — значит получить несобирающийся файл. Образцы, на которые надо смотреть, и чего в проекте **нет**.

**Интеграционный тест репозитория API** (`roadmap.repository.test.ts`, `environments.repository.test.ts`, `projects.repository.test.ts`):

```ts
let testDb: TestDatabase;            // из '../../test/db-fixture'
beforeAll(async () => { testDb = await startTestDatabase();
  repository = new RoadmapRepository(testDb.db, new AccessService(testDb.db)); });
afterAll(async () => { await testDb.stop(); });
beforeEach(async () => { await testDb.truncate(); /* субъекты, пользователи, проекты — вставками */ });

const member = (): RequestSubject => ({ id: subjectId, kind: SubjectKind.User, label: 'user@cairn.local', isSuperadmin: false, isRevoked: false });
const admin = (): RequestSubject => ({ id: adminSubjectId, …, isSuperadmin: true, isRevoked: false });
async function grant(level: AccessLevel): Promise<void> { /* insert в grants */ }
```

Подключение — `testDb.db`, субъекты — фабрики `member()` / `admin()`, выдача — `await grant(AccessLevel.Write)`. Переменных `db`, `reader`, `writer`, `stranger`, `superadmin` в проекте **нет** — не используй их. Хелпера `rowsOf` тоже нет: он заводится в Task 2.2.

**Интеграционный тест службы API** (`roadmap.service.test.ts`, `projects.service.test.ts`): службы собираются **позиционно**, с настоящим `new AuditService()` на той же базе; журнал читается так:

```ts
async function entriesOf(action: AuditAction) {
  return testDb.db.select().from(auditLog).where(eq(auditLog.action, action));
}
```

`audit.record` как `vi.fn()` в этих файлах **не существует** — `expect(audit.record).toHaveBeenCalledWith(...)` писать нельзя. Добавление зависимости в конструктор службы ломает компиляцию её теста, поэтому каждая такая правка названа в плане отдельным файлом.

**Тест сборки приложения** (`app.module.test.ts`): `Test.createTestingModule({ imports: [AppModule] }).compile()`, затем `moduleRef.get(Службу)`. Хелпера `modulesOf` нет ни в проекте, ни в Nest.

**Тест компонента веба** (`ProjectForm.test.tsx`, `EnvironmentForm.test.tsx`): чистый `render` без провайдеров, данные пропами.

**Фикстуры называются как в файле.** Это главный источник несобирающихся сниппетов, поэтому список целиком:

| Файл | Фикстуры |
|---|---|
| `ProjectForm.test.tsx`, `ProjectList.test.tsx` | `project` |
| `ProjectSections.test.tsx` | `metadataOnly`, `detailed` |
| `EnvironmentForm.test.tsx` | `initial`, `SERVERS` |
| `EnvironmentCard.test.tsx` | `metadata`, `server`, `detail` |
| `CheckpointList.test.tsx` | `plain`, `withUrl` |
| `VersionDrawer.test.tsx` | `detail`, фабрика `makeActions(overrides)` |
| `RoadmapScreen.test.tsx` | `roadmap`, хелперы `query(data)`, `mutation()` |
| `PublicRoadmapView.test.tsx` | `roadmap` |

Фабрика `makeActions` в `VersionDrawer.test.tsx` важна: `clearMocks` в конфиге веба не включён, и общая константа с `vi.fn()` протекла бы между тестами.

**Новые обязательные поля ломают старые фикстуры.** Chunk 1 делает `platformIds` обязательным у чекпоинта, а `releases` — у версии уровня чтения. Каждая задача, трогающая файл с такой фикстурой, обязана **первым делом** её дополнить; с `releases` особенно, потому что версия без него молча провалится в ветку метаданных union'а и `typecheck` промолчит.

**Тест экрана веба** (`RoadmapScreen.test.tsx`): `vi.mock('@/api/hooks')` целиком плюс локальные хелперы `query(data)` и `mutation()`; wrapper'а нет. **Мокать нужно все хуки, которые зовёт экран** — автомок вернёт `undefined`, и экран упадёт на `isPending`.

**Тест хука веба.** Базовый образец — `useMutationRoadmap.test.tsx`: локальный `wrapper` с `QueryClientProvider` и `vi.stubGlobal('fetch', …)` в каждом тесте. Заглушка пишется в стиле кодовой базы — объектом, а не настоящим `Response`:

```ts
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'p1' }) }));
```

Без неё мутация не дойдёт до `onSuccess`, и проверять инвалидацию будет нечего.

**Наблюдать инвалидацию** умеет ровно один файл — `useMutationServer.test.tsx`, и только его приём работает: клиент создаётся **внутри** `wrapper`, поэтому шпион на внешнем клиенте принципиально ничего не видит. Повторять надо так:

```ts
let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// в тесте, уже после renderHook и до mutate:
const invalidate = vi.spyOn(client, 'invalidateQueries');
// …
expect(invalidate.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey))).toContain(…);
```

`mockImplementation` на `invalidateQueries` не навешивать: в TanStack Query v5 метод дженерик, и подмена рискует не пройти типизацию. Хелпера `wrapperWith` в проекте нет.

**`useRouter` в тестах.** Глобальный мок `next/navigation` **уже есть** в `apps/web/vitest.setup.ts` — он отдаёт `useRouter`, `usePathname`, `useSearchParams`, `notFound`, `redirect`. Падать тест не будет. Локальный мок нужен по другой причине: глобальный возвращает новые `vi.fn()` на каждый вызов, и наблюдать `push`/`refresh` через него нельзя.

Локальная фабрика **заменяет** глобальную целиком, поэтому обязана повторить весь набор — иначе компонент, которому понадобится `usePathname`, упадёт:

```ts
const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));
```

### Структура файлов

| Файл | Ответственность |
|---|---|
| `packages/shared/src/enums.ts` | `PlatformKind`, `PlatformReleaseState` |
| `packages/shared/src/schemas/day-date.ts` | дата-день, общая для роадмапа и выпусков |
| `packages/shared/src/schemas/platform.ts` | платформа, выпуск, сводка, допустимые состояния по виду |
| `packages/shared/src/schemas/roadmap.ts` | сводка в ответе, выпуски у версии, теги у чекпоинта |
| `packages/shared/src/schemas/project.ts` | платформы при создании, строгость правки |
| `packages/shared/src/schemas/environment.ts` | платформы окружения |
| `apps/api/src/db/schema/platforms.ts` | четыре таблицы и два перечня базы |
| `apps/api/src/db/schema/index.ts` | barrel-экспорт новых таблиц |
| `apps/api/src/db/schema/invariants.test.ts` | новые таблицы в `ALL_TABLES` |
| `apps/api/test/db-fixture.ts` | хелпер `rowsOf`, новые таблицы в `TRUNCATE` |
| `apps/api/test/environments-privileges.test.ts` | проверка миграции прав на новые таблицы |
| `apps/api/drizzle/0026_release_platforms.sql` | таблицы |
| `apps/api/drizzle/0027_release_platform_privileges.sql` | права роли `cairn_app` |
| `apps/api/src/platforms/platforms.repository.ts` | платформы проекта: права, принадлежность, уникальность, уборка |
| `apps/api/src/platforms/platforms.service.ts` | транзакция и журнал |
| `apps/api/src/platforms/platforms.controller.ts` | четыре ручки секции «Инфо» |
| `apps/api/src/platforms/platforms.module.ts` | сборка модуля |
| `apps/api/src/audit/audit.types.ts` | пять новых действий |
| `apps/api/src/app.module.ts` | подключение модуля платформ |
| `apps/api/src/projects/{projects.repository,projects.service}.ts` | платформы вместе с проектом |
| `apps/api/src/environments/{environments.repository,environment.projection}.ts` | связи окружения с платформами |
| `apps/api/src/roadmap/release.summary.ts` | правило сводки: что в релизе, что в пути |
| `apps/api/src/roadmap/roadmap.projection.ts` | выпуски у версии, дата версии из выпусков |
| `apps/api/src/roadmap/roadmap.repository.ts` | постановка и снятие выпуска, теги, уборка |
| `apps/api/src/roadmap/{roadmap.service,roadmap.controller}.ts` | ручка выпуска и журнал |
| `apps/api/src/agents/mcp-tools.ts` | описание `get_roadmap` упоминает выпуски |
| `apps/web/src/components/Drawer/{types,constants}.ts` | третья ширина — половина экрана |
| `apps/web/src/api/hooks/usePlatforms.ts` | запрос и мутации платформ |
| `apps/web/src/api/hooks/useMutationRelease.ts` | постановка и снятие выпуска |
| `apps/web/src/components/PlatformChips/` | чипы платформ только на чтение |
| `apps/web/src/components/PlatformsField/` | чипы с крестиком, подсказки, своя платформа |
| `apps/web/src/components/ProjectForm/ProjectForm.tsx` | слот платформ |
| `apps/web/src/components/ProjectForm/ProjectFields.tsx` | поля паспорта, вынесены под лимит строк |
| `apps/web/src/utils/today.ts` | сегодняшний день `ГГГГ-ММ-ДД`, общий для формы версии и выпуска |
| `apps/web/src/app/(app)/CreateProjectPanel.tsx` | создание проекта в панели |
| `apps/web/src/app/(app)/projects/[id]/EditProjectPanel.tsx` | правка проекта в панели |
| `apps/web/src/components/ProjectList/ProjectList.tsx` | слот создания вместо ссылки |
| `apps/web/src/components/ProjectSections/ProjectSections.tsx` | платформы в паспорте |
| `apps/web/src/components/EnvironmentForm/PlatformsCheckboxes.tsx` | «что здесь развёрнуто» |
| `apps/web/src/components/EnvironmentForm/EnvironmentFields.tsx` | поля окружения, вынесены под лимит строк |
| `apps/web/src/app/(app)/projects/[id]/infrastructure/{Create,Edit}EnvironmentPanel.tsx` | форма окружения в панели |
| `apps/web/src/components/ReleaseSummary/` | сводка релизов |
| `apps/web/src/components/VersionDrawer/{ReleaseList,ReleaseRow}.tsx` | выпуски версии в панели |
| `apps/web/src/components/VersionDrawer/VersionActions.tsx` | кнопки правки и удаления версии, вынесены под лимит |
| `apps/web/src/components/CheckpointForm/CheckpointForm.tsx` | создание **и правка** чекпоинта |
| `apps/web/src/components/CheckpointForm/CheckpointFields.tsx` | формулировка и ссылка с уникальными `id` |
| `apps/web/src/components/CheckpointForm/PlatformsToggles.tsx` | переключатели платформ |
| `apps/web/src/components/VersionDrawer/{CheckpointList,CheckpointItem}.tsx` | теги и кнопка правки |

Удаляются: `apps/web/src/app/(app)/projects/new/`, `apps/web/src/app/(app)/projects/[id]/edit/`.

---

## Chunk 1: Контракт

### Task 1.1: Виды платформ и состояния выпуска

**Files:**
- Modify: `packages/shared/src/enums.ts`
- Modify: `packages/shared/src/enums.test.ts`

- [ ] **Step 1: Падающие тесты**

В `enums.test.ts` дописать в импорт (строка 3) `PlatformKind` и `PlatformReleaseState`, затем добавить набор:

```ts
describe('платформы', () => {
  it('вид отвечает на два вопроса поведения, а не перечисляет магазины', () => {
    // Магазинов много и новые появляются каждый год: значением перечня
    // их не удержать, поэтому имя платформы свободное.
    expect(Object.values(PlatformKind)).toEqual(['server', 'store', 'other']);
  });

  it('состояние выпуска не повторяет состояний версии', () => {
    // «Запланирована» и «в работе» — это состояние версии. Строка выпуска
    // с таким значением не сообщала бы ничего нового, и её отсутствие
    // как раз и означает «платформа идёт вместе с версией».
    const states = Object.values(PlatformReleaseState) as string[];

    expect(states).not.toContain('planned');
    expect(states).not.toContain('in_progress');
    expect(states).toEqual(['on_test', 'in_review', 'released', 'rejected']);
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `cd packages/shared && npx vitest run src/enums.test.ts`
Expected: FAIL на этапе разбора файла — `PlatformKind` не экспортируется из `./enums`.

- [ ] **Step 3: Реализация**

В `enums.ts`, после `RoadmapVersionState`:

```ts
/**
 * Вид платформы проекта.
 *
 * Отвечает на два вопроса поведения — бывает ли у платформы модерация и
 * живёт ли она в окружении, — а не перечисляет магазины. Магазинов много и
 * новые появляются каждый год; значением перечня их не удержать, поэтому
 * имя платформы свободное, а вид закрытый и короткий.
 */
export enum PlatformKind {
  /** На наших машинах: API, веб, админка. Окружение есть, модерации нет. */
  Server = 'server',
  /** Чужой магазин: App Store, Google Play, RuStore. Модерация есть, окружения нет. */
  Store = 'store',
  /** Ни то ни другое: пакет в реестре, прошивка. */
  Other = 'other',
}

/**
 * Состояние выпуска: чем платформа разошлась с версией.
 *
 * «Запланирована» и «в работе» здесь отсутствуют намеренно: это состояние
 * версии (ТЗ 3.5), и строка выпуска с таким значением дублировала бы его.
 * Отсутствие строки выпуска означает «идёт вместе с версией», а строка
 * появляется, когда платформа ушла вперёд или встала.
 *
 * Порядок значений — порядок лестницы: так же читается выбор в интерфейсе.
 */
export enum PlatformReleaseState {
  /** На тесте: стейдж у серверной платформы, TestFlight у магазина. */
  OnTest = 'on_test',
  /** На модерации. Только у магазина: у нашей машины её не бывает. */
  InReview = 'in_review',
  Released = 'released',
  /** Отклонена магазином. Тупик лестницы, не шаг назад. */
  Rejected = 'rejected',
}
```

- [ ] **Step 4: Запустить**

Run: `cd packages/shared && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add packages/shared/src
git commit -m "Назвать виды платформ и состояния выпуска"
```

### Task 1.2: Схемы платформы, выпуска и сводки

**Files:**
- Create: `packages/shared/src/schemas/day-date.ts`
- Create: `packages/shared/src/schemas/platform.ts`
- Create: `packages/shared/src/schemas/platform.test.ts`
- Modify: `packages/shared/src/schemas/roadmap.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Падающие тесты**

`packages/shared/src/schemas/platform.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { PlatformKind, PlatformReleaseState } from '../enums';
import {
  platformCreateSchema,
  platformIdsSchema,
  platformReleaseSetSchema,
  platformUpdateSchema,
  releaseStatesFor,
  releaseSummaryRowSchema,
} from './platform';

const PLATFORM_ID = '00000000-0000-0000-0000-000000000001';

describe('platformCreateSchema', () => {
  it('обрезает имя и отвергает лишние поля', () => {
    expect(platformCreateSchema.parse({ kind: PlatformKind.Store, name: ' RuStore ' })).toEqual({
      kind: PlatformKind.Store,
      name: 'RuStore',
    });

    expect(() =>
      platformCreateSchema.parse({ kind: PlatformKind.Store, name: 'RuStore', position: 1 }),
    ).toThrow();
  });
});

describe('platformUpdateSchema', () => {
  it('правит только имя', () => {
    // Вид несёт два инварианта, проверяемых при записи выпуска и при
    // привязке к окружению; смена вида прошла бы мимо обеих проверок.
    // Позиция не правится без перенумерации соседей — порядок сводки
    // стал бы недетерминированным.
    expect(platformUpdateSchema.parse({ name: 'Веб-админка' }).name).toBe('Веб-админка');

    expect(() => platformUpdateSchema.parse({ kind: PlatformKind.Server })).toThrow();
    expect(() => platformUpdateSchema.parse({ position: 1 })).toThrow();
  });
});

describe('platformIdsSchema', () => {
  it('без повторов и не длиннее двадцати', () => {
    expect(() => platformIdsSchema.parse([PLATFORM_ID, PLATFORM_ID])).toThrow();
    // Идентификаторы разные: одинаковые упёрлись бы в проверку
    // повторов, и лимит остался бы непроверенным.
    expect(() =>
      platformIdsSchema.parse(
        Array.from({ length: 21 }, (_, index) =>
          `00000000-0000-0000-0000-0000000000${String(index).padStart(2, '0')}`,
        ),
      ),
    ).toThrow();
    expect(platformIdsSchema.parse([])).toEqual([]);
  });
});

describe('releaseStatesFor', () => {
  it('отдаёт модерацию и отклонение только магазину', () => {
    // Модерация бывает у магазина, а не у нашей машины: один источник
    // правила и для выбора в интерфейсе, и для проверки на сервере.
    expect(releaseStatesFor(PlatformKind.Store)).toEqual([
      PlatformReleaseState.OnTest,
      PlatformReleaseState.InReview,
      PlatformReleaseState.Released,
      PlatformReleaseState.Rejected,
    ]);

    expect(releaseStatesFor(PlatformKind.Server)).toEqual([
      PlatformReleaseState.OnTest,
      PlatformReleaseState.Released,
    ]);

    expect(releaseStatesFor(PlatformKind.Other)).toEqual([
      PlatformReleaseState.OnTest,
      PlatformReleaseState.Released,
    ]);
  });
});

describe('platformReleaseSetSchema', () => {
  it('принимает состояние без даты и отвергает лишнее', () => {
    // «Вышла, дата неизвестна» — честное состояние, как у версий,
    // оставшихся без фактической даты после прошлой миграции.
    expect(platformReleaseSetSchema.parse({ state: PlatformReleaseState.Released })).toEqual({
      state: PlatformReleaseState.Released,
    });

    expect(() =>
      platformReleaseSetSchema.parse({ state: PlatformReleaseState.Released, platformId: PLATFORM_ID }),
    ).toThrow();
  });
});

describe('releaseSummaryRowSchema', () => {
  it('описывает платформу без релизов', () => {
    const row = releaseSummaryRowSchema.parse({
      platform: { id: PLATFORM_ID, kind: PlatformKind.Store, name: 'RuStore', position: 3 },
      released: null,
      pending: [],
    });

    expect(row.released).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `cd packages/shared && npx vitest run src/schemas/platform.test.ts`
Expected: FAIL — модуль `./platform` не найден.

- [ ] **Step 3: Реализация**

`packages/shared/src/schemas/day-date.ts` — вынос из `roadmap.ts`, чтобы дата выпуска и дата версии описывались одним правилом:

```ts
import { z } from 'zod';

/**
 * Дата-день без времени: план, факт релиза, выход на платформе.
 *
 * Общая схема, а не копия в каждом файле: иначе формат неизбежно
 * разошёлся бы между версией и её выпусками.
 *
 * `isoDateSchema` в `server.ts` — тот же регексп, и свести их можно:
 * `dayDateSchema = isoDateSchema.nullable()`. В этой работе не сводим —
 * у них разные тексты ошибки, и правка текста в формах серверов
 * выходит за её объём. Долг осознанный, а не незамеченный.
 */
export const dayDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата ГГГГ-ММ-ДД')
  .nullable();
```

`packages/shared/src/schemas/platform.ts`:

```ts
import { z } from 'zod';

import { PlatformKind, PlatformReleaseState } from '../enums';
import { dayDateSchema } from './day-date';

/**
 * Имя платформы: своё в каждом проекте («Веб-админка», «RuStore»).
 *
 * Регистр не нормализуется: уникальность `(project_id, name)`
 * регистрозависима, и «API» с «api» пройдут обеими записями. Имя —
 * то, что человек видит в сводке, и приводить его к нижнему регистру
 * значило бы показывать «app store».
 */
const platformNameSchema = z.string().trim().min(1).max(100);

/**
 * Платформа проекта: канал поставки.
 *
 * Не окружение и не реестр: у окружения есть машина, адреса и переменные,
 * у магазина их нет вовсе, а платформа и окружение ортогональны — веб
 * бывает на проде и на стейдже, iOS в сторе и в TestFlight. Поэтому
 * платформа живёт в паспорте проекта, а окружение лишь отмечает, какие
 * платформы в нём развёрнуты.
 */
export const platformSchema = z.object({
  id: z.string().uuid(),
  kind: z.nativeEnum(PlatformKind),
  name: z.string(),
  /** Порядок строк сводки. Хранится: из имён он не выводим. */
  position: z.number().int().positive(),
});

/** Ссылка на платформу: окружение и теги чекпоинта порядка не знают. */
export const platformRefSchema = platformSchema.omit({ position: true });

/** Заведение платформы. */
export const platformCreateSchema = z
  .object({ kind: z.nativeEnum(PlatformKind), name: platformNameSchema })
  .strict();

/**
 * Правка платформы: только имя.
 *
 * Вида здесь нет намеренно. Он несёт два инварианта — «у магазина бывает
 * модерация» и «в окружении живёт только наше», — и оба проверяются при
 * записи выпуска и при привязке к окружению. Смена вида прошла бы мимо
 * обеих проверок и оставила бы «на модерации» у нашей машины либо стор
 * в окружении. Сменить вид — удалить платформу и завести заново.
 *
 * Позиции нет по той же причине, по которой переупорядочивание вне
 * объёма: без перенумерации соседей две платформы встали бы на одно
 * место, и порядок сводки стал бы недетерминированным.
 */
export const platformUpdateSchema = z.object({ name: platformNameSchema }).strict();

/**
 * Набор платформ: без повторов, правится целиком.
 *
 * Один на всех, кто его принимает, — теги чекпоинта и платформы
 * окружения: два почти одинаковых определения разошлись бы ограничениями.
 * Отсутствие поля и пустой массив различаются по смыслу: поля нет — набор
 * не трогать, пустой — снять все.
 */
export const platformIdsSchema = z
  .array(z.string().uuid())
  .max(20)
  .refine((ids) => new Set(ids).size === ids.length, 'Платформы повторяются');

/** Выпуск версии на платформе. */
export const platformReleaseSchema = z.object({
  platformId: z.string().uuid(),
  state: z.nativeEnum(PlatformReleaseState),
  releasedDate: dayDateSchema,
  /**
   * Своё обозначение сборки, когда оно отличается от обозначения версии:
   * iOS нумерует сборки («1.2.3 (45)»), веб — нет. Пусто означает
   * «как у версии», а не «неизвестно».
   */
  buildLabel: z.string().nullable(),
});

/** Постановка выпуска: состояние обязательно, остальное дополняется позже. */
export const platformReleaseSetSchema = z
  .object({
    state: z.nativeEnum(PlatformReleaseState),
    releasedDate: dayDateSchema.optional(),
    buildLabel: z.string().trim().max(100).nullable().optional(),
  })
  .strict();

/**
 * Выпуск в сводке: на какую версию он ссылается.
 *
 * `date` у того, что в пути, пуста: даты выхода у отправленного на
 * модерацию ещё нет.
 */
export const releaseRefSchema = z.object({
  versionId: z.string().uuid(),
  versionLabel: z.string(),
  buildLabel: z.string().nullable(),
  date: dayDateSchema,
});

/** Выпуск в пути: то же плюс состояние. */
export const releasePendingSchema = releaseRefSchema.extend({
  state: z.nativeEnum(PlatformReleaseState),
});

/**
 * Строка сводки: что у платформы в релизе и что идёт за ним.
 *
 * Сводка смотрит вперёд от текущего релиза: отклонённая полгода назад
 * версия, которую уже обогнали, в ней не висит.
 *
 * `platform` — полная схема, а не ссылка: экрану нужен `kind` (скрыть
 * модерацию у серверной платформы), а панели версии — весь список
 * платформ проекта, и сводка оказывается единственным местом, откуда
 * роадмап его берёт, не обращаясь к «Инфо».
 */
export const releaseSummaryRowSchema = z.object({
  platform: platformSchema,
  released: releaseRefSchema.nullable(),
  pending: z.array(releasePendingSchema),
});

/**
 * Состояния, допустимые у платформы этого вида.
 *
 * Один источник и для выбора в интерфейсе, и для проверки на сервере:
 * два списка разошлись бы, и в базе появилась бы запись о модерации
 * нашего собственного API.
 */
export function releaseStatesFor(kind: PlatformKind): PlatformReleaseState[] {
  if (kind === PlatformKind.Store) {
    return [
      PlatformReleaseState.OnTest,
      PlatformReleaseState.InReview,
      PlatformReleaseState.Released,
      PlatformReleaseState.Rejected,
    ];
  }

  return [PlatformReleaseState.OnTest, PlatformReleaseState.Released];
}

/** Платформа проекта. */
export type Platform = z.infer<typeof platformSchema>;

/** Ссылка на платформу. */
export type PlatformRef = z.infer<typeof platformRefSchema>;

/** Заведение платформы. */
export type PlatformCreate = z.infer<typeof platformCreateSchema>;

/** Правка платформы. */
export type PlatformUpdate = z.infer<typeof platformUpdateSchema>;

/** Выпуск версии на платформе. */
export type PlatformRelease = z.infer<typeof platformReleaseSchema>;

/** Постановка выпуска. */
export type PlatformReleaseSet = z.infer<typeof platformReleaseSetSchema>;

/** Выпуск в сводке. */
export type ReleaseRef = z.infer<typeof releaseRefSchema>;

/** Выпуск в пути. */
export type ReleasePending = z.infer<typeof releasePendingSchema>;

/** Строка сводки релизов. */
export type ReleaseSummaryRow = z.infer<typeof releaseSummaryRowSchema>;
```

В `roadmap.ts` удалить собственный `const dayDateSchema` (строка 6) и импортировать общий:

```ts
import { dayDateSchema } from './day-date';
```

В `packages/shared/src/index.ts` добавить две строки по алфавиту: `export * from './schemas/day-date';` после `chronicle`, `export * from './schemas/platform';` после `intake`.

- [ ] **Step 4: Запустить**

Run: `cd packages/shared && npx vitest run`
Expected: PASS, включая существующие тесты роадмапа — формат даты не изменился, а `dayDateSchema` был непубличным и внешних импортёров не имел.

- [ ] **Step 5: Коммит**

```bash
git add packages/shared/src
git commit -m "Описать платформу, выпуск и сводку релизов"
```

### Task 1.3: Сводка и выпуски в схемах роадмапа

**Files:**
- Modify: `packages/shared/src/schemas/roadmap.ts`
- Modify: `packages/shared/src/schemas/roadmap.test.ts`

- [ ] **Step 1: Падающие тесты и правка существующих фикстур**

Сначала **дополнить существующие фикстуры** — иначе прогон следующего шага упадёт не там, где нужно:

- в импорт файла добавить `publicCheckpointSchema`, `roadmapCheckpointUpdateSchema`, `roadmapResponseSchema`;
- в фикстуру `checkpoint` (строки 88–93) добавить `platformIds: []`;
- в оба вызова `publicRoadmapSchema.parse` добавить `summary: []`, а в их версии — `releases: []`.

Затем новые тесты:

```ts
it('чекпоинт несёт теги платформ, а публичный — без ссылки', () => {
  // Тег платформы говорит, куда поедет результат, и не делает чекпоинт
  // задачей трекера: ни исполнителя, ни оценки, ни даты у него нет (ТЗ 1.4).
  const fields = {
    id: '00000000-0000-0000-0000-000000000001',
    title: 'Вход по телефону',
    isDone: false,
    position: 1,
    platformIds: ['00000000-0000-0000-0000-000000000002'],
  };

  expect(publicCheckpointSchema.parse(fields).platformIds).toHaveLength(1);
  expect(() => publicCheckpointSchema.parse({ ...fields, url: 'https://tracker/1' })).toThrow();
});

it('правка чекпоинта принимает набор тегов и отвергает повторы', () => {
  const platformId = '00000000-0000-0000-0000-000000000002';

  // Положительный случай обязателен: схема и так `.strict()`, и без него
  // тест прошёл бы на неизвестном ключе, а не на проверке повторов.
  expect(roadmapCheckpointUpdateSchema.parse({ platformIds: [platformId] }).platformIds).toEqual([
    platformId,
  ]);
  expect(() =>
    roadmapCheckpointUpdateSchema.parse({ platformIds: [platformId, platformId] }),
  ).toThrow();
});

it('ответ роадмапа несёт сводку релизов', () => {
  const parsed = roadmapResponseSchema.parse({
    stage: { current: null, total: 0 },
    versions: [],
    summary: [],
  });

  expect(parsed.summary).toEqual([]);
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd packages/shared && npx vitest run src/schemas/roadmap.test.ts`
Expected: FAIL. Первый тест падает на строгой `publicCheckpointSchema`, которая пока не знает `platformIds`; второй — на том же (`platformIds` неизвестен строгой схеме правки); третий — на отсутствии `summary` в разобранном объекте.

Дополненные фикстуры дают ещё одно падение, и важно понимать какое: `publicRoadmapSchema` и `publicVersionSchema` **не строгие**, поэтому `summary` и `releases` в них просто отбросятся. Красным станет существующий тест «пропускает публичный роадмап без ссылок»: добавленный в фикстуру `platformIds` упирается в строгую `publicCheckpointSchema`, и `not.toThrow()` превращается в throw.

- [ ] **Step 3: Реализация**

В `roadmap.ts` добавить импорт и набор тегов:

```ts
import { platformIdsSchema, platformReleaseSchema, releaseSummaryRowSchema } from './platform';
```

Затем:

- в `roadmapCheckpointSchema` — `platformIds: z.array(z.string().uuid())` (намеренно **без** `platformIdsSchema`: это выдача, а не приём, и проверять в ней повторы и лимит незачем) с TSDoc:

```ts
  /**
   * Платформы, на которые едет результат. Необязательно и больше одной.
   *
   * Набор присылается целиком: он правится целиком в одной форме
   * чекпоинта. Отсутствие поля в правке означает «не трогать», пустой
   * массив — «снять все»; иначе переключение галочки «закрыт» снесло бы
   * теги.
   */
```

- в `roadmapCheckpointCreateSchema` и `roadmapCheckpointUpdateSchema` — `platformIds: platformIdsSchema.optional()`;
- в `roadmapVersionDetailSchema` — `releases: z.array(platformReleaseSchema)`;
- в `publicVersionSchema` — то же поле: публичная панель версии показывает тот же блок (дизайн 12.5);
- в `roadmapResponseSchema` и `publicRoadmapSchema` — `summary: z.array(releaseSummaryRowSchema)`.

**Осторожно с union.** `roadmapResponseSchema.versions` — это `z.union([detail, metadata])`. Новое обязательное `releases` в detail-ветке создаёт путь тихой деградации: проекция уровня чтения, забывшая `releases`, молча провалится в ветку метаданных и **потеряет чекпоинты** вместо ошибки. Тест на это стоит в Chunk 4 (Task 4.2).

- [ ] **Step 4: Запустить**

Run: `cd packages/shared && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add packages/shared/src
git commit -m "Включить выпуски и сводку в контракт роадмапа"
```

### Task 1.4: Платформы в проекте и окружении

**Files:**
- Modify: `packages/shared/src/schemas/project.ts`
- Modify: `packages/shared/src/schemas/environment.ts`
- Modify: `packages/shared/src/schemas/environment.test.ts`
- Create: `packages/shared/src/schemas/project.test.ts` (файла ещё нет)

- [ ] **Step 1: Падающие тесты и правка фикстуры**

В `environment.test.ts` **сначала** дополнить фикстуру `BASE` (строки 166–175) полем `platforms: []` — она идёт в `environmentDetailSchema.parse` в двух тестах, и новое обязательное поле их уронит. Затем:

```ts
it('окружение принимает платформы, которые в нём живут', () => {
  const platformId = '00000000-0000-0000-0000-000000000002';

  expect(environmentUpdateSchema.parse({ platformIds: [platformId] }).platformIds).toEqual([
    platformId,
  ]);

  expect(() => environmentUpdateSchema.parse({ platformIds: [platformId, platformId] })).toThrow();
});
```

Для проекта файла ещё нет — создать его с шапкой:

```ts
import { describe, expect, it } from 'vitest';

import { PlatformKind } from '../enums';
import { projectCreateSchema, projectUpdateSchema } from './project';
```

и единственным набором:

```ts
it('платформы принимаются при создании и отвергаются в правке', () => {
  // Правка стала строгой намеренно: без этого присланные платформы
  // молча отбросились бы — ровно та тихая потеря, от которой строгие
  // схемы и защищают.
  expect(
    projectCreateSchema.parse({
      name: 'Касса',
      platforms: [{ kind: PlatformKind.Server, name: 'API' }],
    }).platforms,
  ).toHaveLength(1);

  expect(() =>
    projectUpdateSchema.parse({ platforms: [{ kind: PlatformKind.Server, name: 'API' }] }),
  ).toThrow();
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd packages/shared && npx vitest run src/schemas/environment.test.ts src/schemas/project.test.ts`
Expected: FAIL. `environmentUpdateSchema` и `projectUpdateSchema` сейчас **не строгие**, поэтому неизвестные ключи молча отбрасываются — падают положительные утверждения (`parsed.platformIds` и `.platforms` оказываются `undefined`), а негативные `toThrow()` не бросают вовсе. Тест проекта вдобавок падает на отсутствии файла.

- [ ] **Step 3: Реализация**

В `environment.ts` добавить импорт `platformIdsSchema, platformRefSchema` из `./platform`, затем:

- в `environmentDetailSchema` — `platforms: z.array(platformRefSchema)`;
- в `environmentUpdateSchema`:

```ts
  /**
   * Платформы, развёрнутые в этом окружении.
   *
   * Присылается целиком, как и `domains` рядом, и по той же причине:
   * набор правится целиком в одной форме. Платформа вида «магазин»
   * в окружение не ставится — отказ приходит от сервера, который
   * один знает вид платформы.
   */
  platformIds: platformIdsSchema.optional(),
```

В `project.ts` добавить импорт `platformCreateSchema` из `./platform` и сделать правку строгой:

```ts
/**
 * Поля, доступные для правки при уровне записи.
 *
 * Строгая намеренно: платформы здесь не принимаются, и без `.strict()`
 * присланное поле молча отбросилось бы вместо отказа.
 */
export const projectUpdateSchema = z
  .object({ /* как было */ })
  .strict();

/**
 * Поля для создания проекта. Слаг генерируется сервером.
 *
 * Платформы принимаются здесь, но не в правке: при создании затирать
 * нечего, а требовать сначала создать проект и лишь потом вернуться
 * за платформами — лишний шаг. В правке каждая платформа действует
 * своей мутацией и чужого не трогает.
 *
 * Строгость наследуется от правки: `.extend()` в zod сохраняет
 * `unknownKeys`, поэтому создание тоже начнёт отвергать лишние поля.
 * Так и нужно — но переписывать схему отдельным нестрогим `z.object`
 * нельзя, требование выше потеряется. Существующие вызывающие
 * (форма проекта, e2e-тесты) присылают только известные ключи.
 */
export const projectCreateSchema = projectUpdateSchema.extend({
  name: z.string().min(1).max(200),
  platforms: z.array(platformCreateSchema).max(20).optional(),
});
```

- [ ] **Step 4: Запустить**

Run: `cd packages/shared && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add packages/shared/src
git commit -m "Принимать платформы в проекте и окружении"
```

---

## Chunk 2: База

### Task 2.1: Таблицы платформ, связей и выпусков

**Files:**
- Create: `apps/api/src/db/schema/platforms.ts`
- Create: `apps/api/src/db/schema/platforms.test.ts`
- Modify: `apps/api/src/db/schema/index.ts`
- Modify: `apps/api/src/db/schema/invariants.test.ts`

- [ ] **Step 1: Падающие тесты**

Сначала **в `invariants.test.ts`** добавить импорт из `./platforms` и четыре записи в `ALL_TABLES` (после `environment_domains`): `project_platforms`, `environment_platforms`, `version_platform_releases`, `checkpoint_platforms`. Список там явный именно затем, чтобы новую таблицу включали осознанно; без этого правило «никаких каскадов» новых ссылок не увидит.

`apps/api/src/db/schema/platforms.test.ts`:

```ts
import { PlatformKind, PlatformReleaseState } from '@cairn/shared';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  checkpointPlatforms,
  environmentPlatforms,
  platformKindEnum,
  platformReleaseStateEnum,
  projectPlatforms,
  versionPlatformReleases,
} from './platforms';

describe('платформы проекта', () => {
  it('перечисления совпадают с контрактом', () => {
    expect(platformKindEnum.enumValues).toEqual(Object.values(PlatformKind));
    expect(platformReleaseStateEnum.enumValues).toEqual(Object.values(PlatformReleaseState));
  });

  it('имя уникально в проекте', () => {
    const unique = getTableConfig(projectPlatforms).uniqueConstraints.find(
      (constraint) => constraint.name === 'project_platforms_project_name',
    );

    expect(unique?.columns.map((column) => column.name).sort()).toEqual(['name', 'project_id']);
  });

  it('требует вид, имя и позицию', () => {
    expect(projectPlatforms.kind.notNull).toBe(true);
    expect(projectPlatforms.name.notNull).toBe(true);
    expect(projectPlatforms.position.notNull).toBe(true);
  });
});

describe('выпуски', () => {
  it('у пары «версия × платформа» выпуск один', () => {
    // Выпуск — не отдельная вещь, а значение в клетке таблицы: вторая
    // строка на ту же пару означала бы два ответа на один вопрос.
    const unique = getTableConfig(versionPlatformReleases).uniqueConstraints.find(
      (constraint) => constraint.name === 'version_platform_releases_version_platform',
    );

    expect(unique?.columns.map((column) => column.name).sort()).toEqual([
      'platform_id',
      'version_id',
    ]);
  });

  it('состояние обязательно, дата и обозначение сборки — нет', () => {
    // «Вышла, дата неизвестна» — честное состояние; пустое обозначение
    // сборки означает «как у версии».
    expect(versionPlatformReleases.state.notNull).toBe(true);
    expect(versionPlatformReleases.releasedDate.notNull).toBe(false);
    expect(versionPlatformReleases.buildLabel.notNull).toBe(false);
  });

  it('дата выпуска — календарный день, а не отметка времени', () => {
    expect(versionPlatformReleases.releasedDate.getSQLType()).toBe('date');
  });
});

describe('связи', () => {
  it('связь окружения — пара без своего ключа', () => {
    // Состав ключа важен: проверка только на количество прошла бы и при
    // ключе на неправильных колонках.
    const [primary] = getTableConfig(environmentPlatforms).primaryKeys;

    expect(primary?.columns.map((column) => column.name).sort()).toEqual([
      'environment_id',
      'platform_id',
    ]);
  });

  it('тег чекпоинта — тоже пара', () => {
    const [primary] = getTableConfig(checkpointPlatforms).primaryKeys;

    expect(primary?.columns.map((column) => column.name).sort()).toEqual([
      'checkpoint_id',
      'platform_id',
    ]);
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/api && npx vitest run src/db/schema`
Expected: FAIL — модуль `./platforms` не найден (и `platforms.test.ts`, и `invariants.test.ts` не собираются).

- [ ] **Step 3: Реализация**

`apps/api/src/db/schema/platforms.ts`:

```ts
import { PlatformKind, PlatformReleaseState } from '@cairn/shared';
import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { environments } from './environments';
import { projects } from './projects';
import { roadmapCheckpoints, roadmapVersions } from './roadmap';

/** Вид платформы. Значения совпадают с контрактом. */
export const platformKindEnum = pgEnum('platform_kind', [
  PlatformKind.Server,
  PlatformKind.Store,
  PlatformKind.Other,
]);

/** Состояние выпуска. Значения совпадают с контрактом. */
export const platformReleaseStateEnum = pgEnum('platform_release_state', [
  PlatformReleaseState.OnTest,
  PlatformReleaseState.InReview,
  PlatformReleaseState.Released,
  PlatformReleaseState.Rejected,
]);

/**
 * Платформы проекта: каналы поставки.
 *
 * Поле паспорта проекта, а не межпроектный реестр вроде серверов и
 * доменов: «API» одного проекта и «API» другого — разные вещи, и общего
 * экрана у них нет. Имя свободное, вид закрытый: магазинов много.
 *
 * `position` хранится: порядок строк сводки значим и из имён не выводим.
 */
export const projectPlatforms = pgTable(
  'project_platforms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    kind: platformKindEnum('kind').notNull(),
    name: text('name').notNull(),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('project_platforms_project_name').on(table.projectId, table.name),
    index('project_platforms_project_idx').on(table.projectId),
  ],
);

/**
 * Что развёрнуто в окружении.
 *
 * Связь, а не поле окружения и не поле платформы: в одном окружении живёт
 * несколько платформ, и одна платформа живёт в нескольких окружениях —
 * прод и стейдж. Поле на любой из сторон потребовало бы дублировать
 * машину и адреса.
 */
export const environmentPlatforms = pgTable(
  'environment_platforms',
  {
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'restrict' }),
    platformId: uuid('platform_id')
      .notNull()
      .references(() => projectPlatforms.id, { onDelete: 'restrict' }),
  },
  (table) => [
    primaryKey({ columns: [table.environmentId, table.platformId] }),
    index('environment_platforms_platform_idx').on(table.platformId),
  ],
);

/**
 * Выпуск версии на платформе.
 *
 * Строка появляется, когда платформа разошлась с версией: уехала на тест,
 * отправлена на модерацию, вышла, отклонена. Её отсутствие означает «идёт
 * вместе с версией» — поэтому состояний «запланирована» и «в работе»
 * здесь нет, они принадлежат версии.
 */
export const versionPlatformReleases = pgTable(
  'version_platform_releases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => roadmapVersions.id, { onDelete: 'restrict' }),
    platformId: uuid('platform_id')
      .notNull()
      .references(() => projectPlatforms.id, { onDelete: 'restrict' }),
    state: platformReleaseStateEnum('state').notNull(),
    releasedDate: date('released_date', { mode: 'string' }),
    /** Своё обозначение сборки. Пусто — как у версии. */
    buildLabel: text('build_label'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('version_platform_releases_version_platform').on(table.versionId, table.platformId),
    index('version_platform_releases_platform_idx').on(table.platformId),
  ],
);

/**
 * Теги платформ у чекпоинта: куда едет результат.
 *
 * Не исполнитель, не оценка, не дата и не вложенность — ограничение ТЗ 1.4
 * остаётся в силе.
 */
export const checkpointPlatforms = pgTable(
  'checkpoint_platforms',
  {
    checkpointId: uuid('checkpoint_id')
      .notNull()
      .references(() => roadmapCheckpoints.id, { onDelete: 'restrict' }),
    platformId: uuid('platform_id')
      .notNull()
      .references(() => projectPlatforms.id, { onDelete: 'restrict' }),
  },
  (table) => [
    primaryKey({ columns: [table.checkpointId, table.platformId] }),
    index('checkpoint_platforms_platform_idx').on(table.platformId),
  ],
);

/** Строка таблицы платформ. */
export type ProjectPlatformRow = typeof projectPlatforms.$inferSelect;

/** Строка таблицы выпусков. */
export type PlatformReleaseRow = typeof versionPlatformReleases.$inferSelect;
```

Индекс по версии у выпусков не заводится: левый префикс уникального ограничения `(version_id, platform_id)` уже обслуживает выборку по версии (PostgreSQL реализует UNIQUE через btree-индекс), и второй индекс был бы мёртвым весом на записи. Дизайн раздела 4.3 говорит то же.

Индекс `project_platforms_project_idx` при этом **остаётся**, хотя строго он дублирует левый префикс уникального `(project_id, name)` — ситуация та же, что у выпусков. Сортировку по `position` не снимает ни тот, ни другой: для неё понадобился бы составной `(project_id, position)`, а на десятках проектов это не нужно. Оставлен по дизайну 4.1; если когда-нибудь будет чиститься — вместе с ним.

В `apps/api/src/db/schema/index.ts` добавить `export * from './platforms';` после `'./invitations'`.

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/db/schema`
Expected: PASS, включая `invariants.test.ts` — все новые ссылки объявлены с `restrict`.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/db
git commit -m "Завести таблицы платформ, связей и выпусков"
```

### Task 2.2: Обвязка тестов: чтение таблиц и очистка

**Files:**
- Modify: `apps/api/test/db-fixture.ts`

Хелпер, которым пользуются тесты Chunk 3 и 4. Заводится отдельной задачей, чтобы не появляться наполовину в каждой.

- [ ] **Step 1: Дополнить фикстуру**

В `TestDatabase` добавить:

```ts
  /**
   * Все строки таблицы — для проверок уборки за удалением.
   *
   * Полными правами, а не ролью приложения: тест проверяет, что строк
   * не осталось, и отказ в правах выглядел бы как пустая таблица.
   */
  rowsOf: <T extends PgTable>(table: T) => Promise<T['$inferSelect'][]>;
```

и в возвращаемом объекте — `rowsOf: (table) => db.select().from(table)`.

В импорт файла добавить тип таблицы — сейчас его там нет:

```ts
import type { PgTable } from 'drizzle-orm/pg-core';
```

`TRUNCATE` **в этой задаче не трогается**: таблиц в базе ещё нет, миграции появятся только в Task 2.3, и добавленная сюда строка сделала бы красными все интеграционные наборы API до конца чанка. Список правится в Task 2.3, после применения миграций.

- [ ] **Step 2: Проверить типы**

Run: `cd apps/api && npx tsc -p tsconfig.tools.json --noEmit`
Expected: ошибки только из незавершённого Chunk 1 (контракт уже изменён, API ещё нет). В выводе не должно быть ни одной ошибки, указывающей на `test/db-fixture.ts`.

Прогон через Vitest здесь бесполезен: ни один тест в `src/db/schema` фикстуру не импортирует, а типы в Vitest стираются `unplugin-swc`, и ошибка в сигнатуре не всплыла бы вовсе.

- [ ] **Step 3: Коммит**

```bash
git add apps/api/test/db-fixture.ts
git commit -m "Дать тестам читать таблицы и чистить платформы"
```

### Task 2.3: Миграции

**Files:**
- Create: `apps/api/drizzle/0026_release_platforms.sql`
- Create: `apps/api/drizzle/0027_release_platform_privileges.sql`
- Create: `apps/api/drizzle/meta/0026_snapshot.json`, `apps/api/drizzle/meta/0027_snapshot.json` (генератором)
- Modify: `apps/api/drizzle/meta/_journal.json` (генератором)
- Modify: `apps/api/test/environments-privileges.test.ts`
- Modify: `apps/api/test/db-fixture.ts` (список `TRUNCATE`)

- [ ] **Step 1: Падающий тест прав**

В `environments-privileges.test.ts` добавить случай — **перед** `it('роль приложения не меняет схему')`, чтобы тот остался последним:

```ts
it('роль приложения читает и пишет платформы, связи и выпуски', async () => {
  // Единственная автоматическая проверка миграции прав: забытый GRANT
  // иначе всплывёт только в бою.
  await expect(
    testDb.appDb.execute(sql`SELECT count(*) FROM project_platforms`),
  ).resolves.toBeDefined();
  await expect(
    testDb.appDb.execute(sql`SELECT count(*) FROM environment_platforms`),
  ).resolves.toBeDefined();
  await expect(
    testDb.appDb.execute(sql`SELECT count(*) FROM version_platform_releases`),
  ).resolves.toBeDefined();
  await expect(
    testDb.appDb.execute(sql`SELECT count(*) FROM checkpoint_platforms`),
  ).resolves.toBeDefined();
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `cd apps/api && npx vitest run test/environments-privileges.test.ts`
Expected: FAIL — таблиц в базе ещё нет («relation does not exist»).

- [ ] **Step 3: Сгенерировать миграцию таблиц**

Run: `cd apps/api && npx drizzle-kit generate --name=release_platforms`
Expected: `0026_release_platforms.sql` с двумя `CREATE TYPE`, четырьмя `CREATE TABLE`, восемью `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` и тремя `CREATE INDEX`, плюс запись в `meta/_journal.json` и `meta/0026_snapshot.json`.

`ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` на **новых** таблицах — норма: drizzle-kit так оформляет внешние ключи.

Прочитать файл глазами. Любой `DROP` и любой `ALTER` таблицы вне четырёх новых означает, что предварительная работа по выравниванию снапшотов не выполнена (см. шапку плана): остановиться и выполнить её, а не править миграцию. Там же причина, по которой шаг запускается **в терминале**: до выравнивания генератор задаёт интерактивный вопрос о переименовании и без TTY зависает.

- [ ] **Step 4: Добавить миграцию прав**

Run: `cd apps/api && npx drizzle-kit generate --custom --name=release_platform_privileges`

Генератор создаст файл с телом-заглушкой `-- Custom SQL migration file, put your code below! --`, запись в журнале и `meta/0027_snapshot.json`. Снапшота у прежних миграций прав нет (они писались руками), но лишний снапшот безвреден: его содержимое совпадает с `0026`, и следующий `generate` отсчитается от него верно. Заглушку заменить на:

```sql
--> Роль приложения получает права на новые таблицы отдельной миграцией:
--> drizzle-kit их не выдаёт, а без них приложение упадёт на первом запросе.
--> Права на секвенции и типы не нужны: ключи — uuid с gen_random_uuid(),
--> а USAGE на enum-типы есть у PUBLIC по умолчанию.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  project_platforms,
  environment_platforms,
  version_platform_releases,
  checkpoint_platforms
TO cairn_app;
```

- [ ] **Step 5: Запустить тест прав**

Run: `cd apps/api && npx vitest run test/environments-privileges.test.ts`
Expected: PASS. Тест поднимает чистую базу и применяет миграции из репозитория, поэтому проверяет именно их, а не состояние чьей-то локальной базы.

- [ ] **Step 5a: Дополнить список очистки и проверить его на живом наборе**

Теперь, когда таблицы существуют, в `TRUNCATE` в `apps/api/test/db-fixture.ts` добавить четыре таблицы перед `roadmap_public_links`: `checkpoint_platforms`, `version_platform_releases`, `environment_platforms`, `project_platforms`. Каскад от `projects` унёс бы их и так, но список в этом файле называет зависимые таблицы явно (`environment_domains`, `domain_statuses`), и расхождение сбивало бы с толку.

Run: `cd apps/api && npx vitest run src/roadmap/roadmap.repository.test.ts`
Expected: PASS — набор поднимает базу, применяет все миграции и чистит её между тестами, то есть проверяет новый список по-настоящему.

- [ ] **Step 6: Убедиться, что схема и снапшот сошлись**

Run: `cd apps/api && npx drizzle-kit generate --name=release_platforms_check`
Expected: `No schema changes, nothing to migrate` — и **ничего не создано**: при пустом наборе операторов без `--custom` генератор не пишет ни файла, ни записи в журнале, ни снапшота.

Если файл всё же появился — значит расхождение реально. Работа останавливается и расхождение разбирается; удалять файл нельзя, это выбросило бы настоящую правку схемы вместе с несогласованным `meta/`.

Сравнение идёт со снапшотом, а не с базой: `generate` в базу не ходит вовсе. Схему с базой сверяет применение миграций — это Step 5.

- [ ] **Step 7: Коммит**

```bash
git add apps/api/drizzle apps/api/test/environments-privileges.test.ts
git commit -m "Применить таблицы платформ миграцией"
```

---

## Chunk 3: API — платформы проекта

### Task 3.1: Репозиторий платформ

**Files:**
- Create: `apps/api/src/platforms/platforms.repository.ts`
- Create: `apps/api/src/platforms/platforms.repository.test.ts`

Обвязка — как в `roadmap.repository.test.ts`: `testDb`, фабрики `member()` / `admin()`, `grant(level)`, платформы заводятся вставкой в `projectPlatforms` напрямую, потому что репозиторий платформ требует доступа к «Инфо», которого у части субъектов в тестах нет.

Два места, где копирование образца даст неверный результат:

- **`grant()` в образце жёстко прошит на `Section.Roadmap`** (а в тесте окружений — на `Section.Infrastructure`). Здесь он обязан выдавать `Section.Info`;
- **окружений в образце нет вовсе.** Двум тестам `setEnvironmentPlatforms` нужна строка в `environments` — завести её в `beforeEach` вставкой и запомнить `environmentId`.

Импорты, которых в образце нет и которые надо дописать: таблицы `projectPlatforms`, `environmentPlatforms`, `versionPlatformReleases`, `checkpointPlatforms`, перечень `PlatformKind`, ошибка `InsufficientLevelError`.

- [ ] **Step 1: Падающие тесты**

```ts
describe('репозиторий платформ', () => {
  // … testDb, projectId, otherProjectId, subjectId, adminUserId — как в роадмапе

  // Позиция параметром: выборка сортирует по ней, и одинаковая позиция
  // у всех платформ превратила бы тест порядка в проверку времени
  // создания.
  async function createPlatform(
    name: string,
    kind = PlatformKind.Server,
    position = 1,
    target = projectId,
  ): Promise<string> {
    const [created] = await testDb.db
      .insert(projectPlatforms)
      .values({ projectId: target, name, kind, position })
      .returning();

    return created!.id;
  }

  it('скрывает платформы от субъекта без выдачи', async () => {
    // Отсутствие доступа — 404, а не 403: ответ 403 сообщил бы, что
    // проект существует (ТЗ 4.2).
    await expect(repository.findForProject(member(), projectId)).rejects.toBeInstanceOf(
      SectionNotVisibleError,
    );
  });

  it('отказывает уровню ниже требуемого отдельной ошибкой', async () => {
    await grant(AccessLevel.Read);

    await expect(
      testDb.db.transaction((tx) =>
        repository.create(member(), tx, projectId, { kind: PlatformKind.Server, name: 'API' }),
      ),
    ).rejects.toBeInstanceOf(InsufficientLevelError);
  });

  it('отдаёт платформы по порядку на уровне метаданных', async () => {
    await grant(AccessLevel.Metadata);
    await testDb.db.transaction(async (tx) => {
      await repository.create(admin(), tx, projectId, { kind: PlatformKind.Server, name: 'API' });
      await repository.create(admin(), tx, projectId, { kind: PlatformKind.Server, name: 'Веб' });
    });

    const platforms = await repository.findForProject(member(), projectId);

    expect(platforms.map((platform) => platform.name)).toEqual(['API', 'Веб']);
    expect(platforms.map((platform) => platform.position)).toEqual([1, 2]);
  });

  it('отказывает повторному имени внятно', async () => {
    await createPlatform('API');

    await expect(
      testDb.db.transaction((tx) =>
        repository.create(admin(), tx, projectId, { kind: PlatformKind.Server, name: 'API' }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('не видит платформу чужого проекта в правке и удалении', async () => {
    // Уровень проверяется по проекту из адреса: без проверки
    // принадлежности запись в своём проекте давала бы править чужой.
    const foreign = await createPlatform('API', PlatformKind.Server, otherProjectId);

    await expect(
      testDb.db.transaction((tx) =>
        repository.update(admin(), tx, projectId, foreign, { name: 'Веб' }),
      ),
    ).rejects.toBeInstanceOf(SectionNotVisibleError);
    await expect(
      testDb.db.transaction((tx) => repository.remove(admin(), tx, projectId, foreign)),
    ).rejects.toBeInstanceOf(SectionNotVisibleError);
  });

  it('удаление платформы снимает выпуски, теги и связи', async () => {
    // На всех ссылках `restrict`: без явной уборки удаление упёрлось бы
    // в ссылочную целостность и ответило 500 вместо того, чтобы сработать.
    const platformId = await createPlatform('API');
    // … завести версию, чекпоинт, окружение и строки связей вставками

    await testDb.db.transaction((tx) => repository.remove(admin(), tx, projectId, platformId));

    expect(await testDb.rowsOf(versionPlatformReleases)).toHaveLength(0);
    expect(await testDb.rowsOf(checkpointPlatforms)).toHaveLength(0);
    expect(await testDb.rowsOf(environmentPlatforms)).toHaveLength(0);
    expect(await testDb.rowsOf(projectPlatforms)).toHaveLength(0);
  });

  it('не ставит магазин в окружение', async () => {
    const storeId = await createPlatform('App Store', PlatformKind.Store);

    await expect(
      testDb.db.transaction((tx) =>
        repository.setEnvironmentPlatforms(tx, environmentId, [storeId]),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('не ставит в окружение платформу чужого проекта', async () => {
    const foreign = await createPlatform('API', PlatformKind.Server, otherProjectId);

    await expect(
      testDb.db.transaction((tx) =>
        repository.setEnvironmentPlatforms(tx, environmentId, [foreign]),
      ),
    ).rejects.toBeInstanceOf(SectionNotVisibleError);
  });

  it('заводит платформы вместе с проектом только суперадмину', async () => {
    await expect(
      testDb.db.transaction((tx) =>
        repository.createMany(member(), tx, projectId, [
          { kind: PlatformKind.Server, name: 'API' },
        ]),
      ),
    ).rejects.toBeInstanceOf(InsufficientLevelError);
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/api && npx vitest run src/platforms/platforms.repository.test.ts`
Expected: FAIL — модуль `./platforms.repository` не найден.

- [ ] **Step 3: Реализация**

Устройство — как у `RoadmapRepository`: конструктор берёт `DATABASE` и `AccessService`, каждый метод с субъектом сам проверяет уровень **тем же исполнителем**, которым работает (внутри транзакции обращение к другому подключению увидело бы состояние до неё).

| Метод | Право | Что делает |
|---|---|---|
| `findForProject(subject, projectId)` | «Инфо», метаданные | платформы по `position`, затем `createdAt` |
| `create(subject, tx, projectId, input)` | «Инфо», запись | повторное имя → `ConflictException`; `position` = максимум + 1 |
| `createMany(subject, tx, projectId, inputs)` | признак суперадмина напрямую | для создания проекта: выдачи на только что созданный проект ещё не существует. Возвращает созданные строки — службе нужны `id` и имена для журнала |
| `update(subject, tx, projectId, platformId, input)` | «Инфо», запись | `requireInProject`, затем повторное имя → `ConflictException` |
| `remove(subject, tx, projectId, platformId)` | «Инфо», запись | `requireInProject`, уборка выпусков, тегов, связей, затем платформа |
| `setEnvironmentPlatforms(tx, environmentId, platformIds)` | — | зовётся из репозитория окружений, который уже проверил «Инфраструктуру» и принадлежность окружения проекту. Субъекта не принимает — прецедент тот же, что у `DomainsRepository.ensureRoot(tx, name)`; проект берётся из самой строки окружения, поэтому обойти проверку нельзя |
| `requireInProject(executor, projectId, platformId)` | — | платформа чужого проекта → `SectionNotVisibleError` |

`createMany` принимает субъект и проверяет `!subject.isSuperadmin || subject.isRevoked` — ровно как `ProjectsRepository.create`: метод экспортируется вместе с модулем, и без проверки любой будущий вызывающий заводил бы платформы в любом проекте. Отзыв проверяется наравне с признаком, иначе обоснование «любой будущий вызывающий» не держится.

`position` в `createMany` раздаётся по месту в списке (`index + 1`) одной вставкой: колонка `NOT NULL`, а порядок платформ проекта должен совпасть с порядком, в котором их перечислили в форме.

Ключевой метод целиком:

```ts
  /**
   * Платформы, развёрнутые в окружении.
   *
   * Набор заменяется целиком: он правится целиком в одной форме.
   * Магазин в окружение не ставится — у него нет ни машины, ни адреса,
   * и запись об этом была бы ложью о том, где он живёт.
   */
  async setEnvironmentPlatforms(
    tx: Transaction,
    environmentId: string,
    platformIds: string[],
  ): Promise<void> {
    const [environment] = await tx
      .select({ projectId: environments.projectId })
      .from(environments)
      .where(eq(environments.id, environmentId))
      .limit(1);

    if (!environment) {
      throw new SectionNotVisibleError();
    }

    const unique = [...new Set(platformIds)];

    const chosen = unique.length
      ? await tx
          .select()
          .from(projectPlatforms)
          .where(
            and(
              eq(projectPlatforms.projectId, environment.projectId),
              inArray(projectPlatforms.id, unique),
            ),
          )
      : [];

    // Сравнение с размером множества, а не длиной массива: повтор
    // в запросе иначе дал бы ложный 404. Схема повторы и так отвергает,
    // но точка контроля — репозиторий.
    if (chosen.length !== unique.length) {
      throw new SectionNotVisibleError();
    }

    const foreign = chosen.find((platform) => platform.kind !== PlatformKind.Server);

    if (foreign) {
      throw new ConflictException(
        // Текст общий: правило отвергает и магазин, и «иное» — у пакета
        // в реестре машины и адреса тоже нет.
        `Платформа «${foreign.name}» не живёт в окружении: окружение есть только у того, что развёрнуто на наших машинах.`,
      );
    }

    await tx
      .delete(environmentPlatforms)
      .where(eq(environmentPlatforms.environmentId, environmentId));

    if (unique.length) {
      await tx
        .insert(environmentPlatforms)
        .values(unique.map((platformId) => ({ environmentId, platformId })));
    }
  }
```

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/platforms`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/platforms
git commit -m "Вести платформы проекта в репозитории"
```

### Task 3.2: Служба платформ и журнал

**Files:**
- Create: `apps/api/src/platforms/platforms.service.ts`
- Create: `apps/api/src/platforms/platforms.service.test.ts`
- Modify: `apps/api/src/audit/audit.types.ts`

- [ ] **Step 1: Падающие тесты**

Обвязка — как в `roadmap.service.test.ts`: служба собирается позиционно с настоящим `new AuditService()`, журнал читается хелпером `entriesOf(action)`.

В образце есть только `admin()`; для третьего теста понадобится не-суперадминский субъект — завести вторую строку в `subjects`/`users` и фабрику `member()`, как в тестах репозиториев.

```ts
it('пишет заведение платформы в журнал', async () => {
  await service.create(admin(), projectId, { kind: PlatformKind.Store, name: 'RuStore' });

  const [entry] = await entriesOf(AuditAction.PlatformCreated);

  expect(entry?.metadata).toMatchObject({ name: 'RuStore' });
});

it('помнит имя удалённой платформы', async () => {
  // После удаления имя взять уже негде, а запись в журнале без имени
  // ссылается на то, чего не найти.
  const created = await service.create(admin(), projectId, {
    kind: PlatformKind.Server,
    name: 'API',
  });

  await service.remove(admin(), projectId, created.id);

  const [entry] = await entriesOf(AuditAction.PlatformDeleted);

  expect(entry?.metadata).toMatchObject({ name: 'API' });
});

it('пишет правку имени', async () => {
  const created = await service.create(admin(), projectId, {
    kind: PlatformKind.Server,
    name: 'Веб',
  });

  await service.update(admin(), projectId, created.id, { name: 'Веб-админка' });

  const [entry] = await entriesOf(AuditAction.PlatformUpdated);

  expect(entry?.metadata).toMatchObject({ name: 'Веб-админка' });
});

it('при отказе в правах ничего не пишет', async () => {
  await expect(
    service.create(member(), projectId, { kind: PlatformKind.Server, name: 'API' }),
  ).rejects.toThrow();

  expect(await entriesOf(AuditAction.PlatformCreated)).toHaveLength(0);
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/api && npx vitest run src/platforms/platforms.service.test.ts`
Expected: FAIL — модуль `./platforms.service` не найден.

- [ ] **Step 3: Реализация**

В `audit.types.ts`, в `AuditAction`, после `ProjectUpdated`:

```ts
  PlatformCreated = 'platform.created',
  PlatformUpdated = 'platform.updated',
  PlatformDeleted = 'platform.deleted',
  PlatformReleaseSet = 'platform_release.set',
  PlatformReleaseCleared = 'platform_release.cleared',
```

`platforms.service.ts` — по образцу `RoadmapService`: чтение пробрасывается в репозиторий как есть (`findForProject`), изменения идут в транзакции с записью в журнал. `entityType: 'platform'`, в метаданных `name`; у удаления имя берётся из строки, которую вернул репозиторий.

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/platforms`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/platforms apps/api/src/audit/audit.types.ts
git commit -m "Писать платформы в журнал"
```

### Task 3.3: Ручки платформ и сборка модуля

**Files:**
- Create: `apps/api/src/platforms/platforms.controller.ts`
- Create: `apps/api/src/platforms/platforms.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/app.module.test.ts`

- [ ] **Step 1: Падающий тест**

В существующий тест `app.module.test.ts` («собирается со всеми модулями») добавить строку в том же стиле — проверка идёт через `moduleRef.get`, хелпера `modulesOf` в проекте нет:

```ts
    expect(moduleRef.get(PlatformsService)).toBeDefined();
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `cd apps/api && npx vitest run src/app.module.test.ts`
Expected: FAIL — `PlatformsService` не разрешается: модуль не подключён.

- [ ] **Step 3: Реализация**

`platforms.controller.ts`:

```ts
/** Платформы проекта: поле паспорта, секция «Инфо». */
@Controller('projects/:projectId/platforms')
@UseGuards(SessionGuard)
export class PlatformsController {
  constructor(private readonly platforms: PlatformsService) {}

  /** Платформы проекта по порядку. */
  @Get()
  async list(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<Platform[]> {
    return this.platforms.findForProject(subject, projectId);
  }

  // POST с ZodValidationPipe(platformCreateSchema),
  // PATCH ':platformId' с ZodValidationPipe(platformUpdateSchema),
  // DELETE ':platformId' с @HttpCode(204).
}
```

Проекция строки в `Platform` — явным объектом (`id`, `kind`, `name`, `position`), а не разворотом строки: иначе наружу уйдут `projectId` и отметки времени.

`platforms.module.ts`: `imports` — `DbModule`, `AccessModule`, `AuditModule`, `AuthModule` (последний обязателен: контроллер висит на `SessionGuard`, и без него падает именно тест сборки); `controllers` — `PlatformsController`; `providers` — `PlatformsRepository` и `PlatformsService`; `exports` — `PlatformsRepository`, он понадобится модулям проектов и окружений.

`ParseUUIDPipe` ставится на **каждый** параметр адреса, включая `:platformId`: без него мусорный идентификатор уедет в PostgreSQL и вернётся `500`. Во всех существующих контроллерах пайп стоит везде.

В `app.module.ts` добавить `PlatformsModule` в `imports`.

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/app.module.test.ts src/platforms`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/platforms apps/api/src/app.module.ts apps/api/src/app.module.test.ts
git commit -m "Открыть ручки платформ"
```

### Task 3.4: Платформы при создании проекта

**Files:**
- Modify: `apps/api/src/projects/projects.repository.ts`
- Modify: `apps/api/src/projects/projects.service.ts`
- Modify: `apps/api/src/projects/projects.service.test.ts`
- Modify: `apps/api/src/projects/projects.module.ts`

Платформы заводит **служба**, а не репозиторий проектов: репозиторий лишь перестаёт спотыкаться о лишнее поле. Поэтому и тест — в тесте службы, а не репозитория.

- [ ] **Step 1: Падающий тест**

`PlatformsRepository` добавляется в конструктор `ProjectsService` **пятым**, после `AccessService`: конструктор уже четырёхместный (`db`, `ProjectsRepository`, `AuditService`, `AccessService`), и вставка четвёртым вытеснила бы службу прав, отчего упал бы `sectionsFor`. Тот же порядок — в сборке службы внутри теста.

Хелпера `entriesOf` в этом файле **нет** (он есть в тестах роадмапа, окружений и переменных, а здесь журнал читается встроенно). Либо завести его по образцу, либо писать выборкой — ниже второй вариант.

```ts
it('создаёт проект вместе с платформами и пишет каждую в журнал', async () => {
  const created = await service.create(admin(), {
    name: 'Касса',
    platforms: [
      { kind: PlatformKind.Server, name: 'API' },
      { kind: PlatformKind.Store, name: 'App Store' },
    ],
  });

  const platforms = await testDb.rowsOf(projectPlatforms);

  // Сортировка по позиции обязательна: `rowsOf` — это `select` без
  // `ORDER BY`, и порядок строк в куче ничем не закреплён.
  expect(
    platforms.sort((first, second) => first.position - second.position).map((row) => row.name),
  ).toEqual(['API', 'App Store']);
  expect(platforms.every((platform) => platform.projectId === created.id)).toBe(true);

  const entries = await testDb.db
    .select()
    .from(auditLog)
    .where(eq(auditLog.action, AuditAction.PlatformCreated));

  expect(entries).toHaveLength(2);
});

it('создаёт проект без платформ, когда их не прислали', async () => {
  await service.create(admin(), { name: 'Касса' });

  expect(await testDb.rowsOf(projectPlatforms)).toHaveLength(0);
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `cd apps/api && npx vitest run src/projects/projects.service.test.ts`
Expected: FAIL. Вероятнее всего — на вставке: `platforms` уйдёт в `values()` как несуществующая колонка. Если конструктор ещё не принимает новую зависимость, падение будет на компиляции — это тоже ожидаемо.

- [ ] **Step 3: Реализация**

В `projects.repository.ts`, в `create`, **обязательно** отделить платформы от полей проекта:

```ts
    // Платформы — не колонка таблицы: без этого Drizzle получит
    // несуществующее поле и вставка упадёт.
    const { platforms: _platforms, ...fields } = input;
    const slug = await this.findFreeSlug(tx, generateSlug(fields.name));

    const [created] = await tx
      .insert(projects)
      .values({ ...fields, slug })
      .returning();
```

В `ProjectsService.create` — после создания проекта, в той же транзакции:

```ts
      // Охрана обязательна по двум причинам: поле необязательно в схеме
      // (тип `PlatformCreate[] | undefined`), а `insert().values([])`
      // в Drizzle бросает.
      if (input.platforms?.length) {
        const platforms = await this.platforms.createMany(subject, tx, created.id, input.platforms);
        // запись `platform.created` на каждую возвращённую строку
      }
```

Служба работает с **репозиторием** платформ, а не со службой: вложенная транзакция здесь не нужна и привела бы к транзакции в транзакции — у тестовой фикстуры пул `max: 1`, и такая вложенность заблокировалась бы навсегда.

`ProjectsModule` импортирует `PlatformsModule`.

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/projects`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/projects
git commit -m "Заводить платформы вместе с проектом"
```

### Task 3.5: Платформы окружения

**Files:**
- Modify: `apps/api/src/environments/environments.repository.ts`
- Modify: `apps/api/src/environments/environment.projection.ts`
- Modify: `apps/api/src/environments/environment.projection.test.ts` (семь позиционных вызовов проекции)
- Modify: `apps/api/src/environments/environments.repository.test.ts` (конструктор репозитория вызывается **дважды**: в `beforeAll` и в тесте про разрешение корня)
- Modify: `apps/api/src/environments/environments.service.test.ts` (конструктор репозитория в сборке службы)
- Modify: `apps/api/src/environments/environments.module.ts`

- [ ] **Step 1: Падающие тесты**

Тесты службы и проекции правятся только из-за подписей: `EnvironmentsRepository` получает `PlatformsRepository` четвёртым аргументом, `environmentProjection` — платформы. Поведение там не меняется, правка механическая, но без неё файлы не соберутся.

Фикстуры теста репозитория: платформы заводятся вставкой с позициями 1 («API») и 2 («Веб»), окружение — существующим хелпером `createProd()`, который возвращает идентификатор. Переменной `environmentId` в файле нет.

```ts
it('отдаёт в окружении то, что в нём развёрнуто', async () => {
  await grant(AccessLevel.Write);
  await testDb.db.transaction((tx) =>
    repository.update(member(), tx, projectId, environmentId, { platformIds: [webId, apiId] }),
  );

  const [environment] = await repository.findForProject(member(), projectId);

  // toMatchObject, а не обращение к полю: findForProject возвращает union,
  // и у проекции метаданных поля нет — существующие тесты файла делают так же.
  expect(environment).toMatchObject({
    platforms: [{ name: 'API' }, { name: 'Веб' }],
  });
});

it('создаёт окружение с платформами', async () => {
  // `platformIds` попадает в схему создания автоматически, а `create`
  // вставляет поля как есть: без отдельного снятия Drizzle получит
  // несуществующую колонку.
  await grant(AccessLevel.Write);

  const created = await testDb.db.transaction((tx) =>
    repository.create(member(), tx, projectId, {
      name: 'Прод',
      kind: EnvironmentKind.Production,
      platformIds: [apiId],
    }),
  );

  expect(created.id).toBeDefined();
  expect(await testDb.rowsOf(environmentPlatforms)).toHaveLength(1);
});

it('удаление окружения снимает его связи с платформами', async () => {
  await grant(AccessLevel.Write);
  await testDb.db.transaction((tx) =>
    repository.update(member(), tx, projectId, environmentId, { platformIds: [apiId] }),
  );

  await testDb.db.transaction((tx) =>
    repository.remove(member(), tx, projectId, environmentId),
  );

  expect(await testDb.rowsOf(environmentPlatforms)).toHaveLength(0);
});
```

Порядок в первом тесте значим: платформы отдаются по `position` платформы, а не по порядку присланных идентификаторов — у самой связи порядка нет, и без сортировки список прыгал бы между запросами.

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/api && npx vitest run src/environments`
Expected: FAIL — `platforms` в окружении нет, создание с `platformIds` падает на вставке, удаление — на ссылочной целостности.

- [ ] **Step 3: Реализация**

- `create` и `update`: отделить `platformIds` от полей окружения (как уже
  сделано с `domains`), и если поле **присутствует** — вызвать
  `PlatformsRepository.setEnvironmentPlatforms` тем же `tx`. Отсутствие
  поля не трогает набор;
- `remove`: перед удалением окружения снять строки `environmentPlatforms`;
- `findForProject` и `findById`: подгрузить платформы окружений одним
  запросом (`inArray` по идентификаторам окружений, как уже сделано с
  доменами), с сортировкой по `projectPlatforms.position`, и передать
  в проекцию;
- `environment.projection.ts`: `platforms` появляется только на уровне
  чтения, рядом с `server`. Рядом — комментарий о том, что имя платформы
  намеренно видно из «Инфраструктуры» без выдачи на «Инфо» (тот же приём,
  что у имени окружения в переменных), иначе это выглядит как утечка
  проекции и будет «исправлено» при следующем проходе по правам.

`EnvironmentsModule` импортирует `PlatformsModule`.

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/environments src/platforms src/projects`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/environments
git commit -m "Отмечать в окружении развёрнутые платформы"
```

---

## Chunk 4: API — выпуски и сводка

### Task 4.1: Правило сводки

**Files:**
- Create: `apps/api/src/roadmap/release.summary.ts`
- Create: `apps/api/src/roadmap/release.summary.test.ts`

Чистая функция без базы: правило проверяется таблицей случаев, а не поднятым PostgreSQL.

- [ ] **Step 1: Падающие тесты**

```ts
import { PlatformKind, PlatformReleaseState } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { releaseSummaryOf } from './release.summary';

const API = { id: 'p1', kind: PlatformKind.Server, name: 'API', position: 1 };
const STORE = { id: 'p2', kind: PlatformKind.Store, name: 'App Store', position: 2 };

const V1 = { id: 'v1', label: 'v1.2' };
const V2 = { id: 'v2', label: 'v1.3' };

/** Строка выпуска в том виде, в каком её читает правило. */
function release(
  version: { id: string },
  platform: { id: string },
  state: PlatformReleaseState,
  releasedDate: string | null,
  buildLabel: string | null = null,
) {
  return { versionId: version.id, platformId: platform.id, state, releasedDate, buildLabel };
}

describe('releaseSummaryOf', () => {
  it('строка есть у каждой платформы, даже без релизов', () => {
    const summary = releaseSummaryOf([API, STORE], [V1], []);

    expect(summary).toHaveLength(2);
    expect(summary[0]?.released).toBeNull();
    expect(summary[0]?.pending).toEqual([]);
  });

  it('строки идут в порядке платформ', () => {
    const summary = releaseSummaryOf([STORE, API], [V1], []);

    // Порядок приходит из списка платформ, уже упорядоченного выборкой.
    expect(summary.map((row) => row.platform.name)).toEqual(['App Store', 'API']);
  });

  it('в релизе — выпущенный выпуск самой поздней версии', () => {
    const [row] = releaseSummaryOf(
      [API],
      [V1, V2],
      [
        release(V1, API, PlatformReleaseState.Released, '2026-03-12'),
        release(V2, API, PlatformReleaseState.Released, '2026-03-16'),
      ],
    );

    expect(row?.released?.versionLabel).toBe('v1.3');
    expect(row?.released?.date).toBe('2026-03-16');
  });

  it('в пути — только то, что стоит после релиза', () => {
    // Отклонённая версия, которую уже обогнали, в сводке не висит:
    // сводка смотрит вперёд от текущего релиза.
    const [row] = releaseSummaryOf(
      [STORE],
      [V1, V2],
      [
        release(V1, STORE, PlatformReleaseState.Rejected, null),
        release(V2, STORE, PlatformReleaseState.Released, '2026-03-16'),
      ],
    );

    expect(row?.released?.versionLabel).toBe('v1.3');
    expect(row?.pending).toEqual([]);
  });

  it('показывает модерацию после текущего релиза', () => {
    const [row] = releaseSummaryOf(
      [STORE],
      [V1, V2],
      [
        release(V1, STORE, PlatformReleaseState.Released, '2026-03-14'),
        release(V2, STORE, PlatformReleaseState.InReview, null),
      ],
    );

    expect(row?.pending.map((entry) => entry.state)).toEqual([PlatformReleaseState.InReview]);
    expect(row?.pending[0]?.versionLabel).toBe('v1.3');
    expect(row?.pending[0]?.date).toBeNull();
  });

  it('без релиза показывает всё, что в пути, по порядку версий', () => {
    const [row] = releaseSummaryOf(
      [API],
      [V1, V2],
      [
        release(V2, API, PlatformReleaseState.OnTest, null),
        release(V1, API, PlatformReleaseState.OnTest, null),
      ],
    );

    expect(row?.pending.map((entry) => entry.versionLabel)).toEqual(['v1.2', 'v1.3']);
  });

  it('обозначение сборки берётся у выпуска, а не у версии', () => {
    const [row] = releaseSummaryOf(
      [STORE],
      [V1],
      [release(V1, STORE, PlatformReleaseState.Released, '2026-03-14', '1.2 (45)')],
    );

    expect(row?.released?.buildLabel).toBe('1.2 (45)');
  });

  it('молча пропускает выпуск неизвестной версии', () => {
    // Такого быть не может, пока выпуски уходят вместе с версией,
    // но падать на этом в сводке хуже, чем не показать строку.
    const [row] = releaseSummaryOf(
      [API],
      [V1],
      [release({ id: 'нет такой' }, API, PlatformReleaseState.Released, '2026-03-14')],
    );

    expect(row?.released).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/api && npx vitest run src/roadmap/release.summary.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализация**

```ts
/**
 * Сводка релизов: что у каждой платформы в релизе и что идёт за ним.
 *
 * Вычисляется, а не хранится, — как прогресс версии и стадия проекта
 * (ТЗ 3.5). Считается на сервере, потому что ту же сводку получает
 * публичная страница: повторять правило на клиенте значило бы разойтись
 * с ним при первой же правке.
 *
 * Принимает не строки базы, а то немногое, что ей нужно: так правило
 * проверяется таблицей случаев без поднятого PostgreSQL.
 *
 * Порядок версий берётся из **порядка списка**, а не из поля `position`:
 * уникальности по позиции у версий нет, правка позиции соседей не
 * перенумеровывает, и две версии могут встать на одно место. Список
 * приходит упорядоченным из выборки (`position`, затем `createdAt`),
 * и его индекс — единственный детерминированный порядковый номер.
 */
export function releaseSummaryOf(
  platforms: Platform[],
  versions: SummaryVersion[],
  releases: SummaryRelease[],
): ReleaseSummaryRow[]
```

Два локальных типа объявляются в этом же файле — в контракте их нет и быть не должно:

```ts
/** Версия глазами сводки: обозначение и место в последовательности. */
interface SummaryVersion {
  id: string;
  label: string;
}

/**
 * Выпуск глазами сводки.
 *
 * Не `PlatformRelease` из контракта: там нет `versionId`, потому что
 * выпуски отдаются вложенными в свою версию. Правилу же нужна плоская
 * таблица, и версию он берёт из самой строки.
 */
type SummaryRelease = PlatformRelease & { versionId: string };
```

Правило:

1. построить `Map` «идентификатор версии → `{ label, ordinal }`», где
   `ordinal` — индекс в пришедшем списке;
2. выпуски сгруппировать по платформе, выпуски неизвестных версий
   отбросить;
3. в каждой группе найти выпуск в состоянии `Released` с наибольшим
   `ordinal` — это `released`;
4. `pending` — выпуски в прочих состояниях с `ordinal` больше, чем у
   найденного (нет `released` — все), по возрастанию `ordinal`;
5. строки — по порядку пришедшего списка платформ; платформа без выпусков
   даёт `{ released: null, pending: [] }`.

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/roadmap/release.summary.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/roadmap
git commit -m "Вычислять сводку релизов по выпускам"
```

### Task 4.2: Выпуски, теги и дата в проекции версии

**Files:**
- Modify: `apps/api/src/roadmap/roadmap.projection.ts`
- Modify: `apps/api/src/roadmap/roadmap.projection.test.ts`
- Modify: `apps/api/src/roadmap/roadmap.repository.ts` (два вызова проекции)

- [ ] **Step 1: Падающие тесты и правка существующих вызовов**

Подпись меняется, поэтому **сначала** поправить все существующие вызовы. Их восемь, в двух файлах, и один из них держит публичную выдачу:

- `roadmap.projection.test.ts` — шесть вызовов; пятый и шестой передают `false` четвёртым аргументом;
- `roadmap.repository.ts` — два вызова: внутреннего чтения и публичного.

Всем добавляется `[]` третьим аргументом; те, что передавали `false`, переписываются на объект настроек:

```ts
// было
versionProjection(version, checkpoints, AccessLevel.Read, false)
// стало
versionProjection(version, checkpoints, [], AccessLevel.Read, { withLinks: false })
```

**Публичный вызов в репозитории правится в этом же шаге, не позже.** Если его оставить, `AccessLevel.Read` встанет в параметр выпусков, `false` — в параметр уровня, объект настроек окажется пустым, и `withLinks` молча вернётся к `true`: адреса внутреннего трекера уедут в публичную выдачу. Компилятор здесь не страхует — `typecheck` красный до конца Chunk 6.

Новые тесты (приведение типа обязательно: функция возвращает union, и тесты файла уже пишут `as RoadmapVersionDetail`):

```ts
it('дата версии берётся из выпусков, когда они есть', () => {
  // Одна правда в каждый момент: хранимая дата остаётся ответом, пока
  // не появился ответ точнее.
  const projected = versionProjection(
    { ...version, releasedDate: '2026-01-01' },
    [],
    [
      { platformId: 'p1', state: PlatformReleaseState.Released, releasedDate: '2026-03-12', buildLabel: null },
      { platformId: 'p2', state: PlatformReleaseState.Released, releasedDate: '2026-03-16', buildLabel: null },
    ],
    AccessLevel.Read,
  );

  expect(projected.releasedDate).toBe('2026-03-16');
});

it('не теряет хранимую дату, когда выпуски выпущены без дат', () => {
  // «Вышла, дата неизвестна» — допустимое состояние выпуска, и оно
  // не должно стирать то, что уже известно о версии.
  const projected = versionProjection(
    { ...version, releasedDate: '2026-01-01' },
    [],
    [{ platformId: 'p1', state: PlatformReleaseState.Released, releasedDate: null, buildLabel: null }],
    AccessLevel.Read,
  );

  expect(projected.releasedDate).toBe('2026-01-01');
});

it('без выпущенных выпусков дата остаётся хранимой', () => {
  const projected = versionProjection(
    { ...version, releasedDate: '2026-01-01' },
    [],
    [{ platformId: 'p1', state: PlatformReleaseState.OnTest, releasedDate: null, buildLabel: null }],
    AccessLevel.Read,
  );

  expect(projected.releasedDate).toBe('2026-01-01');
});

it('дата из выпусков видна и на уровне метаданных', () => {
  // Публичная схема расширяет метаданные: положи вычисление в блок
  // чтения — и наружу уйдёт устаревшая хранимая дата.
  const projected = versionProjection(
    { ...version, releasedDate: '2026-01-01' },
    [],
    [{ platformId: 'p1', state: PlatformReleaseState.Released, releasedDate: '2026-03-16', buildLabel: null }],
    AccessLevel.Metadata,
  );

  expect(projected.releasedDate).toBe('2026-03-16');
});

it('выпуски и теги открываются уровнем чтения', () => {
  const releases = [
    { platformId: 'p1', state: PlatformReleaseState.OnTest, releasedDate: null, buildLabel: null },
  ];
  const tags = new Map([[checkpoints[0]!.id, ['p1']]]);

  const metadata = versionProjection(version, checkpoints, releases, AccessLevel.Metadata);
  const read = versionProjection(version, checkpoints, releases, AccessLevel.Read, {
    platformsByCheckpoint: tags,
  }) as RoadmapVersionDetail;

  expect('releases' in metadata).toBe(false);
  expect(read.releases).toHaveLength(1);
  expect(read.checkpoints[0]?.platformIds).toEqual(['p1']);
});

it('чекпоинт без тегов получает пустой набор, а не отсутствие поля', () => {
  // Публичная схема строгая и поле ждёт; отсутствие провалило бы разбор.
  const read = versionProjection(version, checkpoints, [], AccessLevel.Read) as RoadmapVersionDetail;

  expect(read.checkpoints[0]?.platformIds).toEqual([]);
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/api && npx vitest run src/roadmap/roadmap.projection.test.ts`
Expected: FAIL — у `versionProjection` нет третьего параметра и нет объекта настроек.

- [ ] **Step 3: Реализация**

Подпись: выпуски — позиционно, остальное — объектом настроек.

```ts
/** Настройки проекции, которые легко перепутать позициями. */
interface VersionProjectionOptions {
  /**
   * Отдавать ли ссылки на задачи. По умолчанию да.
   *
   * Объектом, а не шестым позиционным аргументом: этот флаг —
   * единственное, что держит адрес внутреннего трекера внутри, и
   * позиционный булев легко уехал бы не туда при следующей правке
   * подписи.
   */
  withLinks?: boolean;
  /** Теги чекпоинтов: идентификатор чекпоинта → платформы. */
  platformsByCheckpoint?: Map<string, string[]>;
}

export function versionProjection(
  version: RoadmapVersionRow,
  checkpoints: RoadmapCheckpointRow[],
  releases: PlatformRelease[],
  level: AccessLevel,
  { withLinks = true, platformsByCheckpoint }: VersionProjectionOptions = {},
): RoadmapVersionMetadata | RoadmapVersionDetail
```

`releasedDate` считается **в блоке метаданных** отдельной чистой функцией:

```ts
/**
 * Фактическая дата версии: самая поздняя дата выпущенных выпусков, иначе
 * хранимая.
 *
 * Выпуски точнее: у версии одна дата, а платформы выходят вразнобой.
 * Хранимая колонка остаётся ответом, пока точнее ответить нечем, —
 * в том числе когда выпуски выпущены, но даты у них не заполнены.
 */
function releasedDateOf(version: RoadmapVersionRow, releases: PlatformRelease[]): string | null {
  // Фильтр пустых дат идёт **до** проверки на пустоту: иначе выпуск
  // «вышла, дата неизвестна» затёр бы хранимую дату на null.
  const dates = releases
    .filter((release) => release.state === PlatformReleaseState.Released)
    .map((release) => release.releasedDate)
    .filter((date): date is string => date !== null);

  // Строки `ГГГГ-ММ-ДД` сравниваются лексикографически верно: нули-
  // заполнители на месте. Не «починить» это на localeCompare.
  return dates.length > 0 ? dates.sort().at(-1)! : version.releasedDate;
}
```

Теги — `platformIds: platformsByCheckpoint?.get(checkpoint.id) ?? []`, рядом с `url`. Поле добавляется **всегда**, в отличие от `url`: публичная схема его ждёт.

Выборка тегов сортируется по `projectPlatforms.position` — тем же порядком, что сводка: иначе чипы у чекпоинта тасовались бы между запросами.

`releases` добавляется в блок уровня чтения, рядом с `checkpoints`.

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/roadmap/roadmap.projection.test.ts`
Expected: PASS. Репозиторий на этом шаге ещё передаёт `[]` — `summary` в ответе появится в Task 4.3.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/roadmap
git commit -m "Показывать в версии её выпуски и теги чекпоинтов"
```

### Task 4.3: Чтение роадмапа со сводкой

**Files:**
- Modify: `apps/api/src/roadmap/roadmap.repository.ts`
- Modify: `apps/api/src/roadmap/roadmap.repository.test.ts`

- [ ] **Step 1: Падающие тесты**

Платформы в тестах заводятся вставкой в `projectPlatforms` — репозиторий платформ потребовал бы «Инфо». Хелпер нужен свой, в этом файле его нет:

```ts
  async function createPlatform(
    name: string,
    kind = PlatformKind.Server,
    position = 1,
    target = projectId,
  ): Promise<string> {
    const [created] = await testDb.db
      .insert(projectPlatforms)
      .values({ projectId: target, name, kind, position })
      .returning();

    return created!.id;
  }
```

Дописать в импорты файла: таблицы `projectPlatforms`, `versionPlatformReleases`, `checkpointPlatforms` и перечни `PlatformKind`, `PlatformReleaseState`. В `roadmap.projection.test.ts` — `PlatformReleaseState`, в `roadmap.service.test.ts` — `projectPlatforms`, `PlatformKind`, `PlatformReleaseState`.

```ts
it('отдаёт сводку рядом с версиями', async () => {
  await grant(AccessLevel.Read);
  await createPlatform('API', PlatformKind.Server, 1);
  await createPlatform('App Store', PlatformKind.Store, 2);

  const roadmap = await repository.findForProject(member(), projectId);

  expect(roadmap.summary.map((row) => row.platform.name)).toEqual(['API', 'App Store']);
});

it('отдаёт сводку и на уровне метаданных', async () => {
  // Обозначения версий и даты метаданными и являются; формулировок
  // чекпоинтов в сводке нет.
  await grant(AccessLevel.Metadata);
  await createPlatform('API');

  const roadmap = await repository.findForProject(member(), projectId);

  expect(roadmap.summary).toHaveLength(1);
});

it('отдаёт сводку тому, у кого нет доступа к «Инфо»', async () => {
  // Платформы — поле паспорта, но их имена раскрываются в той секции,
  // где упомянуты: тот же приём, что у имени окружения в переменных.
  await grant(AccessLevel.Read); // выдача только на Section.Roadmap
  await createPlatform('API');

  const roadmap = await repository.findForProject(member(), projectId);

  expect(roadmap.summary).toHaveLength(1);
});

it('отдаёт сводку в публичной выдаче, без ссылок на задачи', async () => {
  // Чекпоинт со ссылкой обязателен: без него `checkpoints[0]` —
  // `undefined`, и проверка прошла бы при любой реализации.
  await createPlatform('API');
  const versionId = await createVersion('v1.0');
  await testDb.db.transaction((tx) =>
    repository.createCheckpoint(admin(), tx, projectId, versionId, {
      title: 'Оплата',
      url: 'https://tracker.example/1',
    }),
  );
  const token = await testDb.db.transaction((tx) => repository.publish(tx, projectId));

  const roadmap = await repository.publicRoadmap(token);
  const checkpoint = roadmap?.versions[0]?.checkpoints[0];

  expect(roadmap?.summary).toHaveLength(1);
  expect(checkpoint?.title).toBe('Оплата');
  expect(checkpoint).not.toHaveProperty('url');
});

it('версия уровня чтения сохраняет чекпоинты', async () => {
  // Страховка от тихой деградации union: проекция, забывшая `releases`,
  // провалилась бы в ветку метаданных и потеряла чекпоинты вместо ошибки.
  await grant(AccessLevel.Read);
  const versionId = await createVersion('v1.0');
  await testDb.db.transaction((tx) =>
    repository.createCheckpoint(admin(), tx, projectId, versionId, { title: 'Оплата' }),
  );

  const roadmap = await repository.findForProject(member(), projectId);

  expect(roadmap.versions[0]).toHaveProperty('checkpoints');
  expect(roadmap.versions[0]).toHaveProperty('releases');
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/api && npx vitest run src/roadmap/roadmap.repository.test.ts`
Expected: FAIL — `summary` в ответе нет.

- [ ] **Step 3: Реализация**

`loadRoadmap` дополняется тремя выборками: платформы проекта, выпуски версий, теги чекпоинтов. Таблицы читаются **напрямую**, а не через `PlatformsRepository`:

```ts
    // Платформы читаются таблицей, а не репозиторием платформ: тот
    // проверяет доступ к «Инфо», которого у подрядчика с одним роадмапом
    // нет. Право на эти данные даёт сама секция «Роадмап» (дизайн 9).
    const platforms = await executor
      .select()
      .from(projectPlatforms)
      .where(eq(projectPlatforms.projectId, projectId))
      .orderBy(asc(projectPlatforms.position), asc(projectPlatforms.createdAt));
```

`findForProject` и `publicRoadmap` возвращают `summary: releaseSummaryOf(platforms, versions, releases)` — `versions` передаются в том же порядке, в котором пришли из выборки. Проекции версий получают выпуски своей версии и карту тегов; публичный путь сохраняет `{ withLinks: false, platformsByCheckpoint }`.

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/roadmap`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/roadmap
git commit -m "Отдавать сводку релизов вместе с роадмапом"
```

### Task 4.4: Постановка и снятие выпуска

**Files:**
- Modify: `apps/api/src/roadmap/roadmap.repository.ts`
- Modify: `apps/api/src/roadmap/roadmap.repository.test.ts`

- [ ] **Step 1: Падающие тесты**

```ts
it('ставит выпуск и переставляет его той же ручкой', async () => {
  // Выпуск — не отдельная вещь со своим адресом, а значение в клетке
  // «версия × платформа»: повторный вызов меняет её, а не плодит вторую.
  const versionId = await createVersion('v1.0');
  const apiId = await createPlatform('API');

  await testDb.db.transaction((tx) =>
    repository.setRelease(admin(), tx, projectId, versionId, apiId, {
      state: PlatformReleaseState.OnTest,
    }),
  );
  await testDb.db.transaction((tx) =>
    repository.setRelease(admin(), tx, projectId, versionId, apiId, {
      state: PlatformReleaseState.Released,
      releasedDate: '2026-03-12',
    }),
  );

  const releases = await testDb.rowsOf(versionPlatformReleases);

  expect(releases).toHaveLength(1);
  expect(releases[0]?.state).toBe(PlatformReleaseState.Released);
  expect(releases[0]?.releasedDate).toBe('2026-03-12');
});

it('не присланные поля обнуляет, а не оставляет прежними', async () => {
  // Иначе переход «выпущена 12.03 → на тесте» сохранил бы дату релиза,
  // и PUT перестал бы быть заменой значения в клетке.
  const versionId = await createVersion('v1.0');
  const apiId = await createPlatform('API');

  await testDb.db.transaction((tx) =>
    repository.setRelease(admin(), tx, projectId, versionId, apiId, {
      state: PlatformReleaseState.Released,
      releasedDate: '2026-03-12',
      buildLabel: '1.0 (7)',
    }),
  );
  await testDb.db.transaction((tx) =>
    repository.setRelease(admin(), tx, projectId, versionId, apiId, {
      state: PlatformReleaseState.OnTest,
    }),
  );

  const [release] = await testDb.rowsOf(versionPlatformReleases);

  expect(release?.releasedDate).toBeNull();
  expect(release?.buildLabel).toBeNull();
});

it('не ставит модерацию серверной платформе', async () => {
  const versionId = await createVersion('v1.0');
  const apiId = await createPlatform('API');

  await expect(
    testDb.db.transaction((tx) =>
      repository.setRelease(admin(), tx, projectId, versionId, apiId, {
        state: PlatformReleaseState.InReview,
      }),
    ),
  ).rejects.toBeInstanceOf(ConflictException);
});

it('не видит платформу чужого проекта', async () => {
  const versionId = await createVersion('v1.0');
  const foreign = await createPlatform('API', PlatformKind.Server, otherProjectId);

  await expect(
    testDb.db.transaction((tx) =>
      repository.setRelease(admin(), tx, projectId, versionId, foreign, {
        state: PlatformReleaseState.OnTest,
      }),
    ),
  ).rejects.toBeInstanceOf(SectionNotVisibleError);
});

it('возвращает имя платформы и обозначение версии для журнала', async () => {
  // Служба их не достаёт сама: вызов репозитория платформ потребовал бы
  // доступа к «Инфо», которого у подрядчика с записью в роадмап нет.
  const versionId = await createVersion('v1.0');
  const apiId = await createPlatform('API');

  const set = await testDb.db.transaction((tx) =>
    repository.setRelease(admin(), tx, projectId, versionId, apiId, {
      state: PlatformReleaseState.OnTest,
    }),
  );

  expect(set).toMatchObject({ platformName: 'API', versionLabel: 'v1.0' });
});

it('снятие возвращает платформу «как у версии» и не считает отсутствие ошибкой', async () => {
  const versionId = await createVersion('v1.0');
  const apiId = await createPlatform('API');

  await testDb.db.transaction((tx) =>
    repository.setRelease(admin(), tx, projectId, versionId, apiId, {
      state: PlatformReleaseState.OnTest,
    }),
  );
  await testDb.db.transaction((tx) =>
    repository.clearRelease(admin(), tx, projectId, versionId, apiId),
  );

  expect(await testDb.rowsOf(versionPlatformReleases)).toHaveLength(0);

  // Ручка идемпотентна: «как у версии» и до, и после вызова.
  const repeated = await testDb.db.transaction((tx) =>
    repository.clearRelease(admin(), tx, projectId, versionId, apiId),
  );

  expect(repeated).toMatchObject({ platformName: 'API', versionLabel: 'v1.0' });
  expect(await testDb.rowsOf(versionPlatformReleases)).toHaveLength(0);
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/api && npx vitest run src/roadmap/roadmap.repository.test.ts`
Expected: FAIL — методов нет.

- [ ] **Step 3: Реализация**

```ts
  /**
   * Ставит выпуск платформы в версии.
   *
   * Строка одна на пару «версия × платформа»: повторный вызов меняет её.
   * Допустимость состояния определяется видом платформы —
   * `releaseStatesFor` из контракта, тот же список, по которому интерфейс
   * рисует выбор.
   *
   * Возвращает строку вместе с именем платформы и обозначением версии:
   * они нужны журналу, а достать их отдельным запросом служба не может —
   * репозиторий платформ требует доступа к «Инфо».
   */
  async setRelease(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    versionId: string,
    platformId: string,
    input: PlatformReleaseSet,
  ): Promise<PlatformReleaseRow & { platformName: string; versionLabel: string }>
```

Порядок внутри: `requireLevel(Роадмап, Write, tx)` → `requireVersion(tx, projectId, versionId)` → платформа того же проекта (иначе `SectionNotVisibleError`) → проверка состояния по виду через `releaseStatesFor` (иначе `ConflictException` с текстом вида «Модерации у платформы «API» не бывает: она живёт на нашей машине») → `insert … onConflictDoUpdate` по паре.

Присланные поля нормализуются **явно**, по образцу `url: input.url ?? null` в `createCheckpoint`:

```ts
    const values = {
      versionId,
      platformId,
      state: input.state,
      // `?? null`, а не `input.releasedDate`: Drizzle пропускает
      // `undefined`, и прежняя дата осталась бы в клетке после смены
      // состояния.
      releasedDate: input.releasedDate ?? null,
      buildLabel: input.buildLabel ?? null,
    };
```

В ветке `onConflictDoUpdate` к этому добавляется `updatedAt: new Date()` — как у остальных методов репозитория при правке.

Текст отказа по виду платформы формулируется общо: «Модерации у платформы «API» не бывает» без продолжения про нашу машину — правило отвергает и вид «иное» (пакет в реестре), у которого машины тоже нет.

`clearRelease` — те же проверки и `delete`. Подпись задана явно, потому что от неё зависит тест идемпотентности:

```ts
  async clearRelease(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    versionId: string,
    platformId: string,
  ): Promise<{ platformName: string; versionLabel: string }>
```

Имена берутся из платформы и версии, а не из удаляемой строки, поэтому возвращаются и при повторном вызове. `delete(...).returning()` здесь не годится: на втором вызове он отдал бы пустоту, и тест упал бы не по делу. Отсутствие строки ошибкой не считается.

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/roadmap`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/roadmap
git commit -m "Ставить и снимать выпуск платформы"
```

### Task 4.5: Теги чекпоинтов и уборка при удалении

**Files:**
- Modify: `apps/api/src/roadmap/roadmap.repository.ts`
- Modify: `apps/api/src/roadmap/roadmap.repository.test.ts`

- [ ] **Step 1: Падающие тесты**

```ts
it('ставит теги при создании и заменяет при правке', async () => {
  const versionId = await createVersion('v1.0');
  const iosId = await createPlatform('App Store', PlatformKind.Store);
  const androidId = await createPlatform('Google Play', PlatformKind.Store);
  await grant(AccessLevel.Read);

  const created = await testDb.db.transaction((tx) =>
    repository.createCheckpoint(admin(), tx, projectId, versionId, {
      title: 'Вход по телефону',
      platformIds: [iosId, androidId],
    }),
  );

  await testDb.db.transaction((tx) =>
    repository.updateCheckpoint(admin(), tx, projectId, versionId, created.id, {
      platformIds: [iosId],
    }),
  );

  const roadmap = await repository.findForProject(member(), projectId);

  expect((roadmap.versions[0] as RoadmapVersionDetail).checkpoints[0]?.platformIds).toEqual([
    iosId,
  ]);
});

it('пустой набор тегов снимает все', async () => {
  // … чекпоинт с тегом
  await testDb.db.transaction((tx) =>
    repository.updateCheckpoint(admin(), tx, projectId, versionId, checkpointId, {
      platformIds: [],
    }),
  );

  expect(await testDb.rowsOf(checkpointPlatforms)).toHaveLength(0);
});

it('правка без тегов их не трогает', async () => {
  // Ровно так переключается галочка «закрыт»: буквальная замена набора
  // снесла бы теги при каждом щелчке.
  // … чекпоинт с тегом
  await testDb.db.transaction((tx) =>
    repository.updateCheckpoint(admin(), tx, projectId, versionId, checkpointId, { isDone: true }),
  );

  expect(await testDb.rowsOf(checkpointPlatforms)).toHaveLength(1);
});

it('не ставит тег платформы чужого проекта', async () => {
  const foreign = await createPlatform('API', PlatformKind.Server, otherProjectId);

  await expect(
    testDb.db.transaction((tx) =>
      repository.createCheckpoint(admin(), tx, projectId, versionId, {
        title: 'Оплата',
        platformIds: [foreign],
      }),
    ),
  ).rejects.toBeInstanceOf(SectionNotVisibleError);
});

it('удаление версии уносит выпуски и теги её чекпоинтов', async () => {
  // … версия с чекпоинтом с тегом и выпуском
  await testDb.db.transaction((tx) => repository.removeVersion(admin(), tx, projectId, versionId));

  expect(await testDb.rowsOf(versionPlatformReleases)).toHaveLength(0);
  expect(await testDb.rowsOf(checkpointPlatforms)).toHaveLength(0);
});

it('удаление чекпоинта уносит его теги', async () => {
  await testDb.db.transaction((tx) =>
    repository.removeCheckpoint(admin(), tx, projectId, versionId, checkpointId),
  );

  expect(await testDb.rowsOf(checkpointPlatforms)).toHaveLength(0);
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/api && npx vitest run src/roadmap/roadmap.repository.test.ts`
Expected: FAIL. Первый тест — теги не записываются; тесты удаления — падение на ссылочной целостности; правка с `platformIds` может упасть на вставке несуществующей колонки.

- [ ] **Step 3: Реализация**

- `createCheckpoint` и `updateCheckpoint`: отделить `platformIds` от полей
  чекпоинта (в `values()`/`set()` они попасть не должны). **`undefined`
  и пустой массив различаются**: поля нет — набор не трогать, пустой —
  снять все. Присланный набор заменяется целиком: `delete` по чекпоинту,
  затем `insert`. Платформы обязаны принадлежать тому же проекту, иначе
  `SectionNotVisibleError`;
- `removeVersion`: порядок обратен ссылкам — сначала теги чекпоинтов этой
  версии, затем выпуски версии, затем чекпоинты, затем версия;
- `removeCheckpoint`: сначала теги, затем чекпоинт.

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/roadmap`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/roadmap
git commit -m "Помечать чекпоинты платформами и убирать за удалением"
```

### Task 4.6: Ответы чекпоинта несут теги

**Files:**
- Modify: `apps/api/src/roadmap/roadmap.repository.ts`
- Modify: `apps/api/src/roadmap/roadmap.controller.ts`
- Modify: `apps/api/src/roadmap/roadmap.repository.test.ts`

Контроллер собирает ответы `POST` и `PATCH` чекпоинта **литералом** под аннотацией `Promise<RoadmapCheckpoint>`. С обязательным `platformIds` из Chunk 1 оба `return` перестают проходить типы, а теги в ответ не попадают — при том что веб (Task 6.6) на них опирается. Без этой задачи `pnpm typecheck` не позеленеет ни в одном чанке.

- [ ] **Step 1: Падающий тест**

```ts
it('возвращает теги вместе с созданным и правленым чекпоинтом', async () => {
  const versionId = await createVersion('v1.0');
  const iosId = await createPlatform('App Store', PlatformKind.Store);

  const created = await testDb.db.transaction((tx) =>
    repository.createCheckpoint(admin(), tx, projectId, versionId, {
      title: 'Вход по телефону',
      platformIds: [iosId],
    }),
  );

  expect(created.platformIds).toEqual([iosId]);

  const updated = await testDb.db.transaction((tx) =>
    repository.updateCheckpoint(admin(), tx, projectId, versionId, created.id, {
      platformIds: [],
    }),
  );

  expect(updated.platformIds).toEqual([]);
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `cd apps/api && npx vitest run src/roadmap/roadmap.repository.test.ts`
Expected: FAIL — в возвращённой строке `platformIds` нет: Task 4.5 как раз отделяет это поле от колонок чекпоинта.

- [ ] **Step 3: Реализация**

`createCheckpoint` и `updateCheckpoint` возвращают строку, дополненную тегами: `Promise<RoadmapCheckpointRow & { platformIds: string[] }>`. Набор берётся из того, что только что записано (присланный набор), а при его отсутствии в правке — выборкой по чекпоинту: ответ обязан описывать состояние после операции, а не присланное тело.

Контроллер дописывает `platformIds: created.platformIds` в оба литерала ответа. Тела остаются явными: разворот строки унёс бы наружу `versionId` и отметки времени.

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/roadmap`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/roadmap
git commit -m "Возвращать теги вместе с чекпоинтом"
```

### Task 4.7: Ручка выпуска, журнал и описание инструмента

**Files:**
- Modify: `apps/api/src/roadmap/roadmap.service.ts`
- Modify: `apps/api/src/roadmap/roadmap.service.test.ts`
- Modify: `apps/api/src/roadmap/roadmap.controller.ts`
- Modify: `apps/api/src/agents/mcp-tools.ts`
- Modify: `apps/web/src/components/AuditTable/constants.ts`

- [ ] **Step 1: Падающий тест**

В стиле файла — настоящий `AuditService` и хелпер `entriesOf`, без `vi.fn()`:

```ts
it('пишет постановку выпуска в журнал', async () => {
  const versionId = /* создать версию службой */;
  // Вид обязательно `Store`: у серверной платформы модерации не бывает,
  // и тест упал бы на отказе вместо проверки журнала.
  const platformId = /* завести платформу вставкой, kind: PlatformKind.Store, name: 'App Store' */;

  await service.setRelease(admin(), projectId, versionId, platformId, {
    state: PlatformReleaseState.InReview,
  });

  const [entry] = await entriesOf(AuditAction.PlatformReleaseSet);

  expect(entry?.metadata).toMatchObject({
    state: PlatformReleaseState.InReview,
    platform: 'App Store',
    label: 'v1.0',
  });
});

it('пишет снятие выпуска', async () => {
  // … после setRelease
  await service.clearRelease(admin(), projectId, versionId, platformId);

  expect(await entriesOf(AuditAction.PlatformReleaseCleared)).toHaveLength(1);
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `cd apps/api && npx vitest run src/roadmap/roadmap.service.test.ts`
Expected: FAIL — методов службы нет.

- [ ] **Step 3: Реализация**

В службу — `setRelease` и `clearRelease` по образцу остальных: транзакция, репозиторий, журнал (`PlatformReleaseSet` / `PlatformReleaseCleared`, `entityType: 'platform_release'`, в метаданных обозначение версии, имя платформы и состояние — всё из того, что вернул репозиторий). `entityId` — идентификатор строки выпуска у постановки; у снятия строки уже нет, и поле не заполняется.

В контроллер — две ручки; `Put` нужно **добавить в импорт** из `@nestjs/common` (сейчас там только `Post`, `Patch`, `Delete`):

```ts
  /**
   * Ставит выпуск платформы в версии.
   *
   * `PUT`, а не пара `POST`/`PATCH`: выпуск — не отдельная вещь со своим
   * адресом, а значение в клетке «версия × платформа». Повторный вызов
   * с тем же телом ничего не меняет.
   */
  @Put('versions/:versionId/releases/:platformId')
  async setRelease(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Param('platformId', ParseUUIDPipe) platformId: string,
    @Body(new ZodValidationPipe(platformReleaseSetSchema)) body: PlatformReleaseSet,
  ): Promise<PlatformRelease> {}

  /** Снимает выпуск: платформа снова идёт «как у версии». */
  @Delete('versions/:versionId/releases/:platformId')
  @HttpCode(204)
  async clearRelease(/* те же параметры без тела */): Promise<void> {}
```

Ответ **выписывается полем за полем**, как это уже делают ручки чекпоинта:

```ts
    return {
      platformId: set.platformId,
      state: set.state,
      releasedDate: set.releasedDate,
      buildLabel: set.buildLabel,
    };
```

`return set` с объявленным типом `Promise<PlatformRelease>` компилятор пропустил бы — проверка лишних свойств работает только на свежих литералах, — и наружу уехали бы `platformName`, `versionLabel`, идентификаторы и отметки времени. Теста контроллеров в проекте нет, так что единственная защита здесь — явное тело.

В импорт из `@cairn/shared` добавить `platformReleaseSetSchema`, `PlatformReleaseSet` и `PlatformRelease`.

В `mcp-tools.ts` описание инструмента `get_roadmap` дополнить выпусками: «Роадмап: версии, чекпоинты, выпуски по платформам и текущая стадия». Модель выбирает инструмент по описанию, а ответ уже содержит сводку — `findForProject` возвращает её сам.

В `AuditTable/constants.ts` добавить подписи пяти новых действий — иначе строка журнала покажется сырым `platform.created`.

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src && cd ../web && npx vitest run src/components/AuditTable`
Expected: PASS. Веб-набор прогоняется потому, что в этой же задаче правятся подписи действий в `AuditTable/constants.ts`. `pnpm typecheck` из корня ещё красный в вебе — это Chunk 5 и 6.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src apps/web/src/components/AuditTable/constants.ts
git commit -m "Открыть ручку выпуска и писать её в журнал"
```

---

## Chunk 5: Веб — панели и платформы проекта

### Task 5.1: Третья ширина панели

**Files:**
- Modify: `apps/web/src/components/Drawer/types.ts`
- Modify: `apps/web/src/components/Drawer/constants.ts`
- Modify: `apps/web/src/components/Drawer/Drawer.test.tsx`

- [ ] **Step 1: Падающий тест**

В стиле файла — `toHaveClass`, как в остальных пяти тестах:

```ts
it('половинная ширина не сжимает панель ни на телефоне, ни на планшете', () => {
  // На телефоне ограничения быть не должно вовсе, а 50vw на планшете —
  // это 384px, уже нынешних 480px: «половина экрана» обернулась бы
  // сужением.
  render(
    <Drawer isOpen onClose={() => {}} title="Новый проект" width={DrawerWidth.Half}>
      поле
    </Drawer>,
  );

  const dialog = screen.getByRole('dialog');

  expect(dialog).toHaveClass('md:max-w-[max(480px,50vw)]');
  expect(dialog.className).not.toMatch(/(^|\s)max-w-/);
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `cd apps/web && npx vitest run src/components/Drawer`
Expected: FAIL — `DrawerWidth.Half` не определён.

- [ ] **Step 3: Реализация**

В `types.ts`:

```ts
  /** Форма на половину экрана: паспорт проекта, окружение. */
  Half = 'half',
```

В `constants.ts`:

```ts
  // Ограничение только с `md`, и не меньше узкой панели: на телефоне
  // половина экрана — это половина телефона, а на планшете 50vw меньше
  // нынешних 480px.
  [DrawerWidth.Half]: 'md:max-w-[max(480px,50vw)]',
```

- [ ] **Step 4: Запустить**

Run: `cd apps/web && npx vitest run src/components/Drawer`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/Drawer
git commit -m "Дать панели ширину в половину экрана"
```

### Task 5.2: Хуки платформ

**Files:**
- Create: `apps/web/src/api/hooks/usePlatforms.ts`
- Create: `apps/web/src/api/hooks/usePlatforms.test.tsx`
- Modify: `apps/web/src/api/hooks/index.ts`

- [ ] **Step 1: Падающий тест**

Обвязка — ровно как в `useMutationServer.test.tsx` (см. «Обвязка тестов» в преамбуле): модульный `let client`, присваиваемый внутри `wrapper`, шпион навешивается **после** `renderHook`. Другие образцы наблюдать инвалидацию не умеют: они создают клиент внутри `wrapper`, и внешний шпион его не видит.

```ts
it('после заведения платформы сбрасывает и список, и роадмап', async () => {
  // Сводка релизов живёт в ответе роадмапа: без её сброса новая
  // платформа не появилась бы в сводке до перезагрузки страницы.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'p1' }) }),
  );

  const { result } = renderHook(() => useMutationCreatePlatform('project-1'), { wrapper });
  const invalidate = vi.spyOn(client, 'invalidateQueries');

  result.current.mutate({ kind: PlatformKind.Server, name: 'API' });

  await waitFor(() => expect(invalidate).toHaveBeenCalled());

  const keys = invalidate.mock.calls.map((call) => String(call[0]?.queryKey?.[0]));

  expect(keys).toContain('platforms');
  expect(keys).toContain('roadmap');
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `cd apps/web && npx vitest run src/api/hooks/usePlatforms.test.tsx`
Expected: FAIL — модуль `./usePlatforms` не найден.

- [ ] **Step 3: Реализация**

`usePlatforms.ts`: ключи `PLATFORM_KEYS.forProject(projectId)`, запрос

```ts
export function useQueryPlatforms(
  projectId: string,
  { enabled = true, initialData }: { enabled?: boolean; initialData?: Platform[] } = {},
) { … }
```

Признак `enabled` нужен там, где доступа к «Инфо» может не быть (экран инфраструктуры), `initialData` — чтобы страница проекта, уже получившая платформы на сервере, не тянула их второй раз: `staleTime` в провайдере 30 секунд, и подставленные данные считаются свежими. Плюс мутации `useMutationCreatePlatform`, `useMutationUpdatePlatform`, `useMutationDeletePlatform`. Общая функция инвалидации сбрасывает **оба** ключа — платформ и роадмапа:

```ts
/**
 * Сброс после правки платформ.
 *
 * Сбрасывается и роадмап: в его ответе живёт сводка релизов, и без этого
 * новая платформа не появилась бы в сводке до перезагрузки страницы.
 */
function usePlatformInvalidation(projectId: string) { … }
```

В `index.ts` добавить `export * from './usePlatforms';` между `useMutationVariable` и `usePublicLink`.

- [ ] **Step 4: Запустить**

Run: `cd apps/web && npx vitest run src/api/hooks`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/api/hooks
git commit -m "Завести хуки платформ"
```

### Task 5.3: Хуки выпуска

**Files:**
- Create: `apps/web/src/api/hooks/useMutationRelease.ts`
- Create: `apps/web/src/api/hooks/useMutationRelease.test.tsx`
- Modify: `apps/web/src/api/hooks/index.ts`

- [ ] **Step 1: Падающие тесты**

Та же обвязка, что в Task 5.2: модульный `let client` внутри `wrapper`, заглушка `fetch` объектом.

```ts
it('ставит выпуск методом PUT и сбрасывает роадмап', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);

  const { result } = renderHook(() => useMutationSetRelease('project-1'), { wrapper });

  result.current.mutate({
    versionId: 'v1',
    platformId: 'p1',
    input: { state: PlatformReleaseState.OnTest },
  });

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());

  const [url, init] = fetchMock.mock.calls[0]!;

  expect(url).toContain('/projects/project-1/roadmap/versions/v1/releases/p1');
  expect(init).toMatchObject({ method: 'PUT' });
});

it('снимает выпуск методом DELETE', async () => { /* то же с useMutationClearRelease */ });
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/web && npx vitest run src/api/hooks/useMutationRelease.test.tsx`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализация**

`useMutationSetRelease(projectId)` и `useMutationClearRelease(projectId)`; параметры мутации — `{ versionId, platformId, input }` и `{ versionId, platformId }`. Оба сбрасывают ключ роадмапа (`ROADMAP_KEYS.forProject`). В `index.ts` — между `useMutationIntakeAddress` и `useMutationRoadmap`.

- [ ] **Step 4: Запустить**

Run: `cd apps/web && npx vitest run src/api/hooks`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/api/hooks
git commit -m "Завести хуки выпуска платформы"
```

### Task 5.4: Чипы платформ и поле платформ

**Files:**
- Create: `apps/web/src/components/PlatformChips/{PlatformChips.tsx,types.ts,constants.ts,index.ts,PlatformChips.test.tsx}`
- Create: `apps/web/src/components/PlatformsField/{PlatformsField.tsx,PlatformSuggestions.tsx,CustomPlatformForm.tsx,types.ts,constants.ts,index.ts,PlatformsField.test.tsx}`

Два разных компонента, а не один с флагом: чипы «только на чтение» показывают паспорт проекта (серверный компонент), карточка окружения и строка чекпоинта, а чипы с крестиком живут лишь в форме. Подкомпоненты покрываются тестом родителя — как `DomainOptions` и `SelectedDomains` через `DomainsField.test.tsx`. Их `IProps` объявляются **локально в их `.tsx`**, а не в общем `types.ts`: иначе в файле оказалось бы два `export interface IProps`, и он бы не собрался.

- [ ] **Step 1: Падающие тесты**

```ts
const API = { id: 'p1', kind: PlatformKind.Server, name: 'API', position: 1 };
const STORE = { id: 'p2', kind: PlatformKind.Store, name: 'App Store', position: 2 };

describe('PlatformChips', () => {
  it('показывает имена платформ и ничего не предлагает убрать', () => {
    render(<PlatformChips platforms={[API, STORE]} />);

    expect(screen.getByText('API')).toBeInTheDocument();
    expect(screen.getByText('App Store')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('без платформ не рисует ничего', () => {
    const { container } = render(<PlatformChips platforms={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('PlatformsField', () => {
  it('подсказка превращается в платформу', async () => {
    const onAdd = vi.fn();

    render(<PlatformsField platforms={[]} onAdd={onAdd} onRemove={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: '+ API' }));

    expect(onAdd).toHaveBeenCalledWith({ kind: PlatformKind.Server, name: 'API' });
  });

  it('не предлагает уже заведённое', () => {
    render(
      <PlatformsField
        platforms={[{ kind: PlatformKind.Server, name: 'API' }]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: '+ API' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Веб' })).toBeInTheDocument();
  });

  it('заводит свою платформу с выбранным видом', async () => {
    const onAdd = vi.fn();

    render(<PlatformsField platforms={[]} onAdd={onAdd} onRemove={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Своя платформа'), 'Galaxy Store');
    await userEvent.selectOptions(screen.getByLabelText('Вид'), PlatformKind.Store);
    await userEvent.click(screen.getByRole('button', { name: 'Добавить платформу' }));

    expect(onAdd).toHaveBeenCalledWith({ kind: PlatformKind.Store, name: 'Galaxy Store' });
  });

  it('снимает платформу целиком, а не по имени', async () => {
    // В режиме правки нужен идентификатор для мутации, и искать его
    // повторно по имени значило бы заводить второй способ сослаться
    // на строку.
    const onRemove = vi.fn();
    const platform = { id: 'p2', kind: PlatformKind.Store, name: 'RuStore' };

    render(<PlatformsField platforms={[platform]} onAdd={vi.fn()} onRemove={onRemove} />);

    await userEvent.click(screen.getByRole('button', { name: 'Убрать RuStore' }));

    expect(onRemove).toHaveBeenCalledWith(platform);
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/web && npx vitest run src/components/PlatformChips src/components/PlatformsField`
Expected: FAIL — компонентов нет.

- [ ] **Step 3: Реализация**

`PlatformsField/constants.ts` держит и подписи видов — их потребители здесь (выбор вида) и дальше `ReleaseSummary`; сами чипы вид не показывают и в подписях не нуждаются:

```ts
/** Подписи видов платформы. */
export const PLATFORM_KIND_LABELS: Record<PlatformKind, string> = {
  [PlatformKind.Server]: 'На наших машинах',
  [PlatformKind.Store]: 'Магазин',
  [PlatformKind.Other]: 'Другое',
};
```

`PlatformChips` — маленький презентационный компонент: список имён чипами, пустой список → `null`. Без `'use client'`: его рендерит серверный паспорт проекта.

Тип пропа — **минимальная форма**, иначе Chunk 6 упрётся в несовместимость: паспорт передаёт `Platform[]` (с `position`), карточка окружения — `PlatformRef[]` (без), строка чекпоинта сопоставляет идентификаторы со списком проекта.

```ts
/** Пропсы чипов платформ. */
export interface IProps {
  /** Минимальная форма: всё, что нужно чипу, — имя и ключ списка. */
  platforms: { id: string; name: string }[];
}
```

`CustomPlatformForm` — несмотря на имя, **не** `<form>`: поле платформ живёт слотом внутри формы проекта, и вложенный `<form>` недопустим. Контейнер — `fieldset` или `div`, добавление — по кнопке `type="button"`. Enter в поле имени отправит внешнюю форму (та же особенность есть у `DomainsField` внутри формы окружения), поэтому кнопка «Добавить платформу» обязана быть видимой и близкой.

`PlatformsField/constants.ts`:

```ts
/**
 * Пресеты платформ: подсказки, а не каталог.
 *
 * Полупрозрачные чипы предлагают частое, но вид и имя остаются свободными:
 * магазинов больше, чем влезет в список, и новый появится без правки кода.
 */
export const PLATFORM_PRESETS: PlatformCreate[] = [
  { kind: PlatformKind.Server, name: 'API' },
  { kind: PlatformKind.Server, name: 'Веб' },
  { kind: PlatformKind.Store, name: 'App Store' },
  { kind: PlatformKind.Store, name: 'Google Play' },
  { kind: PlatformKind.Store, name: 'RuStore' },
];
```

`PlatformsField/types.ts`:

```ts
/** Платформа в поле: с идентификатором при правке, без — при создании. */
export type FieldPlatform = PlatformCreate & { id?: string };

/** Пропсы поля платформ. */
export interface IProps {
  platforms: FieldPlatform[];
  onAdd: (input: PlatformCreate) => void;
  /** Снятие платформы целиком: в режиме правки нужен её идентификатор. */
  onRemove: (platform: FieldPlatform) => void;
}
```

Что делают колбэки, решает родитель: панель создания меняет своё состояние, панель правки вызывает мутации сразу — как галочки чекпоинтов, которые тоже действуют без кнопки «сохранить».

Поля «Своя платформа» и «Вид» получают `id` и `htmlFor`: тесты ищут их по подписи. Крестик чипа — `aria-label` вида «Убрать RuStore».

- [ ] **Step 4: Запустить**

Run: `cd apps/web && npx vitest run src/components/PlatformChips src/components/PlatformsField`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/PlatformChips apps/web/src/components/PlatformsField
git commit -m "Собирать платформы чипами с подсказками"
```

### Task 5.5: Создание проекта в панели

**Files:**
- Create: `apps/web/src/app/(app)/CreateProjectPanel.tsx`
- Create: `apps/web/src/app/(app)/CreateProjectPanel.test.tsx`
- Modify: `apps/web/src/components/ProjectForm/{ProjectForm.tsx,types.ts,ProjectForm.test.tsx}`
- Create: `apps/web/src/components/ProjectForm/ProjectFields.tsx`
- Modify: `apps/web/src/components/ProjectList/{ProjectList.tsx,types.ts,ProjectList.test.tsx}`
- Modify: `apps/web/src/app/(app)/page.tsx`
- Delete: `apps/web/src/app/(app)/projects/new/`

- [ ] **Step 1: Падающие тесты**

В `ProjectForm.test.tsx` (фикстура в файле называется `project`):

```ts
it('показывает слот платформ, когда он передан', () => {
  // Слот, а не второй режим формы: форма держит значения в useState и
  // с пропом не ресинхронизируется, поэтому живость чипов решает
  // родитель.
  render(<ProjectForm initial={project} onSubmit={vi.fn()} platformsSlot={<p>чипы</p>} />);

  expect(screen.getByText('чипы')).toBeInTheDocument();
});

it('без слота о платформах не знает', () => {
  render(<ProjectForm initial={project} onSubmit={vi.fn()} />);

  expect(screen.queryByText(/платформ/i)).not.toBeInTheDocument();
});
```

В `ProjectList.test.tsx` **переписать** три существующих теста: `canCreate` и ссылка на `/projects/new` исчезают, вместо них слот.

```ts
it('показывает орган создания, когда он передан', () => {
  render(<ProjectList projects={[project]} createSlot={<button type="button">Создать проект</button>} />);

  expect(screen.getByRole('button', { name: 'Создать проект' })).toBeInTheDocument();
});

it('без слота создание не предлагает', () => {
  render(<ProjectList projects={[project]} />);

  expect(screen.queryByRole('button', { name: 'Создать проект' })).not.toBeInTheDocument();
});

it('в пустой системе зовёт завести первый проект, когда слот есть', () => {
  render(<ProjectList projects={[]} createSlot={<button type="button">Создать проект</button>} />);

  expect(screen.getByRole('button', { name: 'Создать проект' })).toBeInTheDocument();
  expect(screen.queryByText(/доступ к проектам выдаёт/i)).not.toBeInTheDocument();
});
```

`CreateProjectPanel.test.tsx` — экранный стиль (`vi.mock('@/api/hooks')`) плюс **локальный** мок роутера: глобальный в `vitest.setup.ts` падать не даёт, но и наблюдать `push` через него нельзя.

`beforeEach` обязателен: автомок возвращает `undefined`, и компонент упадёт на `isPending` **до** рендера кнопки. Хелперы `query(data)` и `mutation()` — локальные, как в `RoadmapScreen.test.tsx`:

```ts
beforeEach(() => {
  vi.mocked(hooks.useMutationCreateProject).mockReturnValue(mutation());
});
```

```ts
const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock('@/api/hooks');

it('открывает панель создания и закрывает по Esc', async () => {
  render(<CreateProjectPanel />);

  await userEvent.click(screen.getByRole('button', { name: 'Создать проект' }));

  expect(screen.getByRole('dialog', { name: 'Новый проект' })).toBeInTheDocument();

  await userEvent.keyboard('{Escape}');

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('отправляет платформы вместе с новым проектом и уходит на его карточку', async () => {
  const mutate = vi.fn((_input, options) => options?.onSuccess?.({ id: 'new-id' }));
  vi.mocked(hooks.useMutationCreateProject).mockReturnValue({ mutate, isPending: false, error: null } as never);

  render(<CreateProjectPanel />);

  await userEvent.click(screen.getByRole('button', { name: 'Создать проект' }));
  await userEvent.type(screen.getByLabelText('Название'), 'Касса');
  await userEvent.click(screen.getByRole('button', { name: '+ API' }));
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

  expect(mutate.mock.calls[0]?.[0]).toMatchObject({
    name: 'Касса',
    platforms: [{ kind: PlatformKind.Server, name: 'API' }],
  });
  expect(push).toHaveBeenCalledWith('/projects/new-id');
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/web && npx vitest run src/components/ProjectForm src/components/ProjectList "src/app/(app)/CreateProjectPanel.test.tsx"`
Expected: FAIL — пропа `platformsSlot` нет, `createSlot` нет, компонента панели нет.

- [ ] **Step 3: Реализация**

`ProjectForm`: новый необязательный проп `platformsSlot?: ReactNode`, рендерится после полей паспорта. Сами платформы форма **не хранит и не отправляет** — их добавляет к данным родитель.

Пять `TextField` и `LifecycleField` выносятся в подкомпонент `ProjectFields.tsx`: файл сейчас 94 строки, и со слотом перевалил бы за сотню. Подкомпонент принимает `values` и обработчик правки, и обработчик обязан остаться дженериком:

```ts
interface IProps {
  values: ProjectFormValues;
  onChange: <K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) => void;
}
```

Сведение к `(key: string, value: unknown)` потеряло бы типизацию полей, а `any` запрещён.

`ProjectList`: вместо `canCreate` и внутреннего `CreateLink` — проп

```ts
  /**
   * Орган создания проекта. Слот, а не флаг: кнопка открывает панель,
   * и список из-за этого не обязан становиться клиентским.
   */
  createSlot?: ReactNode;
```

Пустой список показывает слот, если он есть, и прежнюю подсказку о доступах, если нет.

`CreateProjectPanel` — клиентский островок: кнопка «Создать проект», `Drawer` шириной `Half` с заголовком «Новый проект», внутри `ProjectForm` со слотом `PlatformsField`, платформы — в состоянии панели. На отправке платформы добавляются к данным формы, мутация — `useMutationCreateProject`, после успеха `router.push('/projects/<id>')` и `router.refresh()`.

`page.tsx` передаёт `createSlot={subject.isSuperadmin ? <CreateProjectPanel /> : undefined}`.

Каталог `projects/new` удалить целиком.

- [ ] **Step 4: Запустить**

Run: `cd apps/web && npx vitest run src/components/ProjectForm src/components/ProjectList "src/app/(app)"`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add -A apps/web/src
git commit -m "Создавать проект в выезжающей панели"
```

### Task 5.6: Правка проекта в панели

**Files:**
- Create: `apps/web/src/app/(app)/projects/[id]/EditProjectPanel.tsx`
- Create: `apps/web/src/app/(app)/projects/[id]/EditProjectPanel.test.tsx`
- Modify: `apps/web/src/app/(app)/projects/[id]/page.tsx`
- Modify: `apps/web/src/components/ProjectSections/{ProjectSections.tsx,types.ts,ProjectSections.test.tsx}`
- Delete: `apps/web/src/app/(app)/projects/[id]/edit/`

- [ ] **Step 1: Падающие тесты**

```ts
const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock('@/api/hooks');

it('сохраняет паспорт и закрывает панель', async () => {
  const mutate = vi.fn((_input, options) => options?.onSuccess?.());
  vi.mocked(hooks.useMutationUpdateProject).mockReturnValue({ mutate, isPending: false, error: null } as never);

  render(<EditProjectPanel projectId="p1" initial={INITIAL} canWrite />);

  await userEvent.click(screen.getByRole('button', { name: 'Править' }));
  await userEvent.clear(screen.getByLabelText('Название'));
  await userEvent.type(screen.getByLabelText('Название'), 'Касса+');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

  expect(mutate.mock.calls[0]?.[0]).toMatchObject({ name: 'Касса+' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(refresh).toHaveBeenCalled();
});

it('правит платформы сразу, без отправки формы', async () => {
  // Чип действует мутацией, как галочка чекпоинта: отправлять паспорт
  // целиком ради одной платформы незачем, и чужую правку это не затрёт.
  const create = vi.fn();
  vi.mocked(hooks.useMutationCreatePlatform).mockReturnValue({ mutate: create, isPending: false, error: null } as never);

  render(<EditProjectPanel projectId="p1" initial={INITIAL} canWrite />);

  await userEvent.click(screen.getByRole('button', { name: 'Править' }));
  await userEvent.click(screen.getByRole('button', { name: '+ Веб' }));

  expect(create).toHaveBeenCalledWith({ kind: PlatformKind.Server, name: 'Веб' });
});

it('снимает платформу мутацией по её идентификатору', async () => {
  vi.mocked(hooks.useQueryPlatforms).mockReturnValue(query([{ id: 'p9', kind: PlatformKind.Store, name: 'RuStore', position: 1 }]));
  const remove = vi.fn();
  vi.mocked(hooks.useMutationDeletePlatform).mockReturnValue({ mutate: remove, isPending: false, error: null } as never);

  render(<EditProjectPanel projectId="p1" initial={INITIAL} canWrite />);

  await userEvent.click(screen.getByRole('button', { name: 'Править' }));
  await userEvent.click(screen.getByRole('button', { name: 'Убрать RuStore' }));

  expect(remove).toHaveBeenCalledWith('p9');
});

it('не показывает кнопку правки без уровня записи', () => {
  render(<EditProjectPanel projectId="p1" initial={INITIAL} canWrite={false} />);

  expect(screen.queryByRole('button', { name: 'Править' })).not.toBeInTheDocument();
});
```

В `ProjectSections.test.tsx`:

```ts
it('показывает платформы проекта', () => {
  render(
    <ProjectSections
      project={DETAIL}
      platforms={[{ id: 'p1', kind: PlatformKind.Store, name: 'RuStore', position: 1 }]}
    />,
  );

  expect(screen.getByText('RuStore')).toBeInTheDocument();
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/web && npx vitest run "src/app/(app)/projects/[id]/EditProjectPanel.test.tsx" src/components/ProjectSections`
Expected: FAIL — компонента нет, проп `platforms` не принимается.

- [ ] **Step 3: Реализация**

Фикстуры задать в файле: `INITIAL: ProjectFormValues` — все шесть полей (`name: 'Касса'`, остальные `null`, `lifecycle: ProjectLifecycle.Development`).

`beforeEach` в `EditProjectPanel.test.tsx` настраивает **все четыре** хука компонента (`useMutationUpdateProject`, `useQueryPlatforms`, `useMutationCreatePlatform`, `useMutationDeletePlatform`): хуки вызываются до раннего возврата по правам, поэтому даже тест «нет кнопки без уровня записи» без настройки упадёт.

В `ProjectSections.test.tsx` фикстура называется `detailed` (рядом есть `metadataOnly`) — `DETAIL` в файле нет.

`EditProjectPanel` — клиентский островок: `canWrite` **пропом**, а не запросом. Страница и так серверная, и `/projects/:id/sections` ей дешевле третьего клиентского запроса прав на каждой карточке; заодно кнопка не мигает на время загрузки. Тот же приём уже применён на странице роадмапа, которая передаёт вниз `isSuperadmin`.

Внутри: кнопка «Править», `Drawer` шириной `Half`, `ProjectForm` со слотом `PlatformsField`. Платформы приходят из `useQueryPlatforms(projectId)`, а `onAdd` / `onRemove` вызывают мутации платформ — поэтому чипы перерисовываются от кэша, а не от состояния формы. После сохранения паспорта — закрытие панели и `router.refresh()`.

`page.tsx` запрашивает рядом с проектом уровни доступа и платформы:

```ts
  const sections = await apiServer<SectionLevels>(`/projects/${id}/sections`);
  const canWrite = sections[Section.Info] === AccessLevel.Write;

  // Отказ по уровню — не повод валить страницу: паспорт показывается
  // и без платформ. А вот 401 пробрасывается, иначе редирект на вход
  // потеряется и страница отрисуется пустой.
  const platforms = await apiServer<Platform[]>(`/projects/${id}/platforms`).catch(
    (cause): Platform[] => {
      if (cause instanceof ApiError && cause.status === 401) {
        redirect('/login');
      }

      return [];
    },
  );
```

Запрос секций дублирует такой же запрос каркаса — мемоизация `fetch` внутри одного рендера их склеит, так что это не третий поход к API.

Платформы уходят в `ProjectSections` чипами через `PlatformChips`. В `EditProjectPanel` они передаются как `initialData` для `useQueryPlatforms` — но **только если запрос удался**: пустой массив после отказа заставил бы панель тридцать секунд считать, что платформ нет, и не пробовать запросить их самой.

Панель рендерится только при полной проекции: `ProjectFormValues` требует `purpose`, `stack`, `repoUrl` и `notes`, которых у `ProjectMetadata` нет, и без сужения типа шаг не скомпилируется. Сужение — тем же `'purpose' in project`, что уже используется в `ProjectSections`; `notFound()` здесь, в отличие от удаляемой страницы правки, недопустим: паспорт уровня метаданных показывается.

Каталог `projects/[id]/edit` удалить целиком — на него и сейчас не ведёт ни одна ссылка.

- [ ] **Step 4: Запустить**

Run: `cd apps/web && npx vitest run src`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add -A apps/web/src
git commit -m "Править проект в панели с его карточки"
```

---

## Chunk 6: Веб — окружение и роадмап

### Task 6.1: Платформы в форме окружения

**Files:**
- Create: `apps/web/src/components/EnvironmentForm/PlatformsCheckboxes.tsx`
- Modify: `apps/web/src/components/EnvironmentForm/{EnvironmentForm.tsx,types.ts,constants.ts,EnvironmentForm.test.tsx}`

- [ ] **Step 1: Падающие тесты**

Фикстура в файле называется `initial`, и **сначала** в неё добавляется `platformIds: []`: поле становится обязательным в значениях формы, и без этого третий тест упадёт на обращении к `undefined`, а не на отсутствии пропа.

```ts
const API = { id: 'p1', kind: PlatformKind.Server, name: 'API' };
const STORE = { id: 'p2', kind: PlatformKind.Store, name: 'App Store' };

it('предлагает галочками только платформы наших машин', () => {
  render(<EnvironmentForm initial={initial} onSubmit={vi.fn()} platforms={[API, STORE]} />);

  // У магазина нет ни машины, ни адреса: ставить его в окружение нечем.
  expect(screen.getByLabelText('API')).toBeInTheDocument();
  expect(screen.queryByLabelText('App Store')).not.toBeInTheDocument();
});

it('без пропа платформ группы не показывает и набор не отправляет', async () => {
  // «Пропа нет» означает «список недоступен»: пустой набор снял бы
  // привязки, сделанные тем, у кого доступ к «Инфо» есть.
  const onSubmit = vi.fn();

  render(<EnvironmentForm initial={{ ...initial, name: 'Прод' }} onSubmit={onSubmit} />);

  expect(screen.queryByText('Что здесь развёрнуто')).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

  expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty('platformIds');
});

it('отправляет отмеченные платформы', async () => {
  const onSubmit = vi.fn();

  render(<EnvironmentForm initial={initial} onSubmit={onSubmit} platforms={[API]} />);

  await userEvent.type(screen.getByLabelText('Название'), 'Прод');
  await userEvent.click(screen.getByLabelText('API'));
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ platformIds: ['p1'] }));
});

it('сохраняет уже стоящие галочки', async () => {
  // Самое опасное место: правка любого поля окружения не должна снимать
  // привязки платформ.
  const onSubmit = vi.fn();

  render(
    <EnvironmentForm
      initial={{ ...initial, name: 'Прод', platformIds: ['p1'] }}
      onSubmit={onSubmit}
      platforms={[API]}
    />,
  );

  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ platformIds: ['p1'] }));
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/web && npx vitest run src/components/EnvironmentForm`
Expected: FAIL — пропа `platforms` нет, `platformIds` в значениях формы нет.

- [ ] **Step 3: Реализация**

- `PlatformsCheckboxes` — `fieldset` с `legend` «Что здесь развёрнуто»
  (читалке нужна именно группировка); из пришедших платформ оставляет
  только `PlatformKind.Server`; пусто — возвращает `null`. Подпись
  чекбокса — имя платформы;
- `EnvironmentFormValues` получает `platformIds: string[]`, `IProps` —
  необязательный `platforms?: PlatformRef[]`;
- `handleSubmit` отправляет `platformIds` **только когда проп платформ
  передан** (`platforms !== undefined`);
- `EnvironmentForm.tsx` сейчас 117 строк — уже сверх лимита. Поля
  «Проверка», «Заметки» и домены выносятся в подкомпонент
  `EnvironmentFields.tsx`, чтобы форма осталась в сотне строк.

- [ ] **Step 4: Запустить**

Run: `cd apps/web && npx vitest run src/components/EnvironmentForm`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/EnvironmentForm
git commit -m "Отмечать в форме окружения развёрнутые платформы"
```

### Task 6.2: Окружение в панели

**Files:**
- Create: `apps/web/src/app/(app)/projects/[id]/infrastructure/{CreateEnvironmentPanel.tsx,EditEnvironmentPanel.tsx}`
- Create: `apps/web/src/app/(app)/projects/[id]/infrastructure/InfrastructureScreen.test.tsx`
- Modify: `apps/web/src/app/(app)/projects/[id]/infrastructure/InfrastructureScreen.tsx`
- Modify: `apps/web/src/components/EnvironmentCard/{EnvironmentCard.tsx,EnvironmentCard.test.tsx}`

Экран сейчас 142 строки. Уезжает около пятидесяти (мутации, `submit`, блок формы), приезжает около двадцати (запрос платформ, два рендера панелей) — этого мало, поэтому вместе с формой переезжают и две его функции: `formValuesOf` идёт в `EditEnvironmentPanel` (там она и нужна), `knownAddressesOf` — в `utils.ts` рядом с экраном, с barrel-экспортом. Цель — экран до сотни строк, панели по сорок-пятьдесят.

Панели — обычные дочерние компоненты, а не островки: сам экран уже клиентский, в отличие от `CreateVersionPanel`, который живёт рядом с серверным маршрутом.

- [ ] **Step 1: Падающие тесты**

Теста у экрана нет вовсе — файл создаётся. Замокать нужно **все** хуки поддерева: `vi.mock('@/api/hooks')` накрывает модуль целиком, а мутации теперь зовут панели, и автомок вернёт им `undefined`.

```ts
vi.mock('@/api/hooks');

beforeEach(() => {
  vi.mocked(hooks.useQueryEnvironments).mockReturnValue(query([]));
  // Обе секции: «Инфраструктура» открывает экран, «Инфо» — галочки
  // платформ, и без неё они не появятся.
  vi.mocked(hooks.useQuerySections).mockReturnValue(
    query({ [Section.Infrastructure]: AccessLevel.Write, [Section.Info]: AccessLevel.Write }),
  );
  vi.mocked(hooks.useQueryServers).mockReturnValue(query([]));
  vi.mocked(hooks.useQueryDomains).mockReturnValue(query([]));
  vi.mocked(hooks.useQueryPlatforms).mockReturnValue(query([]));
  vi.mocked(hooks.useMutationCreateEnvironment).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationUpdateEnvironment).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationDeleteEnvironment).mockReturnValue(mutation());
});

it('открывает форму окружения в панели', async () => {
  render(<InfrastructureScreen projectId="p1" isSuperadmin={false} />);

  await userEvent.click(screen.getByRole('button', { name: 'Добавить окружение' }));

  expect(screen.getByRole('dialog', { name: 'Новое окружение' })).toBeInTheDocument();
});

it('не показывает кнопку добавления без уровня записи', () => {
  vi.mocked(hooks.useQuerySections).mockReturnValue(query({ [Section.Infrastructure]: AccessLevel.Read }));

  render(<InfrastructureScreen projectId="p1" isSuperadmin={false} />);

  expect(screen.queryByRole('button', { name: 'Добавить окружение' })).not.toBeInTheDocument();
});
```

В `EnvironmentCard.test.tsx` фикстуры называются `metadata`, `server` и `detail`. Тест строится на `detail`: карточка показывает поля детали под `isDetailed(environment)`, и на метаданных чипы просто не отрисовались бы. Самой фикстуре `detail` тоже нужно добавить `platforms: []` — иначе остальные тесты карточки упадут на обращении к `undefined`.

```ts
it('показывает развёрнутые платформы', () => {
  render(
    <EnvironmentCard
      environment={{ ...detail, platforms: [{ id: 'p1', kind: PlatformKind.Server, name: 'API' }] }}
      canWrite={false}
    />,
  );

  expect(screen.getByText('API')).toBeInTheDocument();
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/web && npx vitest run "src/app/(app)/projects/[id]/infrastructure" src/components/EnvironmentCard`
Expected: FAIL — форма показывается инлайново, диалога нет; чипов на карточке нет.

- [ ] **Step 3: Реализация**

- `CreateEnvironmentPanel` и `EditEnvironmentPanel` — `Drawer` шириной
  `Half` с заголовками «Новое окружение» и «Правка окружения», внутри
  `EnvironmentForm`; мутации и состояния форм собираются в них;
- `InfrastructureScreen` держит только `isCreating` / `editingId`, список
  и две панели; закрытие панели сбрасывает оба состояния;
- платформы берутся с признаком по **уровню «Инфо»**, а не по
  суперадминству (в отличие от реестра машин рядом): подрядчик с записью
  в «Инфо» галочки получить должен. Уровни на экране уже есть, и предикат
  обязан быть терпим к тому, что они ещё не загружены — хук вызывается до
  раннего возврата по `isPending`:

  ```ts
  const platforms = useQueryPlatforms(projectId, {
    enabled: sections.data?.[Section.Info] !== undefined,
  });
  ```

  В форму передаётся `platforms.data` **как есть**, без `?? []`: иначе
  проп всегда окажется «переданным», и правка начнёт снимать чужие
  галочки;
- `formValuesOf` заполняет `platformIds` из `environment.platforms`
  (поле есть только у проекции чтения — брать через тот же приём, что
  `detail?.server?.id`);
- `EnvironmentCard` показывает платформы через `PlatformChips`.

- [ ] **Step 4: Запустить**

Run: `cd apps/web && npx vitest run "src/app/(app)/projects/[id]/infrastructure" src/components/EnvironmentCard src/components/EnvironmentForm`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src
git commit -m "Открывать окружение в выезжающей панели"
```

### Task 6.3: Сводка релизов

**Files:**
- Create: `apps/web/src/components/ReleaseSummary/{ReleaseSummary.tsx,SummaryRow.tsx,ReleaseBadge.tsx,constants.ts,types.ts,index.ts,ReleaseSummary.test.tsx}`

- [ ] **Step 1: Падающие тесты**

```ts
const STORE = { id: 'p2', kind: PlatformKind.Store, name: 'App Store', position: 2 };
const API = { id: 'p1', kind: PlatformKind.Server, name: 'API', position: 1 };

/** Ссылка на выпуск в сводке. */
function ref(versionLabel: string, date: string | null, buildLabel: string | null = null) {
  return { versionId: 'v', versionLabel, buildLabel, date };
}

/** Строка сводки. */
function row(platform: Platform, released: ReleaseRef | null, pending: ReleasePending[]) {
  return { platform, released, pending };
}

describe('ReleaseSummary', () => {
  it('отвечает «релизов ещё не было»', () => {
    render(<ReleaseSummary summary={[row(STORE, null, [])]} />);

    expect(screen.getByText('Релизов ещё не было')).toBeInTheDocument();
  });

  it('показывает релиз с датой и то, что в пути', () => {
    render(
      <ReleaseSummary
        summary={[
          row(STORE, ref('v1.2', '2026-03-14'), [
            { ...ref('v1.3', null), state: PlatformReleaseState.InReview },
          ]),
        ]}
      />,
    );

    expect(screen.getByText('App Store')).toBeInTheDocument();
    expect(screen.getByText('в релизе v1.2')).toBeInTheDocument();
    expect(screen.getByText('14.03.2026')).toBeInTheDocument();
    expect(screen.getByText('на модерации v1.3')).toBeInTheDocument();
  });

  it('показывает обозначение сборки вместо обозначения версии', () => {
    render(<ReleaseSummary summary={[row(STORE, ref('v1.2', '2026-03-14', '1.2 (45)'), [])]} />);

    expect(screen.getByText('в релизе 1.2 (45)')).toBeInTheDocument();
  });

  it('держит порядок строк, пришедший от сервера', () => {
    // Порядок пропа расходится с `position` намеренно: иначе тест прошёл
    // бы и у компонента, который сортирует сам.
    render(<ReleaseSummary summary={[row(STORE, null, []), row(API, null, [])]} />);

    const names = screen.getAllByRole('term').map((node) => node.textContent);

    expect(names).toEqual(['App Store', 'API']);
  });

  it('без платформ не рисует ничего', () => {
    const { container } = render(<ReleaseSummary summary={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/web && npx vitest run src/components/ReleaseSummary`
Expected: FAIL — компонента нет.

- [ ] **Step 3: Реализация**

Презентационный компонент, данные только пропами: тот же экземпляр работает на внутреннем экране (из кэша TanStack Query) и на публичной странице, которая получает роадмап пропом от серверной страницы и TanStack Query не поднимает — хотя сам `PublicRoadmapView` клиентский.

`constants.ts`:

```ts
/** Подписи состояний выпуска. */
export const RELEASE_STATE_LABELS: Record<PlatformReleaseState, string> = {
  [PlatformReleaseState.OnTest]: 'на тесте',
  [PlatformReleaseState.InReview]: 'на модерации',
  [PlatformReleaseState.Released]: 'в релизе',
  [PlatformReleaseState.Rejected]: 'отклонена',
};

/**
 * Классы плашек по состоянию. Записаны целиком: Tailwind вырезает классы,
 * которых нет в исходниках буквально.
 *
 * Палитра та же, что у точек статуса (`INDICATOR_COLORS`): зелёный —
 * вышло, жёлтый — ждёт, красный — встало. Токенов `success` и `warning`
 * в теме нет, и заводить их ради плашек — отдельная работа. Красный —
 * `-400`, а не `-500`: на подложке `/15` пятисотый даёт контраст 4.44:1
 * и не проходит AA для мелкого текста, четырёхсотый — 6.04:1. Тема
 * `destructive` хуже обоих (4.35:1).
 */
export const RELEASE_STATE_CLASSES: Record<PlatformReleaseState, string> = {
  [PlatformReleaseState.OnTest]: 'bg-muted text-muted-foreground',
  [PlatformReleaseState.InReview]: 'bg-amber-500/15 text-amber-500',
  [PlatformReleaseState.Released]: 'bg-green-500/15 text-green-500',
  [PlatformReleaseState.Rejected]: 'bg-red-500/15 text-red-400',
};
```

Разметка — список определений (`dl` / `dt` / `dd`): имя платформы `dt`, релиз и плашки `dd`. Дата — существующей утилитой `formatDate` из `@/utils` (она даёт `ДД.ММ.ГГГГ` и уже закреплена в тестах часовым поясом из конфига). Состояние читается подписью, а не одним цветом. `RELEASE_STATE_LABELS` понадобятся и панели версии — она импортирует их глубоким импортом, как `VersionForm` делает со `STATE_LABELS`.

- [ ] **Step 4: Запустить**

Run: `cd apps/web && npx vitest run src/components/ReleaseSummary`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/ReleaseSummary
git commit -m "Показать сводку релизов одной таблицей"
```

### Task 6.4: Сводка на экране и на публичной странице

**Files:**
- Modify: `apps/web/src/app/(app)/projects/[id]/roadmap/{RoadmapScreen.tsx,RoadmapScreen.test.tsx}`
- Modify: `apps/web/src/app/roadmap/[token]/{PublicRoadmapView.tsx,PublicRoadmapView.test.tsx}`

- [ ] **Step 1: Падающие тесты**

Сначала **дополнить фикстуры**: в `RoadmapScreen.test.tsx` объекту `roadmap` добавить `summary` со строкой по «App Store», версиям — `releases: []`, чекпоинтам — `platformIds: []`; в `PublicRoadmapView.test.tsx` фикстуре `roadmap` — то же (там проп типизирован `PublicRoadmap`, поэтому пропуск поймает и `typecheck`).

Версия без `releases` не даёт ошибки типов: она молча провалится в ветку метаданных union'а и потеряет чекпоинты — это та же тихая деградация, о которой предупреждает Task 1.3, только на стороне веба.

```ts
it('ставит сводку над диаграммой', () => {
  render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

  const summary = screen.getByText('App Store');
  const timeline = screen.getByRole('group', { name: 'Диаграмма роадмапа' });

  // Сводка должна отвечать до того, как читатель дошёл до диаграммы.
  expect(summary.compareDocumentPosition(timeline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('подсказывает, где заводятся платформы, когда их нет', () => {
  vi.mocked(hooks.useQueryRoadmap).mockReturnValue(query({ ...roadmap, summary: [] }));

  render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

  expect(screen.getByRole('link', { name: /Платформы задаются в паспорте проекта/ })).toHaveAttribute(
    'href',
    '/projects/p1',
  );
});

it('без права записи о паспорте не подсказывает', () => {
  vi.mocked(hooks.useQueryRoadmap).mockReturnValue(query({ ...roadmap, summary: [] }));
  vi.mocked(hooks.useQuerySections).mockReturnValue(query({ [Section.Roadmap]: AccessLevel.Read }));

  render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

  expect(screen.queryByText(/Платформы задаются/)).not.toBeInTheDocument();
});
```

Для публичной страницы:

```ts
it('показывает сводку без адресов', () => {
  render(<PublicRoadmapView roadmap={roadmap} />);

  expect(screen.getByText('в релизе v1.2')).toBeInTheDocument();
  expect(screen.queryByText(/example\.com/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/web && npx vitest run "src/app/(app)/projects/[id]/roadmap" src/app/roadmap`
Expected: FAIL — сводки на экранах нет.

- [ ] **Step 3: Реализация**

`RoadmapScreen` рендерит `ReleaseSummary` первым блоком; подсказка о паспорте — только при пустой сводке и уровне записи, ссылкой на `/projects/<id>`. `PublicRoadmapView` — то же из `roadmap.summary`, без подсказки: публичному читателю заводить платформы негде.

- [ ] **Step 4: Запустить**

Run: `cd apps/web && npx vitest run src/app`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/app
git commit -m "Поставить сводку релизов над диаграммой"
```

### Task 6.5: Выпуски в панели версии

**Files:**
- Create: `apps/web/src/components/VersionDrawer/{ReleaseList.tsx,ReleaseRow.tsx}`
- Create: `apps/web/src/components/VersionDrawer/VersionActions.tsx`
- Create: `apps/web/src/utils/today.ts`
- Modify: `apps/web/src/components/VersionDrawer/{VersionDrawer.tsx,types.ts,VersionDrawer.test.tsx}`
- Modify: `apps/web/src/components/VersionForm/{VersionForm.tsx,types.ts,VersionForm.test.tsx}`
- Modify: `apps/web/src/utils/index.ts`
- Modify: `apps/web/src/app/(app)/projects/[id]/roadmap/{RoadmapScreen.tsx,RoadmapScreen.test.tsx,RoadmapVersionPanel.tsx,CreateVersionPanel.tsx}`
- Modify: `apps/web/src/app/roadmap/[token]/PublicRoadmapView.tsx`

- [ ] **Step 1: Падающие тесты**

Хелпер и фикстуры объявляются в тесте:

```ts
/** Подписи опций селекта — по ним проверяется состав выбора. */
function optionsOf(select: HTMLElement): string[] {
  return Array.from(select.querySelectorAll('option')).map((option) => option.textContent ?? '');
}

const API = { id: 'p1', kind: PlatformKind.Server, name: 'API', position: 1 };
const STORE = { id: 'p2', kind: PlatformKind.Store, name: 'App Store', position: 2 };

/**
 * Версия с выпуском: фикстуры задаются в файле.
 *
 * `VERSION` — уровень чтения с `releases: []`, `VERSION_WITH_RELEASE` —
 * с выпуском «в релизе» от 14.03.2026 и обозначением сборки «1.2 (45)»,
 * `METADATA_VERSION` — без `checkpoints` и `releases`.
 */

// Действия берутся фабрикой `makeActions()` из файла, а не общей
// константой: `clearMocks` в конфиге веба не включён, и вызовы
// протекали бы между тестами.

it('предлагает модерацию только магазину', () => {
  render(<VersionDrawer version={VERSION} platforms={[API, STORE]} isCurrent isOpen onClose={vi.fn()} actions={makeActions()} />);

  expect(optionsOf(screen.getByLabelText('Состояние API'))).toEqual([
    'как у версии',
    'на тесте',
    'в релизе',
  ]);
  expect(optionsOf(screen.getByLabelText('Состояние App Store'))).toContain('на модерации');
});

it('отправляет всю тройку, а не одно изменённое поле', async () => {
  // `PUT` заменяет клетку целиком (Chunk 4, Task 4.4): посылка одного
  // состояния обнулила бы уже введённое обозначение сборки.
  const actions = makeActions();

  render(
    <VersionDrawer
      version={VERSION_WITH_RELEASE}
      platforms={[STORE]}
      isCurrent
      isOpen
      onClose={vi.fn()}
      actions={actions}
    />,
  );

  await userEvent.selectOptions(screen.getByLabelText('Состояние App Store'), 'in_review');

  expect(actions.onSetRelease).toHaveBeenCalledWith('p2', {
    state: 'in_review',
    releasedDate: '2026-03-14',
    buildLabel: '1.2 (45)',
  });
});

it('выбор «в релизе» подставляет сегодняшнюю дату', async () => {
  // Иначе сводка покажет релиз без числа, а дата версии молча уедет
  // на хранимую колонку.
  render(<VersionDrawer version={VERSION} platforms={[STORE]} isCurrent isOpen onClose={vi.fn()} actions={makeActions()} />);

  await userEvent.selectOptions(screen.getByLabelText('Состояние App Store'), 'released');

  expect(actions.onSetRelease).toHaveBeenCalledWith('p2', {
    state: 'released',
    releasedDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
  });
});

it('«как у версии» снимает выпуск', async () => {
  render(<VersionDrawer version={VERSION_WITH_RELEASE} platforms={[STORE]} isCurrent isOpen onClose={vi.fn()} actions={makeActions()} />);

  await userEvent.selectOptions(screen.getByLabelText('Состояние App Store'), '');

  expect(actions.onClearRelease).toHaveBeenCalledWith('p2');
});

it('без действий показывает выпуски без органов управления', () => {
  render(<VersionDrawer version={VERSION_WITH_RELEASE} platforms={[STORE]} isCurrent isOpen onClose={vi.fn()} />);

  expect(screen.getByText('в релизе')).toBeInTheDocument();
  expect(screen.queryByLabelText('Состояние App Store')).not.toBeInTheDocument();
});

it('на уровне метаданных блока платформ нет', () => {
  // `releases` приходят только с уровнем чтения: иначе блок оказался бы
  // пустым и соврал бы, что выпусков нет.
  render(<VersionDrawer version={METADATA_VERSION} platforms={[STORE]} isCurrent isOpen onClose={vi.fn()} />);

  expect(screen.queryByText('Платформы')).not.toBeInTheDocument();
});
```

В `VersionForm.test.tsx` — фикстура обязана быть в состоянии «выпущена», иначе поле скрыто и так, и тест зелёный до реализации:

```ts
const RELEASED = {
  label: 'v1.2',
  state: RoadmapVersionState.Released,
  plannedDate: null,
  releasedDate: '2026-03-14',
};

it('скрывает дату релиза, когда у проекта есть платформы', () => {
  // Иначе вторая правда заводилась бы уже после того, как появилась
  // первая: дата живёт у выпусков.
  render(<VersionForm initial={RELEASED} onSubmit={vi.fn()} hasPlatforms />);

  expect(screen.queryByLabelText('Дата релиза')).not.toBeInTheDocument();
});

it('без платформ дата релиза по-прежнему есть', () => {
  render(<VersionForm initial={RELEASED} onSubmit={vi.fn()} />);

  expect(screen.getByLabelText('Дата релиза')).toBeInTheDocument();
});

it('при платформах не отправляет дату вовсе', async () => {
  // Ключа в запросе нет — хранимое значение не затирается. Поправить его
  // можно, записав фактический выход на платформе.
  const onSubmit = vi.fn();

  render(<VersionForm initial={RELEASED} onSubmit={onSubmit} hasPlatforms />);
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

  expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty('releasedDate');
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/web && npx vitest run src/components/VersionDrawer src/components/VersionForm`
Expected: FAIL — пропа `platforms` нет, `hasPlatforms` нет.

- [ ] **Step 3: Реализация**

- `IProps` панели получает `platforms?: Platform[]`; `IVersionActions` —
  `onSetRelease(platformId, input)` и `onClearRelease(platformId)`;
- `ReleaseList` встаёт между паспортом версии и чекпоинтами. Ему нужны
  два входа: платформы проекта пропом и текущие значения из
  `version.releases`. Блок закрывается тем же `isDetailed(version)`, что
  и чекпоинты: на уровне метаданных `releases` не приходят. Платформ нет —
  `null`;
- `ReleaseRow`: имя платформы, селект с `aria-label` вида
  «Состояние {имя}» (три одинаковых подписи на панели с тремя платформами
  различить было бы нечем), опции — пустая «как у версии» первой, затем
  `releaseStatesFor(platform.kind)` с подписями из
  `ReleaseSummary/constants`. Выбор «в релизе» подставляет сегодняшний
  день, как это уже делает `VersionForm`. Поле даты показывается при «в
  релизе», поле обозначения сборки — всегда, с `placeholder` из
  обозначения версии. Правка действует сразу, без кнопки сохранения;
- без `actions` вместо селекта — подпись состояния и дата;
- `VersionForm` получает `hasPlatforms?: boolean`: при `true` не
  показывает поле даты релиза и **не включает ключ** `releasedDate`
  в отправляемый объект;
- `VersionDrawer` выводит `hasPlatforms` из длины `platforms` и передаёт
  в `VersionForm`;
- `CreateVersionPanel` получает `platforms` и передаёт тот же признак:
  иначе поле осталось бы видимым там, где версия как раз и заводится;
- «сегодня» берётся **общей утилитой**: функция `today()` сейчас
  модульно-приватная в `VersionForm.tsx`, и копировать её нельзя. Переезжает
  в `apps/web/src/utils/today.ts` с barrel-экспортом, `VersionForm`
  начинает импортировать её оттуда;
- поле обозначения сборки отправляет значение **по уходу из него**
  (`onBlur`), а не по нажатию клавиши: `PUT` на каждый символ и лишний,
  и затирающий, а правило проекта требует не частить запросами;
- кнопки «Редактировать» и «Удалить версию» выносятся в
  `VersionActions.tsx` — безусловно, а не «если лимит превышен»:
  `VersionDrawer.tsx` сейчас 88 строк, и после этой задачи вместе
  с Task 6.6 он выходит за сотню гарантированно;
- `RoadmapScreen` передаёт `roadmap.data.summary.map((row) => row.platform)`
  в обе панели; `RoadmapVersionPanel` получает новый проп `platforms` и
  собирает действия из `useMutationSetRelease` / `useMutationClearRelease`.
  В `RoadmapScreen.test.tsx` обе новые мутации надо добавить в `beforeEach`:
  панель читает их `isPending` на рендере, и автомок уронил бы экран;
- `PublicRoadmapView` передаёт платформы из `summary` без действий.

- [ ] **Step 4: Запустить**

Run: `cd apps/web && npx vitest run src/components/VersionDrawer src/components/VersionForm src/app`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src
git commit -m "Вести выпуски платформ в панели версии"
```

### Task 6.6: Теги и правка чекпоинта

**Files:**
- Create: `apps/web/src/components/CheckpointForm/PlatformsToggles.tsx`
- Modify: `apps/web/src/components/CheckpointForm/{CheckpointForm.tsx,types.ts,CheckpointForm.test.tsx}`
- Create: `apps/web/src/components/CheckpointForm/CheckpointFields.tsx`
- Modify: `apps/web/src/components/VersionDrawer/{CheckpointList.tsx,CheckpointItem.tsx,CheckpointList.test.tsx,VersionDrawer.tsx,VersionDrawer.test.tsx,types.ts}`
- Modify: `apps/web/src/app/(app)/projects/[id]/roadmap/RoadmapVersionPanel.tsx`

Правка чекпоинта появляется здесь не только ради тегов: сейчас у существующего чекпоинта нельзя поправить **ни формулировку, ни ссылку на задачу** — только закрыть или удалить, и опечатка означает пересоздание записи. Теги без правки повторили бы ту же беду.

- [ ] **Step 1: Падающие тесты**

Фикстуры в `CheckpointList.test.tsx` называются `plain` и `withUrl`; `API` и `STORE` задаются в файле. Обеим существующим фикстурам **сначала** добавляется `platformIds: []`: после правки `CheckpointItem` читает набор, и без этого упадут все шесть тестов файла и восемь тестов `VersionDrawer`.

```ts
it('показывает теги платформ у чекпоинта', () => {
  render(
    <CheckpointList
      checkpoints={[{ ...plain, platformIds: ['p1'] }]}
      platforms={[API]}
      canWrite={false}
      onToggle={vi.fn()}
      onDelete={vi.fn()}
    />,
  );

  expect(screen.getByText('API')).toBeInTheDocument();
});

it('неизвестный тег пропускает молча', () => {
  render(
    <CheckpointList
      checkpoints={[{ ...plain, platformIds: ['нет такой'] }]}
      platforms={[API]}
      canWrite={false}
      onToggle={vi.fn()}
      onDelete={vi.fn()}
    />,
  );

  expect(screen.getByLabelText(plain.title)).toBeInTheDocument();
});

it('правит формулировку, ссылку и теги существующего чекпоинта', async () => {
  const onEdit = vi.fn();

  render(
    <CheckpointList
      checkpoints={[{ ...plain, platformIds: [] }]}
      platforms={[API, STORE]}
      canWrite
      onToggle={vi.fn()}
      onDelete={vi.fn()}
      onEdit={onEdit}
    />,
  );

  await userEvent.click(screen.getByRole('button', { name: `Править ${plain.title}` }));
  await userEvent.clear(screen.getByLabelText('Формулировка'));
  await userEvent.type(screen.getByLabelText('Формулировка'), 'Вход по телефону');
  await userEvent.click(screen.getByLabelText('App Store'));
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

  expect(onEdit).toHaveBeenCalledWith(plain.id, {
    title: 'Вход по телефону',
    url: null,
    platformIds: ['p2'],
  });
});

it('без права записи править не предлагает', () => {
  render(
    <CheckpointList checkpoints={[plain]} canWrite={false} onToggle={vi.fn()} onDelete={vi.fn()} />,
  );

  expect(screen.queryByRole('button', { name: /Править/ })).not.toBeInTheDocument();
});
```

В `CheckpointForm.test.tsx`:

```ts
it('отправляет выбранные платформы с новым чекпоинтом', async () => {
  const onSubmit = vi.fn();

  render(<CheckpointForm onSubmit={onSubmit} platforms={[API, STORE]} />);

  await userEvent.type(screen.getByLabelText('Формулировка'), 'Вход по телефону');
  await userEvent.click(screen.getByLabelText('App Store'));
  await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));

  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ platformIds: ['p2'] }));
});

it('без платформ проекта переключателей нет', () => {
  render(<CheckpointForm onSubmit={vi.fn()} />);

  expect(screen.queryByText('Платформы')).not.toBeInTheDocument();
});

it('предзаполняется для правки и зовёт кнопку «Сохранить»', () => {
  render(
    <CheckpointForm
      initial={{ title: 'Оплата', url: 'https://tracker/1', platformIds: ['p1'] }}
      submitLabel="Сохранить"
      platforms={[API]}
      onSubmit={vi.fn()}
    />,
  );

  expect(screen.getByLabelText('Формулировка')).toHaveValue('Оплата');
  expect(screen.getByLabelText('Ссылка на задачу')).toHaveValue('https://tracker/1');
  expect(screen.getByLabelText('API')).toBeChecked();
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/web && npx vitest run src/components/VersionDrawer src/components/CheckpointForm`
Expected: FAIL — пропов нет, кнопки «Править» нет.

- [ ] **Step 3: Реализация**

- `CheckpointForm`: вместо `initialTitle` — `initial?: { title, url, platformIds }`
  и `submitLabel = 'Добавить'`; `platforms?: Platform[]`. `platformIds`
  отправляется **только когда проп платформ передан**. После отправки
  в режиме создания поля и выбор сбрасываются, в режиме правки — нет:
  форма закрывается родителем;
- **идентификаторы полей становятся уникальными.** Сейчас форма задаёт
  `id="checkpoint-title"` и `id="checkpoint-url"` жёстко, а форма
  добавления рисуется всегда при наличии прав — рядом с формой правки
  в DOM оказались бы два элемента с одним `id`, обе подписи указали бы
  на первый, и `getByLabelText('Формулировка')` упал бы на «found
  multiple elements». Идентификатор собирается из того, что правится:
  `checkpoint-new-title` у новой записи, `checkpoint-<id>-title`
  у существующей;
- **файл разгружается всерьёз.** `CheckpointForm.tsx` ровно 100 строк,
  и вынос только новых переключателей ничего не решает: остальные правки
  добавляют ещё около десяти строк. Поля «Формулировка» и «Ссылка на
  задачу» переезжают в `CheckpointFields.tsx` (там же живут уникальные
  `id`), переключатели — в `PlatformsToggles.tsx`;
- `CheckpointItem`: теги через `PlatformChips` после формулировки
  (неизвестный идентификатор пропускается молча) и кнопка «Править»
  с `aria-label` вида «Править {формулировка}» — при праве записи;
- `CheckpointList`: держит идентификатор правимого чекпоинта и показывает
  на его месте `CheckpointForm` с начальными значениями; `onEdit`
  вызывается с идентификатором и данными, после чего правка закрывается;
- `VersionDrawer`: передаёт платформы и в список, и в форму добавления;
  `IVersionActions` получает `onEditCheckpoint(checkpointId, input)` —
  **необязательным**, по образцу уже необязательного
  `onReadCheckpointTitle`: иначе фабрика `makeActions` в
  `VersionDrawer.test.tsx` перестанет проходить типизацию;
- `RoadmapVersionPanel`: `onEditCheckpoint` собирается из уже
  существующего `useMutationUpdateCheckpoint` — он принимает те же поля,
  включая `platformIds`.

Полезная нагрузка `onEditCheckpoint` — `RoadmapCheckpointUpdate`: `CheckpointForm.onSubmit` отдаёт `RoadmapCheckpointCreate`, и он присваивается без третьего типа (обязательный `title` годится для необязательного).

Поведение подстановки заголовка по ссылке сохраняется само: чтение молчит при непустой формулировке, а в режиме правки она предзаполнена. Это стоит закрепить тестом «правка не затирает формулировку по уходу из поля ссылки» — регресс дорогой, а строка одна.

- [ ] **Step 4: Запустить**

Run: `cd apps/web && npx vitest run src`
Expected: PASS.

- [ ] **Step 5: Запустить всё и типы**

Run: `cd "$(git rev-parse --show-toplevel)" && pnpm typecheck`
Expected: PASS — к этому шагу контракт, API и веб сошлись. Прогон из корня обязателен: локальный `typecheck` в `apps/web` сверил бы веб со старым собранным контрактом.

- [ ] **Step 6: Коммит**

```bash
git add apps/web/src
git commit -m "Править чекпоинт и помечать его платформами"
```

---

## Финальная проверка

- [ ] Предварительная работа выполнена: `docs/superpowers/plans/2026-10-07-cairn-snapshot-realign.md` пройден, и `cd apps/api && npx drizzle-kit generate --name=check` отвечает «No schema changes» ещё до начала этой работы.
- [ ] `pnpm test` из корня — зелено во всех рабочих пространствах (интеграционные поднимают PostgreSQL через Testcontainers).
- [ ] `pnpm typecheck` из корня — зелено.
- [ ] `pnpm build` — зелено.
- [ ] Ссылок на удалённые маршруты не осталось: `grep -rn "projects/new" apps/web/src` — пусто; `grep -rn "projects/\[id\]/edit" apps/web/src` — пусто. Ссылки `/servers/<id>/edit` и `/domains/<id>/edit` остаются: их формы переезжают отдельной работой.
- [ ] Руками на поднятом стеке (`docker compose up -d`, миграции применены):
  - [ ] проект создаётся в панели с платформами «API», «Веб», «App Store», выбранными из подсказок;
  - [ ] «Править» на странице проекта открывает ту же форму в панели; снятие платформы действует сразу, чипы обновляются без перезагрузки;
  - [ ] в окружении «Прод» отмечаются «API» и «Веб»; «App Store» в списке галочек не предлагается; правка имени окружения галочек не снимает;
  - [ ] у версии v1.3 выставляются три разных состояния: API — «в релизе», Веб — «на тесте», App Store — «на модерации»;
  - [ ] сводка наверху роадмапа читается за две секунды и отвечает, что в релизе и что на проверке;
  - [ ] у чекпоинта правятся формулировка, ссылка и теги; теги видны в строке;
  - [ ] версия, у которой дата релиза была заведена до появления платформ: поле в форме скрыто, дата на диаграмме осталась, а после записи выпущенного выпуска сменилась на его дату;
  - [ ] у проекта без платформ поле «Дата релиза» на месте, сводки нет, экран роадмапа выглядит как прежде;
  - [ ] публичная ссылка роадмапа в приватном окне показывает ту же сводку и не показывает ни адресов, ни здоровья;
  - [ ] журнал действий содержит `platform.created` и `platform_release.set` с внятными подписями.
