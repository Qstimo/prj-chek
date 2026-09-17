# Статус по адресу — план реализации

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Убрать отдельный адрес health-проверки: все три проверки идут по доменам окружения, и результат каждой лежит у адреса.

**Architecture:** Четыре части по возрастанию цены ошибки: контракт и чистая проверка (ничего не ломает), база с миграцией (переносит живые данные), сведение статуса (раннер, репозиторий, индикатор), интерфейс. Модель прав не меняется нигде.

**Tech Stack:** pnpm workspaces, NestJS, Drizzle + PostgreSQL, zod в `packages/shared`, Next.js 15, Vitest + React Testing Library, Testcontainers.

**Основание:** `docs/superpowers/specs/2026-09-17-cairn-status-by-address-design.md`

---

## Как работать с этим планом

TDD: сначала падающий тест, затем реализация. Линтера в проекте нет.

| Что | Команда |
|---|---|
| Все тесты | `pnpm test` |
| Точечно API | `pnpm --filter @cairn/api test -- --run src/путь` |
| Точечно веб | `pnpm --filter @cairn/web test -- --run src/путь` |
| Типы | `pnpm typecheck` |
| Миграция | `pnpm --filter @cairn/api db:generate` |

Соглашения: компонент до 100 строк в своей директории с `index.ts`, пропсы — `IProps` в `types.ts`, TSDoc на русском, `any` запрещён.

### Структура файлов

| Файл | Ответственность |
|---|---|
| `packages/shared/src/schemas/environment.ts` | `healthCheckPath` вместо `healthCheckUrl` |
| `packages/shared/src/schemas/status.ts` | статус адреса: health рядом с TLS и сроком |
| `apps/api/src/status/checkers/health.checker.ts` | URL собирается из адреса и пути, откат на http |
| `apps/api/src/db/schema/{environments,status}.ts` | колонка пути, поля health у адреса, удаление таблицы |
| `apps/api/drizzle/0023_health_by_address.sql` | перенос пути и хоста, удаление таблицы |
| `apps/api/test/health-address-migration.test.ts` | проверка переноса на живой базе |
| `apps/api/src/status/status.projection.ts` | вывод здоровья окружения из его адресов |
| `apps/api/src/status/indicator.ts` | предупреждения и индикатор считаются по адресам |
| `apps/api/src/status/status.repository.ts` | одна строка статуса на адрес |
| `apps/api/src/status/status-runner.service.ts` | цели обхода — адреса |
| `apps/web/src/components/StatusByEnvironment/*` | адреса под своим окружением |
| `apps/web/src/components/EnvironmentForm/*`, `EnvironmentCard/*` | поле пути вместо адреса |

---

## Chunk 1: Контракт и проверка

### Task 1.1: Путь проверки в контракте

**Files:**
- Modify: `packages/shared/src/schemas/environment.ts`
- Modify: `packages/shared/src/schemas/environment.test.ts`

- [ ] **Step 1: Падающие тесты**

```ts
describe('путь проверки', () => {
  it('принимает путь ручки приложения', () => {
    expect(environmentUpdateSchema.parse({ healthCheckPath: '/api/health' }).healthCheckPath).toBe(
      '/api/health',
    );
  });

  it('принимает отсутствие пути: проверяется корень', () => {
    expect(environmentUpdateSchema.parse({ healthCheckPath: null }).healthCheckPath).toBeNull();
  });

  it('отвергает полный URL: адрес у окружения один — его домены', () => {
    expect(() =>
      environmentUpdateSchema.parse({ healthCheckPath: 'https://example.com/health' }),
    ).toThrow();
  });

  it('отвергает путь без ведущего слеша', () => {
    expect(() => environmentUpdateSchema.parse({ healthCheckPath: 'api/health' })).toThrow();
  });

  it('отвергает строку запроса и якорь', () => {
    expect(() => environmentUpdateSchema.parse({ healthCheckPath: '/health?deep=1' })).toThrow();
    expect(() => environmentUpdateSchema.parse({ healthCheckPath: '/health#top' })).toThrow();
  });
});
```

Существующие тесты с `healthCheckUrl` в этом файле переписать на `healthCheckPath`.

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `pnpm --filter @cairn/shared test`

- [ ] **Step 3: Реализация**

В `environmentUpdateSchema` вместо `healthCheckUrl`:

```ts
  /**
   * Путь ручки проверки, а не адрес: адресами служат домены окружения.
   *
   * Форма проверяется намеренно строго. Стоит разрешить сюда полный URL —
   * и появится второе место для адреса, то самое, из-за которого статус
   * расходился с доменами.
   */
  healthCheckPath: z
    .string()
    .trim()
    .max(200)
    .regex(/^\/[^\s?#]*$/, 'Путь начинается со слеша, без адреса и строки запроса')
    .nullable()
    .optional(),
```

В `environmentDetailSchema` — `healthCheckPath: z.string().nullable()`.

- [ ] **Step 4: Запустить** → PASS.
- [ ] **Step 5: Коммит**

```bash
git add packages/shared/src/schemas/environment.ts packages/shared/src/schemas/environment.test.ts
git commit -m "Спрашивать путь проверки вместо второго адреса"
```

### Task 1.2: Статус адреса в контракте

**Files:**
- Modify: `packages/shared/src/schemas/status.ts`
- Modify: `packages/shared/src/schemas/status.test.ts`

- [ ] **Step 1: Падающие тесты**

```ts
it('статус адреса держит все три проверки', () => {
  const parsed = domainStatusSchema.parse({
    domainId: DOMAIN_ID,
    environmentId: ENVIRONMENT_ID,
    name: 'stage.example.com',
    health: HealthState.Down,
    latencyMs: 120,
    healthError: 'HTTP 502',
    tlsValidTo: null,
    tlsError: null,
    registryExpiresAt: null,
    registryError: null,
    checkedAt: '2026-09-17T10:00:00.000Z',
  });

  expect(parsed.health).toBe(HealthState.Down);
  expect(parsed.environmentId).toBe(ENVIRONMENT_ID);
});

it('статус окружения — вывод, а не измерение', () => {
  // Задержка и причина принадлежат адресу: у окружения их несколько.
  const parsed = environmentStatusSchema.parse({
    environmentId: ENVIRONMENT_ID,
    name: 'Прод',
    health: HealthState.Up,
    checkedAt: '2026-09-17T10:00:00.000Z',
  });

  expect(parsed.health).toBe(HealthState.Up);
});
```

- [ ] **Step 2: Запустить, убедиться что падают**
- [ ] **Step 3: Реализация**

`domainStatusSchema` получает `environmentId: z.string().uuid()`, `health: z.nativeEnum(HealthState).nullable()`, `latencyMs: z.number().int().nonnegative().nullable()`, `healthError: z.string().nullable()`.

Из `environmentStatusSchema` уходят `latencyMs` и `error`.

- [ ] **Step 4: Запустить** → PASS. `pnpm typecheck` покажет все места, где проекции разошлись, — это ожидаемо и чинится в Chunk 3 и 4.
- [ ] **Step 5: Коммит**

```bash
git add packages/shared/src/schemas/status.ts packages/shared/src/schemas/status.test.ts
git commit -m "Свести три проверки в статус одного адреса"
```

### Task 1.3: Проверка собирает URL сама

**Files:**
- Modify: `apps/api/src/status/checkers/health.checker.ts`
- Modify: `apps/api/src/status/checkers/health.checker.test.ts`

- [ ] **Step 1: Падающие тесты**

```ts
it('собирает адрес из имени и пути', async () => {
  const fetchFn = vi.fn().mockResolvedValue({ status: 200 });

  await checkHealth('stage.example.com', '/api/health', fetchFn);

  expect(fetchFn.mock.calls[0]?.[0]).toBe('https://stage.example.com/api/health');
});

it('без пути проверяет корень', async () => {
  const fetchFn = vi.fn().mockResolvedValue({ status: 200 });

  await checkHealth('stage.example.com', null, fetchFn);

  expect(fetchFn.mock.calls[0]?.[0]).toBe('https://stage.example.com/');
});

it('стенд без сертификата пробуется по http', async () => {
  // Он отвечает — звать его мёртвым неверно. Об отсутствии сертификата
  // скажет проверка TLS того же адреса.
  const fetchFn = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('fetch failed'))
    .mockResolvedValueOnce({ status: 200 });

  const result = await checkHealth('stend.example.com', null, fetchFn);

  expect(result.health).toBe('up');
  expect(fetchFn.mock.calls[1]?.[0]).toBe('http://stend.example.com/');
});

it('ответ сервера по http не перепроверяется', async () => {
  // Сервер ответил — пусть и отказом. Вторая попытка тут ничего не узнает.
  const fetchFn = vi.fn().mockResolvedValue({ status: 500 });

  const result = await checkHealth('stage.example.com', null, fetchFn);

  expect(fetchFn).toHaveBeenCalledTimes(1);
  expect(result.error).toBe('HTTP 500');
});

it('когда не отвечает ни то ни другое, причина от https', async () => {
  const fetchFn = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('getaddrinfo ENOTFOUND'))
    .mockRejectedValueOnce(new TypeError('ECONNREFUSED'));

  const result = await checkHealth('нет.example.com', null, fetchFn);

  expect(result.health).toBe('down');
  expect(result.error).toContain('ENOTFOUND');
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `pnpm --filter @cairn/api test -- --run src/status/checkers/health`

- [ ] **Step 3: Реализация**

Сигнатура `checkHealth(address: string, path: string | null, fetchFn = fetch)`. Внутри:

- `urlOf(scheme, address, path)` — приватная функция, `path ?? '/'`;
- одна попытка по `https`; ответ сервера (любой статус) — результат;
- сетевой отказ — вторая попытка по `http`; её ответ — результат;
- отказ обеих — `down` с причиной первой попытки: спрашивали `https`, о нём и отвечаем.

Задержка меряется от начала первой попытки: человеку важно, сколько ждал он, а не сколько заняла удачная попытка.

- [ ] **Step 4: Запустить** → PASS.
- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/status/checkers
git commit -m "Проверять адрес окружения, а не отдельный URL"
```

---

## Chunk 2: База и миграция

### Task 2.1: Колонки

**Files:**
- Modify: `apps/api/src/db/schema/environments.ts`
- Modify: `apps/api/src/db/schema/status.ts`
- Modify: `apps/api/src/db/schema/environments.test.ts`, `status.test.ts`

- [ ] **Step 1: Падающие тесты**

В `environments.test.ts` — колонка `health_check_path` вместо `health_check_url`. В `status.test.ts`:

```ts
it('статус адреса хранит здоровье рядом со сроками', () => {
  const columns = getTableColumns(domainStatuses);

  expect(Object.keys(columns)).toEqual(
    expect.arrayContaining(['health', 'latencyMs', 'healthError', 'tlsValidTo']),
  );
});

it('отдельной таблицы статусов окружения больше нет', async () => {
  // Пока результаты лежали в двух таблицах с разными ключами, они могли
  // описывать разные хосты. Теперь ключ один — адрес.
  const schema = await import('../schema');

  expect('environmentStatuses' in schema).toBe(false);
});
```

- [ ] **Step 2: Запустить, убедиться что падают**
- [ ] **Step 3: Реализация**

`environments.healthCheckUrl` → `healthCheckPath: text('health_check_path')`.

В `domainStatuses` добавить `health: healthStateEnum('health')` (обнуляемый: адрес мог ещё не проверяться), `latencyMs: integer('latency_ms')`, `healthError: text('health_error')`.

Таблицу `environmentStatuses` и тип `EnvironmentStatusRow` удалить вместе с экспортами из `schema/index.ts`.

- [ ] **Step 4: Запустить** → PASS.
- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/db/schema
git commit -m "Держать здоровье адреса рядом с его сроками"
```

### Task 2.2: Миграция с переносом

**Files:**
- Create: `apps/api/drizzle/0023_health_by_address.sql` (имя и запись в `meta/_journal.json` даёт `db:generate --custom`)
- Create: `apps/api/test/health-address-migration.test.ts`

- [ ] **Step 1: Падающий тест миграции**

Образец — `apps/api/test/environment-host-migration.test.ts`: журнал применяется до границы, засеваются старые данные, затем применяется остаток.

```ts
it('переносит путь из адреса проверки', async () => {
  const [row] = await client`SELECT health_check_path FROM environments WHERE name = 'Прод'`;

  expect(row?.health_check_path).toBe('/api/health');
});

it('заводит хост проверки адресом окружения', async () => {
  // Хост и был адресом — просто вписанным не туда.
  const rows = await client`
    SELECT d.name FROM environment_domains d
    JOIN environments e ON e.id = d.environment_id
    WHERE e.name = 'Прод' ORDER BY d.name
  `;

  expect(rows.map((row) => row.name)).toContain('prod.example.com');
});

it('заводит корень перенесённого хоста в реестре', async () => {
  const rows = await client`SELECT name FROM domains ORDER BY name`;

  expect(rows.map((row) => row.name)).toContain('example.com');
});

it('хост, доменом не являющийся, сохраняет в заметках', async () => {
  const [row] = await client`SELECT notes FROM environments WHERE name = 'Стенд'`;

  expect(row?.notes).toContain('10.0.0.5:3000');
});

it('корень без пути оставляет путь пустым', async () => {
  const [row] = await client`SELECT health_check_path FROM environments WHERE name = 'Стейдж'`;

  expect(row?.health_check_path).toBeNull();
});
```

Засев: `Прод` с `health_check_url = 'https://prod.example.com/api/health'` и без доменов; `Стейдж` с `https://stage.example.com` и уже заведённым доменом `stage.example.com`; `Стенд` с `http://10.0.0.5:3000/health`.

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `pnpm --filter @cairn/api test -- --run test/health-address-migration`

- [ ] **Step 3: Реализация**

`pnpm --filter @cairn/api db:generate --custom --name=health_by_address`, затем написать SQL руками, по образцу `0021`:

1. `ALTER TABLE environments ADD COLUMN health_check_path text;`
2. Заполнить путь: всё от первого `/` после хоста, пустой результат — `NULL`.
3. Представление `cairn_health_host_moving`: хосты из URL, проходящие форму домена и не числящиеся среди адресов своего окружения.
4. Завести корни (`cairn_root_domain`, как в `0021`) и вставить адреса.
5. Хосты, доменом не являющиеся, дописать в `notes`: `'Адрес проверки: ' || ...`.
6. `ALTER TABLE domain_statuses ADD COLUMN health health_state, ADD COLUMN latency_ms integer, ADD COLUMN health_error text;`
7. `DROP TABLE environment_statuses;` — результаты относились к окружению, разложить их по адресам нечем, первый прогон наполнит заново.
8. `ALTER TABLE environments DROP COLUMN health_check_url;`
9. Права `cairn_app` на новые колонки — посмотреть, как это делает `0020_domain_privileges.sql`, и повторить, а не выдумывать.

- [ ] **Step 4: Запустить** → PASS. Затем весь `pnpm --filter @cairn/api test -- --run test/` — миграции трогают все интеграционные тесты.
- [ ] **Step 5: Коммит**

```bash
git add apps/api/drizzle apps/api/test/health-address-migration.test.ts
git commit -m "Перенести адрес проверки в домены окружения"
```

---

## Chunk 3: Сведение статуса

### Task 3.1: Здоровье окружения выводится из адресов

**Files:**
- Create: `apps/api/src/status/status.projection.ts`, `status.projection.test.ts`

- [ ] **Step 1: Падающий тест** (чистый, без базы)

```ts
describe('здоровье окружения по его адресам', () => {
  it('мёртвый адрес делает окружение аварийным', () => {
    const [environment] = environmentStatusesOf(
      [{ id: 'e1', name: 'Прод' }],
      [address('e1', HealthState.Up), address('e1', HealthState.Down)],
    );

    expect(environment?.health).toBe(HealthState.Down);
  });

  it('все живы — окружение живо', () => { /* Up */ });

  it('непроверенный адрес не делает окружение неизвестным', () => {
    // Один адрес проверен и жив, второй ещё нет: молчание второго не
    // отменяет того, что первый отвечает.
    const [environment] = environmentStatusesOf(
      [{ id: 'e1', name: 'Прод' }],
      [address('e1', HealthState.Up), address('e1', null)],
    );

    expect(environment?.health).toBe(HealthState.Up);
  });

  it('окружение без адресов — неизвестно', () => {
    const [environment] = environmentStatusesOf([{ id: 'e1', name: 'Прод' }], []);

    expect(environment?.health).toBeNull();
    expect(environment?.checkedAt).toBeNull();
  });

  it('время проверки — последнее среди адресов', () => { /* max */ });
});
```

- [ ] **Step 2: Запустить, убедиться что падает**
- [ ] **Step 3: Реализация**

`environmentStatusesOf(environments: { id: string; name: string }[], addresses: DomainStatus[]): EnvironmentStatus[]` — группировка по `environmentId`, правило «down, если хоть один down; up, если хоть один up; иначе null».

- [ ] **Step 4: Запустить** → PASS.
- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/status/status.projection.ts apps/api/src/status/status.projection.test.ts
git commit -m "Выводить здоровье окружения из его адресов"
```

### Task 3.2: Предупреждения называют адрес

**Files:**
- Modify: `apps/api/src/status/indicator.ts`, `indicator.test.ts`

- [ ] **Step 1: Падающие тесты**

```ts
it('предупреждение о падении называет адрес, а не окружение', () => {
  // «Стейдж не отвечает» не говорит, что чинить, а адрес говорит.
  const warnings = warningsOf([down('stage.example.com', 'HTTP 502')], NOW);

  expect(warnings[0]).toMatchObject({
    kind: StatusWarningKind.HealthDown,
    subject: 'stage.example.com',
    detail: 'HTTP 502',
  });
});

it('мёртвый адрес делает индикатор аварийным', () => {
  expect(indicatorOf(ProjectLifecycle.Active, [down('stage.example.com', null)], NOW)).toBe(
    StatusIndicator.Down,
  );
});

it('без единой проверки индикатор неизвестен', () => {
  expect(indicatorOf(ProjectLifecycle.Active, [], NOW)).toBe(StatusIndicator.Unknown);
});
```

- [ ] **Step 2: Запустить, убедиться что падают**
- [ ] **Step 3: Реализация**

`warningsOf(domains: DomainStatus[], now)` — окружения уходят из сигнатуры: всё, о чём предупреждают, принадлежит адресу. `indicatorOf(lifecycle, domains, now, extraWarnings)` — тем же образом.

- [ ] **Step 4: Запустить** → PASS.
- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/status/indicator.ts apps/api/src/status/indicator.test.ts
git commit -m "Называть в предупреждении адрес, который не отвечает"
```

### Task 3.3: Одна строка статуса на адрес

**Files:**
- Modify: `apps/api/src/status/status.repository.ts`, `status.repository.test.ts`

- [ ] **Step 1: Падающие тесты**

```ts
it('целями обхода служат адреса окружений', async () => {
  const targets = await repository.listTargets();

  expect(targets.addresses).toEqual([
    expect.objectContaining({ name: 'stage.example.com', healthCheckPath: '/api/health' }),
  ]);
});

it('пишет три проверки одной строкой', async () => {
  await repository.upsertAddressStatus(addressId, {
    health: HealthState.Up,
    latencyMs: 42,
    healthError: null,
    tlsValidTo: new Date('2027-01-01'),
    tlsError: null,
    registryExpiresAt: null,
    registryError: null,
  });

  const status = await repository.statusForProject(admin(), projectId);

  expect(status.domains[0]).toMatchObject({ health: HealthState.Up, latencyMs: 42 });
});

it('окружение живо, когда живы его адреса', async () => { /* status.environments[0].health */ });

it('окружение без адресов не проверяется', async () => {
  const status = await repository.statusForProject(admin(), projectId);

  expect(status.environments[0]?.health).toBeNull();
  expect(status.indicator).toBe(StatusIndicator.Unknown);
});
```

- [ ] **Step 2: Запустить, убедиться что падают**
- [ ] **Step 3: Реализация**

- `listTargets` возвращает `{ addresses: { id, name, healthCheckPath }[] }` — join `environment_domains` с `environments`;
- `upsertEnvironmentStatus` удаляется, `upsertDomainStatus` переименовывается в `upsertAddressStatus` и принимает все три проверки;
- `buildStatus` собирает адреса с `environmentId`, зовёт `environmentStatusesOf` и обновлённые `warningsOf`/`indicatorOf`.

- [ ] **Step 4: Запустить** → PASS.
- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/status/status.repository.ts apps/api/src/status/status.repository.test.ts
git commit -m "Хранить результат проверок у адреса"
```

### Task 3.4: Раннер обходит адреса

**Files:**
- Modify: `apps/api/src/status/status-runner.service.ts`, `status-runner.service.test.ts`
- Modify: `apps/api/test/status.e2e.test.ts`

- [ ] **Step 1: Падающие тесты**

```ts
it('по каждому адресу делает все три проверки', async () => {
  await runner.runAll();

  expect(checkers.checkHealth).toHaveBeenCalledWith('stage.example.com', '/api/health');
  expect(checkers.checkTls).toHaveBeenCalledWith('stage.example.com');
  expect(checkers.checkDomainExpiry).toHaveBeenCalledWith('stage.example.com');
});

it('падение одного адреса не прерывает обход', async () => { /* второй адрес проверен */ });
```

- [ ] **Step 2: Запустить, убедиться что падают**
- [ ] **Step 3: Реализация**

Один цикл по `targets.addresses`: три проверки, одна запись `upsertAddressStatus`.

- [ ] **Step 4: Запустить** → PASS. Затем `pnpm --filter @cairn/api test` целиком и `pnpm typecheck`.
- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/status apps/api/test/status.e2e.test.ts
git commit -m "Обходить проверками адреса окружений"
```

---

## Chunk 4: Интерфейс

### Task 4.1: Поле пути в форме и карточке

**Files:**
- Modify: `apps/web/src/components/EnvironmentForm/{EnvironmentForm.tsx,types.ts,constants.ts,EnvironmentForm.test.tsx}`
- Modify: `apps/web/src/components/EnvironmentCard/{EnvironmentCard.tsx,constants.ts,EnvironmentCard.test.tsx}`
- Modify: `apps/web/src/app/(app)/projects/[id]/infrastructure/InfrastructureScreen.tsx`
- Modify: `apps/web/src/api/errors.ts`, `errors.test.ts` (подпись поля в разборе отказа)

- [ ] **Step 1: Падающие тесты**

```tsx
it('спрашивает путь проверки, а не адрес', async () => {
  const onSubmit = vi.fn();
  render(<EnvironmentForm initial={initial} onSubmit={onSubmit} />);

  await userEvent.type(screen.getByLabelText('Название'), 'Прод');
  await userEvent.type(screen.getByLabelText('Путь проверки'), '/api/health');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ healthCheckPath: '/api/health' }),
  );
});

it('объясняет, что адресом служат домены', () => {
  render(<EnvironmentForm initial={initial} onSubmit={vi.fn()} />);

  expect(screen.getByText(/адресами служат домены/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Запустить, убедиться что падают**
- [ ] **Step 3: Реализация**

Подпись `healthCheckPath: 'Путь проверки'`, подсказка под полем: «Ручка приложения, например `/api/health`. Адресами служат домены окружения». В карточке — то же поле вместо «Адрес проверки».

- [ ] **Step 4: Запустить** → PASS.
- [ ] **Step 5: Коммит**

```bash
git add apps/web/src
git commit -m "Спрашивать у окружения путь проверки"
```

### Task 4.2: Статус показывается адресами под окружением

**Files:**
- Create: `apps/web/src/components/StatusByEnvironment/{index.ts,StatusByEnvironment.tsx,AddressStatusLine.tsx,types.ts,StatusByEnvironment.test.tsx}`
- Modify: `apps/web/src/app/(app)/projects/[id]/infrastructure/InfrastructureStatusPanel.tsx`

- [ ] **Step 1: Падающие тесты**

```tsx
it('показывает адреса под их окружением', () => {
  render(<StatusByEnvironment environments={[prod]} addresses={[upAddress, downAddress]} />);

  const prodItem = screen.getByRole('listitem', { name: 'Прод' });

  expect(within(prodItem).getByText(/stage\.example\.com/)).toBeInTheDocument();
});

it('у мёртвого адреса показывает причину', () => {
  render(<StatusByEnvironment environments={[prod]} addresses={[downAddress]} />);

  expect(screen.getByText(/не отвечает \(HTTP 502\)/)).toBeInTheDocument();
});

it('у живого адреса показывает задержку, сертификат и срок', () => { /* … */ });

it('окружение без адресов говорит, что проверять нечего', () => {
  render(<StatusByEnvironment environments={[prod]} addresses={[]} />);

  expect(screen.getByText(/нет адресов/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Запустить, убедиться что падают**
- [ ] **Step 3: Реализация**

`StatusByEnvironment` группирует адреса по `environmentId`; строка адреса — отдельный компонент `AddressStatusLine` (граница в 100 строк). Панель `InfrastructureStatusPanel` перестаёт рисовать два списка и отдаёт данные компоненту.

- [ ] **Step 4: Запустить** → PASS.
- [ ] **Step 5: Коммит**

```bash
git add apps/web/src
git commit -m "Показать статус адресами под их окружением"
```

---

## Финальная проверка

- [ ] `pnpm test` — зелено во всех рабочих пространствах
- [ ] `pnpm typecheck` — чисто
- [ ] `pnpm build` — собирается
- [ ] `grep -rn "healthCheckUrl\|health_check_url\|environmentStatuses" apps packages --include=*.ts --include=*.tsx | grep -v dist | grep -v drizzle/0` — пусто
- [ ] `CLAUDE.md`: адрес окружения — его домены, проверки идут по ним, путь ручки задаётся отдельно
