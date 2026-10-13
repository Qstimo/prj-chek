# Карточка пользователя и доступы с его стороны — план реализации

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** У человека появляется имя и карточка `/users/:id` с паспортом, действиями и своей матрицей доступов «проект × секция»; выдачи правятся с двух сторон одной таблицы, запись остаётся одна.

**Architecture:** Пять частей по возрастанию цены ошибки: контракт (ничего не ломает), API пользователя, выдачи со стороны субъекта, интерфейс списка и карточки, интерфейс матрицы и доводки. Имя живёт в существующей колонке `subjects.label` — схема базы не меняется, миграции нет. Запись выдач остаётся на существующих `PUT`/`DELETE /projects/:projectId/grants`; добавляется только чтение `GET /users/:id/grants`.

**Tech Stack:** pnpm workspaces, NestJS, Drizzle + PostgreSQL, zod в `packages/shared`, Next.js 15, Vitest + React Testing Library, Testcontainers.

**Основание:** `docs/superpowers/specs/2026-10-13-cairn-user-card-design.md`

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

Соглашения: компонент до 100 строк в своей директории с `index.ts`, пропсы — `IProps` в `types.ts`, TSDoc на русском, `any` запрещён, массивы и объекты из JSX — в `constants.ts`.

**Осторожно с `pnpm --filter ... test -- --run <путь>`**: двойное `--` съедает фильтр, и запускается весь набор, включая Testcontainers. Точечно — через `npx vitest run` из каталога приложения.

**Миграции в этой работе нет.** Если появилось желание добавить колонку `users.name` — вернись к разделу 2.1 дизайна: имя кладётся в `subjects.label` именно потому, что журнал денормализует его оттуда.

### Структура файлов

| Файл | Ответственность |
|---|---|
| `packages/shared/src/schemas/user.ts` | `name` в строке списка, имя в приглашении, схема правки |
| `packages/shared/src/schemas/grant.ts` | строка матрицы человека `userGrantRowSchema` |
| `apps/api/src/users/users.service.ts` | `list` с именем, `findById`, `update`, `subjectIdOfUser` |
| `apps/api/src/users/users.controller.ts` | `GET /users/:id`, `PATCH /users/:id` |
| `apps/api/src/invitations/invitations.service.ts` | имя при создании субъекта, имя в журнале принятия ссылки |
| `apps/api/src/grants/grants.repository.ts` | `matrixForSubject`, `set` возвращает прежний уровень |
| `apps/api/src/grants/grants.service.ts` | `grant.created` против `grant.updated` |
| `apps/api/src/grants/user-grants.controller.ts` | `GET /users/:userId/grants` |
| `apps/api/src/audit/audit.types.ts` | действие `user.updated` |
| `apps/web/src/api/grant-change.ts` | `sendGrantChange` — один путь записи ячейки для двух матриц |
| `apps/web/src/components/UserForm/` | имя и почта; одна форма на создание и правку |
| `apps/web/src/components/UserCard/` | паспорт, состояние, действия |
| `apps/web/src/components/UserGrantsMatrix/` | матрица «проект × секция» и добавление проекта |
| `apps/web/src/components/AccessMatrix/` | «Полный доступ» в строке суперадмина |
| `apps/web/src/app/(app)/users/[id]/` | страница карточки, `UserScreen`, `EditUserPanel` |
| `apps/web/src/app/(app)/users/NewUserPanel.tsx` | создание в выезжающей панели |

Удаляется: `apps/web/src/components/InviteForm/` — его место занимает `UserForm`.

---

## Chunk 1: Контракт

### Task 1.1: Имя в строке списка и в приглашении

**Files:**
- Modify: `packages/shared/src/schemas/user.ts`
- Create: `packages/shared/src/schemas/user.test.ts`

- [ ] **Step 1: Падающие тесты**

Файла тестов для `user.ts` ещё нет — создать:

```ts
import { describe, expect, it } from 'vitest';

import { inviteUserSchema, userUpdateSchema } from './user';

describe('приглашение', () => {
  it('требует имя', () => {
    // Имя обязательно: без него карточка нечего показывать, кроме логина.
    expect(inviteUserSchema.safeParse({ email: 'anna@example.com' }).success).toBe(false);
  });

  it('обрезает имя по краям и приводит почту к нижнему регистру', () => {
    const parsed = inviteUserSchema.parse({ name: '  Анна  ', email: 'Anna@Example.COM' });

    expect(parsed).toEqual({ name: 'Анна', email: 'anna@example.com' });
  });
});

describe('правка учётки', () => {
  it('принимает одно поле', () => {
    expect(userUpdateSchema.parse({ name: 'Анна' })).toEqual({ name: 'Анна' });
  });

  it('отвергает пустую правку', () => {
    // Запрос без изменений завершился бы успехом, ничего не изменив.
    expect(userUpdateSchema.safeParse({}).success).toBe(false);
  });

  it('отвергает пустое имя', () => {
    expect(userUpdateSchema.safeParse({ name: '   ' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd packages/shared && npx vitest run src/schemas/user.test.ts`
Expected: FAIL — `userUpdateSchema` не экспортируется.

- [ ] **Step 3: Реализация**

В `userRowSchema`, перед `email`:

```ts
  /**
   * Имя для показа. Хранится в `subjects.label`.
   *
   * Логином остаётся почта: имя не уникально и меняется свободно.
   */
  name: z.string(),
```

`inviteUserSchema` заменить на:

```ts
/** Приглашение нового пользователя. */
export const inviteUserSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().email().toLowerCase(),
});
```

После него добавить:

```ts
/**
 * Правка учётки: имя и почта.
 *
 * Оба поля необязательны по отдельности, но пустая правка отвергается:
 * запрос без изменений завершился бы успехом, ничего не изменив.
 */
export const userUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    email: z.string().email().toLowerCase().optional(),
  })
  .refine((value) => value.name !== undefined || value.email !== undefined, {
    message: 'Нужно изменить имя или почту',
  });
```

И к типам в конце файла:

```ts
/** Данные правки учётки. */
export type UserUpdate = z.infer<typeof userUpdateSchema>;
```

- [ ] **Step 4: Запустить**

Run: `cd packages/shared && npx vitest run`
Expected: PASS. `pnpm typecheck` покажет, что API и веб ещё не знают про `name` — это ожидаемо и чинится в Chunk 2 и 4.

- [ ] **Step 5: Коммит**

```bash
git add packages/shared/src
git commit -m "Завести имя человека и правку учётки в контракте"
```

### Task 1.2: Строка матрицы человека

**Files:**
- Modify: `packages/shared/src/schemas/grant.ts`

- [ ] **Step 1: Падающий тест**

Файла тестов для `grant.ts` нет — создать `packages/shared/src/schemas/grant.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { AccessLevel, Section } from '../enums';
import { userGrantRowSchema } from './grant';

describe('строка матрицы человека', () => {
  it('держит проект и его уровни', () => {
    const parsed = userGrantRowSchema.parse({
      projectId: '11111111-1111-1111-1111-111111111111',
      projectName: 'CAIRN',
      levels: { [Section.Info]: AccessLevel.Read },
    });

    expect(parsed.levels[Section.Info]).toBe(AccessLevel.Read);
  });

  it('принимает проект без уровней', () => {
    // Строка без выдач появляется, когда проект только что добавлен в матрицу.
    const parsed = userGrantRowSchema.parse({
      projectId: '11111111-1111-1111-1111-111111111111',
      projectName: 'CAIRN',
      levels: {},
    });

    expect(parsed.levels).toEqual({});
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `cd packages/shared && npx vitest run src/schemas/grant.test.ts`
Expected: FAIL — `userGrantRowSchema` не экспортируется.

- [ ] **Step 3: Реализация**

В конец `grant.ts`, перед блоком типов:

```ts
/**
 * Строка матрицы человека: проект и его уровни по секциям.
 *
 * Проектов без выдач в ответе нет: карточка отвечает на вопрос «куда
 * у него есть доступ», а не перечисляет все проекты системы (спека 2.4).
 */
export const userGrantRowSchema = z.object({
  projectId: z.string().uuid(),
  projectName: z.string(),
  levels: z.record(z.nativeEnum(Section), z.nativeEnum(AccessLevel)),
});
```

И к типам:

```ts
/**
 * Строка матрицы человека.
 *
 * `levels` переопределён частичной записью по той же причине, что
 * и у {@link GrantMatrixRow}: `z.record` с перечислением в ключе
 * выводится в zod полным `Record`.
 */
export type UserGrantRow = Omit<z.infer<typeof userGrantRowSchema>, 'levels'> & {
  levels: Partial<Record<Section, AccessLevel>>;
};
```

- [ ] **Step 4: Запустить**

Run: `cd packages/shared && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add packages/shared/src
git commit -m "Завести строку матрицы доступов человека"
```

### Task 1.3: Приглашение заводит субъект с именем

**Files:**
- Modify: `apps/api/src/invitations/invitations.service.ts`
- Modify: `apps/api/src/invitations/invitations.controller.ts`
- Modify: `apps/api/src/invitations/invitations.service.test.ts`

- [ ] **Step 1: Падающие тесты**

В `invitations.service.test.ts`, в набор про `invite`:

```ts
it('заводит субъект с именем', async () => {
  await service.invite(actor(), 'Анна', 'anna@example.com');

  const [row] = await testDb.db
    .select({ label: subjects.label })
    .from(subjects)
    .where(eq(subjects.label, 'Анна'));

  expect(row).toBeDefined();
});

it('обновляет имя при повторной выдаче ссылки', async () => {
  // Форма одна: человек вписывает актуальные данные, и имя не должно
  // застревать на том, что ввели в первый раз.
  await service.invite(actor(), 'Анна', 'anna@example.com');
  await service.invite(actor(), 'Анна Петрова', 'anna@example.com');

  const labels = await testDb.db.select({ label: subjects.label }).from(subjects);

  expect(labels.map((row) => row.label)).toContain('Анна Петрова');
});
```

Понадобится импорт `import { eq } from 'drizzle-orm';` — в этом файле его ещё нет.

Существующие вызовы `service.invite(actor(), 'почта')` дополнить именем вторым аргументом: их около десятка в `invitations.service.test.ts` и ещё несколько в `password-reset.test.ts`, который готовит ссылки тем же методом.

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/api && npx vitest run src/invitations/invitations.service.test.ts`
Expected: FAIL — `invite` принимает два аргумента.

- [ ] **Step 3: Реализация**

Сигнатура `invite` и создание субъекта:

```ts
  async invite(actor: InvitingActor, name: string, email: string): Promise<IssuedLink> {
    const normalized = email.toLowerCase();

    return this.db.transaction(async (tx) => {
      const existing = await this.findUserByEmail(tx, normalized);

      if (existing?.passwordHash) {
        throw new ConflictException(
          'Пользователь с таким адресом уже работает в системе. Для смены пароля используйте сброс.',
        );
      }

      const user = existing ?? (await this.createUser(tx, name, normalized));

      // Повторное приглашение правит имя: форма одна, и человек вписывает
      // в неё актуальные данные, а не те, что были в первый раз.
      if (existing) {
        await tx.update(subjects).set({ label: name }).where(eq(subjects.id, existing.subjectId));
      }

      const link = await this.issueLink(tx, user.id, InvitationKind.Invitation, actor.userId);
      ...
```

`createUser`:

```ts
  /** Создаёт субъект и пользователя без пароля. Имя — метка субъекта. */
  private async createUser(tx: Executor, name: string, email: string): Promise<User> {
    const [subject] = await tx
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: name })
      .returning();

    const [user] = await tx.insert(users).values({ subjectId: subject!.id, email }).returning();

    return user!;
  }
```

В `invitations.controller.ts`, в `invite`, передать имя:

```ts
    const link = await this.invitations.invite(
      { id: subject.id, label: subject.label, userId },
      body.name,
      body.email,
    );
```

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/invitations`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/invitations
git commit -m "Приглашать человека с именем"
```

### Task 1.4: Журнал принятия ссылки называет человека именем

**Files:**
- Modify: `apps/api/src/invitations/invitations.service.ts`
- Modify: `apps/api/src/invitations/password-reset.test.ts`

- [ ] **Step 1: Падающий тест**

Тесты `acceptLink` живут в `password-reset.test.ts`, в наборе «приём ссылки», — туда и добавлять (`eq` там уже импортирован):

```ts
it('в журнале принятия ссылки стоит имя, а не почта', async () => {
  // Все остальные записи приходят с subjects.label: иначе одна учётка
  // выглядела бы в журнале то именем, то почтой.
  const link = await service.invite(actor(), 'Анна', 'anna@example.com');

  await service.acceptLink(link.token, 'очень длинный пароль', {});

  const [entry] = await testDb.db
    .select({ label: auditLog.subjectLabel })
    .from(auditLog)
    .where(eq(auditLog.action, AuditAction.InvitationAccepted));

  expect(entry?.label).toBe('Анна');
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `cd apps/api && npx vitest run src/invitations/password-reset.test.ts`
Expected: FAIL — в журнале `anna@example.com`.

- [ ] **Step 3: Реализация**

В `acceptLink`, рядом с выборкой пользователя, достать метку субъекта и использовать её в записи журнала:

```ts
      const [found] = await tx
        .select({ user: users, label: subjects.label })
        .from(users)
        .innerJoin(subjects, eq(subjects.id, users.subjectId))
        .where(eq(users.id, link.userId))
        .limit(1);

      if (!found) {
        throw new NotFoundException('Пользователь не найден');
      }

      const user = found.user;
```

и в `audit.record` — `label: found.label` вместо `label: user.email`.

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/invitations`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/invitations
git commit -m "Называть человека именем в журнале принятия ссылки"
```

---

## Chunk 2: API пользователя

### Task 2.1: Список отдаёт имя, появляется `findById`

**Files:**
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/src/users/users.service.test.ts`

- [ ] **Step 1: Падающие тесты**

В `users.service.test.ts`:

```ts
it('отдаёт имя из метки субъекта', async () => {
  const rows = await service.list();

  expect(rows.find((row) => row.id === target.userId)?.name).toBe('user@cairn.local');
});

describe('findById', () => {
  it('возвращает одного пользователя', async () => {
    const row = await service.findById(target.userId);

    expect(row.email).toBe('user@cairn.local');
  });

  it('для неизвестного бросает «не найдено»', async () => {
    await expect(service.findById(admin.subjectId)).rejects.toThrow(/не найден/i);
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/api && npx vitest run src/users/users.service.test.ts`
Expected: FAIL — `name` отсутствует, `findById` не определён.

- [ ] **Step 3: Реализация**

Выборку из `list` вынести в закрытый метод и добавить имя:

```ts
  /** Возвращает список пользователей. */
  async list(): Promise<UserRow[]> {
    return this.rows();
  }

  /** Возвращает одного пользователя либо бросает «не найдено». */
  async findById(userId: string): Promise<UserRow> {
    const [row] = await this.rows(eq(users.id, userId));

    if (!row) {
      throw new NotFoundException('Пользователь не найден');
    }

    return row;
  }

  /**
   * Собирает представления пользователей.
   *
   * Имя приходит из `subjects.label`: отдельного поля имени у учётки нет,
   * и журнал денормализует именно метку субъекта (спека 2.1).
   *
   * Хэш пароля и секрет второго фактора в ответ не попадают (ТЗ 9).
   */
  private async rows(where?: SQL): Promise<UserRow[]> {
    const base = this.db
      .select({
        id: users.id,
        subjectId: users.subjectId,
        subjectKind: subjects.kind,
        name: subjects.label,
        email: users.email,
        isSuperadmin: users.isSuperadmin,
        isTotpEnabled: users.isTotpEnabled,
        passwordHash: users.passwordHash,
        revokedAt: subjects.revokedAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .innerJoin(subjects, eq(subjects.id, users.subjectId));

    const rows = await (where ? base.where(where) : base).orderBy(users.createdAt);
    const lastLinks = await this.lastLinkKinds();

    return rows.map((row) => ({
      id: row.id,
      subjectId: row.subjectId,
      subjectKind: row.subjectKind,
      name: row.name,
      email: row.email,
      isSuperadmin: row.isSuperadmin,
      isTotpEnabled: row.isTotpEnabled,
      hasPassword: row.passwordHash !== null,
      isRevoked: row.revokedAt !== null,
      lastLinkKind: lastLinks.get(row.id) ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }
```

Импорт типа: `import { desc, eq, isNull, type SQL } from 'drizzle-orm';`

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/users/users.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/users
git commit -m "Отдавать имя пользователя и паспорт по одному"
```

### Task 2.2: Правка имени и почты

**Files:**
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/src/users/users.service.test.ts`

- [ ] **Step 1: Падающие тесты**

```ts
describe('update', () => {
  it('правит имя', async () => {
    const row = await service.update(actor(), target.userId, { name: 'Анна' });

    expect(row.name).toBe('Анна');
  });

  it('правит почту', async () => {
    const row = await service.update(actor(), target.userId, { email: 'anna@example.com' });

    expect(row.email).toBe('anna@example.com');
  });

  it('занятую почту отвергает', async () => {
    await expect(
      service.update(actor(), target.userId, { email: 'admin@cairn.local' }),
    ).rejects.toThrow(/занят/i);
  });

  it('смена почты завершает сессии', async () => {
    // Сменился логин: вход, выданный на прежний адрес, держать незачем.
    await testDb.db.transaction(async (tx) => {
      await sessions.create(tx, target.subjectId, {});
    });

    await service.update(actor(), target.userId, { email: 'anna@example.com' });

    const [entry] = await testDb.db
      .select({ metadata: auditLog.metadata })
      .from(auditLog)
      .where(eq(auditLog.action, AuditAction.UserUpdated));

    expect(entry?.metadata).toMatchObject({ revokedSessions: 1 });
  });

  it('смена только имени сессии не трогает', async () => {
    await testDb.db.transaction(async (tx) => {
      await sessions.create(tx, target.subjectId, {});
    });

    await service.update(actor(), target.userId, { name: 'Анна' });

    const [entry] = await testDb.db
      .select({ metadata: auditLog.metadata })
      .from(auditLog)
      .where(eq(auditLog.action, AuditAction.UserUpdated));

    expect(entry?.metadata).toMatchObject({ fields: ['name'], revokedSessions: 0 });
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/api && npx vitest run src/users/users.service.test.ts`
Expected: FAIL — `update` не определён, `AuditAction.UserUpdated` не существует.

- [ ] **Step 3: Реализация**

В `apps/api/src/audit/audit.types.ts`, в `AuditAction`, рядом с `SubjectRevoked`:

```ts
  UserUpdated = 'user.updated',
```

В `users.service.ts`:

```ts
  /**
   * Правит имя и почту.
   *
   * Имя живёт в `subjects.label`: его показывает журнал, и второе поле
   * имени разошлось бы с ним (спека 2.1). Смена почты завершает сессии —
   * сменился логин.
   */
  async update(actor: ManagingActor, userId: string, input: UserUpdate): Promise<UserRow> {
    const user = await this.requireUser(userId);

    await this.db.transaction(async (tx) => {
      let revokedSessions = 0;

      if (input.name !== undefined) {
        await tx.update(subjects).set({ label: input.name }).where(eq(subjects.id, user.subjectId));
      }

      if (input.email !== undefined && input.email !== user.email) {
        await this.requireFreeEmail(tx, input.email);

        await tx
          .update(users)
          .set({ email: input.email, updatedAt: new Date() })
          .where(eq(users.id, userId));

        revokedSessions = await this.sessions.revokeAllForSubject(tx, user.subjectId);
      }

      await this.audit.record(tx, this.actorFor(actor), {
        action: AuditAction.UserUpdated,
        entityType: 'user',
        entityId: userId,
        metadata: { fields: Object.keys(input), revokedSessions },
      });
    });

    return this.findById(userId);
  }

  /**
   * Требует, чтобы адрес был свободен.
   *
   * Почта — логин, и уникальный индекс всё равно не дал бы её занять;
   * проверка нужна, чтобы отказ был понятным `409`, а не сбоем вставки.
   */
  private async requireFreeEmail(tx: Executor, email: string): Promise<void> {
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      throw new ConflictException('Этот адрес уже занят');
    }
  }
```

Импорты: `ConflictException` из `@nestjs/common`, `type UserUpdate` из `@cairn/shared`, `type Executor` из `../db/db.types`.

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/users/users.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/users apps/api/src/audit
git commit -m "Править имя и почту пользователя"
```

### Task 2.3: Маршруты паспорта и правки

**Files:**
- Modify: `apps/api/src/users/users.controller.ts`
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/test/users.e2e.test.ts`

- [ ] **Step 1: Падающие тесты**

В `users.e2e.test.ts`:

```ts
it('суперадмин читает паспорт пользователя', async () => {
  const admin = await signIn('admin@cairn.local');

  const response = await admin.get(`/users/${targetUserId}`).expect(200);

  expect(response.body.email).toBe('user@cairn.local');
  expect(response.body.name).toBe('user@cairn.local');
});

it('неизвестный пользователь — 404', async () => {
  const admin = await signIn('admin@cairn.local');

  await admin.get('/users/11111111-1111-1111-1111-111111111111').expect(404);
});

it('суперадмин правит имя', async () => {
  const admin = await signIn('admin@cairn.local');

  const response = await admin
    .patch(`/users/${targetUserId}`)
    .send({ name: 'Анна' })
    .expect(200);

  expect(response.body.name).toBe('Анна');
});

it('занятая почта — 409', async () => {
  const admin = await signIn('admin@cairn.local');

  await admin
    .patch(`/users/${targetUserId}`)
    .send({ email: 'admin@cairn.local' })
    .expect(409);
});

it('пустая правка — 400', async () => {
  const admin = await signIn('admin@cairn.local');

  await admin.patch(`/users/${targetUserId}`).send({}).expect(400);
});

it('обычному пользователю правка закрыта', async () => {
  const user = await signIn('user@cairn.local');

  await user.patch(`/users/${targetUserId}`).send({ name: 'Анна' }).expect(403);
});
```

Существующий тест приглашения дополнить именем в теле: `.send({ name: 'Новый', email: 'new@cairn.local' })`.

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/api && npx vitest run test/users.e2e.test.ts`
Expected: FAIL — маршрутов нет, `404` на `GET /users/:id`.

- [ ] **Step 3: Реализация**

В `users.controller.ts` добавить маршруты (`Patch` и `UserUpdate` — в импорты):

```ts
  /** Паспорт одного пользователя. */
  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<UserRow> {
    return this.users.findById(id);
  }

  /** Правит имя и почту. */
  @Patch(':id')
  async update(
    @CurrentSubject() subject: RequestSubject,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(userUpdateSchema)) body: UserUpdate,
  ): Promise<UserRow> {
    return this.users.update({ id: subject.id, label: subject.label }, id, body);
  }
```

В `users.service.ts` добавить метод, который понадобится контроллеру выдач:

```ts
  /** Находит субъект пользователя: выдачи адресуются субъектом, а не учёткой. */
  async subjectIdOfUser(userId: string): Promise<string> {
    const user = await this.requireUser(userId);

    return user.subjectId;
  }
```

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run test/users.e2e.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/users apps/api/test
git commit -m "Открыть паспорт и правку пользователя по HTTP"
```

---

## Chunk 3: Выдачи со стороны человека

### Task 3.1: Матрица по субъекту

**Files:**
- Modify: `apps/api/src/grants/grants.repository.ts`
- Modify: `apps/api/src/grants/grants.repository.test.ts`

- [ ] **Step 1: Падающие тесты**

В `grants.repository.test.ts` новый набор:

```ts
describe('matrixForSubject', () => {
  it('собирает уровни по проектам', async () => {
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

    const rows = await repository.matrixForSubject(subjectId);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ projectName: 'Проект' });
    expect(rows[0]?.levels).toEqual({
      [Section.Info]: AccessLevel.Read,
      [Section.Docs]: AccessLevel.Write,
    });
  });

  it('не показывает проекты без выдач', async () => {
    // Карточка отвечает на вопрос «куда у него есть доступ» (спека 2.4).
    await testDb.db.insert(projects).values({ slug: 'drugoy', name: 'Другой' });

    expect(await repository.matrixForSubject(subjectId)).toEqual([]);
  });

  it('не показывает чужие выдачи', async () => {
    const [other] = await testDb.db
      .insert(subjects)
      .values({ kind: SubjectKind.User, label: 'чужой' })
      .returning();
    await testDb.db.transaction(async (tx) => {
      await repository.set(tx, projectId, grantedBy, {
        subjectId: other!.id,
        section: Section.Info,
        level: AccessLevel.Read,
      });
    });

    expect(await repository.matrixForSubject(subjectId)).toEqual([]);
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/api && npx vitest run src/grants/grants.repository.test.ts`
Expected: FAIL — `matrixForSubject` не определён.

- [ ] **Step 3: Реализация**

В `grants.repository.ts` (`projects` и `UserGrantRow` — в импорты):

```ts
  /**
   * Собирает матрицу «проект × секция» для субъекта.
   *
   * Зеркало {@link matrixForProject} и живёт рядом с ним: это один срез
   * одной таблицы, и расходиться им нельзя. Проектов без выдач в ответе
   * нет — отсутствие доступа выражается отсутствием строки.
   */
  async matrixForSubject(subjectId: string): Promise<UserGrantRow[]> {
    const rows = await this.db
      .select({
        projectId: grants.projectId,
        projectName: projects.name,
        section: grants.section,
        level: grants.level,
      })
      .from(grants)
      .innerJoin(projects, eq(projects.id, grants.projectId))
      .where(eq(grants.subjectId, subjectId))
      .orderBy(projects.name);

    const byProject = new Map<string, UserGrantRow>();

    for (const row of rows) {
      const existing: UserGrantRow = byProject.get(row.projectId) ?? {
        projectId: row.projectId,
        projectName: row.projectName,
        levels: {},
      };

      existing.levels[row.section] = row.level;
      byProject.set(row.projectId, existing);
    }

    return [...byProject.values()];
  }
```

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/grants/grants.repository.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/grants
git commit -m "Собирать матрицу доступов по субъекту"
```

### Task 3.2: Изменение выдачи называется изменением

**Files:**
- Modify: `apps/api/src/grants/grants.repository.ts`
- Modify: `apps/api/src/grants/grants.service.ts`
- Modify: `apps/api/src/grants/grants.repository.test.ts`
- Modify: `apps/api/test/grants.e2e.test.ts`

- [ ] **Step 1: Падающие тесты**

В `grants.repository.test.ts`, в набор `set`:

```ts
it('сообщает прежний уровень', async () => {
  // Без прежнего уровня по журналу не отличить выдачу от понижения.
  await testDb.db.transaction(async (tx) => {
    expect(
      await repository.set(tx, projectId, grantedBy, {
        subjectId,
        section: Section.Info,
        level: AccessLevel.Read,
      }),
    ).toBeNull();

    expect(
      await repository.set(tx, projectId, grantedBy, {
        subjectId,
        section: Section.Info,
        level: AccessLevel.Write,
      }),
    ).toBe(AccessLevel.Read);
  });
});
```

В `grants.e2e.test.ts`:

```ts
it('повторное назначение пишется как изменение', async () => {
  const admin = await signIn('admin@cairn.local');
  const body = { subjectId: contractorSubjectId, section: Section.Info };

  await admin.put(`/projects/${projectId}/grants`).send({ ...body, level: AccessLevel.Read });
  await admin.put(`/projects/${projectId}/grants`).send({ ...body, level: AccessLevel.Write });

  const entries = await testDb.db.select().from(auditLog);
  const updated = entries.find((entry) => entry.action === 'grant.updated');

  expect(updated?.metadata).toMatchObject({ previousLevel: AccessLevel.Read });
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/api && npx vitest run src/grants/grants.repository.test.ts test/grants.e2e.test.ts`
Expected: FAIL — `set` возвращает `void`, `grant.updated` в журнале не появляется.

- [ ] **Step 3: Реализация**

`set` в репозитории:

```ts
  /**
   * Устанавливает уровень доступа для пары «субъект × секция».
   *
   * Возвращает прежний уровень либо `null`, если выдачи не было: журналу
   * нужно отличать первое назначение от повышения и понижения.
   */
  async set(
    tx: Executor,
    projectId: string,
    grantedBy: string,
    input: GrantSet,
  ): Promise<AccessLevel | null> {
    const [existing] = await tx
      .select({ level: grants.level })
      .from(grants)
      .where(
        and(
          eq(grants.subjectId, input.subjectId),
          eq(grants.projectId, projectId),
          eq(grants.section, input.section),
        ),
      )
      .limit(1);

    await tx
      .insert(grants)
      .values({ ...input, projectId, grantedBy })
      .onConflictDoUpdate({
        target: [grants.subjectId, grants.projectId, grants.section],
        set: { level: input.level, grantedBy, grantedAt: new Date() },
      });

    return existing?.level ?? null;
  }
```

`AccessLevel` добавить в импорт типов репозитория.

`set` в службе:

```ts
  /** Устанавливает уровень доступа. */
  async set(actor: RequestSubject, projectId: string, input: GrantSet): Promise<void> {
    const grantedBy = await this.userIdOf(actor);

    await this.db.transaction(async (tx) => {
      const previous = await this.repository.set(tx, projectId, grantedBy, input);

      await this.audit.record(tx, actorOf(actor), {
        action: previous === null ? AuditAction.GrantCreated : AuditAction.GrantUpdated,
        entityType: 'grant',
        projectId,
        metadata: {
          subjectId: input.subjectId,
          section: input.section,
          level: input.level,
          ...(previous === null ? {} : { previousLevel: previous }),
        },
      });
    });
  }
```

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run src/grants test/grants.e2e.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/grants apps/api/test
git commit -m "Различать выдачу и изменение доступа в журнале"
```

### Task 3.3: Маршрут выдач человека

**Files:**
- Create: `apps/api/src/grants/user-grants.controller.ts`
- Modify: `apps/api/src/grants/grants.service.ts`
- Modify: `apps/api/src/grants/grants.module.ts`
- Modify: `apps/api/test/grants.e2e.test.ts`

- [ ] **Step 1: Падающие тесты**

В `grants.e2e.test.ts` (в `beforeEach` запомнить `contractorUserId` — идентификатор учётки подрядчика):

```ts
it('отдаёт выдачи человека по проектам', async () => {
  const admin = await signIn('admin@cairn.local');

  await admin
    .put(`/projects/${projectId}/grants`)
    .send({ subjectId: contractorSubjectId, section: Section.Info, level: AccessLevel.Read });

  const response = await admin.get(`/users/${contractorUserId}/grants`).expect(200);

  expect(response.body).toHaveLength(1);
  expect(response.body[0]).toMatchObject({ projectId, projectName: 'Проект' });
});

it('без выдач отдаёт пустой список', async () => {
  const admin = await signIn('admin@cairn.local');

  const response = await admin.get(`/users/${contractorUserId}/grants`).expect(200);

  expect(response.body).toEqual([]);
});

it('не-суперадмину выдачи человека закрыты', async () => {
  const user = await signIn('user@cairn.local');

  await user.get(`/users/${contractorUserId}/grants`).expect(403);
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/api && npx vitest run test/grants.e2e.test.ts`
Expected: FAIL — `404`, маршрута нет.

- [ ] **Step 3: Реализация**

В `grants.service.ts`:

```ts
  /** Возвращает матрицу «проект × секция» для субъекта. */
  async matrixForSubject(subjectId: string): Promise<UserGrantRow[]> {
    return this.repository.matrixForSubject(subjectId);
  }
```

Новый файл `user-grants.controller.ts`:

```ts
import { type UserGrantRow } from '@cairn/shared';
import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';

import { SuperadminGuard } from '../access/superadmin.guard';
import { SessionGuard } from '../auth/session.guard';
import { UsersService } from '../users/users.service';
import { GrantsService } from './grants.service';

/**
 * Выдачи со стороны человека — второй срез той же таблицы (спека 2.3).
 *
 * Живёт в модуле выдач, а не рядом с остальными `/users/*`: это выдачи,
 * и держать их в одном модуле важнее, чем собрать все маршруты человека
 * в одном файле. Записи здесь нет — она идёт проектными маршрутами,
 * чтобы правило и журналирование остались в одном месте.
 */
@Controller('users/:userId/grants')
@UseGuards(SessionGuard, SuperadminGuard)
export class UserGrantsController {
  constructor(
    private readonly grants: GrantsService,
    private readonly users: UsersService,
  ) {}

  /** Строки «проект × уровни» по проектам, где есть выдача. */
  @Get()
  async matrix(@Param('userId', ParseUUIDPipe) userId: string): Promise<UserGrantRow[]> {
    const subjectId = await this.users.subjectIdOfUser(userId);

    return this.grants.matrixForSubject(subjectId);
  }
}
```

В `grants.module.ts` добавить `UsersModule` в `imports` и `UserGrantsController` в `controllers`. Цикла не возникает: `UsersModule` модуль выдач не импортирует.

- [ ] **Step 4: Запустить**

Run: `cd apps/api && npx vitest run test/grants.e2e.test.ts src/app.module.test.ts`
Expected: PASS. `app.module.test.ts` проверяет сборку графа модулей — он подтвердит, что цикла нет.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/grants apps/api/test
git commit -m "Отдавать выдачи человека по его учётке"
```

---

## Chunk 4: Интерфейс — список и карточка

### Task 4.1: Форма учётки

**Files:**
- Create: `apps/web/src/components/UserForm/UserForm.tsx`
- Create: `apps/web/src/components/UserForm/types.ts`
- Create: `apps/web/src/components/UserForm/index.ts`
- Create: `apps/web/src/components/UserForm/UserForm.test.tsx`
- Delete: `apps/web/src/components/InviteForm/`

- [ ] **Step 1: Падающие тесты**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { UserForm } from './UserForm';

const EMPTY = { name: '', email: '' };

describe('UserForm', () => {
  it('не отправляет форму без имени', async () => {
    const onSubmit = vi.fn();
    render(<UserForm initial={EMPTY} submitLabel="Пригласить" onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Почта'), 'anna@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Пригласить' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('отдаёт имя и почту, обрезая края', async () => {
    const onSubmit = vi.fn();
    render(<UserForm initial={EMPTY} submitLabel="Пригласить" onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Имя'), '  Анна  ');
    await userEvent.type(screen.getByLabelText('Почта'), 'Anna@Example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Пригласить' }));

    expect(onSubmit).toHaveBeenCalledWith({ name: 'Анна', email: 'anna@example.com' });
  });

  it('показывает начальные значения при правке', () => {
    render(
      <UserForm
        initial={{ name: 'Анна', email: 'anna@example.com' }}
        submitLabel="Сохранить"
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Имя')).toHaveValue('Анна');
  });

  it('показывает отказ сервера', () => {
    render(
      <UserForm initial={EMPTY} submitLabel="Сохранить" onSubmit={vi.fn()} error="Этот адрес уже занят" />,
    );

    expect(screen.getByText(/уже занят/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/web && npx vitest run src/components/UserForm`
Expected: FAIL — модуля нет.

- [ ] **Step 3: Реализация**

`types.ts`:

```ts
/** Значения формы учётки. */
export interface UserFormValues {
  name: string;
  email: string;
}

/** Пропсы формы учётки. */
export interface IProps {
  initial: UserFormValues;
  /** Подпись кнопки: форма одна на приглашение и правку. */
  submitLabel: string;
  onSubmit: (values: UserFormValues) => void;
  error?: string;
  isSubmitting?: boolean;
}
```

`UserForm.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';

import { FormActions } from '../FormActions';
import { TextField } from '../TextField';
import type { IProps, UserFormValues } from './types';

/**
 * Форма учётки: имя и почта.
 *
 * Одна на приглашение и правку — поля те же, различается только подпись
 * кнопки. Пароля здесь нет намеренно: его задаёт сам человек по
 * одноразовой ссылке, администратор чужого пароля не знает.
 */
export function UserForm({ initial, submitLabel, onSubmit, error, isSubmitting = false }: IProps) {
  const [values, setValues] = useState<UserFormValues>(initial);

  const canSubmit =
    values.name.trim().length > 0 && values.email.trim().length > 0 && !isSubmitting;

  function change<K extends keyof UserFormValues>(key: K, value: string): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    onSubmit({ name: values.name.trim(), email: values.email.trim().toLowerCase() });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <TextField
        id="user-name"
        label="Имя"
        value={values.name}
        onChange={(value) => change('name', value)}
      />
      <TextField
        id="user-email"
        label="Почта"
        type="email"
        value={values.email}
        onChange={(value) => change('email', value)}
      />

      <FormActions
        submitLabel={submitLabel}
        canSubmit={canSubmit}
        isSubmitting={isSubmitting}
        error={error}
      />
    </form>
  );
}
```

`index.ts`: `export { UserForm } from './UserForm'; export type { UserFormValues } from './types';`

Удалить каталог `components/InviteForm/` — его роль занимает эта форма.

- [ ] **Step 4: Запустить**

Run: `cd apps/web && npx vitest run src/components/UserForm`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/UserForm
git rm -r apps/web/src/components/InviteForm
git commit -m "Завести форму учётки с именем и почтой"
```

### Task 4.2: Хуки паспорта и правки

**Files:**
- Modify: `apps/web/src/api/hooks/useQueryUsers.ts`
- Create: `apps/web/src/api/hooks/useQueryUser.ts`
- Create: `apps/web/src/api/hooks/useMutationUpdateUser.ts`
- Modify: `apps/web/src/api/hooks/useMutationUserAction.ts`
- Modify: `apps/web/src/api/hooks/index.ts`

- [ ] **Step 1: Реализация без отдельного теста**

Хуки-обёртки над `apiClient` проверяются экранами, которые их зовут: отдельный тест повторял бы сигнатуру `apiClient`, ничего не проверяя. Так же сделаны `useQueryGrants` и `useQueryUsers`.

В `useQueryUsers.ts` расширить ключи:

```ts
/** Ключи кэша пользователей. */
export const USER_KEYS = {
  all: ['users'] as const,
  one: (userId: string) => ['users', userId] as const,
};
```

`useQueryUser.ts`:

```ts
'use client';

import type { UserRow } from '@cairn/shared';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';
import { USER_KEYS } from './useQueryUsers';

/** Паспорт одного пользователя. Доступен только суперадмину (спека 8). */
export function useQueryUser(userId: string) {
  return useQuery({
    queryKey: USER_KEYS.one(userId),
    queryFn: () => apiClient<UserRow>(`/users/${userId}`),
  });
}
```

`useMutationUpdateUser.ts`:

```ts
'use client';

import type { UserRow, UserUpdate } from '@cairn/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../client';
import { USER_KEYS } from './useQueryUsers';

/** Правка имени и почты. */
export function useMutationUpdateUser(userId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: UserUpdate) =>
      apiClient<UserRow>(`/users/${userId}`, { method: 'PATCH', body: input }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: USER_KEYS.one(userId) }),
        client.invalidateQueries({ queryKey: USER_KEYS.all }),
      ]);
    },
  });
}
```

В `useMutationUserAction.ts` у `useMutationInviteUser` тип входа остаётся `InviteUserInput` — он теперь включает имя; менять код не нужно.

Добавить оба файла в `api/hooks/index.ts`.

- [ ] **Step 2: Проверить типы**

Run: `pnpm typecheck`
Expected: остаются только ошибки в `UsersScreen` и `AccessScreen` — они чинятся в задачах 4.3 и 5.3.

- [ ] **Step 3: Коммит**

```bash
git add apps/web/src/api
git commit -m "Завести хуки паспорта и правки пользователя"
```

### Task 4.3: Список людей и создание в панели

**Files:**
- Modify: `apps/web/src/components/UserList/UserList.tsx`
- Modify: `apps/web/src/components/UserList/UserListItem.tsx`
- Modify: `apps/web/src/components/UserList/types.ts`
- Modify: `apps/web/src/components/UserList/UserList.test.tsx`
- Create: `apps/web/src/app/(app)/users/NewUserPanel.tsx`
- Modify: `apps/web/src/app/(app)/users/UsersScreen.tsx`

- [ ] **Step 1: Падающие тесты**

`UserList.test.tsx` переписать под новую роль списка — обзор и переход:

```tsx
it('показывает имя и почту', () => {
  render(<UserList users={[user]} />);

  expect(screen.getByText('Анна')).toBeInTheDocument();
  expect(screen.getByText('anna@example.com')).toBeInTheDocument();
});

it('ведёт на карточку', () => {
  render(<UserList users={[user]} />);

  expect(screen.getByRole('link', { name: /Анна/ })).toHaveAttribute(
    'href',
    `/users/${user.id}`,
  );
});

it('показывает состояние', () => {
  render(<UserList users={[{ ...user, isRevoked: true }]} />);

  expect(screen.getByText('Отозван')).toBeInTheDocument();
});
```

Проверки кнопок действий из этого файла убрать: действия переехали на карточку и проверяются в `UserCard.test.tsx`.

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/web && npx vitest run src/components/UserList`
Expected: FAIL — список требует обработчиков действий, ссылки нет.

- [ ] **Step 3: Реализация**

`types.ts` сокращается до `{ users: UserRow[] }`. `UserList.tsx` — список без состояния и без диалога. `UserListItem.tsx`:

```tsx
import Link from 'next/link';
import type { UserRow } from '@cairn/shared';

import { statusOf } from './utils';

/** Пропсы строки пользователя. */
interface IProps {
  user: UserRow;
}

/**
 * Строка списка: обзор и переход на карточку.
 *
 * Действий здесь нет намеренно — они живут на карточке. Два места
 * с одними и теми же кнопками однажды разошлись бы (спека 2.2).
 */
export function UserListItem({ user }: IProps) {
  return (
    <li className="rounded-lg border border-border bg-surface">
      <Link href={`/users/${user.id}`} className="flex flex-wrap items-center justify-between gap-3 p-3">
        <span>
          <span className="font-medium">
            {user.name}
            {user.isSuperadmin && (
              <span className="ml-2 text-xs text-muted-foreground">Суперадмин</span>
            )}
          </span>
          <span className="block text-sm text-muted-foreground">{user.email}</span>
        </span>

        <span className="text-sm text-muted-foreground">{statusOf(user)}</span>
      </Link>
    </li>
  );
}
```

Файлы `ResetConfirmDialog.tsx` и `constants.ts` из `UserList/` переносятся в `components/UserCard/` (задача 4.4); `utils.ts` со `statusOf` остаётся здесь и импортируется карточкой — состояние человека одно, и формулировать его в двух местах нельзя.

`NewUserPanel.tsx`:

```tsx
'use client';

import type { IssuedLinkResponse } from '@cairn/shared';
import { useState } from 'react';

import { describeApiError } from '@/api';
import { useMutationInviteUser } from '@/api/hooks';
import { Drawer, DrawerWidth } from '@/components/Drawer';
import { IssuedLink } from '@/components/IssuedLink';
import { UserForm } from '@/components/UserForm';

import { EMPTY_USER } from './constants';

/**
 * Создание учётки в выезжающей панели.
 *
 * Пароля здесь нет: приглашение выдаёт одноразовую ссылку, и показать
 * её нужно в той же панели — другого раза не будет.
 */
export function NewUserPanel() {
  const invite = useMutationInviteUser();
  const [isOpen, setIsOpen] = useState(false);
  const [issued, setIssued] = useState<IssuedLinkResponse | null>(null);

  function close(): void {
    setIsOpen(false);
    setIssued(null);
    invite.reset();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
      >
        Новый пользователь
      </button>

      <Drawer isOpen={isOpen} onClose={close} title="Новый пользователь" width={DrawerWidth.Half}>
        {issued ? (
          <IssuedLink link={issued} title="Приглашение создано" />
        ) : (
          <UserForm
            initial={EMPTY_USER}
            submitLabel="Пригласить"
            isSubmitting={invite.isPending}
            error={describeApiError(invite.error)}
            onSubmit={(values) => invite.mutate(values, { onSuccess: setIssued })}
          />
        )}
      </Drawer>
    </>
  );
}
```

`app/(app)/users/constants.ts`: `export const EMPTY_USER = { name: '', email: '' };`

`UsersScreen.tsx` сокращается: запрос списка, `NewUserPanel` и `UserList`; сброс пароля и прочие действия уходят на карточку.

- [ ] **Step 4: Запустить**

Run: `cd apps/web && npx vitest run src/components/UserList`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/UserList "apps/web/src/app/(app)/users"
git commit -m "Сделать список людей обзором с переходом на карточку"
```

### Task 4.4: Карточка пользователя

**Files:**
- Create: `apps/web/src/components/UserCard/UserCard.tsx`
- Create: `apps/web/src/components/UserCard/types.ts`
- Create: `apps/web/src/components/UserCard/constants.ts`
- Move: `apps/web/src/components/UserList/ResetConfirmDialog.tsx` → `apps/web/src/components/UserCard/`
- Create: `apps/web/src/components/UserCard/index.ts`
- Create: `apps/web/src/components/UserCard/UserCard.test.tsx`

- [ ] **Step 1: Падающие тесты**

```tsx
it('показывает паспорт', () => {
  render(<UserCard user={user} {...handlers} />);

  expect(screen.getByRole('heading', { name: 'Анна' })).toBeInTheDocument();
  expect(screen.getByText('anna@example.com')).toBeInTheDocument();
  expect(screen.getByText('Активен')).toBeInTheDocument();
});

it('отзывает доступ', async () => {
  const onRevoke = vi.fn();
  render(<UserCard user={user} {...handlers} onRevoke={onRevoke} />);

  await userEvent.click(screen.getByRole('button', { name: 'Отозвать доступ' }));

  expect(onRevoke).toHaveBeenCalledWith(user.id);
});

it('у отозванного предлагает восстановление вместо отзыва', () => {
  render(<UserCard user={{ ...user, isRevoked: true }} {...handlers} />);

  expect(screen.getByRole('button', { name: 'Восстановить' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Отозвать доступ' })).not.toBeInTheDocument();
});

it('сброс пароля требует подтверждения', async () => {
  const onResetPassword = vi.fn();
  render(<UserCard user={user} {...handlers} onResetPassword={onResetPassword} />);

  await userEvent.click(screen.getByRole('button', { name: 'Сбросить пароль' }));
  expect(onResetPassword).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole('button', { name: /подтвердить/i }));
  expect(onResetPassword).toHaveBeenCalledWith(user.id);
});

it('сброс второго фактора показывается только при его наличии', () => {
  render(<UserCard user={user} {...handlers} />);

  expect(screen.queryByRole('button', { name: 'Сбросить второй фактор' })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/web && npx vitest run src/components/UserCard`
Expected: FAIL — модуля нет.

- [ ] **Step 3: Реализация**

`UserCard.tsx` — паспорт (имя заголовком, почта, состояние из `statusOf`, пометка суперадмина, дата создания), слот `editSlot` для панели правки и полоса действий. Подтверждение сброса пароля — перенесённый `ResetConfirmDialog`. Если файл подходит к сотне строк, вынести полосу действий в `UserCardActions.tsx` рядом.

`types.ts`:

```ts
import type { UserRow } from '@cairn/shared';
import type { ReactNode } from 'react';

/** Пропсы карточки пользователя. */
export interface IProps {
  user: UserRow;
  /** Кнопка правки с её панелью: карточка не знает, как устроена форма. */
  editSlot?: ReactNode;
  onRevoke: (userId: string) => void;
  onRestore: (userId: string) => void;
  onResetPassword: (userId: string) => void;
  onResetTotp: (userId: string) => void;
}
```

- [ ] **Step 4: Запустить**

Run: `cd apps/web && npx vitest run src/components/UserCard src/components/UserList`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/UserCard apps/web/src/components/UserList
git commit -m "Завести карточку пользователя с действиями"
```

### Task 4.5: Страница карточки и панель правки

**Files:**
- Create: `apps/web/src/app/(app)/users/[id]/page.tsx`
- Create: `apps/web/src/app/(app)/users/[id]/UserScreen.tsx`
- Create: `apps/web/src/app/(app)/users/[id]/EditUserPanel.tsx`
- Create: `apps/web/src/app/(app)/users/[id]/constants.ts`

- [ ] **Step 1: Реализация**

Страница тонкая, как `app/(app)/users/page.tsx`: заголовок и `UserScreen` с `userId`. Экран клиентский — ему нужны мутации:

```tsx
'use client';

export function UserScreen({ userId }: IProps) {
  const user = useQueryUser(userId);
  const resetPassword = useMutationResetPassword();
  const action = useMutationUserAction();
  const [issued, setIssued] = useState<{ link: IssuedLinkResponse; title: string } | null>(null);

  if (user.isPending) {
    return <p className="text-muted-foreground">Загрузка…</p>;
  }

  if (user.isError) {
    return (
      <p role="alert" className="text-destructive">
        {user.error instanceof ApiError && user.error.status === 403
          ? SUPERADMIN_ONLY
          : 'Не удалось загрузить пользователя.'}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <UserCard
        user={user.data}
        editSlot={<EditUserPanel userId={userId} initial={{ name: user.data.name, email: user.data.email }} />}
        onRevoke={(id) => action.mutate({ userId: id, action: 'revoke' })}
        onRestore={(id) => action.mutate({ userId: id, action: 'restore' })}
        onResetTotp={(id) => action.mutate({ userId: id, action: 'reset-totp' })}
        onResetPassword={(id) =>
          resetPassword.mutate(id, {
            onSuccess: (link) => setIssued({ link, title: 'Пароль сброшен' }),
          })
        }
      />

      {issued && <IssuedLink link={issued.link} title={issued.title} />}

      {/* Матрица доступов добавляется в Chunk 5. */}
    </div>
  );
}
```

`constants.ts`:

```ts
/**
 * Отказ `403` на экранах управления.
 *
 * Существование раздела администрирования секретом не является, поэтому
 * здесь можно сказать прямо, в отличие от закрытого проекта (ТЗ 4.2).
 */
export const SUPERADMIN_ONLY = 'Управление пользователями открыто только суперадминистратору.';
```

`EditUserPanel.tsx` — по образцу `EditProjectPanel`: кнопка «Править», `Drawer` «Правка пользователя», `UserForm` с `submitLabel="Сохранить"`, по успеху панель закрывается.

- [ ] **Step 2: Проверить вручную**

Run: `pnpm --filter @cairn/web dev` (если сервер ещё не поднят)
Проверить: `/users` → переход на карточку → правка имени → имя меняется в списке и в карточке.

- [ ] **Step 3: Проверить типы и тесты**

Run: `pnpm typecheck && cd apps/web && npx vitest run`
Expected: PASS.

- [ ] **Step 4: Коммит**

```bash
git add "apps/web/src/app/(app)/users"
git commit -m "Открыть страницу пользователя с правкой в панели"
```

---

## Chunk 5: Интерфейс — матрица человека и доводки

### Task 5.1: Один путь записи ячейки

**Files:**
- Modify: `apps/web/src/api/grant-change.ts`
- Modify: `apps/web/src/api/hooks/useMutationSetGrant.ts`
- Create: `apps/web/src/api/hooks/useQueryUserGrants.ts`
- Create: `apps/web/src/api/hooks/useMutationSetUserGrant.ts`
- Modify: `apps/web/src/api/hooks/index.ts`

- [ ] **Step 1: Реализация**

В `api/grant-change.ts`, рядом с типом:

```ts
/**
 * Отправляет изменение ячейки матрицы.
 *
 * Общая для обеих матриц: отзыв — удаление строки, выдача — `PUT`.
 * Две копии этого правила разошлись бы так же, как разошлись бы
 * два пути записи на сервере (спека 2.3).
 */
export function sendGrantChange(projectId: string, change: GrantChange): Promise<unknown> {
  const path = `/projects/${projectId}/grants`;
  const body = { subjectId: change.subjectId, section: change.section };

  if (change.level === null) {
    return apiClient(path, { method: 'DELETE', body });
  }

  return apiClient(path, { method: 'PUT', body: { ...body, level: change.level } });
}
```

`useMutationSetGrant` переписать на вызов `sendGrantChange(projectId, change)`.

`useQueryUserGrants.ts`:

```ts
'use client';

import type { UserGrantRow } from '@cairn/shared';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';

/** Ключи кэша выдач человека. */
export const USER_GRANT_KEYS = {
  forUser: (userId: string) => ['user-grants', userId] as const,
};

/** Матрица «проект × секция» одного человека. */
export function useQueryUserGrants(userId: string) {
  return useQuery({
    queryKey: USER_GRANT_KEYS.forUser(userId),
    queryFn: () => apiClient<UserGrantRow[]>(`/users/${userId}/grants`),
  });
}
```

`useMutationSetUserGrant.ts`:

```ts
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { sendGrantChange, type GrantChange } from '../grant-change';
import { GRANT_KEYS } from './useQueryGrants';
import { USER_GRANT_KEYS } from './useQueryUserGrants';

/** Изменение ячейки на карточке человека: проект приходит с вызовом. */
export function useMutationSetUserGrant(userId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, change }: { projectId: string; change: GrantChange }) =>
      sendGrantChange(projectId, change),
    // Гасятся оба среза: та же строка видна и на экране проекта.
    onSuccess: async (_result, { projectId }) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: USER_GRANT_KEYS.forUser(userId) }),
        client.invalidateQueries({ queryKey: GRANT_KEYS.forProject(projectId) }),
      ]);
    },
  });
}
```

- [ ] **Step 2: Проверить типы и прогнать веб**

Run: `pnpm typecheck && cd apps/web && npx vitest run`
Expected: PASS.

- [ ] **Step 3: Коммит**

```bash
git add apps/web/src/api
git commit -m "Свести запись ячейки доступа в одну функцию"
```

### Task 5.2: Матрица доступов человека

**Files:**
- Create: `apps/web/src/components/UserGrantsMatrix/UserGrantsMatrix.tsx`
- Create: `apps/web/src/components/UserGrantsMatrix/AddProjectField.tsx`
- Create: `apps/web/src/components/UserGrantsMatrix/types.ts`
- Create: `apps/web/src/components/UserGrantsMatrix/index.ts`
- Create: `apps/web/src/components/UserGrantsMatrix/UserGrantsMatrix.test.tsx`
- Modify: `apps/web/src/components/AccessMatrix/constants.ts`

- [ ] **Step 1: Падающие тесты**

```tsx
const rows = [
  { projectId: PROJECT_ID, projectName: 'CAIRN', levels: { [Section.Info]: AccessLevel.Read } },
];

it('показывает строку на проект и шесть секций', () => {
  render(<UserGrantsMatrix rows={rows} candidates={[]} onChange={vi.fn()} onAddProject={vi.fn()} />);

  expect(screen.getByText('CAIRN')).toBeInTheDocument();
  expect(screen.getAllByRole('columnheader')).toHaveLength(7);
});

it('показывает текущий уровень', () => {
  render(<UserGrantsMatrix rows={rows} candidates={[]} onChange={vi.fn()} onAddProject={vi.fn()} />);

  expect(screen.getByLabelText('CAIRN, Инфо')).toHaveValue(AccessLevel.Read);
});

it('передаёт изменение с проектом', async () => {
  const onChange = vi.fn();
  render(<UserGrantsMatrix rows={rows} candidates={[]} onChange={onChange} onAddProject={vi.fn()} />);

  await userEvent.selectOptions(screen.getByLabelText('CAIRN, Инфо'), AccessLevel.Write);

  expect(onChange).toHaveBeenCalledWith(PROJECT_ID, {
    section: Section.Info,
    level: AccessLevel.Write,
  });
});

it('передаёт отзыв пустым уровнем', async () => {
  const onChange = vi.fn();
  render(<UserGrantsMatrix rows={rows} candidates={[]} onChange={onChange} onAddProject={vi.fn()} />);

  await userEvent.selectOptions(screen.getByLabelText('CAIRN, Инфо'), '');

  expect(onChange).toHaveBeenCalledWith(PROJECT_ID, { section: Section.Info, level: null });
});

it('объясняет пустую матрицу', () => {
  render(<UserGrantsMatrix rows={[]} candidates={[]} onChange={vi.fn()} onAddProject={vi.fn()} />);

  expect(screen.getByText(/нет доступа ни к одному проекту/i)).toBeInTheDocument();
});

it('добавляет проект из остальных', async () => {
  const onAddProject = vi.fn();
  render(
    <UserGrantsMatrix
      rows={[]}
      candidates={[{ id: OTHER_ID, name: 'Shop' }]}
      onChange={vi.fn()}
      onAddProject={onAddProject}
    />,
  );

  await userEvent.selectOptions(screen.getByLabelText('Добавить проект'), OTHER_ID);
  await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));

  expect(onAddProject).toHaveBeenCalledWith(OTHER_ID);
});

it('не предлагает добавление, когда добавлять нечего', () => {
  render(<UserGrantsMatrix rows={rows} candidates={[]} onChange={vi.fn()} onAddProject={vi.fn()} />);

  expect(screen.queryByLabelText('Добавить проект')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `cd apps/web && npx vitest run src/components/UserGrantsMatrix`
Expected: FAIL — модуля нет.

- [ ] **Step 3: Реализация**

`types.ts`:

```ts
import type { AccessLevel, Section, UserGrantRow } from '@cairn/shared';

/** Проект, которому ещё не выдано ничего. */
export interface ProjectCandidate {
  id: string;
  name: string;
}

/** Изменение ячейки: секция и новый уровень; пусто — отзыв. */
export interface SectionChange {
  section: Section;
  level: AccessLevel | null;
}

/** Пропсы матрицы доступов человека. */
export interface IProps {
  /** Проекты с выдачами и те, что только что добавлены в таблицу. */
  rows: UserGrantRow[];
  /** Остальные проекты — для добавления строки. */
  candidates: ProjectCandidate[];
  onChange: (projectId: string, change: SectionChange) => void;
  onAddProject: (projectId: string) => void;
}
```

`UserGrantsMatrix.tsx` — таблица: заголовок «Проект» и шесть секций из `SECTION_LABELS`, строка на проект, `select` с `LEVEL_OPTIONS` и `aria-label={`${row.projectName}, ${label}`}`; под таблицей `AddProjectField`, если `candidates` не пуст. Подписи берутся из `components/AccessMatrix/constants.ts` — один набор на обе матрицы.

В `AccessMatrix/constants.ts` добавить:

```ts
/** Пометка строки субъекта, который обходит выдачи. */
export const FULL_ACCESS_LABEL = 'Полный доступ';

/** Пояснение для карточки суперадмина. */
export const FULL_ACCESS_NOTE =
  'Полный доступ ко всем проектам и секциям: суперадминистратор обходит выдачи, и выдавать ему что-либо незачем.';
```

- [ ] **Step 4: Запустить**

Run: `cd apps/web && npx vitest run src/components/UserGrantsMatrix`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/UserGrantsMatrix apps/web/src/components/AccessMatrix
git commit -m "Завести матрицу доступов человека"
```

### Task 5.3: Матрица на карточке

**Files:**
- Modify: `apps/web/src/app/(app)/users/[id]/UserScreen.tsx`
- Create: `apps/web/src/app/(app)/users/[id]/UserGrantsPanel.tsx`

- [ ] **Step 1: Реализация**

Блок доступов вынести отдельным клиентским компонентом — `UserScreen` иначе перевалит сотню строк:

```tsx
'use client';

/**
 * Блок доступов на карточке человека.
 *
 * Только что добавленный проект живёт в состоянии: выдач у него ещё нет,
 * и с сервера он не придёт. После перезагрузки строка без выдач исчезает —
 * отсутствие доступа и выражается отсутствием строки (спека 2.4).
 */
export function UserGrantsPanel({ user }: IProps) {
  const grants = useQueryUserGrants(user.id);
  const projects = useQueryProjects();
  const setGrant = useMutationSetUserGrant(user.id);
  const [added, setAdded] = useState<UserGrantRow[]>([]);

  if (user.isSuperadmin) {
    return <p className="text-muted-foreground">{FULL_ACCESS_NOTE}</p>;
  }

  if (grants.isPending || projects.isPending) {
    return <p className="text-muted-foreground">Загрузка…</p>;
  }

  if (grants.isError || projects.isError) {
    return (
      <p role="alert" className="text-destructive">
        Не удалось загрузить доступы.
      </p>
    );
  }

  const rows = [...grants.data, ...added.filter((row) => !grants.data.some((kept) => kept.projectId === row.projectId))];
  const taken = new Set(rows.map((row) => row.projectId));

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">Доступы</h2>

      <UserGrantsMatrix
        rows={rows}
        candidates={projects.data.filter((project) => !taken.has(project.id))}
        onAddProject={(projectId) => {
          const project = projects.data.find((candidate) => candidate.id === projectId);

          if (project) {
            setAdded((current) => [...current, { projectId, projectName: project.name, levels: {} }]);
          }
        }}
        onChange={(projectId, change) =>
          setGrant.mutate({ projectId, change: { ...change, subjectId: user.subjectId } })
        }
      />
    </section>
  );
}
```

`UserScreen` подключает панель под карточкой и передаёт `user.data`.

- [ ] **Step 2: Проверить вручную**

Проверить на `/users/:id`: выдача уровня, понижение, отзыв, добавление проекта; на экране проекта та же строка изменилась.

- [ ] **Step 3: Прогнать тесты и типы**

Run: `pnpm typecheck && cd apps/web && npx vitest run`
Expected: PASS.

- [ ] **Step 4: Коммит**

```bash
git add "apps/web/src/app/(app)/users"
git commit -m "Показать и править доступы на карточке человека"
```

### Task 5.4: Суперадмин в проектной матрице

**Files:**
- Modify: `apps/web/src/components/AccessMatrix/AccessMatrix.tsx`
- Modify: `apps/web/src/components/AccessMatrix/types.ts`
- Modify: `apps/web/src/components/AccessMatrix/AccessMatrix.test.tsx`
- Modify: `apps/web/src/app/(app)/projects/[id]/access/AccessScreen.tsx`
- Modify: `apps/web/src/app/(app)/projects/[id]/access/page.tsx`

- [ ] **Step 1: Падающие тесты**

```tsx
it('у суперадмина показывает полный доступ вместо селектов', () => {
  // Селекты предлагали выдать доступ, который ничего не меняет:
  // суперадмин обходит выдачи (спека 2.5).
  render(<AccessMatrix rows={[{ ...rows[0]!, isSuperadmin: true }]} onChange={vi.fn()} />);

  expect(screen.getByText('Полный доступ')).toBeInTheDocument();
  expect(screen.queryByLabelText('user@cairn.local, Инфо')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `cd apps/web && npx vitest run src/components/AccessMatrix`
Expected: FAIL — селекты на месте.

- [ ] **Step 3: Реализация**

В `MatrixSubject` добавить `isSuperadmin?: boolean`. В `AccessMatrix.tsx` для такой строки рисовать одну ячейку на все секции:

```tsx
              {row.isSuperadmin ? (
                <td colSpan={SECTION_LABELS.length} className="border-b border-border p-2 text-muted-foreground">
                  {FULL_ACCESS_LABEL}
                </td>
              ) : (
                SECTION_LABELS.map(({ section, label }) => (
                  ...
                ))
              )}
```

В `AccessScreen.tsx` передавать `isSuperadmin: user.isSuperadmin` и `subjectLabel: user.name` — в матрице теперь имя, а не почта. Ошибку `403` показывать текстом `SUPERADMIN_ONLY` (вынести константу в `app/(app)/projects/[id]/access/constants.ts` с формулировкой про доступы).

- [ ] **Step 4: Запустить**

Run: `cd apps/web && npx vitest run src/components/AccessMatrix`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/AccessMatrix "apps/web/src/app/(app)/projects/[id]/access"
git commit -m "Называть полный доступ суперадмина в проектной матрице"
```

### Task 5.5: Вход на экран доступов проекта

**Files:**
- Modify: `apps/web/src/app/(app)/projects/[id]/page.tsx`

- [ ] **Step 1: Реализация**

Страница уже запрашивает проект и уровни — добавить к ним субъект тем же `Promise.all`:

```ts
    [project, sections, subject] = await Promise.all([
      apiServer<ProjectMetadata | ProjectDetail>(`/projects/${id}`),
      apiServer<SectionLevels>(`/projects/${id}/sections`),
      apiServer<CurrentSubjectResponse>('/auth/me'),
    ]);
```

И рядом с `EditProjectPanel`:

```tsx
      {/* Навигация проекта не трогается: её список — это секции, единицы
          выдачи доступа, а доступы единицей выдачи не являются. */}
      {subject.isSuperadmin && (
        <Link href={`/projects/${id}/access`} className="rounded-md border px-3 py-1 text-sm">
          Доступы
        </Link>
      )}
```

- [ ] **Step 2: Проверить вручную**

С карточки проекта кнопка «Доступы» открывает матрицу; обычному пользователю кнопки нет, а по прямому адресу он видит «только суперадминистратору».

- [ ] **Step 3: Полный прогон**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 4: Коммит**

```bash
git add "apps/web/src/app/(app)/projects/[id]/page.tsx"
git commit -m "Вести на экран доступов с карточки проекта"
```

### Task 5.6: Перевод нового действия журнала

**Files:**
- Modify: `apps/web/src/components/AuditTable/constants.ts`

- [ ] **Step 1: Реализация**

В `ACTION_LABELS` добавить `'user.updated': 'Изменена учётная запись'`.

Действие без перевода показывается как есть — экран не сломается, но читать журнал будет неудобно.

- [ ] **Step 2: Прогнать веб**

Run: `cd apps/web && npx vitest run`
Expected: PASS.

- [ ] **Step 3: Коммит**

```bash
git add apps/web/src/components/AuditTable
git commit -m "Перевести запись о правке учётной записи"
```

---

## Что проверить глазами перед сдачей

- Приглашение нового человека: имя попадает в список, ссылка показывается один раз, по ней ставится пароль.
- Правка имени: меняется в списке, в карточке, в проектной матрице и в новых записях журнала.
- Смена почты: вход по прежнему адресу больше не работает, по новому — работает.
- Занятая почта: `409` с внятным текстом в форме, а не «не удалось выполнить запрос».
- Выдача доступа с карточки человека видна на экране доступов проекта и наоборот.
- Отозванный человек: доступы на карточке остаются, вход не работает, восстановление возвращает оба.
- Карточка суперадмина: вместо матрицы — пояснение; в проектной матрице его строка — «Полный доступ».
- Не-суперадмин: `/users`, `/users/:id` и `/projects/:id/access` отвечают понятным отказом, а не ошибкой загрузки.
