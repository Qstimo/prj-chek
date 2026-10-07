# Релизы по платформам — план реализации

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Релиз перестаёт быть одной датой у версии: у проекта появляются платформы, у версии — выпуск на каждой из них со своим состоянием и датой, а наверху роадмапа — сводка, отвечающая без чтения текста на «был ли релиз, что в сторе, что на модерации, что на тесте».

**Architecture:** Шесть частей по возрастанию цены ошибки: контракт, база, API платформ, API выпусков и сводки, веб-панели, веб-экраны. Платформа — поле паспорта проекта, а не реестр и не окружение: своего экрана у неё нет, окружение лишь отмечает галочками, что в нём живёт. Состояние выпуска — лестница из четырёх значений, ни одно из которых не повторяет состояние версии; отсутствие строки выпуска означает «идёт вместе с версией». Сводка вычисляется на сервере, как прогресс и стадия.

**Tech Stack:** pnpm workspaces, NestJS, Drizzle + PostgreSQL, zod в `packages/shared`, Next.js 15, Vitest + React Testing Library, Testcontainers.

**Основание:** `docs/superpowers/specs/2026-10-07-cairn-releases-platforms-design.md`

---

## Как работать с этим планом

TDD: сначала падающий тест, затем реализация. Линтера в проекте нет.

| Что | Команда |
|---|---|
| Все тесты | `pnpm test` |
| Точечно API | `cd apps/api && npx vitest run src/путь` |
| Точечно веб | `cd apps/web && npx vitest run src/путь` |
| Точечно контракт | `cd packages/shared && npx vitest run` |
| Типы | `pnpm typecheck` |
| Миграция | `cd apps/api && npx drizzle-kit generate --name=<имя>` |
| Миграция вручную | `cd apps/api && npx drizzle-kit generate --custom --name=<имя>` |

Соглашения: компонент до 100 строк в своей директории с `index.ts`, пропсы — `IProps` в `types.ts`, TSDoc на русском, `any` запрещён, значения из перечней — `enum`, а не union.

**Осторожно с `pnpm --filter ... test -- --run <путь>`**: двойное `--` съедает фильтр, и запускается весь набор, включая Testcontainers. Точечно — через `npx vitest run` из каталога приложения.

**Порядок чанков обязателен**: Chunk 1 ломает типы в API и вебе, и `pnpm typecheck` станет зелёным только к концу Chunk 6. Это ожидаемо; внутри чанков тесты зелёные на каждом коммите.

### Структура файлов

| Файл | Ответственность |
|---|---|
| `packages/shared/src/enums.ts` | `PlatformKind`, `PlatformReleaseState` |
| `packages/shared/src/schemas/day-date.ts` | дата-день, общая для роадмапа и выпусков |
| `packages/shared/src/schemas/platform.ts` | платформа, выпуск, сводка, допустимые состояния по виду |
| `packages/shared/src/schemas/roadmap.ts` | сводка в ответе, выпуски у версии, теги у чекпоинта |
| `packages/shared/src/schemas/project.ts` | платформы при создании проекта |
| `packages/shared/src/schemas/environment.ts` | платформы окружения |
| `apps/api/src/db/schema/platforms.ts` | четыре таблицы и два перечня базы |
| `apps/api/drizzle/0025_release_platforms.sql` | таблицы |
| `apps/api/drizzle/0026_release_platform_privileges.sql` | права роли `cairn_app` |
| `apps/api/src/platforms/platforms.repository.ts` | платформы проекта: права, уникальность, уборка |
| `apps/api/src/platforms/platforms.service.ts` | транзакция и журнал |
| `apps/api/src/platforms/platforms.controller.ts` | четыре ручки секции «Инфо» |
| `apps/api/src/platforms/platforms.module.ts` | сборка модуля |
| `apps/api/src/roadmap/release.summary.ts` | правило сводки: что в релизе, что в пути |
| `apps/api/src/roadmap/roadmap.projection.ts` | выпуски у версии, дата версии из выпусков |
| `apps/api/src/roadmap/roadmap.repository.ts` | постановка и снятие выпуска, теги, уборка |
| `apps/api/src/roadmap/roadmap.controller.ts` | `PUT`/`DELETE` выпуска |
| `apps/api/src/environments/environments.repository.ts` | связи окружения с платформами |
| `apps/web/src/components/Drawer/{types,constants}.ts` | третья ширина — половина экрана |
| `apps/web/src/api/hooks/usePlatforms.ts` | запрос и мутации платформ |
| `apps/web/src/api/hooks/useMutationRelease.ts` | постановка и снятие выпуска |
| `apps/web/src/components/ProjectForm/PlatformsField.tsx` | чипы платформ и подсказки |
| `apps/web/src/app/(app)/CreateProjectPanel.tsx` | создание проекта в панели |
| `apps/web/src/app/(app)/projects/[id]/EditProjectPanel.tsx` | правка проекта в панели |
| `apps/web/src/components/ReleaseSummary/` | сводка релизов |
| `apps/web/src/components/VersionDrawer/ReleaseList.tsx` | выпуски версии в панели |

---

## Chunk 1: Контракт

### Task 1.1: Виды платформ и состояния выпуска

**Files:**
- Modify: `packages/shared/src/enums.ts`
- Modify: `packages/shared/src/enums.test.ts`

- [ ] **Step 1: Падающий тест**

В `enums.test.ts`:

```ts
describe('PlatformReleaseState', () => {
  it('не повторяет состояний версии', () => {
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
Expected: FAIL — `PlatformReleaseState` не определён.

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

- [ ] **Step 1: Падающий тест**

`packages/shared/src/schemas/platform.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { PlatformKind, PlatformReleaseState } from '../enums';
import {
  platformCreateSchema,
  platformReleaseSetSchema,
  releaseStatesFor,
  releaseSummaryRowSchema,
} from './platform';

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
  it('принимает состояние без даты', () => {
    // «Вышла, дата неизвестна» — честное состояние, как у версий,
    // оставшихся без фактической даты после прошлой миграции.
    expect(platformReleaseSetSchema.parse({ state: PlatformReleaseState.Released })).toEqual({
      state: PlatformReleaseState.Released,
    });
  });
});

describe('releaseSummaryRowSchema', () => {
  it('описывает платформу без релизов', () => {
    const row = releaseSummaryRowSchema.parse({
      platform: {
        id: '00000000-0000-0000-0000-000000000001',
        kind: PlatformKind.Store,
        name: 'RuStore',
        position: 3,
      },
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

/** Имя платформы: своё в каждом проекте («Веб-админка», «RuStore»). */
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

/** Правка платформы, включая место в порядке. */
export const platformUpdateSchema = z
  .object({
    kind: z.nativeEnum(PlatformKind).optional(),
    name: platformNameSchema.optional(),
    position: z.number().int().positive().optional(),
  })
  .strict();

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

/**
 * Набор платформ: без повторов, правится целиком.
 *
 * Один на всех, кто его принимает, — теги чекпоинта и платформы
 * окружения: два почти одинаковых определения разошлись бы ограничениями.
 */
export const platformIdsSchema = z
  .array(z.string().uuid())
  .max(20)
  .refine((ids) => new Set(ids).size === ids.length, 'Платформы повторяются');

/** Постановка выпуска: состояние обязательно, остальное дополняется позже. */
export const platformReleaseSetSchema = z
  .object({
    state: z.nativeEnum(PlatformReleaseState),
    releasedDate: dayDateSchema.optional(),
    buildLabel: z.string().trim().max(100).nullable().optional(),
  })
  .strict();

/** Выпуск в сводке: на какую версию он ссылается. */
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

В `roadmap.ts` убрать собственное определение `dayDateSchema` и импортировать общее:

```ts
import { dayDateSchema } from './day-date';
```

В `packages/shared/src/index.ts` добавить экспорты `./schemas/platform` и `./schemas/day-date` рядом с остальными (порядок — как в файле, по алфавиту).

- [ ] **Step 4: Запустить**

Run: `cd packages/shared && npx vitest run`
Expected: PASS, включая существующие тесты роадмапа — формат даты не изменился.

- [ ] **Step 5: Коммит**

```bash
git add packages/shared/src
git commit -m "Описать платформу, выпуск и сводку релизов"
```

### Task 1.3: Сводка и выпуски в схемах роадмапа

**Files:**
- Modify: `packages/shared/src/schemas/roadmap.ts`
- Modify: `packages/shared/src/schemas/roadmap.test.ts`

- [ ] **Step 1: Падающие тесты**

В `roadmap.test.ts`:

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

it('правка чекпоинта отвергает повторяющиеся теги', () => {
  const platformId = '00000000-0000-0000-0000-000000000002';

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
Expected: FAIL — `platformIds` в разобранном объекте отсутствует, `summary` тоже.

- [ ] **Step 3: Реализация**

В `roadmap.ts`:

```ts
import { platformIdsSchema, platformReleaseSchema, releaseSummaryRowSchema } from './platform';
```

- в `roadmapCheckpointSchema` добавить `platformIds: z.array(z.string().uuid())`;
- в `roadmapCheckpointCreateSchema` и `roadmapCheckpointUpdateSchema` добавить
  `platformIds: platformIdsSchema.optional()`;
- в `roadmapVersionDetailSchema` добавить `releases: z.array(platformReleaseSchema)`
  (уровень чтения: это содержимое версии, как и чекпоинты);
- в `publicVersionSchema` добавить то же поле — публичная панель версии
  показывает тот же блок;
- в `roadmapResponseSchema` и `publicRoadmapSchema` добавить
  `summary: z.array(releaseSummaryRowSchema)`.

TSDoc к `platformIds` в чекпоинте:

```ts
  /**
   * Платформы, на которые едет результат. Необязательно и больше одной.
   *
   * Набор присылается целиком, а не по одному: он правится целиком в одной
   * форме чекпоинта, и затирать здесь нечего.
   */
```

- [ ] **Step 4: Запустить**

Run: `cd packages/shared && npx vitest run`
Expected: PASS. Существующие тесты роадмапа, разбирающие чекпоинт, придётся дополнить `platformIds: []`, а ответ — `summary: []`.

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

- [ ] **Step 1: Падающий тест**

В `environment.test.ts`:

```ts
it('окружение принимает платформы, которые в нём живут', () => {
  const platformId = '00000000-0000-0000-0000-000000000002';

  expect(environmentUpdateSchema.parse({ platformIds: [platformId] }).platformIds).toEqual([
    platformId,
  ]);

  expect(() =>
    environmentUpdateSchema.parse({ platformIds: [platformId, platformId] }),
  ).toThrow();
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `cd packages/shared && npx vitest run src/schemas/environment.test.ts`
Expected: FAIL — `platformIds` отсутствует.

- [ ] **Step 3: Реализация**

В `environment.ts`:

- в `environmentDetailSchema` добавить `platforms: z.array(platformRefSchema)`;
- в `environmentUpdateSchema` добавить:

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

В `project.ts` — только в создании:

```ts
/**
 * Поля для создания проекта. Слаг генерируется сервером.
 *
 * Платформы принимаются здесь, но не в правке: при создании затирать
 * нечего, а требовать сначала создать проект и лишь потом вернуться
 * за платформами — лишний шаг. В правке каждая платформа действует
 * своей мутацией и чужого не трогает.
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

- [ ] **Step 1: Падающие тесты**

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

  it('дата выпуска необязательна', () => {
    // «Вышла, дата неизвестна» — честное состояние.
    expect(versionPlatformReleases.releasedDate.notNull).toBe(false);
    expect(versionPlatformReleases.state.notNull).toBe(true);
  });
});

describe('связи', () => {
  it('связь окружения и тег чекпоинта — пары без своего ключа', () => {
    expect(getTableConfig(environmentPlatforms).primaryKeys).toHaveLength(1);
    expect(getTableConfig(checkpointPlatforms).primaryKeys).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/api && npx vitest run src/db/schema/platforms.test.ts`
Expected: FAIL — модуль `./platforms` не найден.

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
    index('version_platform_releases_version_idx').on(table.versionId),
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

В `apps/api/src/db/schema/index.ts` добавить `export * from './platforms';` после `'./invitations'` (по алфавиту между `invitations` и `projects`).

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/db/schema`
Expected: PASS, включая `invariants.test.ts`.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/db
git commit -m "Завести таблицы платформ, связей и выпусков"
```

### Task 2.2: Миграции

**Files:**
- Create: `apps/api/drizzle/0025_release_platforms.sql`
- Create: `apps/api/drizzle/0026_release_platform_privileges.sql`
- Modify: `apps/api/drizzle/meta/_journal.json` (генератором)

- [ ] **Step 1: Сгенерировать миграцию таблиц**

Run: `cd apps/api && npx drizzle-kit generate --name=release_platforms`
Expected: файл `0025_release_platforms.sql` с `CREATE TYPE` на два перечня и `CREATE TABLE` на четыре таблицы.

Прочитать файл глазами: в нём не должно быть ни `DROP`, ни `ALTER` существующих таблиц. Если генератор предложил что-то ещё — значит схема разошлась с базой до этой работы, и это разбирается отдельно, а не правкой миграции.

- [ ] **Step 2: Добавить миграцию прав**

Run: `cd apps/api && npx drizzle-kit generate --custom --name=release_platform_privileges`

В созданный `0026_release_platform_privileges.sql`:

```sql
--> Роль приложения получает права на новые таблицы отдельной миграцией:
--> drizzle-kit их не выдаёт, а без них приложение упадёт на первом запросе.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  project_platforms,
  environment_platforms,
  version_platform_releases,
  checkpoint_platforms
TO cairn_app;
```

- [ ] **Step 3: Применить на поднятой базе**

Run: `cd apps/api && npx tsx src/db/migrate.ts`
Expected: обе миграции применились, ошибок нет. База должна быть поднята (`docker compose up -d postgres`).

Если базы под рукой нет — шаг откладывается до Chunk 3, где интеграционные тесты поднимут PostgreSQL через Testcontainers и применят миграции сами.

- [ ] **Step 4: Проверить, что схема и база сошлись**

Run: `cd apps/api && npx drizzle-kit generate --name=should_be_empty`
Expected: «No schema changes, nothing to migrate». Созданный пустой файл удалить вместе с его записью в `meta/_journal.json`, если генератор его всё же создал.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/drizzle
git commit -m "Применить таблицы платформ миграцией"
```

---

## Chunk 3: API — платформы проекта

### Task 3.1: Репозиторий платформ

**Files:**
- Create: `apps/api/src/platforms/platforms.repository.ts`
- Create: `apps/api/src/platforms/platforms.repository.test.ts`

- [ ] **Step 1: Падающие тесты**

Образец для интеграционного теста — `apps/api/src/roadmap/roadmap.repository.test.ts`: та же обвязка Testcontainers, те же вспомогательные функции заведения проекта и выдачи.

```ts
describe('PlatformsRepository', () => {
  it('скрывает платформы от субъекта без доступа к «Инфо»', async () => {
    // Отсутствие доступа — 404, а не 403: ответ 403 сообщил бы, что
    // проект существует (ТЗ 4.2).
    await expect(repository.findForProject(stranger, projectId)).rejects.toThrow(
      SectionNotVisibleError,
    );
  });

  it('отдаёт платформы по порядку на уровне метаданных', async () => {
    const platforms = await repository.findForProject(metadataSubject, projectId);

    expect(platforms.map((platform) => platform.name)).toEqual(['API', 'Веб']);
    expect(platforms.map((platform) => platform.position)).toEqual([1, 2]);
  });

  it('отказывает повторному имени внятно', async () => {
    await expect(
      db.transaction((tx) =>
        repository.create(writer, tx, projectId, { kind: PlatformKind.Server, name: 'API' }),
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('удаление платформы снимает выпуски, теги и связи', async () => {
    // На всех ссылках `restrict`: без явной уборки удаление упёрлось бы
    // в ссылочную целостность и ответило 500 вместо того, чтобы сработать.
    await db.transaction((tx) => repository.remove(writer, tx, projectId, platformId));

    expect(await rowsOf(versionPlatformReleases)).toHaveLength(0);
    expect(await rowsOf(checkpointPlatforms)).toHaveLength(0);
    expect(await rowsOf(environmentPlatforms)).toHaveLength(0);
  });

  it('не ставит магазин в окружение', async () => {
    await expect(
      db.transaction((tx) => repository.setEnvironmentPlatforms(tx, environmentId, [storeId])),
    ).rejects.toThrow(ConflictException);
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/api && npx vitest run src/platforms/platforms.repository.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализация**

`apps/api/src/platforms/platforms.repository.ts`. Устройство — как у `RoadmapRepository`: конструктор берёт `DATABASE` и `AccessService`, каждый метод с субъектом сам проверяет уровень тем же исполнителем, которым работает.

Методы:

| Метод | Право | Что делает |
|---|---|---|
| `findForProject(subject, projectId)` | «Инфо», метаданные | платформы по `position`, затем `createdAt` |
| `create(subject, tx, projectId, input)` | «Инфо», запись | повторное имя → `ConflictException`; `position` = максимум + 1 |
| `createMany(tx, projectId, inputs)` | — | для создания проекта: право уже проверено созданием проекта, которого до него не существовало |
| `update(subject, tx, projectId, platformId, input)` | «Инфо», запись | повторное имя → `ConflictException` |
| `remove(subject, tx, projectId, platformId)` | «Инфо», запись | уборка выпусков, тегов, связей, затем платформа |
| `setEnvironmentPlatforms(tx, environmentId, platformIds)` | — | вызывается из репозитория окружений, который уже проверил «Инфраструктуру» |
| `requireInProject(executor, projectId, platformId)` | — | платформа чужого проекта → `SectionNotVisibleError` |

Ключевые решения в коде:

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

    const chosen = platformIds.length
      ? await tx
          .select()
          .from(projectPlatforms)
          .where(
            and(
              eq(projectPlatforms.projectId, environment.projectId),
              inArray(projectPlatforms.id, platformIds),
            ),
          )
      : [];

    // Платформа чужого проекта не найдётся — и это 404 по месту вызова,
    // а не 400: иначе ответ подтвердил бы, что она где-то существует.
    if (chosen.length !== platformIds.length) {
      throw new SectionNotVisibleError();
    }

    const foreign = chosen.find((platform) => platform.kind !== PlatformKind.Server);

    if (foreign) {
      throw new ConflictException(
        `Платформа «${foreign.name}» не живёт в окружении: у магазина нет ни машины, ни адреса.`,
      );
    }

    await tx
      .delete(environmentPlatforms)
      .where(eq(environmentPlatforms.environmentId, environmentId));

    if (platformIds.length) {
      await tx
        .insert(environmentPlatforms)
        .values(platformIds.map((platformId) => ({ environmentId, platformId })));
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

### Task 3.2: Служба, журнал и ручки

**Files:**
- Create: `apps/api/src/platforms/platforms.service.ts`
- Create: `apps/api/src/platforms/platforms.controller.ts`
- Create: `apps/api/src/platforms/platforms.module.ts`
- Modify: `apps/api/src/audit/audit.types.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/app.module.test.ts`

- [ ] **Step 1: Падающий тест**

В `app.module.test.ts` — к существующему набору, проверяющему состав модулей:

```ts
it('подключает модуль платформ', () => {
  expect(modulesOf(AppModule)).toContain(PlatformsModule);
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `cd apps/api && npx vitest run src/app.module.test.ts`
Expected: FAIL — `PlatformsModule` не существует.

- [ ] **Step 3: Реализация**

В `audit.types.ts`, в `AuditAction`, после `ProjectUpdated`:

```ts
  PlatformCreated = 'platform.created',
  PlatformUpdated = 'platform.updated',
  PlatformDeleted = 'platform.deleted',
  PlatformReleaseSet = 'platform_release.set',
  PlatformReleaseCleared = 'platform_release.cleared',
```

`platforms.service.ts` — по образцу `RoadmapService`: транзакция, вызов репозитория, запись в журнал. В метаданных — `name` платформы, у удаления тоже (после удаления имя взять уже негде).

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

  @Post()
  async create(/* ZodValidationPipe(platformCreateSchema) */): Promise<Platform> {}

  @Patch(':platformId')
  async update(/* ZodValidationPipe(platformUpdateSchema) */): Promise<Platform> {}

  @Delete(':platformId')
  @HttpCode(204)
  async remove(): Promise<void> {}
}
```

Проекция строки в `Platform` — явным объектом (`id`, `kind`, `name`, `position`), а не разворотом строки: иначе наружу уйдут `projectId` и отметки времени.

`platforms.module.ts` экспортирует `PlatformsRepository` — он понадобится модулю окружений.

В `app.module.ts` добавить `PlatformsModule` в `imports`.

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/app.module.test.ts src/platforms`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src
git commit -m "Открыть ручки платформ и писать их в журнал"
```

### Task 3.3: Платформы при создании проекта

**Files:**
- Modify: `apps/api/src/projects/projects.repository.ts`
- Modify: `apps/api/src/projects/projects.service.ts`
- Modify: `apps/api/src/projects/projects.repository.test.ts`
- Modify: `apps/api/src/projects/projects.module.ts`

- [ ] **Step 1: Падающий тест**

```ts
it('создаёт проект вместе с платформами', async () => {
  const created = await db.transaction((tx) =>
    repository.create(superadmin, tx, {
      name: 'Касса',
      platforms: [
        { kind: PlatformKind.Server, name: 'API' },
        { kind: PlatformKind.Store, name: 'App Store' },
      ],
    }),
  );

  const platforms = await platformsRepository.findForProject(superadmin, created.id);

  expect(platforms.map((platform) => platform.name)).toEqual(['API', 'App Store']);
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `cd apps/api && npx vitest run src/projects/projects.repository.test.ts`
Expected: FAIL — платформы не созданы. Возможен и падёж вставки: `platforms` уйдёт в `values()` как несуществующая колонка.

- [ ] **Step 3: Реализация**

В `projects.repository.ts`, в `create`, отделить платформы от полей проекта — **обязательно**, иначе Drizzle получит несуществующую колонку:

```ts
    const { platforms: _platforms, ...fields } = input;
    const slug = await this.findFreeSlug(tx, generateSlug(fields.name));

    const [created] = await tx
      .insert(projects)
      .values({ ...fields, slug })
      .returning();
```

Сами платформы заводит служба — после проекта, в той же транзакции, через `PlatformsRepository.createMany`; её же журнал пишет отдельной записью на каждую платформу. Право не перепроверяется: проект только что создан суперадмином, и выдачи на него ещё не существует.

`ProjectsModule` импортирует `PlatformsModule`.

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/projects`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/projects
git commit -m "Заводить платформы вместе с проектом"
```

### Task 3.4: Платформы окружения

**Files:**
- Modify: `apps/api/src/environments/environments.repository.ts`
- Modify: `apps/api/src/environments/environment.projection.ts`
- Modify: `apps/api/src/environments/environments.repository.test.ts`
- Modify: `apps/api/src/environments/environments.module.ts`

- [ ] **Step 1: Падающие тесты**

```ts
it('отдаёт в окружении то, что в нём развёрнуто', async () => {
  await db.transaction((tx) =>
    repository.update(writer, tx, projectId, environmentId, { platformIds: [apiId, webId] }),
  );

  const [environment] = await repository.findForProject(reader, projectId);

  expect(environment.platforms.map((platform) => platform.name)).toEqual(['API', 'Веб']);
});

it('удаление окружения снимает его связи с платформами', async () => {
  await db.transaction((tx) => repository.remove(writer, tx, projectId, environmentId));

  expect(await rowsOf(environmentPlatforms)).toHaveLength(0);
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/api && npx vitest run src/environments/environments.repository.test.ts`
Expected: FAIL — `platforms` в окружении нет; удаление падает на ссылочной целостности.

- [ ] **Step 3: Реализация**

- `update` и `create`: если `platformIds` присланы — вызвать
  `PlatformsRepository.setEnvironmentPlatforms` тем же `tx`; поле не должно
  попасть в `values()`/`set()` окружения (отделить, как `platforms` у проекта);
- `remove`: перед удалением окружения снять строки `environmentPlatforms`;
- `findForProject` и `findById`: подгрузить платформы окружений одним запросом
  (`inArray` по идентификаторам окружений, как уже сделано с доменами)
  и передать в проекцию;
- `environment.projection.ts`: `platforms` появляется только на уровне чтения,
  рядом с `server` — на уровне метаданных у окружения есть лишь имя, вид
  и адреса.

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/environments`
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

Чистая функция без базы: правило сводки проверяется таблицей случаев, а не поднятым PostgreSQL.

- [ ] **Step 1: Падающие тесты**

```ts
import { PlatformKind, PlatformReleaseState } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { releaseSummaryOf } from './release.summary';

const API = { id: 'p1', kind: PlatformKind.Server, name: 'API', position: 1 };
const STORE = { id: 'p2', kind: PlatformKind.Store, name: 'App Store', position: 2 };

const V1 = { id: 'v1', label: 'v1.2', position: 1 };
const V2 = { id: 'v2', label: 'v1.3', position: 2 };

describe('releaseSummaryOf', () => {
  it('строка есть у каждой платформы, даже без релизов', () => {
    const summary = releaseSummaryOf([API, STORE], [V1], []);

    expect(summary).toHaveLength(2);
    expect(summary[0]?.released).toBeNull();
    expect(summary[0]?.pending).toEqual([]);
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

  it('показывает модерацию и тест после текущего релиза', () => {
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
      [{ ...release(V1, STORE, PlatformReleaseState.Released, '2026-03-14'), buildLabel: '1.2 (45)' }],
    );

    expect(row?.released?.buildLabel).toBe('1.2 (45)');
  });
});
```

Вспомогательная `release(version, platform, state, date)` собирает строку выпуска с `buildLabel: null`.

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
 */
export function releaseSummaryOf(
  platforms: SummaryPlatform[],
  versions: SummaryVersion[],
  releases: SummaryRelease[],
): ReleaseSummaryRow[]
```

Правило:

1. версии разложить в `Map` по идентификатору — из неё берутся `label`
   и `position`;
2. выпуски сгруппировать по платформе;
3. в каждой группе найти выпущенный выпуск с наибольшей `position` — это
   `released`;
4. `pending` — выпуски в состояниях, отличных от `Released`, у версий с
   `position` больше, чем у найденной (нет `released` — все), по возрастанию
   `position`;
5. строки сводки — по порядку `position` платформ; платформа без выпусков
   даёт `{ released: null, pending: [] }`.

Выпуск, ссылающийся на неизвестную версию, пропускается молча: такого быть не может, пока выпуски удаляются вместе с версией, а падать на этом в сводке — хуже, чем не показать строку.

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/roadmap/release.summary.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/roadmap
git commit -m "Вычислять сводку релизов по выпускам"
```

### Task 4.2: Выпуски и теги в проекции версии

**Files:**
- Modify: `apps/api/src/roadmap/roadmap.projection.ts`
- Modify: `apps/api/src/roadmap/roadmap.projection.test.ts`

- [ ] **Step 1: Падающие тесты**

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

it('без выпущенных выпусков дата остаётся хранимой', () => {
  const projected = versionProjection(
    { ...version, releasedDate: '2026-01-01' },
    [],
    [{ platformId: 'p1', state: PlatformReleaseState.OnTest, releasedDate: null, buildLabel: null }],
    AccessLevel.Read,
  );

  expect(projected.releasedDate).toBe('2026-01-01');
});

it('выпуски и теги открываются уровнем чтения', () => {
  const metadata = versionProjection(version, checkpoints, releases, AccessLevel.Metadata);
  const read = versionProjection(version, checkpoints, releases, AccessLevel.Read);

  expect('releases' in metadata).toBe(false);
  expect(read.releases).toHaveLength(1);
  expect(read.checkpoints[0]?.platformIds).toEqual(['p1']);
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/api && npx vitest run src/roadmap/roadmap.projection.test.ts`
Expected: FAIL — у `versionProjection` нет третьего параметра.

- [ ] **Step 3: Реализация**

`versionProjection` получает выпуски и теги:

```ts
export function versionProjection(
  version: RoadmapVersionRow,
  checkpoints: RoadmapCheckpointRow[],
  releases: PlatformRelease[],
  level: AccessLevel,
  platformsByCheckpoint: Map<string, string[]> = new Map(),
  withLinks = true,
): RoadmapVersionMetadata | RoadmapVersionDetail
```

Фактическая дата — отдельной чистой функцией в том же файле:

```ts
/**
 * Фактическая дата версии: самая поздняя дата выпущенных выпусков, иначе
 * хранимая.
 *
 * Выпуски точнее: у версии одна дата, а платформы выходят вразнобой.
 * Хранимая колонка остаётся ответом, пока выпусков нет, — иначе дата
 * проектов без платформ исчезла бы вместе с полем формы.
 */
function releasedDateOf(version: RoadmapVersionRow, releases: PlatformRelease[]): string | null {
  const dates = releases
    .filter((release) => release.state === PlatformReleaseState.Released)
    .map((release) => release.releasedDate);

  if (dates.length === 0) {
    return version.releasedDate;
  }

  return dates.filter((date): date is string => date !== null).sort().at(-1) ?? null;
}
```

Теги в чекпоинте — `platformIds: platformsByCheckpoint.get(checkpoint.id) ?? []`, рядом с `url`. Поле добавляется всегда, в отличие от `url`: публичная схема его ждёт.

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/roadmap`
Expected: PASS после правки вызовов в репозитории (следующая задача ещё не написана — на этом шаге допустимо передавать `[]`).

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/roadmap
git commit -m "Показывать в версии её выпуски и теги чекпоинтов"
```

### Task 4.3: Чтение роадмапа с выпусками и сводкой

**Files:**
- Modify: `apps/api/src/roadmap/roadmap.repository.ts`
- Modify: `apps/api/src/roadmap/roadmap.repository.test.ts`

- [ ] **Step 1: Падающие тесты**

```ts
it('отдаёт сводку рядом с версиями', async () => {
  const roadmap = await repository.findForProject(reader, projectId);

  expect(roadmap.summary.map((row) => row.platform.name)).toEqual(['API', 'App Store']);
});

it('отдаёт сводку и в публичной выдаче, без ссылок на задачи', async () => {
  const roadmap = await repository.publicRoadmap(token);

  expect(roadmap?.summary).toHaveLength(2);
  expect(roadmap?.versions[0]?.checkpoints[0]).not.toHaveProperty('url');
});

it('показывает сводку тому, у кого нет доступа к «Инфо»', async () => {
  // Платформы — поле паспорта, но их имена раскрываются в той секции,
  // где упомянуты: тот же приём, что у имени окружения в переменных.
  const roadmap = await repository.findForProject(roadmapOnlySubject, projectId);

  expect(roadmap.summary).toHaveLength(2);
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
    // нет. Право на эти данные даёт сама секция «Роадмап».
    const platforms = await executor
      .select()
      .from(projectPlatforms)
      .where(eq(projectPlatforms.projectId, projectId))
      .orderBy(asc(projectPlatforms.position), asc(projectPlatforms.createdAt));
```

`findForProject` и `publicRoadmap` возвращают `summary: releaseSummaryOf(...)`. Проекции версий передаются выпуски этой версии и карта тегов.

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
  await db.transaction((tx) =>
    repository.setRelease(writer, tx, projectId, versionId, apiId, {
      state: PlatformReleaseState.OnTest,
    }),
  );
  await db.transaction((tx) =>
    repository.setRelease(writer, tx, projectId, versionId, apiId, {
      state: PlatformReleaseState.Released,
      releasedDate: '2026-03-12',
    }),
  );

  const releases = await rowsOf(versionPlatformReleases);

  expect(releases).toHaveLength(1);
  expect(releases[0]?.state).toBe(PlatformReleaseState.Released);
});

it('не ставит модерацию серверной платформе', async () => {
  await expect(
    db.transaction((tx) =>
      repository.setRelease(writer, tx, projectId, versionId, apiId, {
        state: PlatformReleaseState.InReview,
      }),
    ),
  ).rejects.toThrow(ConflictException);
});

it('не видит платформу чужого проекта', async () => {
  await expect(
    db.transaction((tx) =>
      repository.setRelease(writer, tx, projectId, versionId, foreignPlatformId, {
        state: PlatformReleaseState.OnTest,
      }),
    ),
  ).rejects.toThrow(SectionNotVisibleError);
});

it('снятие возвращает платформу «как у версии»', async () => {
  await db.transaction((tx) =>
    repository.clearRelease(writer, tx, projectId, versionId, apiId),
  );

  expect(await rowsOf(versionPlatformReleases)).toHaveLength(0);
});

it('снятие того, чего нет, — не ошибка', async () => {
  // Ручка идемпотентна: «как у версии» и до, и после вызова.
  await expect(
    db.transaction((tx) => repository.clearRelease(writer, tx, projectId, versionId, apiId)),
  ).resolves.toBeUndefined();
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
   * Допустимость состояния определяется видом платформы — `releaseStatesFor`
   * из контракта, тот же список, по которому интерфейс рисует выбор.
   */
  async setRelease(
    subject: RequestSubject,
    tx: Transaction,
    projectId: string,
    versionId: string,
    platformId: string,
    input: PlatformReleaseSet,
  ): Promise<PlatformReleaseRow>
```

Порядок внутри: `requireLevel(Роадмап, Write)` → `requireVersion` → платформа того же проекта (иначе `SectionNotVisibleError`) → проверка состояния по виду (иначе `ConflictException` с текстом «Модерации у платформы «API» не бывает: она живёт на нашей машине») → `insert ... onConflictDoUpdate` по паре.

`clearRelease` — те же проверки и `delete`; отсутствие строки ошибкой не считается.

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
it('ставит теги при создании чекпоинта и заменяет при правке', async () => {
  const created = await db.transaction((tx) =>
    repository.createCheckpoint(writer, tx, projectId, versionId, {
      title: 'Вход по телефону',
      platformIds: [iosId, androidId],
    }),
  );

  await db.transaction((tx) =>
    repository.updateCheckpoint(writer, tx, projectId, versionId, created.id, {
      platformIds: [iosId],
    }),
  );

  const roadmap = await repository.findForProject(reader, projectId);

  expect(roadmap.versions[0]?.checkpoints[0]?.platformIds).toEqual([iosId]);
});

it('пустой набор тегов снимает все', async () => {
  await db.transaction((tx) =>
    repository.updateCheckpoint(writer, tx, projectId, versionId, checkpointId, {
      platformIds: [],
    }),
  );

  expect(await rowsOf(checkpointPlatforms)).toHaveLength(0);
});

it('удаление версии уносит выпуски и теги её чекпоинтов', async () => {
  await db.transaction((tx) => repository.removeVersion(writer, tx, projectId, versionId));

  expect(await rowsOf(versionPlatformReleases)).toHaveLength(0);
  expect(await rowsOf(checkpointPlatforms)).toHaveLength(0);
});

it('удаление чекпоинта уносит его теги', async () => {
  await db.transaction((tx) =>
    repository.removeCheckpoint(writer, tx, projectId, versionId, checkpointId),
  );

  expect(await rowsOf(checkpointPlatforms)).toHaveLength(0);
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/api && npx vitest run src/roadmap/roadmap.repository.test.ts`
Expected: FAIL — теги не записываются; удаление падает на ссылочной целостности.

- [ ] **Step 3: Реализация**

- `createCheckpoint` и `updateCheckpoint`: отделить `platformIds` от полей
  чекпоинта (в `values()`/`set()` они попасть не должны), присланный набор
  заменить целиком — `delete` по чекпоинту, затем `insert`. Платформы
  обязаны принадлежать тому же проекту, иначе `SectionNotVisibleError`;
- `removeVersion`: перед удалением чекпоинтов снять их теги, затем выпуски
  версии, затем чекпоинты и версию — порядок важен, он обратный ссылкам;
- `removeCheckpoint`: снять теги, затем чекпоинт.

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/roadmap`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/roadmap
git commit -m "Помечать чекпоинты платформами и убирать за удалением"
```

### Task 4.6: Ручки выпуска и журнал

**Files:**
- Modify: `apps/api/src/roadmap/roadmap.service.ts`
- Modify: `apps/api/src/roadmap/roadmap.controller.ts`
- Modify: `apps/api/src/roadmap/roadmap.service.test.ts`

- [ ] **Step 1: Падающий тест**

```ts
it('пишет постановку выпуска в журнал', async () => {
  await service.setRelease(subject, projectId, versionId, platformId, {
    state: PlatformReleaseState.InReview,
  });

  expect(audit.record).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    expect.objectContaining({
      action: AuditAction.PlatformReleaseSet,
      entityType: 'platform_release',
      metadata: expect.objectContaining({ state: PlatformReleaseState.InReview }),
    }),
  );
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `cd apps/api && npx vitest run src/roadmap/roadmap.service.test.ts`
Expected: FAIL — метода нет.

- [ ] **Step 3: Реализация**

В службу — `setRelease` и `clearRelease` по образцу остальных: транзакция, репозиторий, журнал (`PlatformReleaseSet` / `PlatformReleaseCleared`, в метаданных обозначение версии, имя платформы и состояние).

В контроллер:

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

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src && pnpm typecheck`
Expected: тесты API зелёные; `typecheck` ещё красный в вебе — это Chunk 5 и 6.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/roadmap
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

```ts
it('половинная ширина не сжимает панель на телефоне', () => {
  // `max-w-[50vw]` без условия отдал бы форме половину телефона.
  render(
    <Drawer isOpen onClose={() => {}} title="Новый проект" width={DrawerWidth.Half}>
      поле
    </Drawer>,
  );

  expect(screen.getByRole('dialog').className).toContain('md:max-w-[50vw]');
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
  // Ограничение только с `md`: на телефоне половина экрана — это половина
  // телефона, и форма в неё не влезает.
  [DrawerWidth.Half]: 'md:max-w-[50vw]',
```

- [ ] **Step 4: Запустить**

Run: `cd apps/web && npx vitest run src/components/Drawer`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/Drawer
git commit -m "Дать панели ширину в половину экрана"
```

### Task 5.2: Хуки платформ и выпусков

**Files:**
- Create: `apps/web/src/api/hooks/usePlatforms.ts`
- Create: `apps/web/src/api/hooks/usePlatforms.test.tsx`
- Create: `apps/web/src/api/hooks/useMutationRelease.ts`
- Modify: `apps/web/src/api/hooks/index.ts`

- [ ] **Step 1: Падающий тест**

Образец обвязки — `apps/web/src/api/hooks/useMutationRoadmap.test.tsx`.

```ts
it('после заведения платформы обновляет и список, и роадмап', async () => {
  // Сводка релизов живёт в ответе роадмапа: без её сброса новая
  // платформа не появилась бы в сводке до перезагрузки страницы.
  const { result } = renderHook(() => useMutationCreatePlatform('p1'), { wrapper });

  result.current.mutate({ kind: PlatformKind.Server, name: 'API' });

  await waitFor(() => expect(invalidated).toContain('platforms'));
  expect(invalidated).toContain('roadmap');
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `cd apps/web && npx vitest run src/api/hooks/usePlatforms.test.tsx`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализация**

`usePlatforms.ts`: ключи `PLATFORM_KEYS.forProject`, запрос `useQueryPlatforms(projectId, { enabled })` и мутации `useMutationCreatePlatform`, `useMutationUpdatePlatform`, `useMutationDeletePlatform`. Общая функция инвалидации сбрасывает **оба** ключа — платформ и роадмапа (в роадмапе живёт сводка).

`useMutationRelease.ts`: `useMutationSetRelease(projectId)` и `useMutationClearRelease(projectId)`, оба сбрасывают ключ роадмапа. Параметры мутации — `{ versionId, platformId, input }`.

Оба файла дописать в `index.ts` по алфавиту.

- [ ] **Step 4: Запустить**

Run: `cd apps/web && npx vitest run src/api/hooks`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/api/hooks
git commit -m "Завести хуки платформ и выпусков"
```

### Task 5.3: Поле платформ в форме проекта

**Files:**
- Create: `apps/web/src/components/ProjectForm/PlatformsField.tsx`
- Create: `apps/web/src/components/ProjectForm/PlatformChip.tsx`
- Create: `apps/web/src/components/ProjectForm/PlatformSuggestions.tsx`
- Create: `apps/web/src/components/ProjectForm/CustomPlatformForm.tsx`
- Create: `apps/web/src/components/ProjectForm/PlatformsField.test.tsx`
- Modify: `apps/web/src/components/ProjectForm/constants.ts`
- Modify: `apps/web/src/components/ProjectForm/types.ts`
- Modify: `apps/web/src/components/ProjectForm/ProjectForm.tsx`
- Modify: `apps/web/src/components/ProjectForm/ProjectForm.test.tsx`

Образец устройства — `DomainsField`: само поле, список выбранного, список подсказок, каждый файл до сотни строк.

- [ ] **Step 1: Падающие тесты**

```ts
describe('PlatformsField', () => {
  it('подсказка превращается в платформу и исчезает из подсказок', async () => {
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

  it('снимает платформу', async () => {
    const onRemove = vi.fn();

    render(
      <PlatformsField
        platforms={[{ kind: PlatformKind.Store, name: 'RuStore' }]}
        onAdd={vi.fn()}
        onRemove={onRemove}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Убрать RuStore' }));

    expect(onRemove).toHaveBeenCalledWith('RuStore');
  });
});
```

В `ProjectForm.test.tsx`:

```ts
it('отправляет платформы вместе с новым проектом', async () => {
  const onSubmit = vi.fn();

  render(<ProjectForm initial={EMPTY} onSubmit={onSubmit} />);

  await userEvent.type(screen.getByLabelText('Название'), 'Касса');
  await userEvent.click(screen.getByRole('button', { name: '+ API' }));
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ platforms: [{ kind: PlatformKind.Server, name: 'API' }] }),
  );
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/web && npx vitest run src/components/ProjectForm`
Expected: FAIL — компонента нет.

- [ ] **Step 3: Реализация**

В `constants.ts`:

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

/** Подписи видов платформы. */
export const PLATFORM_KIND_LABELS: Record<PlatformKind, string> = {
  [PlatformKind.Server]: 'На наших машинах',
  [PlatformKind.Store]: 'Магазин',
  [PlatformKind.Other]: 'Другое',
};
```

`PlatformsField` принимает:

```ts
/** Пропсы поля платформ. */
export interface IProps {
  /** Заведённые платформы: с идентификатором при правке, без — при создании. */
  platforms: (PlatformCreate & { id?: string })[];
  onAdd: (input: PlatformCreate) => void;
  /** Снятие по имени: оно уникально в проекте, и идентификатора при создании ещё нет. */
  onRemove: (name: string) => void;
}
```

Что делают `onAdd` и `onRemove`, решает родитель: при создании они меняют состояние формы, при правке вызывают мутации сразу — по образцу галочек чекпоинтов, которые тоже переключаются без кнопки «сохранить».

`ProjectForm` держит платформы в своих значениях (`ProjectFormValues.platforms`) и отправляет их в `onSubmit` — но только если родитель не передал `platformActions`. Проще и честнее: форма получает необязательный проп `platformActions?: { onAdd, onRemove }`; передан — поле работает через него и в `onSubmit` платформы не уходят, не передан — поле работает по состоянию формы и платформы уходят с отправкой.

- [ ] **Step 4: Запустить**

Run: `cd apps/web && npx vitest run src/components/ProjectForm`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/ProjectForm
git commit -m "Собирать платформы прямо в форме проекта"
```

### Task 5.4: Создание проекта в панели

**Files:**
- Create: `apps/web/src/app/(app)/CreateProjectPanel.tsx`
- Create: `apps/web/src/app/(app)/CreateProjectPanel.test.tsx`
- Modify: `apps/web/src/components/ProjectList/ProjectList.tsx`
- Modify: `apps/web/src/components/ProjectList/types.ts`
- Modify: `apps/web/src/components/ProjectList/ProjectList.test.tsx`
- Modify: `apps/web/src/app/(app)/page.tsx`
- Delete: `apps/web/src/app/(app)/projects/new/`

- [ ] **Step 1: Падающий тест**

```ts
it('открывает панель создания и закрывает по Esc', async () => {
  render(<CreateProjectPanel />, { wrapper });

  await userEvent.click(screen.getByRole('button', { name: 'Создать проект' }));

  expect(screen.getByRole('dialog', { name: 'Новый проект' })).toBeInTheDocument();

  await userEvent.keyboard('{Escape}');

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `cd apps/web && npx vitest run "src/app/(app)/CreateProjectPanel.test.tsx"`
Expected: FAIL — компонента нет.

- [ ] **Step 3: Реализация**

`CreateProjectPanel` — клиентский островок: кнопка «Создать проект», `Drawer` шириной `DrawerWidth.Half`, внутри `ProjectForm`. Мутация — `useMutationCreateProject`; после успеха `router.push('/projects/<id>')` и `router.refresh()`, как сейчас в `NewProjectScreen`.

`ProjectList` вместо собственной ссылки получает слот:

```ts
  /**
   * Орган создания проекта. Слот, а не флаг: кнопка открывает панель,
   * и список из-за этого не обязан становиться клиентским.
   */
  createSlot?: ReactNode;
```

`CreateLink` и проп `canCreate` удаляются; пустой список показывает слот, если он передан, и прежнюю подсказку, если нет. `page.tsx` передаёт `createSlot={subject.isSuperadmin ? <CreateProjectPanel /> : undefined}`.

Каталог `projects/new` удалить целиком.

- [ ] **Step 4: Запустить**

Run: `cd apps/web && npx vitest run src/components/ProjectList "src/app/(app)"`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add -A apps/web/src
git commit -m "Создавать проект в выезжающей панели"
```

### Task 5.5: Правка проекта в панели

**Files:**
- Create: `apps/web/src/app/(app)/projects/[id]/EditProjectPanel.tsx`
- Create: `apps/web/src/app/(app)/projects/[id]/EditProjectPanel.test.tsx`
- Modify: `apps/web/src/app/(app)/projects/[id]/page.tsx`
- Modify: `apps/web/src/components/ProjectSections/ProjectSections.tsx`
- Modify: `apps/web/src/components/ProjectSections/types.ts`
- Modify: `apps/web/src/components/ProjectSections/ProjectSections.test.tsx`
- Delete: `apps/web/src/app/(app)/projects/[id]/edit/`

- [ ] **Step 1: Падающие тесты**

```ts
it('правит платформы сразу, без отправки формы', async () => {
  // Чип действует мутацией, как галочка чекпоинта: отправлять паспорт
  // целиком ради одной платформы незачем, и чужую правку это не затрёт.
  render(<EditProjectPanel projectId="p1" initial={INITIAL} />, { wrapper });

  await userEvent.click(screen.getByRole('button', { name: 'Править' }));
  await userEvent.click(screen.getByRole('button', { name: '+ Веб' }));

  expect(createPlatform).toHaveBeenCalledWith({ kind: PlatformKind.Server, name: 'Веб' });
});

it('не показывает кнопку правки без уровня записи', () => {
  sections.mockReturnValue(query({ [Section.Info]: AccessLevel.Read }));

  render(<EditProjectPanel projectId="p1" initial={INITIAL} />, { wrapper });

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

Run: `cd apps/web && npx vitest run "src/app/(app)/projects" src/components/ProjectSections`
Expected: FAIL — компонента нет, проп не принимается.

- [ ] **Step 3: Реализация**

`EditProjectPanel` — клиентский островок: `useQuerySections(projectId)` решает, показывать ли кнопку «Править» (нужен `AccessLevel.Write` в `Section.Info`); `Drawer` шириной `Half`; внутри `ProjectForm` с `platformActions`, собранными из мутаций платформ. Платформы берутся `useQueryPlatforms(projectId)`.

`page.tsx` запрашивает платформы рядом с проектом (`apiServer<Platform[]>` с `.catch(() => [])` — уровень метаданных их не отдаст, и это не повод валить страницу), передаёт в `ProjectSections` и рендерит `EditProjectPanel` с начальными значениями, когда пришла полная проекция.

`ProjectSections` получает необязательный `platforms` и показывает их чипами в паспорте.

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

### Task 6.1: Окружение в панели, платформы галочками

**Files:**
- Create: `apps/web/src/components/EnvironmentForm/PlatformsCheckboxes.tsx`
- Modify: `apps/web/src/components/EnvironmentForm/EnvironmentForm.tsx`
- Modify: `apps/web/src/components/EnvironmentForm/types.ts`
- Modify: `apps/web/src/components/EnvironmentForm/constants.ts`
- Modify: `apps/web/src/components/EnvironmentForm/EnvironmentForm.test.tsx`
- Modify: `apps/web/src/app/(app)/projects/[id]/infrastructure/InfrastructureScreen.tsx`
- Modify: `apps/web/src/components/EnvironmentCard/EnvironmentCard.tsx`

- [ ] **Step 1: Падающие тесты**

```ts
it('предлагает галочками только платформы наших машин', () => {
  render(
    <EnvironmentForm
      initial={EMPTY}
      onSubmit={vi.fn()}
      platforms={[
        { id: 'p1', kind: PlatformKind.Server, name: 'API' },
        { id: 'p2', kind: PlatformKind.Store, name: 'App Store' },
      ]}
    />,
  );

  // У магазина нет ни машины, ни адреса: ставить его в окружение нечем.
  expect(screen.getByLabelText('API')).toBeInTheDocument();
  expect(screen.queryByLabelText('App Store')).not.toBeInTheDocument();
});

it('без платформ группы не показывает', () => {
  render(<EnvironmentForm initial={EMPTY} onSubmit={vi.fn()} />);

  expect(screen.queryByText('Что здесь развёрнуто')).not.toBeInTheDocument();
});

it('отправляет отмеченные платформы', async () => {
  const onSubmit = vi.fn();

  render(<EnvironmentForm initial={EMPTY} onSubmit={onSubmit} platforms={[API]} />);

  await userEvent.type(screen.getByLabelText('Название'), 'Прод');
  await userEvent.click(screen.getByLabelText('API'));
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ platformIds: ['p1'] }));
});
```

Для экрана:

```ts
it('открывает форму окружения в панели', async () => {
  render(<InfrastructureScreen projectId="p1" isSuperadmin={false} />);

  await userEvent.click(screen.getByRole('button', { name: 'Добавить окружение' }));

  expect(screen.getByRole('dialog', { name: 'Новое окружение' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/web && npx vitest run src/components/EnvironmentForm "src/app/(app)/projects/[id]/infrastructure"`
Expected: FAIL — пропа нет, формы в панели нет.

- [ ] **Step 3: Реализация**

- `PlatformsCheckboxes` — группа с заголовком «Что здесь развёрнуто»; из
  пришедших платформ оставляет только `PlatformKind.Server`; пусто —
  возвращает `null`;
- `EnvironmentFormValues` получает `platformIds: string[]`, `IProps` —
  необязательный `platforms?: PlatformRef[]`; `handleSubmit` отправляет
  `platformIds` только когда список платформ передан (иначе поле не
  показывалось, и отправлять пустой набор значило бы снять чужие галочки);
- `InfrastructureScreen` оборачивает форму в `Drawer` шириной `Half` с
  заголовком «Новое окружение» либо «Правка окружения»; закрытие панели
  сбрасывает `isCreating` и `editingId`. Платформы берутся
  `useQueryPlatforms(projectId)` — доступа к «Инфо» может не быть, и тогда
  группы просто нет;
- `EnvironmentCard` показывает развёрнутые платформы чипами.

- [ ] **Step 4: Запустить**

Run: `cd apps/web && npx vitest run src/components/EnvironmentForm src/components/EnvironmentCard "src/app/(app)/projects/[id]/infrastructure"`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src
git commit -m "Отмечать в окружении развёрнутые платформы"
```

### Task 6.2: Сводка релизов

**Files:**
- Create: `apps/web/src/components/ReleaseSummary/ReleaseSummary.tsx`
- Create: `apps/web/src/components/ReleaseSummary/SummaryRow.tsx`
- Create: `apps/web/src/components/ReleaseSummary/ReleaseBadge.tsx`
- Create: `apps/web/src/components/ReleaseSummary/constants.ts`
- Create: `apps/web/src/components/ReleaseSummary/types.ts`
- Create: `apps/web/src/components/ReleaseSummary/index.ts`
- Create: `apps/web/src/components/ReleaseSummary/ReleaseSummary.test.tsx`

- [ ] **Step 1: Падающие тесты**

```ts
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

Презентационный компонент, данные только пропами: тот же экземпляр работает на внутреннем экране (из кэша TanStack Query) и на публичной странице (пропом из RSC).

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
 * в теме нет, и заводить их ради плашек — отдельная работа.
 */
export const RELEASE_STATE_CLASSES: Record<PlatformReleaseState, string> = {
  [PlatformReleaseState.OnTest]: 'bg-muted text-muted-foreground',
  [PlatformReleaseState.InReview]: 'bg-amber-500/15 text-amber-500',
  [PlatformReleaseState.Released]: 'bg-green-500/15 text-green-500',
  [PlatformReleaseState.Rejected]: 'bg-red-500/15 text-red-500',
};
```

Дата — существующей утилитой `formatDate` из `@/utils`. Состояние читается подписью, а не только цветом.

- [ ] **Step 4: Запустить**

Run: `cd apps/web && npx vitest run src/components/ReleaseSummary`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/ReleaseSummary
git commit -m "Показать сводку релизов одной таблицей"
```

### Task 6.3: Сводка на экране и на публичной странице

**Files:**
- Modify: `apps/web/src/app/(app)/projects/[id]/roadmap/RoadmapScreen.tsx`
- Modify: `apps/web/src/app/(app)/projects/[id]/roadmap/RoadmapScreen.test.tsx`
- Modify: `apps/web/src/app/roadmap/[token]/PublicRoadmapView.tsx`
- Modify: `apps/web/src/app/roadmap/[token]/PublicRoadmapView.test.tsx`

- [ ] **Step 1: Падающие тесты**

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

  expect(screen.getByText(/Платформы задаются в паспорте проекта/)).toBeInTheDocument();
});
```

Для публичной страницы — сводка показана, адресов и здоровья нет:

```ts
it('показывает сводку без адресов', () => {
  render(<PublicRoadmapView roadmap={PUBLIC_ROADMAP} />);

  expect(screen.getByText('в релизе v1.2')).toBeInTheDocument();
  expect(screen.queryByText(/example\.com/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/web && npx vitest run "src/app/(app)/projects/[id]/roadmap" "src/app/roadmap"`
Expected: FAIL — сводки на экранах нет.

- [ ] **Step 3: Реализация**

`RoadmapScreen` рендерит `ReleaseSummary` первым блоком; подсказка о паспорте — только при пустой сводке и уровне записи. `PublicRoadmapView` — то же, из `roadmap.summary`, без подсказки: публичному читателю заводить платформы негде.

- [ ] **Step 4: Запустить**

Run: `cd apps/web && npx vitest run src/app`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/app
git commit -m "Поставить сводку релизов над диаграммой"
```

### Task 6.4: Выпуски в панели версии

**Files:**
- Create: `apps/web/src/components/VersionDrawer/ReleaseList.tsx`
- Create: `apps/web/src/components/VersionDrawer/ReleaseRow.tsx`
- Modify: `apps/web/src/components/VersionDrawer/VersionDrawer.tsx`
- Modify: `apps/web/src/components/VersionDrawer/types.ts`
- Modify: `apps/web/src/components/VersionDrawer/constants.ts`
- Modify: `apps/web/src/components/VersionDrawer/VersionDrawer.test.tsx`
- Modify: `apps/web/src/components/VersionForm/VersionForm.tsx`
- Modify: `apps/web/src/app/(app)/projects/[id]/roadmap/RoadmapVersionPanel.tsx`
- Modify: `apps/web/src/app/roadmap/[token]/PublicRoadmapView.tsx`

- [ ] **Step 1: Падающие тесты**

```ts
it('предлагает модерацию только магазину', async () => {
  render(<VersionDrawer version={VERSION} platforms={[API, STORE]} isCurrent isOpen onClose={vi.fn()} actions={ACTIONS} />);

  expect(optionsOf(screen.getByLabelText('Состояние API'))).toEqual([
    'как у версии',
    'на тесте',
    'в релизе',
  ]);
  expect(optionsOf(screen.getByLabelText('Состояние App Store'))).toContain('на модерации');
});

it('выбор состояния ставит выпуск сразу', async () => {
  render(<VersionDrawer version={VERSION} platforms={[STORE]} isCurrent isOpen onClose={vi.fn()} actions={ACTIONS} />);

  await userEvent.selectOptions(screen.getByLabelText('Состояние App Store'), 'in_review');

  expect(ACTIONS.onSetRelease).toHaveBeenCalledWith('p2', { state: 'in_review' });
});

it('«как у версии» снимает выпуск', async () => {
  render(<VersionDrawer version={VERSION_WITH_RELEASE} platforms={[STORE]} isCurrent isOpen onClose={vi.fn()} actions={ACTIONS} />);

  await userEvent.selectOptions(screen.getByLabelText('Состояние App Store'), '');

  expect(ACTIONS.onClearRelease).toHaveBeenCalledWith('p2');
});

it('без действий показывает выпуски без органов управления', () => {
  render(<VersionDrawer version={VERSION_WITH_RELEASE} platforms={[STORE]} isCurrent isOpen onClose={vi.fn()} />);

  expect(screen.getByText('в релизе')).toBeInTheDocument();
  expect(screen.queryByLabelText('Состояние App Store')).not.toBeInTheDocument();
});

it('не показывает поле даты релиза версии, когда есть платформы', () => {
  // Иначе вторая правда заводилась бы уже после того, как появилась первая.
  render(<VersionForm initial={INITIAL} onSubmit={vi.fn()} hasPlatforms />);

  expect(screen.queryByLabelText('Дата релиза')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/web && npx vitest run src/components/VersionDrawer src/components/VersionForm`
Expected: FAIL — пропа `platforms` нет.

- [ ] **Step 3: Реализация**

- `IProps` получает `platforms?: Platform[]`; `IVersionActions` — `onSetRelease(platformId, input)` и `onClearRelease(platformId)`;
- `ReleaseList` встаёт между паспортом версии и чекпоинтами; пусто — `null`;
- `ReleaseRow`: имя платформы, выбор состояния (`releaseStatesFor(platform.kind)` плюс пустое значение «как у версии»), поле даты при «в релизе» и необязательное поле обозначения сборки с `placeholder` из обозначения версии. Правка — сразу, без кнопки сохранения, как галочки чекпоинтов;
- без `actions` вместо выбора — подпись состояния и дата;
- `VersionForm` получает `hasPlatforms?: boolean` и при `true` не показывает поле даты релиза и не отправляет его;
- `RoadmapVersionPanel` собирает новые действия из `useMutationSetRelease` / `useMutationClearRelease` и передаёт платформы из `summary`;
- `PublicRoadmapView` передаёт платформы из `summary` без действий.

- [ ] **Step 4: Запустить**

Run: `cd apps/web && npx vitest run src/components/VersionDrawer src/components/VersionForm src/app`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src
git commit -m "Вести выпуски платформ в панели версии"
```

### Task 6.5: Теги платформ у чекпоинтов

**Files:**
- Modify: `apps/web/src/components/VersionDrawer/CheckpointItem.tsx`
- Modify: `apps/web/src/components/VersionDrawer/CheckpointList.tsx`
- Modify: `apps/web/src/components/VersionDrawer/CheckpointList.test.tsx`
- Modify: `apps/web/src/components/CheckpointForm/CheckpointForm.tsx`
- Modify: `apps/web/src/components/CheckpointForm/types.ts`
- Modify: `apps/web/src/components/CheckpointForm/CheckpointForm.test.tsx`
- Modify: `apps/web/src/components/VersionDrawer/VersionDrawer.tsx`

- [ ] **Step 1: Падающие тесты**

```ts
it('показывает теги платформ у чекпоинта', () => {
  render(
    <CheckpointList
      checkpoints={[{ ...CHECKPOINT, platformIds: ['p1'] }]}
      platforms={[API]}
      canWrite={false}
      onToggle={vi.fn()}
      onDelete={vi.fn()}
    />,
  );

  expect(screen.getByText('API')).toBeInTheDocument();
});

it('отправляет выбранные платформы с чекпоинтом', async () => {
  const onSubmit = vi.fn();

  render(<CheckpointForm onSubmit={onSubmit} platforms={[API, STORE]} />);

  await userEvent.type(screen.getByLabelText('Формулировка'), 'Вход по телефону');
  await userEvent.click(screen.getByLabelText('App Store'));
  await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));

  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ platformIds: ['p2'] }),
  );
});

it('без платформ проекта переключателей нет', () => {
  render(<CheckpointForm onSubmit={vi.fn()} />);

  expect(screen.queryByText('Платформы')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/web && npx vitest run src/components/VersionDrawer src/components/CheckpointForm`
Expected: FAIL — пропа нет.

- [ ] **Step 3: Реализация**

- `CheckpointList` и `CheckpointItem` получают `platforms?: Platform[]` и
  показывают теги маленькими чипами после формулировки; имена ищутся по
  `platformIds`, неизвестный идентификатор пропускается молча;
- `CheckpointForm` получает `platforms?: Platform[]`, держит выбранные в
  состоянии, отправляет `platformIds` только когда список платформ передан,
  и сбрасывает выбор вместе с полями после отправки;
- `VersionDrawer` передаёт платформы и в список, и в форму.

- [ ] **Step 4: Запустить**

Run: `cd apps/web && npx vitest run src && pnpm typecheck`
Expected: PASS и зелёный `typecheck` — к этому шагу контракт, API и веб сошлись.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src
git commit -m "Помечать чекпоинты платформами"
```

---

## Финальная проверка

- [ ] `pnpm test` — зелено во всех рабочих пространствах (интеграционные поднимают PostgreSQL через Testcontainers).
- [ ] `pnpm typecheck` — зелено.
- [ ] `pnpm build` — зелено.
- [ ] Руками на поднятом стеке (`docker compose up -d`, миграции применены):
  - [ ] проект создаётся в панели с платформами «API», «Веб», «App Store», выбранными из подсказок;
  - [ ] «Править» на карточке проекта открывает ту же форму в панели; снятие платформы действует сразу;
  - [ ] в окружении «Прод» отмечаются «API» и «Веб»; «App Store» в списке галочек не предлагается;
  - [ ] у версии v1.3 выставляются три разных состояния: API — «в релизе», Веб — «на тесте», App Store — «на модерации»;
  - [ ] сводка наверху роадмапа читается за две секунды и отвечает, что в релизе и что на проверке;
  - [ ] публичная ссылка роадмапа в приватном окне показывает ту же сводку и не показывает ни адресов, ни здоровья;
  - [ ] журнал действий содержит `platform.created` и `platform_release.set`.
- [ ] Удалённые страницы `/projects/new` и `/projects/[id]/edit` отвечают `404`, и ссылок на них в коде не осталось: `grep -rn "projects/new" apps/web/src` и `grep -rn "projects/\${.*}/edit\|projects/\[id\]/edit" apps/web/src` — пусто. Ссылки `/servers/<id>/edit` и `/domains/<id>/edit` остаются: их формы переезжают отдельной работой.
