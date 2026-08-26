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

**`apps/api/test/`** — тестовая фикстура Testcontainers и сквозные проверки, охватывающие приложение целиком: права ролей базы, HTTP-поведение.

Тесты отдельных модулей лежат рядом с кодом в `src/`, даже когда поднимают контейнер с базой: они проверяют один модуль, и держать их вдали от него неудобно. В `test/` попадает то, у чего нет единственного модуля-владельца.

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

Результат чанка: проверка прав работает и покрыта тестами, guard суперадмина отделён от сервиса прав, журнал пишется в одной транзакции с действием.

### Task 11: Подключение приложения к базе

Тестовая фикстура и Testcontainers уже настроены в чанке 3 (Task 9). Здесь появляется подключение, которым пользуется само приложение, — отдельной ролью, без прав на изменение журнала.

**Files:**
- Create: `apps/api/src/db/db.types.ts`, `apps/api/src/db/db.module.ts`
- Test: `apps/api/src/db/db.module.test.ts`

`AppModule` здесь не трогаем. `DbModule` требует `DATABASE_URL`, которого нет в тестовом окружении, и его подключение сломало бы тест сборки `AppModule` из Task 3. Все модули регистрируются разом в чанке 7, когда появится первый контроллер и тестовое окружение получит строку подключения.

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
    // Присваивание undefined положило бы в переменную строку "undefined",
    // которая truthy и утекла бы в соседние тесты.
    if (original === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = original;
    }
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
import type { SubjectKind } from '@cairn/shared';

/**
 * Действующий субъект запроса.
 *
 * Все методы доступа к данным принимают его первым аргументом, поэтому
 * проверку прав невозможно забыть — её не нужно вызывать отдельно (спека 5.4).
 *
 * Заполняется guard'ом аутентификации в чанке 7 и кладётся в `request.subject`.
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
```

Тип действующего лица журнала живёт в модуле журнала, а не здесь: иначе `audit` зависел бы от `access`, хотя журналирование к проверке прав отношения не имеет.

- [ ] **Step 2: Написать падающий тест `apps/api/src/access/access.service.test.ts`**

```typescript
import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from './access.service';
import type { RequestSubject } from './access.types';
import { grants, projects, subjects, users } from '../db/schema';
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
Expected: FAIL — «Failed to resolve import "./access.service"».

- [ ] **Step 4: Создать `apps/api/src/access/access.service.ts`**

```typescript
import { AccessLevel, type Section } from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { grants } from '../db/schema';
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
}
```

Метод списка видимых проектов добавляется в следующей задаче — вместе со своим тестом.

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
import { grants, projects, subjects, users } from '../db/schema';
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

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/access/visible-projects`
Expected: FAIL — `service.visibleProjectIds is not a function`.

- [ ] **Step 3: Добавить метод в `apps/api/src/access/access.service.ts`**

```typescript
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
      const rows = await this.db.select({ id: projects.id }).from(projects);

      return rows.map((row) => row.id);
    }

    const rows = await this.db
      .selectDistinct({ projectId: grants.projectId })
      .from(grants)
      .where(eq(grants.subjectId, subject.id));

    return rows.map((row) => row.projectId);
  }
```

Импорт таблиц дополни: `import { grants, projects } from '../db/schema';`

- [ ] **Step 4: Запустить тест**

Run: `pnpm --filter @cairn/api test src/access/visible-projects`
Expected: PASS, 5 тестов.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/access
git commit -m "Добавить список видимых проектов"
```

---

### Task 14: Требование уровня и коды ответов

**Files:**
- Create: `apps/api/src/access/access.errors.ts`
- Modify: `apps/api/src/access/access.service.ts`
- Test: `apps/api/src/access/require-level.test.ts`

- [ ] **Step 1: Создать `apps/api/src/access/access.errors.ts`**

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
import { InsufficientLevelError, SectionNotVisibleError } from './access.errors';
import type { RequestSubject } from './access.types';
import { grants, projects, subjects, users } from '../db/schema';
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

Импорты дополнить: `import { InsufficientLevelError, SectionNotVisibleError } from './access.errors';`

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
Expected: FAIL — «Failed to resolve import "./superadmin.guard"».

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
  InvitationReissued = 'invitation.reissued',
  InvitationAccepted = 'invitation.accepted',
  PasswordResetRequested = 'password_reset.requested',
  PasswordResetCompleted = 'password_reset.completed',
  SubjectRevoked = 'subject.revoked',
  SubjectRestored = 'subject.restored',
  SuperadminCreated = 'superadmin.created',
}

/**
 * Действующее лицо записи: субъект системы либо консоль сервера.
 *
 * Размеченное объединение: у действий с консоли субъекта нет вовсе,
 * и тип обязан это отражать (спека 4.7).
 */
export type AuditActor =
  | { kind: Exclude<AuditSubjectKind, AuditSubjectKind.System>; id: string; label: string }
  | { kind: AuditSubjectKind.System; id: null; label: string };

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

import { AuditService } from './audit.service';
import { AuditAction, type AuditActor } from './audit.types';
import { auditLog, projects, subjects } from '../db/schema';
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
Expected: FAIL — «Failed to resolve import "./audit.service"».

- [ ] **Step 4: Создать `apps/api/src/audit/audit.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';

import type { Transaction } from '../db/db.types';
import { auditLog } from '../db/schema';
import type { AuditActor, AuditEntryInput } from './audit.types';

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

Результат чанка: доступ к проектам невозможен без субъекта в сигнатуре, уровень «метаданные» реально скрывает поля, выдачи адресуются парой «субъект × секция».

Оговорка про выдачи: `GrantsRepository` субъекта не принимает намеренно — управлять доступами вправе только суперадмин, и это проверяет guard на контроллере (спека 4.3). Дублировать проверку в репозитории значило бы завести второе место, где правило может разойтись.

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

/**
 * Проект на уровне метаданных: видно, что он есть, и его состояние (ТЗ 4.3).
 *
 * Спека 5.5 называет здесь «название и состояние»; идентификатор и слаг
 * добавлены как техническая необходимость — без них на проект нельзя
 * сослаться и его карточку нельзя открыть. Содержательных сведений
 * они не раскрывают.
 */
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
import type { Project } from '../db/schema';

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
Expected: FAIL — «Failed to resolve import "./project.projection"».

- [ ] **Step 5: Создать `apps/api/src/projects/project.projection.ts`**

```typescript
import { AccessLevel, type ProjectDetail, type ProjectMetadata } from '@cairn/shared';

import type { Project } from '../db/schema';

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
Expected: PASS, 6 тестов.

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
Expected: FAIL — «Failed to resolve import "./slug"».

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
import { InsufficientLevelError, SectionNotVisibleError } from '../access/access.errors';
import type { RequestSubject } from '../access/access.types';
import { ProjectsRepository } from './projects.repository';
import { grants, projects, subjects, users } from '../db/schema';
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
    const admin = () => subject({ isSuperadmin: true });

    it('генерирует уникальный слаг при совпадении названий', async () => {
      const first = await repository.create(admin(), testDb.db, { name: 'Проект' });
      const second = await repository.create(admin(), testDb.db, { name: 'Проект' });

      expect(first.slug).not.toBe(second.slug);
    });

    it('ставит состояние «в разработке» по умолчанию', async () => {
      const created = await repository.create(admin(), testDb.db, { name: 'Новый' });

      expect(created.lifecycle).toBe(ProjectLifecycle.Development);
    });

    it('отказывает не-суперадмину', async () => {
      // Создавать проекты вправе только суперадмин (спека 4.4).
      await expect(
        repository.create(subject(), testDb.db, { name: 'Чужой' }),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
    });

    it('отказывает отозванному суперадмину', async () => {
      await expect(
        repository.create(subject({ isSuperadmin: true, isRevoked: true }), testDb.db, {
          name: 'Чужой',
        }),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
    });
  });

  describe('update', () => {
    it('без доступа бросает «не найдено»', async () => {
      await expect(
        repository.update(subject(), testDb.db, projectId, { name: 'Новое имя' }),
      ).rejects.toBeInstanceOf(SectionNotVisibleError);
    });

    it('на уровне чтения бросает «недостаточно прав»', async () => {
      await grant(AccessLevel.Read);

      await expect(
        repository.update(subject(), testDb.db, projectId, { name: 'Новое имя' }),
      ).rejects.toBeInstanceOf(InsufficientLevelError);
    });

    it('на уровне записи меняет поля', async () => {
      await grant(AccessLevel.Write);

      const updated = await repository.update(subject(), testDb.db, projectId, {
        name: 'Новое имя',
      });

      expect(updated.name).toBe('Новое имя');
    });

    it('не меняет слаг', async () => {
      // Слаг задаётся один раз, чтобы ссылки не ломались (спека 4.4).
      await grant(AccessLevel.Write);

      const updated = await repository.update(subject(), testDb.db, projectId, {
        name: 'Совсем другое имя',
      });

      expect(updated.slug).toBe('proekt');
    });
  });
});
```

- [ ] **Step 6: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/projects/projects.repository`
Expected: FAIL — «Failed to resolve import "./projects.repository"».

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
import { InsufficientLevelError, SectionNotVisibleError } from '../access/access.errors';
import type { RequestSubject } from '../access/access.types';
import { DATABASE } from '../db/db.module';
import type { Database, Executor } from '../db/db.types';
import { projects, type Project } from '../db/schema';
import { projectProjection } from './project.projection';
import { generateSlug } from './slug';

/**
 * Доступ к проектам.
 *
 * Каждый метод принимает субъект первым аргументом и проверяет права внутри:
 * отдельного вызова проверки, который можно забыть, не существует (спека 5.4).
 *
 * Методы записи дополнительно принимают транзакцию, потому что вызывающий
 * сервис пишет в журнал в той же транзакции (спека 7.3).
 *
 * Единственное исключение — {@link create}: при создании идентификатора
 * проекта ещё нет, а сервис прав работает именно по нему (спека 4.4). Право
 * создавать проект принадлежит только суперадмину, поэтому метод проверяет
 * этот признак сам, не обращаясь к сервису прав.
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

  /**
   * Возвращает список видимых субъекту проектов в проекции метаданных.
   *
   * Проекция всегда метаданных, даже если уровень выше: список — это обзор,
   * подробности показывает карточка проекта. Отдавать в списке полный
   * паспорт значило бы гонять лишние данные при каждом открытии сводки.
   */
  async findVisible(subject: RequestSubject): Promise<ProjectMetadata[]> {
    const ids = await this.access.visibleProjectIds(subject);

    if (ids.length === 0) {
      return [];
    }

    const rows = await this.db.select().from(projects).where(inArray(projects.id, ids));

    return rows.map((row) => projectProjection(row, AccessLevel.Metadata) as ProjectMetadata);
  }

  /**
   * Создаёт проект, подбирая свободный слаг.
   *
   * Проверяет признак суперадмина напрямую: сервису прав нужен идентификатор
   * проекта, которого здесь ещё не существует (спека 4.4).
   */
  async create(subject: RequestSubject, tx: Executor, input: ProjectCreate): Promise<Project> {
    if (!subject.isSuperadmin || subject.isRevoked) {
      throw new InsufficientLevelError();
    }

    const slug = await this.findFreeSlug(tx, generateSlug(input.name));

    const [created] = await tx
      .insert(projects)
      .values({ ...input, slug })
      .returning();

    return created!;
  }

  /** Изменяет поля паспорта проекта. Требует уровень записи. Слаг не меняется. */
  async update(
    subject: RequestSubject,
    tx: Executor,
    projectId: string,
    input: ProjectUpdate,
  ): Promise<Project> {
    await this.access.requireLevel(subject, projectId, Section.Info, AccessLevel.Write);

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
  private async findFreeSlug(tx: Executor, base: string): Promise<string> {
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
Expected: PASS, 27 тестов — 6 у проекции, 7 у слага и 14 у репозитория.

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

/**
 * Строка матрицы доступов: субъект и его уровни по секциям.
 *
 * `levels` содержит только те секции, на которые есть выдача: отсутствие
 * ключа и означает отсутствие доступа (спека 4.3).
 */
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

/**
 * Строка матрицы доступов.
 *
 * `levels` переопределён как частичная запись: `z.record` с перечислением
 * в ключе выводится в zod как **полный** `Record<Section, AccessLevel>`,
 * то есть тип утверждал бы, что все шесть секций всегда присутствуют.
 * Клиент получил бы непустое значение по типам и `undefined` в рантайме.
 */
export type GrantMatrixRow = Omit<z.infer<typeof grantMatrixRowSchema>, 'levels'> & {
  levels: Partial<Record<Section, AccessLevel>>;
};
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
import { grants, projects, subjects, users } from '../db/schema';
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

    it('сообщает, что выдачи не было', async () => {
      const removed = await testDb.db.transaction((tx) =>
        repository.revoke(tx, projectId, { subjectId, section: Section.Info }),
      );

      expect(removed).toBe(false);
    });

    it('сообщает, что выдача была', async () => {
      // Вызывающий сервис пишет в журнал только состоявшийся отзыв.
      const removed = await testDb.db.transaction(async (tx) => {
        await repository.set(tx, projectId, grantedBy, {
          subjectId,
          section: Section.Info,
          level: AccessLevel.Read,
        });

        return repository.revoke(tx, projectId, { subjectId, section: Section.Info });
      });

      expect(removed).toBe(true);
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
Expected: FAIL — «Failed to resolve import "./grants.repository"».

- [ ] **Step 5: Создать `apps/api/src/grants/grants.repository.ts`**

```typescript
import { type GrantMatrixRow, type GrantRevoke, type GrantSet, type Section } from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { DATABASE } from '../db/db.module';
import type { Database, Executor } from '../db/db.types';
import { grants, subjects } from '../db/schema';

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
    tx: Executor,
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
  async revoke(tx: Executor, projectId: string, input: GrantRevoke): Promise<boolean> {
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

  /**
   * Собирает матрицу «субъект × секция» для проекта.
   *
   * Возвращает только субъектов, у которых есть хотя бы одна выдача.
   * Экрану управления доступами нужны и остальные — чтобы было кому выдать
   * доступ впервые; их он берёт отдельным запросом списка пользователей.
   */
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
      const existing: GrantMatrixRow = bySubject.get(row.subjectId) ?? {
        subjectId: row.subjectId,
        subjectKind: row.subjectKind,
        subjectLabel: row.subjectLabel,
        isRevoked: row.revokedAt !== null,
        levels: {},
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
Expected: PASS, 7 тестов.

- [ ] **Step 7: Пересобрать контракт и проверить всё целиком**

Чанк дважды правил `packages/shared`, а проверка типов бэкенда смотрит в собранный `dist` — без пересборки она увидит устаревший контракт.

```bash
pnpm --filter @cairn/shared build
pnpm test
pnpm typecheck
```

Expected: без ошибок. Прогон занимает минуты: тесты поднимают несколько контейнеров с PostgreSQL, нужен работающий Docker.

- [ ] **Step 8: Коммит**

```bash
git add apps/api/src/grants packages/shared/src
git commit -m "Добавить репозиторий выдач доступа"
```

---

**Результат чанка 5:** уровень «метаданные» реально скрывает поля, доступ к проектам невозможен без субъекта в сигнатуре, выдачи адресуются парой «субъект × секция». Следующий чанк добавляет аутентификацию.

## Chunk 6: Аутентификация

Результат чанка: вход по паролю со вторым фактором работает, сессии отзываются мгновенно, перебор ограничен.

### Task 20: Хэширование паролей

**Files:**
- Create: `apps/api/src/auth/password.service.ts`
- Test: `apps/api/src/auth/password.service.test.ts`

- [ ] **Step 1: Установить argon2**

Run: `pnpm --filter @cairn/api add argon2`
Expected: пакет добавлен в `dependencies`.

- [ ] **Step 2: Написать падающий тест `apps/api/src/auth/password.service.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';

import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('проверяет верный пароль', async () => {
    const hash = await service.hash('верный-пароль');

    expect(await service.verify(hash, 'верный-пароль')).toBe(true);
  });

  it('отвергает неверный пароль', async () => {
    const hash = await service.hash('верный-пароль');

    expect(await service.verify(hash, 'неверный-пароль')).toBe(false);
  });

  it('даёт разные хэши для одного пароля', async () => {
    // Соль генерируется на каждый вызов: одинаковые хэши выдали бы
    // совпадающие пароли разных пользователей.
    expect(await service.hash('пароль')).not.toBe(await service.hash('пароль'));
  });

  it('использует argon2id', async () => {
    expect(await service.hash('пароль')).toMatch(/^\$argon2id\$/);
  });

  it('работает с кириллицей и длинными паролями', async () => {
    const password = 'очень длинный пароль с пробелами и символами №1!';
    const hash = await service.hash(password);

    expect(await service.verify(hash, password)).toBe(true);
  });

  it('возвращает false на испорченном хэше вместо исключения', async () => {
    // Испорченный хэш в базе не должен ронять вход пятисотой ошибкой.
    expect(await service.verify('не хэш', 'пароль')).toBe(false);
  });
});
```

- [ ] **Step 3: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/auth/password`
Expected: FAIL — «Failed to resolve import "./password.service"».

- [ ] **Step 4: Создать `apps/api/src/auth/password.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

/** Хэширование и проверка паролей (спека 4.2). */
@Injectable()
export class PasswordService {
  /** Хэширует пароль. Соль генерируется на каждый вызов самим argon2. */
  async hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  /**
   * Проверяет пароль.
   *
   * Возвращает `false` при испорченном хэше, а не бросает исключение:
   * повреждённая запись в базе не должна превращать неудачный вход
   * в ошибку сервера, по которой отличают существующего пользователя.
   */
  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 5: Запустить тест**

Run: `pnpm --filter @cairn/api test src/auth/password`
Expected: PASS, 6 тестов.

- [ ] **Step 6: Коммит**

```bash
git add apps/api/src/auth apps/api/package.json pnpm-lock.yaml
git commit -m "Добавить хэширование паролей"
```

---

### Task 21: Второй фактор

Секрет TOTP шифруется тем же сервисом, что и будущие значения переменных: механизм отрабатывается здесь, до появления настоящих секретов (спека 4.9).

**Files:**
- Create: `apps/api/src/auth/totp.service.ts`
- Test: `apps/api/src/auth/totp.service.test.ts`

- [ ] **Step 1: Установить otplib**

Run: `pnpm --filter @cairn/api add otplib`
Expected: пакет добавлен в `dependencies`.

- [ ] **Step 2: Написать падающий тест `apps/api/src/auth/totp.service.test.ts`**

```typescript
import { randomBytes } from 'node:crypto';

import { authenticator } from 'otplib';
import { beforeEach, describe, expect, it } from 'vitest';

import { CryptoService } from '../crypto/crypto.service';
import { TotpService } from './totp.service';

describe('TotpService', () => {
  let crypto: CryptoService;
  let service: TotpService;

  beforeEach(() => {
    crypto = new CryptoService(randomBytes(32).toString('base64'));
    service = new TotpService(crypto);
  });

  describe('создание секрета', () => {
    it('возвращает зашифрованный секрет', () => {
      const { encryptedSecret } = service.createSecret('user@cairn.local');

      // Секрет не должен храниться открытым: утечка базы не даёт второго фактора.
      expect(encryptedSecret.startsWith('v1:')).toBe(true);
    });

    it('возвращает ссылку для приложения-аутентификатора', () => {
      const { keyUri } = service.createSecret('user@cairn.local');

      expect(keyUri).toMatch(/^otpauth:\/\/totp\//);
      expect(keyUri).toContain('CAIRN');
    });

    it('даёт разные секреты при каждом вызове', () => {
      const first = service.createSecret('user@cairn.local');
      const second = service.createSecret('user@cairn.local');

      expect(first.encryptedSecret).not.toBe(second.encryptedSecret);
    });
  });

  describe('проверка кода', () => {
    it('принимает верный код', () => {
      const { encryptedSecret, secret } = service.createSecret('user@cairn.local');
      const code = authenticator.generate(secret);

      expect(service.verify(encryptedSecret, code)).toBe(true);
    });

    it('отвергает неверный код', () => {
      const { encryptedSecret } = service.createSecret('user@cairn.local');

      expect(service.verify(encryptedSecret, '000000')).toBe(false);
    });

    it('отвергает код от другого секрета', () => {
      const first = service.createSecret('user@cairn.local');
      const second = service.createSecret('other@cairn.local');
      const code = authenticator.generate(second.secret);

      expect(service.verify(first.encryptedSecret, code)).toBe(false);
    });

    it('возвращает false, если секрет не расшифровывается', () => {
      // Смена ключа шифрования не должна ронять вход пятисотой ошибкой.
      expect(service.verify('v1:aaaa:bbbb:cccc', '123456')).toBe(false);
    });
  });
});
```

- [ ] **Step 3: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/auth/totp`
Expected: FAIL — «Failed to resolve import "./totp.service"».

- [ ] **Step 4: Создать `apps/api/src/auth/totp.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';

import { CryptoService } from '../crypto/crypto.service';

/** Новый секрет второго фактора. */
export interface CreatedTotpSecret {
  /** Секрет в открытом виде. Показывается пользователю один раз и не хранится. */
  secret: string;
  /** Секрет для хранения в базе. */
  encryptedSecret: string;
  /** Ссылка для приложения-аутентификатора. */
  keyUri: string;
}

/**
 * Второй фактор аутентификации (спека 6.4).
 *
 * Секрет хранится только зашифрованным: при утечке базы одного пароля
 * по-прежнему недостаточно для входа.
 */
@Injectable()
export class TotpService {
  constructor(private readonly crypto: CryptoService) {}

  /** Создаёт секрет и ссылку для привязки приложения. */
  createSecret(email: string): CreatedTotpSecret {
    const secret = authenticator.generateSecret();

    return {
      secret,
      encryptedSecret: this.crypto.encrypt(secret),
      keyUri: authenticator.keyuri(email, ISSUER, secret),
    };
  }

  /**
   * Проверяет код.
   *
   * Возвращает `false`, если секрет не расшифровывается: смена ключа
   * шифрования должна выглядеть как неверный код, а не как отказ сервера.
   */
  verify(encryptedSecret: string, code: string): boolean {
    try {
      return authenticator.verify({ token: code, secret: this.crypto.decrypt(encryptedSecret) });
    } catch {
      return false;
    }
  }
}

/** Название системы в приложении-аутентификаторе. */
const ISSUER = 'CAIRN';
```

- [ ] **Step 5: Запустить тест**

Run: `pnpm --filter @cairn/api test src/auth/totp`
Expected: PASS, 7 тестов.

- [ ] **Step 6: Коммит**

```bash
git add apps/api/src/auth apps/api/package.json pnpm-lock.yaml
git commit -m "Добавить второй фактор аутентификации"
```

---

### Task 22: Токены и репозиторий сессий

Токены сессий хэшируются sha256, а не argon2: у случайного 32-байтного токена нет словаря для перебора, а argon2 на каждом запросе стоил бы сотни миллисекунд.

**Files:**
- Create: `apps/api/src/auth/token.ts`, `apps/api/src/auth/sessions.repository.ts`
- Test: `apps/api/src/auth/token.test.ts`, `apps/api/src/auth/sessions.repository.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/auth/token.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';

import { generateToken, hashToken } from './token';

describe('generateToken', () => {
  it('даёт разные токены', () => {
    expect(generateToken()).not.toBe(generateToken());
  });

  it('годится для передачи в cookie и ссылке', () => {
    // base64url без символов, требующих экранирования в URL.
    expect(generateToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('содержит не меньше 32 байт энтропии', () => {
    expect(generateToken().length).toBeGreaterThanOrEqual(43);
  });
});

describe('hashToken', () => {
  it('даёт одинаковый хэш для одного токена', () => {
    const token = generateToken();

    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('даёт разные хэши для разных токенов', () => {
    expect(hashToken(generateToken())).not.toBe(hashToken(generateToken()));
  });

  it('не содержит исходный токен', () => {
    const token = generateToken();

    expect(hashToken(token)).not.toContain(token);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/auth/token`
Expected: FAIL — «Failed to resolve import "./token"».

- [ ] **Step 3: Создать `apps/api/src/auth/token.ts`**

```typescript
import { createHash, randomBytes } from 'node:crypto';

/**
 * Создаёт случайный токен для сессии или одноразовой ссылки.
 *
 * Кодировка base64url: токен попадает и в cookie, и в адрес ссылки,
 * а значит не должен требовать экранирования.
 */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * Хэширует токен для хранения в базе.
 *
 * Используется sha256, а не argon2: токен случаен и достаточно длинен,
 * перебирать его нечем, а argon2 на каждом запросе стоил бы сотни
 * миллисекунд. Медленный хэш нужен паролям, которые люди выбирают сами.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Длина токена в байтах до кодирования. */
const TOKEN_BYTES = 32;
```

- [ ] **Step 4: Запустить тест**

Run: `pnpm --filter @cairn/api test src/auth/token`
Expected: PASS, 6 тестов.

- [ ] **Step 5: Написать падающий тест `apps/api/src/auth/sessions.repository.test.ts`**

```typescript
import { SubjectKind } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { SessionsRepository } from './sessions.repository';
import { generateToken } from './token';
import { sessions, subjects } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('SessionsRepository', () => {
  let testDb: TestDatabase;
  let repository: SessionsRepository;
  let subjectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    repository = new SessionsRepository(testDb.db);
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'пользователь' })
      .returning();
    subjectId = subject!.id;
  });

  describe('create', () => {
    it('возвращает токен и не хранит его открытым', async () => {
      const token = await repository.create(testDb.db, subjectId, {});

      const [stored] = await testDb.db.select().from(sessions);

      expect(stored?.tokenHash).not.toBe(token);
    });

    it('сохраняет источник запроса', async () => {
      await repository.create(testDb.db, subjectId, { ip: '10.0.0.1', userAgent: 'браузер' });

      const [stored] = await testDb.db.select().from(sessions);

      expect(stored?.ip).toBe('10.0.0.1');
      expect(stored?.userAgent).toBe('браузер');
    });
  });

  describe('findActive', () => {
    it('находит живую сессию по токену', async () => {
      const token = await repository.create(testDb.db, subjectId, {});

      expect(await repository.findActive(token)).toMatchObject({ subjectId });
    });

    it('не находит по неизвестному токену', async () => {
      expect(await repository.findActive(generateToken())).toBeNull();
    });

    it('не находит отозванную сессию', async () => {
      const token = await repository.create(testDb.db, subjectId, {});
      await repository.revoke(testDb.db, token);

      expect(await repository.findActive(token)).toBeNull();
    });

    it('не находит истёкшую сессию', async () => {
      const token = await repository.create(testDb.db, subjectId, {}, new Date(Date.now() - 1000));

      expect(await repository.findActive(token)).toBeNull();
    });
  });

  describe('revokeAllForSubject', () => {
    it('завершает все сессии субъекта и возвращает их число', async () => {
      // Отзыв субъекта обязан немедленно закрывать доступ (спека 4.5).
      await repository.create(testDb.db, subjectId, {});
      await repository.create(testDb.db, subjectId, {});

      expect(await repository.revokeAllForSubject(testDb.db, subjectId)).toBe(2);
    });

    it('не трогает сессии других субъектов', async () => {
      const [other] = await testDb.db
        .insert(subjects)
        .values({ kind: SubjectKind.User, label: 'другой' })
        .returning();
      const otherToken = await repository.create(testDb.db, other!.id, {});
      await repository.create(testDb.db, subjectId, {});

      await repository.revokeAllForSubject(testDb.db, subjectId);

      expect(await repository.findActive(otherToken)).not.toBeNull();
    });

    it('не считает уже отозванные сессии повторно', async () => {
      const token = await repository.create(testDb.db, subjectId, {});
      await repository.revoke(testDb.db, token);

      expect(await repository.revokeAllForSubject(testDb.db, subjectId)).toBe(0);
    });
  });
});
```

- [ ] **Step 6: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/auth/sessions`
Expected: FAIL — «Failed to resolve import "./sessions.repository"».

- [ ] **Step 7: Создать `apps/api/src/auth/sessions.repository.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';

import { DATABASE } from '../db/db.module';
import type { Database, Executor } from '../db/db.types';
import { sessions, type Session } from '../db/schema';
import { generateToken, hashToken } from './token';

/** Сведения об источнике запроса, сохраняемые в сессии. */
export interface SessionOrigin {
  ip?: string;
  userAgent?: string;
}

/**
 * Сессии пользователей.
 *
 * Хранятся в базе ради мгновенного отзыва: для системы с секретами
 * отозвать доступ нужно немедленно (спека 4.5).
 */
@Injectable()
export class SessionsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Создаёт сессию и возвращает токен в открытом виде.
   *
   * Открытый токен существует только в этом возвращаемом значении и в cookie
   * браузера; в базу попадает лишь его хэш.
   */
  async create(
    tx: Executor,
    subjectId: string,
    origin: SessionOrigin,
    expiresAt: Date = new Date(Date.now() + SESSION_TTL_MS),
  ): Promise<string> {
    const token = generateToken();

    await tx.insert(sessions).values({
      subjectId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: origin.ip ?? null,
      userAgent: origin.userAgent ?? null,
    });

    return token;
  }

  /** Находит живую сессию по токену: не отозванную и не истёкшую. */
  async findActive(token: string): Promise<Session | null> {
    const [session] = await this.db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.tokenHash, hashToken(token)),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    return session ?? null;
  }

  /** Отзывает одну сессию. */
  async revoke(tx: Executor, token: string): Promise<void> {
    await tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt)));
  }

  /**
   * Отзывает все живые сессии субъекта и возвращает их число.
   *
   * Число попадает в журнал: без него из записи не видно, был ли у
   * отозванного субъекта активный доступ в момент отзыва (спека 7.2).
   */
  async revokeAllForSubject(tx: Executor, subjectId: string): Promise<number> {
    const revoked = await tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.subjectId, subjectId), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });

    return revoked.length;
  }

  /**
   * Отмечает активность сессии.
   *
   * Обновление реже раза в минуту: писать в базу на каждом запросе
   * ради поля «последняя активность» не стоит.
   */
  async touch(sessionId: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(
        and(
          eq(sessions.id, sessionId),
          sql`${sessions.lastSeenAt} < now() - interval '1 minute'`,
        ),
      );
  }
}

/** Срок жизни сессии — 30 дней (спека 4.5). */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
```

- [ ] **Step 8: Запустить тест**

Run: `pnpm --filter @cairn/api test src/auth`
Expected: PASS, 22 теста.

- [ ] **Step 9: Коммит**

```bash
git add apps/api/src/auth
git commit -m "Добавить токены и репозиторий сессий"
```

---

### Task 23: Ограничение попыток входа

**Files:**
- Create: `apps/api/src/auth/login-attempts.service.ts`
- Test: `apps/api/src/auth/login-attempts.service.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/auth/login-attempts.service.test.ts`**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginAttemptsService } from './login-attempts.service';

describe('LoginAttemptsService', () => {
  let service: LoginAttemptsService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new LoginAttemptsService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function failTenTimes(email = 'user@cairn.local', ip = '10.0.0.1'): void {
    for (let index = 0; index < 10; index += 1) {
      service.registerFailure(email, ip);
    }
  }

  it('пропускает первую попытку', () => {
    expect(service.isBlocked('user@cairn.local', '10.0.0.1')).toBe(false);
  });

  it('блокирует после десяти неудач', () => {
    failTenTimes();

    expect(service.isBlocked('user@cairn.local', '10.0.0.1')).toBe(true);
  });

  it('не блокирует на девятой неудаче', () => {
    for (let index = 0; index < 9; index += 1) {
      service.registerFailure('user@cairn.local', '10.0.0.1');
    }

    expect(service.isBlocked('user@cairn.local', '10.0.0.1')).toBe(false);
  });

  it('не блокирует тот же адрес с другого источника', () => {
    // Составной ключ: иначе перебор с чужой машины закрывал бы вход
    // владельцу учётной записи (спека 6.2).
    failTenTimes('user@cairn.local', '10.0.0.1');

    expect(service.isBlocked('user@cairn.local', '10.0.0.2')).toBe(false);
  });

  it('не блокирует другой адрес с того же источника', () => {
    failTenTimes('user@cairn.local', '10.0.0.1');

    expect(service.isBlocked('other@cairn.local', '10.0.0.1')).toBe(false);
  });

  it('снимает блокировку через пятнадцать минут', () => {
    failTenTimes();

    vi.advanceTimersByTime(15 * 60 * 1000 + 1);

    expect(service.isBlocked('user@cairn.local', '10.0.0.1')).toBe(false);
  });

  it('удерживает блокировку до истечения срока', () => {
    failTenTimes();

    vi.advanceTimersByTime(14 * 60 * 1000);

    expect(service.isBlocked('user@cairn.local', '10.0.0.1')).toBe(true);
  });

  it('сбрасывает счётчик при успешном входе', () => {
    for (let index = 0; index < 9; index += 1) {
      service.registerFailure('user@cairn.local', '10.0.0.1');
    }
    service.registerSuccess('user@cairn.local', '10.0.0.1');
    service.registerFailure('user@cairn.local', '10.0.0.1');

    expect(service.isBlocked('user@cairn.local', '10.0.0.1')).toBe(false);
  });

  it('не различает регистр адреса', () => {
    failTenTimes('User@Cairn.Local', '10.0.0.1');

    expect(service.isBlocked('user@cairn.local', '10.0.0.1')).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/auth/login-attempts`
Expected: FAIL — «Failed to resolve import "./login-attempts.service"».

- [ ] **Step 3: Создать `apps/api/src/auth/login-attempts.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';

/**
 * Ограничение перебора паролей (спека 6.2).
 *
 * Ключ составной — «адрес пользователя + адрес источника». Счётчик по одному
 * лишь адресу пользователя дал бы вектор отказа в обслуживании: зная почту
 * суперадмина, достаточно раз в четверть часа делать десяток неверных
 * попыток, чтобы держать его вне системы.
 *
 * Состояние хранится в памяти процесса: при перезапуске счётчики обнуляются,
 * и это приемлемо — защита рассчитана на автоматический перебор, а не на
 * целенаправленную атаку, от которой защищает второй фактор. При добавлении
 * второго экземпляра `api` счётчик потребуется вынести в общее хранилище.
 */
@Injectable()
export class LoginAttemptsService {
  private readonly failures = new Map<string, number[]>();

  /** Проверяет, исчерпан ли лимит попыток для пары. */
  isBlocked(email: string, ip: string): boolean {
    return this.recentFailures(buildKey(email, ip)).length >= MAX_FAILURES;
  }

  /** Отмечает неудачную попытку. */
  registerFailure(email: string, ip: string): void {
    const key = buildKey(email, ip);

    this.failures.set(key, [...this.recentFailures(key), Date.now()]);
  }

  /** Сбрасывает счётчик после успешного входа. */
  registerSuccess(email: string, ip: string): void {
    this.failures.delete(buildKey(email, ip));
  }

  /** Возвращает попытки, попадающие в текущее окно, попутно отбрасывая старые. */
  private recentFailures(key: string): number[] {
    const threshold = Date.now() - WINDOW_MS;
    const recent = (this.failures.get(key) ?? []).filter((at) => at > threshold);

    if (recent.length === 0) {
      this.failures.delete(key);
    } else {
      this.failures.set(key, recent);
    }

    return recent;
  }
}

/** Строит ключ счётчика. Регистр адреса не различается. */
function buildKey(email: string, ip: string): string {
  return `${email.toLowerCase()}|${ip}`;
}

/** Порог блокировки. */
const MAX_FAILURES = 10;

/** Окно наблюдения и срок блокировки — 15 минут. */
const WINDOW_MS = 15 * 60 * 1000;
```

- [ ] **Step 4: Запустить тест**

Run: `pnpm --filter @cairn/api test src/auth/login-attempts`
Expected: PASS, 9 тестов.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/auth
git commit -m "Добавить ограничение попыток входа"
```

---

### Task 24: Вход по паролю

Самая ответственная задача чанка: здесь сходятся требования спеки 6.1 и 6.2 — двухшаговый вход и неразличимость четырёх состояний отказа.

**Files:**
- Create: `apps/api/src/auth/auth.types.ts`, `apps/api/src/auth/auth.service.ts`
- Test: `apps/api/src/auth/auth.service.test.ts`

- [ ] **Step 1: Создать `apps/api/src/auth/auth.types.ts`**

```typescript
/**
 * Итог проверки пароля.
 *
 * Размеченное объединение, а не необязательные поля: вызывающий код обязан
 * различить сессию и челлендж, и типы должны его к этому принуждать.
 */
export type LoginOutcome =
  | { kind: 'session'; token: string }
  | { kind: 'totp_required'; challengeToken: string };
```

- [ ] **Step 2: Написать падающий тест `apps/api/src/auth/auth.service.test.ts`**

```typescript
import { AuditSubjectKind, SubjectKind } from '@cairn/shared';
import { randomBytes } from 'node:crypto';

import { UnauthorizedException } from '@nestjs/common';
import { authenticator } from 'otplib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { CryptoService } from '../crypto/crypto.service';
import { AuthService } from './auth.service';
import { LoginAttemptsService } from './login-attempts.service';
import { PasswordService } from './password.service';
import { SessionsRepository } from './sessions.repository';
import { TotpService } from './totp.service';
import { auditLog, subjects, users } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

const ORIGIN = { ip: '10.0.0.1', userAgent: 'браузер' };

describe('AuthService.login', () => {
  let testDb: TestDatabase;
  let service: AuthService;
  let totp: TotpService;
  let passwords: PasswordService;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    passwords = new PasswordService();
    totp = new TotpService(new CryptoService(randomBytes(32).toString('base64')));
    service = new AuthService(
      testDb.db,
      passwords,
      totp,
      new SessionsRepository(testDb.db),
      new LoginAttemptsService(),
      new AuditService(),
    );
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();
  });

  async function createUser(options: { password?: string; withTotp?: boolean } = {}) {
    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();

    const secret = options.withTotp ? totp.createSecret('user@cairn.local') : null;

    const [user] = await testDb.db
      .insert(users)
      .values({
        subjectId: subject!.id,
        email: 'user@cairn.local',
        passwordHash: options.password ? await passwords.hash(options.password) : null,
        totpSecretEncrypted: secret?.encryptedSecret ?? null,
        isTotpEnabled: Boolean(secret),
      })
      .returning();

    return { user: user!, subject: subject!, secret };
  }

  it('выдаёт сессию при верном пароле без второго фактора', async () => {
    await createUser({ password: 'пароль' });

    const outcome = await service.login('user@cairn.local', 'пароль', ORIGIN);

    expect(outcome.kind).toBe('session');
  });

  it('выдаёт челлендж при включённом втором факторе', async () => {
    await createUser({ password: 'пароль', withTotp: true });

    const outcome = await service.login('user@cairn.local', 'пароль', ORIGIN);

    expect(outcome.kind).toBe('totp_required');
  });

  it('отвергает неверный пароль', async () => {
    await createUser({ password: 'пароль' });

    await expect(service.login('user@cairn.local', 'не тот', ORIGIN)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('одинаково отвечает на несуществующий адрес', async () => {
    // Различие в ответах позволило бы перебором выяснить состав
    // пользователей (спека 6.2).
    await createUser({ password: 'пароль' });

    const wrongPassword = await service
      .login('user@cairn.local', 'не тот', ORIGIN)
      .catch((error: Error) => error.message);
    const unknownEmail = await service
      .login('никого@cairn.local', 'не тот', ORIGIN)
      .catch((error: Error) => error.message);

    expect(wrongPassword).toBe(unknownEmail);
  });

  it('одинаково отвечает пользователю без действующего пароля', async () => {
    await createUser();

    const noPassword = await service
      .login('user@cairn.local', 'любой', ORIGIN)
      .catch((error: Error) => error.message);
    const unknownEmail = await service
      .login('никого@cairn.local', 'любой', ORIGIN)
      .catch((error: Error) => error.message);

    expect(noPassword).toBe(unknownEmail);
  });

  it('отказывает отозванному субъекту', async () => {
    const { subject } = await createUser({ password: 'пароль' });
    await testDb.db.update(subjects).set({ revokedAt: new Date() });

    await expect(service.login('user@cairn.local', 'пароль', ORIGIN)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(subject.id).toBeDefined();
  });

  it('блокирует после десяти неудач и отвечает так же, как при неверном пароле', async () => {
    await createUser({ password: 'пароль' });

    for (let index = 0; index < 10; index += 1) {
      await service.login('user@cairn.local', 'не тот', ORIGIN).catch(() => undefined);
    }

    const blocked = await service
      .login('user@cairn.local', 'пароль', ORIGIN)
      .catch((error: Error) => error.message);
    const unknownEmail = await service
      .login('никого@cairn.local', 'любой', { ip: '10.0.0.9' })
      .catch((error: Error) => error.message);

    expect(blocked).toBe(unknownEmail);
  });

  it('пишет успешный вход в журнал', async () => {
    await createUser({ password: 'пароль' });

    await service.login('user@cairn.local', 'пароль', ORIGIN);

    const [entry] = await testDb.db.select().from(auditLog);

    expect(entry?.action).toBe(AuditAction.LoginSucceeded);
    expect(entry?.subjectKind).toBe(AuditSubjectKind.User);
  });

  it('пишет неудачную попытку в журнал', async () => {
    await createUser({ password: 'пароль' });

    await service.login('user@cairn.local', 'не тот', ORIGIN).catch(() => undefined);

    const [entry] = await testDb.db.select().from(auditLog);

    expect(entry?.action).toBe(AuditAction.LoginFailed);
  });

  it('не пишет в журнал попытку с несуществующим адресом', async () => {
    // Субъекта нет, а запись вида system исказила бы картину: журнал
    // фиксирует действия над системой, а не любой шум на входе.
    await service.login('никого@cairn.local', 'любой', ORIGIN).catch(() => undefined);

    expect(await testDb.db.select().from(auditLog)).toHaveLength(0);
  });
});

describe('AuthService.verifyTotp', () => {
  let testDb: TestDatabase;
  let service: AuthService;
  let totp: TotpService;
  let passwords: PasswordService;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    passwords = new PasswordService();
    totp = new TotpService(new CryptoService(randomBytes(32).toString('base64')));
    service = new AuthService(
      testDb.db,
      passwords,
      totp,
      new SessionsRepository(testDb.db),
      new LoginAttemptsService(),
      new AuditService(),
    );
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();
  });

  async function loginWithTotp(): Promise<{ challengeToken: string; secret: string }> {
    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    const created = totp.createSecret('user@cairn.local');

    await testDb.db.insert(users).values({
      subjectId: subject!.id,
      email: 'user@cairn.local',
      passwordHash: await passwords.hash('пароль'),
      totpSecretEncrypted: created.encryptedSecret,
      isTotpEnabled: true,
    });

    const outcome = await service.login('user@cairn.local', 'пароль', ORIGIN);

    if (outcome.kind !== 'totp_required') {
      throw new Error('ожидался челлендж второго фактора');
    }

    return { challengeToken: outcome.challengeToken, secret: created.secret };
  }

  it('выдаёт сессию при верном коде', async () => {
    const { challengeToken, secret } = await loginWithTotp();

    const token = await service.verifyTotp(challengeToken, authenticator.generate(secret), ORIGIN);

    expect(typeof token).toBe('string');
  });

  it('отвергает неверный код', async () => {
    const { challengeToken } = await loginWithTotp();

    await expect(service.verifyTotp(challengeToken, '000000', ORIGIN)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('исчерпывает челлендж после пяти неудач', async () => {
    const { challengeToken, secret } = await loginWithTotp();

    for (let index = 0; index < 5; index += 1) {
      await service.verifyTotp(challengeToken, '000000', ORIGIN).catch(() => undefined);
    }

    await expect(
      service.verifyTotp(challengeToken, authenticator.generate(secret), ORIGIN),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('не принимает челлендж повторно', async () => {
    const { challengeToken, secret } = await loginWithTotp();
    await service.verifyTotp(challengeToken, authenticator.generate(secret), ORIGIN);

    await expect(
      service.verifyTotp(challengeToken, authenticator.generate(secret), ORIGIN),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('отвергает неизвестный челлендж', async () => {
    await expect(service.verifyTotp('нет такого', '123456', ORIGIN)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
```

- [ ] **Step 3: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/auth/auth.service`
Expected: FAIL — «Failed to resolve import "./auth.service"».

- [ ] **Step 4: Создать `apps/api/src/auth/auth.service.ts`**

```typescript
import { AuditSubjectKind } from '@cairn/shared';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';

import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { subjects, totpChallenges, users, type User } from '../db/schema';
import type { LoginOutcome } from './auth.types';
import { LoginAttemptsService } from './login-attempts.service';
import { PasswordService } from './password.service';
import { SessionsRepository, type SessionOrigin } from './sessions.repository';
import { generateToken, hashToken } from './token';
import { TotpService } from './totp.service';

/**
 * Вход в систему (спека 6.1).
 *
 * Вход двухшаговый: проверка пароля и, если второй фактор привязан, проверка
 * кода. Разделение позволяет считать неудачи кода отдельно от неудач пароля
 * и не смешивать два разных состояния в одном ответе.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly passwords: PasswordService,
    private readonly totp: TotpService,
    private readonly sessions: SessionsRepository,
    private readonly attempts: LoginAttemptsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Проверяет пароль.
   *
   * Возвращает либо готовую сессию, либо челлендж второго фактора.
   * Все отказы неразличимы: одинаковое сообщение получают неверный пароль,
   * несуществующий адрес, исчерпанный лимит попыток и пользователь без
   * действующего пароля (спека 6.2).
   */
  async login(email: string, password: string, origin: SessionOrigin): Promise<LoginOutcome> {
    const ip = origin.ip ?? 'unknown';

    if (this.attempts.isBlocked(email, ip)) {
      throw new UnauthorizedException(FAILURE_MESSAGE);
    }

    const found = await this.findActiveUser(email);

    if (!found || !found.passwordHash) {
      this.attempts.registerFailure(email, ip);
      throw new UnauthorizedException(FAILURE_MESSAGE);
    }

    if (!(await this.passwords.verify(found.passwordHash, password))) {
      this.attempts.registerFailure(email, ip);
      await this.db.transaction(async (tx) => {
        await this.audit.record(tx, this.actorFor(found), { action: AuditAction.LoginFailed });
      });

      throw new UnauthorizedException(FAILURE_MESSAGE);
    }

    this.attempts.registerSuccess(email, ip);

    if (found.isTotpEnabled) {
      return { kind: 'totp_required', challengeToken: await this.createChallenge(found.id) };
    }

    return { kind: 'session', token: await this.startSession(found, origin) };
  }

  /**
   * Проверяет код второго фактора и выдаёт сессию.
   *
   * Пять неудачных попыток исчерпывают челлендж, после чего вход
   * начинается заново с пароля (спека 6.2).
   */
  async verifyTotp(challengeToken: string, code: string, origin: SessionOrigin): Promise<string> {
    const [challenge] = await this.db
      .select()
      .from(totpChallenges)
      .where(
        and(
          eq(totpChallenges.tokenHash, hashToken(challengeToken)),
          isNull(totpChallenges.consumedAt),
          gt(totpChallenges.expiresAt, new Date()),
          sql`${totpChallenges.attempts} < ${MAX_TOTP_ATTEMPTS}`,
        ),
      )
      .limit(1);

    if (!challenge) {
      throw new UnauthorizedException(FAILURE_MESSAGE);
    }

    const found = await this.findActiveUserById(challenge.userId);

    if (!found?.totpSecretEncrypted || !this.totp.verify(found.totpSecretEncrypted, code)) {
      await this.db.transaction(async (tx) => {
        await tx
          .update(totpChallenges)
          .set({ attempts: challenge.attempts + 1 })
          .where(eq(totpChallenges.id, challenge.id));

        if (found) {
          await this.audit.record(tx, this.actorFor(found), {
            action:
              challenge.attempts + 1 >= MAX_TOTP_ATTEMPTS
                ? AuditAction.TotpChallengeExhausted
                : AuditAction.TotpFailed,
          });
        }
      });

      throw new UnauthorizedException(FAILURE_MESSAGE);
    }

    await this.db
      .update(totpChallenges)
      .set({ consumedAt: new Date() })
      .where(eq(totpChallenges.id, challenge.id));

    return this.startSession(found, origin);
  }

  /** Создаёт сессию и пишет успешный вход в журнал в одной транзакции. */
  private async startSession(user: ActiveUser, origin: SessionOrigin): Promise<string> {
    return this.db.transaction(async (tx) => {
      const token = await this.sessions.create(tx, user.subjectId, origin);

      await this.audit.record(tx, this.actorFor(user), { action: AuditAction.LoginSucceeded });

      return token;
    });
  }

  /** Создаёт короткоживущий челлендж второго фактора. */
  private async createChallenge(userId: string): Promise<string> {
    const token = generateToken();

    await this.db.insert(totpChallenges).values({
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    });

    return token;
  }

  /** Находит пользователя с неотозванным субъектом по адресу. */
  private async findActiveUser(email: string): Promise<ActiveUser | null> {
    const [found] = await this.db
      .select({ user: users, subjectLabel: subjects.label })
      .from(users)
      .innerJoin(subjects, eq(subjects.id, users.subjectId))
      .where(and(eq(users.email, email.toLowerCase()), isNull(subjects.revokedAt)))
      .limit(1);

    return found ? { ...found.user, subjectLabel: found.subjectLabel } : null;
  }

  /** Находит пользователя с неотозванным субъектом по идентификатору. */
  private async findActiveUserById(userId: string): Promise<ActiveUser | null> {
    const [found] = await this.db
      .select({ user: users, subjectLabel: subjects.label })
      .from(users)
      .innerJoin(subjects, eq(subjects.id, users.subjectId))
      .where(and(eq(users.id, userId), isNull(subjects.revokedAt)))
      .limit(1);

    return found ? { ...found.user, subjectLabel: found.subjectLabel } : null;
  }

  /** Строит действующее лицо для журнала. */
  private actorFor(user: ActiveUser) {
    return {
      kind: AuditSubjectKind.User as const,
      id: user.subjectId,
      label: user.subjectLabel,
    };
  }
}

/** Пользователь с меткой его субъекта. */
type ActiveUser = User & { subjectLabel: string };

/**
 * Единое сообщение об отказе.
 *
 * Одинаково для всех причин: различия позволили бы перебором выяснить
 * состав пользователей и то, кто из них заблокирован.
 */
const FAILURE_MESSAGE = 'Неверный адрес или пароль';

/** Предел попыток кода второго фактора. */
const MAX_TOTP_ATTEMPTS = 5;

/** Срок жизни челленджа — 5 минут (спека 4.8). */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
```

- [ ] **Step 5: Запустить тест**

Run: `pnpm --filter @cairn/api test src/auth/auth.service`
Expected: PASS, 15 тестов.

- [ ] **Step 6: Коммит**

```bash
git add apps/api/src/auth
git commit -m "Добавить вход по паролю со вторым фактором"
```

---

**Результат чанка 6:** вход с двумя факторами работает, сессии отзываются мгновенно, перебор ограничен составным ключом, все отказы неразличимы. Следующий чанк добавляет HTTP-слой аутентификации, приглашения и команды консоли.

## Chunk 7: HTTP-слой аутентификации

Результат чанка: браузер входит в систему по-настоящему — с cookie, guard'ом и валидацией тела запроса.

### Task 25: Валидация тела запроса

Одна общая труба валидации на всё приложение: zod-схемы контракта проверяются на границе, а контроллеры получают уже разобранные данные. Без этого каждый контроллер разбирал бы тело по-своему, и часть проверок неминуемо разошлась бы с контрактом.

**Files:**
- Create: `apps/api/src/common/zod-validation.pipe.ts`
- Test: `apps/api/src/common/zod-validation.pipe.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/common/zod-validation.pipe.test.ts`**

```typescript
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({
  email: z.string().email(),
  age: z.number().int().positive(),
});

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(schema);

  it('пропускает корректные данные', () => {
    expect(pipe.transform({ email: 'user@cairn.local', age: 30 })).toEqual({
      email: 'user@cairn.local',
      age: 30,
    });
  });

  it('отвергает данные, не прошедшие схему', () => {
    expect(() => pipe.transform({ email: 'не адрес', age: 30 })).toThrow(BadRequestException);
  });

  it('отбрасывает лишние поля', () => {
    // Иначе неизвестное поле дошло бы до слоя данных и могло попасть в базу.
    expect(pipe.transform({ email: 'user@cairn.local', age: 30, isSuperadmin: true })).toEqual({
      email: 'user@cairn.local',
      age: 30,
    });
  });

  it('сообщает, какое поле не прошло', () => {
    try {
      pipe.transform({ email: 'не адрес', age: 30 });
      expect.unreachable('ожидалось исключение');
    } catch (error) {
      expect(JSON.stringify(error)).toContain('email');
    }
  });

  it('отвергает значение, не являющееся объектом', () => {
    expect(() => pipe.transform('строка')).toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/common`
Expected: FAIL — «Failed to resolve import "./zod-validation.pipe"».

- [ ] **Step 3: Создать `apps/api/src/common/zod-validation.pipe.ts`**

```typescript
import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Проверяет тело запроса схемой из пакета контракта.
 *
 * Схема одна и та же на бэкенде и во фронтенде, поэтому расхождение
 * проверок между ними невозможно по построению.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        message: 'Неверные данные запроса',
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    return result.data;
  }
}
```

Схемы объектов в zod по умолчанию отбрасывают неизвестные поля, поэтому отдельной настройки для этого не требуется.

- [ ] **Step 4: Запустить тест**

Run: `pnpm --filter @cairn/api test src/common`
Expected: PASS, 5 тестов.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/common
git commit -m "Добавить валидацию тела запроса схемами контракта"
```

---

### Task 26: Guard аутентификации

**Files:**
- Create: `apps/api/src/auth/current-subject.decorator.ts`, `apps/api/src/auth/session.guard.ts`
- Test: `apps/api/src/auth/session.guard.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/auth/session.guard.test.ts`**

```typescript
import { SubjectKind } from '@cairn/shared';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { SessionGuard } from './session.guard';
import { SessionsRepository } from './sessions.repository';
import { SESSION_COOKIE } from './session.cookie';
import { subjects, users } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

interface FakeRequest {
  cookies: Record<string, string>;
  subject?: unknown;
}

function contextWith(request: FakeRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('SessionGuard', () => {
  let testDb: TestDatabase;
  let guard: SessionGuard;
  let sessionsRepository: SessionsRepository;
  let subjectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    sessionsRepository = new SessionsRepository(testDb.db);
    guard = new SessionGuard(testDb.db, sessionsRepository);
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    subjectId = subject!.id;

    await testDb.db
      .insert(users)
      .values({ subjectId, email: 'user@cairn.local', isSuperadmin: false });
  });

  it('отклоняет запрос без cookie', async () => {
    await expect(guard.canActivate(contextWith({ cookies: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('отклоняет неизвестный токен', async () => {
    await expect(
      guard.canActivate(contextWith({ cookies: { [SESSION_COOKIE]: 'нет такого' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('пропускает живую сессию и кладёт субъект в запрос', async () => {
    const token = await sessionsRepository.create(testDb.db, subjectId, {});
    const request: FakeRequest = { cookies: { [SESSION_COOKIE]: token } };

    expect(await guard.canActivate(contextWith(request))).toBe(true);
    expect(request.subject).toMatchObject({ id: subjectId, isSuperadmin: false });
  });

  it('отражает признак суперадмина', async () => {
    await testDb.db.update(users).set({ isSuperadmin: true });
    const token = await sessionsRepository.create(testDb.db, subjectId, {});
    const request: FakeRequest = { cookies: { [SESSION_COOKIE]: token } };

    await guard.canActivate(contextWith(request));

    expect(request.subject).toMatchObject({ isSuperadmin: true });
  });

  it('отклоняет сессию отозванного субъекта', async () => {
    // Отзыв завершает сессии, но проверка нужна и здесь: она защищает
    // от сессии, созданной в тот же момент другим путём.
    const token = await sessionsRepository.create(testDb.db, subjectId, {});
    await testDb.db.update(subjects).set({ revokedAt: new Date() });

    await expect(
      guard.canActivate(contextWith({ cookies: { [SESSION_COOKIE]: token } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('отклоняет отозванную сессию', async () => {
    const token = await sessionsRepository.create(testDb.db, subjectId, {});
    await sessionsRepository.revoke(testDb.db, token);

    await expect(
      guard.canActivate(contextWith({ cookies: { [SESSION_COOKIE]: token } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/auth/session.guard`
Expected: FAIL — «Failed to resolve import "./session.guard"».

- [ ] **Step 3: Создать `apps/api/src/auth/session.cookie.ts`**

```typescript
import type { CookieOptions } from 'express';

/** Имя cookie с токеном сессии. */
export const SESSION_COOKIE = 'cairn_session';

/**
 * Настройки cookie сессии (спека 6.3).
 *
 * `httpOnly` закрывает токен от скриптов страницы, `sameSite: lax` защищает
 * от межсайтовых запросов, `secure` включается вне разработки — по HTTP
 * такая cookie просто не установится, и локальная разработка сломалась бы.
 */
export const SESSION_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};
```

- [ ] **Step 4: Создать `apps/api/src/auth/session.guard.ts`**

```typescript
import { SubjectKind } from '@cairn/shared';
import {
  CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { RequestSubject } from '../access/access.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { subjects, users } from '../db/schema';
import { SESSION_COOKIE } from './session.cookie';
import { SessionsRepository } from './sessions.repository';

/**
 * Превращает cookie сессии в субъект запроса.
 *
 * Субъект кладётся в запрос и дальше попадает во все репозитории первым
 * аргументом — на этом держится вся проверка прав (спека 5.4).
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly sessions: SessionsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ cookies?: Record<string, string>; subject?: RequestSubject }>();

    const token = request.cookies?.[SESSION_COOKIE];

    if (!token) {
      throw new UnauthorizedException('Требуется вход');
    }

    const session = await this.sessions.findActive(token);

    if (!session) {
      throw new UnauthorizedException('Требуется вход');
    }

    const [found] = await this.db
      .select({ subject: subjects, user: users })
      .from(subjects)
      .leftJoin(users, eq(users.subjectId, subjects.id))
      .where(eq(subjects.id, session.subjectId))
      .limit(1);

    if (!found || found.subject.revokedAt !== null) {
      throw new UnauthorizedException('Требуется вход');
    }

    request.subject = {
      id: found.subject.id,
      kind: found.subject.kind as SubjectKind,
      label: found.subject.label,
      isSuperadmin: found.user?.isSuperadmin ?? false,
      isRevoked: false,
    };

    void this.sessions.touch(session.id);

    return true;
  }
}
```

- [ ] **Step 5: Создать `apps/api/src/auth/current-subject.decorator.ts`**

```typescript
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';

/**
 * Достаёт субъект запроса, положенный {@link SessionGuard}.
 *
 * Использовать только на маршрутах под этим guard'ом: без него значение
 * будет пустым.
 */
export const CurrentSubject = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestSubject => {
    const request = context.switchToHttp().getRequest<{ subject?: RequestSubject }>();

    if (!request.subject) {
      throw new Error('Субъект запроса не найден: маршрут не защищён SessionGuard');
    }

    return request.subject;
  },
);
```

- [ ] **Step 6: Запустить тест**

Run: `pnpm --filter @cairn/api test src/auth/session.guard`
Expected: PASS, 6 тестов.

- [ ] **Step 7: Коммит**

```bash
git add apps/api/src/auth
git commit -m "Добавить guard аутентификации"
```

---

### Task 27: Схемы контракта для аутентификации

**Files:**
- Create: `packages/shared/src/schemas/auth.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/schemas/auth.test.ts`

- [ ] **Step 1: Написать падающий тест `packages/shared/src/schemas/auth.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';

import { loginSchema, totpSchema, totpVerifySchema } from './auth';

describe('loginSchema', () => {
  it('принимает корректные данные', () => {
    expect(loginSchema.safeParse({ email: 'user@cairn.local', password: 'пароль' }).success).toBe(
      true,
    );
  });

  it('приводит адрес к нижнему регистру', () => {
    // Иначе один и тот же человек считался бы разными пользователями.
    const result = loginSchema.parse({ email: 'User@Cairn.Local', password: 'пароль' });

    expect(result.email).toBe('user@cairn.local');
  });

  it('отвергает пустой пароль', () => {
    expect(loginSchema.safeParse({ email: 'user@cairn.local', password: '' }).success).toBe(false);
  });

  it('отвергает адрес без домена', () => {
    expect(loginSchema.safeParse({ email: 'не адрес', password: 'пароль' }).success).toBe(false);
  });
});

describe('totpSchema', () => {
  it('принимает шестизначный код', () => {
    expect(totpSchema.safeParse({ code: '123456' }).success).toBe(true);
  });

  it('отвергает код другой длины', () => {
    expect(totpSchema.safeParse({ code: '12345' }).success).toBe(false);
  });

  it('отвергает код с буквами', () => {
    expect(totpSchema.safeParse({ code: '12345a' }).success).toBe(false);
  });
});

describe('totpVerifySchema', () => {
  it('требует челлендж вместе с кодом', () => {
    expect(totpVerifySchema.safeParse({ code: '123456' }).success).toBe(false);
  });

  it('принимает челлендж и код вместе', () => {
    expect(
      totpVerifySchema.safeParse({ code: '123456', challengeToken: 'токен' }).success,
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/shared test`
Expected: FAIL — «Failed to resolve import "./auth"».

- [ ] **Step 3: Создать `packages/shared/src/schemas/auth.ts`**

```typescript
import { z } from 'zod';

/** Первый шаг входа: адрес и пароль (спека 6.1). */
export const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

/** Второй шаг входа: код из приложения-аутентификатора. */
export const totpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Код состоит из шести цифр'),
});

/** Тело запроса второго шага: челлендж из первого шага и код. */
export const totpVerifySchema = totpSchema.extend({
  challengeToken: z.string().min(1),
});

/** Установка пароля по одноразовой ссылке. */
export const acceptInvitationSchema = z.object({
  password: z.string().min(12, 'Пароль должен быть не короче 12 символов'),
});

/**
 * Ответ на первый шаг входа.
 *
 * Размеченное объединение, а не необязательные поля: клиент обязан
 * различить готовую сессию и требование второго фактора (спека 8).
 */
export const loginResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('session') }),
  z.object({ kind: z.literal('totp_required'), challengeToken: z.string() }),
]);

/** Текущий пользователь. */
export const currentSubjectSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  isSuperadmin: z.boolean(),
  isTotpEnabled: z.boolean(),
});

/** Данные первого шага входа. */
export type LoginInput = z.infer<typeof loginSchema>;

/** Данные второго шага входа. */
export type TotpInput = z.infer<typeof totpSchema>;

/** Данные установки пароля. */
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

/** Ответ на первый шаг входа. */
export type LoginResponse = z.infer<typeof loginResponseSchema>;

/** Текущий пользователь. */
export type CurrentSubjectResponse = z.infer<typeof currentSubjectSchema>;
```

- [ ] **Step 4: Дополнить `packages/shared/src/index.ts`**

```typescript
export * from './enums';
export * from './schemas/auth';
export * from './schemas/grant';
export * from './schemas/project';
```

- [ ] **Step 5: Запустить тест и пересобрать пакет**

```bash
pnpm --filter @cairn/shared test
pnpm --filter @cairn/shared build
```

Expected: PASS, 13 тестов; сборка без ошибок.

- [ ] **Step 6: Коммит**

```bash
git add packages/shared/src
git commit -m "Добавить схемы контракта для аутентификации"
```

---

### Task 28: Контроллер аутентификации

**Files:**
- Create: `apps/api/src/auth/auth.controller.ts`, `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/auth.e2e.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/test/auth.e2e.test.ts`**

Первый сквозной тест: проверяет не сервис, а поведение по HTTP — коды ответов и cookie. Именно они видны браузеру, и именно в них проявляются ошибки склейки контроллера с сервисом.

```typescript
import { SubjectKind } from '@cairn/shared';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuthModule } from '../src/auth/auth.module';
import { PasswordService } from '../src/auth/password.service';
import { SESSION_COOKIE } from '../src/auth/session.cookie';
import { DATABASE } from '../src/db/db.module';
import { subjects, users } from '../src/db/schema';
import { startTestDatabase, type TestDatabase } from './db-fixture';

describe('аутентификация по HTTP', () => {
  let testDb: TestDatabase;
  let app: INestApplication;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    const moduleRef = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(DATABASE)
      .useValue(testDb.db)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();

    await testDb.db.insert(users).values({
      subjectId: subject!.id,
      email: 'user@cairn.local',
      passwordHash: await new PasswordService().hash('очень длинный пароль'),
    });
  });

  it('ставит cookie при успешном входе', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'user@cairn.local', password: 'очень длинный пароль' })
      .expect(200);

    const cookies = response.headers['set-cookie'] as unknown as string[];

    expect(cookies.some((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))).toBe(true);
  });

  it('делает cookie недоступной скриптам', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'user@cairn.local', password: 'очень длинный пароль' })
      .expect(200);

    const cookies = response.headers['set-cookie'] as unknown as string[];
    const session = cookies.find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));

    expect(session).toContain('HttpOnly');
    expect(session).toContain('SameSite=Lax');
  });

  it('отвечает 401 при неверном пароле', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'user@cairn.local', password: 'не тот' })
      .expect(401);
  });

  it('отвечает 400 при некорректном теле запроса', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'не адрес', password: '' })
      .expect(400);
  });

  it('не пускает на защищённый маршрут без cookie', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('пускает на защищённый маршрут с cookie', async () => {
    const agent = request.agent(app.getHttpServer());

    await agent
      .post('/auth/login')
      .send({ email: 'user@cairn.local', password: 'очень длинный пароль' })
      .expect(200);

    const response = await agent.get('/auth/me').expect(200);

    expect(response.body).toMatchObject({ label: 'user@cairn.local', isSuperadmin: false });
  });

  it('закрывает доступ после выхода', async () => {
    const agent = request.agent(app.getHttpServer());

    await agent
      .post('/auth/login')
      .send({ email: 'user@cairn.local', password: 'очень длинный пароль' })
      .expect(200);
    await agent.post('/auth/logout').expect(204);

    await agent.get('/auth/me').expect(401);
  });
});
```

- [ ] **Step 2: Установить supertest**

Run: `pnpm --filter @cairn/api add -D supertest @types/supertest`
Expected: пакеты добавлены в `devDependencies`.

- [ ] **Step 3: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test test/auth.e2e`
Expected: FAIL — «Failed to resolve import "../src/auth/auth.module"».

- [ ] **Step 4: Создать `apps/api/src/auth/auth.controller.ts`**

```typescript
import {
  loginSchema,
  totpVerifySchema,
  type CurrentSubjectResponse,
  type LoginResponse,
} from '@cairn/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import type { RequestSubject } from '../access/access.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';
import { CurrentSubject } from './current-subject.decorator';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from './session.cookie';
import { SessionGuard } from './session.guard';
import { SessionsRepository } from './sessions.repository';

/** Вход, выход и второй фактор (спека 8). */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsRepository,
  ) {}

  /**
   * Первый шаг входа.
   *
   * Возвращает либо признак выданной сессии, либо челлендж второго фактора.
   * Сама сессия уходит в cookie, а не в тело ответа: токен не должен быть
   * доступен скриптам страницы.
   */
  @Post('login')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(
    @Body() body: { email: string; password: string },
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const outcome = await this.auth.login(body.email, body.password, originOf(request));

    if (outcome.kind === 'session') {
      response.cookie(SESSION_COOKIE, outcome.token, SESSION_COOKIE_OPTIONS);

      return { kind: 'session' };
    }

    return { kind: 'totp_required', challengeToken: outcome.challengeToken };
  }

  /** Второй шаг входа: обмен челленджа и кода на сессию. */
  @Post('totp')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(totpVerifySchema))
  async verifyTotp(
    @Body() body: { challengeToken: string; code: string },
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ kind: 'session' }> {
    const token = await this.auth.verifyTotp(body.challengeToken, body.code, originOf(request));

    response.cookie(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);

    return { kind: 'session' };
  }

  /** Выход: отзыв сессии и удаление cookie. */
  @Post('logout')
  @HttpCode(204)
  @UseGuards(SessionGuard)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = request.cookies?.[SESSION_COOKIE];

    if (token) {
      await this.sessions.revoke(this.sessions.connection, token);
    }

    response.clearCookie(SESSION_COOKIE, SESSION_COOKIE_OPTIONS);
  }

  /** Текущий пользователь. */
  @Get('me')
  @UseGuards(SessionGuard)
  async me(@CurrentSubject() subject: RequestSubject): Promise<CurrentSubjectResponse> {
    return this.auth.describeSubject(subject);
  }
}

/** Достаёт источник запроса для записи в сессию. */
function originOf(request: Request): { ip?: string; userAgent?: string } {
  return { ip: request.ip, userAgent: request.get('user-agent') ?? undefined };
}
```

Токен сессии уходит только в cookie и никогда в тело ответа: значение, доступное скриптам страницы, перестало бы защищать `httpOnly`.

- [ ] **Step 5: Дополнить `apps/api/src/auth/sessions.repository.ts` и `auth.service.ts`**

В `SessionsRepository` добавь геттер, чтобы контроллер мог отозвать сессию без отдельной транзакции:

```typescript
  /** Подключение для операций, не требующих транзакции. */
  get connection(): Database {
    return this.db;
  }
```

В `AuthService` добавь метод описания субъекта:

```typescript
  /** Описывает текущего пользователя для интерфейса. */
  async describeSubject(subject: RequestSubject): Promise<CurrentSubjectResponse> {
    const [user] = await this.db
      .select({ isTotpEnabled: users.isTotpEnabled })
      .from(users)
      .where(eq(users.subjectId, subject.id))
      .limit(1);

    return {
      id: subject.id,
      label: subject.label,
      isSuperadmin: subject.isSuperadmin,
      isTotpEnabled: user?.isTotpEnabled ?? false,
    };
  }
```

Импорты в `auth.service.ts` дополни: `import type { CurrentSubjectResponse } from '@cairn/shared';` и `import type { RequestSubject } from '../access/access.types';`.

- [ ] **Step 6: Создать `apps/api/src/auth/auth.module.ts`**

```typescript
import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { CryptoModule } from '../crypto/crypto.module';
import { DbModule } from '../db/db.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginAttemptsService } from './login-attempts.service';
import { PasswordService } from './password.service';
import { SessionGuard } from './session.guard';
import { SessionsRepository } from './sessions.repository';
import { TotpService } from './totp.service';

/** Модуль аутентификации. */
@Module({
  imports: [DbModule, CryptoModule, AuditModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TotpService,
    SessionsRepository,
    LoginAttemptsService,
    SessionGuard,
  ],
  exports: [SessionGuard, SessionsRepository, PasswordService, TotpService],
})
export class AuthModule {}
```

- [ ] **Step 7: Подключить модуль в `apps/api/src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';

import { AccessModule } from './access/access.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CryptoModule } from './crypto/crypto.module';
import { DbModule } from './db/db.module';

/** Корневой модуль приложения. */
@Module({
  imports: [DbModule, CryptoModule, AuditModule, AccessModule, AuthModule],
})
export class AppModule {}
```

- [ ] **Step 8: Запустить тест**

Run: `pnpm --filter @cairn/api test test/auth.e2e`
Expected: PASS, 7 тестов.

- [ ] **Step 9: Запустить все тесты и проверку типов**

```bash
pnpm test
pnpm typecheck
```

Expected: без ошибок. Нужен работающий Docker.

- [ ] **Step 10: Коммит**

```bash
git add apps/api/src pnpm-lock.yaml apps/api/package.json
git commit -m "Добавить контроллер аутентификации"
```

---

**Результат чанка 7:** браузер входит в систему, получает cookie и ходит по защищённым маршрутам; тело запроса проверяется схемами контракта. Следующий чанк добавляет приглашения, сброс пароля и команды консоли.

## Chunk 8: Приглашения и сброс пароля

Результат чанка: пользователи появляются по приглашению, пароль сбрасывается тем же механизмом, ссылка не даёт обойти второй фактор.

### Task 29: Создание приглашения

Три исхода различаются по существу, поэтому вынесены в отдельную задачу (спека 4.6).

**Files:**
- Create: `apps/api/src/invitations/invitations.service.ts`, `apps/api/src/invitations/invitations.types.ts`
- Test: `apps/api/src/invitations/invitations.service.test.ts`

- [ ] **Step 1: Создать `apps/api/src/invitations/invitations.types.ts`**

```typescript
/** Выданная одноразовая ссылка. */
export interface IssuedLink {
  /** Токен в открытом виде. Показывается суперадмину один раз и не хранится. */
  token: string;
  /** Идентификатор пользователя, которому она выдана. */
  userId: string;
  /** Момент истечения. */
  expiresAt: Date;
}
```

- [ ] **Step 2: Написать падающий тест `apps/api/src/invitations/invitations.service.test.ts`**

```typescript
import { InvitationKind, SubjectKind } from '@cairn/shared';
import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { PasswordService } from '../auth/password.service';
import { SessionsRepository } from '../auth/sessions.repository';
import { hashToken } from '../auth/token';
import { InvitationsService } from './invitations.service';
import { auditLog, invitations, subjects, users } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('InvitationsService.invite', () => {
  let testDb: TestDatabase;
  let service: InvitationsService;
  let admin: { id: string; subjectId: string };

  beforeAll(async () => {
    testDb = await startTestDatabase();
    service = new InvitationsService(
      testDb.db,
      new PasswordService(),
      new SessionsRepository(testDb.db),
      new AuditService(),
    );
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    const [user] = await testDb.db
      .insert(users)
      .values({ subjectId: subject!.id, email: 'admin@cairn.local', isSuperadmin: true })
      .returning();

    admin = { id: user!.id, subjectId: subject!.id };
  });

  const actor = () => ({ id: admin.subjectId, label: 'admin@cairn.local', userId: admin.id });

  describe('неизвестный адрес', () => {
    it('создаёт субъект, пользователя и ссылку', async () => {
      const link = await service.invite(actor(), 'new@cairn.local');

      expect(link.token).toBeTruthy();
      expect(await testDb.db.select().from(users)).toHaveLength(2);
    });

    it('создаёт субъект сразу, чтобы доступы можно было выдать заранее', async () => {
      // Матрица доступов должна быть полной до первого входа (спека 4.6).
      await service.invite(actor(), 'new@cairn.local');

      expect(await testDb.db.select().from(subjects)).toHaveLength(2);
    });

    it('не хранит токен открытым', async () => {
      const link = await service.invite(actor(), 'new@cairn.local');

      const [stored] = await testDb.db.select().from(invitations);

      expect(stored?.tokenHash).toBe(hashToken(link.token));
      expect(stored?.tokenHash).not.toBe(link.token);
    });

    it('помечает ссылку как приглашение', async () => {
      await service.invite(actor(), 'new@cairn.local');

      const [stored] = await testDb.db.select().from(invitations);

      expect(stored?.kind).toBe(InvitationKind.Invitation);
    });

    it('пишет создание в журнал', async () => {
      await service.invite(actor(), 'new@cairn.local');

      const [entry] = await testDb.db.select().from(auditLog);

      expect(entry?.action).toBe(AuditAction.InvitationCreated);
    });
  });

  describe('адрес известен, пароль не задан', () => {
    it('переиспользует пользователя и выдаёт новую ссылку', async () => {
      await service.invite(actor(), 'new@cairn.local');
      await service.invite(actor(), 'new@cairn.local');

      expect(await testDb.db.select().from(users)).toHaveLength(2);
      expect(await testDb.db.select().from(invitations)).toHaveLength(2);
    });

    it('гасит предыдущую ссылку', async () => {
      // Иначе две живые ссылки на одну учётную запись расширяют поверхность атаки.
      const first = await service.invite(actor(), 'new@cairn.local');
      await service.invite(actor(), 'new@cairn.local');

      expect(await service.findUsableLink(first.token)).toBeNull();
    });

    it('пишет повторную выдачу отдельным событием', async () => {
      // Спека 7.2 требует различать создание и повторную выдачу.
      await service.invite(actor(), 'new@cairn.local');
      await service.invite(actor(), 'new@cairn.local');

      const entries = await testDb.db.select().from(auditLog);

      expect(entries.map((entry) => entry.action)).toEqual([
        AuditAction.InvitationCreated,
        AuditAction.InvitationReissued,
      ]);
    });
  });

  describe('адрес известен, пользователь активен', () => {
    it('отклоняет приглашение', async () => {
      // Молчаливое превращение приглашения в сброс обнулило бы пароль
      // работающему человеку (спека 4.6).
      const link = await service.invite(actor(), 'new@cairn.local');
      await service.acceptLink(link.token, 'очень длинный пароль', {});

      await expect(service.invite(actor(), 'new@cairn.local')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('сообщает, что нужен сброс пароля', async () => {
      const link = await service.invite(actor(), 'new@cairn.local');
      await service.acceptLink(link.token, 'очень длинный пароль', {});

      await expect(service.invite(actor(), 'new@cairn.local')).rejects.toThrow(/сброс/i);
    });
  });
});
```

- [ ] **Step 3: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/invitations`
Expected: FAIL — «Failed to resolve import "./invitations.service"».

- [ ] **Step 4: Создать `apps/api/src/invitations/invitations.service.ts`**

Файл получится крупным, поэтому в нём только работа со ссылками: создание, поиск, приём. Управление пользователями живёт в отдельном модуле следующего чанка.

```typescript
import { AuditSubjectKind, InvitationKind, SubjectKind } from '@cairn/shared';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';

import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { PasswordService } from '../auth/password.service';
import { SessionsRepository, type SessionOrigin } from '../auth/sessions.repository';
import { generateToken, hashToken } from '../auth/token';
import { DATABASE } from '../db/db.module';
import type { Database, Executor } from '../db/db.types';
import { invitations, subjects, users, type Invitation, type User } from '../db/schema';
import type { IssuedLink } from './invitations.types';

/** Суперадмин, выдающий ссылку. */
export interface InvitingActor {
  /** Идентификатор его субъекта — для журнала. */
  id: string;
  label: string;
  /** Идентификатор его записи пользователя — для поля «кто пригласил». */
  userId: string;
}

/**
 * Одноразовые ссылки на установку пароля: приглашения и сбросы (спека 4.6).
 *
 * Живая ссылка возможна только у пользователя без действующего пароля.
 * Это единственный инвариант, на котором держится безопасность механизма:
 * ссылка на смену пароля активному пользователю была бы обходом входа.
 */
@Injectable()
export class InvitationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionsRepository,
    private readonly audit: AuditService,
  ) {}

  /**
   * Приглашает пользователя.
   *
   * Три исхода: неизвестный адрес — создаётся всё с нуля; известный без
   * пароля — выдаётся новая ссылка вместо прежней; активный пользователь —
   * отказ с указанием на сброс пароля.
   */
  async invite(actor: InvitingActor, email: string): Promise<IssuedLink> {
    const normalized = email.toLowerCase();

    return this.db.transaction(async (tx) => {
      const existing = await this.findUserByEmail(tx, normalized);

      if (existing?.passwordHash) {
        throw new ConflictException(
          'Пользователь с таким адресом уже работает в системе. Для смены пароля используйте сброс.',
        );
      }

      const user = existing ?? (await this.createUser(tx, normalized));
      const link = await this.issueLink(tx, user.id, InvitationKind.Invitation, actor.userId);

      await this.audit.record(
        tx,
        { kind: AuditSubjectKind.User, id: actor.id, label: actor.label },
        {
          action: existing ? AuditAction.InvitationReissued : AuditAction.InvitationCreated,
          entityType: 'user',
          entityId: user.id,
          metadata: { email: normalized },
        },
      );

      return link;
    });
  }

  /**
   * Сбрасывает пароль: обнуляет его, завершает сессии и выдаёт ссылку.
   *
   * Все три действия в одной транзакции — иначе при сбое посередине
   * пользователь остался бы без пароля и без способа его задать.
   */
  async resetPassword(actor: InvitingActor, userId: string): Promise<IssuedLink> {
    return this.db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);

      if (!user) {
        throw new NotFoundException('Пользователь не найден');
      }

      await tx.update(users).set({ passwordHash: null, updatedAt: new Date() }).where(eq(users.id, userId));

      const revokedSessions = await this.sessions.revokeAllForSubject(tx, user.subjectId);
      const link = await this.issueLink(tx, userId, InvitationKind.PasswordReset, actor.userId);

      await this.audit.record(
        tx,
        { kind: AuditSubjectKind.User, id: actor.id, label: actor.label },
        {
          action: AuditAction.PasswordResetRequested,
          entityType: 'user',
          entityId: userId,
          metadata: { revokedSessions },
        },
      );

      return link;
    });
  }

  /** Находит действующую ссылку по токену. Возвращает `null`, если она непригодна. */
  async findUsableLink(token: string): Promise<Invitation | null> {
    const [link] = await this.db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.tokenHash, hashToken(token)),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      )
      .limit(1);

    return link ?? null;
  }

  /**
   * Устанавливает пароль по ссылке.
   *
   * Возвращает токен сессии либо `null`, если у пользователя привязан второй
   * фактор: тогда вход завершается обычным челленджем, и ссылка не даёт
   * обойти вторую проверку (спека 4.6).
   */
  async acceptLink(
    token: string,
    password: string,
    origin: SessionOrigin,
  ): Promise<{ sessionToken: string | null; user: User }> {
    const link = await this.findUsableLink(token);

    if (!link) {
      throw new NotFoundException('Ссылка недействительна или уже использована');
    }

    return this.db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, link.userId)).limit(1);

      if (!user) {
        throw new NotFoundException('Пользователь не найден');
      }

      await tx
        .update(users)
        .set({ passwordHash: await this.passwords.hash(password), updatedAt: new Date() })
        .where(eq(users.id, user.id));

      await tx
        .update(invitations)
        .set({ acceptedAt: new Date() })
        .where(eq(invitations.id, link.id));

      await this.audit.record(
        tx,
        { kind: AuditSubjectKind.User, id: user.subjectId, label: user.email },
        {
          action:
            link.kind === InvitationKind.PasswordReset
              ? AuditAction.PasswordResetCompleted
              : AuditAction.InvitationAccepted,
          entityType: 'user',
          entityId: user.id,
        },
      );

      if (user.isTotpEnabled) {
        return { sessionToken: null, user };
      }

      return { sessionToken: await this.sessions.create(tx, user.subjectId, origin), user };
    });
  }

  /** Создаёт субъект и пользователя без пароля. */
  private async createUser(tx: Executor, email: string): Promise<User> {
    const [subject] = await tx
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: email })
      .returning();

    const [user] = await tx.insert(users).values({ subjectId: subject!.id, email }).returning();

    return user!;
  }

  /** Гасит прежние ссылки пользователя и выдаёт новую. */
  private async issueLink(
    tx: Executor,
    userId: string,
    kind: InvitationKind,
    invitedBy: string,
  ): Promise<IssuedLink> {
    await tx
      .update(invitations)
      .set({ expiresAt: new Date(0) })
      .where(and(eq(invitations.userId, userId), isNull(invitations.acceptedAt)));

    const token = generateToken();
    const expiresAt = new Date(
      Date.now() + (kind === InvitationKind.Invitation ? INVITATION_TTL_MS : RESET_TTL_MS),
    );

    await tx.insert(invitations).values({
      userId,
      tokenHash: hashToken(token),
      kind,
      invitedBy,
      expiresAt,
    });

    return { token, userId, expiresAt };
  }

  /** Находит пользователя по адресу. */
  private async findUserByEmail(tx: Executor, email: string): Promise<User | null> {
    const [user] = await tx.select().from(users).where(eq(users.email, email)).limit(1);

    return user ?? null;
  }
}

/** Срок жизни приглашения — 72 часа (спека 4.6). */
const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;

/** Срок жизни ссылки сброса — 4 часа: она опаснее приглашения. */
const RESET_TTL_MS = 4 * 60 * 60 * 1000;
```

- [ ] **Step 5: Запустить тест**

Run: `pnpm --filter @cairn/api test src/invitations`
Expected: PASS, 10 тестов.

- [ ] **Step 6: Коммит**

```bash
git add apps/api/src/invitations
git commit -m "Добавить создание приглашений"
```

---

### Task 30: Сброс пароля и приём ссылки

**Files:**
- Test: `apps/api/src/invitations/password-reset.test.ts`

Реализация написана в предыдущей задаче — здесь она покрывается тестами на свойства, которые легко нарушить при последующих правках.

- [ ] **Step 1: Написать тест `apps/api/src/invitations/password-reset.test.ts`**

```typescript
import { InvitationKind, SubjectKind } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { PasswordService } from '../auth/password.service';
import { SessionsRepository } from '../auth/sessions.repository';
import { InvitationsService } from './invitations.service';
import { auditLog, invitations, sessions, subjects, users } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('сброс пароля', () => {
  let testDb: TestDatabase;
  let service: InvitationsService;
  let sessionsRepository: SessionsRepository;
  let admin: { id: string; subjectId: string };
  let target: { id: string; subjectId: string };

  beforeAll(async () => {
    testDb = await startTestDatabase();
    sessionsRepository = new SessionsRepository(testDb.db);
    service = new InvitationsService(
      testDb.db,
      new PasswordService(),
      sessionsRepository,
      new AuditService(),
    );
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    const [adminUser] = await testDb.db
      .insert(users)
      .values({ subjectId: adminSubject!.id, email: 'admin@cairn.local', isSuperadmin: true })
      .returning();
    admin = { id: adminUser!.id, subjectId: adminSubject!.id };

    const [targetSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    const [targetUser] = await testDb.db
      .insert(users)
      .values({
        subjectId: targetSubject!.id,
        email: 'user@cairn.local',
        passwordHash: await new PasswordService().hash('старый пароль'),
      })
      .returning();
    target = { id: targetUser!.id, subjectId: targetSubject!.id };
  });

  const actor = () => ({ id: admin.subjectId, label: 'admin@cairn.local', userId: admin.id });

  it('обнуляет пароль', async () => {
    await service.resetPassword(actor(), target.id);

    const [user] = await testDb.db.select().from(users).where(eq(users.id, target.id));

    expect(user?.passwordHash).toBeNull();
  });

  it('завершает все сессии пользователя', async () => {
    // Иначе сброс пароля не закрывал бы уже открытый доступ (спека 4.6).
    const token = await sessionsRepository.create(testDb.db, target.subjectId, {});

    await service.resetPassword(actor(), target.id);

    expect(await sessionsRepository.findActive(token)).toBeNull();
  });

  it('не трогает сессии других пользователей', async () => {
    const adminToken = await sessionsRepository.create(testDb.db, admin.subjectId, {});

    await service.resetPassword(actor(), target.id);

    expect(await sessionsRepository.findActive(adminToken)).not.toBeNull();
  });

  it('помечает ссылку как сброс пароля', async () => {
    await service.resetPassword(actor(), target.id);

    const [link] = await testDb.db.select().from(invitations);

    expect(link?.kind).toBe(InvitationKind.PasswordReset);
  });

  it('записывает число завершённых сессий в журнал', async () => {
    await sessionsRepository.create(testDb.db, target.subjectId, {});
    await sessionsRepository.create(testDb.db, target.subjectId, {});

    await service.resetPassword(actor(), target.id);

    const [entry] = await testDb.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, AuditAction.PasswordResetRequested));

    expect(entry?.metadata).toMatchObject({ revokedSessions: 2 });
  });

  it('после сброса вход по старому паролю невозможен', async () => {
    await service.resetPassword(actor(), target.id);

    const [user] = await testDb.db.select().from(users).where(eq(users.id, target.id));

    expect(user?.passwordHash).toBeNull();
  });
});

describe('приём ссылки', () => {
  let testDb: TestDatabase;
  let service: InvitationsService;
  let admin: { id: string; subjectId: string };

  beforeAll(async () => {
    testDb = await startTestDatabase();
    service = new InvitationsService(
      testDb.db,
      new PasswordService(),
      new SessionsRepository(testDb.db),
      new AuditService(),
    );
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [subject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    const [user] = await testDb.db
      .insert(users)
      .values({ subjectId: subject!.id, email: 'admin@cairn.local', isSuperadmin: true })
      .returning();

    admin = { id: user!.id, subjectId: subject!.id };
  });

  const actor = () => ({ id: admin.subjectId, label: 'admin@cairn.local', userId: admin.id });

  it('выдаёт сессию, если второй фактор не привязан', async () => {
    const link = await service.invite(actor(), 'new@cairn.local');

    const { sessionToken } = await service.acceptLink(link.token, 'очень длинный пароль', {});

    expect(sessionToken).not.toBeNull();
  });

  it('не выдаёт сессию, если второй фактор привязан', async () => {
    // Иначе ссылка сброса стала бы обходом второго фактора (спека 4.6).
    const link = await service.invite(actor(), 'new@cairn.local');
    await testDb.db.update(users).set({ isTotpEnabled: true }).where(eq(users.id, link.userId));

    const { sessionToken } = await service.acceptLink(link.token, 'очень длинный пароль', {});

    expect(sessionToken).toBeNull();
  });

  it('гасит ссылку после использования', async () => {
    const link = await service.invite(actor(), 'new@cairn.local');
    await service.acceptLink(link.token, 'очень длинный пароль', {});

    await expect(service.acceptLink(link.token, 'другой пароль', {})).rejects.toThrow();
  });

  it('отвергает истёкшую ссылку', async () => {
    const link = await service.invite(actor(), 'new@cairn.local');
    await testDb.db.update(invitations).set({ expiresAt: new Date(0) });

    await expect(service.acceptLink(link.token, 'очень длинный пароль', {})).rejects.toThrow();
  });

  it('отвергает неизвестный токен', async () => {
    await expect(service.acceptLink('нет такого', 'очень длинный пароль', {})).rejects.toThrow();
  });
});
```

Импорт `eq` из `drizzle-orm` добавь в начало файла: `import { eq } from 'drizzle-orm';`.

- [ ] **Step 2: Запустить тест**

Run: `pnpm --filter @cairn/api test src/invitations`
Expected: PASS, 21 тест. Реализация написана в Task 29 — если тест падает, ошибка в ней, а не в отсутствии кода.

- [ ] **Step 3: Коммит**

```bash
git add apps/api/src/invitations
git commit -m "Покрыть тестами сброс пароля и приём ссылки"
```

---

**Результат чанка 8:** пользователи появляются по приглашению, пароль сбрасывается атомарно вместе с завершением сессий, ссылка не обходит второй фактор. Следующий чанк добавляет управление пользователями, команды консоли и HTTP-слой приглашений.

## Chunk 9: Пользователи и команды консоли

Результат чанка: суперадмин управляет пользователями через API, первый администратор создаётся с консоли, доступ восстанавливается без входа в систему.

### Task 31: Сервис пользователей

**Files:**
- Create: `apps/api/src/users/users.service.ts`
- Create: `packages/shared/src/schemas/user.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `apps/api/src/users/users.service.test.ts`

- [ ] **Step 1: Создать `packages/shared/src/schemas/user.ts`**

```typescript
import { z } from 'zod';

import { InvitationKind, SubjectKind } from '../enums.js';

/**
 * Пользователь в списке.
 *
 * Состояние «нет действующего пароля» не различает приглашённого и того,
 * кому пароль сбросили; их различает вид последней выданной ссылки (спека 4.2).
 */
export const userRowSchema = z.object({
  id: z.string().uuid(),
  subjectId: z.string().uuid(),
  subjectKind: z.nativeEnum(SubjectKind),
  email: z.string().email(),
  isSuperadmin: z.boolean(),
  isTotpEnabled: z.boolean(),
  hasPassword: z.boolean(),
  isRevoked: z.boolean(),
  /** Вид последней ссылки; пусто, если ссылок не выдавалось. */
  lastLinkKind: z.nativeEnum(InvitationKind).nullable(),
  createdAt: z.string(),
});

/** Приглашение нового пользователя. */
export const inviteUserSchema = z.object({
  email: z.string().email().toLowerCase(),
});

/** Выданная ссылка. Показывается суперадмину один раз. */
export const issuedLinkSchema = z.object({
  url: z.string().url(),
  expiresAt: z.string(),
});

/** Пользователь в списке. */
export type UserRow = z.infer<typeof userRowSchema>;

/** Данные приглашения. */
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

/** Выданная ссылка. */
export type IssuedLinkResponse = z.infer<typeof issuedLinkSchema>;
```

- [ ] **Step 2: Дополнить `packages/shared/src/index.ts`**

```typescript
export * from './enums';
export * from './schemas/auth';
export * from './schemas/grant';
export * from './schemas/project';
export * from './schemas/user';
```

- [ ] **Step 3: Написать падающий тест `apps/api/src/users/users.service.test.ts`**

```typescript
import { InvitationKind, SubjectKind } from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { SessionsRepository } from '../auth/sessions.repository';
import { UsersService } from './users.service';
import { auditLog, invitations, subjects, users } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('UsersService', () => {
  let testDb: TestDatabase;
  let service: UsersService;
  let sessions: SessionsRepository;
  let admin: { userId: string; subjectId: string };
  let target: { userId: string; subjectId: string };

  beforeAll(async () => {
    testDb = await startTestDatabase();
    sessions = new SessionsRepository(testDb.db);
    service = new UsersService(testDb.db, sessions, new AuditService());
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    const [adminUser] = await testDb.db
      .insert(users)
      .values({
        subjectId: adminSubject!.id,
        email: 'admin@cairn.local',
        isSuperadmin: true,
        passwordHash: 'хэш',
      })
      .returning();
    admin = { userId: adminUser!.id, subjectId: adminSubject!.id };

    const [targetSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    const [targetUser] = await testDb.db
      .insert(users)
      .values({ subjectId: targetSubject!.id, email: 'user@cairn.local', passwordHash: 'хэш' })
      .returning();
    target = { userId: targetUser!.id, subjectId: targetSubject!.id };
  });

  const actor = () => ({ id: admin.subjectId, label: 'admin@cairn.local' });

  describe('list', () => {
    it('возвращает всех пользователей', async () => {
      expect(await service.list()).toHaveLength(2);
    });

    it('сообщает, есть ли действующий пароль', async () => {
      await testDb.db.update(users).set({ passwordHash: null }).where(eq(users.id, target.userId));

      const rows = await service.list();

      expect(rows.find((row) => row.id === target.userId)?.hasPassword).toBe(false);
    });

    it('не отдаёт хэш пароля и секрет второго фактора', async () => {
      // Секреты не попадают в списочные ответы (ТЗ 9).
      const [row] = await service.list();

      expect(JSON.stringify(row)).not.toContain('хэш');
      expect(row).not.toHaveProperty('passwordHash');
      expect(row).not.toHaveProperty('totpSecretEncrypted');
    });

    it('показывает вид последней ссылки', async () => {
      await testDb.db.insert(invitations).values({
        userId: target.userId,
        tokenHash: 'хэш-токена',
        kind: InvitationKind.PasswordReset,
        expiresAt: new Date(Date.now() + 10_000),
      });

      const rows = await service.list();

      expect(rows.find((row) => row.id === target.userId)?.lastLinkKind).toBe(
        InvitationKind.PasswordReset,
      );
    });

    it('отражает отзыв субъекта', async () => {
      await testDb.db
        .update(subjects)
        .set({ revokedAt: new Date() })
        .where(eq(subjects.id, target.subjectId));

      const rows = await service.list();

      expect(rows.find((row) => row.id === target.userId)?.isRevoked).toBe(true);
    });
  });

  describe('revoke', () => {
    it('помечает субъект отозванным', async () => {
      await service.revoke(actor(), target.userId);

      const [subject] = await testDb.db
        .select()
        .from(subjects)
        .where(eq(subjects.id, target.subjectId));

      expect(subject?.revokedAt).not.toBeNull();
    });

    it('завершает сессии отозванного', async () => {
      // Отзыв должен закрывать доступ немедленно (спека 4.5).
      const token = await sessions.create(testDb.db, target.subjectId, {});

      await service.revoke(actor(), target.userId);

      expect(await sessions.findActive(token)).toBeNull();
    });

    it('записывает число завершённых сессий в журнал', async () => {
      await sessions.create(testDb.db, target.subjectId, {});

      await service.revoke(actor(), target.userId);

      const [entry] = await testDb.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, AuditAction.SubjectRevoked));

      expect(entry?.metadata).toMatchObject({ revokedSessions: 1 });
    });

    it('не позволяет отозвать самого себя', async () => {
      // Иначе единственный суперадмин способен закрыть систему навсегда.
      await expect(service.revoke(actor(), admin.userId)).rejects.toThrow(/себя/i);
    });
  });

  describe('restore', () => {
    it('снимает отзыв', async () => {
      await service.revoke(actor(), target.userId);
      await service.restore(actor(), target.userId);

      const [subject] = await testDb.db
        .select()
        .from(subjects)
        .where(eq(subjects.id, target.subjectId));

      expect(subject?.revokedAt).toBeNull();
    });

    it('не возвращает завершённые сессии', async () => {
      // Восстановление даёт право войти заново, а не оживляет старый доступ.
      const token = await sessions.create(testDb.db, target.subjectId, {});
      await service.revoke(actor(), target.userId);
      await service.restore(actor(), target.userId);

      expect(await sessions.findActive(token)).toBeNull();
    });
  });

  describe('resetTotp', () => {
    it('снимает привязку второго фактора', async () => {
      await testDb.db
        .update(users)
        .set({ isTotpEnabled: true, totpSecretEncrypted: 'v1:a:b:c' })
        .where(eq(users.id, target.userId));

      await service.resetTotp(actor(), target.userId);

      const [user] = await testDb.db.select().from(users).where(eq(users.id, target.userId));

      expect(user?.isTotpEnabled).toBe(false);
      expect(user?.totpSecretEncrypted).toBeNull();
    });

    it('пишет сброс в журнал', async () => {
      await service.resetTotp(actor(), target.userId);

      const [entry] = await testDb.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, AuditAction.TotpReset));

      expect(entry).toBeDefined();
    });
  });
});
```

- [ ] **Step 4: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/users`
Expected: FAIL — «Failed to resolve import "./users.service"».

- [ ] **Step 5: Создать `apps/api/src/users/users.service.ts`**

```typescript
import { AuditSubjectKind, type UserRow } from '@cairn/shared';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq, isNull } from 'drizzle-orm';

import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { SessionsRepository } from '../auth/sessions.repository';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { invitations, subjects, users } from '../db/schema';

/** Суперадмин, выполняющий действие. */
export interface ManagingActor {
  /** Идентификатор его субъекта. */
  id: string;
  label: string;
}

/**
 * Управление пользователями (спека 9.1).
 *
 * Все методы доступны только суперадмину; это проверяет guard на контроллере,
 * поэтому здесь проверок прав нет (спека 8).
 */
@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly sessions: SessionsRepository,
    private readonly audit: AuditService,
  ) {}

  /**
   * Возвращает список пользователей.
   *
   * Хэш пароля и секрет второго фактора не попадают в ответ: секреты
   * не должны появляться в списочных ответах (ТЗ 9).
   */
  async list(): Promise<UserRow[]> {
    const rows = await this.db
      .select({
        id: users.id,
        subjectId: users.subjectId,
        subjectKind: subjects.kind,
        email: users.email,
        isSuperadmin: users.isSuperadmin,
        isTotpEnabled: users.isTotpEnabled,
        passwordHash: users.passwordHash,
        revokedAt: subjects.revokedAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .innerJoin(subjects, eq(subjects.id, users.subjectId))
      .orderBy(users.createdAt);

    const lastLinks = await this.lastLinkKinds();

    return rows.map((row) => ({
      id: row.id,
      subjectId: row.subjectId,
      subjectKind: row.subjectKind,
      email: row.email,
      isSuperadmin: row.isSuperadmin,
      isTotpEnabled: row.isTotpEnabled,
      hasPassword: row.passwordHash !== null,
      isRevoked: row.revokedAt !== null,
      lastLinkKind: lastLinks.get(row.id) ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** Отзывает субъект пользователя и завершает его сессии. */
  async revoke(actor: ManagingActor, userId: string): Promise<void> {
    const user = await this.requireUser(userId);

    if (user.subjectId === actor.id) {
      throw new BadRequestException(
        'Нельзя отозвать самого себя: система осталась бы без администратора.',
      );
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(subjects)
        .set({ revokedAt: new Date() })
        .where(eq(subjects.id, user.subjectId));

      const revokedSessions = await this.sessions.revokeAllForSubject(tx, user.subjectId);

      await this.audit.record(tx, this.actorFor(actor), {
        action: AuditAction.SubjectRevoked,
        entityType: 'user',
        entityId: userId,
        metadata: { revokedSessions },
      });
    });
  }

  /**
   * Снимает отзыв.
   *
   * Завершённые сессии не восстанавливаются: восстановление возвращает право
   * войти заново, а не оживляет прежний доступ.
   */
  async restore(actor: ManagingActor, userId: string): Promise<void> {
    const user = await this.requireUser(userId);

    await this.db.transaction(async (tx) => {
      await tx.update(subjects).set({ revokedAt: null }).where(eq(subjects.id, user.subjectId));

      await this.audit.record(tx, this.actorFor(actor), {
        action: AuditAction.SubjectRestored,
        entityType: 'user',
        entityId: userId,
      });
    });
  }

  /** Снимает привязку второго фактора. */
  async resetTotp(actor: ManagingActor, userId: string): Promise<void> {
    await this.requireUser(userId);

    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ isTotpEnabled: false, totpSecretEncrypted: null, updatedAt: new Date() })
        .where(eq(users.id, userId));

      await this.audit.record(tx, this.actorFor(actor), {
        action: AuditAction.TotpReset,
        entityType: 'user',
        entityId: userId,
      });
    });
  }

  /**
   * Собирает вид последней выданной ссылки по каждому пользователю.
   *
   * Нужен, чтобы отличить приглашённого от того, кому сбросили пароль:
   * в самой записи пользователя этих состояний не различить (спека 4.2).
   */
  private async lastLinkKinds(): Promise<Map<string, InvitationKind>> {
    const rows = await this.db
      .select({ userId: invitations.userId, kind: invitations.kind })
      .from(invitations)
      .where(isNull(invitations.acceptedAt))
      .orderBy(desc(invitations.createdAt));

    const byUser = new Map<string, InvitationKind>();

    for (const row of rows) {
      if (!byUser.has(row.userId)) {
        byUser.set(row.userId, row.kind);
      }
    }

    return byUser;
  }

  /** Находит пользователя либо бросает «не найдено». */
  private async requireUser(userId: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    return user;
  }

  /** Строит действующее лицо для журнала. */
  private actorFor(actor: ManagingActor): AuditActor {
    return { kind: AuditSubjectKind.User, id: actor.id, label: actor.label };
  }
}
```

Импорт из контракта дополни перечислением: `import { AuditSubjectKind, InvitationKind, type UserRow } from '@cairn/shared';`

- [ ] **Step 6: Запустить тест**

Run: `pnpm --filter @cairn/api test src/users`
Expected: PASS, 13 тестов.

- [ ] **Step 7: Коммит**

```bash
git add apps/api/src/users packages/shared/src
git commit -m "Добавить управление пользователями"
```

---

### Task 32: Команды консоли

Первый суперадмин создаётся здесь: открытый эндпоинт создания администратора, нужный ровно один раз, остался бы в системе навсегда как постоянная уязвимость (спека 6.5).

**Files:**
- Create: `apps/api/src/cli/cli.module.ts`, `apps/api/src/cli/commands.ts`, `apps/api/src/cli/main.ts`
- Modify: `apps/api/package.json`
- Test: `apps/api/src/cli/commands.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/cli/commands.test.ts`**

```typescript
import { AuditSubjectKind, SubjectKind } from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { PasswordService } from '../auth/password.service';
import { SessionsRepository } from '../auth/sessions.repository';
import { CryptoService } from '../crypto/crypto.service';
import { InvitationsService } from '../invitations/invitations.service';
import { CliCommands } from './commands';
import { auditLog, subjects, users } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('CliCommands', () => {
  let testDb: TestDatabase;
  let commands: CliCommands;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    const passwords = new PasswordService();
    const sessions = new SessionsRepository(testDb.db);

    commands = new CliCommands(
      testDb.db,
      passwords,
      new InvitationsService(testDb.db, passwords, sessions, new AuditService()),
      sessions,
      new AuditService(),
    );
  });

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();
  });

  describe('createSuperadmin', () => {
    it('создаёт субъект и пользователя с признаком суперадмина', async () => {
      await commands.createSuperadmin('admin@cairn.local');

      const [user] = await testDb.db.select().from(users);

      expect(user?.isSuperadmin).toBe(true);
      expect(user?.email).toBe('admin@cairn.local');
    });

    it('возвращает ссылку на установку пароля', async () => {
      // Пароль не передаётся аргументом команды: он остался бы в истории оболочки.
      const link = await commands.createSuperadmin('admin@cairn.local');

      expect(link.token).toBeTruthy();
    });

    it('пишет действие в журнал как системное', async () => {
      // У действия с консоли нет субъекта (спека 4.7).
      await commands.createSuperadmin('admin@cairn.local');

      const [entry] = await testDb.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, AuditAction.SuperadminCreated));

      expect(entry?.subjectId).toBeNull();
      expect(entry?.subjectKind).toBe(AuditSubjectKind.System);
      expect(entry?.subjectLabel).toContain('cli');
    });

    it('отказывается создавать второго с тем же адресом', async () => {
      await commands.createSuperadmin('admin@cairn.local');

      await expect(commands.createSuperadmin('admin@cairn.local')).rejects.toThrow();
    });
  });

  describe('resetTotp', () => {
    it('снимает привязку второго фактора', async () => {
      await commands.createSuperadmin('admin@cairn.local');
      await testDb.db.update(users).set({ isTotpEnabled: true, totpSecretEncrypted: 'v1:a:b:c' });

      await commands.resetTotp('admin@cairn.local');

      const [user] = await testDb.db.select().from(users);

      expect(user?.isTotpEnabled).toBe(false);
    });

    it('пишет сброс в журнал как системное действие', async () => {
      await commands.createSuperadmin('admin@cairn.local');

      await commands.resetTotp('admin@cairn.local');

      const [entry] = await testDb.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, AuditAction.TotpReset));

      expect(entry?.subjectKind).toBe(AuditSubjectKind.System);
    });

    it('сообщает о неизвестном адресе', async () => {
      await expect(commands.resetTotp('никого@cairn.local')).rejects.toThrow(/не найден/i);
    });
  });

  describe('resetPassword', () => {
    it('обнуляет пароль и выдаёт ссылку', async () => {
      const created = await commands.createSuperadmin('admin@cairn.local');
      await testDb.db.update(users).set({ passwordHash: 'хэш' });
      expect(created.token).toBeTruthy();

      const link = await commands.resetPassword('admin@cairn.local');

      const [user] = await testDb.db.select().from(users);

      expect(user?.passwordHash).toBeNull();
      expect(link.token).toBeTruthy();
    });

    it('завершает сессии', async () => {
      await commands.createSuperadmin('admin@cairn.local');
      const [subject] = await testDb.db.select().from(subjects);
      const sessions = new SessionsRepository(testDb.db);
      const token = await sessions.create(testDb.db, subject!.id, {});

      await commands.resetPassword('admin@cairn.local');

      expect(await sessions.findActive(token)).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/cli`
Expected: FAIL — «Failed to resolve import "./commands"».

- [ ] **Step 3: Создать `apps/api/src/cli/commands.ts`**

```typescript
import { AuditSubjectKind, InvitationKind, SubjectKind } from '@cairn/shared';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { PasswordService } from '../auth/password.service';
import { SessionsRepository } from '../auth/sessions.repository';
import { generateToken, hashToken } from '../auth/token';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { invitations, subjects, users } from '../db/schema';
import { InvitationsService } from '../invitations/invitations.service';
import type { IssuedLink } from '../invitations/invitations.types';

/**
 * Команды консоли (спека 6.5, 6.6).
 *
 * Требуют доступа к серверу, то есть уже предполагают владение машиной,
 * и потому не ослабляют модель безопасности. Каждый вызов пишется в журнал
 * как системное действие — у него нет субъекта.
 */
@Injectable()
export class CliCommands {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly passwords: PasswordService,
    private readonly invitationsService: InvitationsService,
    private readonly sessions: SessionsRepository,
    private readonly audit: AuditService,
  ) {}

  /**
   * Создаёт первого суперадмина и возвращает ссылку на установку пароля.
   *
   * Пароль не принимается аргументом: он остался бы в истории оболочки
   * и в списке процессов.
   */
  async createSuperadmin(email: string): Promise<IssuedLink> {
    const normalized = email.toLowerCase();

    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(users)
        .where(eq(users.email, normalized))
        .limit(1);

      if (existing) {
        throw new ConflictException(`Пользователь ${normalized} уже существует`);
      }

      const [subject] = await tx
        .insert(subjects)
        .values({ kind: SubjectKind.User, label: normalized })
        .returning();

      const [user] = await tx
        .insert(users)
        .values({ subjectId: subject!.id, email: normalized, isSuperadmin: true })
        .returning();

      const link = await this.issueLink(tx, user!.id, InvitationKind.Invitation);

      await this.audit.record(tx, systemActor('cli create-superadmin'), {
        action: AuditAction.SuperadminCreated,
        entityType: 'user',
        entityId: user!.id,
        metadata: { email: normalized },
      });

      return link;
    });
  }

  /** Снимает привязку второго фактора. */
  async resetTotp(email: string): Promise<void> {
    const user = await this.requireUser(email);

    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ isTotpEnabled: false, totpSecretEncrypted: null, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      await this.audit.record(tx, systemActor('cli reset-totp'), {
        action: AuditAction.TotpReset,
        entityType: 'user',
        entityId: user.id,
      });
    });
  }

  /**
   * Обнуляет пароль, завершает сессии и выдаёт ссылку.
   *
   * Выполняет ту же транзакцию, что и сброс через интерфейс (спека 4.6),
   * но не требует находиться в системе — этим и решается тупик, когда
   * единственный суперадмин потерял пароль.
   */
  async resetPassword(email: string): Promise<IssuedLink> {
    const user = await this.requireUser(email);

    return this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash: null, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      const revokedSessions = await this.sessions.revokeAllForSubject(tx, user.subjectId);
      const link = await this.issueLink(tx, user.id, InvitationKind.PasswordReset);

      await this.audit.record(tx, systemActor('cli reset-password'), {
        action: AuditAction.PasswordResetRequested,
        entityType: 'user',
        entityId: user.id,
        metadata: { revokedSessions },
      });

      return link;
    });
  }

  /**
   * Выдаёт одноразовую ссылку, погасив прежние.
   *
   * Повторяет логику одноимённого метода сервиса приглашений намеренно:
   * тот требует пригласившего пользователя, а у действия с консоли его нет.
   * Выносить общий код в третье место ради двух вызовов не стоит — связь
   * между ними и так закреплена тестами на обеих сторонах.
   */
  private async issueLink(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    userId: string,
    kind: InvitationKind,
  ): Promise<IssuedLink> {
    await tx
      .update(invitations)
      .set({ expiresAt: new Date(0) })
      .where(eq(invitations.userId, userId));

    const token = generateToken();
    const expiresAt = new Date(Date.now() + LINK_TTL_MS);

    await tx.insert(invitations).values({
      userId,
      tokenHash: hashToken(token),
      kind,
      expiresAt,
    });

    return { token, userId, expiresAt };
  }

  /** Находит пользователя по адресу либо сообщает, что его нет. */
  private async requireUser(email: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!user) {
      throw new NotFoundException(`Пользователь ${email} не найден`);
    }

    return user;
  }
}

/** Строит действующее лицо для действия с консоли. */
function systemActor(command: string) {
  return { kind: AuditSubjectKind.System as const, id: null, label: command };
}

/** Срок жизни ссылки, выданной с консоли, — сутки. */
const LINK_TTL_MS = 24 * 60 * 60 * 1000;
```

Поле `invitedBy` у таких ссылок пустое: приглашающего пользователя нет, действие выполнено с консоли. Именно поэтому колонка объявлена обнуляемой в чанке 2.

- [ ] **Step 4: Запустить тест**

Run: `pnpm --filter @cairn/api test src/cli`
Expected: PASS, 9 тестов.

- [ ] **Step 5: Создать `apps/api/src/cli/cli.module.ts`**

```typescript
import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CryptoModule } from '../crypto/crypto.module';
import { DbModule } from '../db/db.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { CliCommands } from './commands';

/** Модуль команд консоли. Контроллеров не имеет: HTTP здесь не поднимается. */
@Module({
  imports: [DbModule, CryptoModule, AuditModule, AuthModule, InvitationsModule],
  providers: [CliCommands],
  exports: [CliCommands],
})
export class CliModule {}
```

- [ ] **Step 6: Создать `apps/api/src/cli/main.ts`**

```typescript
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { loadEnv } from '../env';
import { CliModule } from './cli.module';
import { CliCommands } from './commands';

/**
 * Точка входа команд консоли.
 *
 * Поднимается контекст приложения без HTTP-сервера: команды пользуются
 * теми же сервисами, что и API, и потому пишут в журнал одинаково.
 */
async function main(): Promise<void> {
  loadEnv();

  const [command, email] = process.argv.slice(2);

  if (!command || !email) {
    process.stderr.write(USAGE);
    process.exit(1);
  }

  const context = await NestFactory.createApplicationContext(CliModule, { logger: ['error'] });
  const commands = context.get(CliCommands);
  const webUrl = process.env.CAIRN_WEB_URL ?? 'http://localhost:3000';

  try {
    switch (command) {
      case 'create-superadmin': {
        const link = await commands.createSuperadmin(email);
        process.stdout.write(formatLink(webUrl, link.token, 'Суперадмин создан'));
        break;
      }

      case 'reset-password': {
        const link = await commands.resetPassword(email);
        process.stdout.write(formatLink(webUrl, link.token, 'Пароль сброшен'));
        break;
      }

      case 'reset-totp': {
        await commands.resetTotp(email);
        process.stdout.write('Второй фактор отвязан. Пользователь сможет привязать его заново.\n');
        break;
      }

      default:
        process.stderr.write(USAGE);
        process.exitCode = 1;
    }
  } finally {
    await context.close();
  }
}

/** Печатает ссылку, по которой человек задаст пароль. */
function formatLink(webUrl: string, token: string, title: string): string {
  return `${title}.\nСсылка на установку пароля (передайте её лично):\n${webUrl}/invite/${token}\n`;
}

const USAGE = `Использование:
  pnpm --filter @cairn/api cli create-superadmin <email>
  pnpm --filter @cairn/api cli reset-password <email>
  pnpm --filter @cairn/api cli reset-totp <email>
`;

void main();
```

- [ ] **Step 7: Добавить скрипт в `apps/api/package.json`**

```json
    "cli": "tsx src/cli/main.ts",
```

- [ ] **Step 8: Проверить команду вручную**

```bash
docker compose up -d --wait postgres
pnpm --filter @cairn/api cli create-superadmin admin@example.com
```

Expected: выводится ссылка вида `http://localhost:3000/invite/<токен>`. Повторный запуск с тем же адресом завершается сообщением о существующем пользователе.

- [ ] **Step 9: Коммит**

```bash
git add apps/api/src/cli apps/api/package.json
git commit -m "Добавить команды консоли"
```

---

**Результат чанка 9:** суперадмин управляет пользователями, первый администратор создаётся с консоли, потеря пароля или устройства со вторым фактором больше не запирает систему. Следующий чанк добавляет HTTP-слой проектов, выдач, пользователей и журнала.

## Chunk 10: HTTP-слой проектов и выдач

Результат чанка: проекты и доступы управляются по HTTP, каждое изменение попадает в журнал в одной транзакции с ним.

### Task 33: Сервис проектов

Репозиторий отвечает за данные и права, сервис — за журналирование. Разделение нужно, чтобы репозиторий оставался вызываемым из тестов и будущего MCP-сервера без обязательной записи в журнал.

**Files:**
- Create: `apps/api/src/projects/projects.service.ts`
- Test: `apps/api/src/projects/projects.service.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/projects/projects.service.test.ts`**

```typescript
import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import { InsufficientLevelError } from '../access/access.errors';
import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { ProjectsRepository } from './projects.repository';
import { ProjectsService } from './projects.service';
import { auditLog, grants, projects, subjects, users } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('ProjectsService', () => {
  let testDb: TestDatabase;
  let service: ProjectsService;
  let subjectId: string;
  let adminSubjectId: string;
  let adminUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    const access = new AccessService(testDb.db);
    service = new ProjectsService(
      testDb.db,
      new ProjectsRepository(testDb.db, access),
      new AuditService(),
    );
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
    adminSubjectId = adminSubject!.id;

    const [admin] = await testDb.db
      .insert(users)
      .values({ subjectId: adminSubjectId, email: 'admin@cairn.local', isSuperadmin: true })
      .returning();
    adminUserId = admin!.id;
  });

  const contractor = (): RequestSubject => ({
    id: subjectId,
    kind: SubjectKind.User,
    label: 'подрядчик',
    isSuperadmin: false,
    isRevoked: false,
  });

  const admin = (): RequestSubject => ({
    id: adminSubjectId,
    kind: SubjectKind.User,
    label: 'админ',
    isSuperadmin: true,
    isRevoked: false,
  });

  describe('create', () => {
    it('создаёт проект и пишет действие в журнал', async () => {
      const created = await service.create(admin(), { name: 'Новый проект' });

      const [entry] = await testDb.db.select().from(auditLog);

      expect(created.name).toBe('Новый проект');
      expect(entry?.action).toBe(AuditAction.ProjectCreated);
      expect(entry?.projectId).toBe(created.id);
    });

    it('не создаёт проект без записи в журнал', async () => {
      // Транзакция общая: либо есть и проект, и след, либо нет ничего (спека 7.3).
      await service.create(admin(), { name: 'Новый проект' });

      expect(await testDb.db.select().from(projects)).toHaveLength(1);
      expect(await testDb.db.select().from(auditLog)).toHaveLength(1);
    });

    it('отказывает не-суперадмину и ничего не пишет в журнал', async () => {
      await expect(service.create(contractor(), { name: 'Чужой' })).rejects.toBeInstanceOf(
        InsufficientLevelError,
      );

      expect(await testDb.db.select().from(auditLog)).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('изменяет проект и пишет действие в журнал', async () => {
      const created = await service.create(admin(), { name: 'Проект' });
      await testDb.db.insert(grants).values({
        subjectId,
        projectId: created.id,
        section: Section.Info,
        level: AccessLevel.Write,
        grantedBy: adminUserId,
      });

      await service.update(contractor(), created.id, { name: 'Переименован' });

      const [entry] = await testDb.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, AuditAction.ProjectUpdated));

      expect(entry?.projectId).toBe(created.id);
    });

    it('записывает, какие поля изменились', async () => {
      // Журнал должен отвечать на вопрос «что именно поменяли», иначе
      // расследование инцидента упирается в пустую запись.
      const created = await service.create(admin(), { name: 'Проект' });

      await service.update(admin(), created.id, { name: 'Переименован', notes: 'заметка' });

      const [entry] = await testDb.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, AuditAction.ProjectUpdated));

      expect(entry?.metadata).toMatchObject({ fields: ['name', 'notes'] });
    });

    it('не записывает значения изменённых полей', async () => {
      // В журнал попадают имена полей, но не содержимое: на будущих этапах
      // тем же путём пойдут секреты (ТЗ 9).
      const created = await service.create(admin(), { name: 'Проект' });

      await service.update(admin(), created.id, { notes: 'секретная заметка' });

      const [entry] = await testDb.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, AuditAction.ProjectUpdated));

      expect(JSON.stringify(entry?.metadata)).not.toContain('секретная заметка');
    });

    it('при отказе в правах ничего не пишет в журнал', async () => {
      const created = await service.create(admin(), { name: 'Проект' });
      await testDb.db.delete(auditLog);

      await expect(service.update(contractor(), created.id, { name: 'Чужое' })).rejects.toThrow();

      expect(await testDb.db.select().from(auditLog)).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/projects/projects.service`
Expected: FAIL — «Failed to resolve import "./projects.service"».

- [ ] **Step 3: Создать `apps/api/src/projects/projects.service.ts`**

```typescript
import {
  AuditSubjectKind,
  type ProjectCreate,
  type ProjectDetail,
  type ProjectMetadata,
  type ProjectUpdate,
} from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import type { Project } from '../db/schema';
import { ProjectsRepository } from './projects.repository';

/**
 * Проекты: изменения вместе с журналированием.
 *
 * Права проверяет репозиторий — он единственный путь к данным (спека 5.4).
 * Сервис добавляет к этому запись в журнал в той же транзакции (спека 7.3).
 */
@Injectable()
export class ProjectsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: ProjectsRepository,
    private readonly audit: AuditService,
  ) {}

  /** Возвращает список видимых субъекту проектов. */
  async list(subject: RequestSubject): Promise<ProjectMetadata[]> {
    return this.repository.findVisible(subject);
  }

  /** Возвращает проект в проекции, соответствующей уровню доступа. */
  async findById(
    subject: RequestSubject,
    projectId: string,
  ): Promise<ProjectMetadata | ProjectDetail> {
    return this.repository.findById(subject, projectId);
  }

  /** Создаёт проект. Право проверяет репозиторий. */
  async create(subject: RequestSubject, input: ProjectCreate): Promise<Project> {
    return this.db.transaction(async (tx) => {
      const created = await this.repository.create(subject, tx, input);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.ProjectCreated,
        entityType: 'project',
        entityId: created.id,
        projectId: created.id,
        metadata: { name: created.name },
      });

      return created;
    });
  }

  /**
   * Изменяет проект.
   *
   * В журнал попадают имена изменённых полей, но не их значения: на этапе 4
   * тем же путём пойдут переменные окружения, и запись значений в журнал
   * свела бы на нет их шифрование (ТЗ 9).
   */
  async update(
    subject: RequestSubject,
    projectId: string,
    input: ProjectUpdate,
  ): Promise<Project> {
    return this.db.transaction(async (tx) => {
      const updated = await this.repository.update(subject, tx, projectId, input);

      await this.audit.record(tx, actorOf(subject), {
        action: AuditAction.ProjectUpdated,
        entityType: 'project',
        entityId: projectId,
        projectId,
        metadata: { fields: Object.keys(input) },
      });

      return updated;
    });
  }
}

/** Строит действующее лицо журнала из субъекта запроса. */
function actorOf(subject: RequestSubject): AuditActor {
  return {
    kind: subject.kind as unknown as Exclude<AuditSubjectKind, AuditSubjectKind.System>,
    id: subject.id,
    label: subject.label,
  };
}
```

Приведение типа в `actorOf` нужно потому, что `SubjectKind` и `AuditSubjectKind` — намеренно разные перечисления (спека 4.7). Значения первых трёх вариантов совпадают, а `system` в субъекте запроса появиться не может: у действий с консоли запроса нет.

- [ ] **Step 4: Запустить тест**

Run: `pnpm --filter @cairn/api test src/projects/projects.service`
Expected: PASS, 7 тестов.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/projects
git commit -m "Добавить сервис проектов с журналированием"
```

---

### Task 34: Контроллер проектов

**Files:**
- Create: `apps/api/src/projects/projects.controller.ts`, `apps/api/src/projects/projects.module.ts`
- Test: `apps/api/test/projects.e2e.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/test/projects.e2e.test.ts`**

Сквозной тест проверяет то, ради чего вся модель прав и существует: субъект без доступа не должен отличать закрытый проект от несуществующего.

```typescript
import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuthModule } from '../src/auth/auth.module';
import { PasswordService } from '../src/auth/password.service';
import { DATABASE } from '../src/db/db.module';
import { ProjectsModule } from '../src/projects/projects.module';
import { grants, projects, subjects, users } from '../src/db/schema';
import { startTestDatabase, type TestDatabase } from './db-fixture';

describe('проекты по HTTP', () => {
  let testDb: TestDatabase;
  let app: INestApplication;
  let projectId: string;
  let contractorSubjectId: string;
  let adminUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    const moduleRef = await Test.createTestingModule({ imports: [AuthModule, ProjectsModule] })
      .overrideProvider(DATABASE)
      .useValue(testDb.db)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const passwords = new PasswordService();
    const passwordHash = await passwords.hash('очень длинный пароль');

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    const [admin] = await testDb.db
      .insert(users)
      .values({
        subjectId: adminSubject!.id,
        email: 'admin@cairn.local',
        passwordHash,
        isSuperadmin: true,
      })
      .returning();
    adminUserId = admin!.id;

    const [contractorSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    contractorSubjectId = contractorSubject!.id;
    await testDb.db
      .insert(users)
      .values({ subjectId: contractorSubjectId, email: 'user@cairn.local', passwordHash });

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект', purpose: 'Назначение' })
      .returning();
    projectId = project!.id;
  });

  async function signIn(email: string) {
    const agent = request.agent(app.getHttpServer());

    await agent.post('/auth/login').send({ email, password: 'очень длинный пароль' }).expect(200);

    return agent;
  }

  async function grant(level: AccessLevel): Promise<void> {
    await testDb.db.insert(grants).values({
      subjectId: contractorSubjectId,
      projectId,
      section: Section.Info,
      level,
      grantedBy: adminUserId,
    });
  }

  it('без доступа отвечает 404, а не 403', async () => {
    // Существование проекта не раскрывается (ТЗ 4.2).
    const agent = await signIn('user@cairn.local');

    await agent.get(`/projects/${projectId}`).expect(404);
  });

  it('отвечает одинаково для закрытого и несуществующего проекта', async () => {
    const agent = await signIn('user@cairn.local');

    const closed = await agent.get(`/projects/${projectId}`);
    const missing = await agent.get('/projects/00000000-0000-0000-0000-000000000000');

    expect(closed.status).toBe(missing.status);
  });

  it('не показывает закрытый проект в списке', async () => {
    const agent = await signIn('user@cairn.local');

    const response = await agent.get('/projects').expect(200);

    expect(response.body).toEqual([]);
  });

  it('на уровне метаданных не отдаёт назначение', async () => {
    await grant(AccessLevel.Metadata);
    const agent = await signIn('user@cairn.local');

    const response = await agent.get(`/projects/${projectId}`).expect(200);

    expect(response.body).not.toHaveProperty('purpose');
  });

  it('на уровне чтения отдаёт назначение', async () => {
    await grant(AccessLevel.Read);
    const agent = await signIn('user@cairn.local');

    const response = await agent.get(`/projects/${projectId}`).expect(200);

    expect(response.body).toMatchObject({ purpose: 'Назначение' });
  });

  it('на уровне чтения запрещает правку с кодом 403', async () => {
    // Доступ есть, но уровень ниже нужного — отрицать существование нечего.
    await grant(AccessLevel.Read);
    const agent = await signIn('user@cairn.local');

    await agent.patch(`/projects/${projectId}`).send({ name: 'Новое имя' }).expect(403);
  });

  it('на уровне записи разрешает правку', async () => {
    await grant(AccessLevel.Write);
    const agent = await signIn('user@cairn.local');

    await agent.patch(`/projects/${projectId}`).send({ name: 'Новое имя' }).expect(200);

    const [updated] = await testDb.db.select().from(projects).where(eq(projects.id, projectId));

    expect(updated?.name).toBe('Новое имя');
  });

  it('создавать проект разрешает только суперадмину', async () => {
    await grant(AccessLevel.Write);
    const contractor = await signIn('user@cairn.local');

    await contractor.post('/projects').send({ name: 'Чужой' }).expect(403);
  });

  it('суперадмину разрешает создание', async () => {
    const admin = await signIn('admin@cairn.local');

    await admin.post('/projects').send({ name: 'Новый проект' }).expect(201);
  });

  it('суперадмин видит все проекты без выдач', async () => {
    const admin = await signIn('admin@cairn.local');

    const response = await admin.get('/projects').expect(200);

    expect(response.body).toHaveLength(1);
  });

  it('без входа отвечает 401', async () => {
    await request(app.getHttpServer()).get('/projects').expect(401);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test test/projects.e2e`
Expected: FAIL — «Failed to resolve import "../src/projects/projects.module"».

- [ ] **Step 3: Создать `apps/api/src/projects/projects.controller.ts`**

```typescript
import {
  projectCreateSchema,
  projectUpdateSchema,
  type ProjectCreate,
  type ProjectDetail,
  type ProjectMetadata,
  type ProjectUpdate,
} from '@cairn/shared';
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ProjectsService } from './projects.service';

/** Проекты и секция «Инфо» (спека 8). */
@Controller('projects')
@UseGuards(SessionGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  /** Список видимых проектов в проекции метаданных. */
  @Get()
  async list(@CurrentSubject() subject: RequestSubject): Promise<ProjectMetadata[]> {
    return this.projects.list(subject);
  }

  /** Карточка проекта в проекции, соответствующей уровню доступа. */
  @Get(':id')
  async findById(
    @CurrentSubject() subject: RequestSubject,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProjectMetadata | ProjectDetail> {
    return this.projects.findById(subject, id);
  }

  /**
   * Создаёт проект.
   *
   * Право проверяет репозиторий: guard суперадмина здесь неприменим, потому
   * что тот же контроллер обслуживает маршруты, доступные не только
   * администратору (спека 4.4).
   */
  @Post()
  async create(
    @CurrentSubject() subject: RequestSubject,
    @Body(new ZodValidationPipe(projectCreateSchema)) body: ProjectCreate,
  ): Promise<ProjectMetadata | ProjectDetail> {
    const created = await this.projects.create(subject, body);

    return this.projects.findById(subject, created.id);
  }

  /** Правит поля паспорта. Требует уровень записи. */
  @Patch(':id')
  async update(
    @CurrentSubject() subject: RequestSubject,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(projectUpdateSchema)) body: ProjectUpdate,
  ): Promise<ProjectMetadata | ProjectDetail> {
    await this.projects.update(subject, id, body);

    return this.projects.findById(subject, id);
  }
}
```

`ParseUUIDPipe` отсекает некорректные идентификаторы до обращения к базе: без него запрос с произвольной строкой дошёл бы до PostgreSQL и вернул ошибку типа вместо `400`.

- [ ] **Step 4: Создать `apps/api/src/projects/projects.module.ts`**

```typescript
import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { ProjectsController } from './projects.controller';
import { ProjectsRepository } from './projects.repository';
import { ProjectsService } from './projects.service';

/** Модуль проектов. */
@Module({
  imports: [DbModule, AccessModule, AuditModule, AuthModule],
  controllers: [ProjectsController],
  providers: [ProjectsRepository, ProjectsService],
  exports: [ProjectsRepository, ProjectsService],
})
export class ProjectsModule {}
```

- [ ] **Step 5: Запустить тест**

Run: `pnpm --filter @cairn/api test test/projects.e2e`
Expected: PASS, 11 тестов.

- [ ] **Step 6: Коммит**

```bash
git add apps/api/src/projects apps/api/test
git commit -m "Добавить контроллер проектов"
```

---

### Task 35: Сервис и контроллер выдач доступа

**Files:**
- Create: `apps/api/src/grants/grants.service.ts`, `apps/api/src/grants/grants.controller.ts`, `apps/api/src/grants/grants.module.ts`
- Test: `apps/api/test/grants.e2e.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/test/grants.e2e.test.ts`**

```typescript
import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuthModule } from '../src/auth/auth.module';
import { PasswordService } from '../src/auth/password.service';
import { DATABASE } from '../src/db/db.module';
import { GrantsModule } from '../src/grants/grants.module';
import { grants, projects, subjects, users } from '../src/db/schema';
import { startTestDatabase, type TestDatabase } from './db-fixture';

describe('выдачи доступа по HTTP', () => {
  let testDb: TestDatabase;
  let app: INestApplication;
  let projectId: string;
  let contractorSubjectId: string;
  let adminUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    const moduleRef = await Test.createTestingModule({ imports: [AuthModule, GrantsModule] })
      .overrideProvider(DATABASE)
      .useValue(testDb.db)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const passwordHash = await new PasswordService().hash('очень длинный пароль');

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    const [admin] = await testDb.db
      .insert(users)
      .values({
        subjectId: adminSubject!.id,
        email: 'admin@cairn.local',
        passwordHash,
        isSuperadmin: true,
      })
      .returning();
    adminUserId = admin!.id;

    const [contractorSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    contractorSubjectId = contractorSubject!.id;
    await testDb.db
      .insert(users)
      .values({ subjectId: contractorSubjectId, email: 'user@cairn.local', passwordHash });

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;
  });

  async function signIn(email: string) {
    const agent = request.agent(app.getHttpServer());

    await agent.post('/auth/login').send({ email, password: 'очень длинный пароль' }).expect(200);

    return agent;
  }

  it('суперадмин выдаёт доступ', async () => {
    const admin = await signIn('admin@cairn.local');

    await admin
      .put(`/projects/${projectId}/grants`)
      .send({ subjectId: contractorSubjectId, section: Section.Info, level: AccessLevel.Read })
      .expect(200);

    expect(await testDb.db.select().from(grants)).toHaveLength(1);
    expect(adminUserId).toBeDefined();
  });

  it('суперадмин отзывает доступ', async () => {
    const admin = await signIn('admin@cairn.local');

    await admin
      .put(`/projects/${projectId}/grants`)
      .send({ subjectId: contractorSubjectId, section: Section.Info, level: AccessLevel.Read })
      .expect(200);

    await admin
      .delete(`/projects/${projectId}/grants`)
      .send({ subjectId: contractorSubjectId, section: Section.Info })
      .expect(204);

    expect(await testDb.db.select().from(grants)).toHaveLength(0);
  });

  it('не-суперадмину отказывает с кодом 403', async () => {
    // Существование раздела администрирования секретом не является (спека 8).
    const contractor = await signIn('user@cairn.local');

    await contractor.get(`/projects/${projectId}/grants`).expect(403);
  });

  it('не позволяет субъекту с уровнем записи управлять выдачами', async () => {
    // Иначе владелец доступа расширил бы его себе сам (спека 4.3).
    await testDb.db.insert(grants).values({
      subjectId: contractorSubjectId,
      projectId,
      section: Section.Info,
      level: AccessLevel.Write,
      grantedBy: adminUserId,
    });
    const contractor = await signIn('user@cairn.local');

    await contractor
      .put(`/projects/${projectId}/grants`)
      .send({ subjectId: contractorSubjectId, section: Section.Docs, level: AccessLevel.Write })
      .expect(403);
  });

  it('возвращает матрицу доступов', async () => {
    const admin = await signIn('admin@cairn.local');
    await admin
      .put(`/projects/${projectId}/grants`)
      .send({ subjectId: contractorSubjectId, section: Section.Info, level: AccessLevel.Read })
      .expect(200);

    const response = await admin.get(`/projects/${projectId}/grants`).expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].levels[Section.Info]).toBe(AccessLevel.Read);
  });

  it('отвергает неизвестную секцию', async () => {
    const admin = await signIn('admin@cairn.local');

    await admin
      .put(`/projects/${projectId}/grants`)
      .send({ subjectId: contractorSubjectId, section: 'выдумка', level: AccessLevel.Read })
      .expect(400);
  });

  it('без входа отвечает 401', async () => {
    await request(app.getHttpServer()).get(`/projects/${projectId}/grants`).expect(401);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test test/grants.e2e`
Expected: FAIL — «Failed to resolve import "../src/grants/grants.module"».

- [ ] **Step 3: Создать `apps/api/src/grants/grants.service.ts`**

```typescript
import { AuditSubjectKind, type GrantMatrixRow, type GrantRevoke, type GrantSet } from '@cairn/shared';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { RequestSubject } from '../access/access.types';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActor } from '../audit/audit.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { users } from '../db/schema';
import { GrantsRepository } from './grants.repository';

/**
 * Выдачи доступа вместе с журналированием.
 *
 * Право управлять выдачами принадлежит только суперадмину и проверяется
 * guard'ом на контроллере (спека 4.3).
 */
@Injectable()
export class GrantsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: GrantsRepository,
    private readonly audit: AuditService,
  ) {}

  /** Возвращает матрицу «субъект × секция» для проекта. */
  async matrix(projectId: string): Promise<GrantMatrixRow[]> {
    return this.repository.matrixForProject(projectId);
  }

  /** Устанавливает уровень доступа. */
  async set(actor: RequestSubject, projectId: string, input: GrantSet): Promise<void> {
    const grantedBy = await this.userIdOf(actor);

    await this.db.transaction(async (tx) => {
      await this.repository.set(tx, projectId, grantedBy, input);

      await this.audit.record(tx, actorOf(actor), {
        action: AuditAction.GrantCreated,
        entityType: 'grant',
        projectId,
        metadata: { subjectId: input.subjectId, section: input.section, level: input.level },
      });
    });
  }

  /**
   * Отзывает выдачу.
   *
   * Пишет в журнал только состоявшийся отзыв: запись о снятии права,
   * которого не было, засоряет журнал и мешает расследованию.
   */
  async revoke(actor: RequestSubject, projectId: string, input: GrantRevoke): Promise<void> {
    await this.db.transaction(async (tx) => {
      const removed = await this.repository.revoke(tx, projectId, input);

      if (!removed) {
        return;
      }

      await this.audit.record(tx, actorOf(actor), {
        action: AuditAction.GrantRevoked,
        entityType: 'grant',
        projectId,
        metadata: { subjectId: input.subjectId, section: input.section },
      });
    });
  }

  /** Находит запись пользователя по субъекту: поле «кто выдал» ссылается на неё. */
  private async userIdOf(subject: RequestSubject): Promise<string> {
    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.subjectId, subject.id))
      .limit(1);

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    return user.id;
  }
}

/** Строит действующее лицо журнала из субъекта запроса. */
function actorOf(subject: RequestSubject): AuditActor {
  return {
    kind: subject.kind as unknown as Exclude<AuditSubjectKind, AuditSubjectKind.System>,
    id: subject.id,
    label: subject.label,
  };
}
```

- [ ] **Step 4: Создать `apps/api/src/grants/grants.controller.ts`**

```typescript
import {
  grantRevokeSchema,
  grantSetSchema,
  type GrantMatrixRow,
  type GrantRevoke,
  type GrantSet,
} from '@cairn/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';

import { SuperadminGuard } from '../access/superadmin.guard';
import type { RequestSubject } from '../access/access.types';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { GrantsService } from './grants.service';

/**
 * Управление доступами (спека 8).
 *
 * Весь контроллер закрыт guard'ом суперадмина: уровень доступа к самому
 * проекту здесь роли не играет.
 */
@Controller('projects/:projectId/grants')
@UseGuards(SessionGuard, SuperadminGuard)
export class GrantsController {
  constructor(private readonly grants: GrantsService) {}

  /** Матрица «субъект × секция» по проекту. */
  @Get()
  async matrix(
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<GrantMatrixRow[]> {
    return this.grants.matrix(projectId);
  }

  /** Устанавливает уровень доступа для пары «субъект × секция». */
  @Put()
  @HttpCode(200)
  async set(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(grantSetSchema)) body: GrantSet,
  ): Promise<void> {
    await this.grants.set(subject, projectId, body);
  }

  /** Отзывает выдачу по паре «субъект × секция». */
  @Delete()
  @HttpCode(204)
  async revoke(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(grantRevokeSchema)) body: GrantRevoke,
  ): Promise<void> {
    await this.grants.revoke(subject, projectId, body);
  }
}
```

- [ ] **Step 5: Создать `apps/api/src/grants/grants.module.ts`**

```typescript
import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { GrantsController } from './grants.controller';
import { GrantsRepository } from './grants.repository';
import { GrantsService } from './grants.service';

/** Модуль выдач доступа. */
@Module({
  imports: [DbModule, AccessModule, AuditModule, AuthModule],
  controllers: [GrantsController],
  providers: [GrantsRepository, GrantsService],
  exports: [GrantsRepository, GrantsService],
})
export class GrantsModule {}
```

- [ ] **Step 6: Запустить тест**

Run: `pnpm --filter @cairn/api test test/grants.e2e`
Expected: PASS, 7 тестов.

- [ ] **Step 7: Коммит**

```bash
git add apps/api/src/grants apps/api/test
git commit -m "Добавить контроллер выдач доступа"
```

---

**Результат чанка 10:** проекты и доступы управляются по HTTP, коды ответов соответствуют модели прав, каждое изменение попадает в журнал вместе с самим изменением. Следующий чанк добавляет оставшиеся маршруты и сводит матрицу доступа в единый набор тестов.

## Chunk 11: Завершение бэкенда

Результат чанка: все маршруты этапа 1 работают, приложение собирается целиком, матрица доступа из ТЗ превращена в исполняемый набор тестов.

### Task 36: Журнал действий по HTTP

**Files:**
- Create: `apps/api/src/audit/audit-query.service.ts`, `apps/api/src/audit/audit.controller.ts`
- Create: `packages/shared/src/schemas/audit.ts`
- Modify: `packages/shared/src/index.ts`, `apps/api/src/audit/audit.module.ts`
- Test: `apps/api/src/audit/audit-query.service.test.ts`

- [ ] **Step 1: Создать `packages/shared/src/schemas/audit.ts`**

```typescript
import { z } from 'zod';

import { AuditSubjectKind } from '../enums.js';

/** Фильтры журнала (спека 9.1). */
export const auditQuerySchema = z.object({
  subjectId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  action: z.string().max(100).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Запись журнала. */
export const auditEntrySchema = z.object({
  id: z.string().uuid(),
  subjectId: z.string().uuid().nullable(),
  subjectKind: z.nativeEnum(AuditSubjectKind),
  subjectLabel: z.string(),
  action: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().uuid().nullable(),
  projectId: z.string().uuid().nullable(),
  metadata: z.unknown().nullable(),
  createdAt: z.string(),
});

/** Страница журнала. */
export const auditPageSchema = z.object({
  entries: z.array(auditEntrySchema),
  total: z.number().int(),
});

/** Фильтры журнала. */
export type AuditQuery = z.infer<typeof auditQuerySchema>;

/** Запись журнала. */
export type AuditEntry = z.infer<typeof auditEntrySchema>;

/** Страница журнала. */
export type AuditPage = z.infer<typeof auditPageSchema>;
```

- [ ] **Step 2: Дополнить `packages/shared/src/index.ts`**

```typescript
export * from './enums';
export * from './schemas/audit';
export * from './schemas/auth';
export * from './schemas/grant';
export * from './schemas/project';
export * from './schemas/user';
```

- [ ] **Step 3: Написать падающий тест `apps/api/src/audit/audit-query.service.test.ts`**

```typescript
import { AuditSubjectKind, SubjectKind } from '@cairn/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditQueryService } from './audit-query.service';
import { AuditAction } from './audit.types';
import { auditLog, projects, subjects } from '../db/schema';
import { startTestDatabase, type TestDatabase } from '../../test/db-fixture';

describe('AuditQueryService', () => {
  let testDb: TestDatabase;
  let service: AuditQueryService;
  let subjectId: string;
  let projectId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    service = new AuditQueryService(testDb.db);
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
    subjectId = subject!.id;

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект' })
      .returning();
    projectId = project!.id;

    await testDb.db.insert(auditLog).values([
      {
        subjectId,
        subjectKind: AuditSubjectKind.User,
        subjectLabel: 'админ',
        action: AuditAction.ProjectCreated,
        projectId,
        createdAt: new Date('2026-01-01T10:00:00Z'),
      },
      {
        subjectId,
        subjectKind: AuditSubjectKind.User,
        subjectLabel: 'админ',
        action: AuditAction.LoginSucceeded,
        createdAt: new Date('2026-01-02T10:00:00Z'),
      },
      {
        subjectId: null,
        subjectKind: AuditSubjectKind.System,
        subjectLabel: 'cli create-superadmin',
        action: AuditAction.SuperadminCreated,
        createdAt: new Date('2026-01-03T10:00:00Z'),
      },
    ]);
  });

  it('возвращает записи от новых к старым', async () => {
    // Расследование начинают с последнего события, а не с первого.
    const page = await service.query({ limit: 50, offset: 0 });

    expect(page.entries.map((entry) => entry.action)).toEqual([
      AuditAction.SuperadminCreated,
      AuditAction.LoginSucceeded,
      AuditAction.ProjectCreated,
    ]);
  });

  it('сообщает общее число записей', async () => {
    const page = await service.query({ limit: 1, offset: 0 });

    expect(page.entries).toHaveLength(1);
    expect(page.total).toBe(3);
  });

  it('фильтрует по субъекту', async () => {
    const page = await service.query({ subjectId, limit: 50, offset: 0 });

    expect(page.total).toBe(2);
  });

  it('фильтрует по проекту', async () => {
    const page = await service.query({ projectId, limit: 50, offset: 0 });

    expect(page.total).toBe(1);
  });

  it('фильтрует по типу действия', async () => {
    const page = await service.query({
      action: AuditAction.LoginSucceeded,
      limit: 50,
      offset: 0,
    });

    expect(page.total).toBe(1);
  });

  it('фильтрует по диапазону дат', async () => {
    const page = await service.query({
      from: '2026-01-02T00:00:00.000Z',
      to: '2026-01-02T23:59:59.000Z',
      limit: 50,
      offset: 0,
    });

    expect(page.total).toBe(1);
  });

  it('отдаёт записи без субъекта', async () => {
    // Действия с консоли субъекта не имеют (спека 4.7).
    const page = await service.query({ limit: 50, offset: 0 });

    expect(page.entries[0]).toMatchObject({
      subjectId: null,
      subjectKind: AuditSubjectKind.System,
    });
  });

  it('листает страницами', async () => {
    const page = await service.query({ limit: 1, offset: 2 });

    expect(page.entries[0]?.action).toBe(AuditAction.ProjectCreated);
  });
});
```

- [ ] **Step 4: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/audit/audit-query`
Expected: FAIL — «Failed to resolve import "./audit-query.service"».

- [ ] **Step 5: Создать `apps/api/src/audit/audit-query.service.ts`**

```typescript
import type { AuditPage, AuditQuery } from '@cairn/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';

import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { auditLog } from '../db/schema';

/**
 * Чтение журнала (спека 9.1).
 *
 * Только выборка: изменять и удалять записи нельзя ни из интерфейса,
 * ни из кода — роль базы таких прав не имеет (спека 4.7).
 */
@Injectable()
export class AuditQueryService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Возвращает страницу журнала от новых записей к старым. */
  async query(filters: AuditQuery): Promise<AuditPage> {
    const conditions = buildConditions(filters);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await this.db
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(filters.limit)
      .offset(filters.offset);

    const [totals] = await this.db.select({ value: count() }).from(auditLog).where(where);

    return {
      entries: rows.map((row) => ({
        id: row.id,
        subjectId: row.subjectId,
        subjectKind: row.subjectKind,
        subjectLabel: row.subjectLabel,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        projectId: row.projectId,
        metadata: row.metadata ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      total: totals?.value ?? 0,
    };
  }
}

/** Собирает условия выборки из фильтров. */
function buildConditions(filters: AuditQuery): SQL[] {
  const conditions: SQL[] = [];

  if (filters.subjectId) {
    conditions.push(eq(auditLog.subjectId, filters.subjectId));
  }

  if (filters.projectId) {
    conditions.push(eq(auditLog.projectId, filters.projectId));
  }

  if (filters.action) {
    conditions.push(eq(auditLog.action, filters.action));
  }

  if (filters.from) {
    conditions.push(gte(auditLog.createdAt, new Date(filters.from)));
  }

  if (filters.to) {
    conditions.push(lte(auditLog.createdAt, new Date(filters.to)));
  }

  return conditions;
}
```

- [ ] **Step 6: Создать `apps/api/src/audit/audit.controller.ts`**

```typescript
import { auditQuerySchema, type AuditPage, type AuditQuery } from '@cairn/shared';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { SuperadminGuard } from '../access/superadmin.guard';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuditQueryService } from './audit-query.service';

/** Журнал действий. Доступен только суперадмину (спека 8). */
@Controller('audit')
@UseGuards(SessionGuard, SuperadminGuard)
export class AuditController {
  constructor(private readonly audit: AuditQueryService) {}

  /** Страница журнала с фильтрами. */
  @Get()
  async query(
    @Query(new ZodValidationPipe(auditQuerySchema)) filters: AuditQuery,
  ): Promise<AuditPage> {
    return this.audit.query(filters);
  }
}
```

- [ ] **Step 7: Дополнить `apps/api/src/audit/audit.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { AuditController } from './audit.controller';
import { AuditQueryService } from './audit-query.service';
import { AuditService } from './audit.service';

/**
 * Модуль журналирования.
 *
 * Глобальный: запись в журнал нужна почти всем модулям. Чтение вынесено
 * в отдельный сервис — оно требует подключения к базе, а запись работает
 * с транзакцией вызывающего.
 */
@Global()
@Module({
  imports: [DbModule, AccessModule, AuthModule],
  controllers: [AuditController],
  providers: [AuditService, AuditQueryService],
  exports: [AuditService],
})
export class AuditModule {}
```

- [ ] **Step 8: Запустить тест**

Run: `pnpm --filter @cairn/api test src/audit`
Expected: PASS, 12 тестов.

- [ ] **Step 9: Коммит**

```bash
git add apps/api/src/audit packages/shared/src
git commit -m "Добавить чтение журнала действий"
```

---

### Task 37: Контроллеры пользователей и приглашений

**Files:**
- Create: `apps/api/src/users/users.controller.ts`, `apps/api/src/users/users.module.ts`
- Create: `apps/api/src/invitations/invitations.controller.ts`, `apps/api/src/invitations/invitations.module.ts`
- Test: `apps/api/test/users.e2e.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/test/users.e2e.test.ts`**

```typescript
import { SubjectKind } from '@cairn/shared';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuthModule } from '../src/auth/auth.module';
import { PasswordService } from '../src/auth/password.service';
import { DATABASE } from '../src/db/db.module';
import { InvitationsModule } from '../src/invitations/invitations.module';
import { UsersModule } from '../src/users/users.module';
import { subjects, users } from '../src/db/schema';
import { startTestDatabase, type TestDatabase } from './db-fixture';

describe('пользователи по HTTP', () => {
  let testDb: TestDatabase;
  let app: INestApplication;
  let targetUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule, UsersModule, InvitationsModule],
    })
      .overrideProvider(DATABASE)
      .useValue(testDb.db)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const passwordHash = await new PasswordService().hash('очень длинный пароль');

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    await testDb.db.insert(users).values({
      subjectId: adminSubject!.id,
      email: 'admin@cairn.local',
      passwordHash,
      isSuperadmin: true,
    });

    const [targetSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    const [target] = await testDb.db
      .insert(users)
      .values({ subjectId: targetSubject!.id, email: 'user@cairn.local', passwordHash })
      .returning();
    targetUserId = target!.id;
  });

  async function signIn(email: string) {
    const agent = request.agent(app.getHttpServer());

    await agent.post('/auth/login').send({ email, password: 'очень длинный пароль' }).expect(200);

    return agent;
  }

  it('суперадмин видит список пользователей', async () => {
    const admin = await signIn('admin@cairn.local');

    const response = await admin.get('/users').expect(200);

    expect(response.body).toHaveLength(2);
  });

  it('в списке нет секретов', async () => {
    // Секреты не попадают в общие ответы списков (ТЗ 9).
    const admin = await signIn('admin@cairn.local');

    const response = await admin.get('/users').expect(200);

    expect(JSON.stringify(response.body)).not.toContain('argon2');
    expect(response.body[0]).not.toHaveProperty('passwordHash');
  });

  it('обычному пользователю отказывает с кодом 403', async () => {
    const user = await signIn('user@cairn.local');

    await user.get('/users').expect(403);
  });

  it('суперадмин приглашает и получает ссылку', async () => {
    const admin = await signIn('admin@cairn.local');

    const response = await admin
      .post('/invitations')
      .send({ email: 'new@cairn.local' })
      .expect(201);

    expect(response.body.url).toContain('/invite/');
  });

  it('отклоняет приглашение действующего пользователя', async () => {
    const admin = await signIn('admin@cairn.local');

    await admin.post('/invitations').send({ email: 'user@cairn.local' }).expect(409);
  });

  it('сброс пароля закрывает доступ пользователю', async () => {
    const admin = await signIn('admin@cairn.local');
    const user = await signIn('user@cairn.local');

    await admin.post(`/users/${targetUserId}/reset-password`).expect(201);

    await user.get('/auth/me').expect(401);
  });

  it('отзыв закрывает доступ пользователю', async () => {
    const admin = await signIn('admin@cairn.local');
    const user = await signIn('user@cairn.local');

    await admin.post(`/users/${targetUserId}/revoke`).expect(204);

    await user.get('/auth/me').expect(401);
  });

  it('приём ссылки без второго фактора выдаёт сессию', async () => {
    const admin = await signIn('admin@cairn.local');
    const invitation = await admin
      .post('/invitations')
      .send({ email: 'new@cairn.local' })
      .expect(201);

    const token = String(invitation.body.url).split('/invite/')[1];
    const guest = request.agent(app.getHttpServer());

    const response = await guest
      .post(`/invitations/${token}/accept`)
      .send({ password: 'очень длинный пароль' })
      .expect(200);

    expect(response.body).toMatchObject({ kind: 'session' });
    await guest.get('/auth/me').expect(200);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test test/users.e2e`
Expected: FAIL — «Failed to resolve import "../src/users/users.module"».

- [ ] **Step 3: Создать `apps/api/src/users/users.controller.ts`**

```typescript
import type { UserRow } from '@cairn/shared';
import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';

import { SuperadminGuard } from '../access/superadmin.guard';
import type { RequestSubject } from '../access/access.types';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { InvitationsService } from '../invitations/invitations.service';
import { UsersService } from './users.service';
import { buildInviteUrl, type IssuedLinkResponse } from './invite-url';

/** Управление пользователями. Доступно только суперадмину (спека 8). */
@Controller('users')
@UseGuards(SessionGuard, SuperadminGuard)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly invitations: InvitationsService,
  ) {}

  /** Список пользователей. */
  @Get()
  async list(): Promise<UserRow[]> {
    return this.users.list();
  }

  /** Отзывает доступ пользователю и завершает его сессии. */
  @Post(':id/revoke')
  @HttpCode(204)
  async revoke(
    @CurrentSubject() subject: RequestSubject,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.users.revoke({ id: subject.id, label: subject.label }, id);
  }

  /** Снимает отзыв. */
  @Post(':id/restore')
  @HttpCode(204)
  async restore(
    @CurrentSubject() subject: RequestSubject,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.users.restore({ id: subject.id, label: subject.label }, id);
  }

  /** Снимает привязку второго фактора. */
  @Post(':id/reset-totp')
  @HttpCode(204)
  async resetTotp(
    @CurrentSubject() subject: RequestSubject,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.users.resetTotp({ id: subject.id, label: subject.label }, id);
  }

  /**
   * Сбрасывает пароль и возвращает одноразовую ссылку.
   *
   * Ссылка показывается суперадмину один раз: почты на этапе 1 нет,
   * передача ссылки — его забота (спека 6.7).
   */
  @Post(':id/reset-password')
  async resetPassword(
    @CurrentSubject() subject: RequestSubject,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<IssuedLinkResponse> {
    const link = await this.invitations.resetPassword(
      { id: subject.id, label: subject.label, userId: await this.users.userIdOfSubject(subject.id) },
      id,
    );

    return buildInviteUrl(link);
  }
}
```

- [ ] **Step 4: Создать `apps/api/src/users/invite-url.ts`**

```typescript
import type { IssuedLinkResponse } from '@cairn/shared';

import type { IssuedLink } from '../invitations/invitations.types';

/**
 * Строит адрес, по которому человек задаст пароль.
 *
 * Адрес веб-приложения берётся из окружения: бэкенд не знает его сам,
 * а зашитый в код адрес сломался бы при первом же переносе.
 */
export function buildInviteUrl(link: IssuedLink): IssuedLinkResponse {
  const base = process.env.CAIRN_WEB_URL ?? 'http://localhost:3000';

  return {
    url: `${base}/invite/${link.token}`,
    expiresAt: link.expiresAt.toISOString(),
  };
}

export type { IssuedLinkResponse };
```

- [ ] **Step 5: Добавить метод в `apps/api/src/users/users.service.ts`**

```typescript
  /** Находит запись пользователя по его субъекту. */
  async userIdOfSubject(subjectId: string): Promise<string> {
    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.subjectId, subjectId))
      .limit(1);

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    return user.id;
  }
```

- [ ] **Step 6: Создать `apps/api/src/invitations/invitations.controller.ts`**

```typescript
import {
  acceptInvitationSchema,
  inviteUserSchema,
  type AcceptInvitationInput,
  type InviteUserInput,
} from '@cairn/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { SuperadminGuard } from '../access/superadmin.guard';
import type { RequestSubject } from '../access/access.types';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '../auth/session.cookie';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { buildInviteUrl, type IssuedLinkResponse } from '../users/invite-url';
import { UsersService } from '../users/users.service';
import { InvitationsService } from './invitations.service';

/** Приглашения и установка пароля по ссылке (спека 8). */
@Controller('invitations')
export class InvitationsController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly users: UsersService,
  ) {}

  /** Приглашает пользователя. Доступно только суперадмину. */
  @Post()
  @UseGuards(SessionGuard, SuperadminGuard)
  async invite(
    @CurrentSubject() subject: RequestSubject,
    @Body(new ZodValidationPipe(inviteUserSchema)) body: InviteUserInput,
  ): Promise<IssuedLinkResponse> {
    const userId = await this.users.userIdOfSubject(subject.id);
    const link = await this.invitations.invite(
      { id: subject.id, label: subject.label, userId },
      body.email,
    );

    return buildInviteUrl(link);
  }

  /**
   * Проверяет действительность ссылки.
   *
   * Доступен без сессии: человек по ссылке ещё не вошёл. Ответ не содержит
   * ничего, кроме признака пригодности и вида ссылки, — иначе перебор
   * токенов раскрывал бы состав пользователей.
   */
  @Get(':token')
  async check(@Param('token') token: string): Promise<{ kind: string }> {
    const link = await this.invitations.findUsableLink(token);

    if (!link) {
      throw new NotFoundException('Ссылка недействительна или уже использована');
    }

    return { kind: link.kind };
  }

  /**
   * Устанавливает пароль по ссылке.
   *
   * Если у пользователя привязан второй фактор, сессия не выдаётся:
   * вход завершается обычным челленджем, и ссылка не даёт его обойти (спека 4.6).
   */
  @Post(':token/accept')
  @HttpCode(200)
  async accept(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(acceptInvitationSchema)) body: AcceptInvitationInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ kind: 'session' } | { kind: 'totp_required' }> {
    const { sessionToken } = await this.invitations.acceptLink(token, body.password, {});

    if (!sessionToken) {
      return { kind: 'totp_required' };
    }

    response.cookie(SESSION_COOKIE, sessionToken, SESSION_COOKIE_OPTIONS);

    return { kind: 'session' };
  }
}
```

- [ ] **Step 7: Создать модули**

`apps/api/src/users/users.module.ts`:

```typescript
import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/** Модуль управления пользователями. */
@Module({
  imports: [DbModule, AccessModule, AuthModule, InvitationsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

`apps/api/src/invitations/invitations.module.ts`:

```typescript
import { forwardRef, Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { UsersModule } from '../users/users.module';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

/**
 * Модуль приглашений.
 *
 * Связь с модулем пользователей взаимная: контроллер приглашений находит
 * запись приглашающего, а контроллер пользователей выдаёт ссылку сброса.
 * Разрывается `forwardRef`.
 */
@Module({
  imports: [DbModule, AccessModule, AuthModule, forwardRef(() => UsersModule)],
  controllers: [InvitationsController],
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class InvitationsModule {}
```

В `users.module.ts` импорт модуля приглашений тоже оберни: `forwardRef(() => InvitationsModule)`.

- [ ] **Step 8: Запустить тест**

Run: `pnpm --filter @cairn/api test test/users.e2e`
Expected: PASS, 8 тестов.

- [ ] **Step 9: Коммит**

```bash
git add apps/api/src apps/api/test
git commit -m "Добавить контроллеры пользователей и приглашений"
```

---

### Task 38: Сборка приложения целиком

**Files:**
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/main.ts`, `apps/api/vitest.config.ts`
- Test: `apps/api/src/app.module.test.ts`

- [ ] **Step 1: Дополнить тест `apps/api/src/app.module.test.ts`**

```typescript
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { AccessService } from './access/access.service';
import { AuthService } from './auth/auth.service';
import { ProjectsService } from './projects/projects.service';

describe('AppModule', () => {
  it('собирается со всеми модулями', async () => {
    // Проверяет, что зависимости разрешаются: пропущенный импорт модуля
    // проявился бы здесь, а не при первом запросе в бою.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    expect(moduleRef.get(AccessService)).toBeDefined();
    expect(moduleRef.get(AuthService)).toBeDefined();
    expect(moduleRef.get(ProjectsService)).toBeDefined();

    await moduleRef.close();
  });
});
```

- [ ] **Step 2: Добавить строку подключения в `apps/api/vitest.config.ts`**

Сборка `AppModule` создаёт подключение к базе, поэтому переменная нужна. Настоящая база при этом не открывается: драйвер подключается лениво, при первом запросе.

```typescript
    env: {
      // Фиксированный тестовый ключ: 32 нулевых байта в base64.
      CAIRN_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      // Подключение не открывается: драйвер соединяется при первом запросе.
      DATABASE_URL: 'postgres://cairn_app:test@127.0.0.1:1/cairn_test',
    },
```

- [ ] **Step 3: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/app.module`
Expected: FAIL — «Nest can't resolve dependencies» либо ошибка отсутствующего экспорта.

- [ ] **Step 4: Собрать `apps/api/src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';

import { AccessModule } from './access/access.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CryptoModule } from './crypto/crypto.module';
import { DbModule } from './db/db.module';
import { GrantsModule } from './grants/grants.module';
import { InvitationsModule } from './invitations/invitations.module';
import { ProjectsModule } from './projects/projects.module';
import { UsersModule } from './users/users.module';

/** Корневой модуль приложения. */
@Module({
  imports: [
    DbModule,
    CryptoModule,
    AuditModule,
    AccessModule,
    AuthModule,
    ProjectsModule,
    GrantsModule,
    InvitationsModule,
    UsersModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 5: Запустить тест**

Run: `pnpm --filter @cairn/api test src/app.module`
Expected: PASS, 1 тест.

- [ ] **Step 6: Проверить сборку и запуск**

```bash
pnpm --filter @cairn/shared build
pnpm --filter @cairn/api build
docker compose up -d --wait postgres
pnpm --filter @cairn/api db:migrate
pnpm --filter @cairn/api start
```

Expected: приложение стартует и слушает порт 3001. Проверь: `curl -i http://localhost:3001/api/auth/me` отвечает `401` — маршрут есть, сессии нет. Останови приложение.

- [ ] **Step 7: Коммит**

```bash
git add apps/api
git commit -m "Собрать приложение целиком"
```

---

### Task 39: Матрица доступа как исполняемый набор тестов

Требование спеки 10.3: для каждой пары «уровень доступа × эндпоинт» существует тест, фиксирующий ожидаемый ответ. Этот набор — исполняемая версия таблицы из раздела 4.3 ТЗ, и он растёт вместе с каждой новой секцией на следующих этапах.

**Files:**
- Create: `apps/api/test/access-matrix.e2e.test.ts`

- [ ] **Step 1: Написать тест `apps/api/test/access-matrix.e2e.test.ts`**

```typescript
import { AccessLevel, Section, SubjectKind } from '@cairn/shared';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/auth/password.service';
import { DATABASE } from '../src/db/db.module';
import { grants, projects, subjects, users } from '../src/db/schema';
import { startTestDatabase, type TestDatabase } from './db-fixture';

/** Ожидаемый ответ для уровня доступа. */
interface Expectation {
  /** Уровень доступа к секции «Инфо»; `null` — выдачи нет. */
  level: AccessLevel | null;
  /** Ожидаемый код при чтении карточки. */
  read: number;
  /** Ожидаемый код при правке. */
  write: number;
  /** Видно ли проект в списке. */
  listed: boolean;
}

/**
 * Таблица из раздела 4.3 ТЗ в исполняемом виде.
 *
 * Каждая строка — сочетание уровня доступа и ожидаемого поведения.
 * Добавление секции на следующих этапах добавляет сюда столбцы,
 * а не переписывает логику.
 */
const MATRIX: Expectation[] = [
  { level: null, read: 404, write: 404, listed: false },
  { level: AccessLevel.Metadata, read: 200, write: 403, listed: true },
  { level: AccessLevel.Read, read: 200, write: 403, listed: true },
  { level: AccessLevel.Write, read: 200, write: 200, listed: true },
];

describe('матрица доступа', () => {
  let testDb: TestDatabase;
  let app: INestApplication;
  let projectId: string;
  let contractorSubjectId: string;
  let adminUserId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE)
      .useValue(testDb.db)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.truncate();

    const passwordHash = await new PasswordService().hash('очень длинный пароль');

    const [adminSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'admin@cairn.local' })
      .returning();
    const [admin] = await testDb.db
      .insert(users)
      .values({
        subjectId: adminSubject!.id,
        email: 'admin@cairn.local',
        passwordHash,
        isSuperadmin: true,
      })
      .returning();
    adminUserId = admin!.id;

    const [contractorSubject] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'user@cairn.local' })
      .returning();
    contractorSubjectId = contractorSubject!.id;
    await testDb.db
      .insert(users)
      .values({ subjectId: contractorSubjectId, email: 'user@cairn.local', passwordHash });

    const [project] = await testDb.db
      .insert(projects)
      .values({ slug: 'proekt', name: 'Проект', purpose: 'Назначение' })
      .returning();
    projectId = project!.id;
  });

  async function signInAs(level: AccessLevel | null) {
    if (level) {
      await testDb.db.insert(grants).values({
        subjectId: contractorSubjectId,
        projectId,
        section: Section.Info,
        level,
        grantedBy: adminUserId,
      });
    }

    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/login')
      .send({ email: 'user@cairn.local', password: 'очень длинный пароль' })
      .expect(200);

    return agent;
  }

  for (const expectation of MATRIX) {
    const title = expectation.level ?? 'нет доступа';

    describe(`уровень «${title}»`, () => {
      it(`чтение карточки отвечает ${expectation.read}`, async () => {
        const agent = await signInAs(expectation.level);

        await agent.get(`/projects/${projectId}`).expect(expectation.read);
      });

      it(`правка отвечает ${expectation.write}`, async () => {
        const agent = await signInAs(expectation.level);

        await agent
          .patch(`/projects/${projectId}`)
          .send({ name: 'Новое имя' })
          .expect(expectation.write);
      });

      it(`проект ${expectation.listed ? 'виден' : 'не виден'} в списке`, async () => {
        const agent = await signInAs(expectation.level);

        const response = await agent.get('/projects').expect(200);

        expect(response.body).toHaveLength(expectation.listed ? 1 : 0);
      });

      it('управление доступами закрыто', async () => {
        // Уровень доступа к проекту не даёт права управлять выдачами (спека 4.3).
        const agent = await signInAs(expectation.level);

        await agent.get(`/projects/${projectId}/grants`).expect(403);
      });

      it('журнал закрыт', async () => {
        const agent = await signInAs(expectation.level);

        await agent.get('/audit').expect(403);
      });

      it('список пользователей закрыт', async () => {
        const agent = await signInAs(expectation.level);

        await agent.get('/users').expect(403);
      });
    });
  }

  describe('проекция полей', () => {
    it('на уровне метаданных назначение скрыто', async () => {
      const agent = await signInAs(AccessLevel.Metadata);

      const response = await agent.get(`/projects/${projectId}`).expect(200);

      expect(response.body).not.toHaveProperty('purpose');
    });

    it('на уровне чтения назначение видно', async () => {
      const agent = await signInAs(AccessLevel.Read);

      const response = await agent.get(`/projects/${projectId}`).expect(200);

      expect(response.body).toMatchObject({ purpose: 'Назначение' });
    });
  });
});
```

- [ ] **Step 2: Запустить тест**

Run: `pnpm --filter @cairn/api test test/access-matrix`
Expected: PASS, 26 тестов — 24 из матрицы (4 уровня × 6 проверок) и 2 на проекции.

- [ ] **Step 3: Запустить всё**

```bash
pnpm --filter @cairn/shared build
pnpm test
pnpm typecheck
```

Expected: без ошибок. Прогон занимает минуты и требует работающего Docker.

- [ ] **Step 4: Коммит**

```bash
git add apps/api/test
git commit -m "Добавить матрицу доступа как набор тестов"
```

---

**Результат чанка 11:** бэкенд этапа 1 готов целиком — все маршруты спеки 8 работают, приложение собирается и стартует, модель прав закреплена исполняемой таблицей. Следующий чанк начинает интерфейс.

## Chunk 12: Каркас интерфейса и вход

Результат чанка: приложение открывается в браузере, человек входит по паролю со вторым фактором и задаёт пароль по приглашению.

### Task 40: Каркас Next.js

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/vitest.config.ts`, `apps/web/vitest.setup.ts`
- Create: `apps/web/postcss.config.mjs`, `apps/web/tailwind.config.ts`, `apps/web/src/app/globals.css`
- Create: `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`

- [ ] **Step 1: Создать `apps/web/package.json`**

```json
{
  "name": "@cairn/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start --port 3000",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@cairn/shared": "workspace:*",
    "@radix-ui/react-dialog": "^1.1.4",
    "@radix-ui/react-label": "^2.1.1",
    "@radix-ui/react-select": "^2.1.4",
    "@radix-ui/react-slot": "^1.1.1",
    "@tanstack/react-query": "^5.64.1",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "next": "^15.1.4",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwind-merge": "^2.6.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@testing-library/dom": "^10.4.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/node": "^22.10.5",
    "@types/react": "^19.0.7",
    "@types/react-dom": "^19.0.3",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "jsdom": "^26.0.0",
    "postcss": "^8.5.1",
    "tailwindcss": "^3.4.17",
    "vitest": "^3.0.5"
  }
}
```

- [ ] **Step 2: Создать `apps/web/tsconfig.json`**

Фронтенд переопределяет модульную систему: Next.js собирает в ESM, в отличие от бэкенда.

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "noEmit": true,
    "allowJs": true,
    "incremental": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Создать `apps/web/next.config.ts`**

```typescript
import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Пакет контракта отдаётся исходниками и собирается вместе с приложением.
  transpilePackages: ['@cairn/shared'],
};

export default config;
```

- [ ] **Step 4: Создать `apps/web/tailwind.config.ts`**

Токены объявлены переменными CSS: так одни и те же значения доступны и Tailwind, и компонентам shadcn/ui.

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        muted: 'hsl(var(--muted))',
        'muted-foreground': 'hsl(var(--muted-foreground))',
        border: 'hsl(var(--border))',
        primary: 'hsl(var(--primary))',
        'primary-foreground': 'hsl(var(--primary-foreground))',
        destructive: 'hsl(var(--destructive))',
        'destructive-foreground': 'hsl(var(--destructive-foreground))',
      },
      borderRadius: {
        md: 'var(--radius)',
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 5: Создать `apps/web/src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222 47% 11%;
    --muted: 210 40% 96%;
    --muted-foreground: 215 16% 47%;
    --border: 214 32% 91%;
    --primary: 222 47% 11%;
    --primary-foreground: 210 40% 98%;
    --destructive: 0 72% 51%;
    --destructive-foreground: 210 40% 98%;
    --radius: 0.5rem;
  }

  body {
    @apply bg-background text-foreground;
  }
}
```

- [ ] **Step 6: Создать `apps/web/postcss.config.mjs`**

```javascript
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
```

- [ ] **Step 7: Создать `apps/web/vitest.config.ts`**

```typescript
import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@cairn/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
```

- [ ] **Step 8: Создать `apps/web/vitest.setup.ts`**

```typescript
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 9: Создать `apps/web/src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

/** Заголовок вкладки и описание приложения. */
export const metadata: Metadata = {
  title: 'CAIRN — реестр проектов',
  description: 'Где проект развёрнут, чем настроен и на какой стадии находится',
};

/** Корневая разметка. Язык интерфейса — русский, без локализации (спека 9). */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 10: Создать `apps/web/src/app/page.tsx`**

Временная страница: сводка появится в следующем чанке.

```tsx
/** Главная страница. Заменяется сводкой проектов в чанке 13. */
export default function HomePage() {
  return <main className="p-8">CAIRN</main>;
}
```

- [ ] **Step 11: Установить зависимости и проверить сборку**

```bash
pnpm install
pnpm --filter @cairn/shared build
pnpm --filter @cairn/web build
```

Expected: сборка проходит без ошибок.

- [ ] **Step 12: Коммит**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "Добавить каркас веб-приложения"
```

---

### Task 41: Клиент API

Две обёртки над `fetch`: одна для серверных компонентов, другая для браузера. Разница принципиальная — серверный код обязан вручную пробрасывать cookie входящего запроса, иначе запрос уйдёт без сессии (спека 3.3).

**Files:**
- Create: `apps/web/src/api/config.ts`, `apps/web/src/api/errors.ts`, `apps/web/src/api/server.ts`, `apps/web/src/api/client.ts`, `apps/web/src/api/index.ts`
- Test: `apps/web/src/api/client.test.ts`, `apps/web/src/api/errors.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/web/src/api/errors.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';

import { ApiError, messageForStatus } from './errors';

describe('ApiError', () => {
  it('хранит код ответа', () => {
    expect(new ApiError(403, 'Нет прав').status).toBe(403);
  });
});

describe('messageForStatus', () => {
  it('объясняет 401 как истёкший вход', () => {
    expect(messageForStatus(401)).toMatch(/вой/i);
  });

  it('объясняет 403 как нехватку прав', () => {
    expect(messageForStatus(403)).toMatch(/прав/i);
  });

  it('объясняет 404 нейтрально', () => {
    // Формулировка не должна намекать, что объект существует, но закрыт:
    // это раскрыло бы его существование (ТЗ 4.2).
    const message = messageForStatus(404);

    expect(message).toMatch(/не найден/i);
    expect(message).not.toMatch(/доступ|прав/i);
  });

  it('для прочих кодов даёт общее сообщение', () => {
    expect(messageForStatus(500)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/web test src/api/errors`
Expected: FAIL — «Failed to resolve import "./errors"».

- [ ] **Step 3: Создать `apps/web/src/api/errors.ts`**

```typescript
/** Ошибка ответа API. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Возвращает человеческое объяснение кода ответа.
 *
 * Формулировка для `404` намеренно нейтральна: сказать «нет доступа»
 * значило бы раскрыть, что объект существует (ТЗ 4.2).
 */
export function messageForStatus(status: number): string {
  return STATUS_MESSAGES[status] ?? 'Не удалось выполнить запрос. Попробуйте ещё раз.';
}

/** Сообщения по кодам ответа. */
const STATUS_MESSAGES: Record<number, string> = {
  400: 'Проверьте заполненные поля.',
  401: 'Нужно войти заново.',
  403: 'Недостаточно прав для этого действия.',
  404: 'Не найдено.',
  409: 'Действие невозможно в текущем состоянии.',
};
```

- [ ] **Step 4: Создать `apps/web/src/api/config.ts`**

```typescript
/**
 * Адрес API для браузера.
 *
 * Относительный путь: браузер и API живут за одним реверс-прокси на одном
 * домене, поэтому CORS не нужен и cookie работает как first-party (спека 3.3).
 */
export const BROWSER_API_URL = '/api';

/**
 * Адрес API для серверных компонентов.
 *
 * Внутренний адрес контейнера: запрос не выходит наружу, а публичный адрес
 * на сервере может быть недоступен вовсе.
 */
export function serverApiUrl(): string {
  return process.env.CAIRN_INTERNAL_API_URL ?? 'http://localhost:3001/api';
}
```

- [ ] **Step 5: Написать падающий тест `apps/web/src/api/client.test.ts`**

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from './client';
import { ApiError } from './errors';

describe('apiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(response: Partial<Response>): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      ...response,
    });

    vi.stubGlobal('fetch', fetchMock);

    return fetchMock;
  }

  it('отправляет cookie сессии', async () => {
    // Без этого браузер не приложит cookie к запросу, и сессия не сработает.
    const fetchMock = stubFetch({ json: async () => ({ ok: true }) });

    await apiClient('/projects');

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' });
  });

  it('возвращает разобранный ответ', async () => {
    stubFetch({ json: async () => [{ id: '1' }] });

    expect(await apiClient('/projects')).toEqual([{ id: '1' }]);
  });

  it('бросает ApiError с кодом ответа', async () => {
    stubFetch({ ok: false, status: 403, json: async () => ({ message: 'Недостаточно прав' }) });

    await expect(apiClient('/projects')).rejects.toBeInstanceOf(ApiError);
  });

  it('сохраняет код ответа в ошибке', async () => {
    stubFetch({ ok: false, status: 404, json: async () => ({}) });

    await expect(apiClient('/projects')).rejects.toMatchObject({ status: 404 });
  });

  it('переживает ответ без тела', async () => {
    // 204 не имеет тела, и попытка его разобрать упала бы.
    stubFetch({
      status: 204,
      json: async () => {
        throw new Error('нет тела');
      },
    });

    expect(await apiClient('/users/1/revoke', { method: 'POST' })).toBeNull();
  });

  it('передаёт тело запроса как JSON', async () => {
    const fetchMock = stubFetch({});

    await apiClient('/projects', { method: 'POST', body: { name: 'Проект' } });

    const [, init] = fetchMock.mock.calls[0] ?? [];

    expect(init).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ name: 'Проект' }),
    });
  });
});
```

- [ ] **Step 6: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/web test src/api/client`
Expected: FAIL — «Failed to resolve import "./client"».

- [ ] **Step 7: Создать `apps/web/src/api/client.ts`**

```typescript
'use client';

import { BROWSER_API_URL } from './config';
import { ApiError, messageForStatus } from './errors';

/** Параметры запроса. */
export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Запрос к API из браузера.
 *
 * `credentials: 'include'` обязателен: без него браузер не приложит cookie
 * сессии, и любой защищённый маршрут ответит отказом.
 */
export async function apiClient<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await fetch(`${BROWSER_API_URL}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  return readResponse<T>(response);
}

/** Разбирает ответ, превращая отказ в {@link ApiError}. */
export async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      (payload as { message?: string } | null)?.message ?? messageForStatus(response.status);

    throw new ApiError(response.status, message, payload);
  }

  return payload as T;
}
```

- [ ] **Step 8: Создать `apps/web/src/api/server.ts`**

```typescript
import { cookies } from 'next/headers';

import { readResponse } from './client';
import { serverApiUrl } from './config';

/**
 * Запрос к API из серверного компонента.
 *
 * Cookie входящего запроса пробрасывается вручную: на сервере нет браузера,
 * который сделал бы это сам, и без проброса запрос уйдёт без сессии (спека 3.3).
 *
 * Это единственный допустимый способ обращения к API из серверных компонентов —
 * прямые вызовы `fetch` в них не пишем.
 */
export async function apiServer<T>(path: string): Promise<T> {
  const cookieStore = await cookies();

  const response = await fetch(`${serverApiUrl()}${path}`, {
    headers: { Cookie: cookieStore.toString() },
    // Данные о правах и проектах меняются, кэшировать их между запросами нельзя.
    cache: 'no-store',
  });

  return readResponse<T>(response);
}
```

- [ ] **Step 9: Создать `apps/web/src/api/index.ts`**

```typescript
export * from './client';
export * from './config';
export * from './errors';
export * from './server';
```

- [ ] **Step 10: Запустить тесты**

Run: `pnpm --filter @cairn/web test src/api`
Expected: PASS, 10 тестов.

- [ ] **Step 11: Коммит**

```bash
git add apps/web/src/api
git commit -m "Добавить клиент API"
```

---

### Task 42: Форма входа

**Files:**
- Create: `apps/web/src/components/LoginForm/LoginForm.tsx`, `types.ts`, `constants.ts`, `index.ts`
- Create: `apps/web/src/app/login/page.tsx`
- Test: `apps/web/src/components/LoginForm/LoginForm.test.tsx`

- [ ] **Step 1: Написать падающий тест `apps/web/src/components/LoginForm/LoginForm.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LoginForm } from './LoginForm';

describe('LoginForm', () => {
  it('показывает поля адреса и пароля', () => {
    render(<LoginForm onSubmit={vi.fn()} />);

    expect(screen.getByLabelText('Адрес электронной почты')).toBeInTheDocument();
    expect(screen.getByLabelText('Пароль')).toBeInTheDocument();
  });

  it('передаёт введённые данные', async () => {
    const onSubmit = vi.fn();
    render(<LoginForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Адрес электронной почты'), 'user@cairn.local');
    await userEvent.type(screen.getByLabelText('Пароль'), 'пароль');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));

    expect(onSubmit).toHaveBeenCalledWith({ email: 'user@cairn.local', password: 'пароль' });
  });

  it('не отправляет форму с пустыми полями', async () => {
    const onSubmit = vi.fn();
    render(<LoginForm onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('скрывает пароль от посторонних глаз', () => {
    render(<LoginForm onSubmit={vi.fn()} />);

    expect(screen.getByLabelText('Пароль')).toHaveAttribute('type', 'password');
  });

  it('показывает сообщение об ошибке', () => {
    render(<LoginForm onSubmit={vi.fn()} error="Неверный адрес или пароль" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Неверный адрес или пароль');
  });

  it('блокирует кнопку во время отправки', () => {
    render(<LoginForm onSubmit={vi.fn()} isSubmitting />);

    expect(screen.getByRole('button', { name: 'Вход…' })).toBeDisabled();
  });

  it('связывает ошибку с формой для программ чтения с экрана', () => {
    render(<LoginForm onSubmit={vi.fn()} error="Неверный адрес или пароль" />);

    expect(screen.getByRole('alert')).toHaveAttribute('id');
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/web test src/components/LoginForm`
Expected: FAIL — «Failed to resolve import "./LoginForm"».

- [ ] **Step 3: Создать `apps/web/src/components/LoginForm/types.ts`**

```typescript
import type { LoginInput } from '@cairn/shared';

/** Пропсы формы входа. */
export interface IProps {
  /** Вызывается с проверенными данными. */
  onSubmit: (input: LoginInput) => void;
  /** Сообщение об ошибке предыдущей попытки. */
  error?: string;
  /** Отправка в процессе. */
  isSubmitting?: boolean;
}
```

- [ ] **Step 4: Создать `apps/web/src/components/LoginForm/constants.ts`**

```typescript
/** Подписи полей формы. */
export const FIELD_LABELS = {
  email: 'Адрес электронной почты',
  password: 'Пароль',
} as const;

/** Идентификатор блока с ошибкой: на него ссылается форма. */
export const ERROR_ID = 'login-error';
```

- [ ] **Step 5: Создать `apps/web/src/components/LoginForm/LoginForm.tsx`**

```tsx
'use client';

import { useState, type FormEvent } from 'react';

import { ERROR_ID, FIELD_LABELS } from './constants';
import type { IProps } from './types';

/** Первый шаг входа: адрес и пароль (спека 6.1). */
export function LoginForm({ onSubmit, error, isSubmitting = false }: IProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const canSubmit = email.trim().length > 0 && password.length > 0 && !isSubmitting;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    onSubmit({ email: email.trim().toLowerCase(), password });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-describedby={error ? ERROR_ID : undefined}>
      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm font-medium">
          {FIELD_LABELS.email}
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-md border border-border px-3 py-2"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className="block text-sm font-medium">
          {FIELD_LABELS.password}
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-md border border-border px-3 py-2"
        />
      </div>

      {error && (
        <p id={ERROR_ID} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
      >
        {isSubmitting ? 'Вход…' : 'Войти'}
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Создать `apps/web/src/components/LoginForm/index.ts`**

```typescript
export { LoginForm } from './LoginForm';
export type { IProps } from './types';
```

- [ ] **Step 7: Запустить тест**

Run: `pnpm --filter @cairn/web test src/components/LoginForm`
Expected: PASS, 7 тестов.

- [ ] **Step 8: Коммит**

```bash
git add apps/web/src/components
git commit -m "Добавить форму входа"
```

---

### Task 43: Форма второго фактора и страница входа

**Files:**
- Create: `apps/web/src/components/TotpForm/TotpForm.tsx`, `types.ts`, `index.ts`
- Create: `apps/web/src/app/login/page.tsx`, `apps/web/src/app/login/LoginScreen.tsx`
- Test: `apps/web/src/components/TotpForm/TotpForm.test.tsx`

- [ ] **Step 1: Написать падающий тест `apps/web/src/components/TotpForm/TotpForm.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TotpForm } from './TotpForm';

describe('TotpForm', () => {
  it('просит код из приложения', () => {
    render(<TotpForm onSubmit={vi.fn()} />);

    expect(screen.getByLabelText('Код из приложения')).toBeInTheDocument();
  });

  it('передаёт введённый код', async () => {
    const onSubmit = vi.fn();
    render(<TotpForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Код из приложения'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));

    expect(onSubmit).toHaveBeenCalledWith('123456');
  });

  it('не отправляет код короче шести цифр', async () => {
    const onSubmit = vi.fn();
    render(<TotpForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Код из приложения'), '12345');
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('не принимает буквы', async () => {
    render(<TotpForm onSubmit={vi.fn()} />);

    const field = screen.getByLabelText('Код из приложения');
    await userEvent.type(field, '12ab34');

    expect(field).toHaveValue('1234');
  });

  it('показывает ошибку', () => {
    render(<TotpForm onSubmit={vi.fn()} error="Неверный код" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Неверный код');
  });

  it('подсказывает, что делать при утере устройства', () => {
    // Тупик «потерял телефон» должен разрешаться без обращения к разработчику.
    render(<TotpForm onSubmit={vi.fn()} />);

    expect(screen.getByText(/администратор/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/web test src/components/TotpForm`
Expected: FAIL — «Failed to resolve import "./TotpForm"».

- [ ] **Step 3: Создать `apps/web/src/components/TotpForm/types.ts`**

```typescript
/** Пропсы формы второго фактора. */
export interface IProps {
  /** Вызывается с шестизначным кодом. */
  onSubmit: (code: string) => void;
  /** Сообщение об ошибке предыдущей попытки. */
  error?: string;
  /** Отправка в процессе. */
  isSubmitting?: boolean;
}
```

- [ ] **Step 4: Создать `apps/web/src/components/TotpForm/TotpForm.tsx`**

```tsx
'use client';

import { useState, type FormEvent } from 'react';

import type { IProps } from './types';

/** Второй шаг входа: код из приложения-аутентификатора (спека 6.1). */
export function TotpForm({ onSubmit, error, isSubmitting = false }: IProps) {
  const [code, setCode] = useState('');

  const canSubmit = code.length === CODE_LENGTH && !isSubmitting;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (canSubmit) {
      onSubmit(code);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="totp-code" className="block text-sm font-medium">
          Код из приложения
        </label>
        <input
          id="totp-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) => setCode(onlyDigits(event.target.value))}
          className="w-full rounded-md border border-border px-3 py-2 text-center text-lg tracking-widest"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
      >
        {isSubmitting ? 'Проверка…' : 'Подтвердить'}
      </button>

      <p className="text-sm text-muted-foreground">
        Потеряли доступ к приложению? Обратитесь к администратору — он снимет привязку.
      </p>
    </form>
  );
}

/** Оставляет только цифры и обрезает до нужной длины. */
function onlyDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, CODE_LENGTH);
}

/** Длина кода. */
const CODE_LENGTH = 6;
```

- [ ] **Step 5: Создать `apps/web/src/components/TotpForm/index.ts`**

```typescript
export { TotpForm } from './TotpForm';
export type { IProps } from './types';
```

- [ ] **Step 6: Создать `apps/web/src/app/login/LoginScreen.tsx`**

Экран держит состояние двухшагового входа: показывает форму пароля, затем форму кода. Логика вынесена из страницы, чтобы страница осталась серверным компонентом.

```tsx
'use client';

import type { LoginInput, LoginResponse } from '@cairn/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiClient, ApiError } from '@/api';
import { LoginForm } from '@/components/LoginForm';
import { TotpForm } from '@/components/TotpForm';

/** Двухшаговый вход: пароль, затем при необходимости второй фактор. */
export function LoginScreen() {
  const router = useRouter();
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [isSubmitting, setSubmitting] = useState(false);

  async function submitPassword(input: LoginInput): Promise<void> {
    setSubmitting(true);
    setError(undefined);

    try {
      const response = await apiClient<LoginResponse>('/auth/login', {
        method: 'POST',
        body: input,
      });

      if (response.kind === 'totp_required') {
        setChallengeToken(response.challengeToken);

        return;
      }

      router.replace('/');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось войти');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCode(code: string): Promise<void> {
    if (!challengeToken) {
      return;
    }

    setSubmitting(true);
    setError(undefined);

    try {
      await apiClient('/auth/totp', { method: 'POST', body: { challengeToken, code } });
      router.replace('/');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось подтвердить код');
      // Челлендж исчерпан — возвращаем человека к вводу пароля.
      if (cause instanceof ApiError && cause.status === 401) {
        setChallengeToken(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">
        {challengeToken ? 'Подтверждение входа' : 'Вход в CAIRN'}
      </h1>

      {challengeToken ? (
        <TotpForm onSubmit={submitCode} error={error} isSubmitting={isSubmitting} />
      ) : (
        <LoginForm onSubmit={submitPassword} error={error} isSubmitting={isSubmitting} />
      )}
    </div>
  );
}
```

- [ ] **Step 7: Создать `apps/web/src/app/login/page.tsx`**

```tsx
import { LoginScreen } from './LoginScreen';

/** Страница входа. */
export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm items-center px-4">
      <div className="w-full">
        <LoginScreen />
      </div>
    </main>
  );
}
```

- [ ] **Step 8: Запустить тесты и проверку типов**

```bash
pnpm --filter @cairn/web test
pnpm --filter @cairn/web typecheck
```

Expected: PASS, 23 теста; типы без ошибок.

- [ ] **Step 9: Проверить вход вручную**

```bash
docker compose up -d --wait postgres
pnpm --filter @cairn/api db:migrate
pnpm --filter @cairn/api cli create-superadmin admin@example.com
```

Запусти оба приложения (`pnpm --filter @cairn/api dev` и `pnpm --filter @cairn/web dev`), открой `http://localhost:3000/login`.

Expected: форма отображается; попытка входа с неверным паролем показывает сообщение об ошибке.

Заметь: пока веб-приложение обращается к API напрямую по адресу `/api`, а реверс-прокси появится в последнем чанке. Для локальной разработки добавь в `apps/web/next.config.ts` временную переадресацию:

```typescript
  async rewrites() {
    return [{ source: '/api/:path*', destination: 'http://localhost:3001/api/:path*' }];
  },
```

- [ ] **Step 10: Коммит**

```bash
git add apps/web
git commit -m "Добавить страницу входа"
```

---

**Результат чанка 12:** веб-приложение поднимается, клиент API пробрасывает сессию с обеих сторон, человек входит с паролем и вторым фактором. Следующий чанк добавляет сводку и карточку проекта.
