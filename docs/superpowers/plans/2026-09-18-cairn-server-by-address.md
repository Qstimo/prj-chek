# Машина определяется адресом — план реализации

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Машина перестаёт заводиться руками: адрес окружения разрешается в IP, реестр серверов наполняется сам, привязка встаёт в пустое место, расхождение становится предупреждением.

**Architecture:** Четыре части по возрастанию цены ошибки: контракт и чистые функции (ничего не ломают), база с простой миграцией, сведение (репозитории и раннер), интерфейс. Правило «завести, привязать, промолчать, предупредить» живёт одной чистой функцией и зовётся из двух мест — прогона и чтения статуса. Модель прав не меняется нигде.

**Tech Stack:** pnpm workspaces, NestJS, Drizzle + PostgreSQL, zod в `packages/shared`, Next.js 15, Vitest + React Testing Library, Testcontainers.

**Основание:** `docs/superpowers/specs/2026-09-18-cairn-server-by-address-design.md`

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
| Миграция | `cd apps/api && npx drizzle-kit generate --custom --name=<имя>` |

Соглашения: компонент до 100 строк в своей директории с `index.ts`, пропсы — `IProps` в `types.ts`, TSDoc на русском, `any` запрещён.

**Осторожно с `pnpm --filter ... test -- --run <путь>`**: двойное `--` съедает фильтр, и запускается весь набор, включая Testcontainers. Точечно — через `npx vitest run` из каталога приложения.

### Структура файлов

| Файл | Ответственность |
|---|---|
| `packages/shared/src/schemas/status.ts` | `resolvedIp` и `resolveError` в статусе адреса |
| `packages/shared/src/enums.ts` | два новых вида предупреждения |
| `apps/api/src/status/checkers/address.checker.ts` | разрешение имени в IP |
| `apps/api/src/servers/server-discovery.ts` | правило: завести, привязать, промолчать, предупредить |
| `apps/api/src/db/schema/status.ts` | колонки результата разрешения |
| `apps/api/src/db/schema/servers.ts` | индекс по `ip` |
| `apps/api/drizzle/0024_server_by_address.sql` | две колонки и индекс |
| `apps/api/src/status/status.repository.ts` | запись результата, проекция, цели второго прохода, предупреждения |
| `apps/api/src/servers/servers.repository.ts` | реестр по IP, заведение машины, привязка окружения |
| `apps/api/src/status/status-runner.service.ts` | четвёртая проверка и второй проход |
| `apps/web/src/components/StatusByEnvironment/AddressStatusLine.tsx` | строка «смотрит на IP» |
| `apps/web/src/components/EnvironmentForm/constants.ts` | подсказка у поля «Сервер» |

---

## Chunk 1: Контракт и чистые части

### Task 1.1: Результат разрешения в контракте

**Files:**
- Modify: `packages/shared/src/schemas/status.ts`
- Modify: `packages/shared/src/schemas/status.test.ts`
- Modify: `packages/shared/src/enums.ts`

- [ ] **Step 1: Падающие тесты**

В `status.test.ts`, внутрь набора про статус адреса:

```ts
it('статус адреса помнит, во что имя разрешилось', () => {
  // Разрешение — такая же наблюдаемая правда об имени, как срок
  // сертификата: место ей в той же строке.
  const parsed = domainStatusSchema.parse({
    domainId: DOMAIN_ID,
    environmentId: ENVIRONMENT_ID,
    name: 'stage.example.com',
    health: HealthState.Up,
    latencyMs: 12,
    healthError: null,
    resolvedIp: '203.0.113.10',
    resolveError: null,
    tlsValidTo: null,
    tlsError: null,
    registryExpiresAt: null,
    registryError: null,
    checkedAt: '2026-09-18T10:00:00.000Z',
  });

  expect(parsed.resolvedIp).toBe('203.0.113.10');
  expect(parsed.resolveError).toBeNull();
});
```

Существующие вызовы `domainStatusSchema.parse` в этом файле дополнить обоими полями со значением `null`.

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd packages/shared && npx vitest run src/schemas/status.test.ts`
Expected: FAIL — `resolvedIp` в разобранном объекте отсутствует.

- [ ] **Step 3: Реализация**

В `domainStatusSchema`, сразу после `healthError`:

```ts
  /**
   * Адрес, в который разрешилось имя. По нему находится машина.
   *
   * Только адрес, без имени машины: статус открыт уровню «метаданные»,
   * а имя сервера принадлежит уровню «чтение» и живёт в карточке
   * окружения.
   */
  resolvedIp: z.string().nullable(),
  resolveError: z.string().nullable(),
```

В `enums.ts`, в `StatusWarningKind`, после `DomainRenewalExpiring`:

```ts
  /**
   * Адрес смотрит не на ту машину, к которой привязано окружение.
   *
   * Переезд, опечатка в DNS и угнанная запись выглядят снаружи
   * одинаково: система говорит, но привязку не трогает.
   */
  ServerMismatch = 'server_mismatch',
  /**
   * Адреса окружения смотрят на разные машины.
   *
   * Появляется только у окружения без привязки: объясняет, почему
   * привязка не встала.
   */
  AddressesDisagree = 'addresses_disagree',
```

- [ ] **Step 4: Запустить**

Run: `cd packages/shared && npx vitest run`
Expected: PASS. `pnpm typecheck` покажет места, где проекции API ещё не знают о новых полях, — это ожидаемо и чинится в Chunk 3.

- [ ] **Step 5: Коммит**

```bash
git add packages/shared/src
git commit -m "Помнить в статусе адреса, во что имя разрешилось"
```

### Task 1.2: Проверщик разрешает имя

**Files:**
- Create: `apps/api/src/status/checkers/address.checker.ts`
- Create: `apps/api/src/status/checkers/address.checker.test.ts`

- [ ] **Step 1: Падающие тесты**

```ts
import { describe, expect, it, vi } from 'vitest';

import { resolveAddress } from './address.checker';

describe('resolveAddress', () => {
  it('возвращает первый адрес записи', async () => {
    // Раунд-робин здесь не поддерживается: берём первый и говорим
    // об этом в подсказке интерфейса.
    const resolveFn = vi.fn().mockResolvedValue(['203.0.113.10', '203.0.113.11']);

    const result = await resolveAddress('prod.example.com', resolveFn);

    expect(result).toEqual({ ip: '203.0.113.10', error: null });
    expect(resolveFn).toHaveBeenCalledWith('prod.example.com');
  });

  it('пустой ответ — не адрес, а причина', async () => {
    const resolveFn = vi.fn().mockResolvedValue([]);

    expect(await resolveAddress('prod.example.com', resolveFn)).toEqual({
      ip: null,
      error: 'запись не найдена',
    });
  });

  it('несуществующее имя — причина, а не исключение', async () => {
    // Недоступность — данные проверки, а не авария: тем же правилом
    // живут остальные три проверщика.
    const resolveFn = vi.fn().mockRejectedValue(new Error('queryA ENOTFOUND нет.example.com'));

    const result = await resolveAddress('нет.example.com', resolveFn);

    expect(result.ip).toBeNull();
    expect(result.error).toContain('ENOTFOUND');
  });

  it('незнакомый отказ не остаётся без текста', async () => {
    const resolveFn = vi.fn().mockRejectedValue('строка вместо ошибки');

    expect((await resolveAddress('prod.example.com', resolveFn)).error).toBe(
      'неизвестная ошибка',
    );
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/api && npx vitest run src/status/checkers/address.checker.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализация**

```ts
import { Resolver } from 'node:dns/promises';

/** Результат разрешения имени. */
export interface ResolveResult {
  ip: string | null;
  error: string | null;
}

/** Разрешение имени в список адресов; в тестах подменяется подделкой. */
export type AddressResolve = (name: string) => Promise<string[]>;

/** Предел ожидания ответа DNS. */
const TIMEOUT_MS = 10_000;

/**
 * Разрешает адрес окружения в IP (спека 3.1).
 *
 * Не бросает исключений: неразрешимое имя — данные проверки, а не авария.
 * Несколько записей — берётся первая: раунд-робин здесь не поддерживается.
 */
export async function resolveAddress(
  name: string,
  resolveFn: AddressResolve = resolvePublicRecord,
): Promise<ResolveResult> {
  try {
    const [ip] = await resolveFn(name);

    return ip ? { ip, error: null } : { ip: null, error: 'запись не найдена' };
  } catch (cause) {
    return {
      ip: null,
      error: cause instanceof Error ? cause.message : 'неизвестная ошибка',
    };
  }
}

/**
 * Спрашивает DNS напрямую, минуя `/etc/hosts`.
 *
 * `resolve4`, а не `lookup`: нужна публичная запись имени, а не то, что
 * подставит системный резолвер контейнера. Зоны без A-записи спрашиваются
 * по AAAA — окружение может жить и на IPv6.
 */
async function resolvePublicRecord(name: string): Promise<string[]> {
  const resolver = new Resolver({ timeout: TIMEOUT_MS, tries: 1 });

  try {
    return await resolver.resolve4(name);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENODATA') {
      return resolver.resolve6(name);
    }

    throw cause;
  }
}
```

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/status/checkers/address.checker.test.ts`
Expected: PASS, 4 теста.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/status/checkers/address.checker.ts apps/api/src/status/checkers/address.checker.test.ts
git commit -m "Разрешать адрес окружения в IP"
```

### Task 1.3: Правило «завести, привязать, промолчать, предупредить»

**Files:**
- Create: `apps/api/src/servers/server-discovery.ts`
- Create: `apps/api/src/servers/server-discovery.test.ts`

- [ ] **Step 1: Падающие тесты**

```ts
import { StatusWarningKind } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { decideMachine, machineWarningsOf } from './server-discovery';

const SERVER_ID = '11111111-1111-4111-8111-111111111111';

/** Реестр по IP: в большинстве случаев одна машина на адрес. */
function registry(...machines: { id: string; ip: string }[]): Map<string, { id: string }[]> {
  const byIp = new Map<string, { id: string }[]>();

  for (const machine of machines) {
    byIp.set(machine.ip, [...(byIp.get(machine.ip) ?? []), { id: machine.id }]);
  }

  return byIp;
}

describe('решение о машине', () => {
  it('окружение без привязки и один адрес — привязать к найденной машине', () => {
    const decision = decideMachine({
      environmentName: 'Прод',
      isBound: false,
      boundIp: null,
      addresses: [{ name: 'prod.example.com', resolvedIp: '203.0.113.10' }],
      machinesByIp: registry({ id: SERVER_ID, ip: '203.0.113.10' }),
    });

    expect(decision).toEqual({ createIp: null, bindServerId: SERVER_ID, warnings: [] });
  });

  it('незнакомый адрес заводит машину', () => {
    const decision = decideMachine({
      environmentName: 'Прод',
      isBound: false,
      boundIp: null,
      addresses: [{ name: 'prod.example.com', resolvedIp: '203.0.113.10' }],
      machinesByIp: registry(),
    });

    expect(decision).toMatchObject({ createIp: '203.0.113.10', bindServerId: null });
  });

  it('два адреса одной машины — одна привязка', () => {
    const decision = decideMachine({
      environmentName: 'Прод',
      isBound: false,
      boundIp: null,
      addresses: [
        { name: 'prod.example.com', resolvedIp: '203.0.113.10' },
        { name: 'api.example.com', resolvedIp: '203.0.113.10' },
      ],
      machinesByIp: registry({ id: SERVER_ID, ip: '203.0.113.10' }),
    });

    expect(decision.bindServerId).toBe(SERVER_ID);
    expect(decision.warnings).toEqual([]);
  });

  it('адреса разошлись — ни привязки, ни новой машины', () => {
    // Спор двух адресов не должен плодить записи в реестре, и выбирать
    // за человека «настоящий» адрес система не вправе.
    const decision = decideMachine({
      environmentName: 'Прод',
      isBound: false,
      boundIp: null,
      addresses: [
        { name: 'prod.example.com', resolvedIp: '203.0.113.10' },
        { name: 'api.example.com', resolvedIp: '198.51.100.7' },
      ],
      machinesByIp: registry(),
    });

    expect(decision.createIp).toBeNull();
    expect(decision.bindServerId).toBeNull();
    expect(decision.warnings[0]).toMatchObject({
      kind: StatusWarningKind.AddressesDisagree,
      subject: 'Прод',
    });
  });

  it('две машины с одним IP — не привязываем', () => {
    // Дубль в реестре — беспорядок оператора: раннер пишет о нём в лог,
    // а состояние чужого проекта им не портится.
    const decision = decideMachine({
      environmentName: 'Прод',
      isBound: false,
      boundIp: null,
      addresses: [{ name: 'prod.example.com', resolvedIp: '203.0.113.10' }],
      machinesByIp: registry({ id: SERVER_ID, ip: '203.0.113.10' }, { id: 'другая', ip: '203.0.113.10' }),
    });

    expect(decision).toEqual({ createIp: null, bindServerId: null, warnings: [] });
  });

  it('привязанное окружение не трогается, даже если адрес совпал', () => {
    const decision = decideMachine({
      environmentName: 'Прод',
      isBound: true,
      boundIp: '203.0.113.10',
      addresses: [{ name: 'prod.example.com', resolvedIp: '203.0.113.10' }],
      machinesByIp: registry({ id: SERVER_ID, ip: '203.0.113.10' }),
    });

    expect(decision).toEqual({ createIp: null, bindServerId: null, warnings: [] });
  });

  it('неразрешённые адреса не значат ничего', () => {
    const decision = decideMachine({
      environmentName: 'Прод',
      isBound: false,
      boundIp: null,
      addresses: [{ name: 'prod.example.com', resolvedIp: null }],
      machinesByIp: registry(),
    });

    expect(decision).toEqual({ createIp: null, bindServerId: null, warnings: [] });
  });
});

describe('предупреждения о машине', () => {
  it('расхождение называет адрес и IP, но не машину', () => {
    // Имя машины принадлежит уровню «чтение», а статус открыт уровню
    // «метаданные»: назвать её здесь значило бы раскрыть невыданное.
    const [warning] = machineWarningsOf({
      environmentName: 'Прод',
      isBound: true,
      boundIp: '198.51.100.7',
      addresses: [{ name: 'prod.example.com', resolvedIp: '203.0.113.10' }],
    });

    expect(warning).toEqual({
      kind: StatusWarningKind.ServerMismatch,
      subject: 'prod.example.com',
      detail: 'смотрит на 203.0.113.10, а окружение привязано к другой машине',
    });
  });

  it('машина без известного IP молчит', () => {
    // Сравнивать не с чем, а дописывать человеку его запись система
    // не вправе.
    expect(
      machineWarningsOf({
        environmentName: 'Прод',
        isBound: true,
        boundIp: null,
        addresses: [{ name: 'prod.example.com', resolvedIp: '203.0.113.10' }],
      }),
    ).toEqual([]);
  });

  it('разногласие адресов у привязанного окружения молчит', () => {
    // Привязка задана человеком, и объяснять нечего: об отклонившихся
    // адресах уже сказано расхождением.
    const warnings = machineWarningsOf({
      environmentName: 'Прод',
      isBound: true,
      boundIp: '203.0.113.10',
      addresses: [
        { name: 'prod.example.com', resolvedIp: '203.0.113.10' },
        { name: 'api.example.com', resolvedIp: '198.51.100.7' },
      ],
    });

    expect(warnings.map((warning) => warning.kind)).toEqual([StatusWarningKind.ServerMismatch]);
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/api && npx vitest run src/servers/server-discovery.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализация**

```ts
import { StatusWarningKind, type StatusWarning } from '@cairn/shared';

/** Адрес окружения с результатом разрешения. */
export interface DiscoveryAddress {
  name: string;
  resolvedIp: string | null;
}

/** Окружение глазами правила: чем привязано и куда смотрят его адреса. */
export interface DiscoveryEnvironment {
  environmentName: string;
  /** Привязана ли машина человеком или прошлым прогоном. */
  isBound: boolean;
  /** IP привязанной машины; `null` — привязки нет либо IP у неё не задан. */
  boundIp: string | null;
  addresses: DiscoveryAddress[];
}

/** То же плюс реестр: нужен, только чтобы решить о заведении и привязке. */
export interface DiscoveryInput extends DiscoveryEnvironment {
  machinesByIp: Map<string, { id: string }[]>;
}

/** Что делать с машиной окружения. */
export interface DiscoveryDecision {
  /** IP, под который заводится машина; `null` — заводить нечего. */
  createIp: string | null;
  /** Машина, к которой привязывается окружение; `null` — не привязывать. */
  bindServerId: string | null;
  warnings: StatusWarning[];
}

/**
 * Решает судьбу машины окружения (спека 3.2–3.5).
 *
 * Правило одно на две стороны: прогон берёт из решения заведение и
 * привязку, чтение статуса — только предупреждения. Второй экземпляр
 * правила неизбежно разошёлся бы с первым.
 */
export function decideMachine(input: DiscoveryInput): DiscoveryDecision {
  const warnings = machineWarningsOf(input);
  const silent = { createIp: null, bindServerId: null, warnings };

  // Привязку, поставленную человеком, не трогаем ни при каких находках.
  if (input.isBound) {
    return silent;
  }

  const agreed = agreedIpOf(input.addresses);

  if (!agreed) {
    return silent;
  }

  const machines = input.machinesByIp.get(agreed) ?? [];

  // Дубль по IP разбирает оператор: гадать, которая из двух машин та
  // самая, система не вправе.
  if (machines.length > 1) {
    return silent;
  }

  return machines.length === 1
    ? { createIp: null, bindServerId: machines[0]!.id, warnings }
    : { createIp: agreed, bindServerId: null, warnings };
}

/**
 * Предупреждения о машине: расхождение и спор адресов.
 *
 * Имя машины в текст не попадает: статус открыт уровню «метаданные»,
 * а имя сервера принадлежит уровню «чтение».
 */
export function machineWarningsOf(environment: DiscoveryEnvironment): StatusWarning[] {
  const resolved = environment.addresses.filter(
    (address): address is DiscoveryAddress & { resolvedIp: string } => address.resolvedIp !== null,
  );

  if (environment.isBound) {
    if (!environment.boundIp) {
      return [];
    }

    return resolved
      .filter((address) => address.resolvedIp !== environment.boundIp)
      .map((address) => ({
        kind: StatusWarningKind.ServerMismatch,
        subject: address.name,
        detail: `смотрит на ${address.resolvedIp}, а окружение привязано к другой машине`,
      }));
  }

  const distinct = [...new Set(resolved.map((address) => address.resolvedIp))];

  if (distinct.length < 2) {
    return [];
  }

  return [
    {
      kind: StatusWarningKind.AddressesDisagree,
      subject: environment.environmentName,
      detail: `адреса смотрят на разные машины: ${distinct.join(', ')}`,
    },
  ];
}

/** Единственный IP, на котором сошлись все разрешившиеся адреса. */
function agreedIpOf(addresses: DiscoveryAddress[]): string | null {
  const distinct = [...new Set(addresses.map((address) => address.resolvedIp).filter(Boolean))];

  return distinct.length === 1 ? (distinct[0] as string) : null;
}
```

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/servers/server-discovery.test.ts`
Expected: PASS, 10 тестов.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/servers/server-discovery.ts apps/api/src/servers/server-discovery.test.ts
git commit -m "Решать о машине по адресам окружения"
```

---

## Chunk 2: База

### Task 2.1: Колонки результата и индекс по IP

**Files:**
- Modify: `apps/api/src/db/schema/status.ts`
- Modify: `apps/api/src/db/schema/status.test.ts`
- Modify: `apps/api/src/db/schema/servers.ts`
- Modify: `apps/api/src/db/schema/servers.test.ts`

- [ ] **Step 1: Падающие тесты**

В `status.test.ts`, в набор про статусы доменов:

```ts
it('статус адреса хранит результат разрешения', () => {
  const columns = getTableConfig(domainStatuses).columns.map((column) => column.name);

  expect(columns).toEqual(expect.arrayContaining(['resolved_ip', 'resolve_error']));
});
```

В `servers.test.ts`:

```ts
it('машина ищется по адресу, но уникальности адреса не требует', () => {
  // «IP определяет машину» выглядит инвариантом, но им не является:
  // NAT, переезды и две записи об одной машине — обычная жизнь реестра.
  const config = getTableConfig(servers);

  expect(config.indexes.map((index) => index.config.name)).toContain('servers_ip_idx');
  expect(config.uniqueConstraints.map((unique) => unique.name)).not.toContain('servers_ip');
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/api && npx vitest run src/db/schema`
Expected: FAIL на обоих новых тестах.

- [ ] **Step 3: Реализация**

В `status.ts`, в `domainStatuses`, после `healthError`:

```ts
    /** Во что разрешилось имя: по этому адресу находится машина. */
    resolvedIp: text('resolved_ip'),
    resolveError: text('resolve_error'),
```

В `servers.ts` — импортировать `index` из `drizzle-orm/pg-core` и добавить вторым элементом массива ограничений:

```ts
  (table) => [
    unique('servers_name').on(table.name),
    // Поиск машины по разрешённому адресу идёт на каждом прогоне проверок.
    index('servers_ip_idx').on(table.ip),
  ],
```

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/db/schema`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/db/schema
git commit -m "Держать результат разрешения у адреса, а поиск машины — по IP"
```

### Task 2.2: Миграция

**Files:**
- Create: `apps/api/drizzle/0024_server_by_address.sql` (имя и запись в `meta/_journal.json` даёт `drizzle-kit generate --custom`)
- Modify: `apps/api/test/health-address-migration.test.ts`

- [ ] **Step 1: Падающий тест**

Миграция ничего не переносит, поэтому отдельного набора она не заслуживает: проверка дописывается в существующий, который и так прогоняет весь журнал на живой базе.

```ts
it('заводит место под результат разрешения и поиск по IP', async () => {
  const columns = await client`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'domain_statuses' AND column_name IN ('resolved_ip', 'resolve_error')
    ORDER BY column_name
  `;
  const indexes = await client`
    SELECT indexname FROM pg_indexes WHERE tablename = 'servers' AND indexname = 'servers_ip_idx'
  `;

  expect(columns.map((column) => column.column_name)).toEqual(['resolve_error', 'resolved_ip']);
  expect(indexes).toHaveLength(1);
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `cd apps/api && npx vitest run test/health-address-migration.test.ts`
Expected: FAIL — колонок и индекса нет.

- [ ] **Step 3: Реализация**

```bash
cd apps/api && npx drizzle-kit generate --custom --name=server_by_address
```

Содержимое `apps/api/drizzle/0024_server_by_address.sql`:

```sql
--> Разрешение имени становится четвёртой проверкой адреса, и его результат
--> ложится в ту же строку: адрес, куда смотрит имя, и причина отказа.
ALTER TABLE "domain_statuses" ADD COLUMN "resolved_ip" text;--> statement-breakpoint
ALTER TABLE "domain_statuses" ADD COLUMN "resolve_error" text;--> statement-breakpoint
--> Поиск машины по разрешённому адресу идёт на каждом прогоне.
--> Индекс, а не уникальность: NAT, переезды и две записи об одной машине
--> — обычная жизнь реестра, и ронять на них миграцию нельзя.
CREATE INDEX "servers_ip_idx" ON "servers" ("ip");
```

Прав дописывать не нужно: `0011_status_privileges.sql` и `0018_server_privileges.sql` выдали права на таблицы целиком, и новые колонки покрыты ими.

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run test/health-address-migration.test.ts`
Expected: PASS, 12 тестов.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/drizzle apps/api/test/health-address-migration.test.ts
git commit -m "Завести место под результат разрешения"
```

---

## Chunk 3: Сведение

### Task 3.1: Статус адреса возит результат разрешения

**Files:**
- Modify: `apps/api/src/status/status.repository.ts`
- Modify: `apps/api/src/status/status.repository.test.ts`

- [ ] **Step 1: Падающие тесты**

```ts
it('пишет и отдаёт результат разрешения', async () => {
  await repository.upsertAddressStatus(domainId, checked({ resolvedIp: '203.0.113.10' }));
  await grantInfra(AccessLevel.Metadata);

  const status = await repository.statusForProject(member(), projectId);

  expect(status.domains[0]).toMatchObject({ resolvedIp: '203.0.113.10', resolveError: null });
});

it('перечисляет окружения с их адресами для второго прохода', async () => {
  await repository.upsertAddressStatus(domainId, checked({ resolvedIp: '203.0.113.10' }));

  const targets = await repository.listDiscoveryTargets();

  expect(targets).toEqual([
    {
      environmentId,
      environmentName: 'Прод',
      serverId: null,
      addresses: [{ name: 'example.com', resolvedIp: '203.0.113.10' }],
    },
  ]);
});
```

Фабрику `checked` дополнить полями `resolvedIp: null` и `resolveError: null`.

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/api && npx vitest run src/status/status.repository.test.ts`

- [ ] **Step 3: Реализация**

В `AddressStatusInput` добавить `resolvedIp: string | null` и `resolveError: string | null`.

В `buildStatus`, в `domainStatusesView`, после `healthError`:

```ts
      resolvedIp: row.status?.resolvedIp ?? null,
      resolveError: row.status?.resolveError ?? null,
```

Новый метод рядом с `listTargets`:

```ts
  /**
   * Окружения с их адресами и результатом разрешения.
   *
   * Второй проход прогона: решение о машине принимается по окружению
   * целиком, а не по отдельному адресу — привязка одна на всех.
   */
  async listDiscoveryTargets(): Promise<DiscoveryTarget[]> {
    const rows = await this.db
      .select({
        environmentId: environments.id,
        environmentName: environments.name,
        serverId: environments.serverId,
        name: environmentDomains.name,
        resolvedIp: domainStatuses.resolvedIp,
      })
      .from(environmentDomains)
      .innerJoin(environments, eq(environments.id, environmentDomains.environmentId))
      .leftJoin(domainStatuses, eq(domainStatuses.domainId, environmentDomains.id))
      .orderBy(asc(environments.name), asc(environmentDomains.name));

    const grouped = new Map<string, DiscoveryTarget>();

    for (const row of rows) {
      const target = grouped.get(row.environmentId) ?? {
        environmentId: row.environmentId,
        environmentName: row.environmentName,
        serverId: row.serverId,
        addresses: [],
      };

      target.addresses.push({ name: row.name, resolvedIp: row.resolvedIp });
      grouped.set(row.environmentId, target);
    }

    return [...grouped.values()];
  }
```

Тип рядом с `AddressTarget`:

```ts
/** Окружение со своими адресами: цель второго прохода прогона. */
export interface DiscoveryTarget {
  environmentId: string;
  environmentName: string;
  serverId: string | null;
  addresses: { name: string; resolvedIp: string | null }[];
}
```

- [ ] **Step 4: Запустить** → PASS.
- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/status/status.repository.ts apps/api/src/status/status.repository.test.ts
git commit -m "Возить результат разрешения в статусе адреса"
```

### Task 3.2: Предупреждения о машине в статусе проекта

**Files:**
- Modify: `apps/api/src/status/status.repository.ts`
- Modify: `apps/api/src/status/status.repository.test.ts`

- [ ] **Step 1: Падающие тесты**

```ts
it('адрес, смотрящий не на ту машину, даёт предупреждение', async () => {
  const [server] = await testDb.db
    .insert(servers)
    .values({ name: 'hetzner-fsn-1', ip: '198.51.100.7' })
    .returning();
  await testDb.db
    .update(environments)
    .set({ serverId: server!.id })
    .where(eq(environments.id, environmentId));
  await repository.upsertAddressStatus(domainId, checked({ resolvedIp: '203.0.113.10' }));
  await grantInfra(AccessLevel.Metadata);

  const status = await repository.statusForProject(member(), projectId);

  expect(status.warnings).toContainEqual({
    kind: StatusWarningKind.ServerMismatch,
    subject: 'example.com',
    detail: 'смотрит на 203.0.113.10, а окружение привязано к другой машине',
  });
});

it('предупреждение не называет машину', async () => {
  // Имя сервера принадлежит уровню «чтение»: статус его не раскрывает.
  const [server] = await testDb.db
    .insert(servers)
    .values({ name: 'hetzner-fsn-1', ip: '198.51.100.7' })
    .returning();
  await testDb.db
    .update(environments)
    .set({ serverId: server!.id })
    .where(eq(environments.id, environmentId));
  await repository.upsertAddressStatus(domainId, checked({ resolvedIp: '203.0.113.10' }));
  await grantInfra(AccessLevel.Metadata);

  const status = await repository.statusForProject(member(), projectId);

  expect(JSON.stringify(status)).not.toContain('hetzner-fsn-1');
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

- [ ] **Step 3: Реализация**

В `buildStatus`, после сбора `domainStatusesView` и до сборки ответа:

```ts
    // Привязанные машины нужны одним полем — своим IP: имя сервера
    // принадлежит уровню «чтение» и в статус не попадает.
    const boundIps = await this.boundIpsOf(environmentRows.map((row) => row.environment));

    const machineWarnings = environmentRows.flatMap((row) =>
      machineWarningsOf({
        environmentName: row.environment.name,
        isBound: row.environment.serverId !== null,
        boundIp: row.environment.serverId ? (boundIps.get(row.environment.serverId) ?? null) : null,
        addresses: domainStatusesView
          .filter((address) => address.environmentId === row.environment.id)
          .map((address) => ({ name: address.name, resolvedIp: address.resolvedIp })),
      }),
    );
```

`machineWarnings` добавляются в `warnings` ответа и в `extraWarnings` индикатора — рядом с `registryWarnings`:

```ts
    const registryWarnings = [...serverWarnings, ...domainWarnings, ...machineWarnings];
```

Вспомогательный метод:

```ts
  /** Адреса привязанных машин по их идентификаторам. */
  private async boundIpsOf(
    environmentRows: { serverId: string | null }[],
  ): Promise<Map<string, string | null>> {
    const serverIds = [
      ...new Set(
        environmentRows
          .map((row) => row.serverId)
          .filter((serverId): serverId is string => serverId !== null),
      ),
    ];

    if (serverIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .select({ id: servers.id, ip: servers.ip })
      .from(servers)
      .where(inArray(servers.id, serverIds));

    return new Map(rows.map((row) => [row.id, row.ip]));
  }
```

- [ ] **Step 4: Запустить** → PASS.
- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/status/status.repository.ts apps/api/src/status/status.repository.test.ts
git commit -m "Предупреждать, когда адрес смотрит не на ту машину"
```

### Task 3.3: Реестр заводит машину и ставит привязку

**Files:**
- Modify: `apps/api/src/servers/servers.repository.ts`
- Modify: `apps/api/src/servers/servers.repository.test.ts`

- [ ] **Step 1: Падающие тесты**

```ts
describe('заведение машины проверкой', () => {
  it('отдаёт реестр, разложенный по адресу', async () => {
    await testDb.db.insert(servers).values({ name: 'hetzner-fsn-1', ip: '203.0.113.10' });

    const byIp = await repository.machinesByIp();

    expect(byIp.get('203.0.113.10')).toHaveLength(1);
  });

  it('заводит машину под именем её адреса', async () => {
    // Больше система о ней не знает: имя, владельца и срок оплаты
    // допишет человек.
    const created = await repository.createDiscovered('203.0.113.10');

    expect(created).toMatchObject({ name: '203.0.113.10', ip: '203.0.113.10', owner: null });
  });

  it('ставит привязку окружению', async () => {
    const created = await repository.createDiscovered('203.0.113.10');

    await repository.bindEnvironment(environmentId, created.id);

    const [environment] = await testDb.db
      .select()
      .from(environments)
      .where(eq(environments.id, environmentId));

    expect(environment?.serverId).toBe(created.id);
  });

  it('привязку, поставленную человеком, не перетирает', async () => {
    // Защита на уровне запроса, а не только правила: второй вызов
    // не должен переехать окружение молча.
    const first = await repository.createDiscovered('203.0.113.10');
    const second = await repository.createDiscovered('198.51.100.7');
    await repository.bindEnvironment(environmentId, first.id);

    await repository.bindEnvironment(environmentId, second.id);

    const [environment] = await testDb.db
      .select()
      .from(environments)
      .where(eq(environments.id, environmentId));

    expect(environment?.serverId).toBe(first.id);
  });
});
```

Окружение `environmentId` в этом наборе заводится существующим помощником `addEnvironment(null, 'Прод')`.

- [ ] **Step 2: Запустить, убедиться что падают**

- [ ] **Step 3: Реализация**

```ts
  /**
   * Реестр, разложенный по адресу машины.
   *
   * Списком, а не одной машиной на адрес: уникальности IP в реестре нет,
   * и дубль — повод промолчать, а не гадать.
   */
  async machinesByIp(): Promise<Map<string, { id: string }[]>> {
    const rows = await this.db
      .select({ id: servers.id, ip: servers.ip })
      .from(servers)
      .where(isNotNull(servers.ip));

    const byIp = new Map<string, { id: string }[]>();

    for (const row of rows) {
      byIp.set(row.ip!, [...(byIp.get(row.ip!) ?? []), { id: row.id }]);
    }

    return byIp;
  }

  /**
   * Заводит машину, найденную проверкой (спека 3.2).
   *
   * Имя равно адресу: это всё, что система о ней знает. Человеческое имя,
   * владельца, провайдера и срок оплаты дописывает суперадмин.
   */
  async createDiscovered(ip: string): Promise<Server> {
    const [created] = await this.db.insert(servers).values({ name: ip, ip }).returning();

    return created!;
  }

  /**
   * Ставит привязку окружению, у которого её нет (спека 3.3).
   *
   * Условие в запросе, а не только в правиле: привязка, поставленная
   * человеком, не должна переехать ни при каком порядке вызовов.
   */
  async bindEnvironment(environmentId: string, serverId: string): Promise<void> {
    await this.db
      .update(environments)
      .set({ serverId, updatedAt: new Date() })
      .where(and(eq(environments.id, environmentId), isNull(environments.serverId)));
  }
```

Дописать импорты: `and`, `isNull`, `isNotNull` из `drizzle-orm`, `environments` из `../db/schema`.

- [ ] **Step 4: Запустить** → PASS.
- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/servers/servers.repository.ts apps/api/src/servers/servers.repository.test.ts
git commit -m "Заводить машину по адресу и привязывать пустое окружение"
```

### Task 3.4: Раннер разрешает адреса и применяет решение

**Files:**
- Modify: `apps/api/src/status/status-runner.service.ts`
- Modify: `apps/api/src/status/status-runner.service.test.ts`
- Modify: `apps/api/src/status/status.module.ts` (внедрение `ServersRepository`)

- [ ] **Step 1: Падающие тесты**

```ts
it('разрешает адрес наравне с остальными проверками', async () => {
  await seedTargets();

  const checkers = healthyCheckers();

  await new StatusRunnerService(repository, servers, checkers).runAll();

  expect(checkers.resolveAddress).toHaveBeenCalledWith('stage.example.com');

  const [status] = await testDb.db
    .select()
    .from(domainStatuses)
    .where(eq(domainStatuses.domainId, addressId));

  expect(status?.resolvedIp).toBe('203.0.113.10');
});

it('заводит машину и привязывает окружение', async () => {
  await seedTargets();

  await new StatusRunnerService(repository, servers, healthyCheckers()).runAll();

  const [machine] = await testDb.db.select().from(servers_);
  const [environment] = await testDb.db.select().from(environments);

  expect(machine).toMatchObject({ name: '203.0.113.10', ip: '203.0.113.10' });
  expect(environment?.serverId).toBe(machine?.id);
});

it('повторный прогон не плодит вторую машину', async () => {
  await seedTargets();

  await new StatusRunnerService(repository, servers, healthyCheckers()).runAll();
  await new StatusRunnerService(repository, servers, healthyCheckers()).runAll();

  expect(await testDb.db.select().from(servers_)).toHaveLength(1);
});
```

`healthyCheckers` дополнить полем `resolveAddress: vi.fn().mockResolvedValue({ ip: '203.0.113.10', error: null })`. Таблицу `servers` импортировать под именем `servers_`, чтобы не столкнуться с переменной репозитория.

- [ ] **Step 2: Запустить, убедиться что падают**

- [ ] **Step 3: Реализация**

В `Checkers` добавить `resolveAddress: typeof resolveAddress`, в `REAL_CHECKERS` — саму функцию. Конструктор принимает `ServersRepository` вторым параметром.

В цикле по адресам — четвёртая проверка и запись:

```ts
        const resolved = await this.checkers.resolveAddress(address.name);
```

```ts
          resolvedIp: resolved.ip,
          resolveError: resolved.error,
```

После цикла — второй проход:

```ts
    await this.adoptMachines();
```

```ts
  /**
   * Второй проход: машина окружения по его адресам (спека 3.2–3.4).
   *
   * Отдельно от обхода адресов, потому что решение принимается по
   * окружению целиком: привязка у него одна, а адресов несколько.
   */
  private async adoptMachines(): Promise<void> {
    const targets = await this.repository.listDiscoveryTargets();
    const machinesByIp = await this.servers.machinesByIp();

    for (const target of targets) {
      try {
        const decision = decideMachine({
          environmentName: target.environmentName,
          isBound: target.serverId !== null,
          boundIp: null,
          addresses: target.addresses,
          machinesByIp,
        });

        if (decision.createIp) {
          const created = await this.servers.createDiscovered(decision.createIp);

          machinesByIp.set(decision.createIp, [{ id: created.id }]);
          await this.servers.bindEnvironment(target.environmentId, created.id);
          continue;
        }

        if (decision.bindServerId) {
          await this.servers.bindEnvironment(target.environmentId, decision.bindServerId);
        }
      } catch (cause) {
        this.logger.warn(`Машина окружения ${target.environmentName} не определилась: ${cause}`);
      }
    }
  }
```

`boundIp: null` здесь не упущение: предупреждения строит чтение статуса, а прогону нужны только заведение и привязка, и для них привязанное окружение всё равно оставляется в покое. Это стоит объяснить комментарием на месте.

Дубль по IP заметен по тому, что решение молчит; чтобы оператор об этом узнал, перед `continue` добавить:

```ts
        const duplicates = target.addresses
          .map((address) => address.resolvedIp)
          .filter((ip): ip is string => ip !== null)
          .filter((ip) => (machinesByIp.get(ip) ?? []).length > 1);

        if (duplicates.length > 0) {
          this.logger.warn(`В реестре две машины с адресом ${duplicates[0]}`);
        }
```

В `status.module.ts` добавить `ServersRepository` в провайдеры (или импортировать `ServersModule`, если он есть, — посмотреть, как модуль устроен, и повторить, а не выдумывать).

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/status` затем `cd apps/api && npx vitest run`
Expected: PASS. Проверить, что `status.e2e.test.ts` по-прежнему зелёный: его подделки проверщиков надо дополнить `resolveAddress`.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/status apps/api/test
git commit -m "Определять машину окружения на прогоне проверок"
```

---

## Chunk 4: Интерфейс

### Task 4.1: Строка «смотрит на IP» под адресом

**Files:**
- Modify: `apps/web/src/components/StatusByEnvironment/AddressStatusLine.tsx`
- Modify: `apps/web/src/components/StatusByEnvironment/StatusByEnvironment.tsx`
- Modify: `apps/web/src/components/StatusByEnvironment/StatusByEnvironment.test.tsx`

- [ ] **Step 1: Падающие тесты**

```tsx
it('показывает, на какой адрес смотрит имя', () => {
  render(<StatusByEnvironment environments={[prod]} addresses={[address()]} />);

  expect(screen.getByText('смотрит на 203.0.113.10')).toBeInTheDocument();
});

it('неразрешённое имя объясняет причину', () => {
  const broken = address({ resolvedIp: null, resolveError: 'queryA ENOTFOUND' });

  render(<StatusByEnvironment environments={[prod]} addresses={[broken]} />);

  expect(screen.getByText(/не разрешается: queryA ENOTFOUND/)).toBeInTheDocument();
});

it('не называет машину: её имя принадлежит уровню чтения', () => {
  render(<StatusByEnvironment environments={[prod]} addresses={[address()]} />);

  expect(screen.queryByText(/hetzner/i)).not.toBeInTheDocument();
});
```

Фабрику `address` дополнить полями `resolvedIp: '203.0.113.10'` и `resolveError: null`.

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/web && npx vitest run src/components/StatusByEnvironment`

- [ ] **Step 3: Реализация**

В `AddressStatusLine.tsx` — отдельная приглушённая строка под проверками:

```tsx
      {placementTextOf(address) && (
        <p className="text-xs text-muted-foreground">{placementTextOf(address)}</p>
      )}
```

```tsx
/**
 * Где живёт имя: адрес, в который оно разрешилось.
 *
 * Только адрес: имя машины принадлежит уровню «чтение» и показывается
 * в карточке окружения, а панель статуса открыта уровню «метаданные».
 */
function placementTextOf({ resolvedIp, resolveError }: IAddressProps['address']): string | null {
  if (resolvedIp) {
    return `смотрит на ${resolvedIp}`;
  }

  return resolveError ? `имя не разрешается: ${resolveError}` : null;
}
```

Компонент `AddressStatusLine` возвращает фрагмент, и добавление абзаца внутрь строки списка допустимо: `<li>` содержит текст проверок и абзац под ним. Если строка вырастет за сто строк — вынести `placementTextOf` в `utils.ts` рядом с компонентом.

- [ ] **Step 4: Запустить** → PASS.
- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/StatusByEnvironment
git commit -m "Показать, на какой адрес смотрит имя"
```

### Task 4.2: Подсказка у поля «Сервер»

**Files:**
- Modify: `apps/web/src/components/EnvironmentForm/constants.ts`
- Modify: `apps/web/src/components/EnvironmentForm/ServerField.tsx`
- Modify: `apps/web/src/components/EnvironmentForm/EnvironmentForm.test.tsx`

- [ ] **Step 1: Падающий тест**

```tsx
it('объясняет, что машина определится по адресу', () => {
  render(<EnvironmentForm initial={initial} onSubmit={vi.fn()} canAssignServer servers={SERVERS} />);

  expect(screen.getByText(/машина определится по адресу/i)).toBeInTheDocument();
  expect(screen.getByText(/за CDN определится край сети/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

- [ ] **Step 3: Реализация**

В `constants.ts`:

```ts
/**
 * Подсказка к выбору машины.
 *
 * Второе предложение важнее первого: это единственное место, где система
 * честно говорит о границе своего знания.
 */
export const SERVER_HINT =
  'Не выбран — машина определится по адресу окружения. За CDN определится край сети, а не ваша машина';
```

В `ServerField.tsx` — абзац с подсказкой под списком, показывается только когда `canAssign`.

- [ ] **Step 4: Запустить** → PASS.
- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/EnvironmentForm
git commit -m "Объяснить, откуда берётся машина окружения"
```

---

## Финальная проверка

- [ ] `pnpm test` — зелено во всех рабочих пространствах
- [ ] `pnpm typecheck` — чисто
- [ ] `pnpm build` — собирается
- [ ] `scripts/e2e.mjs` — окружение заводится; после прогона проверок в реестре появляется машина
- [ ] `CLAUDE.md`: машина окружения определяется по адресу, заводится сама, привязка ставится только в пустое место
