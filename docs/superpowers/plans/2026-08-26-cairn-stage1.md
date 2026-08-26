# CAIRN этап 1 «Фундамент» — план реализации

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать этап 1 системы CAIRN: аутентификация с двухфакторной проверкой, проекты с секцией «Инфо», работающая модель выдач доступа, суперадмин и журнал действий.

**Architecture:** Монорепо на pnpm workspaces с двумя приложениями и общим пакетом контракта. Бэкенд на NestJS отвечает за всю логику прав, шифрования и журналирования; фронтенд на Next.js обращается к нему по HTTP с сессионной cookie. Проверка прав встроена в репозитории: метод доступа к данным физически не существует без субъекта в сигнатуре.

**Tech Stack:** pnpm workspaces, TypeScript, NestJS 11, Next.js 15 (App Router), PostgreSQL 17, Drizzle ORM, Vitest, Testcontainers, React Testing Library, Tailwind, shadcn/ui, Docker Compose.

**Спека:** `docs/superpowers/specs/2026-08-26-cairn-stage1-design.md` — источник правды. Ссылки вида «спека 4.3» указывают на её разделы.

**ТЗ:** `project-registry-spec [eTsSSz].md` — источник правды по продукту.

---

## Ключевые правила для исполнителя

Прочитай перед первой задачей.

**Репозиторий уже существует.** Git инициализирован, ветка `main`, в корне лежат `CLAUDE.md`, `.gitignore`, ТЗ и документы в `docs/`. Заново инициализировать ничего не нужно. `.gitignore` уже содержит `node_modules/`, `dist/`, `.next/`, `.env` — проверь это перед первым коммитом и дополни, если чего-то не хватает.

**TDD обязателен.** Каждая задача начинается с падающего теста. Запусти тест и убедись, что он падает **по ожидаемой причине**, прежде чем писать реализацию. Тест, упавший из-за отсутствующей зависимости или опечатки в импорте, ничего не проверяет.

**После создания любого `package.json` выполняй `pnpm install` в корне.** Иначе бинарники (`vitest`, `tsx`, `nest`) не появятся в `node_modules/.bin`, и следующий шаг упадёт не по той причине, которая указана в плане.

**Коммит после каждой задачи.** Сообщения на русском, в повелительном наклонении: «Добавить сервис шифрования».

**TSDoc на русском** (`/** */`) для всех экспортируемых элементов: функций, классов, интерфейсов, типов.

**Никаких `any`.** При неизвестном типе — `unknown` с последующим сужением.

**Порядок в файле:** экспортируемая сущность, затем вспомогательные, затем константы, затем типы.

**Не изобретай.** Если в плане указан код — используй его дословно. Если чего-то не хватает, сверься со спекой, а не с догадками.

---

## Структура файлов

Что появится к концу этапа и за что отвечает.

**`packages/shared/`** — контракт между фронтендом и бэкендом. Единственный источник типов API.
- `src/enums.ts` — `Section`, `AccessLevel`, `SubjectKind`, `AuditSubjectKind`, `ProjectLifecycle`, `InvitationKind`.
- `src/schemas/` — zod-схемы запросов и ответов, по файлу на ресурс.
- `src/index.ts` — barrel export.

**`apps/api/src/`** — бэкенд.
- `db/schema/` — таблицы Drizzle, по файлу на группу таблиц.
- `db/index.ts` — подключение, экспорт типа транзакции.
- `crypto/` — сервис прикладного шифрования (спека 4.9).
- `access/` — сервис проверки прав и guard суперадмина (спека 5).
- `audit/` — сервис журналирования (спека 7).
- `projects/` — репозиторий, сервис, контроллер, проекции.
- `grants/` — репозиторий, сервис, контроллер.
- `auth/` — пароли, TOTP, сессии, контроллер.
- `invitations/` — приглашения и сброс пароля.
- `users/` — управление пользователями.
- `cli/` — команды консоли (спека 6.5, 6.6).

**`apps/web/src/`** — фронтенд.
- `app/` — маршруты App Router.
- `components/` — компоненты, каждый в своей директории.
- `api/` — обёртка над `fetch` с пробросом cookie (спека 3.3), хуки TanStack Query.

Границы намеренные: `access` не знает о проектах, `crypto` не знает ни о чём, `audit` принимает готовую транзакцию. Каждый модуль тестируется отдельно.

---

## Chunk 1: Каркас монорепо

Результат чанка: монорепо собирается, пакет контракта и бэкенд имеют работающие тесты, база поднимается с двумя ролями.

### Task 1: Корень монорепо

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.nvmrc`
- Modify: `.gitignore`

- [ ] **Step 1: Проверить `.gitignore`**

Открой существующий `.gitignore` и убедись, что в нём есть строки `node_modules/`, `dist/`, `.next/`, `.env`. Если чего-то нет — допиши. Ключ шифрования живёт в `.env`, и его попадание в репозиторий нарушило бы требование спеки 4.9 о хранении ключа отдельно от базы.

- [ ] **Step 2: Создать `pnpm-workspace.yaml`**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 3: Создать корневой `package.json`**

Поле `packageManager` фиксирует версию pnpm — без него разные машины ставят разные версии и лок-файл начинает конфликтовать. Скрипта `lint` здесь нет намеренно: ESLint в объём этапа не входит, а скрипт без конфигурации молча возвращал бы успех.

```json
{
  "name": "cairn",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "build": "pnpm -r build"
  },
  "devDependencies": {
    "typescript": "^5.7.2"
  }
}
```

- [ ] **Step 4: Создать `tsconfig.base.json`**

`strict` и `noUncheckedIndexedAccess` включены намеренно: система работает с секретами, и молчаливый `undefined` из массива здесь дороже, чем неудобство при написании кода.

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "CommonJS",
    "moduleResolution": "Node",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

Модульная система — CommonJS: экосистема NestJS 11 рассчитана на неё, и попытка собрать бэкенд в ESM упирается в декораторы и загрузчики. Фронтенд переопределит эти настройки под себя.

- [ ] **Step 5: Создать `.nvmrc`**

```
22
```

- [ ] **Step 6: Установить зависимости**

Run: `pnpm install`
Expected: установка проходит, появляется `pnpm-lock.yaml`.

- [ ] **Step 7: Коммит**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .nvmrc pnpm-lock.yaml .gitignore
git commit -m "Создать каркас монорепо"
```

---

### Task 2: Перечисления в пакете контракта

Перечисления — первое, что появляется в коде, потому что на них ссылаются и схема базы, и API, и фронтенд. Правило пользователя: значение, используемое дважды и более, оформляется перечислением, а не union-типом.

Пакет собирается в `dist` и оттуда потребляется бэкендом. Отдавать исходники нельзя: бэкенд компилируется в CommonJS, и `require()` TypeScript-файла в собранном приложении не сработает. Тесты при этом ходят в исходники напрямую через alias — иначе пришлось бы пересобирать пакет после каждой правки.

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/enums.ts`, `packages/shared/src/index.ts`
- Test: `packages/shared/src/enums.test.ts`

- [ ] **Step 1: Создать `packages/shared/package.json`**

```json
{
  "name": "@cairn/shared",
  "version": "0.0.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "vitest": "^3.0.5"
  }
}
```

- [ ] **Step 2: Создать `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 3: Создать `packages/shared/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Установить зависимости**

Run: `pnpm install`
Expected: в `packages/shared/node_modules/.bin` появляется `vitest`.

- [ ] **Step 5: Написать падающий тест `packages/shared/src/enums.test.ts`**

Тест закрепляет два инварианта спеки, которые легко нарушить при последующем редактировании: секций ровно шесть (закрытый список из ТЗ 3) и уровень «нет» отсутствует среди значений, потому что выражается отсутствием строки выдачи (спека 4.3).

```typescript
import { describe, expect, it } from 'vitest';

import { AccessLevel, AuditSubjectKind, Section, SubjectKind } from './enums';

describe('Section', () => {
  it('содержит ровно шесть секций', () => {
    expect(Object.values(Section)).toHaveLength(6);
  });

  it('содержит все секции из ТЗ', () => {
    expect(Object.values(Section)).toEqual([
      'info',
      'infrastructure',
      'variables',
      'docs',
      'roadmap',
      'chronicle',
    ]);
  });
});

describe('AccessLevel', () => {
  it('содержит три уровня без значения «нет»', () => {
    expect(Object.values(AccessLevel)).toEqual(['metadata', 'read', 'write']);
  });
});

describe('AuditSubjectKind', () => {
  it('расширяет виды субъектов значением system', () => {
    expect(Object.values(AuditSubjectKind)).toEqual([
      ...Object.values(SubjectKind),
      'system',
    ]);
  });
});
```

- [ ] **Step 6: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/shared test`
Expected: FAIL — «Failed to resolve import "./enums"». Если вместо этого написано `vitest: command not found`, зависимости не установлены — вернись к шагу 4.

- [ ] **Step 7: Создать `packages/shared/src/enums.ts`**

```typescript
/** Секции проекта. Список закрытый: секции являются единицами выдачи доступа (ТЗ 3). */
export enum Section {
  /** Паспорт проекта. */
  Info = 'info',
  /** Окружения, серверы, домены. */
  Infrastructure = 'infrastructure',
  /** Конфигурация по окружениям. */
  Variables = 'variables',
  /** Страницы документации. */
  Docs = 'docs',
  /** Версии и чекпоинты. */
  Roadmap = 'roadmap',
  /** Лента событий проекта. */
  Chronicle = 'chronicle',
}

/**
 * Уровни доступа к секции.
 *
 * Уровень «нет» из ТЗ 4.2 здесь отсутствует намеренно: он выражается
 * отсутствием строки выдачи. Два способа записать одно состояние неизбежно
 * разошлись бы в выборках (спека 4.3).
 */
export enum AccessLevel {
  /** Видно, что объекты есть, и их описания; содержимое скрыто. */
  Metadata = 'metadata',
  /** Видно содержимое. */
  Read = 'read',
  /** Можно изменять. */
  Write = 'write',
}

/** Виды субъектов доступа. Люди и машины живут в одной модели прав (ТЗ 2). */
export enum SubjectKind {
  /** Человек с аутентификацией. */
  User = 'user',
  /** Машинный субъект для доступа нейросети. */
  AgentToken = 'agent_token',
  /** Машинный субъект для входящих данных. */
  IntakeAddress = 'intake_address',
}

/**
 * Виды действующих лиц в журнале.
 *
 * Отдельный перечень, расширяющий {@link SubjectKind} значением `system` для
 * действий с консоли сервера, у которых субъекта нет вовсе (спека 4.7).
 * Объединять эти два перечисления нельзя.
 */
export enum AuditSubjectKind {
  User = 'user',
  AgentToken = 'agent_token',
  IntakeAddress = 'intake_address',
  /** Действие оператора с консоли сервера. */
  System = 'system',
}

/** Состояние жизненного цикла проекта. Означает намерение, а не доступность (ТЗ 3.1). */
export enum ProjectLifecycle {
  Development = 'development',
  Active = 'active',
  Paused = 'paused',
  Archived = 'archived',
}

/** Вид одноразовой ссылки на установку пароля (спека 4.6). */
export enum InvitationKind {
  /** Первичное приглашение. */
  Invitation = 'invitation',
  /** Сброс пароля действующему пользователю. */
  PasswordReset = 'password_reset',
}
```

- [ ] **Step 8: Создать `packages/shared/src/index.ts`**

```typescript
export * from './enums';
```

- [ ] **Step 9: Запустить тест**

Run: `pnpm --filter @cairn/shared test`
Expected: PASS, 4 теста.

- [ ] **Step 10: Проверить сборку пакета**

Run: `pnpm --filter @cairn/shared build`
Expected: появляется `packages/shared/dist/index.js` и `index.d.ts`, тестовые файлы в `dist` не попадают.

- [ ] **Step 11: Коммит**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "Добавить перечисления секций и уровней доступа"
```

---

### Task 3: Каркас бэкенда с Vitest

Отдельная задача, потому что связка NestJS с Vitest требует нестандартной настройки: декораторы NestJS опираются на `emitDecoratorMetadata`, а esbuild, используемый Vitest по умолчанию, эту опцию не поддерживает. Без плагина SWC внедрение зависимостей молча перестаёт работать в тестах.

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/tsconfig.tools.json`, `apps/api/nest-cli.json`, `apps/api/vitest.config.ts`
- Create: `apps/api/src/app.module.ts`, `apps/api/src/main.ts`, `apps/api/src/env.ts`
- Test: `apps/api/src/app.module.test.ts`

- [ ] **Step 1: Создать `apps/api/package.json`**

Пакет `dotenv` нужен, потому что `.env` лежит в корне монорепо, а скрипты выполняются из `apps/api`: без явной загрузки с указанием пути переменные окружения не попадут в процесс.

```json
{
  "name": "@cairn/api",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "nest start --watch",
    "build": "nest build",
    "start": "node dist/main.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts"
  },
  "dependencies": {
    "@cairn/shared": "workspace:*",
    "@nestjs/common": "^11.0.1",
    "@nestjs/core": "^11.0.1",
    "@nestjs/platform-express": "^11.0.1",
    "cookie-parser": "^1.4.7",
    "dotenv": "^16.4.7",
    "drizzle-orm": "^0.38.3",
    "postgres": "^3.4.5",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/testing": "^11.0.1",
    "@types/cookie-parser": "^1.4.8",
    "@types/express": "^5.0.0",
    "@types/node": "^22.10.5",
    "drizzle-kit": "^0.30.1",
    "tsx": "^4.19.2",
    "unplugin-swc": "^1.5.1",
    "vitest": "^3.0.5"
  }
}
```

- [ ] **Step 2: Создать `apps/api/tsconfig.json`**

`experimentalDecorators` и `emitDecoratorMetadata` обязательны для NestJS. Конфигурация Drizzle вынесена в отдельный файл: она лежит вне `src` и при включении в этот `include` ломала бы `rootDir`.

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Создать `apps/api/tsconfig.tools.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["drizzle.config.ts"]
}
```

- [ ] **Step 4: Создать `apps/api/nest-cli.json`**

Без этого файла `nest build` и `nest start` завершаются ошибкой «Could not find nest-cli.json».

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

- [ ] **Step 5: Создать `apps/api/vitest.config.ts`**

Alias на исходники пакета контракта позволяет тестам видеть правки в нём без пересборки. Ключ шифрования задан фиксированным значением: модуль шифрования читает его при загрузке и без него не стартует.

```typescript
import { resolve } from 'node:path';

import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    // Декораторы NestJS требуют emitDecoratorMetadata, которую esbuild не поддерживает.
    swc.vite({ module: { type: 'es6' } }),
  ],
  resolve: {
    alias: {
      // Тесты ходят в исходники контракта, чтобы не пересобирать пакет после каждой правки.
      '@cairn/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    env: {
      // Фиксированный тестовый ключ: 32 нулевых байта в base64.
      CAIRN_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    },
    // Интеграционные тесты поднимают контейнер с базой.
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
```

- [ ] **Step 6: Установить зависимости**

Run: `pnpm install`
Expected: в `apps/api/node_modules/.bin` появляются `vitest`, `tsx`, `nest`, `drizzle-kit`.

- [ ] **Step 7: Написать падающий тест `apps/api/src/app.module.test.ts`**

Тест проверяет, что модуль собирается и внедрение зависимостей работает — то есть что связка SWC и Vitest настроена верно. Без него поломка настройки обнаружится только в следующей задаче и будет выглядеть как ошибка в её коде.

```typescript
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AppModule } from './app.module';

describe('AppModule', () => {
  it('собирается', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
```

- [ ] **Step 8: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test`
Expected: FAIL — «Failed to resolve import "./app.module"».

- [ ] **Step 9: Создать `apps/api/src/env.ts`**

Единственное место, где читается `.env`. Путь указан явно, потому что файл лежит в корне монорепо, а процесс запускается из `apps/api`.

```typescript
import { resolve } from 'node:path';

import { config } from 'dotenv';

/**
 * Загружает переменные окружения из корневого `.env`.
 *
 * Вызывается первой строкой в точках входа: приложении, миграциях и командах
 * консоли. Под тестами файл не читается — значения задаёт `vitest.config.ts`.
 */
export function loadEnv(): void {
  config({ path: resolve(__dirname, '../../../.env') });
}
```

- [ ] **Step 10: Создать `apps/api/src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';

/** Корневой модуль приложения. Модули добавляются по мере реализации. */
@Module({
  imports: [],
})
export class AppModule {}
```

- [ ] **Step 11: Создать `apps/api/src/main.ts`**

```typescript
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';

import { loadEnv } from './env';

loadEnv();

// Импорт после загрузки окружения: модули читают переменные при инициализации.
const { AppModule } = await import('./app.module');

/** Точка входа. CORS не настраивается: оба приложения за одним реверс-прокси (спека 3.3). */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
  app.setGlobalPrefix('api');

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();
```

Если сборка CommonJS не примет `await import` на верхнем уровне, замени две строки на обычный `import { AppModule } from './app.module';` вверху файла и перенеси `loadEnv()` в отдельный файл `apps/api/src/bootstrap.ts`, который импортируется первым: `import './env-init';`. Проверь `pnpm --filter @cairn/api build` перед тем, как считать шаг выполненным.

- [ ] **Step 12: Запустить тест**

Run: `pnpm --filter @cairn/api test`
Expected: PASS, 1 тест.

- [ ] **Step 13: Проверить типы**

Run: `pnpm --filter @cairn/api typecheck`
Expected: без ошибок.

- [ ] **Step 14: Коммит**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "Добавить каркас бэкенда с настроенным Vitest"
```

---

### Task 4: Развёртывание базы данных

Две роли базы (спека 4.7) заводятся здесь, до появления таблиц: журнал должен быть недоступен на запись приложению с самого первого дня, а не после того, как о нём вспомнят.

**Files:**
- Create: `docker-compose.yml`, `.env.example`
- Create: `docker/postgres/init/01-roles.sh`

- [ ] **Step 1: Создать `docker/postgres/init/01-roles.sh`**

Скрипт, а не SQL-файл: пароль роли приложения берётся из окружения. Захардкоженный в репозитории пароль роли, имеющей доступ к зашифрованным секретам, обесценил бы разделение ролей.

```bash
#!/bin/bash
set -euo pipefail

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE ROLE cairn_app WITH LOGIN PASSWORD '${CAIRN_APP_PASSWORD}';
  GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO cairn_app;
  GRANT USAGE ON SCHEMA public TO cairn_app;
EOSQL
```

Файл должен быть исполняемым: `chmod +x docker/postgres/init/01-roles.sh`.

- [ ] **Step 2: Создать `docker-compose.yml`**

Публикация порта нужна для локальной разработки и миграций с хоста. Реверс-прокси добавляется в чанке 5, когда появится что проксировать.

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: cairn
      POSTGRES_USER: cairn_owner
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD не задан}
      CAIRN_APP_PASSWORD: ${CAIRN_APP_PASSWORD:?CAIRN_APP_PASSWORD не задан}
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./docker/postgres/init:/docker-entrypoint-initdb.d:ro
    ports:
      # Только для локальной разработки. На сервере строку следует убрать:
      # приложение ходит в базу по внутренней сети Compose.
      - '127.0.0.1:5432:5432'
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U cairn_owner -d cairn']
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  postgres-data:
```

- [ ] **Step 3: Создать `.env.example`**

Пароли встречаются дважды: как отдельная переменная для контейнера и внутри строки подключения. Расхождение между ними — самая частая причина отказа миграций, поэтому оно вынесено в комментарий.

```bash
# --- База данных ---
# Пароль владельца схемы. Этой ролью выполняются миграции.
POSTGRES_PASSWORD=change_me_owner

# Пароль роли приложения. Задаётся при первом запуске контейнера.
CAIRN_APP_PASSWORD=change_me_app

# ВАЖНО: пароли в строках подключения должны совпадать с двумя переменными выше.
# При их расхождении миграции падают с ошибкой аутентификации.

# Строка подключения для миграций — полные права на схему.
DATABASE_OWNER_URL=postgres://cairn_owner:change_me_owner@localhost:5432/cairn

# Строка подключения приложения — без права изменять журнал.
DATABASE_URL=postgres://cairn_app:change_me_app@localhost:5432/cairn

# --- Приложение ---
# Ключ прикладного шифрования: 32 байта в base64.
# Сгенерировать: openssl rand -base64 32
CAIRN_ENCRYPTION_KEY=

# Адрес веб-приложения, используется в ссылках приглашений.
CAIRN_WEB_URL=http://localhost:3000
```

- [ ] **Step 4: Подготовить локальное окружение**

```bash
cp .env.example .env
openssl rand -base64 32
```

Вставь полученный ключ в `CAIRN_ENCRYPTION_KEY` и замени оба пароля на собственные — не забыв поправить их и в строках подключения.

- [ ] **Step 5: Поднять базу**

```bash
chmod +x docker/postgres/init/01-roles.sh
docker compose up -d --wait postgres
```

Флаг `--wait` дожидается healthcheck: без него следующая команда с высокой вероятностью получит «the database system is starting up».

- [ ] **Step 6: Проверить, что обе роли созданы**

Run: `docker compose exec postgres psql -U cairn_owner -d cairn -c "\du"`
Expected: в списке ролей присутствуют `cairn_owner` и `cairn_app`.

- [ ] **Step 7: Коммит**

```bash
git add docker-compose.yml .env.example docker/
git commit -m "Добавить развёртывание базы с раздельными ролями"
```

---

**Результат чанка 1:** монорепо собирается, оба пакета имеют работающие тесты, база поднимается с двумя ролями. Следующий чанк добавляет схему данных и шифрование.

---

## Chunk 2: Схема данных и шифрование

Результат чанка: восемь таблиц созданы миграциями, неизменяемость журнала обеспечена правами роли и покрыта интеграционным тестом, шифрование работает.

### Task 5: Схема базы — субъекты и пользователи

**Files:**
- Create: `apps/api/src/db/schema/subjects.ts`, `apps/api/src/db/schema/users.ts`, `apps/api/src/db/schema/index.ts`
- Create: `apps/api/drizzle.config.ts`
- Test: `apps/api/src/db/schema/subjects.test.ts`, `apps/api/src/db/schema/users.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/db/schema/subjects.test.ts`**

Тест проверяет соответствие схемы перечислениям из контракта. Это защита от расхождения: перечисление в `@cairn/shared` и перечисление PostgreSQL — два разных объявления одних и тех же значений, и они обязаны совпадать.

```typescript
import { AuditSubjectKind, SubjectKind } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { subjectKindEnum, subjects } from './subjects';

describe('субъекты', () => {
  it('перечисление вида субъекта совпадает с контрактом', () => {
    expect(subjectKindEnum.enumValues).toEqual(Object.values(SubjectKind));
  });

  it('не знает про значение system', () => {
    // Оно принадлежит перечислению журнала — это разные перечисления (спека 4.7).
    expect(subjectKindEnum.enumValues).not.toContain(AuditSubjectKind.System);
  });

  it('содержит признак отзыва', () => {
    // Физического удаления нет: оно разорвало бы связи в журнале (спека 4.1).
    expect(subjects.revokedAt).toBeDefined();
  });
});
```

- [ ] **Step 2: Написать падающий тест `apps/api/src/db/schema/users.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';

import { users } from './users';

describe('пользователи', () => {
  it('не содержит поля статуса', () => {
    // Активность определяется через subjects.revokedAt — единственный источник истины (спека 4.2).
    expect('status' in users).toBe(false);
  });

  it('хранит секрет второго фактора в зашифрованном виде', () => {
    expect(users.totpSecretEncrypted).toBeDefined();
  });

  it('допускает отсутствие пароля', () => {
    // Состояние «нет действующего пароля»: приглашён либо пароль сброшен (спека 4.2).
    expect(users.passwordHash.notNull).toBe(false);
  });
});
```

- [ ] **Step 3: Запустить тесты и убедиться, что они падают**

Run: `pnpm --filter @cairn/api test src/db/schema`
Expected: FAIL — «Failed to resolve import "./subjects"».

- [ ] **Step 4: Создать `apps/api/src/db/schema/subjects.ts`**

```typescript
import { SubjectKind } from '@cairn/shared';
import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Вид субъекта доступа. Значения совпадают с {@link SubjectKind} из контракта. */
export const subjectKindEnum = pgEnum('subject_kind', [
  SubjectKind.User,
  SubjectKind.AgentToken,
  SubjectKind.IntakeAddress,
]);

/**
 * Субъекты доступа: люди и машины в одной таблице (ТЗ 2).
 *
 * Физическое удаление не предусмотрено — оно разорвало бы связи в журнале.
 * Отзыв выражается заполнением `revokedAt` (спека 4.1).
 */
export const subjects = pgTable('subjects', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: subjectKindEnum('kind').notNull(),
  label: text('label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

/** Строка таблицы субъектов. */
export type Subject = typeof subjects.$inferSelect;
```

- [ ] **Step 5: Создать `apps/api/src/db/schema/users.ts`**

```typescript
import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { subjects } from './subjects';

/**
 * Пользователи — люди с аутентификацией.
 *
 * Поля статуса нет намеренно: активность определяется по `subjects.revokedAt`.
 * Состояние «нет действующего пароля» выводится из `passwordHash IS NULL`
 * и охватывает как приглашённого, так и пользователя со сброшенным паролем (спека 4.2).
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  subjectId: uuid('subject_id')
    .notNull()
    .unique()
    .references(() => subjects.id, { onDelete: 'restrict' }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  totpSecretEncrypted: text('totp_secret_encrypted'),
  isTotpEnabled: boolean('is_totp_enabled').notNull().default(false),
  isSuperadmin: boolean('is_superadmin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Строка таблицы пользователей. */
export type User = typeof users.$inferSelect;
```

- [ ] **Step 6: Создать `apps/api/src/db/schema/index.ts`**

```typescript
export * from './subjects';
export * from './users';
```

- [ ] **Step 7: Создать `apps/api/drizzle.config.ts`**

Миграции выполняются ролью-владельцем: роль приложения не имеет прав на изменение схемы.

```typescript
import { resolve } from 'node:path';

import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: resolve(__dirname, '../../.env') });

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_OWNER_URL ?? '',
  },
});
```

- [ ] **Step 8: Запустить тесты**

Run: `pnpm --filter @cairn/api test src/db/schema`
Expected: PASS, 6 тестов.

- [ ] **Step 9: Коммит**

```bash
git add apps/api/src/db apps/api/drizzle.config.ts
git commit -m "Добавить таблицы субъектов и пользователей"
```

---

### Task 6: Схема базы — проекты и выдачи доступа

**Files:**
- Create: `apps/api/src/db/schema/projects.ts`, `apps/api/src/db/schema/grants.ts`
- Modify: `apps/api/src/db/schema/index.ts`
- Test: `apps/api/src/db/schema/grants.test.ts`, `apps/api/src/db/schema/projects.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/db/schema/grants.test.ts`**

```typescript
import { AccessLevel, Section } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { accessLevelEnum, grants, sectionEnum } from './grants';

describe('выдачи доступа', () => {
  it('перечисление секций совпадает с контрактом', () => {
    expect(sectionEnum.enumValues).toEqual(Object.values(Section));
  });

  it('содержит все шесть секций, включая нереализованные', () => {
    // Выдать доступ к будущей секции можно до её реализации (спека 4.3).
    expect(sectionEnum.enumValues).toHaveLength(6);
  });

  it('перечисление уровней не содержит значения «нет»', () => {
    // Отсутствие доступа выражается отсутствием строки (спека 4.3).
    expect(accessLevelEnum.enumValues).toEqual(Object.values(AccessLevel));
    expect(accessLevelEnum.enumValues).not.toContain('none');
  });

  it('хранит, кто выдал доступ', () => {
    expect(grants.grantedBy).toBeDefined();
  });
});
```

- [ ] **Step 2: Написать падающий тест `apps/api/src/db/schema/projects.test.ts`**

```typescript
import { ProjectLifecycle } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { projectLifecycleEnum, projects } from './projects';

describe('проекты', () => {
  it('перечисление жизненного цикла совпадает с контрактом', () => {
    expect(projectLifecycleEnum.enumValues).toEqual(Object.values(ProjectLifecycle));
  });

  it('слаг уникален', () => {
    expect(projects.slug.isUnique).toBe(true);
  });

  it('допускает проект без ответственного', () => {
    // Ответственный — справочное поле и прав не даёт (спека 4.4).
    expect(projects.ownerUserId.notNull).toBe(false);
  });
});
```

- [ ] **Step 3: Запустить тесты и убедиться, что они падают**

Run: `pnpm --filter @cairn/api test src/db/schema`
Expected: FAIL — «Failed to resolve import "./grants"».

- [ ] **Step 4: Создать `apps/api/src/db/schema/projects.ts`**

```typescript
import { ProjectLifecycle } from '@cairn/shared';
import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './users';

/** Состояние жизненного цикла проекта. */
export const projectLifecycleEnum = pgEnum('project_lifecycle', [
  ProjectLifecycle.Development,
  ProjectLifecycle.Active,
  ProjectLifecycle.Paused,
  ProjectLifecycle.Archived,
]);

/**
 * Проекты. Эта таблица и есть секция «Инфо» — отдельной таблицы под неё нет.
 *
 * `ownerUserId` — справочное поле «ответственный» из паспорта проекта.
 * Прав оно не даёт: доступ выдаётся только явно (спека 4.4).
 */
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  purpose: text('purpose'),
  stack: text('stack'),
  repoUrl: text('repo_url'),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'restrict' }),
  lifecycle: projectLifecycleEnum('lifecycle').notNull().default(ProjectLifecycle.Development),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Строка таблицы проектов. */
export type Project = typeof projects.$inferSelect;
```

- [ ] **Step 5: Создать `apps/api/src/db/schema/grants.ts`**

Индексы по субъекту и проекту заведены сразу: это горячие пути разрешения уровня доступа и списка видимых проектов, а добавлять их отдельной миграцией дороже, чем объявить здесь.

```typescript
import { AccessLevel, Section } from '@cairn/shared';
import { index, pgEnum, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { projects } from './projects';
import { subjects } from './subjects';
import { users } from './users';

/** Секции проекта. Все шесть заводятся сразу, включая нереализованные (спека 4.3). */
export const sectionEnum = pgEnum('section', [
  Section.Info,
  Section.Infrastructure,
  Section.Variables,
  Section.Docs,
  Section.Roadmap,
  Section.Chronicle,
]);

/** Уровни доступа. Значения «нет» нет: оно выражается отсутствием строки. */
export const accessLevelEnum = pgEnum('access_level', [
  AccessLevel.Metadata,
  AccessLevel.Read,
  AccessLevel.Write,
]);

/**
 * Выдачи доступа — ядро модели прав: «субъект × проект × секция × уровень» (ТЗ 4.1).
 *
 * Отзыв доступа — удаление строки. Выдавать и отзывать вправе только
 * суперадмин, независимо от его уровня доступа к проекту (спека 4.3).
 */
export const grants = pgTable(
  'grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    section: sectionEnum('section').notNull(),
    level: accessLevelEnum('level').notNull(),
    grantedBy: uuid('granted_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('grants_subject_project_section').on(table.subjectId, table.projectId, table.section),
    index('grants_subject_idx').on(table.subjectId),
    index('grants_project_idx').on(table.projectId),
  ],
);

/** Строка таблицы выдач. */
export type Grant = typeof grants.$inferSelect;
```

- [ ] **Step 6: Дополнить `apps/api/src/db/schema/index.ts`**

```typescript
export * from './grants';
export * from './projects';
export * from './subjects';
export * from './users';
```

- [ ] **Step 7: Запустить тесты**

Run: `pnpm --filter @cairn/api test src/db/schema`
Expected: PASS, 13 тестов.

- [ ] **Step 8: Коммит**

```bash
git add apps/api/src/db/schema
git commit -m "Добавить таблицы проектов и выдач доступа"
```

---

### Task 7: Схема базы — сессии, ссылки, челленджи, журнал

**Files:**
- Create: `apps/api/src/db/schema/sessions.ts`, `apps/api/src/db/schema/invitations.ts`, `apps/api/src/db/schema/totp-challenges.ts`, `apps/api/src/db/schema/audit-log.ts`
- Modify: `apps/api/src/db/schema/index.ts`
- Test: `apps/api/src/db/schema/audit-log.test.ts`, `apps/api/src/db/schema/sessions.test.ts`, `apps/api/src/db/schema/invitations.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/db/schema/audit-log.test.ts`**

```typescript
import { AuditSubjectKind } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { auditLog, auditSubjectKindEnum } from './audit-log';

describe('журнал действий', () => {
  it('перечисление действующих лиц включает system', () => {
    expect(auditSubjectKindEnum.enumValues).toEqual(Object.values(AuditSubjectKind));
  });

  it('допускает записи без субъекта', () => {
    // Действия с консоли субъекта не имеют (спека 4.7).
    expect(auditLog.subjectId.notNull).toBe(false);
  });

  it('денормализует вид и метку субъекта', () => {
    // Запись должна оставаться информативной после отзыва субъекта.
    expect(auditLog.subjectKind).toBeDefined();
    expect(auditLog.subjectLabel).toBeDefined();
  });
});
```

- [ ] **Step 2: Написать падающий тест `apps/api/src/db/schema/sessions.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';

import { sessions } from './sessions';
import { totpChallenges } from './totp-challenges';

describe('сессии', () => {
  it('хранит только хэш токена', () => {
    // Сам токен известен лишь браузеру: утечка базы не должна давать входа.
    expect('token' in sessions).toBe(false);
    expect(sessions.tokenHash).toBeDefined();
  });

  it('содержит признак отзыва для немедленного завершения', () => {
    expect(sessions.revokedAt).toBeDefined();
  });
});

describe('челленджи второго фактора', () => {
  it('считает попытки', () => {
    // Пять неудачных попыток исчерпывают челлендж (спека 6.2).
    expect(totpChallenges.attempts).toBeDefined();
  });

  it('хранит только хэш токена', () => {
    expect('token' in totpChallenges).toBe(false);
  });
});
```

- [ ] **Step 3: Написать падающий тест `apps/api/src/db/schema/invitations.test.ts`**

```typescript
import { InvitationKind } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { invitationKindEnum, invitations } from './invitations';

describe('ссылки на установку пароля', () => {
  it('перечисление вида ссылки совпадает с контрактом', () => {
    expect(invitationKindEnum.enumValues).toEqual(Object.values(InvitationKind));
  });

  it('не хранит адрес почты', () => {
    // Адрес живёт только в users — два места хранения разошлись бы (спека 4.6).
    expect('email' in invitations).toBe(false);
  });

  it('различает приглашение и сброс пароля', () => {
    expect(invitations.kind).toBeDefined();
  });
});
```

- [ ] **Step 4: Запустить тесты и убедиться, что они падают**

Run: `pnpm --filter @cairn/api test src/db/schema`
Expected: FAIL — «Failed to resolve import "./audit-log"».

- [ ] **Step 5: Создать `apps/api/src/db/schema/sessions.ts`**

```typescript
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { subjects } from './subjects';

/**
 * Сессии. Хранятся в базе ради мгновенного отзыва: для системы с секретами
 * отозвать доступ нужно немедленно, а не по истечении срока токена (спека 4.5).
 *
 * В базе лежит только хэш токена — сам токен известен лишь браузеру.
 * Индекс по субъекту нужен для массового завершения сессий при отзыве.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [index('sessions_subject_idx').on(table.subjectId)],
);

/** Строка таблицы сессий. */
export type Session = typeof sessions.$inferSelect;
```

- [ ] **Step 6: Создать `apps/api/src/db/schema/invitations.ts`**

```typescript
import { InvitationKind } from '@cairn/shared';
import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './users';

/** Вид одноразовой ссылки на установку пароля. */
export const invitationKindEnum = pgEnum('invitation_kind', [
  InvitationKind.Invitation,
  InvitationKind.PasswordReset,
]);

/**
 * Одноразовые ссылки на установку пароля — приглашения и сбросы.
 *
 * Живая ссылка возможна только для пользователя без действующего пароля,
 * иначе ссылка стала бы обходом аутентификации (спека 4.6).
 * Адрес почты берётся из `users` по `userId` и здесь не дублируется.
 */
export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  tokenHash: text('token_hash').notNull().unique(),
  kind: invitationKindEnum('kind').notNull(),
  invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'restrict' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Строка таблицы ссылок. */
export type Invitation = typeof invitations.$inferSelect;
```

- [ ] **Step 7: Создать `apps/api/src/db/schema/totp-challenges.ts`**

```typescript
import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './users';

/**
 * Промежуточное состояние между проверкой пароля и проверкой второго фактора.
 *
 * Живёт минуты. Пять неудачных попыток исчерпывают челлендж, и вход
 * начинается заново с пароля (спека 6.2).
 */
export const totpChallenges = pgTable('totp_challenges', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  attempts: integer('attempts').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Строка таблицы челленджей. */
export type TotpChallenge = typeof totpChallenges.$inferSelect;
```

- [ ] **Step 8: Создать `apps/api/src/db/schema/audit-log.ts`**

```typescript
import { AuditSubjectKind } from '@cairn/shared';
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { projects } from './projects';
import { subjects } from './subjects';

/**
 * Виды действующих лиц в журнале.
 *
 * Отдельное перечисление, расширяющее `subject_kind` значением `system`
 * для действий с консоли сервера. Объединять их нельзя (спека 4.7).
 */
export const auditSubjectKindEnum = pgEnum('audit_subject_kind', [
  AuditSubjectKind.User,
  AuditSubjectKind.AgentToken,
  AuditSubjectKind.IntakeAddress,
  AuditSubjectKind.System,
]);

/**
 * Журнал действий. Только на добавление.
 *
 * Запрет изменения обеспечивается правами роли базы, а не кодом: журнал —
 * средство расследования инцидентов, включая инциденты с участием самого
 * приложения (спека 4.7).
 *
 * `subjectId` пуст для действий с консоли — субъекта у них нет.
 * `subjectKind` и `subjectLabel` денормализованы, чтобы запись оставалась
 * информативной после отзыва субъекта.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'restrict' }),
    subjectKind: auditSubjectKindEnum('subject_kind').notNull(),
    subjectLabel: text('subject_label').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'restrict' }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_log_created_at_idx').on(table.createdAt),
    index('audit_log_subject_idx').on(table.subjectId),
    index('audit_log_project_idx').on(table.projectId),
  ],
);

/** Строка журнала. */
export type AuditLogEntry = typeof auditLog.$inferSelect;
```

- [ ] **Step 9: Дополнить `apps/api/src/db/schema/index.ts`**

```typescript
export * from './audit-log';
export * from './grants';
export * from './invitations';
export * from './projects';
export * from './sessions';
export * from './subjects';
export * from './totp-challenges';
export * from './users';
```

- [ ] **Step 10: Запустить тесты**

Run: `pnpm --filter @cairn/api test src/db/schema`
Expected: PASS, 21 тест.

- [ ] **Step 11: Коммит**

```bash
git add apps/api/src/db/schema
git commit -m "Добавить таблицы сессий, ссылок, челленджей и журнала"
```

---

### Task 8: Миграции и права роли приложения

Права выдаются отдельной миграцией после создания таблиц. Порядок важен: выдать права на несуществующую таблицу нельзя.

**Files:**
- Create: `apps/api/src/db/migrate.ts`
- Create: `apps/api/drizzle/0001_grant_app_privileges.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`

- [ ] **Step 1: Сгенерировать миграцию схемы**

Run: `pnpm --filter @cairn/api db:generate`
Expected: в `apps/api/drizzle/` появляется файл `0000_*.sql` с созданием восьми таблиц и перечислений, а в `apps/api/drizzle/meta/_journal.json` — запись о нём.

- [ ] **Step 2: Создать `apps/api/src/db/migrate.ts`**

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { loadEnv } from '../env';

loadEnv();

/**
 * Применяет миграции ролью-владельцем схемы.
 *
 * Роль приложения прав на изменение схемы не имеет, поэтому используется
 * отдельная строка подключения (спека 4.7).
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_OWNER_URL;

  if (!url) {
    throw new Error('DATABASE_OWNER_URL не задан. Проверь .env в корне монорепо.');
  }

  const client = postgres(url, { max: 1 });

  await migrate(drizzle(client), { migrationsFolder: './drizzle' });
  await client.end();
}

void main();
```

- [ ] **Step 3: Создать `apps/api/drizzle/0001_grant_app_privileges.sql`**

Разделители `--> statement-breakpoint` обязательны: мигратор выполняет операторы по одному, и файл без разделителей уйдёт в базу единой строкой, на что PostgreSQL ответит «cannot insert multiple commands into a prepared statement».

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON
  subjects, users, projects, grants, sessions, invitations, totp_challenges
TO cairn_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON audit_log TO cairn_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cairn_app;
```

Журнал получает только `SELECT` и `INSERT`: ни `UPDATE`, ни `DELETE` (спека 4.7).

Правило на будущее, которое стоит держать в голове при добавлении таблиц на следующих этапах: **каждая новая таблица требует отдельной миграции с грантом.** Автоматической выдачи прав здесь нет намеренно — `ALTER DEFAULT PRIVILEGES` раздал бы полные права и журналу тоже.

- [ ] **Step 4: Зарегистрировать миграцию в `apps/api/drizzle/meta/_journal.json`**

Мигратор находит файлы по полю `tag`, поэтому оно должно точно совпадать с именем файла без расширения. Добавь в массив `entries` вторым элементом:

```json
{
  "idx": 1,
  "version": "7",
  "when": 1774483200000,
  "tag": "0001_grant_app_privileges",
  "breakpoints": true
}
```

Значение `when` должно быть больше, чем у записи `0000`. Если сгенерированная запись имеет большее значение — увеличь это на единицу. Поле `version` скопируй из записи `0000`, не меняя.

- [ ] **Step 5: Применить миграции**

```bash
docker compose up -d --wait postgres
pnpm --filter @cairn/api db:migrate
```

Expected: команда завершается без вывода ошибок.

- [ ] **Step 6: Проверить состав таблиц**

Run: `docker compose exec postgres psql -U cairn_owner -d cairn -c "\dt"`
Expected: восемь таблиц — `subjects`, `users`, `projects`, `grants`, `sessions`, `invitations`, `totp_challenges`, `audit_log`.

- [ ] **Step 7: Коммит**

```bash
git add apps/api/drizzle apps/api/src/db/migrate.ts
git commit -m "Добавить миграции и права роли приложения"
```

---

### Task 9: Интеграционный тест неизменяемости журнала

Свойство «журнал нельзя изменить» проверяется автоматическим тестом, а не разовой командой в консоли: следующая миграция способна молча его сломать, и обнаружиться это должно на тестах, а не при расследовании инцидента.

**Files:**
- Create: `apps/api/test/db-fixture.ts`
- Test: `apps/api/test/audit-immutability.test.ts`

- [ ] **Step 1: Установить Testcontainers**

Run: `pnpm --filter @cairn/api add -D @testcontainers/postgresql testcontainers`
Expected: пакеты добавлены в `devDependencies`.

- [ ] **Step 2: Создать `apps/api/test/db-fixture.ts`**

Контейнер поднимается один раз на файл тестов, а между тестами таблицы очищаются: поднимать контейнер на каждый тест — минуты ожидания вместо секунд.

```typescript
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import * as schema from '../src/db/schema';

/** Поднятая на время тестов база. */
export interface TestDatabase {
  /** Подключение с полными правами: нужно для подготовки данных. */
  db: PostgresJsDatabase<typeof schema>;
  /** Подключение ролью приложения: с ним проверяются ограничения прав. */
  appDb: PostgresJsDatabase<typeof schema>;
  stop: () => Promise<void>;
  truncate: () => Promise<void>;
}

/**
 * Поднимает PostgreSQL в контейнере, применяет миграции и заводит роль приложения.
 *
 * Роль заводится здесь же, а не в образе, чтобы тест ограничений прав
 * проверял ровно ту миграцию грантов, что лежит в репозитории.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:17-alpine',
  ).start();

  const ownerClient = postgres(container.getConnectionUri(), { max: 1 });
  const db = drizzle(ownerClient, { schema });

  await migrate(db, { migrationsFolder: './drizzle' });

  await db.execute(sql`CREATE ROLE cairn_app WITH LOGIN PASSWORD 'test_app_password'`);
  await db.execute(sql`GRANT USAGE ON SCHEMA public TO cairn_app`);
  await db.execute(sql`
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      subjects, users, projects, grants, sessions, invitations, totp_challenges
    TO cairn_app
  `);
  await db.execute(sql`GRANT SELECT, INSERT ON audit_log TO cairn_app`);

  const appClient = postgres(container.getConnectionUri(), {
    max: 1,
    user: 'cairn_app',
    password: 'test_app_password',
  });

  return {
    db,
    appDb: drizzle(appClient, { schema }),
    stop: async () => {
      await appClient.end();
      await ownerClient.end();
      await container.stop();
    },
    truncate: async () => {
      await db.execute(sql`
        TRUNCATE TABLE audit_log, grants, sessions, invitations, totp_challenges,
                       projects, users, subjects
        RESTART IDENTITY CASCADE
      `);
    },
  };
}
```

- [ ] **Step 3: Написать тест `apps/api/test/audit-immutability.test.ts`**

```typescript
import { AuditSubjectKind } from '@cairn/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { auditLog } from '../src/db/schema';
import { startTestDatabase, type TestDatabase } from './db-fixture';

describe('неизменяемость журнала', () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();
  });

  it('роль приложения может добавлять записи', async () => {
    await testDb.appDb.insert(auditLog).values({
      subjectKind: AuditSubjectKind.System,
      subjectLabel: 'проверка',
      action: 'test',
    });

    expect(await testDb.appDb.select().from(auditLog)).toHaveLength(1);
  });

  it('роль приложения не может изменять записи', async () => {
    await testDb.appDb.insert(auditLog).values({
      subjectKind: AuditSubjectKind.System,
      subjectLabel: 'проверка',
      action: 'test',
    });

    await expect(
      testDb.appDb.execute(sql`UPDATE audit_log SET action = 'подделка'`),
    ).rejects.toThrow(/permission denied/);
  });

  it('роль приложения не может удалять записи', async () => {
    await testDb.appDb.insert(auditLog).values({
      subjectKind: AuditSubjectKind.System,
      subjectLabel: 'проверка',
      action: 'test',
    });

    await expect(testDb.appDb.execute(sql`DELETE FROM audit_log`)).rejects.toThrow(
      /permission denied/,
    );
  });

  it('роль приложения свободно работает с обычными таблицами', async () => {
    // Ограничение касается только журнала: если бы оно задело остальные
    // таблицы, приложение перестало бы работать целиком.
    await testDb.appDb.execute(sql`
      INSERT INTO subjects (kind, label) VALUES ('user', 'проверка')
    `);
    await testDb.appDb.execute(sql`DELETE FROM subjects`);
  });
});
```

- [ ] **Step 4: Запустить тест**

Run: `pnpm --filter @cairn/api test test/audit-immutability`
Expected: PASS, 4 теста. Первый запуск дольше — скачивается образ PostgreSQL. Требуется работающий Docker.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/test apps/api/package.json pnpm-lock.yaml
git commit -m "Покрыть тестом неизменяемость журнала"
```

---

### Task 10: Сервис прикладного шифрования

Самая ответственная единица чанка. Формат хранимого значения включает версию ключа, чтобы будущая ротация не требовала переписывать все существующие записи (спека 4.9).

**Files:**
- Create: `apps/api/src/crypto/crypto.service.ts`, `apps/api/src/crypto/crypto.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/crypto/crypto.service.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/crypto/crypto.service.test.ts`**

Тест на разные шифротексты при одном открытом тексте — не придирка: повторяющийся nonce в AES-GCM разрушает стойкость шифра, и эта ошибка не проявляется иначе.

```typescript
import { randomBytes } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import { CryptoService } from './crypto.service';

const validKey = randomBytes(32).toString('base64');

describe('CryptoService', () => {
  let service: CryptoService;

  beforeEach(() => {
    service = new CryptoService(validKey);
  });

  describe('создание', () => {
    it('отказывается работать без ключа', () => {
      expect(() => new CryptoService(undefined)).toThrow(/CAIRN_ENCRYPTION_KEY/);
    });

    it('отказывается работать с ключом неверной длины', () => {
      const shortKey = randomBytes(16).toString('base64');

      expect(() => new CryptoService(shortKey)).toThrow(/32 байт/);
    });

    it('отказывается работать со строкой не в base64', () => {
      // Buffer.from молча отбрасывает недопустимые символы, поэтому проверка
      // длины поймала бы не всякий мусор — нужна явная сверка кодировки.
      expect(() => new CryptoService('не base64!!!')).toThrow(/base64/);
    });
  });

  describe('шифрование', () => {
    it('расшифровывает зашифрованное', () => {
      const secret = 'JBSWY3DPEHPK3PXP';

      expect(service.decrypt(service.encrypt(secret))).toBe(secret);
    });

    it('работает с кириллицей', () => {
      const secret = 'секретное значение';

      expect(service.decrypt(service.encrypt(secret))).toBe(secret);
    });

    it('даёт разный шифротекст для одного значения', () => {
      // Повторение nonce в AES-GCM разрушает стойкость шифра.
      expect(service.encrypt('одно и то же')).not.toBe(service.encrypt('одно и то же'));
    });

    it('помечает значение версией ключа', () => {
      expect(service.encrypt('значение').startsWith('v1:')).toBe(true);
    });

    it('состоит из четырёх частей', () => {
      expect(service.encrypt('значение').split(':')).toHaveLength(4);
    });
  });

  describe('расшифровка', () => {
    it('отвергает изменённый шифротекст', () => {
      const [version, nonce, ciphertext, tag] = service.encrypt('значение').split(':') as [
        string,
        string,
        string,
        string,
      ];
      const corrupted = Buffer.from(ciphertext, 'base64');
      corrupted[0] = (corrupted[0] ?? 0) ^ 0xff;

      const payload = [version, nonce, corrupted.toString('base64'), tag].join(':');

      expect(() => service.decrypt(payload)).toThrow();
    });

    it('отвергает изменённый тег аутентификации', () => {
      const [version, nonce, ciphertext] = service.encrypt('значение').split(':') as [
        string,
        string,
        string,
        string,
      ];
      const payload = [version, nonce, ciphertext, randomBytes(16).toString('base64')].join(':');

      expect(() => service.decrypt(payload)).toThrow();
    });

    it('отвергает значение, зашифрованное другим ключом', () => {
      const other = new CryptoService(randomBytes(32).toString('base64'));

      expect(() => service.decrypt(other.encrypt('значение'))).toThrow();
    });

    it('отвергает неизвестную версию ключа', () => {
      const payload = service.encrypt('значение').replace('v1:', 'v9:');

      expect(() => service.decrypt(payload)).toThrow(/версия ключа/);
    });

    it('отвергает значение неверного формата', () => {
      expect(() => service.decrypt('мусор')).toThrow(/формат/);
    });
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/crypto`
Expected: FAIL — «Failed to resolve import "./crypto.service"».

- [ ] **Step 3: Создать `apps/api/src/crypto/crypto.service.ts`**

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

/** Токен внедрения для ключа шифрования. */
export const ENCRYPTION_KEY = Symbol('ENCRYPTION_KEY');

/**
 * Прикладное шифрование значений, которые не должны быть читаемы при утечке базы.
 *
 * На этапе 1 применяется к секретам второго фактора; на этапе 4 к нему добавятся
 * значения переменных проектов (спека 4.9).
 *
 * Формат хранимого значения: `v1:<nonce>:<ciphertext>:<tag>`, три последние
 * части в base64. Версия ключа в начале нужна для будущей ротации: без неё
 * добавление версии позже потребовало бы переписать все существующие значения.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(@Inject(ENCRYPTION_KEY) rawKey: string | undefined) {
    if (!rawKey) {
      throw new Error(
        'CAIRN_ENCRYPTION_KEY не задан. Запуск без шифрования недопустим: система хранит секреты.',
      );
    }

    const key = Buffer.from(rawKey, 'base64');

    // Buffer.from молча отбрасывает символы вне алфавита base64, поэтому одной
    // проверки длины недостаточно: сверяем обратное преобразование.
    if (key.toString('base64') !== rawKey) {
      throw new Error('CAIRN_ENCRYPTION_KEY должен быть строкой в base64.');
    }

    if (key.length !== KEY_LENGTH) {
      throw new Error(
        `CAIRN_ENCRYPTION_KEY должен содержать 32 байта в base64, получено ${key.length}.`,
      );
    }

    this.key = key;
  }

  /** Шифрует значение. Каждый вызов даёт новый nonce и потому новый шифротекст. */
  encrypt(plaintext: string): string {
    const nonce = randomBytes(NONCE_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, nonce);

    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    return [
      CURRENT_VERSION,
      nonce.toString('base64'),
      ciphertext.toString('base64'),
      cipher.getAuthTag().toString('base64'),
    ].join(':');
  }

  /**
   * Расшифровывает значение.
   *
   * Бросает исключение при любом несоответствии: неверный формат, неизвестная
   * версия ключа, изменённый шифротекст или тег. Молчаливый возврат мусора
   * в системе с секретами опаснее отказа.
   */
  decrypt(payload: string): string {
    const parts = payload.split(':');

    if (parts.length !== PART_COUNT) {
      throw new Error('Неверный формат зашифрованного значения.');
    }

    const [version, nonce, ciphertext, tag] = parts as [string, string, string, string];

    if (version !== CURRENT_VERSION) {
      throw new Error(`Неизвестная версия ключа: ${version}.`);
    }

    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(nonce, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const NONCE_LENGTH = 12;
const PART_COUNT = 4;
const CURRENT_VERSION = 'v1';
```

- [ ] **Step 4: Запустить тест**

Run: `pnpm --filter @cairn/api test src/crypto`
Expected: PASS, 13 тестов.

- [ ] **Step 5: Создать `apps/api/src/crypto/crypto.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';

import { CryptoService, ENCRYPTION_KEY } from './crypto.service';

/**
 * Модуль шифрования. Глобальный: сервис нужен разным модулям, а состояние
 * у него единственное — ключ.
 */
@Global()
@Module({
  providers: [
    { provide: ENCRYPTION_KEY, useFactory: () => process.env.CAIRN_ENCRYPTION_KEY },
    CryptoService,
  ],
  exports: [CryptoService],
})
export class CryptoModule {}
```

Ключ читается фабрикой, а не значением при объявлении: значение вычислилось бы в момент импорта файла, до загрузки `.env`.

- [ ] **Step 6: Подключить модуль в `apps/api/src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';

import { CryptoModule } from './crypto/crypto.module';

/** Корневой модуль приложения. Модули добавляются по мере реализации. */
@Module({
  imports: [CryptoModule],
})
export class AppModule {}
```

- [ ] **Step 7: Запустить все тесты и проверку типов**

```bash
pnpm test
pnpm typecheck
```

Expected: оба без ошибок. Тест сборки `AppModule` проходит благодаря ключу из `vitest.config.ts`.

- [ ] **Step 8: Коммит**

```bash
git add apps/api/src/crypto apps/api/src/app.module.ts
git commit -m "Добавить сервис прикладного шифрования"
```

---

**Результат чанка 2:** восемь таблиц созданы миграциями, неизменяемость журнала обеспечена правами роли и проверяется тестом, шифрование работает. Следующий чанк добавляет модель прав.
