# Настройка служб модели через экран администрирования — план реализации

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Адрес внешней службы модели, ключ, имя модели и схема авторизации правятся суперадмином на экране `/model-services` и действуют без перезапуска API; переменные окружения остаются запасным источником, так что уже собранные установки продолжают работать без правок; ключ лежит в базе шифрованным тем же `CryptoService`, что значения переменных, и не выходит наружу ни в одном ответе, журнале или отказе.

**Architecture:** Шесть частей по возрастанию связности. Сначала контракт и чистые функции — они ничего не ломают и нужны всему остальному. Затем одна таблица с двумя миграциями и репозиторий, который умеет шифровать и писать одним `ON CONFLICT`. Затем **разрешение настройки** — единственное место, где решается «база или окружение», и главный инвариант дизайна: сливающей ветки нет ни одной. Затем порт предложителя: схема авторизации в адаптере вместо безусловного `Bearer`, метод проверки связи и замена внедрённого экземпляра адаптера на источник адаптеров. Затем ручки под `SuperadminGuard` и четыре действия журнала. Напоследок веб, развёртывание и документация.

**Tech Stack:** pnpm workspaces, NestJS, Drizzle + PostgreSQL, zod в `packages/shared`, Next.js 15, TanStack Query, Vitest + React Testing Library, Testcontainers.

**Основание:** `docs/superpowers/specs/2026-11-17-cairn-model-settings-admin-design.md`

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

**Ни один тест не ходит в сеть.** Источник адаптеров подменяется по токену `TASK_SUGGESTER_SOURCE`, адаптер и проверка связи проверяются подменённым `fetch`.

### Три вещи, которые легко сломать

1. **Сливающей ветки «база плюс окружение» быть не должно.** Запись есть — вся настройка из неё, включая пустые поля; записи нет — вся из окружения. На это стоит отдельный тест (Чанк 3, Task 11), и он главный в наборе: доливание ключа из окружения вернуло бы передачу наружу человеку, который очистил поле намеренно.
2. **Ключ не выходит наружу.** Четыре места: ответ ручки, журнал, текст отказа, лог. Тесты сравнивают тело ответа и метаданные журнала **целиком**, а не ищут отсутствие подстроки.
3. **Номера миграций.** Свободны `0038` и `0039`, и ровно их называет свободными план расшифровки (`2026-11-17-cairn-summary-transcription.md`). Если тот слился раньше — **перегенерировать** `pnpm db:generate` поверх его снапшота, а не переименовать файл: снапшоты drizzle текстом не сводятся, и правка номера оставила бы снапшот, не знающий о чужой таблице. В репозитории это уже случалось.

### Структура файлов

| Файл | Ответственность |
|---|---|
| `packages/shared/src/enums.ts` | `ModelServiceKind`, `ModelAuthScheme`, `ModelServicePlacement`, `ModelServiceSource`, `ModelProbeOutcome`; `TaskSuggesterKind` переименован |
| `packages/shared/src/schemas/model-service.ts` | проекция настройки, схема записи, `parseModelServiceBaseUrl`, результат проверки связи, коды отказов |
| `apps/api/src/db/schema/model-services.ts` | таблица `model_services` и три `pgEnum` |
| `apps/api/src/model-services/model-services.repository.ts` | чтение, `ON CONFLICT (kind) DO UPDATE`, удаление, шифрование |
| `apps/api/src/model-services/model-service-settings.service.ts` | разрешение «база или окружение» — одно место |
| `apps/api/src/model-services/model-services.service.ts` | транзакции и журнал, проверка связи |
| `apps/api/src/model-services/model-services.controller.ts` | `model-services` под `SuperadminGuard` |
| `apps/api/src/model-services/model-services.module.ts` | модуль, экспортирует службу разрешения |
| `apps/api/src/summaries/suggester/task-suggester.ts` | `probe` в интерфейсе, `placement` вместо `kind`, токен источника |
| `apps/api/src/summaries/suggester/task-suggester.source.ts` | источник адаптера: адаптер на вызов, а не на процесс |
| `apps/api/src/summaries/suggester/openai-compatible.suggester.ts` | заголовок по схеме, `probe` |
| `apps/api/src/summaries/suggester/settings.ts` | разбор окружения как **запасного** источника |
| `apps/web/src/app/(app)/model-services/` | страница и экран |
| `apps/web/src/components/ModelServiceCard/` | карточка узла |
| `apps/web/src/components/ModelServiceForm/` | форма в панели, пресеты в `constants.ts` |
| `apps/web/src/components/ModelProbeResult/` | исход проверки связи |
| `apps/web/src/api/hooks/useQueryModelServices.ts` | список и узел |
| `apps/web/src/api/hooks/useMutationModelService.ts` | сохранение, сброс, проверка связи |

### Порядок частей

1. **Чанк 1** — контракт: перечни, переименование, схемы, разбор адреса.
2. **Чанк 2** — база: таблица, миграции, репозиторий с шифрованием.
3. **Чанк 3** — разрешение настройки: база главнее, окружение целиком.
4. **Чанк 4** — порт: схема авторизации, проверка связи, источник адаптеров.
5. **Чанк 5** — ручки и журнал.
6. **Чанк 6** — веб, развёртывание, документация, полная проверка.

После чанка 3 система не хуже сегодняшней: настройка читается из окружения тем же способом, ничего не сломано. После чанка 5 полезна без веба: настройка правится через API. Чанк 6 — то, зачем всё делалось.

---

## Чанк 1: Контракт

### Task 1: Перечни и переименование `TaskSuggesterKind`

**Files:**
- Modify: `packages/shared/src/enums.ts`
- Modify: `packages/shared/src/enums.test.ts`

- [ ] **Step 1: Написать падающий тест**

В `packages/shared/src/enums.test.ts`, рядом с существующими проверками перечней:

```ts
describe('перечни служб модели', () => {
  it('узел — закрытый перечень, и в этой итерации он один', () => {
    // Настройки для службы, которой в сборке нет, не бывает: карточка
    // узла расшифровки показывала бы форму, сохранение в которой ни на
    // что не влияет (дизайн, 14.1 пункт 1).
    expect(Object.values(ModelServiceKind)).toEqual(['task_suggester']);
  });

  it('схема авторизации отвечает за одно слово в одном заголовке', () => {
    // `api_key` существует потому, что Yandex ждёт `Api-Key`, а не
    // `Bearer`; `none` — потому, что «узел без ключа» и «забыли вписать
    // ключ» обязаны различаться (дизайн, 6.2).
    expect(Object.values(ModelAuthScheme)).toEqual(['bearer', 'api_key', 'none']);
  });

  it('вид узла задаётся человеком и несёт прежние значения', () => {
    // Переименование `TaskSuggesterKind`: значения те же строки, значит
    // `summaries.suggester_name` миграции данных не требует.
    expect(Object.values(ModelServicePlacement)).toEqual(['external', 'local']);
  });

  it('источник настройки отвечает на первый вопрос экрана', () => {
    expect(Object.values(ModelServiceSource)).toEqual(['database', 'environment', 'none']);
  });

  it('исходов проверки связи шесть: по ним человек делает разное', () => {
    expect(Object.values(ModelProbeOutcome)).toEqual([
      'ok',
      'unauthorized',
      'not_found',
      'bad_request',
      'unavailable',
      'bad_response',
    ]);
  });

  it('прежнего перечня предложителя не осталось', () => {
    // Два перечня с одинаковыми значениями разошлись бы на втором порте.
    expect('TaskSuggesterKind' in enums).toBe(false);
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd packages/shared && npx vitest run src/enums.test.ts`
Expected: FAIL — ни один из пяти перечней не экспортирован

- [ ] **Step 3: Дописать перечни и убрать прежний**

В `packages/shared/src/enums.ts` — пять перечней из раздела 4.1 дизайна, с TSDoc оттуда же. `TaskSuggesterKind` **удаляется**, его место занимает `ModelServicePlacement` с теми же значениями.

- [ ] **Step 4: Прогнать перечни**

Run: `cd packages/shared && npx vitest run src/enums.test.ts`
Expected: PASS

- [ ] **Step 5: Провести переименование по всем вызывающим**

`TaskSuggesterKind` используется в: `packages/shared/src/schemas/summary.ts:180` (поле `kind` схемы `taskSuggesterInfoSchema` — переименовать в `placement`), `apps/api/src/summaries/suggester/settings.ts`, `task-suggester.ts`, `openai-compatible.suggester.ts`, `disabled.suggester.ts`, `summaries.service.ts`, `summaries.repository.ts` и их тесты, плюс подпись над кнопкой в вебе.

Переименование механическое, но поле контракта меняет **имя**, а не только тип: `TaskSuggesterInfo.kind` → `TaskSuggesterInfo.placement`. Веб правится в чанке 6.

- [ ] **Step 6: Проверить типы целиком**

Run: `pnpm typecheck`
Expected: PASS — иначе осталось место, где `kind` читают по старому имени

---

### Task 2: Разбор адреса службы — чистая функция

**Files:**
- Create: `packages/shared/src/schemas/model-service.ts`
- Create: `packages/shared/src/schemas/model-service.test.ts`

- [ ] **Step 1: Написать падающий тест**

Табличный тест — идиома проекта (`incident-decision.ts`, `recheck-delay.ts`, `next-version-label.ts`):

```ts
describe('parseModelServiceBaseUrl', () => {
  it.each([
    ['https://api.proxyapi.ru/v1', ModelServicePlacement.External],
    ['https://llm.api.cloud.yandex.net/v1', ModelServicePlacement.External],
    ['http://llm.internal:8000/v1', ModelServicePlacement.Local],
  ])('принимает годный адрес %s', (url, placement) => {
    expect(parseModelServiceBaseUrl(url, placement).host).not.toBeNull();
  });

  it('отвергает строку запроса: ровно так ключ попадает в адрес', () => {
    // Инвариант: не «не показываем, потому что там может быть ключ», а
    // «его там быть не может» (дизайн, 3.5).
    expect(() =>
      parseModelServiceBaseUrl('https://api.example/v1?key=sk-secret', ModelServicePlacement.External),
    ).toThrow(MODEL_SERVICE_BAD_URL);
  });

  it('отвергает данные входа в адресе', () => {
    expect(() =>
      parseModelServiceBaseUrl('https://user:pass@api.example/v1', ModelServicePlacement.External),
    ).toThrow(MODEL_SERVICE_BAD_URL);
  });

  it.each(['ftp://api.example/v1', 'file:///etc/passwd', 'не адрес'])(
    'отвергает негодную схему %s',
    (url) => {
      expect(() => parseModelServiceBaseUrl(url, ModelServicePlacement.External)).toThrow(
        MODEL_SERVICE_BAD_URL,
      );
    },
  );

  it('отвергает http у внешнего узла: ключ ушёл бы по открытому каналу', () => {
    expect(() =>
      parseModelServiceBaseUrl('http://api.example/v1', ModelServicePlacement.External),
    ).toThrow(MODEL_SERVICE_INSECURE_URL);
  });

  it('разрешает http у узла в контуре', () => {
    // Запретить значило бы запретить ровно тот путь, который закрывает
    // утечку целиком (дизайн, 4.2).
    expect(parseModelServiceBaseUrl('http://llm.internal:8000', ModelServicePlacement.Local).host).toBe(
      'llm.internal',
    );
  });

  it('снимает замыкающую косую черту', () => {
    // Иначе в пути окажется двойная: адаптер дописывает `/chat/completions`.
    expect(parseModelServiceBaseUrl('https://api.example/v1/', ModelServicePlacement.External).baseUrl).toBe(
      'https://api.example/v1',
    );
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd packages/shared && npx vitest run src/schemas/model-service.test.ts`
Expected: FAIL — модуля нет

- [ ] **Step 3: Написать функцию**

`parseModelServiceBaseUrl(raw, placement): { baseUrl: string; host: string }` — `new URL`, затем четыре запрета из раздела 4.2 дизайна, затем снятие замыкающих `/`. Бросает обычную `Error` с кодом в сообщении (общая с браузером, о HTTP не знает) — тот же приём, что у `normalizeSummaryText`; код в тело ответа переносит сервер.

- [ ] **Step 4: Прогнать**

Run: `cd packages/shared && npx vitest run src/schemas/model-service.test.ts`
Expected: PASS

---

### Task 3: Схемы настройки и проверки связи

**Files:**
- Modify: `packages/shared/src/schemas/model-service.ts`
- Modify: `packages/shared/src/schemas/model-service.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
describe('modelServiceUpdateSchema', () => {
  const valid = {
    baseUrl: 'https://api.proxyapi.ru/v1',
    authScheme: ModelAuthScheme.Bearer,
    model: 'qwen/qwen3-max',
    folder: null,
    placement: ModelServicePlacement.External,
    timeoutSeconds: 60,
    isEnabled: true,
  };

  it('принимает настройку без поля ключа: «не менять»', () => {
    expect(modelServiceUpdateSchema.parse(valid).secret).toBeUndefined();
  });

  it('принимает null в ключе: «убрать»', () => {
    expect(modelServiceUpdateSchema.parse({ ...valid, secret: null }).secret).toBeNull();
  });

  it('отвергает пустую строку в ключе', () => {
    // Иначе «убрать ключ» и «форма отправила незаполненное поле» были бы
    // одним и тем же, и открыть форму, ничего не трогая, и сохранить
    // значило бы стереть ключ (дизайн, 4.2).
    expect(modelServiceUpdateSchema.safeParse({ ...valid, secret: '' }).success).toBe(false);
  });

  it('отвергает неположительный предел ожидания', () => {
    expect(modelServiceUpdateSchema.safeParse({ ...valid, timeoutSeconds: 0 }).success).toBe(false);
  });

  it('отвергает лишние поля', () => {
    expect(
      modelServiceUpdateSchema.safeParse({ ...valid, preset: 'yandex' }).success,
    ).toBe(false);
  });
});

describe('modelServiceSettingsSchema', () => {
  it('ключа в проекции нет ни одним полем', () => {
    // Наружу идёт только «задан»: ни длины, ни хвоста (дизайн, 3.4).
    const keys = Object.keys(modelServiceSettingsSchema.shape);
    expect(keys).toContain('hasSecret');
    expect(keys.filter((key) => /secret/i.test(key))).toEqual(['hasSecret']);
  });
});
```

`preset` в тесте на лишние поля — не случайное имя: это ровно то поле, которое было бы соблазнительно послать с формы, и `.strict()` обязан его отвергнуть (пресеты не хранятся, дизайн 10.1).

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd packages/shared && npx vitest run src/schemas/model-service.test.ts`
Expected: FAIL — схем нет

- [ ] **Step 3: Написать схемы**

`modelServiceSettingsSchema`, `modelServiceUpdateSchema`, `modelProbeResultSchema`, три кода отказов и выводимые типы — из разделов 4.1–4.3 дизайна, с TSDoc оттуда.

- [ ] **Step 4: Экспортировать из контракта**

В `packages/shared/src/index.ts` — `export * from './schemas/model-service';` между `./schemas/intake` и `./schemas/platform` (список отсортирован по алфавиту).

- [ ] **Step 5: Прогнать контракт целиком**

Run: `cd packages/shared && npx vitest run && cd ../.. && pnpm typecheck`
Expected: PASS

---

## Чанк 2: База

### Task 4: Таблица `model_services`

**Files:**
- Create: `apps/api/src/db/schema/model-services.ts`
- Create: `apps/api/src/db/schema/model-services.test.ts`
- Modify: `apps/api/src/db/schema/index.ts`

- [ ] **Step 1: Написать падающий тест**

По образцу `apps/api/src/db/schema/summaries.test.ts`:

```ts
describe('таблица model_services', () => {
  it('ключ — значение перечня, а не суррогат', () => {
    // Одна настройка на узел становится инвариантом базы, а запись —
    // одним `ON CONFLICT (kind) DO UPDATE` без чтения-правки-записи
    // (дизайн, 3.2).
    expect(getTableConfig(modelServices).primaryKeys).toHaveLength(0);
    expect(modelServices.kind.primary).toBe(true);
  });

  it('ключ службы обнуляем, а не пустая строка', () => {
    // `null` отвечает на «задан ли ключ» без ключа шифрования вовсе;
    // пустая строка в шифрованной колонке — это шифротекст пустого
    // значения (дизайн, 3.1).
    expect(modelServices.secretEncrypted.notNull).toBe(false);
  });

  it('имя модели обязательно', () => {
    expect(modelServices.model.notNull).toBe(true);
  });

  it('предел ожидания положителен проверкой базы', () => {
    // Ноль означал бы «не ждать вовсе», то есть отказ на каждом вызове.
    // Образец CHECK уже есть: summaries_suggester_dropped_nonnegative.
    const checks = getTableConfig(modelServices).checks.map((check) => check.name);
    expect(checks).toContain('model_services_timeout_positive');
  });

  it('автор правки не удаляется, пока настройка на него ссылается', () => {
    const [reference] = getTableConfig(modelServices).foreignKeys;
    expect(reference?.onDelete).toBe('restrict');
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/db/schema/model-services.test.ts`
Expected: FAIL — модуля нет

- [ ] **Step 3: Написать схему**

Три `pgEnum` (`model_service_kind`, `model_auth_scheme`, `model_service_placement`) со значениями **из контракта**, как в `summaries.ts:10-14` (перечень базы и перечень контракта обязаны совпадать, и единственный способ это гарантировать — брать значения из контракта). Таблица из раздела 3.1 дизайна, CHECK, TSDoc с объяснением ключа-перечня.

- [ ] **Step 4: Экспортировать**

В `apps/api/src/db/schema/index.ts` — `export * from './model-services';` (список по алфавиту, место между `./invitations` и `./platforms`).

- [ ] **Step 5: Прогнать**

Run: `cd apps/api && npx vitest run src/db/schema/model-services.test.ts`
Expected: PASS

---

### Task 5: Миграции и фикстура

**Files:**
- Create: `apps/api/drizzle/0038_*.sql` (имя даст генератор)
- Create: `apps/api/drizzle/0039_model_service_privileges.sql`
- Modify: `apps/api/test/db-fixture.ts`
- Create: `apps/api/src/model-services/model-services.privileges.test.ts`

- [ ] **Step 1: Написать падающий тест привилегий**

Интеграционный, по образцу существующих тестов привилегий: подключение ролью `cairn_app` из фикстуры (`appDb`) пишет и читает `model_services`.

```ts
it('роль приложения имеет права на настройку служб модели', async () => {
  // drizzle-kit GRANT не выдаёт, и без парной миграции приложение упало
  // бы на первом запросе отказом в правах.
  await expect(
    fixture.appDb.insert(modelServices).values({
      kind: ModelServiceKind.TaskSuggester,
      baseUrl: 'https://api.example/v1',
      authScheme: ModelAuthScheme.Bearer,
      model: 'm',
      placement: ModelServicePlacement.External,
      updatedBySubjectId: subject.id,
    }),
  ).resolves.not.toThrow();
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/model-services/model-services.privileges.test.ts`
Expected: FAIL — таблицы в базе нет

- [ ] **Step 3: Сгенерировать структурную миграцию**

Run: `cd apps/api && pnpm db:generate`

**Прежде чем генерировать**, проверить последний номер в `apps/api/drizzle/`: план ожидает `0038`, но план расшифровки претендует на тот же номер. Если он слился раньше — генератор сам возьмёт следующий свободный поверх его снапшота, и это правильный путь; переименовывать файлы руками нельзя.

Проверить сгенерированное: должны быть три `CREATE TYPE`, одна `CREATE TABLE`, один CHECK. Если CHECK не попал — дописать руками в том же файле.

- [ ] **Step 4: Написать парную миграцию прав**

`0039_model_service_privileges.sql` по образцу `0036_summary_privileges.sql`, с такой же шапкой-объяснением:

```sql
--> Роль приложения получает права на новую таблицу отдельной миграцией:
--> drizzle-kit их не выдаёт, а без них приложение упадёт на первом
--> обращении к настройке служб модели отказом в правах.
--> Права на секвенции не нужны: ключ — значение перечня, а не суррогат.
GRANT SELECT, INSERT, UPDATE, DELETE ON model_services TO cairn_app;
```

- [ ] **Step 5: Дополнить `TRUNCATE` фикстуры**

В `apps/api/test/db-fixture.ts` в список `TRUNCATE TABLE` добавить `model_services` — рядом с `servers`, перед `projects` и `subjects` (дети первыми; настройка ссылается на `subjects`).

- [ ] **Step 6: Прогнать**

Run: `cd apps/api && npx vitest run src/model-services/model-services.privileges.test.ts`
Expected: PASS

---

### Task 6: Репозиторий настройки

**Files:**
- Create: `apps/api/src/model-services/model-services.repository.ts`
- Create: `apps/api/src/model-services/model-services.repository.test.ts`

- [ ] **Step 1: Написать падающий тест**

Интеграционный, с настоящим `CryptoService`:

```ts
it('ключ в базе лежит шифрованным и расшифровывается обратно', async () => {
  await repository.save(tx, ModelServiceKind.TaskSuggester, subject.id, {
    ...input,
    secret: 'sk-очень-секретный',
  });

  const [row] = await fixture.rowsOf(modelServices);
  // Формат тот же, что у переменных проекта: второго механизма
  // шифрования не появляется (дизайн, 3.3).
  expect(row?.secretEncrypted).toMatch(/^v1:/);
  expect(row?.secretEncrypted).not.toContain('sk-очень-секретный');

  const resolved = await repository.find(fixture.db, ModelServiceKind.TaskSuggester);
  expect(resolved?.secret).toBe('sk-очень-секретный');
});

it('вторая запись правит ту же строку, а не создаёт вторую', async () => {
  await repository.save(tx, kind, subject.id, input);
  await repository.save(tx, kind, subject.id, { ...input, model: 'другая' });

  expect(await fixture.rowsOf(modelServices)).toHaveLength(1);
});

it('отсутствие поля ключа оставляет прежний ключ', async () => {
  await repository.save(tx, kind, subject.id, { ...input, secret: 'первый' });
  await repository.save(tx, kind, subject.id, { ...input, model: 'другая' });

  expect((await repository.find(fixture.db, kind))?.secret).toBe('первый');
});

it('null в ключе убирает его', async () => {
  await repository.save(tx, kind, subject.id, { ...input, secret: 'первый' });
  await repository.save(tx, kind, subject.id, { ...input, secret: null });

  const resolved = await repository.find(fixture.db, kind);
  expect(resolved?.secret).toBeNull();
  expect(resolved?.hasSecret).toBe(false);
});

it('негодный ключ шифрования не роняет чтение', async () => {
  // Экран администрирования — единственное место, с которого это
  // чинится, и ронять его ошибкой расшифровки значит отобрать
  // инструмент починки (дизайн, 3.7). Расхождение с
  // VariablesRepository названо и обосновано там же.
  await fixture.db.update(modelServices).set({ secretEncrypted: 'v1:мусор:мусор:мусор' });

  const resolved = await repository.find(fixture.db, kind);
  expect(resolved?.secret).toBeNull();
  expect(resolved?.isSecretBroken).toBe(true);
});

it('удаление убирает строку и отсутствующую строку терпит', async () => {
  await repository.save(tx, kind, subject.id, input);
  await repository.remove(tx, kind);
  await expect(repository.remove(tx, kind)).resolves.not.toThrow();
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/model-services/model-services.repository.test.ts`
Expected: FAIL — репозитория нет

- [ ] **Step 3: Написать репозиторий**

`find(executor, kind)`, `save(tx, kind, subjectId, input)`, `remove(tx, kind)`, `findAll(executor)`. Шифрование — `CryptoService` (модуль глобальный, импортировать его не нужно). Запись — один `insert … onConflictDoUpdate({ target: modelServices.kind, set: … })`; поле `secret_encrypted` попадает в `set` **только когда поле `secret` присутствует** во входе, иначе прежний ключ остался бы затёртым `null`.

Субъект **в сигнатуре не нужен**: настройка межпроектна, права проверяет `SuperadminGuard` на контроллере — то же устройство, что у `ServersRepository` (`create(tx, input)`, без субъекта). `updatedBySubjectId` приходит параметром, потому что это данные, а не проверка.

- [ ] **Step 4: Прогнать**

Run: `cd apps/api && npx vitest run src/model-services/model-services.repository.test.ts`
Expected: PASS

---

## Чанк 3: Разрешение настройки

### Task 7: Окружение как запасной источник

**Files:**
- Modify: `apps/api/src/summaries/suggester/settings.ts`
- Modify: `apps/api/src/summaries/suggester/settings.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
it('разбор окружения отдаёт схему авторизации, а не домысливает её', () => {
  process.env[SUGGESTER_AUTH_SCHEME_ENV] = 'api_key';

  expect(suggesterSettings().authScheme).toBe(ModelAuthScheme.ApiKey);
});

it('умолчание схемы — bearer: так устроены OpenAI и ProxyAPI', () => {
  delete process.env[SUGGESTER_AUTH_SCHEME_ENV];

  expect(suggesterSettings().authScheme).toBe(ModelAuthScheme.Bearer);
});

it('мусор в схеме даёт умолчание, а не отказ', () => {
  // Тот же принцип, что у чисел: мусор означает умолчание.
  process.env[SUGGESTER_AUTH_SCHEME_ENV] = 'ПочтиApiKey';

  expect(suggesterSettings().authScheme).toBe(ModelAuthScheme.Bearer);
});

it('при схеме none ключ не требуется для включённости', () => {
  process.env[SUGGESTER_AUTH_SCHEME_ENV] = 'none';
  process.env[SUGGESTER_BASE_URL_ENV] = 'http://llm.internal:8000/v1';
  delete process.env[SUGGESTER_API_KEY_ENV];

  expect(suggesterSettings().isEnabled).toBe(true);
});

it('каталог читается и пустой означает отсутствие', () => {
  process.env[SUGGESTER_FOLDER_ENV] = ' b1g… ';

  expect(suggesterSettings().folder).toBe('b1g…');
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries/suggester/settings.test.ts`
Expected: FAIL — `authScheme` и `folder` в настройках нет

- [ ] **Step 3: Дописать разбор**

Две новые переменные — `CAIRN_TASK_SUGGESTER_AUTH_SCHEME` (умолчание `bearer`) и `CAIRN_TASK_SUGGESTER_FOLDER` (умолчание пусто). `SuggesterSettings` получает `authScheme` и `folder`. Условие `isEnabled` меняется: ключ обязателен, когда `authScheme !== none`, — вместо прежнего `kind === External`.

Это уточнение, а не смена поведения: на существующих установках `authScheme` по умолчанию `bearer`, а `local` без ключа теперь требует явного `none`. **Названная несовместимость**: установка с `CAIRN_TASK_SUGGESTER=local` и без ключа после обновления окажется ненастроенной, пока не пропишет `AUTH_SCHEME=none`. Записать в README (чанк 6, Task 20) отдельной строкой.

- [ ] **Step 4: Прогнать**

Run: `cd apps/api && npx vitest run src/summaries/suggester/settings.test.ts`
Expected: PASS

---

### Task 8: Служба разрешения — база главнее

**Files:**
- Create: `apps/api/src/model-services/model-service-settings.service.ts`
- Create: `apps/api/src/model-services/model-service-settings.service.test.ts`

- [ ] **Step 1: Написать падающий тест — главный в наборе**

```ts
describe('ModelServiceSettingsService.resolve', () => {
  it('без строки берёт настройку из окружения целиком', () => {
    // Установки, собранные по действующему README, продолжают работать
    // без единой правки (дизайн, 2.1).
    process.env[SUGGESTER_API_KEY_ENV] = 'из-окружения';

    expect(resolved.source).toBe(ModelServiceSource.Environment);
    expect(resolved.secret).toBe('из-окружения');
  });

  it('строка перебивает окружение', () => {
    expect(resolved.source).toBe(ModelServiceSource.Database);
    expect(resolved.baseUrl).toBe('https://из-базы/v1');
  });

  it('пустой ключ в строке НЕ доливается из окружения', async () => {
    // Главный инвариант дизайна (2.1). Доливание вернуло бы передачу
    // наружу человеку, который очистил поле намеренно.
    await repository.save(tx, kind, subject.id, { ...input, secret: null });
    process.env[SUGGESTER_API_KEY_ENV] = 'из-окружения';

    const resolved = await service.resolve(kind);

    expect(resolved.secret).toBeNull();
    expect(resolved.isOperational).toBe(false);
    expect(resolved.blockedBy).toBe('secret_missing');
  });

  it('ни строки, ни полного окружения — узел не настроен', () => {
    expect(resolved.source).toBe(ModelServiceSource.None);
    expect(resolved.isOperational).toBe(false);
  });

  it('снятая галочка выключает настроенный узел', async () => {
    await repository.save(tx, kind, subject.id, { ...input, isEnabled: false, secret: 'есть' });

    const resolved = await service.resolve(kind);

    // isEnabled и isOperational не сводятся в одно поле: «выключено
    // вами» и «не хватает ключа» чинятся разным действием (дизайн, 4.1).
    expect(resolved.isEnabled).toBe(false);
    expect(resolved.isOperational).toBe(false);
    expect(resolved.blockedBy).toBe('disabled');
  });

  it('нерасшифровываемый ключ выключает узел и называет причину', async () => {
    expect(resolved.blockedBy).toBe('secret_undecryptable');
  });

  it('проекция для экрана ключа не содержит', async () => {
    const settings = await service.settings(kind);

    // Сравнение целиком, а не поиск отсутствия подстроки: новая ручка
    // не должна получать ключ в ответе бесплатно (дизайн, 5.2).
    expect(Object.keys(settings).some((key) => key === 'secret')).toBe(false);
    expect(settings.hasSecret).toBe(true);
  });

  it('называет имена переменных окружения и то, действуют ли они', async () => {
    await repository.save(tx, kind, subject.id, input);
    process.env[SUGGESTER_API_KEY_ENV] = 'из-окружения';

    const settings = await service.settings(kind);

    // Без этой строки администратор, вписавший ключ в `.env` и
    // перезапустивший API, не имеет никакого способа узнать, почему
    // ничего не изменилось (дизайн, 2.2).
    expect(settings.source).toBe(ModelServiceSource.Database);
    expect(settings.hasEnvironmentSettings).toBe(true);
    expect(settings.envVarNames).toContain(SUGGESTER_API_KEY_ENV);
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/model-services/model-service-settings.service.test.ts`
Expected: FAIL — службы нет

- [ ] **Step 3: Написать службу**

Два метода: `resolve(kind): Promise<ResolvedModelService>` (с ключом, только для потребителей внутри процесса) и `settings(kind): Promise<ModelServiceSettings>` (без ключа, для экрана). Плюс `allSettings()` для списка.

Разрешение — ровно алгоритм раздела 5.2 дизайна. **Ни одной ветки, сливающей базу с окружением.** В TSDoc класса написать это прямо, вместе с причиной: следующая правка обязана прочесть запрет, прежде чем «починить» доливание ключа.

`ResolvedModelService` и `ModelServiceSettings` — **разные типы**, и первый наружу не отдаётся ни одной ручкой.

- [ ] **Step 4: Прогнать**

Run: `cd apps/api && npx vitest run src/model-services/model-service-settings.service.test.ts`
Expected: PASS

---

## Чанк 4: Порт

### Task 9: Заголовок авторизации по схеме

**Files:**
- Modify: `apps/api/src/summaries/suggester/openai-compatible.suggester.ts`
- Modify: `apps/api/src/summaries/suggester/openai-compatible.suggester.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
it.each([
  [ModelAuthScheme.Bearer, 'Bearer ключ'],
  [ModelAuthScheme.ApiKey, 'Api-Key ключ'],
])('предъявляет ключ по схеме %s', async (authScheme, expected) => {
  // Сегодня настроить Yandex нельзя никакой правкой .env: он ждёт
  // `Api-Key`, а адаптер шлёт `Bearer` безусловно (дизайн, 6.1).
  await new OpenAiCompatibleSuggester({ ...settings, authScheme, apiKey: 'ключ' }).suggest(
    'текст',
    signal,
  );

  expect(headersOf(fetchMock)).toMatchObject({ Authorization: expected });
});

it('при схеме none заголовка авторизации нет вовсе', async () => {
  await new OpenAiCompatibleSuggester({
    ...settings,
    authScheme: ModelAuthScheme.None,
    apiKey: '',
  }).suggest('текст', signal);

  expect(headersOf(fetchMock)).not.toHaveProperty('Authorization');
});

it('каталог OpenAI-совместимому узлу не отправляется', async () => {
  // У Yandex каталог стоит внутри имени модели, которое человек вписал
  // целиком, и второе место для того же значения разошлось бы с первым
  // (дизайн, 6.3). Требует живой проверки — пункт 2 таблицы проверок.
  await new OpenAiCompatibleSuggester({ ...settings, folder: 'b1g…' }).suggest('текст', signal);

  expect(headersOf(fetchMock)).not.toHaveProperty('x-folder-id');
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries/suggester/openai-compatible.suggester.test.ts`
Expected: FAIL — `Api-Key` не ставится, `none` даёт `Bearer `

- [ ] **Step 3: Поправить адаптер**

Заменить ветку `if (this.#settings.apiKey !== '')` на выбор по `authScheme`. Приватный метод `authorizationOf(): string | null` — `null` при `none` и при пустом ключе.

Прежняя логика «заголовок есть, если ключ непустой» **остаётся запасной**: при `bearer`/`api_key` и пустом ключе заголовка нет (порт в этом состоянии и так выключен, но адаптер не вправе слать `Bearer ` с пустым значением).

- [ ] **Step 4: Прогнать**

Run: `cd apps/api && npx vitest run src/summaries/suggester/openai-compatible.suggester.test.ts`
Expected: PASS

---

### Task 10: Проверка связи в порту

**Files:**
- Modify: `apps/api/src/summaries/suggester/task-suggester.ts`
- Modify: `apps/api/src/summaries/suggester/openai-compatible.suggester.ts`
- Modify: `apps/api/src/summaries/suggester/disabled.suggester.ts`
- Modify: `apps/api/src/summaries/suggester/openai-compatible.suggester.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
describe('probe', () => {
  it('наружу уходит константа, а не данные проекта', async () => {
    // Иначе проверка связи стала бы способом отправить наружу
    // содержимое проекта действием, которое выглядит технической
    // проверкой (дизайн, 8.2). Тело сравнивается целиком.
    await suggester.probe(signal);

    expect(bodyOf(fetchMock)).toEqual({
      model: 'qwen/qwen3-max',
      max_tokens: PROBE_MAX_TOKENS,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `${TEXT_START}\n${PROBE_TEXT}\n${TEXT_END}` },
      ],
    });
  });

  it.each([
    [200, ModelProbeOutcome.Ok],
    [401, ModelProbeOutcome.Unauthorized],
    [403, ModelProbeOutcome.Unauthorized],
    [404, ModelProbeOutcome.NotFound],
    [400, ModelProbeOutcome.BadRequest],
    [429, ModelProbeOutcome.Unavailable],
    [500, ModelProbeOutcome.Unavailable],
  ])('ответ %s даёт исход %s', async (status, outcome) => {
    // Шесть исходов, а не «получилось / не получилось»: по ним человек
    // делает разное (дизайн, 4.3).
    expect((await suggester.probe(signal)).outcome).toBe(outcome);
  });

  it('тело чужого ответа в результат не попадает', async () => {
    // В нём бывает и эхо присланного, и «key sk-…abc is revoked», а
    // иногда и сам ключ в сообщении о неверном заголовке (дизайн, 8.3).
    fetchMock.mockResolvedValue(
      new Response('{"error":{"message":"key sk-утечка is revoked"}}', { status: 401 }),
    );

    const result = await suggester.probe(signal);

    expect(JSON.stringify(result)).not.toContain('sk-утечка');
    expect(result).toEqual({
      outcome: ModelProbeOutcome.Unauthorized,
      status: 401,
      host: 'api.proxyapi.ru',
      model: 'qwen/qwen3-max',
      durationMs: expect.any(Number),
    });
  });

  it('выключенный порт в сеть не ходит', async () => {
    await expect(new DisabledSuggester().probe(signal)).rejects.toThrow(SUGGESTER_DISABLED);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries/suggester/openai-compatible.suggester.test.ts`
Expected: FAIL — метода `probe` нет

- [ ] **Step 3: Дописать `probe`**

В интерфейс `TaskSuggester` — `probe(signal): Promise<ModelProbeResult>`. Константы `PROBE_TEXT` и `PROBE_MAX_TOKENS` — рядом с `SYSTEM_PROMPT`, с TSDoc «нагрузка проверки — константа в коде; данных проекта не отправляется ни байта».

`response_format` в теле проверки **не отправляется** намеренно: вопрос «принимает ли его Yandex» открыт (пункт 3 таблицы проверок), и проверка связи не должна падать из-за параметра, который она же и проверяет. Исход `bad_request` на реальной разбивке и подскажет, что дело в нём.

Отображение кодов в исходы — **чистой функцией** `probeOutcomeOf(status)` в своём файле с табличным тестом, по идиоме проекта. Она же понадобится адаптеру расшифровки.

`DisabledSuggester.probe` бросает тот же `SuggesterFailure(SUGGESTER_DISABLED, …)`, что `suggest`, и в сеть не ходит — это проверяется тестом.

- [ ] **Step 4: Прогнать**

Run: `cd apps/api && npx vitest run src/summaries/suggester/`
Expected: PASS

---

### Task 11: Источник адаптеров вместо внедрённого экземпляра

**Files:**
- Create: `apps/api/src/summaries/suggester/task-suggester.source.ts`
- Modify: `apps/api/src/summaries/suggester/task-suggester.ts`
- Modify: `apps/api/src/summaries/summaries.module.ts`
- Modify: `apps/api/src/summaries/summaries.service.ts`
- Modify: `apps/api/src/summaries/summaries-overview.controller.ts`
- Modify: `apps/api/src/summaries/summaries.service.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
it('смена настройки действует на следующем вызове, без перезапуска', async () => {
  // Отмена запрета «порт выбирается один раз при старте»: отмена
  // названа, и взамен каждая смена попадает в журнал (дизайн, 9.1).
  await settings.save({ ...input, model: 'первая' });
  await service.suggest(subject, projectId, summaryId);

  await settings.save({ ...input, model: 'вторая' });
  await service.suggest(subject, projectId, summaryId);

  expect(modelsOf(auditRows)).toEqual(['первая', 'вторая']);
});

it('вызов, ушедший в сеть, доходит на прежней настройке', async () => {
  // Иначе журнал называл бы один узел, а текст уехал бы на другой — то
  // есть журнал начал бы врать о передаче, о которой он единственный
  // след (дизайн, 9.3).
  const inFlight = service.suggest(subject, projectId, summaryId);
  await settings.save({ ...input, baseUrl: 'https://другой/v1' });
  await inFlight;

  expect(hostOf(fetchMock)).toBe('первый');
});

it('ненастроенный узел даёт выключенный порт, а не падение', async () => {
  await settings.remove();

  await expect(service.suggest(subject, projectId, summaryId)).rejects.toMatchObject({
    response: { code: SUGGESTER_DISABLED },
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries/summaries.service.test.ts`
Expected: FAIL — адаптер внедрён экземпляром, настройка на ходу не меняется

- [ ] **Step 3: Завести источник и переименовать токен**

`TaskSuggesterSource` — интерфейс с одним методом `current(): Promise<TaskSuggester>`; токен `TASK_SUGGESTER_SOURCE`. Прежний `TASK_SUGGESTER` **удаляется**, а не остаётся рядом: тест, подменивший его заглушкой-адаптером, обязан упасть типом, а не начать вести себя странно.

Фабрика в `summaries.module.ts` — из раздела 9.2 дизайна; `SummariesModule` импортирует `ModelServicesModule`.

- [ ] **Step 4: Поправить службу и контроллер**

`suggest()` первым делом берёт адаптер (`const suggester = await this.source.current()`) и дальше работает с ним ровно так, как сейчас с внедрённым: `isEnabled`, `maxChars`, `kind`→`placement`/`model`/`host` в журнал, построение отказа. `suggesterInfo()` становится `async`, вместе с ней — метод контроллера.

Больше в службе менять нечего: порядок «журнал → сеть → транзакция» и счётчик одновременных вызовов не затрагиваются.

- [ ] **Step 5: Прогнать саммари целиком**

Run: `cd apps/api && npx vitest run src/summaries/`
Expected: PASS

---

## Чанк 5: Ручки и журнал

### Task 12: Четыре действия журнала

**Files:**
- Modify: `apps/api/src/audit/audit.types.ts`
- Modify: `apps/web/src/components/AuditTable/constants.ts`

- [ ] **Step 1: Прогнать сторож и убедиться, что падает**

Сторож уже написан и падает сам, как только в API появляется действие без названия.

Run: `cd apps/api && npx vitest run src/audit` и `cd apps/web && npx vitest run src/components/AuditTable/constants.test.ts`
Expected: второй FAIL после шага 2 — порядок здесь обратный, потому что тест уже существует

- [ ] **Step 2: Дописать действия**

В `AuditAction` — четыре значения из раздела 11.1 дизайна, рядом с действиями серверов и доменов. У `ModelServiceSecretSet` — TSDoc с причиной отдельного действия: метаданные на экране журнала не показываются, значит «Изменён ключ службы модели» читается глазами, а `secretChanged: true` — нет.

- [ ] **Step 3: Убедиться, что сторож веба упал**

Run: `cd apps/web && npx vitest run src/components/AuditTable/constants.test.ts`
Expected: FAIL — четыре действия без русских названий

- [ ] **Step 4: Дописать названия**

Четыре строки в `ACTION_LABELS` — формулировки из раздела 11.4 дизайна.

- [ ] **Step 5: Прогнать**

Run: `cd apps/web && npx vitest run src/components/AuditTable/constants.test.ts`
Expected: PASS

---

### Task 13: Служба: транзакции, журнал, проверка связи

**Files:**
- Create: `apps/api/src/model-services/model-services.service.ts`
- Create: `apps/api/src/model-services/model-services.service.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
it('правка полей пишет одну запись с именами полей, но не значениями', async () => {
  // Образец — ServersService: в журнал попадают имена изменённых полей
  // (servers.service.ts:74).
  await service.save(subject, kind, { ...input, model: 'другая' });

  expect(auditRows).toHaveLength(1);
  expect(auditRows[0]).toMatchObject({
    action: AuditAction.ModelServiceUpdated,
    entityType: 'model_service',
    // Идентификатор строки и есть значение перечня (дизайн, 11.1).
    entityId: 'task_suggester',
    // Настройка межпроектна и ни одному проекту не принадлежит.
    projectId: null,
  });
});

it('правка полей и ключа одним запросом пишет две записи в одной транзакции', async () => {
  // Образец есть: создание саммари пишет chronicle_entry.created и
  // summary.created одной транзакцией (дизайн, 11.2).
  await service.save(subject, kind, { ...input, model: 'другая', secret: 'новый' });

  expect(auditRows.map((row) => row.action)).toEqual([
    AuditAction.ModelServiceUpdated,
    AuditAction.ModelServiceSecretSet,
  ]);
});

it('ключ не попадает в метаданные ни одним полем', async () => {
  await service.save(subject, kind, { ...input, secret: 'sk-утечка' });

  // Сравнение целиком, а не поиск отсутствия подстроки.
  expect(JSON.stringify(auditRows)).not.toContain('sk-утечка');
  expect(auditRows.at(-1)?.metadata).toEqual({ host: 'api.proxyapi.ru', action: 'set' });
});

it('сброс к окружению пишет, что было', async () => {
  await service.save(subject, kind, input);
  await service.clear(subject, kind);

  expect(auditRows.at(-1)).toMatchObject({
    action: AuditAction.ModelServiceCleared,
    metadata: { previousHost: 'api.proxyapi.ru', previousModel: 'qwen/qwen3-max' },
  });
});

it('сброс отсутствующей строки не падает и не пишет в журнал', async () => {
  await expect(service.clear(subject, kind)).resolves.not.toThrow();
  expect(auditRows).toHaveLength(0);
});

it('проверка связи журналируется ПОСЛЕ вызова, с исходом', async () => {
  // Отличие от summary.tasks_suggested названо: гарантия «нет записи —
  // нет передачи» нужна передаче данных проекта, а здесь наружу уходит
  // константа из нашего исходника (дизайн, 8.5).
  await service.probe(subject, kind);

  expect(auditRows.at(-1)).toMatchObject({
    action: AuditAction.ModelServiceProbed,
    metadata: { outcome: ModelProbeOutcome.Unauthorized, status: 401 },
  });
});

it('проверка ненастроенного узла отвечает отказом и в сеть не идёт', async () => {
  await settings.remove();

  await expect(service.probe(subject, kind)).rejects.toMatchObject({
    response: { code: MODEL_SERVICE_NOT_CONFIGURED },
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

it('негодный адрес отвергается до записи в базу', async () => {
  await expect(
    service.save(subject, kind, { ...input, baseUrl: 'https://api.example/v1?key=sk-secret' }),
  ).rejects.toMatchObject({ response: { code: MODEL_SERVICE_BAD_URL } });

  expect(await repository.find(fixture.db, kind)).toBeNull();
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/model-services/model-services.service.test.ts`
Expected: FAIL — службы нет

- [ ] **Step 3: Написать службу**

`save`, `clear`, `probe`, `list`, `findByKind`. Транзакция и журнал — в службе, как у `ServersService`; разбор адреса — чистой функцией контракта **до** транзакции, и её ошибка превращается в `BadRequestException` с кодом в теле (тот же приём, что `plainTextOf` в `summaries.service.ts:425-434`).

`probe` берёт адаптер у источника, вызывает `probe`, пишет одну запись и возвращает результат — **в том числе при отказе узла**: отказ узла есть результат проверки, а не отказ нашей ручки.

- [ ] **Step 4: Прогнать**

Run: `cd apps/api && npx vitest run src/model-services/model-services.service.test.ts`
Expected: PASS

---

### Task 14: Контроллер под `SuperadminGuard`

**Files:**
- Create: `apps/api/src/model-services/model-services.controller.ts`
- Create: `apps/api/src/model-services/model-services.controller.test.ts`
- Create: `apps/api/src/model-services/model-services.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
it('не-суперадмину отвечает 403, а не 404', async () => {
  // Правило нераскрытия защищает сведения о том, какие проекты
  // существуют; существование раздела администрирования секретом не
  // является (TSDoc SuperadminGuard).
  await request(app).get('/model-services').expect(403);
});

it('список отдаёт и ненастроенные узлы', async () => {
  // Пустой список выглядел бы как «настраивать нечего» (дизайн, 5.1).
  const { body } = await request(app).get('/model-services').expect(200);

  expect(body).toHaveLength(Object.values(ModelServiceKind).length);
  expect(body[0]).toMatchObject({ source: ModelServiceSource.None });
});

it('ключ не выходит ни в одном ответе', async () => {
  await request(app).put('/model-services/task_suggester').send({ ...input, secret: 'sk-утечка' });

  const { body } = await request(app).get('/model-services/task_suggester').expect(200);

  expect(JSON.stringify(body)).not.toContain('sk-утечка');
  expect(body.hasSecret).toBe(true);
});

it('неизвестный узел — 404', async () => {
  await request(app).get('/model-services/почта').expect(404);
});

it('сброс идемпотентен', async () => {
  // Иначе кнопка «Вернуть настройку окружения», нажатая дважды,
  // показала бы отказ там, где желаемое состояние уже достигнуто.
  await request(app).delete('/model-services/task_suggester').expect(204);
  await request(app).delete('/model-services/task_suggester').expect(204);
});

it('неудачная проверка связи — 200, а не 502', async () => {
  // Наша ручка справилась: она выяснила, что чужой узел не отвечает, и
  // это и есть её результат (дизайн, 5.1).
  const { body } = await request(app).post('/model-services/task_suggester/probe').expect(200);

  expect(body.outcome).toBe(ModelProbeOutcome.Unavailable);
});

it('проверка связи тела не принимает', async () => {
  // Иначе ключ поехал бы в теле POST, которое попадает в логи
  // обратного прокси у любого, кто их включил (дизайн, 8.4).
  await request(app)
    .post('/model-services/task_suggester/probe')
    .send({ secret: 'sk-мимо-базы' })
    .expect(400);
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/model-services/model-services.controller.test.ts`
Expected: FAIL — контроллера нет

- [ ] **Step 3: Написать контроллер и модуль**

`@Controller('model-services') @UseGuards(SessionGuard, SuperadminGuard)` — ровно как `ServersController`. Пять ручек из раздела 5.1 дизайна; `:kind` валидируется `ZodValidationPipe` по `z.nativeEnum(ModelServiceKind)`, а не `ParseUUIDPipe`.

Ручка `probe` объявляет `@Body(new ZodValidationPipe(z.object({}).strict()))` — то есть **отвергает** любое тело. Это и есть исполнение решения 8.4 в коде, а не только на словах.

`ModelServicesModule` экспортирует `ModelServiceSettingsService` (его импортирует `SummariesModule`) и регистрируется в `app.module.ts` рядом с `ServersModule`.

- [ ] **Step 4: Прогнать**

Run: `cd apps/api && npx vitest run src/model-services/ && pnpm typecheck`
Expected: PASS

---

## Чанк 6: Веб, развёртывание, документация

### Task 15: Хуки и пункт меню

**Files:**
- Create: `apps/web/src/api/hooks/useQueryModelServices.ts`
- Create: `apps/web/src/api/hooks/useMutationModelService.ts`
- Modify: `apps/web/src/api/hooks/index.ts`
- Modify: `apps/web/src/components/AppNav/constants.ts`
- Modify: `apps/web/src/components/AppNav/AppNav.test.tsx`

- [ ] **Step 1: Написать падающий тест**

```ts
it('суперадмин видит пункт «Модели»', () => {
  render(<AppNav subject={superadmin} />);

  expect(screen.getByRole('link', { name: 'Модели' })).toBeInTheDocument();
});

it('обычный пользователь пункта «Модели» не видит', () => {
  // Это настройка установки, и не-суперадмину экран отвечает 403.
  render(<AppNav subject={user} />);

  expect(screen.queryByRole('link', { name: 'Модели' })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/web && npx vitest run src/components/AppNav/AppNav.test.tsx`
Expected: FAIL — пункта нет

- [ ] **Step 3: Дописать пункт и хуки**

`ADMIN_LINKS` получает `{ href: '/model-services', label: 'Модели' }` между «Доменами» и «Пользователями». Хуки — по образцу `useQueryServers`/`useMutationServer`; у мутаций инвалидируется ключ списка и ключ узла, а у `probe` — ничего (результат живёт в состоянии экрана).

- [ ] **Step 4: Прогнать**

Run: `cd apps/web && npx vitest run src/components/AppNav/`
Expected: PASS

---

### Task 16: Карточка узла

**Files:**
- Create: `apps/web/src/components/ModelServiceCard/ModelServiceCard.tsx`
- Create: `apps/web/src/components/ModelServiceCard/types.ts`
- Create: `apps/web/src/components/ModelServiceCard/constants.ts`
- Create: `apps/web/src/components/ModelServiceCard/index.ts`
- Create: `apps/web/src/components/ModelServiceCard/ModelServiceCard.test.tsx`

- [ ] **Step 1: Написать падающий тест**

```ts
it('первым делом называет источник настройки', () => {
  // Это первый вопрос, который задают (дизайн, 12.2).
  render(<ModelServiceCard settings={fromDatabase} />);

  expect(screen.getByText('Задано в интерфейсе')).toBeInTheDocument();
});

it('предупреждает, что переменные окружения не действуют, и называет их', () => {
  render(
    <ModelServiceCard
      settings={{ ...fromDatabase, hasEnvironmentSettings: true, envVarNames: ['CAIRN_TASK_SUGGESTER_API_KEY'] }}
    />,
  );

  expect(screen.getByText(/не действуют/)).toBeInTheDocument();
  expect(screen.getByText(/CAIRN_TASK_SUGGESTER_API_KEY/)).toBeInTheDocument();
});

it('различает «выключено вами» и «нет ключа»', () => {
  // Чинятся разным действием, и одно поле отправило бы человека искать
  // не то (дизайн, 4.1).
  render(<ModelServiceCard settings={{ ...fromDatabase, isEnabled: false, blockedBy: 'disabled' }} />);
  expect(screen.getByText('Выключено')).toBeInTheDocument();

  render(<ModelServiceCard settings={{ ...fromDatabase, hasSecret: false, blockedBy: 'secret_missing' }} />);
  expect(screen.getByText('Нет ключа')).toBeInTheDocument();
});

it('о ключе сообщает «задан», и больше ничего', () => {
  render(<ModelServiceCard settings={fromDatabase} />);

  expect(screen.getByText('Ключ задан')).toBeInTheDocument();
});

it('кнопки сброса нет, когда источник — окружение', () => {
  // Сбрасывать нечего: строки в базе нет.
  render(<ModelServiceCard settings={fromEnvironment} />);

  expect(screen.queryByRole('button', { name: /Вернуть настройку окружения/ })).toBeNull();
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/web && npx vitest run src/components/ModelServiceCard/`
Expected: FAIL — компонента нет

- [ ] **Step 3: Написать компонент**

Шесть блоков из раздела 12.2 дизайна. Подписи источника, причин `blockedBy` и русские имена схем авторизации — картами в `constants.ts` (массивы и объекты из JSX — в `constants.ts`, соглашение проекта). Компонент до 100 строк; подпись источника и строка состояния при необходимости выносятся подкомпонентами в ту же директорию.

- [ ] **Step 4: Прогнать**

Run: `cd apps/web && npx vitest run src/components/ModelServiceCard/`
Expected: PASS

---

### Task 17: Форма с пресетами

**Files:**
- Create: `apps/web/src/components/ModelServiceForm/ModelServiceForm.tsx`
- Create: `apps/web/src/components/ModelServiceForm/constants.ts`
- Create: `apps/web/src/components/ModelServiceForm/types.ts`
- Create: `apps/web/src/components/ModelServiceForm/index.ts`
- Create: `apps/web/src/components/ModelServiceForm/ModelServiceForm.test.tsx`

- [ ] **Step 1: Написать падающий тест**

```ts
it('пресет заполняет адрес и схему, но не имя модели', async () => {
  // Перечень моделей у провайдера меняется быстрее, чем выходит наш
  // код, и подставленное `gpt-4o-mini` в узле Yandex выглядело бы
  // настроенным и отвечало бы 400 (дизайн, 10.3).
  render(<ModelServiceForm settings={empty} onSave={onSave} />);
  await userEvent.selectOptions(screen.getByLabelText('Пресет'), 'yandex');

  expect(screen.getByLabelText('Адрес')).toHaveValue('https://llm.api.cloud.yandex.net/v1');
  expect(screen.getByLabelText('Схема авторизации')).toHaveValue(ModelAuthScheme.ApiKey);
  expect(screen.getByLabelText('Модель')).toHaveValue('');
});

it('пресет «свой узел» адреса не подставляет', async () => {
  // Подставить внешний адрес локальной установке значило бы тихо
  // отправить текст наружу (дизайн, 10.3).
  await userEvent.selectOptions(screen.getByLabelText('Пресет'), 'custom');

  expect(screen.getByLabelText('Адрес')).toHaveValue('');
  expect(screen.getByLabelText('Схема авторизации')).toHaveValue(ModelAuthScheme.None);
});

it('пресет при заполненных полях спрашивает подтверждение', async () => {
  render(<ModelServiceForm settings={fromDatabase} onSave={onSave} />);
  await userEvent.selectOptions(screen.getByLabelText('Пресет'), 'openai');

  expect(screen.getByRole('dialog')).toHaveTextContent(/Адрес и схема будут заменены/);
});

it('поле ключа пустое при открытии и только на запись', () => {
  render(<ModelServiceForm settings={fromDatabase} onSave={onSave} />);
  const secret = screen.getByLabelText('Ключ');

  // Заполнять его текущим значением нечем: сервер его не отдаёт.
  expect(secret).toHaveValue('');
  expect(secret).toHaveAttribute('type', 'password');
  expect(secret).toHaveAttribute('autocomplete', 'new-password');
});

it('сохранение без правки ключа поля ключа не отправляет', async () => {
  // Отсутствие поля означает «не менять»; пустая строка схемой
  // отвергается, чтобы открыть форму и сохранить не значило стереть
  // ключ (дизайн, 4.2).
  await userEvent.clear(screen.getByLabelText('Модель'));
  await userEvent.type(screen.getByLabelText('Модель'), 'другая');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

  expect(onSave).toHaveBeenCalledWith(expect.not.objectContaining({ secret: expect.anything() }));
});

it('«Убрать ключ» отправляет null', async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Убрать ключ' }));
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ secret: null }));
});

it('отказывает по негодному адресу до отправки', async () => {
  // Той же функцией контракта, что на сервере, и теми же словами.
  await userEvent.clear(screen.getByLabelText('Адрес'));
  await userEvent.type(screen.getByLabelText('Адрес'), 'http://api.example/v1');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

  expect(screen.getByRole('alert')).toHaveTextContent(/открытому каналу/);
  expect(onSave).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/web && npx vitest run src/components/ModelServiceForm/`
Expected: FAIL — компонента нет

- [ ] **Step 3: Написать форму**

Девять полей из раздела 12.3 дизайна в `Drawer` с прилипшей шапкой и одной кнопкой «Сохранить», `isDirty` сравнением с загруженным — идиома панели версии. Общий `Select` для пресета, схемы и вида; `TextField` для строк; `ConfirmDialog` на смену пресета.

Пресеты — константой в `constants.ts`, с комментарием-датой проверки и ссылками на документацию. У адреса Yandex — явная пометка «требует живой проверки» (пункт 1 таблицы проверок дизайна), чтобы следующая правка видела, что значение не подтверждено.

- [ ] **Step 4: Прогнать**

Run: `cd apps/web && npx vitest run src/components/ModelServiceForm/`
Expected: PASS

---

### Task 18: Исход проверки связи и экран

**Files:**
- Create: `apps/web/src/components/ModelProbeResult/` (компонент, `constants.ts`, `types.ts`, `index.ts`, тест)
- Create: `apps/web/src/app/(app)/model-services/page.tsx`
- Create: `apps/web/src/app/(app)/model-services/ModelServicesScreen.tsx`
- Create: `apps/web/src/app/(app)/model-services/ModelServicesScreen.test.tsx`

- [ ] **Step 1: Написать падающий тест**

```ts
it.each([
  [ModelProbeOutcome.Ok, /Связь есть/],
  [ModelProbeOutcome.Unauthorized, /Ключ не принят/],
  [ModelProbeOutcome.NotFound, /лишний или недостающий `\/v1`/],
  [ModelProbeOutcome.BadRequest, /неверное имя модели/],
  [ModelProbeOutcome.Unavailable, /не ответил/],
  [ModelProbeOutcome.BadResponse, /не тем/],
])('по исходу %s говорит, что делать', (outcome, expected) => {
  // Один общий «не вышло» отправил бы человека делать не то.
  render(<ModelProbeResult result={{ ...result, outcome }} />);

  expect(screen.getByRole('status')).toHaveTextContent(expected);
});

it('результат остаётся на экране, пока человек правит поле', async () => {
  // Всплывающее сообщение здесь не годится: по результату человек
  // правит настройку (дизайн, 12.2).
  render(<ModelServicesScreen />);
  await userEvent.click(screen.getByRole('button', { name: 'Проверить связь' }));
  await userEvent.click(screen.getByRole('button', { name: 'Править' }));

  expect(screen.getByRole('status')).toHaveTextContent(/Ключ не принят/);
});

it('сброс к окружению называет последствие, включая «перестанет работать»', async () => {
  // Администратор может не знать, что переменных на этой установке нет
  // вовсе, и тогда кнопка «вернуть» выглядит безопасной (дизайн, 12.3).
  await userEvent.click(screen.getByRole('button', { name: /Вернуть настройку окружения/ }));

  expect(screen.getByRole('dialog')).toHaveTextContent(/узел перестанет работать/);
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/web && npx vitest run "src/app/(app)/model-services/"`
Expected: FAIL — экрана нет

- [ ] **Step 3: Написать экран и компонент исхода**

Страница держит заголовок «Службы модели», экран — запрос, загрузку, ошибку и карточки (образец — `servers/page.tsx` + `ServersScreen`). Фразы по исходам — картой в `ModelProbeResult/constants.ts`; фразы собирает **интерфейс**, а не сервер (дизайн 8.3).

- [ ] **Step 4: Прогнать**

Run: `cd apps/web && npx vitest run "src/app/(app)/model-services/" src/components/ModelProbeResult/`
Expected: PASS

---

### Task 19: Подпись над кнопкой разбивки — переименованное поле

**Files:**
- Modify: компонент подписи на экране саммари (`apps/web/src/components/Summary*`, по месту чтения `suggester.kind`)
- Modify: его тест

- [ ] **Step 1: Прогнать и убедиться, что падает**

После переименования контракта (Task 1) `pnpm typecheck` уже падает на `suggester.kind`.

Run: `pnpm typecheck`
Expected: FAIL — поля `kind` в `TaskSuggesterInfo` больше нет

- [ ] **Step 2: Поправить чтение поля**

`kind` → `placement`. Поведение подписи не меняется: «в вашем контуре» при `local`, «Текст саммари уходит на этот адрес» при `external`.

- [ ] **Step 3: Прогнать**

Run: `cd apps/web && npx vitest run src/components && pnpm typecheck`
Expected: PASS

---

### Task 20: Развёртывание и документация

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Две новые переменные в трёх местах**

`CAIRN_TASK_SUGGESTER_AUTH_SCHEME` (умолчание `bearer`) и `CAIRN_TASK_SUGGESTER_FOLDER` (умолчание пусто) — в `.env.example`, в `docker-compose.yml` (`api.environment`, через `${VAR:-умолчание}`) и в README. Пропущенная в compose переменная уже стоила проекту дефекта, и комментарий об этом там висит.

- [ ] **Step 2: Переписать раздел README про настройку разбивки**

Что должно быть сказано, по пунктам:

1. **Два пути настройки, и какой главный**: экран «Модели» (действует сразу) и `.env` с перезапуском (действует, пока в базе нет записи).
2. **Предупреждение, за которым приходят чаще всего**: «вписали в `.env`, перезапустили, ничего не изменилось» означает, что настройка задана в интерфейсе; экран это говорит и сам, кнопка «Вернуть настройку окружения» это чинит. Поставить там же, где сказано про ключ шифрования, — по тому же образцу честного предупреждения.
3. **Ключ в базе шифруется тем же `CAIRN_ENCRYPTION_KEY`**, что значения переменных проекта, и в резервную копию базы этот ключ не входит. Восстановление на машине с другим ключом даёт узел с нерасшифровываемым ключом — экран скажет об этом словами.
4. **Версий ключа нет**: сменил — старый у провайдера не вернуть.
5. **Несовместимость из Task 7, Step 3**: установка с `CAIRN_TASK_SUGGESTER=local` и без ключа обязана дописать `CAIRN_TASK_SUGGESTER_AUTH_SCHEME=none`, иначе узел окажется ненастроенным.
6. **Проверка связи платная и ручная**, делает живой вызов, наружу отправляет фразу-константу, а не данные проекта.
7. **Семь прежних переменных остаются**, но пять из них (`BASE_URL`, `API_KEY`, `MODEL`, `TIMEOUT_SECONDS`, плюс новые две) — запасной источник, а `MAX_CHARS` и `MAX_TASKS` — единственный: это настройка нашего поведения, а не провайдера.

- [ ] **Step 3: Поправить `CLAUDE.md`**

Абзац состояния репозитория: у служб модели появился экран администрирования, настройка живёт в базе с шифрованным ключом и действует без перезапуска, окружение осталось запасным источником. Строка источника правды — на этот дизайн и этот план.

Там же снять утверждение, которое этот дизайн отменяет: настройка предложителя больше не «только `.env`, перезапуск API».

- [ ] **Step 4: Полная проверка**

Run: `pnpm test && pnpm typecheck`
Expected: PASS

Run: `pnpm build`
Expected: на Windows сборка веба кончается `EPERM` на symlink — это известное свойство окружения, а не дефект кода. Проверять `pnpm build` имеет смысл на Linux или в контейнере.

- [ ] **Step 5: Проверить миграции на чистой базе**

Run: `cd apps/api && npx vitest run src/db` (интеграционные тесты поднимают PostgreSQL и применяют все миграции по порядку)
Expected: PASS — иначе номер миграции столкнулся с планом расшифровки, и миграцию надо **перегенерировать**, а не переименовать

---

## Проверка полноты

Перед сдачей — пройтись по десяти требованиям дизайна и убедиться, что каждое закрыто тестом, а не только кодом:

| Требование | Где закрыто |
|---|---|
| Ключ шифруется тем же механизмом | Task 6, Step 1 — формат `v1:` и обратная расшифровка |
| Версий значения нет | следствие схемы: таблицы версий не появилось |
| Правит только суперадмин | Task 14, Step 1 — `403` не-суперадмину |
| База главнее, окружение запасное, источник целен | Task 8, Step 1 — пять тестов, включая главный «пустой ключ не доливается» |
| Схема авторизации полем | Task 9, Step 1 — `Bearer`, `Api-Key`, `none` |
| Один механизм на оба порта | устройство: перечень узлов, общая таблица, `probeOutcomeOf` переиспользуема |
| Ключ не выходит наружу | Task 6 (база), Task 10 (отказ), Task 13 (журнал), Task 14 (ответ), Task 16, Task 17 (экран) |
| Журнал: четыре действия с русскими названиями | Task 12 (сторож), Task 13 (метаданные) |
| Проверка связи: константа, журнал, отказ без утечки | Task 10, Task 13 |
| Настройка меняется на ходу; начатая разбивка доходит на прежней | Task 11, Step 1 — два теста |
| Пресеты не хранятся и не врут | Task 3 (`.strict()` отвергает `preset`), Task 17 (модель не подставляется) |
