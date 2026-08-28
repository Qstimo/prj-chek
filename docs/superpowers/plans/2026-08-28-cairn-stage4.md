# CAIRN этап 4 «Переменные» — план реализации

> **Для исполнителя:** ОБЯЗАТЕЛЬНО веди работу через superpowers:executing-plans (или superpowers:subagent-driven-development, если доступны субагенты). Шаги отмечаются чекбоксами (`- [ ]`).

**Цель:** реализовать секцию «Переменные» — шифрованные значения по окружениям с версиями, раскрытием под журнал и импортом/выгрузкой `.env`.

**Архитектура:** модуль `apps/api/src/variables/` по рисунку секций 2–3, но с двумя отличиями: список никогда не содержит значений (проекция одна на все уровни), а чтение значения — отдельная операция `reveal` с записью в журнал. Значения шифруются `CryptoService` этапа 1. Разбор `.env` — отдельная единица `env-format.ts`.

**Стек:** прежний.

**Основание:** `docs/superpowers/specs/2026-08-28-cairn-stage4-design.md`.

---

## Ключевые правила для исполнителя

1. **TDD**: падающий тест → реализация → зелёный прогон → коммит.
2. **Права в репозитории**, субъект первым аргументом.
3. **Значения не утекают**: ни в списки, ни в журнал, ни в сообщения ошибок. Каждый тест сервиса это проверяет.
4. **Раскрытие — POST** с записью в журнал в одной транзакции с чтением.
5. **Каскадов нет**; версии удаляются явной строкой.
6. **Коммит после каждой задачи**, сообщения по-русски.

---

## Структура файлов

**`packages/shared/src/schemas/variable.ts`** — контракт: `variableSchema` (список), `variableCreateSchema`, `variableUpdateSchema`, `variableVersionSchema`, `revealResponseSchema`, `rollbackSchema`, `importResultSchema`, `variablesEnvironmentSchema`.

**`apps/api/src/db/schema/variables.ts`** — таблицы `variables`, `variable_versions`.

**`apps/api/src/variables/`**
- `env-format.ts` — разбор и сборка `.env`.
- `variables.repository.ts` — данные с проверкой прав и шифрованием.
- `variables.service.ts` — журнал.
- `variables.controller.ts`, `variables.module.ts`.

**`apps/api/src/environments/environments.repository.ts`** — запрет удаления окружения с переменными (`409`).

**`apps/api/test/`** — `variables.e2e.test.ts`; `access-matrix.e2e.test.ts` дополняется.

**`apps/web/src/`** — хуки (`useQueryVariables.ts`, `useMutationVariable.ts`, `useVariableReveal.ts`, `useEnvTransfer.ts`), компоненты (`VariableTable/`, `VariableForm/`, `VersionHistory/`, `EnvTransferPanel/`), страница `app/(app)/projects/[id]/variables/`, ссылка в `ProjectSections`.

**`scripts/e2e.mjs`** — сценарий переменных.

---

## Порядок чанков

1. Контракт и схема данных.
2. Формат `.env`.
3. Репозиторий и сервис.
4. HTTP и матрица доступа.
5. Интерфейс.
6. Завершение.

---

## Chunk 1: Контракт и схема данных

### Task 1: Контракт переменных

**Files:**
- Create: `packages/shared/src/schemas/variable.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/schemas/variable.test.ts`

- [ ] **Step 1: Падающий тест**

```typescript
import { describe, expect, it } from 'vitest';

import { variableCreateSchema, variableUpdateSchema } from './variable';

describe('схема переменной', () => {
  it('принимает ключ в стиле переменных окружения', () => {
    const parsed = variableCreateSchema.parse({ key: 'DATABASE_URL', value: 'postgres://…' });

    expect(parsed.key).toBe('DATABASE_URL');
  });

  it('отвергает ключ в нижнем регистре и с дефисом', () => {
    expect(() => variableCreateSchema.parse({ key: 'database_url', value: 'x' })).toThrow();
    expect(() => variableCreateSchema.parse({ key: 'DATABASE-URL', value: 'x' })).toThrow();
    expect(() => variableCreateSchema.parse({ key: '1KEY', value: 'x' })).toThrow();
  });

  it('требует значение при создании', () => {
    expect(() => variableCreateSchema.parse({ key: 'KEY' })).toThrow();
  });

  it('допускает пустое значение строки', () => {
    // Пустая строка — законное значение переменной окружения.
    expect(variableCreateSchema.parse({ key: 'KEY', value: '' }).value).toBe('');
  });

  it('правка допускает частичные данные', () => {
    expect(variableUpdateSchema.parse({ description: 'Строка подключения' }).description).toBe(
      'Строка подключения',
    );
  });
});
```

- [ ] **Step 2: Убедиться в падении** — `pnpm --filter @cairn/shared test src/schemas/variable` → FAIL.

- [ ] **Step 3: Создать `variable.ts`**

```typescript
import { z } from 'zod';

import { EnvironmentKind } from '../enums';

/** Ключ в стиле переменных окружения: заглавные латинские, цифры, подчёркивание. */
const keySchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]*$/, 'Ключ: заглавные латинские буквы, цифры и подчёркивание')
  .max(200);

/**
 * Переменная в списке. Значения здесь нет ни на одном уровне доступа:
 * оно раскрывается только отдельным действием (ТЗ 3.3).
 */
export const variableSchema = z.object({
  id: z.string().uuid(),
  key: keySchema,
  description: z.string().nullable(),
  /** Номер текущей версии — последней по счёту. */
  currentVersion: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Создание: значение обязательно — оно станет первой версией. */
export const variableCreateSchema = z.object({
  key: keySchema,
  description: z.string().trim().max(500).nullable().optional(),
  value: z.string().max(65_536),
});

/** Правка. Поле `value` создаёт новую версию. */
export const variableUpdateSchema = z.object({
  key: keySchema.optional(),
  description: z.string().trim().max(500).nullable().optional(),
  value: z.string().max(65_536).optional(),
});

/** Версия в истории: без значения — его раскрывают отдельно. */
export const variableVersionSchema = z.object({
  versionNo: z.number().int().positive(),
  createdAt: z.string(),
  createdByLabel: z.string(),
});

/** Раскрытое значение. */
export const revealResponseSchema = z.object({
  value: z.string(),
  versionNo: z.number().int().positive(),
});

/** Откат к версии. */
export const rollbackSchema = z.object({
  toVersion: z.number().int().positive(),
});

/** Итог импорта `.env`. */
export const importResultSchema = z.object({
  created: z.array(z.string()),
  updated: z.array(z.string()),
  unchanged: z.array(z.string()),
});

/** Окружение в переключателе страницы переменных. */
export const variablesEnvironmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  kind: z.nativeEnum(EnvironmentKind),
});

/** Переменная в списке. */
export type Variable = z.infer<typeof variableSchema>;

/** Данные создания переменной. */
export type VariableCreate = z.infer<typeof variableCreateSchema>;

/** Данные правки переменной. */
export type VariableUpdate = z.infer<typeof variableUpdateSchema>;

/** Версия в истории. */
export type VariableVersion = z.infer<typeof variableVersionSchema>;

/** Раскрытое значение. */
export type RevealResponse = z.infer<typeof revealResponseSchema>;

/** Откат к версии. */
export type RollbackInput = z.infer<typeof rollbackSchema>;

/** Итог импорта. */
export type ImportResult = z.infer<typeof importResultSchema>;

/** Окружение в переключателе переменных. */
export type VariablesEnvironment = z.infer<typeof variablesEnvironmentSchema>;
```

Экспорт в `index.ts` по алфавиту.

- [ ] **Step 4: Прогнать и собрать** — PASS, 5 тестов; `pnpm --filter @cairn/shared build`.

- [ ] **Step 5: Коммит** — `Добавить контракт переменных`.

---

### Task 2: Таблицы и миграция

**Files:**
- Create: `apps/api/src/db/schema/variables.ts`
- Modify: `schema/index.ts`, `invariants.test.ts`, `test/db-fixture.ts`
- Create: `drizzle/0006_*.sql` (генерируется), `drizzle/0007_variable_privileges.sql`
- Test: `apps/api/src/db/schema/variables.test.ts`

- [ ] **Step 1: Падающий тест**

```typescript
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { variableVersions, variables } from './variables';

describe('переменные', () => {
  it('ключ уникален в пределах окружения', () => {
    const unique = getTableConfig(variables).uniqueConstraints.find(
      (constraint) => constraint.name === 'variables_environment_key',
    );

    expect(unique?.columns.map((column) => column.name).sort()).toEqual([
      'environment_id',
      'key',
    ]);
  });

  it('значения в таблице переменных нет', () => {
    // Значение живёт только в версиях — зашифрованным (спека 3.1).
    const columns = getTableConfig(variables).columns.map((column) => column.name);

    expect(columns).not.toContain('value');
    expect(columns).not.toContain('value_encrypted');
  });
});

describe('версии значений', () => {
  it('номер версии уникален в пределах переменной', () => {
    const unique = getTableConfig(variableVersions).uniqueConstraints.find(
      (constraint) => constraint.name === 'variable_versions_variable_no',
    );

    expect(unique?.columns.map((column) => column.name).sort()).toEqual([
      'variable_id',
      'version_no',
    ]);
  });

  it('хранит только шифротекст и автора', () => {
    expect(variableVersions.valueEncrypted.notNull).toBe(true);
    expect(variableVersions.createdBySubjectId.notNull).toBe(true);
  });
});
```

- [ ] **Step 2: Убедиться в падении, создать `variables.ts`**

```typescript
import { index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { environments } from './environments';
import { subjects } from './subjects';

/**
 * Переменные окружения проекта (ТЗ 3.3).
 *
 * Значения здесь нет: оно живёт в версиях, зашифрованным. Описание
 * существует ради уровня «метаданные» — знать, какие переменные нужны,
 * не видя значений (ТЗ 4.3).
 */
export const variables = pgTable(
  'variables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'restrict' }),
    key: text('key').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('variables_environment_key').on(table.environmentId, table.key),
    index('variables_environment_idx').on(table.environmentId),
  ],
);

/**
 * Версии значений: история линейна и только растёт.
 *
 * Текущее значение — версия с наибольшим номером; указателя «текущая»
 * нет намеренно — два источника правды разошлись бы (спека 3.2).
 * Откат создаёт новую версию, а не передвигает историю.
 */
export const variableVersions = pgTable(
  'variable_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    variableId: uuid('variable_id')
      .notNull()
      .references(() => variables.id, { onDelete: 'restrict' }),
    versionNo: integer('version_no').notNull(),
    valueEncrypted: text('value_encrypted').notNull(),
    createdBySubjectId: uuid('created_by_subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('variable_versions_variable_no').on(table.variableId, table.versionNo),
    index('variable_versions_variable_idx').on(table.variableId),
  ],
);

/** Строка таблицы переменных. */
export type VariableRow = typeof variables.$inferSelect;

/** Строка таблицы версий. */
export type VariableVersionRow = typeof variableVersions.$inferSelect;
```

- [ ] **Step 3: Подключить**: `schema/index.ts` (алфавит — после `users`? нет: экспорт `./variables` последним), `invariants.test.ts` (+2 строки в `ALL_TABLES`), `db-fixture.ts` (`variable_versions, variables` в `TRUNCATE` перед `environments`).

- [ ] **Step 4: Прогнать тесты схемы** — PASS.

- [ ] **Step 5: Миграция**: `pnpm --filter @cairn/api db:generate` (проверить отсутствие `DROP`), создать `0007_variable_privileges.sql`:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON variables, variable_versions TO cairn_app;
```

Зарегистрировать `0007` в `_journal.json`. Дополнить `environments-privileges.test.ts` случаем чтения обеих таблиц ролью приложения.

- [ ] **Step 6: Прогнать тест прав** — PASS.

- [ ] **Step 7: Коммит** — `Добавить таблицы переменных`.

---

## Chunk 2: Формат .env

### Task 3: env-format

**Files:**
- Create: `apps/api/src/variables/env-format.ts`
- Test: `apps/api/src/variables/env-format.test.ts`

- [ ] **Step 1: Падающий тест**

```typescript
import { describe, expect, it } from 'vitest';

import { parseEnv, serializeEnv } from './env-format';

describe('parseEnv', () => {
  it('разбирает пары KEY=VALUE', () => {
    expect(parseEnv('DATABASE_URL=postgres://db\nPORT=3000')).toEqual([
      { key: 'DATABASE_URL', value: 'postgres://db' },
      { key: 'PORT', value: '3000' },
    ]);
  });

  it('пропускает комментарии и пустые строки', () => {
    expect(parseEnv('# заголовок\n\nKEY=value\n')).toEqual([{ key: 'KEY', value: 'value' }]);
  });

  it('снимает одинарные и двойные кавычки', () => {
    expect(parseEnv('A="со пробелом"\nB=\'одинарные\'')).toEqual([
      { key: 'A', value: 'со пробелом' },
      { key: 'B', value: 'одинарные' },
    ]);
  });

  it('раскрывает экранированный перевод строки в двойных кавычках', () => {
    expect(parseEnv('KEY="строка\\nвторая"')).toEqual([{ key: 'KEY', value: 'строка\nвторая' }]);
  });

  it('обрезает пробелы вокруг незакавыченного значения', () => {
    expect(parseEnv('KEY=  значение  ')).toEqual([{ key: 'KEY', value: 'значение' }]);
  });

  it('сообщает о строке, не похожей на пару', () => {
    expect(() => parseEnv('KEY=ok\nмусор без знака равно')).toThrow(/строка 2/i);
  });

  it('сообщает о недопустимом ключе', () => {
    expect(() => parseEnv('key-с-дефисом=x')).toThrow(/ключ/i);
  });

  it('последнее вхождение ключа побеждает', () => {
    expect(parseEnv('KEY=первое\nKEY=второе')).toEqual([{ key: 'KEY', value: 'второе' }]);
  });
});

describe('serializeEnv', () => {
  it('собирает простые пары без кавычек', () => {
    expect(serializeEnv([{ key: 'PORT', value: '3000' }])).toBe('PORT=3000\n');
  });

  it('оборачивает в кавычки значения с пробелами, решёткой и кавычками', () => {
    expect(serializeEnv([{ key: 'A', value: 'со пробелом' }])).toBe('A="со пробелом"\n');
    expect(serializeEnv([{ key: 'B', value: 'x#y' }])).toBe('B="x#y"\n');
    expect(serializeEnv([{ key: 'C', value: 'он сказал "да"' }])).toBe(
      'C="он сказал \\"да\\""\n',
    );
  });

  it('экранирует перевод строки', () => {
    expect(serializeEnv([{ key: 'KEY', value: 'a\nb' }])).toBe('KEY="a\\nb"\n');
  });

  it('разбор собранного возвращает исходные пары', () => {
    const pairs = [
      { key: 'SIMPLE', value: 'значение' },
      { key: 'SPACED', value: 'с пробелом и "кавычками"' },
      { key: 'MULTILINE', value: 'первая\nвторая' },
      { key: 'EMPTY', value: '' },
    ];

    expect(parseEnv(serializeEnv(pairs))).toEqual(pairs);
  });
});
```

- [ ] **Step 2: Убедиться в падении, реализовать**

`env-format.ts`: `parseEnv(text): { key, value }[]` — построчный разбор с номером строки в ошибке (`BadRequestException` не использовать — чистая функция бросает `Error`, контроллер оборачивает); `serializeEnv(pairs): string` — кавычки при `[\s#"'\n=]` или пустом значении... пустое значение без кавычек тоже однозначно (`KEY=`), кавычки не нужны — сверяйся с тестами. TSDoc на русском, ссылка на спеку 6.

- [ ] **Step 3: Прогнать** — PASS, 13 тестов. **Коммит** — `Добавить формат env`.

---

## Chunk 3: Репозиторий и сервис

### Task 4: Репозиторий переменных

**Files:**
- Create: `apps/api/src/variables/variables.repository.ts`
- Test: `apps/api/src/variables/variables.repository.test.ts`

- [ ] **Step 1: Падающий тест** (обвязка как у хроники: admin/member, `grant(level)` на `Section.Variables`; окружение создаётся напрямую в таблицу). Случаи:

- `create`: переменная появляется с версией 1; **в базе `value_encrypted` начинается с `v1:` и не содержит открытого значения**;
- `create` с занятым ключом в том же окружении — ошибка; в другом окружении — успех;
- `list`: ключ, описание, `currentVersion`, без значения — **и на уровне `write` тоже**; отсортирован по ключу;
- права: `list` требует `metadata`, скрытие без выдачи; создание требует `write` (`InsufficientLevelError` на `read`);
- `reveal`: возвращает исходное значение и номер версии; требует `read` (на `metadata` — `InsufficientLevelError`);
- `updateValue`: версия растёт (2, 3…), `reveal` отдаёт новое; неизменившееся значение версии не создаёт (возвращает признак);
- `rollback` к версии 1 создаёт версию 3 со значением версии 1; откат к несуществующей версии — `SectionNotVisibleError`;
- `versions`: список без значений, новые сверху; `revealVersion(no)` отдаёт историческое значение;
- `remove`: строки версий и переменной исчезают;
- чужой проект/окружение — `SectionNotVisibleError`.

- [ ] **Step 2: Реализовать `variables.repository.ts`**

Ключевые сигнатуры (полный рисунок — как у секций 2–3, все методы проверяют права и принадлежность «проект → окружение → переменная» в запросе):

```typescript
@Injectable()
export class VariablesRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly access: AccessService,
    private readonly crypto: CryptoService,
  ) {}

  async list(subject, projectId, environmentId): Promise<Variable[]>;
  async listEnvironments(subject, projectId): Promise<VariablesEnvironment[]>; // metadata на Variables
  async create(subject, tx, projectId, environmentId, input): Promise<VariableRow>; // + версия 1
  async updateMeta(subject, tx, projectId, environmentId, variableId, {key?, description?}): Promise<VariableRow>;
  async appendVersion(subject, tx, projectId, environmentId, variableId, value): Promise<number | null>;
    // null — значение не изменилось, версия не создана (сверка через reveal текущей)
  async rollback(subject, tx, projectId, environmentId, variableId, toVersion): Promise<number>; // номер новой версии
  async remove(subject, tx, projectId, environmentId, variableId): Promise<VariableRow>; // версии явной строкой
  async reveal(subject, projectId, environmentId, variableId): Promise<RevealResponse>; // read
  async revealVersion(subject, projectId, environmentId, variableId, versionNo): Promise<RevealResponse>;
  async versions(subject, projectId, environmentId, variableId): Promise<VariableVersion[]>; // read, join subjects для метки автора
}
```

Замечания:

- `list` строит `currentVersion` через подзапрос `max(version_no)` (join + group by);
- принадлежность: каждая выборка сверяет `variables.environment_id = :eid` и `environments.project_id = :pid` (join), несовпадение — `SectionNotVisibleError`;
- `appendVersion` номер берёт как `max + 1` в той же транзакции;
- шифрование/расшифровка только здесь; наружу — открытое значение только из `reveal*`.

- [ ] **Step 3: Прогнать** — PASS (~18 тестов). **Коммит** — `Добавить репозиторий переменных`.

---

### Task 5: Сервис с журналом и импорт/выгрузка

**Files:**
- Modify: `apps/api/src/audit/audit.types.ts`
- Create: `apps/api/src/variables/variables.service.ts`
- Test: `apps/api/src/variables/variables.service.test.ts`

- [ ] **Step 1: Действия журнала**

```typescript
  VariableCreated = 'variable.created',
  VariableUpdated = 'variable.updated',
  VariableDeleted = 'variable.deleted',
  VariableRevealed = 'variable.revealed',
  VariableRolledBack = 'variable.rolled_back',
  VariablesImported = 'variables.imported',
  VariablesExported = 'variables.exported',
```

- [ ] **Step 2: Падающий тест сервиса**. Ключевые случаи:

- `reveal` возвращает значение **и пишет `variable.revealed`** с ключом, окружением и номером версии — в одной транзакции;
- **ни одна запись журнала не содержит значения**: после полного цикла (создание, правка значения, раскрытие, откат, импорт, выгрузка) `JSON.stringify` всех записей журнала не содержит ни одного из использованных значений;
- `update` со значением пишет `variable.updated` с `fields: ['value']` и номером новой версии;
- `importEnv`: создаёт новые, обновляет изменившиеся, не трогает совпадающие (у них не растёт версия); журнал `variables.imported` с тремя перечнями ключей; результат — `ImportResult`;
- `exportEnv`: возвращает текст `.env` с текущими значениями; журнал `variables.exported` с перечнем ключей;
- отказ по правам не оставляет записей журнала.

- [ ] **Step 3: Реализовать `variables.service.ts`**

По рисунку сервисов секций: транзакция + `audit.record`. `reveal` — тоже транзакция (чтение + журнал: раскрытие без следа недопустимо, спека 5). `importEnv(subject, projectId, environmentId, text)`: `parseEnv` (ошибки разбора — `BadRequestException` с текстом), затем по парам `create`/`appendVersion`; `exportEnv`: `list` + `reveal` каждого → `serializeEnv`.

- [ ] **Step 4: Прогнать** — PASS. **Коммит** — `Добавить сервис переменных с журналом`.

---

## Chunk 4: HTTP и матрица доступа

### Task 6: Контроллер и запрет удаления окружения

**Files:**
- Create: `apps/api/src/variables/variables.controller.ts`, `variables.module.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/environments/environments.repository.ts`
- Test: `apps/api/test/variables.e2e.test.ts`; дополняется `apps/api/src/environments/environments.repository.test.ts`

- [ ] **Step 1: Падающий e2e-тест** (обвязка с AppModule). Случаи:

- создание → `201`, в ответе нет `value`;
- список не содержит значений при `write`;
- `reveal` → `{ value, versionNo }`; на `metadata` — `403`; без выдачи — `404`;
- правка значения → `reveal` отдаёт новое, `currentVersion` вырос;
- история версий и `reveal` версии 1 после правки;
- `rollback` → `currentVersion` растёт, значение прежнее;
- импорт текста → `{ created, updated, unchanged }`; повторный тот же импорт — всё в `unchanged`;
- выгрузка → `text/plain` с `KEY=VALUE`, `Content-Type` проверяется;
- удаление → `204`, ключ свободен;
- `401` без входа; чужое окружение — `404`.

- [ ] **Step 2: Контроллер**

`@Controller('projects/:projectId/environments/:environmentId/variables')` + отдельный маршрут `@Controller('projects/:projectId/variables')` для `GET environments` (переключатель — спека 7). Маршруты по таблице спеки 6; выгрузка ставит `@Header('Content-Type', 'text/plain; charset=utf-8')`; импорт принимает `{ content: string }` JSON-телом (не сырой текст: тут он всегда из формы). Модуль `VariablesModule` (imports: Db, Access, Audit, Auth, Crypto), подключить в `app.module.ts`.

- [ ] **Step 3: Запрет удаления окружения с переменными**

Падающий случай в `environments.repository.test.ts`: окружение с переменной не удаляется (`ConflictException`), после удаления переменной — удаляется. Реализация в `EnvironmentsRepository.remove`: перед удалением — счёт переменных, при ненулевом — `ConflictException('Сначала удалите переменные окружения')`.

- [ ] **Step 4: Прогнать e2e и весь набор API** — PASS. **Коммит** — `Добавить HTTP-слой переменных`.

---

### Task 7: Матрица доступа

**Files:**
- Modify: `apps/api/test/access-matrix.e2e.test.ts`

- [ ] Блок `describe.each` по образцу хроники (через `signInWithSection(Section.Variables, level)`); переменная заводится напрямую в таблицы (версия шифруется заранее сконструированным `CryptoService` с тем же ключом, что у приложения в тестовой обвязке — либо создаётся админом по HTTP в `beforeEach`, что проще и честнее):

| level | list | reveal | create |
|---|---|---|---|
| null | 404 | 404 | 404 |
| metadata | 200 | 403 | 403 |
| read | 200 | 200 | 403 |
| write | 200 | 200 | 201 |

Плюс случай: «на уровне write список не содержит значения» (страховка от регресса проекции).

Прогнать матрицу и весь набор. **Коммит** — `Добавить матрицу доступа для переменных`.

---

## Chunk 5: Интерфейс

### Task 8: Хуки данных

**Files:**
- Create: `apps/web/src/api/hooks/useQueryVariables.ts`, `useMutationVariable.ts`, `useVariableReveal.ts`, `useEnvTransfer.ts`
- Modify: `index.ts`
- Test: `useMutationVariable.test.tsx`

`useQueryVariables(projectId, environmentId)` + `useQueryVariablesEnvironments(projectId)`; мутации create/update/delete/rollback с инвалидацией списка; `useVariableReveal` — **мутация**, не query (раскрытие журналируется, кэшировать нельзя), возвращает значение вызывающему; `useEnvTransfer`: `useMutationImportEnv` (`{ content }`), `useMutationExportEnv` — POST?.. выгрузка — `GET` через `apiClient`, но `apiClient` парсит JSON; проверь `response.ts` — если он требует JSON, добавь в `apiClient` поддержку текстового ответа (`options.parse: 'text'`) минимальной правкой с тестом. Тест мутаций по образцу хроники.

TDD-цикл. **Коммит** — `Добавить хуки переменных`.

---

### Task 9: Таблица, форма, история, импорт/выгрузка

**Files:**
- Create: `apps/web/src/components/VariableTable/` (+`VariableRow`), `VariableForm/`, `VersionHistory/`, `EnvTransferPanel/`

Тесты и поведение:

- `VariableRow`: ключ, описание, `v{N}`; кнопка «Раскрыть» видна при `canReveal`, по клику вызывает `onReveal` и показывает значение с «Скопировать»/«Скрыть»; кнопки правки/удаления/истории при `canWrite`; удаление с подтверждением на месте;
- `VariableTable`: список `role="table"` или `ul` с `aria-label="Переменные"`; пустое состояние для читателя и пишущего;
- `VariableForm`: поля ключ/описание/значение (значение — `textarea`, `autoComplete="off"`); при правке значение пустое с подсказкой «оставьте пустым, чтобы не менять» — отправляется только заполненное; ключ обязателен;
- `VersionHistory`: список версий с автором и датой, «Раскрыть» у версии (через `onRevealVersion`), «Откатить» при `canWrite` с подтверждением;
- `EnvTransferPanel`: `textarea` импорта с кнопкой (при `canWrite`), кнопка «Выгрузить .env» (при `canReveal`) с предупреждением «выгрузка фиксируется в журнале»; после выгрузки текст показывается в `textarea` с «Скопировать» (файл не скачивается — меньше следов на диске).

TDD-цикл по компонентам. **Коммит** — `Добавить компоненты переменных`.

---

### Task 10: Страница секции и навигация

**Files:**
- Create: `apps/web/src/app/(app)/projects/[id]/variables/page.tsx`, `VariablesScreen.tsx`
- Modify: `ProjectSections` (+ тесты)

`VariablesScreen`: `useQueryVariablesEnvironments` → переключатель окружений (кнопки-вкладки, первое выбрано); `useQuerySections` → `canReveal = уровень read|write`, `canWrite = write`; таблица, форма создания/правки, история (разворачивается по кнопке), панель импорта/выгрузки. Пустой список окружений — подсказка «Сначала заведите окружение в разделе „Инфраструктура“».

`ProjectSections`: ссылка «Переменные» при `sections[Section.Variables]` (+2 теста по образцу).

Полный прогон веба и typecheck. **Коммит** — `Добавить экран переменных`.

---

## Chunk 6: Завершение

### Task 11: Сквозная проверка и документация

**Files:**
- Modify: `scripts/e2e.mjs`, `README.md`, `CLAUDE.md`

- [ ] **Step 1: `scripts/e2e.mjs`** — в сценарий админа (после хроники):

- создать переменную `DATABASE_URL` в окружении «Прод», проверить `201` и отсутствие `value` в ответе списка;
- раскрыть — значение совпадает; в журнале появилось `variable.revealed`;
- выгрузить `.env` — текст содержит `DATABASE_URL=`;
- выдать гостю `metadata` на `variables`; гость видит ключ и `currentVersion`, не видит значения; `reveal` гостю — `403`.

- [ ] **Step 2: README/CLAUDE.md** — этап 4 реализован; README дополняется абзацем о переменных (шифрование, версии, раскрытие под журнал, импорт/выгрузка) и напоминанием о резервной копии ключа.

- [ ] **Step 3: Полная проверка** — `pnpm --filter @cairn/shared build && pnpm test && pnpm typecheck && pnpm build`.

- [ ] **Step 4: Сквозной прогон на чистой системе** (порты 18080/18443): down -v → build → up → migrate → create-superadmin → `pnpm e2e`. Expected: все проверки.

- [ ] **Step 5: Коммит** — `Завершить этап 4: переменные`.

---

**Результат этапа 4:** проект хранит конфигурацию по окружениям; значения зашифрованы ключом, живущим вне базы; каждая правка — новая версия с возможностью отката; каждое раскрытие оставляет след в журнале; `.env` импортируется и выгружается одним действием. Система готова доверить себе продовые ключи (ТЗ 11, риск «ответственность за секреты»).
