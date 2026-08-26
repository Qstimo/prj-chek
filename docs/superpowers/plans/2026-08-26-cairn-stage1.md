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

**После правки `packages/shared` выполняй `pnpm --filter @cairn/shared build`.** Проверка типов бэкенда смотрит в собранный `dist`, а тесты — в исходники через alias. Без пересборки эти два способа увидят разные версии контракта, и расхождение проявится как необъяснимая ошибка типов при зелёных тестах.

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

**`apps/api/test/`** — интеграционные тесты на настоящем PostgreSQL через Testcontainers: тестовая фикстура и проверки, требующие живой базы с её ограничениями и правами.

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
    "typecheck": "tsc -p tsconfig.tools.json",
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

Проверяет файлы вне `src`: конфигурацию Drizzle и интеграционные тесты. Без отдельного конфига они не проверяются вовсе, потому что основной ограничен `rootDir: "./src"`.

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "noEmit": true
  },
  "include": ["drizzle.config.ts", "test/**/*", "src/**/*"]
}
```

- [ ] **Step 3a: Создать `apps/api/tsconfig.build.json`**

Nest CLI подхватывает этот файл автоматически. Без него `nest build` скомпилирует тестовые файлы в `dist` вместе с импортами Vitest, которого в продакшен-зависимостях нет.

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["**/*.test.ts", "test/**", "dist", "node_modules"]
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
    "deleteOutDir": true,
    "tsConfigPath": "tsconfig.build.json"
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
 *
 * Не импортируй эту функцию из тестов: она опирается на `__dirname`, которого
 * нет в ESM, а Vitest транспилирует файлы именно в ESM.
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

Переменные окружения загружаются первой строкой `bootstrap()`, а не на верхнем уровне модуля. Это работает потому, что модули читают окружение в фабриках провайдеров, а фабрики выполняются внутри `NestFactory.create()` — то есть уже после `loadEnv()`. Импорт `app.module` на верхнем уровне лишь выполняет декораторы и переменных не касается.

```typescript
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { loadEnv } from './env';

/** Точка входа. CORS не настраивается: оба приложения за одним реверс-прокси (спека 3.3). */
async function bootstrap(): Promise<void> {
  loadEnv();

  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
  app.setGlobalPrefix('api');

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();
```

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

Флаг `ON_ERROR_STOP=1` обязателен: без него psql возвращает нулевой код даже при ошибке SQL, `set -e` не срабатывает, и контейнер отчитывается об успешной инициализации без роли. Сбой всплыл бы позже как непонятная ошибка аутентификации при миграциях.

```bash
#!/bin/bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE ROLE cairn_app WITH LOGIN PASSWORD '${CAIRN_APP_PASSWORD}';
  GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO cairn_app;
  GRANT USAGE ON SCHEMA public TO cairn_app;
EOSQL
```

Файл должен быть исполняемым: `chmod +x docker/postgres/init/01-roles.sh`.

- [ ] **Step 2: Создать `docker-compose.yml`**

Публикация порта нужна для локальной разработки и миграций с хоста. Реверс-прокси добавляется в последнем чанке, когда появится что проксировать.

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

# Пароль роли приложения.
# ВНИМАНИЕ: применяется только при первой инициализации тома с данными.
# Изменение этой строки позже не поменяет пароль в базе — роль сохранит старый,
# и подключение перестанет работать при внешне правильном .env.
# Чтобы сменить пароль, выполни ALTER ROLE вручную либо пересоздай том.
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
# Вставлять без кавычек и без переводов строк: приложение сверяет каноничность
# записи и откажется стартовать при лишних символах.
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

## Chunk 2: Схема данных

Результат чанка: восемь таблиц объявлены и покрыты тестами на соответствие контракту. Миграции применяются в следующем чанке.

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
Expected: PASS, 23 теста.

- [ ] **Step 11: Коммит**

```bash
git add apps/api/src/db/schema
git commit -m "Добавить таблицы сессий, ссылок, челленджей и журнала"
```

---

**Результат чанка 2:** восемь таблиц объявлены, перечисления сверены с контрактом, тесты зелёные. Следующий чанк применяет миграции и добавляет шифрование.

---

## Chunk 3: Миграции, права и шифрование

Результат чанка: таблицы созданы в базе, неизменяемость журнала обеспечена правами роли и покрыта интеграционным тестом, шифрование работает.

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
  "version": "<скопируй из записи 0000>",
  "when": <значение when из записи 0000, увеличенное на 1>,
  "tag": "0001_grant_app_privileges",
  "breakpoints": true
}
```

Оба подставляемых значения бери из уже существующей записи `0000`, а не придумывай. Причина для `when`: мигратор сравнивает эту метку с временем последней применённой миграции и **молча пропускает** всё, что оказалось раньше. На чистой базе ошибка не проявится, а на базе, где `0000` уже применена, `db:migrate` отработает без вывода, и роль приложения останется без прав — то есть журнал не будет защищён, хотя всё выглядит успешным.

- [ ] **Step 5: Применить миграции**

```bash
docker compose up -d --wait postgres
pnpm --filter @cairn/api db:migrate
```

Expected: команда завершается без вывода ошибок.

- [ ] **Step 6: Проверить состав таблиц**

Run: `docker compose exec postgres psql -U cairn_owner -d cairn -c "\dt"`
Expected: восемь таблиц — `subjects`, `users`, `projects`, `grants`, `sessions`, `invitations`, `totp_challenges`, `audit_log`.

- [ ] **Step 6a: Проверить, что миграция прав применилась**

Run: `docker compose exec postgres psql -U cairn_owner -d cairn -c "\dp audit_log"`
Expected: в колонке привилегий у `cairn_app` стоят только `arwdDxt`-подобные буквы `ar` — то есть `INSERT` и `SELECT`. Если строки с `cairn_app` нет вовсе, миграция `0001` не применилась: проверь запись в `_journal.json`, особенно поле `when`.

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
 * Поднимает PostgreSQL в контейнере, заводит роль приложения и применяет миграции.
 *
 * Порядок обязателен: миграция `0001` выдаёт права роли `cairn_app`, и если
 * роли ещё нет, PostgreSQL ответит «role does not exist», а `migrate` бросит
 * исключение.
 *
 * Привилегии здесь **не выдаются**. Их выдаёт та самая миграция из репозитория,
 * которую проверяет тест: продублируй гранты в фикстуре — и тест останется
 * зелёным, даже если миграцию сломают, забудут зарегистрировать в `_journal.json`
 * или она окажется пропущенной.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:17-alpine',
  ).start();

  const ownerClient = postgres(container.getConnectionUri(), { max: 1 });
  const db = drizzle(ownerClient, { schema });

  // Роль создаётся до миграций: миграция прав на неё ссылается.
  await db.execute(sql`CREATE ROLE cairn_app WITH LOGIN PASSWORD 'test_app_password'`);
  await db.execute(sql`GRANT USAGE ON SCHEMA public TO cairn_app`);

  await migrate(db, { migrationsFolder: './drizzle' });

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
    // Заодно проверяет, что миграция прав вообще применилась: без неё роль
    // не имела бы доступа к таблице и запрос упал бы.
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

Expected: оба без ошибок. Тест сборки `AppModule` проходит благодаря ключу из `vitest.config.ts`. Полный прогон теперь включает интеграционный набор на Testcontainers — нужен работающий Docker, и первый запуск занимает заметно больше времени из-за скачивания образа.

- [ ] **Step 8: Коммит**

```bash
git add apps/api/src/crypto apps/api/src/app.module.ts
git commit -m "Добавить сервис прикладного шифрования"
```

---

**Результат чанка 3:** таблицы созданы в базе, неизменяемость журнала обеспечена правами роли и проверяется тестом, шифрование работает. Следующий чанк добавляет модель прав.
## Chunk 4: Модель доступа

Результат чанка: модель доступа работает и покрыта тестами на уровне сервисов, журнал пишется в одной транзакции с действием, репозитории физически не отдают данные без субъекта.

### Task 11: Подключение приложения к базе

Тестовая фикстура и Testcontainers уже настроены в чанке 3 (Task 9). Здесь появляется подключение, которым пользуется само приложение, — отдельной ролью, без прав на изменение журнала.

**Files:**
- Create: `apps/api/src/db/db.types.ts`, `apps/api/src/db/db.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/db/db.module.test.ts`

- [ ] **Step 1: Создать `apps/api/src/db/db.types.ts`**

```typescript
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type * as schema from './schema';

/** Подключение к базе. */
export type Database = PostgresJsDatabase<typeof schema>;

/**
 * Транзакция.
 *
 * Сервисы принимают её явным параметром: журналирование обязано происходить
 * в той же транзакции, что и действие (спека 7.3), а неявный контекст
 * транзакции легко потерять при рефакторинге.
 */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Исполнитель запроса: подключение либо транзакция.
 *
 * Методы записи в репозиториях принимают этот тип, чтобы вызывающий сервис
 * мог передать транзакцию, а тесты — обычное подключение.
 */
export type Executor = Database | Transaction;
```

- [ ] **Step 2: Написать падающий тест `apps/api/src/db/db.module.test.ts`**

Тест проверяет ровно одно: приложение не стартует без строки подключения. Молчаливый старт с неработающей базой превратил бы отказ конфигурации в набор непонятных ошибок при первом запросе.

```typescript
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { DbModule } from './db.module';

describe('DbModule', () => {
  const original = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = original;
  });

  it('отказывается собираться без строки подключения', async () => {
    delete process.env.DATABASE_URL;

    await expect(
      Test.createTestingModule({ imports: [DbModule] }).compile(),
    ).rejects.toThrow(/DATABASE_URL/);
  });
});
```

- [ ] **Step 3: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/db/db.module`
Expected: FAIL — «Failed to resolve import "./db.module"».

- [ ] **Step 4: Создать `apps/api/src/db/db.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import type { Database } from './db.types';
import * as schema from './schema';

/** Токен внедрения подключения к базе. */
export const DATABASE = Symbol('DATABASE');

/**
 * Подключение к базе ролью приложения — без прав на изменение схемы
 * и журнала (спека 4.7). Миграции выполняются другой ролью.
 */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      useFactory: (): Database => {
        const url = process.env.DATABASE_URL;

        if (!url) {
          throw new Error('DATABASE_URL не задан. Проверь .env в корне монорепо.');
        }

        return drizzle(postgres(url), { schema });
      },
    },
  ],
  exports: [DATABASE],
})
export class DbModule {}
```

- [ ] **Step 5: Запустить тест**

Run: `pnpm --filter @cairn/api test src/db/db.module`
Expected: PASS, 1 тест.

- [ ] **Step 6: Коммит**

```bash
git add apps/api/src/db
git commit -m "Добавить подключение приложения к базе"
```

---


### Task 12: Разрешение уровня доступа

Ядро модели прав. Задача разбита на две: сначала чистое разрешение уровня, затем требование уровня с исключениями. Причина — разные зоны ответственности: первая отвечает на вопрос «какой уровень», вторая переводит ответ в поведение HTTP.

**Files:**
- Create: `apps/api/src/access/access.types.ts`, `apps/api/src/access/access.service.ts`
- Test: `apps/api/src/access/access.service.test.ts`

- [ ] **Step 1: Создать `apps/api/src/access/access.types.ts`**

```typescript
import type { AuditSubjectKind, SubjectKind } from '@cairn/shared';

/**
 * Действующий субъект запроса.
 *
 * Все методы доступа к данным принимают его первым аргументом, поэтому
 * проверку прав невозможно забыть — её не нужно вызывать отдельно (спека 5.4).
 */
export interface RequestSubject {
  /** Идентификатор в таблице субъектов. */
  id: string;
  kind: SubjectKind;
  label: string;
  /** Суперадмин обходит таблицу выдач (ТЗ 4.1). */
  isSuperadmin: boolean;
  /** Отозванный субъект не получает доступа ни к чему. */
  isRevoked: boolean;
}

/** Действующее лицо для записи в журнал: субъект либо консоль сервера. */
export type AuditActor =
  | { kind: Exclude<AuditSubjectKind, AuditSubjectKind.System>; id: string; label: string }
  | { kind: AuditSubjectKind.System; id: null; label: string };
```

- [ ] **Step 2: Написать падающий тест `apps/api/src/access/access.service.test.ts`**

```typescript
import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from './access.service';
import type { RequestSubject } from './access.types';
import { grants, projects, subjects, users } from '../db/schema/index';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('AccessService.resolveLevel', () => {
  let testDb: TestDatabase;
  let service: AccessService;
  let projectId: string;
  let subjectId: string;
  let grantedBy: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    service = new AccessService(testDb.db);
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'подрядчик' })
      .returning();
    subjectId = subject!.id;

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'админ' })
      .returning();
    const [admin] = await testDb.db
      .insert(users)
      .values({ subjectId: adminSubject!.id, email: 'admin@cairn.local', isSuperadmin: true })
      .returning();
    grantedBy = admin!.id;

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;
  });

  function asSubject(overrides: Partial<RequestSubject> = {}): RequestSubject {
    return {
      id: subjectId,
      kind: SubjectKind.User,
      label: 'подрядчик',
      isSuperadmin: false,
      isRevoked: false,
      ...overrides,
    };
  }

  it('без выдачи возвращает отсутствие доступа', async () => {
    expect(await service.resolveLevel(asSubject(), projectId, Section.Info)).toBeNull();
  });

  it('возвращает выданный уровень', async () => {
    await testDb.db.insert(grants).values({
      subjectId,
      projectId,
      section: Section.Info,
      level: AccessLevel.Read,
      grantedBy,
    });

    expect(await service.resolveLevel(asSubject(), projectId, Section.Info)).toBe(AccessLevel.Read);
  });

  it('не переносит доступ между секциями', async () => {
    await testDb.db.insert(grants).values({
      subjectId,
      projectId,
      section: Section.Docs,
      level: AccessLevel.Write,
      grantedBy,
    });

    expect(await service.resolveLevel(asSubject(), projectId, Section.Info)).toBeNull();
  });

  it('суперадмину даёт запись без выдачи', async () => {
    const level = await service.resolveLevel(
      asSubject({ isSuperadmin: true }),
      projectId,
      Section.Info,
    );

    expect(level).toBe(AccessLevel.Write);
  });

  it('отозванному субъекту отказывает даже при живой выдаче', async () => {
    await testDb.db.insert(grants).values({
      subjectId,
      projectId,
      section: Section.Info,
      level: AccessLevel.Write,
      grantedBy,
    });

    expect(await service.resolveLevel(asSubject({ isRevoked: true }), projectId, Section.Info)).toBeNull();
  });

  it('отозванному суперадмину отказывает', async () => {
    // Отзыв сильнее суперадминства: иначе отозвать администратора было бы нечем.
    const level = await service.resolveLevel(
      asSubject({ isSuperadmin: true, isRevoked: true }),
      projectId,
      Section.Info,
    );

    expect(level).toBeNull();
  });
});
```

- [ ] **Step 3: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/access`
Expected: FAIL — модуль `./access.service.js` не найден.

- [ ] **Step 4: Создать `apps/api/src/access/access.service.ts`**

```typescript
import { AccessLevel, type Section } from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { grants } from '../db/schema/index';
import type { RequestSubject } from './access.types';

/**
 * Единая проверка прав (ТЗ 4.1).
 *
 * Отвечает только за доступ к содержимому проектов. Право управлять самой
 * системой доступа — принадлежность суперадмина и проверяется отдельным
 * guard'ом, а не здесь (спека 8).
 */
@Injectable()
export class AccessService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Возвращает уровень доступа субъекта к секции проекта либо `null`,
   * если доступа нет вовсе.
   */
  async resolveLevel(
    subject: RequestSubject,
    projectId: string,
    section: Section,
  ): Promise<AccessLevel | null> {
    // Отзыв сильнее суперадминства, иначе отозвать администратора было бы нечем.
    if (subject.isRevoked) {
      return null;
    }

    if (subject.isSuperadmin) {
      return AccessLevel.Write;
    }

    const [grant] = await this.db
      .select({ level: grants.level })
      .from(grants)
      .where(
        and(
          eq(grants.subjectId, subject.id),
          eq(grants.projectId, projectId),
          eq(grants.section, section),
        ),
      )
      .limit(1);

    return grant?.level ?? null;
  }

  /**
   * Возвращает идентификаторы проектов, доступных субъекту хотя бы на уровне
   * метаданных хотя бы в одной секции.
   *
   * Возвращается массив, а не подзапрос: сервис прав не должен протекать
   * деталями хранения в вызывающий код (спека 5.2).
   */
  async visibleProjectIds(subject: RequestSubject): Promise<string[]> {
    if (subject.isRevoked) {
      return [];
    }

    if (subject.isSuperadmin) {
      const rows = await this.db.select({ id: projectsTable.id }).from(projectsTable);

      return rows.map((row) => row.id);
    }

    const rows = await this.db
      .selectDistinct({ projectId: grants.projectId })
      .from(grants)
      .where(eq(grants.subjectId, subject.id));

    return rows.map((row) => row.projectId);
  }
}
```

Импорт таблицы проектов добавить к существующему: `import { grants, projects as projectsTable } from '../db/schema/index';`

- [ ] **Step 5: Запустить тест**

Run: `pnpm --filter @cairn/api test src/access`
Expected: PASS, 6 тестов.

- [ ] **Step 6: Коммит**

```bash
git add apps/api/src/access
git commit -m "Добавить разрешение уровня доступа"
```

---

### Task 13: Список видимых проектов

**Files:**
- Modify: `apps/api/src/access/access.service.ts` (метод уже написан в Task 12)
- Test: `apps/api/src/access/visible-projects.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/access/visible-projects.test.ts`**

```typescript
import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from './access.service';
import type { RequestSubject } from './access.types';
import { grants, projects, subjects, users } from '../db/schema/index';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('AccessService.visibleProjectIds', () => {
  let testDb: TestDatabase;
  let service: AccessService;
  let subjectId: string;
  let grantedBy: string;
  let visibleId: string;
  let hiddenId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    service = new AccessService(testDb.db);
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'подрядчик' })
      .returning();
    subjectId = subject!.id;

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'админ' })
      .returning();
    const [admin] = await testDb.db
      .insert(users)
      .values({ subjectId: adminSubject!.id, email: 'admin@cairn.local', isSuperadmin: true })
      .returning();
    grantedBy = admin!.id;

    const [visible] = await testDb.db
      .insert(projects)
      .values({ slug: 'vidimyj', name: 'Видимый' })
      .returning();
    visibleId = visible!.id;

    const [hidden] = await testDb.db
      .insert(projects)
      .values({ slug: 'skrytyj', name: 'Скрытый' })
      .returning();
    hiddenId = hidden!.id;

    await testDb.db.insert(grants).values({
      subjectId,
      projectId: visibleId,
      section: Section.Info,
      level: AccessLevel.Metadata,
      grantedBy,
    });
  });

  const subject = (overrides: Partial<RequestSubject> = {}): RequestSubject => ({
    id: subjectId,
    kind: SubjectKind.User,
    label: 'подрядчик',
    isSuperadmin: false,
    isRevoked: false,
    ...overrides,
  });

  it('возвращает только проекты с выдачей', async () => {
    const ids = await service.visibleProjectIds(subject());

    expect(ids).toEqual([visibleId]);
  });

  it('не раскрывает существование проектов без выдачи', async () => {
    const ids = await service.visibleProjectIds(subject());

    expect(ids).not.toContain(hiddenId);
  });

  it('суперадмину возвращает все проекты', async () => {
    const ids = await service.visibleProjectIds(subject({ isSuperadmin: true }));

    expect(ids).toHaveLength(2);
  });

  it('отозванному субъекту возвращает пустой список', async () => {
    expect(await service.visibleProjectIds(subject({ isRevoked: true }))).toEqual([]);
  });

  it('не дублирует проект при выдачах на несколько секций', async () => {
    await testDb.db.insert(grants).values({
      subjectId,
      projectId: visibleId,
      section: Section.Docs,
      level: AccessLevel.Read,
      grantedBy,
    });

    expect(await service.visibleProjectIds(subject())).toEqual([visibleId]);
  });
});
```

- [ ] **Step 2: Запустить тест**

Run: `pnpm --filter @cairn/api test src/access/visible-projects`
Expected: PASS, 5 тестов. Метод реализован в предыдущей задаче — если тест падает, ошибка в реализации, а не в отсутствии кода.

- [ ] **Step 3: Коммит**

```bash
git add apps/api/src/access
git commit -m "Покрыть тестами список видимых проектов"
```

---

### Task 14: Требование уровня и коды ответов

**Files:**
- Create: `apps/api/src/access/access.guard-errors.ts`
- Modify: `apps/api/src/access/access.service.ts`
- Test: `apps/api/src/access/require-level.test.ts`

- [ ] **Step 1: Создать `apps/api/src/access/access.guard-errors.ts`**

```typescript
import { ForbiddenException, NotFoundException } from '@nestjs/common';

/**
 * Доступа к секции нет вовсе.
 *
 * Отвечаем `404`, а не `403`: ответ `403` сообщил бы, что объект существует,
 * а ТЗ 4.2 требует не раскрывать даже сам факт его существования.
 */
export class SectionNotVisibleError extends NotFoundException {
  constructor() {
    super('Не найдено');
  }
}

/**
 * Доступ есть, но его уровень ниже требуемого для операции.
 *
 * Здесь уместен `403`: отрицать существование объекта, который субъект
 * только что видел, бессмысленно (спека 5.3).
 */
export class InsufficientLevelError extends ForbiddenException {
  constructor() {
    super('Недостаточно прав для этого действия');
  }
}
```

- [ ] **Step 2: Написать падающий тест `apps/api/src/access/require-level.test.ts`**

```typescript
import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from './access.service';
import { InsufficientLevelError, SectionNotVisibleError } from './access.guard-errors';
import type { RequestSubject } from './access.types';
import { grants, projects, subjects, users } from '../db/schema/index';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('AccessService.requireLevel', () => {
  let testDb: TestDatabase;
  let service: AccessService;
  let subjectId: string;
  let projectId: string;
  let grantedBy: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    service = new AccessService(testDb.db);
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'подрядчик' })
      .returning();
    subjectId = subject!.id;

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'админ' })
      .returning();
    const [admin] = await testDb.db
      .insert(users)
      .values({ subjectId: adminSubject!.id, email: 'admin@cairn.local', isSuperadmin: true })
      .returning();
    grantedBy = admin!.id;

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;
  });

  const subject: RequestSubject = {
    get id() {
      return subjectId;
    },
    kind: SubjectKind.User,
    label: 'подрядчик',
    isSuperadmin: false,
    isRevoked: false,
  };

  async function grant(level: AccessLevel): Promise<void> {
    await testDb.db
      .insert(grants)
      .values({ subjectId, projectId, section: Section.Info, level, grantedBy });
  }

  it('без доступа бросает «не найдено»', async () => {
    await expect(
      service.requireLevel(subject, projectId, Section.Info, AccessLevel.Read),
    ).rejects.toBeInstanceOf(SectionNotVisibleError);
  });

  it('при недостаточном уровне бросает «недостаточно прав»', async () => {
    await grant(AccessLevel.Read);

    await expect(
      service.requireLevel(subject, projectId, Section.Info, AccessLevel.Write),
    ).rejects.toBeInstanceOf(InsufficientLevelError);
  });

  it('при достаточном уровне возвращает уровень', async () => {
    await grant(AccessLevel.Write);

    expect(await service.requireLevel(subject, projectId, Section.Info, AccessLevel.Read)).toBe(
      AccessLevel.Write,
    );
  });

  it('уровень метаданных недостаточен для чтения', async () => {
    await grant(AccessLevel.Metadata);

    await expect(
      service.requireLevel(subject, projectId, Section.Info, AccessLevel.Read),
    ).rejects.toBeInstanceOf(InsufficientLevelError);
  });

  it('уровень метаданных достаточен для метаданных', async () => {
    await grant(AccessLevel.Metadata);

    expect(
      await service.requireLevel(subject, projectId, Section.Info, AccessLevel.Metadata),
    ).toBe(AccessLevel.Metadata);
  });

  it('для несуществующего проекта бросает «не найдено»', async () => {
    // Тот же ответ, что и при отсутствии доступа: различать их — значит
    // раскрывать, какие проекты существуют.
    await expect(
      service.requireLevel(
        subject,
        '00000000-0000-0000-0000-000000000000',
        Section.Info,
        AccessLevel.Read,
      ),
    ).rejects.toBeInstanceOf(SectionNotVisibleError);
  });
});
```

- [ ] **Step 3: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/access/require-level`
Expected: FAIL — `service.requireLevel is not a function`.

- [ ] **Step 4: Добавить метод в `apps/api/src/access/access.service.ts`**

Порядок уровней задан константой: сравнивать строки перечисления напрямую нельзя, а числовая шкала делает сравнение однозначным.

```typescript
  /**
   * Требует уровень не ниже указанного.
   *
   * Бросает {@link SectionNotVisibleError} при отсутствии доступа и
   * {@link InsufficientLevelError} при недостаточном уровне (спека 5.3).
   */
  async requireLevel(
    subject: RequestSubject,
    projectId: string,
    section: Section,
    minimum: AccessLevel,
  ): Promise<AccessLevel> {
    const level = await this.resolveLevel(subject, projectId, section);

    if (level === null) {
      throw new SectionNotVisibleError();
    }

    if (LEVEL_ORDER[level] < LEVEL_ORDER[minimum]) {
      throw new InsufficientLevelError();
    }

    return level;
  }
```

Ниже класса добавить константу:

```typescript
/** Порядок уровней для сравнения. Строки перечисления сравнивать нельзя. */
const LEVEL_ORDER: Record<AccessLevel, number> = {
  [AccessLevel.Metadata]: 1,
  [AccessLevel.Read]: 2,
  [AccessLevel.Write]: 3,
};
```

Импорты дополнить: `import { InsufficientLevelError, SectionNotVisibleError } from './access.guard-errors';`

- [ ] **Step 5: Запустить тест**

Run: `pnpm --filter @cairn/api test src/access`
Expected: PASS, 17 тестов.

- [ ] **Step 6: Коммит**

```bash
git add apps/api/src/access
git commit -m "Добавить требование уровня доступа с кодами ответов"
```

---

### Task 15: Guard суперадмина

**Files:**
- Create: `apps/api/src/access/superadmin.guard.ts`, `apps/api/src/access/access.module.ts`
- Test: `apps/api/src/access/superadmin.guard.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/access/superadmin.guard.test.ts`**

```typescript
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { SubjectKind } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { SuperadminGuard } from './superadmin.guard';
import type { RequestSubject } from './access.types';

function contextWith(subject: RequestSubject | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ subject }) }),
  } as unknown as ExecutionContext;
}

const base: RequestSubject = {
  id: '11111111-1111-1111-1111-111111111111',
  kind: SubjectKind.User,
  label: 'кто-то',
  isSuperadmin: false,
  isRevoked: false,
};

describe('SuperadminGuard', () => {
  const guard = new SuperadminGuard();

  it('пропускает суперадмина', () => {
    expect(guard.canActivate(contextWith({ ...base, isSuperadmin: true }))).toBe(true);
  });

  it('отклоняет обычного пользователя', () => {
    // Именно 403, а не 404: существование администрирования не секрет (спека 8).
    expect(() => guard.canActivate(contextWith(base))).toThrow(ForbiddenException);
  });

  it('отклоняет отозванного суперадмина', () => {
    expect(() => guard.canActivate(contextWith({ ...base, isSuperadmin: true, isRevoked: true }))).toThrow(
      ForbiddenException,
    );
  });

  it('отклоняет запрос без субъекта', () => {
    expect(() => guard.canActivate(contextWith(undefined))).toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/access/superadmin`
Expected: FAIL — модуль `./superadmin.guard.js` не найден.

- [ ] **Step 3: Создать `apps/api/src/access/superadmin.guard.ts`**

```typescript
import { CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

import type { RequestSubject } from './access.types';

/**
 * Пропускает только суперадмина.
 *
 * Управление системой доступа, пользователями и журналом лежит вне сервиса
 * прав: оно не зависит ни от проекта, ни от секции (спека 8).
 *
 * Отказ — `403`, а не `404`: правило нераскрытия защищает сведения о том,
 * какие проекты существуют, а существование раздела администрирования
 * секретом не является.
 */
@Injectable()
export class SuperadminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ subject?: RequestSubject }>();
    const subject = request.subject;

    if (!subject || subject.isRevoked || !subject.isSuperadmin) {
      throw new ForbiddenException('Требуются права суперадминистратора');
    }

    return true;
  }
}
```

- [ ] **Step 4: Создать `apps/api/src/access/access.module.ts`**

```typescript
import { Module } from '@nestjs/common';

import { AccessService } from './access.service';
import { SuperadminGuard } from './superadmin.guard';

/** Модуль модели доступа. */
@Module({
  providers: [AccessService, SuperadminGuard],
  exports: [AccessService, SuperadminGuard],
})
export class AccessModule {}
```

- [ ] **Step 5: Запустить тест**

Run: `pnpm --filter @cairn/api test src/access`
Expected: PASS, 21 тест.

- [ ] **Step 6: Коммит**

```bash
git add apps/api/src/access
git commit -m "Добавить guard суперадмина"
```

---

### Task 16: Журнал действий

**Files:**
- Create: `apps/api/src/audit/audit.types.ts`, `apps/api/src/audit/audit.service.ts`, `apps/api/src/audit/audit.module.ts`
- Test: `apps/api/src/audit/audit.service.test.ts`

- [ ] **Step 1: Создать `apps/api/src/audit/audit.types.ts`**

Действия перечислены явно: свободная строка расползётся синонимами, и фильтр журнала перестанет работать.

```typescript
/** Типы действий, фиксируемых в журнале на этапе 1 (спека 7.2). */
export enum AuditAction {
  LoginSucceeded = 'login.succeeded',
  LoginFailed = 'login.failed',
  LogoutPerformed = 'logout.performed',
  TotpFailed = 'totp.failed',
  TotpChallengeExhausted = 'totp.challenge_exhausted',
  TotpEnabled = 'totp.enabled',
  TotpReset = 'totp.reset',
  ProjectCreated = 'project.created',
  ProjectUpdated = 'project.updated',
  GrantCreated = 'grant.created',
  GrantUpdated = 'grant.updated',
  GrantRevoked = 'grant.revoked',
  InvitationCreated = 'invitation.created',
  InvitationAccepted = 'invitation.accepted',
  PasswordResetRequested = 'password_reset.requested',
  PasswordResetCompleted = 'password_reset.completed',
  SubjectRevoked = 'subject.revoked',
  SubjectRestored = 'subject.restored',
  SuperadminCreated = 'superadmin.created',
}

/** Данные для записи в журнал. */
export interface AuditEntryInput {
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  projectId?: string;
  metadata?: Record<string, unknown>;
}
```

- [ ] **Step 2: Написать падающий тест `apps/api/src/audit/audit.service.test.ts`**

```typescript
import { AuditSubjectKind, SubjectKind } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditAction } from './audit.types';
import { AuditService } from './audit.service';
import type { AuditActor } from '../access/access.types';
import { auditLog, projects, subjects } from '../db/schema/index';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('AuditService', () => {
  let testDb: TestDatabase;
  let service: AuditService;
  let actor: AuditActor;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    service = new AuditService();
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'админ' })
      .returning();

    actor = { kind: AuditSubjectKind.User, id: subject!.id, label: 'админ' };
  });

  it('записывает действие субъекта', async () => {
    await testDb.db.transaction(async (tx) => {
      await service.record(tx, actor, { action: AuditAction.ProjectCreated });
    });

    const [entry] = await testDb.db.select().from(auditLog);

    expect(entry?.action).toBe(AuditAction.ProjectCreated);
    expect(entry?.subjectKind).toBe(AuditSubjectKind.User);
    expect(entry?.subjectLabel).toBe('админ');
  });

  it('записывает действие с консоли без субъекта', async () => {
    await testDb.db.transaction(async (tx) => {
      await service.record(
        tx,
        { kind: AuditSubjectKind.System, id: null, label: 'cli create-superadmin' },
        { action: AuditAction.SuperadminCreated },
      );
    });

    const [entry] = await testDb.db.select().from(auditLog);

    expect(entry?.subjectId).toBeNull();
    expect(entry?.subjectKind).toBe(AuditSubjectKind.System);
  });

  it('откатывается вместе с действием', async () => {
    // Либо есть и изменение, и его след, либо нет ни того ни другого (спека 7.3).
    await expect(
      testDb.db.transaction(async (tx) => {
        await tx.insert(projects).values({ slug: 'proekt', name: 'Проект' });
        await service.record(tx, actor, { action: AuditAction.ProjectCreated });

        throw new Error('сбой после записи');
      }),
    ).rejects.toThrow('сбой после записи');

    expect(await testDb.db.select().from(auditLog)).toHaveLength(0);
    expect(await testDb.db.select().from(projects)).toHaveLength(0);
  });

  it('сохраняет метку субъекта неизменной после её смены', async () => {
    await testDb.db.transaction(async (tx) => {
      await service.record(tx, actor, { action: AuditAction.ProjectCreated });
    });

    await testDb.db.update(subjects).set({ label: 'другая метка' });

    const [entry] = await testDb.db.select().from(auditLog);

    expect(entry?.subjectLabel).toBe('админ');
  });
});
```

- [ ] **Step 3: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/audit`
Expected: FAIL — модуль `./audit.service.js` не найден.

- [ ] **Step 4: Создать `apps/api/src/audit/audit.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';

import type { AuditActor } from '../access/access.types';
import type { Transaction } from '../db/db.types';
import { auditLog } from '../db/schema/index';
import type { AuditEntryInput } from './audit.types';

/**
 * Журнал действий (ТЗ 4.4).
 *
 * Транзакция передаётся параметром намеренно: запись обязана происходить
 * в той же транзакции, что и само действие, иначе журнал может потерять
 * след успешного изменения (спека 7.3).
 *
 * Вызывается из сервисов, а не из контроллеров: те же сервисы будут
 * вызываться из MCP-сервера и обработчика webhook на будущих этапах.
 */
@Injectable()
export class AuditService {
  /** Добавляет запись в журнал. Изменение и удаление записей не предусмотрены. */
  async record(tx: Transaction, actor: AuditActor, entry: AuditEntryInput): Promise<void> {
    await tx.insert(auditLog).values({
      subjectId: actor.id,
      subjectKind: actor.kind,
      subjectLabel: actor.label,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      projectId: entry.projectId ?? null,
      metadata: entry.metadata ?? null,
    });
  }
}
```

- [ ] **Step 5: Создать `apps/api/src/audit/audit.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';

import { AuditService } from './audit.service';

/** Модуль журналирования. Глобальный: журнал пишут почти все модули. */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
```

- [ ] **Step 6: Запустить тест**

Run: `pnpm --filter @cairn/api test src/audit`
Expected: PASS, 4 теста.

- [ ] **Step 7: Коммит**

```bash
git add apps/api/src/audit
git commit -m "Добавить журнал действий"
```

---
**Результат чанка 4:** проверка прав работает и покрыта тестами, guard суперадмина отделён от сервиса прав, журнал пишется в одной транзакции с действием. Следующий чанк добавляет проекции и репозитории.

---

## Chunk 5: Проекции и репозитории

Результат чанка: репозитории физически не отдают данные без субъекта, уровень «метаданные» реально скрывает поля, выдачи адресуются парой «субъект × секция».

### Task 17: Проекции секции «Инфо»

Уровень «метаданные» — это фильтрация полей, а не строк (спека 5.5). Проекции вынесены в отдельный файл: на будущих этапах у каждой секции появится своя, и держать их вместе с репозиториями значило бы размазать одну ответственность по шести файлам.

**Files:**
- Create: `apps/api/src/projects/project.projection.ts`
- Create: `packages/shared/src/schemas/project.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `apps/api/src/projects/project.projection.test.ts`

- [ ] **Step 1: Создать `packages/shared/src/schemas/project.ts`**

```typescript
import { z } from 'zod';

import { ProjectLifecycle } from '../enums';

/** Проект на уровне метаданных: видно, что он есть, и его состояние (ТЗ 4.3). */
export const projectMetadataSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  lifecycle: z.nativeEnum(ProjectLifecycle),
});

/** Проект на уровне чтения: все поля паспорта. */
export const projectDetailSchema = projectMetadataSchema.extend({
  purpose: z.string().nullable(),
  stack: z.string().nullable(),
  repoUrl: z.string().nullable(),
  ownerUserId: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Поля, доступные для правки при уровне записи. */
export const projectUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  purpose: z.string().max(2000).nullable().optional(),
  stack: z.string().max(500).nullable().optional(),
  repoUrl: z.string().url().max(500).nullable().optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
  lifecycle: z.nativeEnum(ProjectLifecycle).optional(),
  notes: z.string().max(10_000).nullable().optional(),
});

/** Поля для создания проекта. Слаг генерируется сервером и здесь не принимается. */
export const projectCreateSchema = projectUpdateSchema.extend({
  name: z.string().min(1).max(200),
});

/** Проект на уровне метаданных. */
export type ProjectMetadata = z.infer<typeof projectMetadataSchema>;

/** Проект на уровне чтения. */
export type ProjectDetail = z.infer<typeof projectDetailSchema>;

/** Данные для правки проекта. */
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;

/** Данные для создания проекта. */
export type ProjectCreate = z.infer<typeof projectCreateSchema>;
```

- [ ] **Step 2: Дополнить `packages/shared/src/index.ts`**

```typescript
export * from './enums';
export * from './schemas/project';
```

- [ ] **Step 3: Написать падающий тест `apps/api/src/projects/project.projection.test.ts`**

```typescript
import { AccessLevel, ProjectLifecycle } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { projectProjection } from './project.projection';
import type { Project } from '../db/schema/index';

const project: Project = {
  id: '11111111-1111-1111-1111-111111111111',
  slug: 'proekt',
  name: 'Проект',
  purpose: 'Назначение',
  stack: 'Next.js',
  repoUrl: 'https://example.com/repo',
  ownerUserId: null,
  lifecycle: ProjectLifecycle.Active,
  notes: 'Заметки',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
};

describe('projectProjection', () => {
  describe('уровень метаданных', () => {
    const result = projectProjection(project, AccessLevel.Metadata);

    it('отдаёт название и состояние', () => {
      expect(result).toMatchObject({ name: 'Проект', lifecycle: ProjectLifecycle.Active });
    });

    it('скрывает назначение, стек и заметки', () => {
      expect(result).not.toHaveProperty('purpose');
      expect(result).not.toHaveProperty('stack');
      expect(result).not.toHaveProperty('notes');
    });

    it('скрывает ссылку на репозиторий', () => {
      expect(result).not.toHaveProperty('repoUrl');
    });
  });

  describe('уровень чтения', () => {
    const result = projectProjection(project, AccessLevel.Read);

    it('отдаёт все поля паспорта', () => {
      expect(result).toMatchObject({
        purpose: 'Назначение',
        stack: 'Next.js',
        repoUrl: 'https://example.com/repo',
        notes: 'Заметки',
      });
    });

    it('отдаёт даты строками', () => {
      expect(typeof (result as { createdAt: unknown }).createdAt).toBe('string');
    });
  });

  describe('уровень записи', () => {
    it('отдаёт то же, что и чтение', () => {
      expect(projectProjection(project, AccessLevel.Write)).toEqual(
        projectProjection(project, AccessLevel.Read),
      );
    });
  });
});
```

- [ ] **Step 4: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/projects`
Expected: FAIL — модуль `./project.projection.js` не найден.

- [ ] **Step 5: Создать `apps/api/src/projects/project.projection.ts`**

```typescript
import { AccessLevel, type ProjectDetail, type ProjectMetadata } from '@cairn/shared';

import type { Project } from '../db/schema/index';

/**
 * Приводит проект к набору полей, разрешённому уровнем доступа (спека 5.5).
 *
 * Применяется в сервисном слое до сериализации, поэтому скрытые поля
 * не доходят до контроллера и не могут просочиться в ответ по недосмотру.
 */
export function projectProjection(
  project: Project,
  level: AccessLevel,
): ProjectMetadata | ProjectDetail {
  const metadata: ProjectMetadata = {
    id: project.id,
    slug: project.slug,
    name: project.name,
    lifecycle: project.lifecycle,
  };

  if (level === AccessLevel.Metadata) {
    return metadata;
  }

  return {
    ...metadata,
    purpose: project.purpose,
    stack: project.stack,
    repoUrl: project.repoUrl,
    ownerUserId: project.ownerUserId,
    notes: project.notes,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}
```

- [ ] **Step 6: Запустить тест**

Run: `pnpm --filter @cairn/api test src/projects`
Expected: PASS, 7 тестов.

- [ ] **Step 7: Коммит**

```bash
git add apps/api/src/projects packages/shared/src
git commit -m "Добавить проекции секции «Инфо»"
```

---

### Task 18: Репозиторий проектов

Проверка встроена в путь к данным: метода без субъекта в сигнатуре не существует, поэтому её нельзя забыть вызвать (спека 5.4).

**Files:**
- Create: `apps/api/src/projects/projects.repository.ts`, `apps/api/src/projects/slug.ts`
- Test: `apps/api/src/projects/projects.repository.test.ts`, `apps/api/src/projects/slug.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/projects/slug.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';

import { generateSlug } from './slug';

describe('generateSlug', () => {
  it('транслитерирует кириллицу', () => {
    expect(generateSlug('Мой Проект')).toBe('moj-proekt');
  });

  it('заменяет пробелы дефисами', () => {
    expect(generateSlug('система учёта')).toBe('sistema-ucheta');
  });

  it('убирает знаки препинания', () => {
    expect(generateSlug('Проект №1: главный!')).toBe('proekt-1-glavnyj');
  });

  it('схлопывает повторяющиеся дефисы', () => {
    expect(generateSlug('а  —  б')).toBe('a-b');
  });

  it('обрезает дефисы по краям', () => {
    expect(generateSlug('  проект  ')).toBe('proekt');
  });

  it('сохраняет латиницу и цифры', () => {
    expect(generateSlug('CAIRN v2')).toBe('cairn-v2');
  });

  it('даёт запасное значение для строки без пригодных символов', () => {
    // Пустой слаг сделал бы ссылку на проект неработающей.
    expect(generateSlug('!!!')).toBe('proekt');
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/projects/slug`
Expected: FAIL — модуль `./slug.js` не найден.

- [ ] **Step 3: Создать `apps/api/src/projects/slug.ts`**

```typescript
/**
 * Строит слаг проекта из названия.
 *
 * Слаг задаётся один раз при создании и потом не меняется, чтобы ссылки
 * не ломались (спека 4.4). Уникальность обеспечивает вызывающий код.
 */
export function generateSlug(name: string): string {
  const transliterated = name
    .toLowerCase()
    .split('')
    .map((char) => TRANSLITERATION[char] ?? char)
    .join('');

  const slug = transliterated
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || FALLBACK_SLUG;
}

/** Запасной слаг для названий без пригодных символов. */
const FALLBACK_SLUG = 'proekt';

/** Таблица транслитерации кириллицы. */
const TRANSLITERATION: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh',
  з: 'z', и: 'i', й: 'j', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c',
  ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
  я: 'ya',
};
```

- [ ] **Step 4: Запустить тест**

Run: `pnpm --filter @cairn/api test src/projects/slug`
Expected: PASS, 7 тестов.

- [ ] **Step 5: Написать падающий тест `apps/api/src/projects/projects.repository.test.ts`**

```typescript
import { AccessLevel, ProjectLifecycle, Section, SubjectKind } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import { SectionNotVisibleError } from '../access/access.guard-errors';
import type { RequestSubject } from '../access/access.types';
import { ProjectsRepository } from './projects.repository';
import { grants, projects, subjects, users } from '../db/schema/index';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('ProjectsRepository', () => {
  let testDb: TestDatabase;
  let repository: ProjectsRepository;
  let subjectId: string;
  let grantedBy: string;
  let projectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new ProjectsRepository(testDb.db, new AccessService(testDb.db));
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'подрядчик' })
      .returning();
    subjectId = subject!.id;

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'админ' })
      .returning();
    const [admin] = await testDb.db
      .insert(users)
      .values({ subjectId: adminSubject!.id, email: 'admin@cairn.local', isSuperadmin: true })
      .returning();
    grantedBy = admin!.id;

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект', purpose: 'Назначение' })
      .returning();
    projectId = project!.id;
  });

  const subject = (overrides: Partial<RequestSubject> = {}): RequestSubject => ({
    id: subjectId,
    kind: SubjectKind.User,
    label: 'подрядчик',
    isSuperadmin: false,
    isRevoked: false,
    ...overrides,
  });

  async function grant(level: AccessLevel): Promise<void> {
    await testDb.db
      .insert(grants)
      .values({ subjectId, projectId, section: Section.Info, level, grantedBy });
  }

  describe('findById', () => {
    it('без доступа бросает «не найдено»', async () => {
      await expect(repository.findById(subject(), projectId)).rejects.toBeInstanceOf(
        SectionNotVisibleError,
      );
    });

    it('на уровне метаданных не отдаёт назначение', async () => {
      await grant(AccessLevel.Metadata);

      expect(await repository.findById(subject(), projectId)).not.toHaveProperty('purpose');
    });

    it('на уровне чтения отдаёт назначение', async () => {
      await grant(AccessLevel.Read);

      expect(await repository.findById(subject(), projectId)).toMatchObject({
        purpose: 'Назначение',
      });
    });
  });

  describe('findVisible', () => {
    it('без выдач возвращает пустой список', async () => {
      expect(await repository.findVisible(subject())).toEqual([]);
    });

    it('возвращает проекты с выдачей в проекции метаданных', async () => {
      await grant(AccessLevel.Metadata);

      const visible = await repository.findVisible(subject());

      expect(visible).toHaveLength(1);
      expect(visible[0]).not.toHaveProperty('purpose');
    });

    it('суперадмину возвращает все проекты', async () => {
      expect(await repository.findVisible(subject({ isSuperadmin: true }))).toHaveLength(1);
    });
  });

  describe('create', () => {
    it('генерирует уникальный слаг при совпадении названий', async () => {
      const first = await repository.create(testDb.db, { name: 'Проект' });
      const second = await repository.create(testDb.db, { name: 'Проект' });

      expect(first.slug).not.toBe(second.slug);
    });

    it('ставит состояние «в разработке» по умолчанию', async () => {
      const created = await repository.create(testDb.db, { name: 'Новый' });

      expect(created.lifecycle).toBe(ProjectLifecycle.Development);
    });
  });
});
```

- [ ] **Step 6: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/projects/projects.repository`
Expected: FAIL — модуль `./projects.repository.js` не найден.

- [ ] **Step 7: Создать `apps/api/src/projects/projects.repository.ts`**

```typescript
import {
  AccessLevel,
  Section,
  type ProjectCreate,
  type ProjectDetail,
  type ProjectMetadata,
  type ProjectUpdate,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';

import { AccessService } from '../access/access.service';
import { SectionNotVisibleError } from '../access/access.guard-errors';
import type { RequestSubject } from '../access/access.types';
import { DATABASE } from '../db/db.module';
import type { Database, Transaction } from '../db/db.types';
import { projects, type Project } from '../db/schema/index';
import { projectProjection } from './project.projection';
import { generateSlug } from './slug';

/**
 * Доступ к проектам.
 *
 * Каждый метод чтения принимает субъект первым аргументом и проверяет права
 * внутри: отдельного вызова проверки, который можно забыть, не существует
 * (спека 5.4).
 *
 * Методы записи принимают транзакцию, потому что вызывающий сервис пишет
 * в журнал в той же транзакции (спека 7.3). Право создавать проект
 * проверяется guard'ом суперадмина, а не здесь: при создании нет
 * идентификатора проекта, по которому работает сервис прав (спека 4.4).
 */
@Injectable()
export class ProjectsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly access: AccessService,
  ) {}

  /** Возвращает проект в проекции, соответствующей уровню доступа субъекта. */
  async findById(
    subject: RequestSubject,
    projectId: string,
  ): Promise<ProjectMetadata | ProjectDetail> {
    const level = await this.access.requireLevel(
      subject,
      projectId,
      Section.Info,
      AccessLevel.Metadata,
    );

    const [project] = await this.db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

    if (!project) {
      throw new SectionNotVisibleError();
    }

    return projectProjection(project, level);
  }

  /** Возвращает список видимых субъекту проектов в проекции метаданных. */
  async findVisible(subject: RequestSubject): Promise<ProjectMetadata[]> {
    const ids = await this.access.visibleProjectIds(subject);

    if (ids.length === 0) {
      return [];
    }

    const rows = await this.db.select().from(projects).where(inArray(projects.id, ids));

    return rows.map((row) => projectProjection(row, AccessLevel.Metadata) as ProjectMetadata);
  }

  /** Создаёт проект, подбирая свободный слаг. */
  async create(tx: Transaction | Database, input: ProjectCreate): Promise<Project> {
    const slug = await this.findFreeSlug(tx, generateSlug(input.name));

    const [created] = await tx
      .insert(projects)
      .values({ ...input, slug })
      .returning();

    return created!;
  }

  /** Изменяет поля паспорта проекта. Слаг не меняется. */
  async update(tx: Transaction | Database, projectId: string, input: ProjectUpdate): Promise<Project> {
    const [updated] = await tx
      .update(projects)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning();

    if (!updated) {
      throw new SectionNotVisibleError();
    }

    return updated;
  }

  /** Подбирает свободный слаг, дополняя базовый числовым суффиксом. */
  private async findFreeSlug(tx: Transaction | Database, base: string): Promise<string> {
    for (let suffix = 0; suffix < MAX_SLUG_ATTEMPTS; suffix += 1) {
      const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
      const [existing] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.slug, candidate))
        .limit(1);

      if (!existing) {
        return candidate;
      }
    }

    throw new Error(`Не удалось подобрать свободный слаг для «${base}»`);
  }
}

/** Предел перебора суффиксов слага. */
const MAX_SLUG_ATTEMPTS = 100;
```

- [ ] **Step 8: Запустить тест**

Run: `pnpm --filter @cairn/api test src/projects`
Expected: PASS, 15 тестов.

- [ ] **Step 9: Коммит**

```bash
git add apps/api/src/projects
git commit -m "Добавить репозиторий проектов"
```

---

### Task 19: Репозиторий выдач доступа

**Files:**
- Create: `apps/api/src/grants/grants.repository.ts`
- Create: `packages/shared/src/schemas/grant.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `apps/api/src/grants/grants.repository.test.ts`

- [ ] **Step 1: Создать `packages/shared/src/schemas/grant.ts`**

```typescript
import { z } from 'zod';

import { AccessLevel, Section, SubjectKind } from '../enums';

/** Установка уровня доступа для пары «субъект × секция». */
export const grantSetSchema = z.object({
  subjectId: z.string().uuid(),
  section: z.nativeEnum(Section),
  level: z.nativeEnum(AccessLevel),
});

/** Отзыв выдачи. Адресуется парой, а не идентификатором строки (спека 8). */
export const grantRevokeSchema = z.object({
  subjectId: z.string().uuid(),
  section: z.nativeEnum(Section),
});

/** Строка матрицы доступов: субъект и его уровни по секциям. */
export const grantMatrixRowSchema = z.object({
  subjectId: z.string().uuid(),
  subjectKind: z.nativeEnum(SubjectKind),
  subjectLabel: z.string(),
  isRevoked: z.boolean(),
  levels: z.record(z.nativeEnum(Section), z.nativeEnum(AccessLevel)),
});

/** Установка уровня доступа. */
export type GrantSet = z.infer<typeof grantSetSchema>;

/** Отзыв выдачи. */
export type GrantRevoke = z.infer<typeof grantRevokeSchema>;

/** Строка матрицы доступов. */
export type GrantMatrixRow = z.infer<typeof grantMatrixRowSchema>;
```

- [ ] **Step 2: Дополнить `packages/shared/src/index.ts`**

```typescript
export * from './enums';
export * from './schemas/grant';
export * from './schemas/project';
```

- [ ] **Step 3: Написать падающий тест `apps/api/src/grants/grants.repository.test.ts`**

```typescript
import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { GrantsRepository } from './grants.repository';
import { grants, projects, subjects, users } from '../db/schema/index';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('GrantsRepository', () => {
  let testDb: TestDatabase;
  let repository: GrantsRepository;
  let subjectId: string;
  let grantedBy: string;
  let projectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new GrantsRepository(testDb.db);
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'подрядчик' })
      .returning();
    subjectId = subject!.id;

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'админ' })
      .returning();
    const [admin] = await testDb.db
      .insert(users)
      .values({ subjectId: adminSubject!.id, email: 'admin@cairn.local', isSuperadmin: true })
      .returning();
    grantedBy = admin!.id;

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;
  });

  describe('set', () => {
    it('создаёт выдачу', async () => {
      await testDb.db.transaction(async (tx) => {
        await repository.set(tx, projectId, grantedBy, {
          subjectId,
          section: Section.Info,
          level: AccessLevel.Read,
        });
      });

      const rows = await testDb.db.select().from(grants);

      expect(rows).toHaveLength(1);
      expect(rows[0]?.level).toBe(AccessLevel.Read);
    });

    it('меняет уровень вместо создания второй строки', async () => {
      // Уникальный индекс по тройке: две выдачи на одну пару разошлись бы в выборках.
      await testDb.db.transaction(async (tx) => {
        await repository.set(tx, projectId, grantedBy, {
          subjectId,
          section: Section.Info,
          level: AccessLevel.Read,
        });
        await repository.set(tx, projectId, grantedBy, {
          subjectId,
          section: Section.Info,
          level: AccessLevel.Write,
        });
      });

      const rows = await testDb.db.select().from(grants);

      expect(rows).toHaveLength(1);
      expect(rows[0]?.level).toBe(AccessLevel.Write);
    });
  });

  describe('revoke', () => {
    it('удаляет строку выдачи', async () => {
      // Отсутствие доступа выражается отсутствием строки (спека 4.3).
      await testDb.db.transaction(async (tx) => {
        await repository.set(tx, projectId, grantedBy, {
          subjectId,
          section: Section.Info,
          level: AccessLevel.Read,
        });
        await repository.revoke(tx, projectId, { subjectId, section: Section.Info });
      });

      expect(await testDb.db.select().from(grants)).toHaveLength(0);
    });

    it('сообщает, была ли выдача', async () => {
      const removed = await testDb.db.transaction((tx) =>
        repository.revoke(tx, projectId, { subjectId, section: Section.Info }),
      );

      expect(removed).toBe(false);
    });
  });

  describe('matrixForProject', () => {
    it('возвращает строку на каждый субъект с выдачей', async () => {
      await testDb.db.transaction(async (tx) => {
        await repository.set(tx, projectId, grantedBy, {
          subjectId,
          section: Section.Info,
          level: AccessLevel.Read,
        });
      });

      const matrix = await repository.matrixForProject(projectId);

      expect(matrix).toHaveLength(1);
      expect(matrix[0]?.levels[Section.Info]).toBe(AccessLevel.Read);
    });

    it('собирает несколько секций в одну строку', async () => {
      await testDb.db.transaction(async (tx) => {
        await repository.set(tx, projectId, grantedBy, {
          subjectId,
          section: Section.Info,
          level: AccessLevel.Read,
        });
        await repository.set(tx, projectId, grantedBy, {
          subjectId,
          section: Section.Docs,
          level: AccessLevel.Write,
        });
      });

      const matrix = await repository.matrixForProject(projectId);

      expect(matrix).toHaveLength(1);
      expect(matrix[0]?.levels).toEqual({
        [Section.Info]: AccessLevel.Read,
        [Section.Docs]: AccessLevel.Write,
      });
    });
  });
});
```

- [ ] **Step 4: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/grants`
Expected: FAIL — модуль `./grants.repository.js` не найден.

- [ ] **Step 5: Создать `apps/api/src/grants/grants.repository.ts`**

```typescript
import { type GrantMatrixRow, type GrantRevoke, type GrantSet, type Section } from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { DATABASE } from '../db/db.module';
import type { Database, Transaction } from '../db/db.types';
import { grants, subjects } from '../db/schema/index';

/**
 * Доступ к выдачам.
 *
 * Субъект-инициатор здесь не проверяется: управлять выдачами вправе только
 * суперадмин, и это проверяет guard на уровне контроллера (спека 4.3).
 * Дублировать проверку здесь значило бы завести второе место, где правило
 * может разойтись.
 */
@Injectable()
export class GrantsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Устанавливает уровень доступа для пары «субъект × секция». */
  async set(
    tx: Transaction | Database,
    projectId: string,
    grantedBy: string,
    input: GrantSet,
  ): Promise<void> {
    await tx
      .insert(grants)
      .values({
        subjectId: input.subjectId,
        projectId,
        section: input.section,
        level: input.level,
        grantedBy,
      })
      .onConflictDoUpdate({
        target: [grants.subjectId, grants.projectId, grants.section],
        set: { level: input.level, grantedBy, grantedAt: new Date() },
      });
  }

  /**
   * Отзывает выдачу удалением строки.
   *
   * Возвращает признак того, была ли выдача: вызывающий сервис пишет в журнал
   * только состоявшийся отзыв.
   */
  async revoke(tx: Transaction | Database, projectId: string, input: GrantRevoke): Promise<boolean> {
    const removed = await tx
      .delete(grants)
      .where(
        and(
          eq(grants.subjectId, input.subjectId),
          eq(grants.projectId, projectId),
          eq(grants.section, input.section),
        ),
      )
      .returning({ id: grants.id });

    return removed.length > 0;
  }

  /** Собирает матрицу «субъект × секция» для проекта. */
  async matrixForProject(projectId: string): Promise<GrantMatrixRow[]> {
    const rows = await this.db
      .select({
        subjectId: grants.subjectId,
        section: grants.section,
        level: grants.level,
        subjectKind: subjects.kind,
        subjectLabel: subjects.label,
        revokedAt: subjects.revokedAt,
      })
      .from(grants)
      .innerJoin(subjects, eq(subjects.id, grants.subjectId))
      .where(eq(grants.projectId, projectId));

    const bySubject = new Map<string, GrantMatrixRow>();

    for (const row of rows) {
      const existing = bySubject.get(row.subjectId) ?? {
        subjectId: row.subjectId,
        subjectKind: row.subjectKind,
        subjectLabel: row.subjectLabel,
        isRevoked: row.revokedAt !== null,
        levels: {} as Record<Section, never>,
      };

      existing.levels[row.section] = row.level;
      bySubject.set(row.subjectId, existing);
    }

    return [...bySubject.values()];
  }
}
```

- [ ] **Step 6: Запустить тест**

Run: `pnpm --filter @cairn/api test src/grants`
Expected: PASS, 6 тестов.

- [ ] **Step 7: Запустить все тесты**

Run: `pnpm test`
Expected: PASS во всех пакетах.

- [ ] **Step 8: Коммит**

```bash
git add apps/api/src/grants packages/shared/src
git commit -m "Добавить репозиторий выдач доступа"
```

---

**Результат чанка 4:** модель доступа работает и покрыта тестами, журнал пишется в одной транзакции с действием, репозитории не отдают данные без субъекта. Следующий чанк добавляет аутентификацию и HTTP-слой.
