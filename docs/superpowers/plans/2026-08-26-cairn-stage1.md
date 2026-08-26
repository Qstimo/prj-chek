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

**TDD обязателен.** Каждая задача начинается с падающего теста. Запусти тест и убедись, что он падает **по ожидаемой причине**, прежде чем писать реализацию. Тест, упавший из-за опечатки в импорте, ничего не проверяет.

**Коммит после каждой задачи.** Сообщения на русском, в повелительном наклонении: «Добавить сервис шифрования».

**TSDoc на русском** (`/** */`) для всех экспортируемых элементов: функций, классов, интерфейсов, типов.

**Никаких `any`.** При неизвестном типе — `unknown` с последующим сужением.

**Порядок в файле:** экспортируемая сущность, затем вспомогательные, затем константы, затем типы.

**Не изобретай.** Если в плане указан код — используй его. Если чего-то не хватает, сверься со спекой, а не с догадками.

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

## Chunk 1: Основание

Результат чанка: монорепо собирается, база поднимается миграциями, шифрование работает и покрыто тестами.

### Task 1: Каркас монорепо

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.nvmrc`, `.editorconfig`

- [ ] **Step 1: Создать `pnpm-workspace.yaml`**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 2: Создать корневой `package.json`**

Поле `packageManager` фиксирует версию pnpm — без него разные машины ставят разные версии и лок-файл начинает конфликтовать.

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
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "build": "pnpm -r build"
  },
  "devDependencies": {
    "typescript": "^5.7.2"
  }
}
```

- [ ] **Step 3: Создать `tsconfig.base.json`**

`strict` и `noUncheckedIndexedAccess` включены намеренно: система работает с секретами, и молчаливый `undefined` из массива здесь дороже, чем неудобство при написании кода.

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
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

- [ ] **Step 4: Создать `.nvmrc`**

```
22
```

- [ ] **Step 5: Проверить установку**

Run: `pnpm install`
Expected: установка проходит, появляется `pnpm-lock.yaml`, предупреждений об отсутствующих workspace нет.

- [ ] **Step 6: Коммит**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .nvmrc pnpm-lock.yaml
git commit -m "Создать каркас монорепо"
```

---

### Task 2: Перечисления в пакете контракта

Перечисления — первое, что появляется в коде, потому что на них ссылаются и схема базы, и API, и фронтенд. Правило пользователя: значение, используемое дважды и более, оформляется перечислением, а не union-типом.

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
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
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
  "include": ["src/**/*"]
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

- [ ] **Step 4: Написать падающий тест `packages/shared/src/enums.test.ts`**

Тест закрепляет два инварианта спеки, которые легко нарушить при последующем редактировании: секций ровно шесть (закрытый список из ТЗ 3) и уровень «нет» отсутствует среди значений, потому что выражается отсутствием строки выдачи (спека 4.3).

```typescript
import { describe, expect, it } from 'vitest';

import { AccessLevel, AuditSubjectKind, Section, SubjectKind } from './enums.js';

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

- [ ] **Step 5: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/shared test`
Expected: FAIL — модуль `./enums.js` не найден.

- [ ] **Step 6: Создать `packages/shared/src/enums.ts`**

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

- [ ] **Step 7: Создать `packages/shared/src/index.ts`**

```typescript
export * from './enums.js';
```

- [ ] **Step 8: Запустить тест**

Run: `pnpm --filter @cairn/shared test`
Expected: PASS, 4 теста.

- [ ] **Step 9: Коммит**

```bash
git add packages/shared
git commit -m "Добавить перечисления секций и уровней доступа"
```

---

### Task 3: Каркас бэкенда с Vitest

Отдельная задача, потому что связка NestJS с Vitest требует нестандартной настройки: декораторы NestJS опираются на `emitDecoratorMetadata`, а esbuild, используемый Vitest по умолчанию, эту опцию не поддерживает. Без плагина SWC внедрение зависимостей молча перестаёт работать в тестах.

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`
- Create: `apps/api/src/app.module.ts`, `apps/api/src/main.ts`
- Test: `apps/api/src/app.module.test.ts`

- [ ] **Step 1: Создать `apps/api/package.json`**

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

`experimentalDecorators` и `emitDecoratorMetadata` обязательны для NestJS. `module: CommonJS` — потому что экосистема NestJS 11 всё ещё рассчитана на него.

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "rootDir": "./src",
    "outDir": "./dist",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*", "drizzle.config.ts"]
}
```

- [ ] **Step 3: Создать `apps/api/vitest.config.ts`**

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
    alias: { '@': resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Интеграционные тесты поднимают контейнер с базой.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
```

- [ ] **Step 4: Написать падающий тест `apps/api/src/app.module.test.ts`**

Тест проверяет, что модуль собирается и внедрение зависимостей работает — то есть что связка SWC и Vitest настроена верно. Без него поломка настройки обнаружится только в следующей задаче и будет выглядеть как ошибка в её коде.

```typescript
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AppModule } from './app.module.js';

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

- [ ] **Step 5: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test`
Expected: FAIL — модуль `./app.module.js` не найден.

- [ ] **Step 6: Создать `apps/api/src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';

/** Корневой модуль приложения. Модули добавляются по мере реализации. */
@Module({
  imports: [],
})
export class AppModule {}
```

- [ ] **Step 7: Создать `apps/api/src/main.ts`**

```typescript
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module.js';

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

- [ ] **Step 8: Запустить тест**

Run: `pnpm --filter @cairn/api test`
Expected: PASS, 1 тест.

- [ ] **Step 9: Коммит**

```bash
git add apps/api
git commit -m "Добавить каркас бэкенда с настроенным Vitest"
```

---

### Task 4: Развёртывание базы данных

Две роли базы (спека 4.7) заводятся здесь, до появления таблиц: журнал должен быть недоступен на запись приложению с самого первого дня, а не после того, как о нём вспомнят.

**Files:**
- Create: `docker-compose.yml`, `.env.example`
- Create: `docker/postgres/init/01-roles.sql`

- [ ] **Step 1: Создать `docker/postgres/init/01-roles.sql`**

Скрипт выполняется при первой инициализации кластера. Роль `cairn_app` получит права на таблицы в следующей задаче, после того как миграции их создадут.

```sql
-- Роль приложения. Привилегии на таблицы выдаются после миграций (см. 02-grants.sql).
CREATE ROLE cairn_app WITH LOGIN PASSWORD 'cairn_app_password';

GRANT CONNECT ON DATABASE cairn TO cairn_app;
GRANT USAGE ON SCHEMA public TO cairn_app;
```

- [ ] **Step 2: Создать `docker-compose.yml`**

Реверс-прокси добавляется в чанке 4, когда появится что проксировать.

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: cairn
      POSTGRES_USER: cairn_owner
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD не задан}
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./docker/postgres/init:/docker-entrypoint-initdb.d:ro
    ports:
      - '5432:5432'
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U cairn_owner -d cairn']
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  postgres-data:
```

- [ ] **Step 3: Создать `.env.example`**

Ключ шифрования генерируется командой из комментария. Приложение откажется стартовать, если ключ не 32 байта (спека 4.9).

```bash
# Пароль владельца схемы. Этой ролью выполняются миграции.
POSTGRES_PASSWORD=change_me

# Строка подключения для миграций — полные права на схему.
DATABASE_OWNER_URL=postgres://cairn_owner:change_me@localhost:5432/cairn

# Строка подключения приложения — без права изменять журнал.
DATABASE_URL=postgres://cairn_app:cairn_app_password@localhost:5432/cairn

# Ключ прикладного шифрования: 32 байта в base64.
# Сгенерировать: openssl rand -base64 32
CAIRN_ENCRYPTION_KEY=

# Адрес веб-приложения, используется в ссылках приглашений.
CAIRN_WEB_URL=http://localhost:3000
```

- [ ] **Step 4: Проверить, что база поднимается**

```bash
cp .env.example .env
# Задать POSTGRES_PASSWORD и CAIRN_ENCRYPTION_KEY в .env
docker compose up -d postgres
docker compose exec postgres psql -U cairn_owner -d cairn -c "\du"
```

Expected: в списке ролей присутствуют `cairn_owner` и `cairn_app`.

- [ ] **Step 5: Коммит**

```bash
git add docker-compose.yml .env.example docker/
git commit -m "Добавить развёртывание базы с раздельными ролями"
```

---

### Task 5: Схема базы — субъекты и пользователи

**Files:**
- Create: `apps/api/src/db/schema/subjects.ts`, `apps/api/src/db/schema/users.ts`, `apps/api/src/db/schema/index.ts`
- Create: `apps/api/drizzle.config.ts`
- Test: `apps/api/src/db/schema/schema.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/db/schema/schema.test.ts`**

Тест проверяет соответствие схемы перечислениям из контракта. Это защита от расхождения: перечисление в `@cairn/shared` и перечисление PostgreSQL — два разных объявления одних и тех же значений, и они обязаны совпадать.

```typescript
import { AuditSubjectKind, SubjectKind } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { subjectKindEnum, subjects } from './subjects.js';
import { users } from './users.js';

describe('субъекты', () => {
  it('перечисление вида субъекта совпадает с контрактом', () => {
    expect(subjectKindEnum.enumValues).toEqual(Object.values(SubjectKind));
  });

  it('перечисление субъектов не совпадает с перечислением журнала', () => {
    // Разные перечисления: журнал знает про system, модель субъектов — нет (спека 4.7).
    expect(subjectKindEnum.enumValues).not.toContain(AuditSubjectKind.System);
  });

  it('содержит признак отзыва', () => {
    expect(subjects.revokedAt).toBeDefined();
  });
});

describe('пользователи', () => {
  it('не содержит поля статуса', () => {
    // Активность определяется через subjects.revokedAt — единственный источник истины (спека 4.2).
    expect('status' in users).toBe(false);
  });

  it('хранит секрет второго фактора в зашифрованном виде', () => {
    expect(users.totpSecretEncrypted).toBeDefined();
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/db/schema`
Expected: FAIL — модуль `./subjects.js` не найден.

- [ ] **Step 3: Создать `apps/api/src/db/schema/subjects.ts`**

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

- [ ] **Step 4: Создать `apps/api/src/db/schema/users.ts`**

```typescript
import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { subjects } from './subjects.js';

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

- [ ] **Step 5: Создать `apps/api/src/db/schema/index.ts`**

```typescript
export * from './subjects.js';
export * from './users.js';
```

- [ ] **Step 6: Создать `apps/api/drizzle.config.ts`**

Миграции выполняются ролью-владельцем: роль приложения не имеет прав на изменение схемы.

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_OWNER_URL ?? '',
  },
});
```

- [ ] **Step 7: Запустить тест**

Run: `pnpm --filter @cairn/api test src/db/schema`
Expected: PASS, 5 тестов.

- [ ] **Step 8: Коммит**

```bash
git add apps/api/src/db apps/api/drizzle.config.ts
git commit -m "Добавить таблицы субъектов и пользователей"
```

---

### Task 6: Схема базы — проекты и выдачи доступа

**Files:**
- Create: `apps/api/src/db/schema/projects.ts`, `apps/api/src/db/schema/grants.ts`
- Modify: `apps/api/src/db/schema/index.ts`
- Test: `apps/api/src/db/schema/grants.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/db/schema/grants.test.ts`**

```typescript
import { AccessLevel, Section } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { accessLevelEnum, grants, sectionEnum } from './grants.js';

describe('выдачи доступа', () => {
  it('перечисление секций совпадает с контрактом', () => {
    expect(sectionEnum.enumValues).toEqual(Object.values(Section));
  });

  it('перечисление уровней не содержит значения «нет»', () => {
    // Отсутствие доступа выражается отсутствием строки (спека 4.3).
    expect(accessLevelEnum.enumValues).toEqual(Object.values(AccessLevel));
    expect(accessLevelEnum.enumValues).not.toContain('none');
  });

  it('содержит все шесть секций, включая нереализованные', () => {
    // Выдать доступ к будущей секции можно до её реализации (спека 4.3).
    expect(sectionEnum.enumValues).toHaveLength(6);
  });

  it('хранит, кто выдал доступ', () => {
    expect(grants.grantedBy).toBeDefined();
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/db/schema/grants`
Expected: FAIL — модуль `./grants.js` не найден.

- [ ] **Step 3: Создать `apps/api/src/db/schema/projects.ts`**

```typescript
import { ProjectLifecycle } from '@cairn/shared';
import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './users.js';

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

- [ ] **Step 4: Создать `apps/api/src/db/schema/grants.ts`**

```typescript
import { AccessLevel, Section } from '@cairn/shared';
import { pgEnum, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { projects } from './projects.js';
import { subjects } from './subjects.js';
import { users } from './users.js';

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
  (table) => [unique('grants_subject_project_section').on(table.subjectId, table.projectId, table.section)],
);

/** Строка таблицы выдач. */
export type Grant = typeof grants.$inferSelect;
```

- [ ] **Step 5: Дополнить `apps/api/src/db/schema/index.ts`**

```typescript
export * from './grants.js';
export * from './projects.js';
export * from './subjects.js';
export * from './users.js';
```

- [ ] **Step 6: Запустить тест**

Run: `pnpm --filter @cairn/api test src/db/schema`
Expected: PASS, 9 тестов.

- [ ] **Step 7: Коммит**

```bash
git add apps/api/src/db/schema
git commit -m "Добавить таблицы проектов и выдач доступа"
```

---

### Task 7: Схема базы — сессии, ссылки, челленджи, журнал

**Files:**
- Create: `apps/api/src/db/schema/sessions.ts`, `apps/api/src/db/schema/invitations.ts`, `apps/api/src/db/schema/totp-challenges.ts`, `apps/api/src/db/schema/audit-log.ts`
- Modify: `apps/api/src/db/schema/index.ts`
- Test: `apps/api/src/db/schema/audit-log.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/db/schema/audit-log.test.ts`**

```typescript
import { AuditSubjectKind } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { auditLog, auditSubjectKindEnum } from './audit-log.js';
import { invitations } from './invitations.js';

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

describe('ссылки на установку пароля', () => {
  it('не хранит адрес почты', () => {
    // Адрес живёт только в users — два места хранения разошлись бы (спека 4.6).
    expect('email' in invitations).toBe(false);
  });

  it('различает приглашение и сброс пароля', () => {
    expect(invitations.kind).toBeDefined();
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @cairn/api test src/db/schema/audit-log`
Expected: FAIL — модуль `./audit-log.js` не найден.

- [ ] **Step 3: Создать `apps/api/src/db/schema/sessions.ts`**

```typescript
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { subjects } from './subjects.js';

/**
 * Сессии. Хранятся в базе ради мгновенного отзыва: для системы с секретами
 * отозвать доступ нужно немедленно, а не по истечении срока токена (спека 4.5).
 *
 * В базе лежит только хэш токена — сам токен известен лишь браузеру.
 */
export const sessions = pgTable('sessions', {
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
});

/** Строка таблицы сессий. */
export type Session = typeof sessions.$inferSelect;
```

- [ ] **Step 4: Создать `apps/api/src/db/schema/invitations.ts`**

```typescript
import { InvitationKind } from '@cairn/shared';
import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './users.js';

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

- [ ] **Step 5: Создать `apps/api/src/db/schema/totp-challenges.ts`**

```typescript
import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './users.js';

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

- [ ] **Step 6: Создать `apps/api/src/db/schema/audit-log.ts`**

```typescript
import { AuditSubjectKind } from '@cairn/shared';
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { projects } from './projects.js';
import { subjects } from './subjects.js';

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

- [ ] **Step 7: Дополнить `apps/api/src/db/schema/index.ts`**

```typescript
export * from './audit-log.js';
export * from './grants.js';
export * from './invitations.js';
export * from './projects.js';
export * from './sessions.js';
export * from './subjects.js';
export * from './totp-challenges.js';
export * from './users.js';
```

- [ ] **Step 8: Запустить тест**

Run: `pnpm --filter @cairn/api test src/db/schema`
Expected: PASS, 14 тестов.

- [ ] **Step 9: Коммит**

```bash
git add apps/api/src/db/schema
git commit -m "Добавить таблицы сессий, ссылок, челленджей и журнала"
```

---

### Task 8: Миграции и права роли приложения

Права выдаются отдельной миграцией после создания таблиц. Порядок важен: выдать права на несуществующую таблицу нельзя.

**Files:**
- Create: `apps/api/src/db/migrate.ts`
- Create: `apps/api/drizzle/0001_grant_app_privileges.sql` (после генерации)

- [ ] **Step 1: Сгенерировать миграцию схемы**

Run: `pnpm --filter @cairn/api db:generate`
Expected: в `apps/api/drizzle/` появляется файл `0000_*.sql` с созданием восьми таблиц и перечислений.

- [ ] **Step 2: Создать `apps/api/src/db/migrate.ts`**

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * Применяет миграции ролью-владельцем схемы.
 *
 * Роль приложения прав на изменение схемы не имеет, поэтому используется
 * отдельная строка подключения (спека 4.7).
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_OWNER_URL;

  if (!url) {
    throw new Error('DATABASE_OWNER_URL не задан');
  }

  const client = postgres(url, { max: 1 });

  await migrate(drizzle(client), { migrationsFolder: './drizzle' });
  await client.end();
}

void main();
```

- [ ] **Step 3: Написать миграцию прав вручную**

Создать `apps/api/drizzle/0001_grant_app_privileges.sql`. Права на `audit_log` намеренно урезаны: роль приложения не может ни изменить, ни удалить запись журнала.

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON
  subjects, users, projects, grants, sessions, invitations, totp_challenges
TO cairn_app;

-- Журнал только на добавление: ни UPDATE, ни DELETE (спека 4.7).
GRANT SELECT, INSERT ON audit_log TO cairn_app;

-- Таблица служебных записей Drizzle: приложению нужна только на чтение.
GRANT SELECT ON drizzle.__drizzle_migrations TO cairn_app;
GRANT USAGE ON SCHEMA drizzle TO cairn_app;
```

- [ ] **Step 4: Зарегистрировать миграцию прав**

Drizzle отслеживает применённые миграции по файлу `apps/api/drizzle/meta/_journal.json`. Добавить в массив `entries` запись для `0001_grant_app_privileges`, скопировав формат соседней записи и увеличив `idx` на единицу.

- [ ] **Step 5: Применить миграции**

```bash
docker compose up -d postgres
pnpm --filter @cairn/api db:migrate
```

Expected: вывод без ошибок.

- [ ] **Step 6: Проверить, что журнал защищён**

```bash
docker compose exec postgres psql -U cairn_app -d cairn \
  -c "INSERT INTO audit_log (subject_kind, subject_label, action) VALUES ('system', 'проверка', 'test');" \
  -c "DELETE FROM audit_log;"
```

Expected: `INSERT` проходит, `DELETE` завершается ошибкой `permission denied for table audit_log`. Это и есть проверяемое свойство: приложение может писать в журнал и не может его чистить.

- [ ] **Step 7: Убрать проверочную запись**

```bash
docker compose exec postgres psql -U cairn_owner -d cairn -c "DELETE FROM audit_log;"
```

- [ ] **Step 8: Коммит**

```bash
git add apps/api/drizzle apps/api/src/db/migrate.ts
git commit -m "Добавить миграции и права роли приложения"
```

---

### Task 9: Сервис прикладного шифрования

Самая ответственная единица чанка. Формат хранимого значения включает версию ключа, чтобы будущая ротация не требовала переписывать все существующие записи (спека 4.9).

**Files:**
- Create: `apps/api/src/crypto/crypto.service.ts`, `apps/api/src/crypto/crypto.module.ts`
- Test: `apps/api/src/crypto/crypto.service.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/crypto/crypto.service.test.ts`**

Тест на разные шифротексты при одном открытом тексте — не придирка: повторяющийся nonce в AES-GCM разрушает стойкость шифра, и эта ошибка не проявляется иначе.

```typescript
import { randomBytes } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import { CryptoService } from './crypto.service.js';

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

    it('отказывается работать с ключом не в base64', () => {
      expect(() => new CryptoService('не base64!!!')).toThrow();
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
      const [version, nonce, ciphertext, tag] = service.encrypt('значение').split(':');
      const corrupted = Buffer.from(ciphertext!, 'base64');
      corrupted[0] ^= 0xff;

      const payload = [version, nonce, corrupted.toString('base64'), tag].join(':');

      expect(() => service.decrypt(payload)).toThrow();
    });

    it('отвергает изменённый тег аутентификации', () => {
      const [version, nonce, ciphertext] = service.encrypt('значение').split(':');
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
Expected: FAIL — модуль `./crypto.service.js` не найден.

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

import { CryptoService, ENCRYPTION_KEY } from './crypto.service.js';

/**
 * Модуль шифрования. Глобальный: сервис нужен разным модулям, а состояние
 * у него единственное — ключ.
 */
@Global()
@Module({
  providers: [
    { provide: ENCRYPTION_KEY, useValue: process.env.CAIRN_ENCRYPTION_KEY },
    CryptoService,
  ],
  exports: [CryptoService],
})
export class CryptoModule {}
```

- [ ] **Step 6: Подключить модуль в `apps/api/src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';

import { CryptoModule } from './crypto/crypto.module.js';

/** Корневой модуль приложения. Модули добавляются по мере реализации. */
@Module({
  imports: [CryptoModule],
})
export class AppModule {}
```

- [ ] **Step 7: Запустить все тесты**

Run: `pnpm test`
Expected: PASS во всех пакетах. Тест сборки `AppModule` требует переменной `CAIRN_ENCRYPTION_KEY` — если он падает с сообщением о ключе, значит проверка работает; добавь ключ в `.env` и в окружение тестов через `vitest.config.ts` (`test.env`).

- [ ] **Step 8: Коммит**

```bash
git add apps/api/src/crypto apps/api/src/app.module.ts apps/api/vitest.config.ts
git commit -m "Добавить сервис прикладного шифрования"
```

---

**Результат чанка 1:** монорепо собирается, восемь таблиц созданы миграциями, журнал защищён правами базы, шифрование работает и покрыто тестами. Следующий чанк добавляет модель прав.
