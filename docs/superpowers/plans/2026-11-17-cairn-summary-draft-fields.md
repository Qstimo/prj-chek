# Ссылка и теги платформ в черновике задач саммари — план реализации

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** У задачи черновика саммари появляются ссылка на задачу во внешнем трекере и необязательные теги платформ — те же два поля, что у чекпоинта роадмапа, — человек заполняет их в редакторе одним проходом по списку, и релиз доставляет их в чекпоинты существующим путём записи.

**Architecture:** Четыре части по возрастанию связности. Сначала контракт: границы значений берутся из уже существующих схем чекпоинта, и ни одной новой проверки формата не заводится. Затем база и чтение: колонка `url`, таблица связи по образцу `checkpoint_platforms`, две миграции, узкая выборка платформ из роадмапа под его собственным гейтом и репозиторий саммари, который сохраняет новые поля по `id` и уносит теги в пяти местах уборки. Затем путь записи: одна строка в шаге релиза — `RoadmapRepository` оба поля принимает уже сегодня. Затем веб: строка редактора раскрывается на месте, чипы платформ переиспользуются из формы чекпоинта, валидность адреса держит форма. Напоследок документация и полная проверка.

**Tech Stack:** pnpm workspaces, NestJS, Drizzle + PostgreSQL, zod в `packages/shared`, Next.js 15, TanStack Query, Vitest + React Testing Library, Testcontainers.

**Основание:** `docs/superpowers/specs/2026-11-17-cairn-summary-draft-fields-design.md`

**Что этот план отменяет в прежнем:** раздел 2.1 действующего дизайна конструктора задач исключал оба поля из черновика, и план `2026-11-16-cairn-summary-task-constructor.md` закрепил это тестом схемы (`apps/api/src/db/schema/summaries.test.ts:92-102`). Отмена названа в разделе 1 нового дизайна: довод был про **модель**, а следствие ударило по **человеку** — он проходит список дважды. Инвариант «из вывода модели берётся только формулировка» при этом остаётся в силе и не правится ни на строку (Task 5, шаг «ничего не трогаем в порте»).

---

## Как работать с этим планом

TDD: сначала падающий тест, затем реализация. Линтера в проекте нет.

| Что | Команда |
|---|---|
| Все тесты | `pnpm test` |
| Точечно API | `cd apps/api && npx vitest run src/путь` |
| Точечно веб | `cd apps/web && npx vitest run src/путь` |
| Точечно контракт | `cd packages/shared && npx vitest run src/путь` |
| Типы | `pnpm typecheck` |
| Миграция по схеме | `cd apps/api && pnpm db:generate` |

**Осторожно с `pnpm --filter ... test -- --run <путь>`**: двойное `--` съедает фильтр, и запускается весь набор, включая Testcontainers. Точечно — через `npx vitest run` из каталога приложения.

Соглашения: компонент до 100 строк в своей директории с `index.ts`, пропсы — `IProps` в `types.ts`, TSDoc на русском, `any` запрещён, массивы и объекты из JSX — в `constants.ts`, значение, использованное дважды, — `enum`, а не union.

**Интеграционные тесты поднимают PostgreSQL через Testcontainers** — нужен работающий docker. Фикстура — `apps/api/test/db-fixture.ts`, привилегии в ней не выдаются намеренно: их выдаёт миграция, которую тест и проверяет.

**Три запрета для тестов:**

1. **Ни один тест не ходит в сеть.** Порт предложителя подменяется по токену `TASK_SUGGESTER_SOURCE`, как сейчас. Эта работа порт не трогает, и ни один её тест его не касается.
2. **Ни один тест не проверяет новые поля у строк от модели иначе, чем на пустоту.** Пустота — инвариант, и тест на неё обязателен (Task 5).
3. **Сборка веба на Windows падает на `EPERM` при создании symlink** — известное свойство среды, а не дефект кода (см. память проекта). `pnpm build` на Windows проверяется до этой точки.

### ⚠ Номера миграций в этом плане — не номера, а пример

**Номер миграции берёт генератор в момент реализации, а не план.** На момент написания последняя миграция — `0040_nebulous_pete_wisdom.sql`, но в репозитории лежит ещё и план расшифровки саммари (`docs/superpowers/plans/2026-11-17-cairn-summary-transcription.md`), претендующий на свои номера. Какой из двух реализуется раньше, план не решает.

Поэтому перед `pnpm db:generate` надо посмотреть, что лежит в `apps/api/drizzle/` **сейчас**, и принять то, что выдал генератор. В Task 3 номера записаны как `<N>` и `<N+1>`; имя парной миграции прав собирается по факту — `<N+1>_summary_task_platform_privileges.sql`.

И вторая половина правила, без которой первая не работает:

> **Если чужие миграции появились, пока ты работал, — перегенерировать обязательно. Переименовать нельзя.**

Почему переименование не спасает: вместе с `.sql` генератор пишет снапшот в `apps/api/drizzle/meta/`, и снапшот описывает схему **целиком**, а не твою правку. Два снапшота от одного предка текстом не сводятся — `git` сольёт их без конфликта и получит схему, которой никогда не существовало. Переименованный файл при этом выглядит здоровым: номер уникален, журнал цел, миграции применяются. Расходится только снапшот, и выяснится это на следующей генерации, у следующего человека. **В этом проекте на этом уже теряли работу при слиянии параллельных ветвей.**

### Структура файлов

| Файл | Что с ним |
|---|---|
| `packages/shared/src/schemas/roadmap.ts` | `checkpointUrlSchema` перестаёт быть приватной |
| `packages/shared/src/schemas/summary.ts` | два поля в задаче, `platforms` в детали, два необязательных поля в приёме |
| `apps/api/src/db/schema/summaries.ts` | колонка `url`, таблица `summaryTaskPlatforms` |
| `apps/api/src/db/schema/summaries.test.ts` | сторож «не богаче чекпоинта» усиливается |
| `apps/api/src/db/schema/invariants.test.ts` | новая таблица в `ALL_TABLES` |
| `apps/api/drizzle/<N>_*.sql`, `<N+1>_*.sql` | структурная и права |
| `apps/api/test/db-fixture.ts` | `TRUNCATE`, детьми первыми |
| `apps/api/src/roadmap/roadmap.repository.ts` | новый `platformsForProject` — единственная правка роадмапа |
| `apps/api/src/summaries/summaries.repository.ts` | чтение и сохранение полей, уборка тегов, один резолв уровня |
| `apps/api/src/chronicle/chronicle.repository.ts` | уборка тегов перед черновиком |
| `apps/api/src/platforms/platforms.repository.ts` | уборка тегов черновика за удалённой платформой |
| `apps/api/src/summaries/summaries.service.ts` | шаг релиза передаёт два поля |
| `apps/web/src/components/CheckpointForm/index.ts` | экспорт `PlatformsToggles` |
| `apps/web/src/components/SummaryTaskEditor/*` | раскрытие строки, поле ссылки, чипы, валидность |
| `apps/web/src/app/(app)/summaries/[id]/TasksBlock.tsx` | передача платформ в редактор |
| `apps/web/src/app/(app)/summaries/constants.ts` | текст подтверждения повторной разбивки |
| `CLAUDE.md` | абзац состояния и строка источника правды |

### Порядок частей

1. **Чанк 1** — контракт: два поля, смысл их отсутствия, переиспользование границ.
2. **Чанк 2** — база и чтение: схема, миграции, выборка платформ, репозиторий саммари, три уборки.
3. **Чанк 3** — путь записи: шаг релиза.
4. **Чанк 4** — веб, документация, полная проверка.

После чанка 3 система уже полезна без веба: поля проставляются через API и доезжают до чекпоинтов. Чанк 2 без чанка 3 вреда не делает: поля хранятся и не используются.

---

## Чанк 1: Контракт

### Task 1: Два поля задачи и платформы в детали

**Files:**
- Modify: `packages/shared/src/schemas/roadmap.ts`
- Modify: `packages/shared/src/schemas/summary.ts`
- Modify: `packages/shared/src/schemas/summary.test.ts`

- [ ] **Step 1: Написать падающий тест**

В `packages/shared/src/schemas/summary.test.ts` — дополнить `DETAIL` полями `platforms: []` и задачи полями `url: null, platformIds: []`, затем добавить:

```ts
describe('поля чекпоинта в черновике', () => {
  it('задача несёт ссылку и теги платформ', () => {
    // Два поля чекпоинта, которые заполняет человек до переезда: иначе
    // список пришлось бы проходить дважды (дизайн, раздел 1).
    const parsed = summaryDetailSchema.parse({
      ...DETAIL,
      tasks: [
        {
          id: ID,
          title: 'Сделать',
          position: 1,
          origin: SummaryTaskOrigin.Human,
          url: 'https://tracker.example/CAIRN-1',
          platformIds: [PLATFORM_ID],
        },
      ],
    });

    expect(parsed.tasks[0]?.url).toBe('https://tracker.example/CAIRN-1');
    expect(parsed.tasks[0]?.platformIds).toEqual([PLATFORM_ID]);
  });

  it('у задачи без ссылки она пуста, а не отсутствует', () => {
    // `null` — состояние «ссылки нет»; необязательного поля в выдаче не
    // бывает, иначе клиент различал бы два вида пустоты.
    expect(() =>
      summaryDetailSchema.parse({
        ...DETAIL,
        tasks: [{ id: ID, title: 'Сделать', position: 1, origin: SummaryTaskOrigin.Model }],
      }),
    ).toThrow();
  });

  it('деталь несёт платформы проекта для чипов', () => {
    const parsed = summaryDetailSchema.parse({
      ...DETAIL,
      platforms: [{ id: PLATFORM_ID, kind: PlatformKind.Server, name: 'API', position: 1 }],
    });

    expect(parsed.platforms[0]?.name).toBe('API');
  });

  it('пустой список платформ законен и накрывает два случая', () => {
    // «У проекта нет платформ» и «у субъекта нет выдачи на роадмап» —
    // намеренно неотличимы: отличимость второго и была бы утечкой
    // признака (дизайн, 3.2).
    expect(summaryDetailSchema.parse(DETAIL).platforms).toEqual([]);
  });
});

describe('замена черновика: два новых поля', () => {
  it('принимает ссылку и теги', () => {
    const parsed = summaryTasksReplaceSchema.parse({
      tasks: [{ id: ID, title: 'Сделать', url: 'https://tracker.example/1', platformIds: [PLATFORM_ID] }],
    });

    expect(parsed.tasks[0]?.platformIds).toEqual([PLATFORM_ID]);
  });

  it('отсутствие полей законно: означает «не трогать»', () => {
    // Редактор субъекта без выдачи на роадмап чипов не видит и набор не
    // отправляет — и теги выживают (дизайн, 3.3).
    const parsed = summaryTasksReplaceSchema.parse({ tasks: [{ id: ID, title: 'Сделать' }] });

    expect(parsed.tasks[0]?.platformIds).toBeUndefined();
    expect(parsed.tasks[0]?.url).toBeUndefined();
  });

  it('снять ссылку и теги можно явно', () => {
    const parsed = summaryTasksReplaceSchema.parse({
      tasks: [{ id: ID, title: 'Сделать', url: null, platformIds: [] }],
    });

    expect(parsed.tasks[0]?.url).toBeNull();
    expect(parsed.tasks[0]?.platformIds).toEqual([]);
  });

  it('отвергает адрес не адресом', () => {
    expect(() =>
      summaryTasksReplaceSchema.parse({ tasks: [{ title: 'Сделать', url: 'CAIRN-1' }] }),
    ).toThrow();
  });

  it('отвергает адрес длиннее предела чекпоинта', () => {
    // Предел взят оттуда, куда значение поедет: 2000 у `url` чекпоинта.
    const url = `https://tracker.example/${'a'.repeat(2000)}`;

    expect(() => summaryTasksReplaceSchema.parse({ tasks: [{ title: 'Сделать', url }] })).toThrow();
  });

  it('отвергает повторяющиеся теги', () => {
    // Та же `platformIdsSchema`, что у чекпоинта: своей схемы не заводим.
    expect(() =>
      summaryTasksReplaceSchema.parse({
        tasks: [{ title: 'Сделать', platformIds: [PLATFORM_ID, PLATFORM_ID] }],
      }),
    ).toThrow();
  });

  it('отвергает больше двадцати тегов на строку', () => {
    const platformIds = Array.from({ length: 21 }, (_, index) =>
      `00000000-0000-0000-0000-0000000000${String(index + 10)}`,
    );

    expect(() => summaryTasksReplaceSchema.parse({ tasks: [{ title: 'Сделать', platformIds }] })).toThrow();
  });
});
```

`PLATFORM_ID` — второй uuid-постоянная рядом с `ID`.

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd packages/shared && npx vitest run src/schemas/summary.test.ts`
Expected: FAIL — поля не описаны, `platforms` в детали нет

- [ ] **Step 3: Правка схем**

В `packages/shared/src/schemas/roadmap.ts` снять `const` с приватной `checkpointUrlSchema` (строка 13) — `export const`, и дописать в её TSDoc, что её принимает и черновик саммари: вторая копия той же проверки разошлась бы с первой пределом или `nullable`.

В `packages/shared/src/schemas/summary.ts`:

- импорт `platformIdsSchema`, `platformSchema` из `./platform` и `checkpointUrlSchema` из `./roadmap` (циклов нет: ни `roadmap.ts`, ни `platform.ts` на `summary.ts` не смотрят);
- `summaryTaskSchema` получает `url: checkpointUrlSchema` и `platformIds: z.array(z.string().uuid())` — простой массив, как в `roadmapCheckpointSchema`: это выдача, и проверять в ней повторы и предел незачем;
- `summaryDetailSchema` получает `platforms: z.array(platformSchema)` с TSDoc из раздела 5.2 дизайна (гейт `Roadmap ≥ metadata`, пустота накрывает два случая намеренно);
- строка приёма в `summaryTasksReplaceSchema` получает `url: checkpointUrlSchema.optional()` и `platformIds: platformIdsSchema.optional()`, и TSDoc схемы объясняет **отсутствие**: «оставить как было» (сохраняется по `id`), `null`/`[]` — снять. Там же — довод из раздела 3.3 дизайна: иначе редактор субъекта без выдачи на роадмап стирал бы невидимые ему теги.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd packages/shared && npx vitest run src/schemas/summary.test.ts src/schemas/roadmap.test.ts`
Expected: PASS, включая все прежние проверки саммари и роадмапа

- [ ] **Step 5: Коммит**

```bash
git add packages/shared/src/schemas/summary.ts packages/shared/src/schemas/summary.test.ts packages/shared/src/schemas/roadmap.ts
git commit -m "Принять в черновике задач ссылку и теги платформ"
```

---

## Чанк 2: База и чтение

### Task 2: Колонка адреса и таблица тегов черновика

**Files:**
- Modify: `apps/api/src/db/schema/summaries.ts`
- Modify: `apps/api/src/db/schema/summaries.test.ts`
- Modify: `apps/api/src/db/schema/invariants.test.ts`

- [ ] **Step 1: Написать падающий тест**

В `apps/api/src/db/schema/summaries.test.ts` **заменить** сторож «беднее чекпоинта» (строки 92–102) на усиленный — правило стало «беднее или равен, но не богаче»:

```ts
it('не богаче чекпоинта: своих полей у задачи нет', () => {
  // ТЗ 1.4 остаётся в силе, а дизайн 2.1 отменён только в части двух
  // полей, которые у чекпоинта есть. Сторож считает разницу составов,
  // а не перечисляет запреты: перечисление пропустило бы поле, которое
  // никому не пришло в голову запретить.
  const own = columnNames(summaryTaskDrafts).filter(
    (column) => !columnNames(roadmapCheckpoints).includes(column),
  );

  expect(own.sort()).toEqual(['summary_id', 'origin'].sort());
});

it('ссылка на задачу во внешнем трекере есть и необязательна', () => {
  expect(columnNames(summaryTaskDrafts)).toContain('url');
  expect(summaryTaskDrafts.url.notNull).toBe(false);
});

it('ни исполнителя, ни оценки, ни даты, ни вложенности', () => {
  const columns = columnNames(summaryTaskDrafts);

  expect(columns).not.toContain('assignee_id');
  expect(columns).not.toContain('estimate');
  expect(columns).not.toContain('due_on');
  expect(columns).not.toContain('parent_id');
});
```

Состав `own` проверить глазами по факту: у черновика общие с чекпоинтом `id`, `title`, `url`, `position`, `created_at`, а своих — `summary_id` и `origin`; `updated_at` у чекпоинта есть, а у черновика нет, и это разница в обратную сторону, которую сторож не ловит намеренно (он про «не богаче»).

Там же — проверки новой таблицы, по образцу `platforms.test.ts:75` (составной ключ `checkpoint_platforms`):

```ts
describe('теги платформ у задачи черновика', () => {
  it('пара и есть сущность: составной первичный ключ', () => {
    // Своего `id` нет — второй экземпляр пары бессмыслен. Зеркало
    // `checkpoint_platforms`.
    const [primary] = getTableConfig(summaryTaskPlatforms).primaryKeys;

    expect(primary?.columns.map((column) => column.name)).toEqual(['draft_id', 'platform_id']);
  });

  it('ссылки не каскадные: уборка явная в пяти местах', () => {
    expect(
      getTableConfig(summaryTaskPlatforms).foreignKeys.map((key) => key.onDelete),
    ).toEqual(['restrict', 'restrict']);
  });

  it('индекс по платформе есть: за удалённой платформой уносят теги', () => {
    expect(indexNames(summaryTaskPlatforms)).toContain('summary_task_platforms_platform_idx');
  });

  it('имена внешних ключей умещаются в предел PostgreSQL', () => {
    // 63 байта. Длиннее — PostgreSQL молча обрежет, и в снапшоте
    // останется одно имя, а в базе другое (см. роадмап, carried_from).
    for (const key of getTableConfig(summaryTaskPlatforms).foreignKeys) {
      expect(key.getName().length).toBeLessThanOrEqual(63);
    }
  });
});
```

`indexNames`/`columnNames` взять из того же файла, где они уже объявлены; способ получить имя ключа (`getName()`) подогнать под то, как это делают соседние тесты схем — выражение написано по смыслу.

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/db/schema/summaries.test.ts`
Expected: FAIL — `summaryTaskPlatforms` не экспортирован, колонки `url` нет

- [ ] **Step 3: Правка схемы**

В `apps/api/src/db/schema/summaries.ts`:

- у `summaryTaskDrafts` — `url: text('url')` с TSDoc «ссылка на задачу во внешнем трекере; ставит человек, у строк от модели всегда пусто»;
- переписать TSDoc таблицы: абзац «ни адреса задачи, ни тегов платформ» **отменён** — вместо него правило «беднее чекпоинта или равен, но не богаче» и причина отмены (человек проходил список дважды), с оговоркой, что из вывода модели по-прежнему берётся только формулировка;
- новая таблица:

```ts
/**
 * Теги платформ у задачи черновика: куда едет результат.
 *
 * Зеркало `checkpoint_platforms` — та же пара, тот же составной ключ, тот
 * же `restrict`: теги уезжают в чекпоинт как есть, и расхождение в
 * устройстве двух наборов одних и тех же тегов пришлось бы помнить при
 * каждой правке.
 *
 * Не массив `uuid[]` у строки черновика: массив не ссылается, и удалённая
 * платформа оставила бы висячий идентификатор, который уронил бы **шаг
 * релиза** — единственный необратимый шаг потока (дизайн, 4.2).
 *
 * Имя короче, чем `summary_task_draft_platforms`, намеренно: имя внешнего
 * ключа по соглашению drizzle вышло бы за 63 байта, PostgreSQL молча
 * обрезал бы его, и снапшот разошёлся бы с базой.
 */
export const summaryTaskPlatforms = pgTable(
  'summary_task_platforms',
  {
    draftId: uuid('draft_id')
      .notNull()
      .references(() => summaryTaskDrafts.id, { onDelete: 'restrict' }),
    platformId: uuid('platform_id')
      .notNull()
      .references(() => projectPlatforms.id, { onDelete: 'restrict' }),
  },
  (table) => [
    primaryKey({ columns: [table.draftId, table.platformId] }),
    index('summary_task_platforms_platform_idx').on(table.platformId),
  ],
);
```

Импорт `projectPlatforms` из `./platforms`. Циклов не возникает: `platforms.ts` смотрит на `roadmap.ts` и `projects.ts`, на `summaries.ts` — нет.

В `apps/api/src/db/schema/invariants.test.ts` — `summaryTaskPlatforms` в импорт и в `ALL_TABLES` сразу после `summary_task_drafts`. Перечень собран руками намеренно: добавление таблицы обязано быть осознанным.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/db/schema/`
Expected: PASS — и сторожа саммари, и общие инварианты схемы

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/db/schema
git commit -m "Завести у задачи черновика адрес и теги платформ"
```

### Task 3: Миграции и фикстура

**Files:**
- Create: `apps/api/drizzle/<N>_*.sql` (имя даст генератор)
- Create: `apps/api/drizzle/<N+1>_summary_task_platform_privileges.sql`
- Modify: `apps/api/drizzle/meta/_journal.json` (первую — генератор, вторую вручную по образцу)
- Modify: `apps/api/test/db-fixture.ts`

**Номера — по факту каталога, а не из этого плана** (блок «Номера миграций» наверху).

- [ ] **Step 1: Посмотреть, что лежит в каталоге сейчас**

Run: `ls apps/api/drizzle/*.sql | tail -4`
Expected: последний номер виден; `<N>` — следующий за ним

- [ ] **Step 2: Сгенерировать миграцию по схеме**

Run: `cd apps/api && pnpm db:generate`
Expected: появился `drizzle/<N>_<слово>.sql` и запись в `meta/_journal.json`

- [ ] **Step 3: Прочитать сгенерированное и проверить глазами**

Run: `cat apps/api/drizzle/<N>_*.sql`

Обязательно должно быть:

- `ALTER TABLE "summary_task_drafts" ADD COLUMN "url" text;` — **без** `NOT NULL` и без значения по умолчанию: у существующих строк ссылки нет, и засыпать её нечем;
- `CREATE TABLE "summary_task_platforms"` с составным первичным ключом, двумя внешними ключами `ON DELETE RESTRICT` и индексом по `platform_id`;
- **ни одной строки, которая пишет данные**: ни `INSERT`, ни `UPDATE`. Доработка ретроспективно ничего не проставляет (дизайн, раздел 8).

Проверить глазами длину имён внешних ключей в самом `.sql`: оба обязаны быть не длиннее 63 знаков. Если генератор выдал длиннее — значит таблицу назвали длиннее, чем в Task 2, и исправлять нужно **имя таблицы**, а не имя ключа.

- [ ] **Step 4: Написать миграцию привилегий**

`apps/api/drizzle/<N+1>_summary_task_platform_privileges.sql` по образцу `0036_summary_privileges.sql`:

```sql
--> Роль приложения получает права на новую таблицу отдельной миграцией:
--> drizzle-kit их не выдаёт, а без них приложение упадёт на первом
--> сохранении черновика с тегом отказом в правах.
--> Права на секвенции не нужны: своего ключа у таблицы нет вовсе.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  summary_task_platforms
TO cairn_app;
```

Зарегистрировать вручную в `apps/api/drizzle/meta/_journal.json` по образцу соседних записей (`idx` на единицу больше, `tag` — имя файла без расширения, `when` — текущая метка времени в миллисекундах, `breakpoints: true`).

**Если к этому моменту в каталоге появилась чужая миграция** — не переименовывать ни свою структурную, ни эту. Откатить обе, обновить рабочую копию и **перегенерировать структурную заново**; привилегии переписать с новым номером. Причина — в блоке наверху плана: расходится снапшот, а не `.sql`.

- [ ] **Step 5: Дополнить фикстуру**

В `apps/api/test/db-fixture.ts` в `TRUNCATE` добавить `summary_task_platforms` **перед** `summary_task_drafts` — детьми первыми, в той же строке:

```
summary_task_platforms, summary_task_drafts, summaries,
```

- [ ] **Step 6: Прогнать интеграционный тест, который применяет миграции**

Run: `cd apps/api && npx vitest run src/db/schema/invariants.test.ts`
Expected: PASS — миграции применились в контейнере без ошибок

- [ ] **Step 7: Коммит**

```bash
git add apps/api/drizzle apps/api/test/db-fixture.ts
git commit -m "Применить адрес и теги черновика миграциями"
```

### Task 4: Платформы проекта без сборки роадмапа

**Files:**
- Modify: `apps/api/src/roadmap/roadmap.repository.ts`
- Modify: `apps/api/src/roadmap/roadmap.repository.test.ts`

Зеркало `labelsForProject` (`:102-120`), заведённого этим же потоком для подсказки обозначения. **Единственная правка роадмапа во всём изменении**: оба поля чекпоинта `createCheckpoint` принимает уже сегодня.

- [ ] **Step 1: Написать падающий тест**

В `apps/api/src/roadmap/roadmap.repository.test.ts`:

```ts
describe('platformsForProject', () => {
  it('отдаёт платформы проекта по порядку', async () => {
    const platforms = await repository.platformsForProject(subject, projectId);

    expect(platforms.map((platform) => platform.name)).toEqual(['API', 'iOS']);
  });

  it('хватает уровня метаданных', async () => {
    // Список платформ проекта роадмап отдаёт сам — он же собирает из него
    // сводку релизов под тем же уровнем (`findForProject`). «Инфо» здесь
    // не участвует: она владеет правкой платформ, а не знанием о них
    // (дизайн, 3.1).
    await expect(repository.platformsForProject(metadataSubject, projectId)).resolves.toHaveLength(2);
  });

  it('без выдачи на роадмап проект не раскрывается', async () => {
    // Отсутствие доступа — 404, а не 403.
    await expect(repository.platformsForProject(outsider, projectId)).rejects.toThrow(
      SectionNotVisibleError,
    );
  });

  it('выдача на «Инфо» не требуется', async () => {
    // Субъект с роадмапом и без «Инфо» — штатный случай подрядчика: в
    // роадмапе он уже ставит теги штатной формой чекпоинта.
    await expect(repository.platformsForProject(roadmapOnlySubject, projectId)).resolves.toHaveLength(2);
  });

  it('у проекта без платформ список пуст, а не отказ', async () => {
    await expect(repository.platformsForProject(subject, emptyProjectId)).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/roadmap/roadmap.repository.test.ts`
Expected: FAIL — метода нет

- [ ] **Step 3: Добавить метод**

Рядом с `labelsForProject`:

```ts
/**
 * Платформы проекта с их порядком.
 *
 * Нужен чипам тегов в редакторе черновика саммари: собирать весь роадмап
 * с версиями, чекпоинтами и сводкой ради списка имён незачем — тот же
 * довод, по которому рядом живёт {@link labelsForProject}.
 *
 * Уровня «метаданные» достаточно, и это не послабление: сводка релизов,
 * которую `findForProject` отдаёт под тем же уровнем, уже несёт каждую
 * платформу проекта целиком, а публичная страница роадмапа — и вовсе без
 * авторизации. «Инфо» владеет правкой платформ и паспортом, а не знанием
 * о списке (дизайн, 3.1).
 *
 * Порядок — `position`, затем `createdAt`: тот же, в котором платформы
 * читает сводка. Второй порядок разошёлся бы с первым.
 */
async platformsForProject(
  subject: RequestSubject,
  projectId: string,
  executor: Executor = this.db,
): Promise<Platform[]> {
  await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Metadata, executor);

  const rows = await executor
    .select()
    .from(projectPlatforms)
    .where(eq(projectPlatforms.projectId, projectId))
    .orderBy(asc(projectPlatforms.position), asc(projectPlatforms.createdAt));

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    position: row.position,
  }));
}
```

Проекцию брать ту же, что `loadRoadmap` (`:957-963`), — наружу не уходят проект и отметки времени.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/roadmap/`
Expected: PASS, включая все прежние тесты роадмапа

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/roadmap
git commit -m "Отдавать платформы проекта без сборки роадмапа"
```

### Task 5: Репозиторий саммари: чтение, сохранение по `id`, уборка

**Files:**
- Modify: `apps/api/src/summaries/summaries.repository.ts`
- Modify: `apps/api/src/summaries/summaries.repository.test.ts`
- Modify: `apps/api/src/chronicle/chronicle.repository.ts`
- Modify: `apps/api/src/chronicle/chronicle.repository.test.ts`
- Modify: `apps/api/src/platforms/platforms.repository.ts`
- Modify: `apps/api/src/platforms/platforms.repository.test.ts`

- [ ] **Step 1: Написать падающий тест**

В `apps/api/src/summaries/summaries.repository.test.ts`:

```ts
describe('ссылка и теги в черновике', () => {
  it('сохраняются вместе со строкой', async () => {
    const detail = await repository.replaceTasks(writer, tx, projectId, summaryId, {
      tasks: [{ title: 'Сделать', url: 'https://tracker.example/1', platformIds: [apiPlatformId] }],
    });

    expect(detail.tasks[0]?.url).toBe('https://tracker.example/1');
    expect(detail.tasks[0]?.platformIds).toEqual([apiPlatformId]);
  });

  it('отсутствие полей оставляет прежние значения', async () => {
    // Редактор субъекта без выдачи на роадмап чипов не видит и набор не
    // отправляет: его правка формулировки не вправе стереть чужую
    // работу (дизайн, 3.3).
    const saved = await repository.replaceTasks(writer, tx, projectId, summaryId, {
      tasks: [{ title: 'Сделать', url: 'https://tracker.example/1', platformIds: [apiPlatformId] }],
    });

    const again = await repository.replaceTasks(writer, tx, projectId, summaryId, {
      tasks: [{ id: saved.tasks[0]!.id, title: 'Сделать иначе' }],
    });

    expect(again.tasks[0]?.title).toBe('Сделать иначе');
    expect(again.tasks[0]?.url).toBe('https://tracker.example/1');
    expect(again.tasks[0]?.platformIds).toEqual([apiPlatformId]);
  });

  it('снимаются явно', async () => {
    const saved = await repository.replaceTasks(writer, tx, projectId, summaryId, {
      tasks: [{ title: 'Сделать', url: 'https://tracker.example/1', platformIds: [apiPlatformId] }],
    });

    const cleared = await repository.replaceTasks(writer, tx, projectId, summaryId, {
      tasks: [{ id: saved.tasks[0]!.id, title: 'Сделать', url: null, platformIds: [] }],
    });

    expect(cleared.tasks[0]?.url).toBeNull();
    expect(cleared.tasks[0]?.platformIds).toEqual([]);
  });

  it('у новой строки без id сохранять нечего: поля пусты', async () => {
    const detail = await repository.replaceTasks(writer, tx, projectId, summaryId, {
      tasks: [{ title: 'Набрал руками' }],
    });

    expect(detail.tasks[0]?.url).toBeNull();
    expect(detail.tasks[0]?.platformIds).toEqual([]);
  });

  it('теги переносятся на нужную строку при перестановке', async () => {
    // Строки черновика удаляются и вставляются заново на каждом
    // сохранении: сопоставление идёт по `position`, а не по порядку
    // `RETURNING`, который стандарт не обещает.
    const saved = await repository.replaceTasks(writer, tx, projectId, summaryId, {
      tasks: [
        { title: 'Первая', platformIds: [apiPlatformId] },
        { title: 'Вторая', platformIds: [] },
      ],
    });

    const swapped = await repository.replaceTasks(writer, tx, projectId, summaryId, {
      tasks: [
        { id: saved.tasks[1]!.id, title: 'Вторая' },
        { id: saved.tasks[0]!.id, title: 'Первая' },
      ],
    });

    expect(swapped.tasks.map((task) => [task.title, task.platformIds])).toEqual([
      ['Вторая', []],
      ['Первая', [apiPlatformId]],
    ]);
  });

  it('разбивка моделью приходит без ссылки и без тегов', async () => {
    // Инвариант порта: из вывода модели берётся только формулировка.
    const detail = await repository.replaceWithSuggested(writer, tx, projectId, summaryId, ['Задача'], STAMP);

    expect(detail.tasks[0]?.url).toBeNull();
    expect(detail.tasks[0]?.platformIds).toEqual([]);
  });

  it('новая разбивка уносит теги прежних строк', async () => {
    await repository.replaceTasks(writer, tx, projectId, summaryId, {
      tasks: [{ title: 'Прежняя', platformIds: [apiPlatformId] }],
    });

    await repository.replaceWithSuggested(writer, tx, projectId, summaryId, ['Новая'], STAMP);

    expect(await testDb.rowsOf(summaryTaskPlatforms)).toHaveLength(0);
  });

  it('удаление саммари уносит теги перед строками', async () => {
    await repository.replaceTasks(writer, tx, projectId, summaryId, {
      tasks: [{ title: 'Сделать', platformIds: [apiPlatformId] }],
    });

    await repository.remove(writer, tx, projectId, summaryId);

    expect(await testDb.rowsOf(summaryTaskPlatforms)).toHaveLength(0);
    expect(await testDb.rowsOf(summaryTaskDrafts)).toHaveLength(0);
  });
});

describe('платформы в детали саммари', () => {
  it('отдаются при уровне метаданных роадмапа', async () => {
    const detail = await repository.findById(roadmapMetadataWriter, projectId, summaryId);

    expect(detail.platforms.map((platform) => platform.name)).toEqual(['API', 'iOS']);
  });

  it('без выдачи на роадмап список пуст', async () => {
    // Неотличимо от проекта без платформ — это и есть нераскрытие
    // (дизайн, 3.2). Уровень спрашивается, а не ловится исключением.
    const detail = await repository.findById(chronicleOnlyWriter, projectId, summaryId);

    expect(detail.platforms).toEqual([]);
  });

  it('выдача на «Инфо» на список не влияет', async () => {
    const detail = await repository.findById(roadmapWithoutInfoWriter, projectId, summaryId);

    expect(detail.platforms).toHaveLength(2);
  });
});
```

В `apps/api/src/chronicle/chronicle.repository.test.ts`:

```ts
it('удаление записи уносит теги черновика перед его строками', async () => {
  // На ссылках `restrict`: без уборки запись с размеченным черновиком
  // стала бы неудаляемой — ровно та же дырка, которую уже закрывали для
  // самого черновика.
  await repository.remove(writer, tx, projectId, entryId);

  expect(await testDb.rowsOf(summaryTaskPlatforms)).toHaveLength(0);
});
```

В `apps/api/src/platforms/platforms.repository.test.ts`:

```ts
it('удаление платформы уносит её теги из черновиков саммари', async () => {
  // Удаление платформы — штатный способ сменить её вид, и упереться в
  // черновик оно не вправе.
  await repository.remove(superadmin, tx, projectId, platformId);

  expect(await testDb.rowsOf(summaryTaskPlatforms)).toHaveLength(0);
});

it('число унесённых выпусков тегами черновика не растёт', async () => {
  // Журнал называет числом потерю фактических дат релиза. Тег в
  // черновике факта о релизе не составляет (дизайн, 4.4).
  const removed = await repository.remove(superadmin, tx, projectId, platformId);

  expect(removed.releases).toBe(1);
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries/summaries.repository.test.ts`
Expected: FAIL — поля не читаются и не сохраняются, `platforms` в детали нет

- [ ] **Step 3: Правка репозиториев**

`apps/api/src/summaries/summaries.repository.ts`:

1. **`tasksOf`** читает `url` из строки и теги одним запросом на все строки саммари (`inArray` по `draft_id` + `innerJoin` на `project_platforms` для порядка, как `tagsOf` в роадмапе — `roadmap.repository.ts:548-557`), а не по строке: N+1 на двухсот задачах здесь не нужен.
2. **`replaceTasks`** — прежний порядок с тремя добавлениями:
   - `existing = await this.tasksOf(tx, summaryId)` теперь даёт и `url`, и `platformIds`; карта по `id` хранит тройку `{ origin, url, platformIds }` вместо одного `origin`;
   - значение строки: `url: task.url === undefined ? kept?.url ?? null : task.url` — **отсутствие означает «не трогать»**, у новой строки сохранять нечего;
   - **уборка тегов до удаления строк**, затем вставка строк с `.returning({ id, position })` и вставка тегов по карте `position → id`. Сопоставление по `position`, а не по порядку возврата: порядок строк в `RETURNING` стандарт не обещает, а позиции внутри саммари уникальны по построению (их нумерует сам этот метод).
3. **`replaceWithSuggested`** — уборка тегов перед удалением строк; вставляемые строки получают `url: null` и тегов не получают вовсе. Пустая разбивка по-прежнему прежних строк **не трогает** — значит и тегов не трогает.
4. **`remove`** — уборка тегов перед строками.
5. Общий приватный помощник `clearTasks(tx, summaryId)`: выбрать `id` строк, удалить теги, удалить строки. Им пользуются все три метода выше.
6. **`detailOf`** — `platforms` из `this.roadmap.platformsForProject(subject, projectId, executor)` при видимом роадмапе, иначе `[]`; и **уровень роадмапа резолвится один раз**: `detailOf` считает признак сам и передаёт его в `releasedLabels` и `suggestedLabel` параметром вместо их собственных вызовов `seesRoadmap`. Иначе третье поле того же гейта дало бы третий запрос прав на каждую сборку детали, а деталь собирается на каждое сохранение черновика.
7. `findForProject` тоже считает признак один раз и передаёт в `releasedLabels`.

`apps/api/src/chronicle/chronicle.repository.ts` — в `remove` (строки 130–140) перед удалением `summaryTaskDrafts` выбрать `id` его строк и удалить по ним теги. Своим кодом, а не вызовом `SummariesRepository`: тот уже зависит от `ChronicleRepository` (`summaries.repository.ts:54`), и обратная зависимость замкнула бы круг в инжекторе. Комментарий об этом поставить рядом.

`apps/api/src/platforms/platforms.repository.ts` — в `remove` рядом с `checkpointPlatforms` (строка 191) удалить `summaryTaskPlatforms` по `platformId`. Возвращаемое число унесённых выпусков не меняется и в TSDoc поясняется, почему теги черновика числом не называются.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/summaries/ src/chronicle/ src/platforms/`
Expected: PASS, включая все прежние тесты трёх репозиториев

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/summaries apps/api/src/chronicle apps/api/src/platforms
git commit -m "Хранить адрес и теги задач черновика и уносить их явно"
```

---

## Чанк 3: Путь записи

### Task 6: Шаг релиза доставляет оба поля в чекпоинт

**Files:**
- Modify: `apps/api/src/summaries/summaries.service.ts`
- Modify: `apps/api/src/summaries/summaries.service.test.ts`
- Modify: `apps/api/src/summaries/summaries.controller.test.ts`

- [ ] **Step 1: Написать падающий тест**

В `apps/api/src/summaries/summaries.service.test.ts`:

```ts
it('чекпоинт получает ссылку и теги задачи', async () => {
  // Путь записи один: поля доезжают существующим `createCheckpoint`,
  // который их принимает уже сегодня. Роадмап не правится.
  await service.release(writer, projectId, summaryId, { label: 'v1.4' });

  const [checkpoint] = await testDb.rowsOf(roadmapCheckpoints);

  expect(checkpoint?.url).toBe('https://tracker.example/1');
  expect(await testDb.rowsOf(checkpointPlatforms)).toHaveLength(1);
});

it('задача без ссылки и тегов даёт чекпоинт без них', async () => {
  await service.release(writer, projectId, bareSummaryId, { label: 'v1.5' });

  const [checkpoint] = await testDb.rowsOf(roadmapCheckpoints);

  expect(checkpoint?.url).toBeNull();
  expect(await testDb.rowsOf(checkpointPlatforms)).toHaveLength(0);
});

it('журнал чекпоинта не меняется: только формулировка', async () => {
  // У штатного создания чекпоинта в метаданных тоже один `title`
  // (`roadmap.service.ts:209-215`), и расхождение означало бы, что
  // приехавший из саммари чекпоинт журналируется иначе.
  await service.release(writer, projectId, summaryId, { label: 'v1.4' });

  const entry = await lastAudit(AuditAction.CheckpointCreated);

  expect(entry?.metadata).toEqual({ title: 'Сделать' });
});

it('чужая платформа в черновике отвергает весь релиз', async () => {
  // Вторая проверка не заводится: её держит `RoadmapRepository`.
  // Названная граница — редактор такого черновика создать не может
  // (дизайн, 5.5).
  await expect(
    service.release(writer, projectId, foreignTaggedSummaryId, { label: 'v1.6' }),
  ).rejects.toThrow(SectionNotVisibleError);

  expect(await testDb.rowsOf(roadmapVersions)).toHaveLength(0);
  const [summary] = await testDb.rowsOf(summaries);
  expect(summary?.releasedVersionId).toBeNull();
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries/summaries.service.test.ts`
Expected: FAIL — чекпоинт создаётся с одной формулировкой

- [ ] **Step 3: Правка службы**

В `apps/api/src/summaries/summaries.service.ts` в цикле шага релиза (строка 210) передать оба поля:

```ts
const checkpoint = await this.roadmap.createCheckpoint(subject, tx, projectId, version.id, {
  title: task.title,
  url: task.url,
  platformIds: task.platformIds,
});
```

Больше в службе не меняется ничего: ни транзакция, ни замок, ни порядок записей журнала, ни коды отказов. `summary.released` остаётся `{ label, tasks, fromModel }` — последствие видно в роадмапе, который и есть результат.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/summaries/`
Expected: PASS, включая контроллеры

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/summaries
git commit -m "Доставлять адрес и теги задач в чекпоинты релиза"
```

---

## Чанк 4: Веб, документация, проверка

### Task 7: Строка редактора раскрывается

**Files:**
- Modify: `apps/web/src/components/CheckpointForm/index.ts`
- Modify: `apps/web/src/components/SummaryTaskEditor/types.ts`
- Modify: `apps/web/src/components/SummaryTaskEditor/TaskRow.tsx`
- Modify: `apps/web/src/components/SummaryTaskEditor/SummaryTaskEditor.tsx`
- Modify: `apps/web/src/components/SummaryTaskEditor/constants.ts`
- Modify: `apps/web/src/components/SummaryTaskEditor/SummaryTaskEditor.test.tsx`

- [ ] **Step 1: Написать падающий тест**

В `apps/web/src/components/SummaryTaskEditor/SummaryTaskEditor.test.tsx`:

```ts
describe('ссылка и теги в строке', () => {
  it('поля скрыты, пока строку не раскрыли', () => {
    // Два поля на каждой из двадцати строк сделали бы список нечитаемым
    // (дизайн, 7.1).
    render(<SummaryTaskEditor tasks={[TASK]} platforms={[API]} onSave={noop} />);

    expect(screen.queryByLabelText('Ссылка на задачу')).not.toBeInTheDocument();
  });

  it('раскрывает строку на месте', async () => {
    render(<SummaryTaskEditor tasks={[TASK]} platforms={[API]} onSave={noop} />);

    await userEvent.click(screen.getByRole('button', { name: 'Подробнее' }));

    expect(screen.getByLabelText('Ссылка на задачу')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'API' })).toBeInTheDocument();
  });

  it('раскрывает все строки разом', async () => {
    // Это и есть «один проход по списку» буквально.
    render(<SummaryTaskEditor tasks={[TASK, SECOND_TASK]} platforms={[API]} onSave={noop} />);

    await userEvent.click(screen.getByRole('button', { name: 'Показать подробности у всех' }));

    expect(screen.getAllByLabelText('Ссылка на задачу')).toHaveLength(2);
  });

  it('свёрнутая строка не скрывает заполненного', () => {
    // Поле, которого не видно и о котором ничего не сказано, человек
    // считает пустым — и поставит второй раз.
    render(
      <SummaryTaskEditor
        tasks={[{ ...TASK, url: 'https://tracker.example/1', platformIds: [API.id] }]}
        platforms={[API]}
        onSave={noop}
      />,
    );

    expect(screen.getByText('API')).toBeInTheDocument();
    expect(screen.getByText(/ссылка/i)).toBeInTheDocument();
  });

  it('без платформ чипов нет вовсе', () => {
    // Пустой список означает «показывать нечего» и накрывает два случая
    // намеренно неотличимо (дизайн, 3.2).
    render(<SummaryTaskEditor tasks={[TASK]} platforms={[]} onSave={noop} />);

    expect(screen.queryByRole('group', { name: 'Платформы' })).not.toBeInTheDocument();
  });

  it('набор тегов не отправляется, когда платформ не видно', async () => {
    // Иначе правка формулировки стёрла бы невидимые теги (дизайн, 3.3).
    const onSave = vi.fn();
    render(<SummaryTaskEditor tasks={[TASK]} platforms={[]} onSave={onSave} />);

    await userEvent.type(screen.getByLabelText('Формулировка задачи'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSave).toHaveBeenCalledWith({ tasks: [{ id: TASK.id, title: `${TASK.title}!`, url: null }] });
  });

  it('правка ссылки включает кнопку сохранения', async () => {
    // Иначе правка терялась бы молча — её же стережёт предупреждение об
    // уходе со страницы.
    render(<SummaryTaskEditor tasks={[TASK]} platforms={[API]} onSave={noop} />);

    await userEvent.click(screen.getByRole('button', { name: 'Подробнее' }));
    await userEvent.type(screen.getByLabelText('Ссылка на задачу'), 'https://tracker.example/1');

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled();
  });

  it('негодный адрес не даёт сохранить и называет строку', async () => {
    // Предел и формат держит форма: `400` от zod пришёл бы без кода
    // отказа и без указания строки (дизайн, 7.3).
    render(<SummaryTaskEditor tasks={[TASK]} platforms={[API]} onSave={noop} />);

    await userEvent.click(screen.getByRole('button', { name: 'Подробнее' }));
    await userEvent.type(screen.getByLabelText('Ссылка на задачу'), 'CAIRN-1');

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
    expect(screen.getByText(/адрес/i)).toBeInTheDocument();
  });

  it('после релиза поля только читаются', async () => {
    render(<SummaryTaskEditor tasks={[TASK]} platforms={[API]} onSave={noop} isReleased />);

    await userEvent.click(screen.getByRole('button', { name: 'Подробнее' }));

    expect(screen.getByLabelText('Ссылка на задачу')).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'API' })).toBeDisabled();
  });
});
```

Пустое поле ссылки отправляется как `null` — это та же сборка, что `submitValuesOf` у формы чекпоинта (`url.trim() || null`).

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/web && npx vitest run src/components/SummaryTaskEditor`
Expected: FAIL — пропа `platforms` нет, раскрывателя нет

- [ ] **Step 3: Правка компонентов**

1. `components/CheckpointForm/index.ts` — добавить `export { PlatformsToggles } from './PlatformsToggles';`. Тот же приём, которым форма релиза уже переиспользует `StateField` и `DateField` из `VersionFields/index.ts`.
2. `SummaryTaskEditor/types.ts` — `platforms: Platform[]` в `IProps`; `url: string` и `platformIds: string[]` в `IDraftTask` (адрес в памяти — строка, пустая означает «нет»); в `IRowProps` — `isOpen`, `onToggle`, `platforms`, `onUrlChange`, `onPlatformsChange`, `urlError`.
3. `TaskRow.tsx` — кнопка-раскрыватель с `aria-expanded`; под строкой при раскрытии `input type="url"` с подписью «Ссылка на задачу» и `PlatformsToggles` с `idPrefix={task.key}` (проп `idPrefix` у него для этого и заведён); в свёрнутом виде — имена отмеченных платформ и пометка о наличии ссылки. Компонент держать в пределах 100 строк: если не укладывается, вынести раскрытую часть в `TaskDetails.tsx` рядом.
4. `SummaryTaskEditor.tsx` — `draftOf` переносит два новых поля; отпечаток `signatureOf` их включает (иначе правка ссылки не включила бы кнопку); `payloadOf` собирает `url: title.trim() || null` и добавляет `platformIds` **только когда платформы переданы непустым списком**; состояние раскрытия — `Set<string>` ключей строк плюс переключатель «у всех»; сохранение запрещено, пока есть негодный адрес — проверка через `checkpointUrlSchema.safeParse` из контракта, а не своим регекспом.
5. `constants.ts` — подписи: «Подробнее», «Скрыть подробности», «Показать подробности у всех», «Ссылка на задачу», пометка «ссылка», объяснение негодного адреса.

Чтение заголовка страницы по ссылке (`onReadTitle` формы чекпоинта) **не подключается**: оно подставляет заголовок пустой формулировке, а в черновике формулировка есть всегда.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/web && npx vitest run src/components/SummaryTaskEditor src/components/CheckpointForm`
Expected: PASS, включая прежние проверки редактора и формы чекпоинта

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/SummaryTaskEditor apps/web/src/components/CheckpointForm/index.ts
git commit -m "Править ссылку и теги задач в раскрываемой строке черновика"
```

### Task 8: Экран передаёт платформы и честно предупреждает о замене

**Files:**
- Modify: `apps/web/src/app/(app)/summaries/[id]/TasksBlock.tsx`
- Modify: `apps/web/src/app/(app)/summaries/constants.ts`
- Modify: `apps/web/src/app/(app)/summaries/[id]/SummaryScreen.test.tsx`

- [ ] **Step 1: Написать падающий тест**

```ts
it('чипы платформ приходят из детали саммари', async () => {
  // Один запрос и один гейт: платформы едут тем же ответом, что
  // обозначение версии-получателя (дизайн, 3.2).
  renderScreen({ ...DETAIL, platforms: [API] });

  await userEvent.click(await screen.findByRole('button', { name: 'Подробнее' }));

  expect(screen.getByRole('checkbox', { name: 'API' })).toBeInTheDocument();
});

it('подтверждение повторной разбивки называет потерю ссылок и тегов', async () => {
  // Диалог, обещающий меньше, чем делает, хуже отсутствия диалога.
  renderScreen({ ...DETAIL, tasks: [TASK], platforms: [API] });

  await userEvent.click(await screen.findByRole('button', { name: /Создать задачи/ }));

  expect(screen.getByText(/ссылки и теги/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/web && npx vitest run "src/app/(app)/summaries"`
Expected: FAIL — платформы не передаются, текст прежний

- [ ] **Step 3: Правка экрана**

`TasksBlock.tsx` — `platforms={summary.platforms}` в `SummaryTaskEditor`. Ни нового запроса, ни нового хука: деталь уже загружена.

`summaries/constants.ts` — в текст подтверждения повторной разбивки дописать, что вместе с формулировками будут потеряны проставленные ссылки и теги платформ.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/web && npx vitest run "src/app/(app)/summaries"`
Expected: PASS

- [ ] **Step 5: Коммит**

```bash
git add "apps/web/src/app/(app)/summaries"
git commit -m "Показывать платформы проекта в редакторе черновика саммари"
```

### Task 9: Документация и полная проверка

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Правка `CLAUDE.md`**

В «Состояние репозитория» — абзац после абзаца про настройку служб модели:

> Следом — ссылка и теги платформ в черновике задач саммари. Прежнее «`url` и
> теги ставятся после переезда, штатной формой чекпоинта» **отменено**: человек
> проходил список дважды — формулировки в конструкторе, ссылки и теги в
> роадмапе. Оба поля появились у задачи черновика (колонка `url` и таблица
> связи по образцу `checkpoint_platforms`), заполняет их **человек** в
> раскрываемой строке редактора, а из вывода модели по-прежнему берётся только
> формулировка — у строк «предложено моделью» оба поля пусты. Список платформ
> для чипов приходит деталью саммари под `Roadmap ≥ metadata`: список платформ
> проекта роадмап отдаёт сам (сводкой релизов), и «Инфо» здесь не участвует —
> она владеет правкой платформ, а не знанием о них. Без выдачи на роадмап блок
> платформ не рисуется вовсе и неотличим от проекта без платформ, а отсутствие
> набора в теле замены означает «не трогать», поэтому редактор, который тегов
> не видит, их и не стирает. Релиз идёт тем же путём: поля доезжают до
> `createCheckpoint`, который их принимал и раньше; ни новой ручки, ни нового
> действия журнала, ни новой переменной окружения не появилось.

В «Источники правды» — строка:

> - `docs/superpowers/specs/2026-11-17-cairn-summary-draft-fields-design.md` и одноимённый план — ссылка и теги платформ в черновике задач саммари: отмена границы раздела 2.1, гейт `Roadmap ≥ metadata` для списка платформ, «отсутствие поля = не трогать».

- [ ] **Step 2: Полная проверка**

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: PASS. На Windows `pnpm build` падает на `EPERM` при создании symlink — это свойство среды, а не дефект кода (память проекта); проверять до этой точки.

- [ ] **Step 3: Проверить глазами то, что тесты не ловят**

- `git log --oneline -3 -- apps/api/drizzle/meta/` — снапшот **сгенерирован**, а не слит руками, и номер миграций взят по факту каталога, а не из этого плана;
- `grep -rn "теги платформ" apps/api/src/db/schema/summaries.ts` — отменённый абзац TSDoc переписан, а не оставлен рядом с новой колонкой;
- `grep -rn "summaryTaskPlatforms" apps/api/src` — уборка стоит во всех пяти местах: три в репозитории саммари, одна в хронике, одна в платформах;
- контроллеры и модуль не правились вовсе: `git diff --stat` не должен показывать `summaries.controller.ts`, `summaries.module.ts` и `summaries-overview.controller.ts`;
- `git diff --stat apps/api/src/summaries/suggester/` пуст: порт не тронут ни на строку.

- [ ] **Step 4: Коммит**

```bash
git add CLAUDE.md
git commit -m "Описать ссылку и теги в черновике задач саммари"
```

---

## Что этот план сознательно не делает

Перечислено, чтобы следующий работающий не принял отсутствие за недоделку
(подробнее — раздел 11 дизайна):

- **перетаскивание строк** — кнопки «Выше»/«Ниже» остаются; библиотеки DnD в
  проекте нет, а составная строка дала бы перетаскиванию ещё и задачу ручки
  захвата;
- **разделение и слияние задач** — отдельная работа, целиком на клиенте;
  решить придётся, что делать с двумя новыми полями при разрезе и склейке;
- **выбор целевой версии из существующих** — отдельная работа, по образцу тела
  переноса чекпоинта (`checkpointCarryOverSchema`);
- **проверка принадлежности платформы проекту при записи черновика** — её
  держит `RoadmapRepository` на шаге релиза, второй точки контроля не
  заводится;
- **подстановка заголовка задачи по ссылке** — в черновике формулировка есть
  всегда;
- **показ метаданных журнала на экране** — как и раньше, не показываются ни у
  одного действия; новых действий здесь нет вовсе.
