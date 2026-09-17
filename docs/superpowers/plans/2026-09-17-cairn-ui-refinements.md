# Доводка интерфейса: поддомены, сводка, чекпоинты — план реализации

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Завести поддомен из реестра доменов, убрать двойной показ проекта на главной, переработать создание чекпоинта роадмапа.

**Architecture:** Три независимые части, каждая работоспособна и проверяема сама по себе. Порядок — по возрастанию цены ошибки: главный экран (только `apps/web`), чекпоинты (миграция плюс публичная выдача), поддомены (новые эндпоинты плюс два экрана). Модель прав не меняется нигде; поддомены переиспользуют существующие проверки окружения.

**Tech Stack:** pnpm workspaces, Next.js 15 (App Router, RSC), NestJS, Drizzle + PostgreSQL, zod в `packages/shared`, Vitest + React Testing Library, Testcontainers для интеграционных.

**Основание:** `docs/superpowers/specs/2026-09-17-cairn-ui-refinements-design.md`

---

## Как работать с этим планом

Разработка по TDD: сначала падающий тест, затем реализация. Линтера в проекте нет.

Команды (из корня монорепо):

| Что | Команда |
|---|---|
| Все тесты | `pnpm test` |
| Тесты веба точечно | `pnpm --filter @cairn/web test -- src/путь/файл.test.tsx` |
| Тесты API точечно | `pnpm --filter @cairn/api test -- src/путь/файл.test.ts` |
| Типы | `pnpm typecheck` |
| Сгенерировать миграцию | `pnpm --filter @cairn/api db:generate` |

Интеграционные тесты API поднимают PostgreSQL через Testcontainers — нужен работающий Docker. Чистые функции (`*.projection.test.ts`, `domain-map.test.ts`) базы не требуют: это осознанное разделение, не повторяй в чистых тестах поднятие контейнера.

Соглашения репозитория, которые нельзя нарушать:

- компонент живёт в своей директории с `index.ts`, пропсы — интерфейс `IProps` в `types.ts`, тест — `ComponentName.test.tsx`;
- компонент до 100 строк, иначе подкомпоненты;
- TSDoc на русском у каждого экспортируемого элемента; комментарий объясняет **почему**, а не что;
- значение, встречающееся 2+ раза, — `enum`, не union;
- `use client` только там, где есть состояние, обработчики или браузерные API;
- никаких inline-стилей, все классы — Tailwind из `tailwind.config.ts`;
- `apiServer` — единственный способ обращения к API из серверных компонентов.

---

## Chunk 1: Главный экран

Результат: на `/` каждый проект показан один раз карточкой с индикатором, а предупреждения разложены на два блока по срочности.

### Файлы

| Файл | Ответственность |
|---|---|
| `apps/web/src/utils/split-warnings.ts` (создать) | разложить строки сводки на срочные и остальные, приклеив ссылку и имя проекта |
| `apps/web/src/utils/split-warnings.test.ts` (создать) | |
| `apps/web/src/utils/index.ts` (изменить) | реэкспорт |
| `apps/web/src/components/WarningsPanel/types.ts` (изменить) | заголовок, тон, необязательная ссылка у строки |
| `apps/web/src/components/WarningsPanel/constants.ts` (создать) | классы тонов, заголовок по умолчанию |
| `apps/web/src/components/WarningsPanel/WarningsPanel.tsx` (изменить) | |
| `apps/web/src/components/WarningsPanel/WarningsPanel.test.tsx` (изменить) | |
| `apps/web/src/components/ProjectCard/types.ts`, `ProjectCard.tsx`, `ProjectCard.test.tsx` (изменить) | индикатор рядом со стадией |
| `apps/web/src/components/ProjectList/types.ts`, `ProjectList.tsx` (изменить) | проброс индикаторов |
| `apps/web/src/app/(app)/page.tsx` (изменить) | сборка на сервере |
| `apps/web/src/app/(app)/SummaryStatus.tsx` (удалить) | |
| `apps/web/src/api/hooks/useStatus.ts`, `hooks/index.ts` (изменить) | убрать осиротевший `useQueryStatusSummary` |

### Task 1.1: Утилита разложения предупреждений

**Files:**
- Create: `apps/web/src/utils/split-warnings.ts`
- Test: `apps/web/src/utils/split-warnings.test.ts`
- Modify: `apps/web/src/utils/index.ts`

- [ ] **Step 1: Написать падающий тест**

`apps/web/src/utils/split-warnings.test.ts`:

```ts
import { StatusIndicator, StatusWarningKind, type StatusSummaryRow } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { splitWarningsByUrgency } from './split-warnings';

const rows: StatusSummaryRow[] = [
  {
    projectId: '11111111-1111-4111-8111-111111111111',
    projectName: 'Лавка',
    indicator: StatusIndicator.Down,
    warnings: [
      { kind: StatusWarningKind.HealthDown, subject: 'Прод', detail: 'не отвечает' },
      { kind: StatusWarningKind.TlsExpiring, subject: 'shop.example.com', detail: 'сертификат до 01.10' },
    ],
  },
];

describe('splitWarningsByUrgency', () => {
  it('кладёт падение в срочные, а срок — в остальные', () => {
    const { critical, attention } = splitWarningsByUrgency(rows);

    expect(critical.map((warning) => warning.kind)).toEqual([StatusWarningKind.HealthDown]);
    expect(attention.map((warning) => warning.kind)).toEqual([StatusWarningKind.TlsExpiring]);
  });

  it('предваряет предмет именем проекта', () => {
    const { critical } = splitWarningsByUrgency(rows);

    expect(critical[0]?.subject).toBe('Лавка · Прод');
  });

  it('ведёт ссылкой в инфраструктуру проекта', () => {
    const { critical } = splitWarningsByUrgency(rows);

    expect(critical[0]?.href).toBe(
      '/projects/11111111-1111-4111-8111-111111111111/infrastructure',
    );
  });

  it('на пустой сводке отдаёт два пустых списка', () => {
    expect(splitWarningsByUrgency([])).toEqual({ critical: [], attention: [] });
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `pnpm --filter @cairn/web test -- src/utils/split-warnings.test.ts`
Expected: FAIL, `Failed to resolve import "./split-warnings"`.

- [ ] **Step 3: Реализация**

`apps/web/src/utils/split-warnings.ts`:

```ts
import { StatusWarningKind, type StatusSummaryRow, type StatusWarning } from '@cairn/shared';

/** Предупреждение сводки: к чему относится и куда вести по клику. */
export interface LinkedWarning extends StatusWarning {
  /** Адрес секции «Инфраструктура» проекта. */
  href: string;
}

/** Предупреждения, разложенные по срочности. */
export interface SplitWarnings {
  /** Проект не отвечает — действовать сейчас. */
  critical: LinkedWarning[];
  /** Сроки и ошибки проверок — действовать на неделе. */
  attention: LinkedWarning[];
}

/**
 * Раскладывает предупреждения сводки на два списка по срочности.
 *
 * Упавший прод и домен, который надо продлить через три недели, требуют
 * разных действий сегодня, и в одном списке первое теряется среди второго
 * (спека доводки, раздел 3.2).
 *
 * Идентификатор проекта сохраняется в ссылке: раньше он терялся при
 * склейке имени с предметом, и строка предупреждения никуда не вела.
 */
export function splitWarningsByUrgency(rows: StatusSummaryRow[]): SplitWarnings {
  const linked = rows.flatMap((row) =>
    row.warnings.map((warning) => ({
      ...warning,
      subject: `${row.projectName} · ${warning.subject}`,
      href: `/projects/${row.projectId}/infrastructure`,
    })),
  );

  return {
    critical: linked.filter((warning) => warning.kind === StatusWarningKind.HealthDown),
    attention: linked.filter((warning) => warning.kind !== StatusWarningKind.HealthDown),
  };
}
```

Дописать в `apps/web/src/utils/index.ts`:

```ts
export { splitWarningsByUrgency } from './split-warnings';
export type { LinkedWarning, SplitWarnings } from './split-warnings';
```

- [ ] **Step 4: Запустить, убедиться что проходит**

Run: `pnpm --filter @cairn/web test -- src/utils/split-warnings.test.ts`
Expected: PASS, 4 теста.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/utils/split-warnings.ts apps/web/src/utils/split-warnings.test.ts apps/web/src/utils/index.ts
git commit -m "Разложить предупреждения сводки по срочности"
```

### Task 1.2: Панель предупреждений получает заголовок, тон и ссылки

Панель уже используется на экране инфраструктуры (`InfrastructureStatusPanel.tsx:44`) с обычным `StatusWarning[]`. Новые свойства **обязаны** быть необязательными, иначе сломается второй вызов.

**Files:**
- Create: `apps/web/src/components/WarningsPanel/constants.ts`
- Modify: `apps/web/src/components/WarningsPanel/types.ts`, `WarningsPanel.tsx`, `WarningsPanel.test.tsx`

- [ ] **Step 1: Дописать падающие тесты**

В `apps/web/src/components/WarningsPanel/WarningsPanel.test.tsx` добавить (существующие тесты не трогать):

```tsx
it('показывает переданный заголовок', () => {
  render(<WarningsPanel title="Не отвечает" tone={WarningTone.Critical} warnings={warnings} />);

  expect(screen.getByRole('heading', { name: 'Не отвечает' })).toBeInTheDocument();
});

it('делает строку ссылкой, когда адрес задан', () => {
  render(<WarningsPanel warnings={[{ ...warnings[0]!, href: '/projects/1/infrastructure' }]} />);

  expect(screen.getByRole('link')).toHaveAttribute('href', '/projects/1/infrastructure');
});

it('оставляет строку текстом без адреса', () => {
  render(<WarningsPanel warnings={warnings} />);

  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
```

Импорт `WarningTone` — из `./types`.

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `pnpm --filter @cairn/web test -- src/components/WarningsPanel/WarningsPanel.test.tsx`
Expected: FAIL, `WarningTone` не экспортируется.

- [ ] **Step 3: Реализация**

`types.ts`:

```ts
import type { StatusWarning } from '@cairn/shared';

/** Срочность блока предупреждений: определяет цвет и порядок на экране. */
export enum WarningTone {
  /** Не отвечает — действовать сейчас. */
  Critical = 'critical',
  /** Сроки и ошибки проверок — действовать на неделе. */
  Attention = 'attention',
}

/** Пропсы панели предупреждений. */
export interface IProps {
  warnings: (StatusWarning & { href?: string })[];
  /** Заголовок блока; по умолчанию — «Предупреждения». */
  title?: string;
  /** Срочность; по умолчанию — «требует внимания». */
  tone?: WarningTone;
}
```

`constants.ts`:

```ts
import { WarningTone } from './types';

/** Заголовок блока, когда свой не задан. */
export const DEFAULT_TITLE = 'Предупреждения';

/**
 * Оформление по срочности.
 *
 * Классы записаны целиком, а не собираются из кусков: Tailwind вырезает
 * классы, которых нет в исходниках буквально.
 */
export const TONE_STYLES: Record<WarningTone, string> = {
  [WarningTone.Critical]: 'border-destructive/50 bg-destructive/10',
  [WarningTone.Attention]: 'border-amber-500/50 bg-amber-500/10',
};
```

`WarningsPanel.tsx` — вернуть `<section className={`space-y-1 rounded-md border p-4 ${TONE_STYLES[tone]}`}>`, заголовком поставить `title ?? DEFAULT_TITLE`, а строку списка рисовать так: при наличии `href` — `<Link href={warning.href}>` вокруг содержимого строки, иначе прежний текст. Компонент остаётся серверным (`use client` не добавлять).

Проверить по `tailwind.config.ts`, что токен `destructive` существует; если нет — взять тот, которым окрашены ошибки в `FormError`.

- [ ] **Step 4: Запустить**

Run: `pnpm --filter @cairn/web test -- src/components/WarningsPanel/WarningsPanel.test.tsx`
Expected: PASS, включая старые тесты.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/WarningsPanel
git commit -m "Дать панели предупреждений срочность и ссылки"
```

### Task 1.3: Индикатор на карточке проекта

**Files:**
- Modify: `apps/web/src/components/ProjectCard/{types.ts,ProjectCard.tsx,ProjectCard.test.tsx}`
- Modify: `apps/web/src/components/ProjectList/{types.ts,ProjectList.tsx}`

- [ ] **Step 1: Падающий тест**

В `ProjectCard.test.tsx`:

```tsx
it('показывает индикатор состояния рядом со стадией', () => {
  render(<ProjectCard project={project} indicator={StatusIndicator.Down} />);

  expect(screen.getByText('Не отвечает')).toBeInTheDocument();
});

it('без индикатора показывает только стадию', () => {
  render(<ProjectCard project={project} />);

  expect(screen.queryByText('Не отвечает')).not.toBeInTheDocument();
});
```

Подпись во втором ожидании сверить с `apps/web/src/components/StatusIndicator/constants.ts` — там `INDICATOR_LABELS`, тест должен спрашивать ровно то слово, которое там написано.

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `pnpm --filter @cairn/web test -- src/components/ProjectCard/ProjectCard.test.tsx`

- [ ] **Step 3: Реализация**

`ProjectCard/types.ts` — добавить `indicator?: StatusIndicator`. В `ProjectCard.tsx` под именем проекта отрисовать `{indicator && <StatusIndicator indicator={indicator} />}`, а устаревший комментарий «Место под индикатор технического статуса появится на этапе 6» удалить: место занято.

`ProjectList/types.ts` — добавить:

```ts
/** Индикатор по идентификатору проекта; отсутствие означает «статуса нет». */
indicators?: Record<string, StatusIndicator>;
```

`ProjectList.tsx` — пробросить `indicator={indicators?.[project.id]}`.

- [ ] **Step 4: Запустить**

Run: `pnpm --filter @cairn/web test -- src/components/ProjectCard src/components/ProjectList`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/ProjectCard apps/web/src/components/ProjectList
git commit -m "Свести состояние проекта в его карточку"
```

### Task 1.4: Главная страница собирает всё на сервере

Тестов на страницу в репозитории нет — покрытие даёт Task 1.1–1.3. Это осознанно: серверный компонент здесь только склеивает уже проверенные части.

**Files:**
- Modify: `apps/web/src/app/(app)/page.tsx`
- Delete: `apps/web/src/app/(app)/SummaryStatus.tsx`
- Modify: `apps/web/src/api/hooks/useStatus.ts`, `apps/web/src/api/hooks/index.ts`

- [ ] **Step 1: Переписать страницу**

`page.tsx` догружает сводку третьим запросом и раскладывает её:

```tsx
const summary = await apiServer<StatusSummaryRow[]>('/status/summary').catch(() => []);
const { critical, attention } = splitWarningsByUrgency(summary);
const indicators = Object.fromEntries(summary.map((row) => [row.projectId, row.indicator]));
```

Сводка грузится отдельно от `Promise.all` с проектами и правами намеренно: её падение не должно уводить страницу в ошибку — список проектов важнее статусов. Отказ `401` у первых двух запросов по-прежнему ведёт на `/login`.

Разметка: `<h1>`, затем `<WarningsPanel title="Не отвечает" tone={WarningTone.Critical} warnings={critical} />`, затем `<WarningsPanel title="Требует внимания" warnings={attention} />`, затем `<ProjectList projects={projects} indicators={indicators} canCreate={subject.isSuperadmin} />`. Пустой блок панель не рисует сама.

- [ ] **Step 2: Удалить осиротевшее**

```bash
git rm "apps/web/src/app/(app)/SummaryStatus.tsx"
```

Из `apps/web/src/api/hooks/useStatus.ts` убрать `useQueryStatusSummary` и его ключ, из `hooks/index.ts` — реэкспорт. `useQueryProjectStatus` оставить: его зовёт `InfrastructureStatusPanel`.

- [ ] **Step 3: Проверить, что ничего не осталось**

```bash
grep -rn "SummaryStatus\|useQueryStatusSummary" apps/web/src
```
Expected: пусто.

- [ ] **Step 4: Типы и тесты**

Run: `pnpm typecheck && pnpm --filter @cairn/web test`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add -A apps/web/src
git commit -m "Показать проект на сводке один раз"
```

---

## Chunk 2: Чекпоинты роадмапа

Результат: панель версии шире, поле формулировки на семь строк, у чекпоинта есть ссылка на задачу, наружу она не уходит, заголовок подставляется из ссылки.

### Файлы

| Файл | Ответственность |
|---|---|
| `apps/web/src/components/Drawer/{types.ts,constants.ts,Drawer.tsx,Drawer.test.tsx}` | ширина панели |
| `apps/web/src/components/CheckpointForm/*` | многострочное поле, Ctrl+Enter, поле ссылки, автоподстановка |
| `packages/shared/src/schemas/roadmap.ts` | `url` в чекпоинте, отдельная публичная схема |
| `apps/api/src/db/schema/roadmap.ts` + `apps/api/drizzle/0022_*.sql` | колонка |
| `apps/api/src/roadmap/roadmap.projection.ts` | флаг «со ссылками» |
| `apps/api/src/roadmap/roadmap.repository.ts:288` | публичный путь — без ссылок |
| `apps/api/src/link-title/*` (создать) | чтение заголовка чужой страницы |
| `apps/web/src/components/VersionDrawer/CheckpointList.tsx` | формулировка как ссылка |

### Task 2.1: Ширина панели

**Files:**
- Create: `apps/web/src/components/Drawer/constants.ts`, `apps/web/src/components/Drawer/Drawer.test.tsx` (если ещё нет)
- Modify: `apps/web/src/components/Drawer/{types.ts,Drawer.tsx}`, `apps/web/src/components/VersionDrawer/VersionDrawer.tsx`

- [ ] **Step 1: Падающий тест**

```tsx
it('открывается широкой, когда попрошена ширина панели роадмапа', () => {
  render(
    <Drawer isOpen onClose={() => {}} title="Версия" width={DrawerWidth.Wide}>
      содержимое
    </Drawer>,
  );

  expect(screen.getByRole('dialog')).toHaveClass('max-w-[640px]');
});

it('по умолчанию остаётся узкой', () => {
  render(
    <Drawer isOpen onClose={() => {}} title="Версия">
      содержимое
    </Drawer>,
  );

  expect(screen.getByRole('dialog')).toHaveClass('max-w-[480px]');
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `pnpm --filter @cairn/web test -- src/components/Drawer`

- [ ] **Step 3: Реализация**

`types.ts` — `enum DrawerWidth { Default = 'default', Wide = 'wide' }` и необязательный проп `width?: DrawerWidth`.

`constants.ts`:

```ts
import { DrawerWidth } from './types';

/**
 * Классы ширины записаны целиком: Tailwind вырезает классы, которых нет
 * в исходниках буквально, и `max-w-[${value}]` не пережил бы сборку.
 */
export const WIDTH_CLASSES: Record<DrawerWidth, string> = {
  [DrawerWidth.Default]: 'max-w-[480px]',
  [DrawerWidth.Wide]: 'max-w-[640px]',
};
```

В `Drawer.tsx` подставить `WIDTH_CLASSES[width]` вместо литерала `max-w-[480px]`, умолчание — `DrawerWidth.Default`. В `VersionDrawer.tsx` передать `width={DrawerWidth.Wide}`; `CreateVersionPanel.tsx` не трогать — там одна форма из четырёх полей, и шире ей незачем.

- [ ] **Step 4: Запустить** → PASS.
- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/Drawer apps/web/src/components/VersionDrawer/VersionDrawer.tsx
git commit -m "Дать панели версии ширину для формулировок"
```

### Task 2.2: Поле формулировки на семь строк

**Files:**
- Modify: `apps/web/src/components/CheckpointForm/CheckpointForm.tsx`
- Create: `apps/web/src/components/CheckpointForm/CheckpointForm.test.tsx` (если ещё нет)

- [ ] **Step 1: Падающий тест**

```tsx
it('даёт полю семь строк высоты', () => {
  render(<CheckpointForm onSubmit={() => {}} />);

  expect(screen.getByLabelText('Формулировка')).toHaveAttribute('rows', '7');
});

it('отправляет по Ctrl+Enter', async () => {
  const onSubmit = vi.fn();
  render(<CheckpointForm onSubmit={onSubmit} />);

  const field = screen.getByLabelText('Формулировка');
  await userEvent.type(field, 'Перевести биллинг на новый тариф');
  await userEvent.keyboard('{Control>}{Enter}{/Control}');

  expect(onSubmit).toHaveBeenCalledWith({ title: 'Перевести биллинг на новый тариф', url: null });
});

it('не отправляет пустую формулировку', async () => {
  const onSubmit = vi.fn();
  render(<CheckpointForm onSubmit={onSubmit} />);

  await userEvent.keyboard('{Control>}{Enter}{/Control}');

  expect(onSubmit).not.toHaveBeenCalled();
});
```

Поле `url` появится в Task 2.4 — на этом шаге ожидание `{ title }` без `url`, потом тест правится вместе с реализацией.

- [ ] **Step 2: Запустить, убедиться что падает**
- [ ] **Step 3: Реализация**

`<input>` заменить на `<textarea rows={7}>`, кнопку «Добавить» перенести под поле (обёртка `flex gap-2` больше не нужна), добавить обработчик:

```tsx
function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
  // С многострочным полем Enter перестаёт отправлять форму, и без этого
  // сочетания клавиатурного пути к кнопке не остаётся вовсе.
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    submit();
  }
}
```

Общую часть отправки вынести в `submit()`, чтобы `handleSubmit` и `handleKeyDown` не расходились.

- [ ] **Step 4: Запустить** → PASS.
- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/CheckpointForm
git commit -m "Дать формулировке чекпоинта место"
```

### Task 2.3: Контракт — ссылка у чекпоинта, публичная схема без неё

Ключевое место главы. `publicRoadmapSchema` сейчас переиспользует `roadmapVersionDetailSchema`, и наивно добавленное поле утекло бы на публичную страницу вместе с адресом трекера.

**Files:**
- Modify: `packages/shared/src/schemas/roadmap.ts`
- Modify: `packages/shared/src/schemas/roadmap.test.ts`

- [ ] **Step 1: Падающий тест**

```ts
it('принимает ссылку на задачу', () => {
  const parsed = roadmapCheckpointSchema.parse({
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Перевести биллинг',
    isDone: false,
    position: 1,
    url: 'https://tracker.example.com/TASK-17',
  });

  expect(parsed.url).toBe('https://tracker.example.com/TASK-17');
});

it('не пускает ссылку в публичный роадмап', () => {
  const version = {
    id: '11111111-1111-4111-8111-111111111111',
    label: 'v1',
    state: RoadmapVersionState.Planned,
    plannedDate: null,
    releasedDate: null,
    position: 1,
    progress: { done: 0, total: 1 },
    checkpoints: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Перевести биллинг',
        isDone: false,
        position: 1,
        url: 'https://tracker.example.com/TASK-17',
      },
    ],
  };

  expect(() =>
    publicRoadmapSchema.parse({ projectName: 'Лавка', stage: { current: 1, total: 1 }, versions: [version] }),
  ).toThrow();
});
```

Второй тест опирается на строгость схем: лишнее поле — ошибка, а не молчаливое отбрасывание. Если схемы версии окажутся нестрогими, добавь `.strict()` публичной схеме чекпоинта — тихое отбрасывание здесь недопустимо, оно скрыло бы ошибку проекции.

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `pnpm --filter @cairn/shared test -- src/schemas/roadmap.test.ts`

- [ ] **Step 3: Реализация**

```ts
/** Ссылка на задачу во внешнем трекере. */
const checkpointUrlSchema = z.string().trim().url().max(2000).nullable();
```

- `roadmapCheckpointSchema` — добавить `url: checkpointUrlSchema`;
- `roadmapCheckpointCreateSchema` и `roadmapCheckpointUpdateSchema` — добавить `url: checkpointUrlSchema.optional()`;
- новая публичная схема:

```ts
/**
 * Чекпоинт в публичной выдаче: без ссылки на задачу.
 *
 * Публичная страница роадмапа открыта без авторизации, и ссылка на задачу
 * раскрыла бы адрес внутреннего трекера вместе с номером задачи. Отдельная
 * схема, а не проекция по уровню: публичная страница ходит именно под
 * уровнем чтения, и различать пути по уровню значило бы менять его смысл.
 */
export const publicCheckpointSchema = roadmapCheckpointSchema.omit({ url: true }).strict();

/** Версия в публичной выдаче. */
export const publicVersionSchema = roadmapVersionMetadataSchema.extend({
  checkpoints: z.array(publicCheckpointSchema),
});
```

`publicRoadmapSchema.versions` — `z.array(publicVersionSchema)`. Добавить типы `PublicCheckpoint`, `PublicVersion` и обновить `PublicRoadmap`.

- [ ] **Step 4: Запустить** → PASS. Затем `pnpm typecheck` — он покажет все места, где тип публичного роадмапа разошёлся; это ожидаемо и чинится в Task 2.5.
- [ ] **Step 5: Коммит**

```bash
git add packages/shared/src/schemas/roadmap.ts packages/shared/src/schemas/roadmap.test.ts
git commit -m "Завести ссылку у чекпоинта, закрыв её от публичной выдачи"
```

### Task 2.4: Колонка в базе

**Files:**
- Modify: `apps/api/src/db/schema/roadmap.ts`
- Create: `apps/api/drizzle/0022_checkpoint_url.sql` (генерируется)

- [ ] **Step 1: Добавить колонку в схему**

В `roadmapCheckpoints` после `title`:

```ts
url: text('url'),
```

- [ ] **Step 2: Сгенерировать миграцию**

Run: `pnpm --filter @cairn/api db:generate`
Expected: появился `apps/api/drizzle/0022_*.sql` с `ALTER TABLE "roadmap_checkpoints" ADD COLUMN "url" text;` и запись в `drizzle/meta/_journal.json`.

Файл переименовывать **не надо** — имя должно совпадать с `tag` в журнале. Прав раздавать не требуется: колонка наследует права таблицы, отдельная миграция привилегий (как `0020_domain_privileges.sql`) нужна только новым таблицам.

- [ ] **Step 3: Прогнать интеграционные тесты роадмапа**

Run: `pnpm --filter @cairn/api test -- src/roadmap`
Expected: PASS (Testcontainers применяет миграции сам).

- [ ] **Step 4: Коммит**

```bash
git add apps/api/src/db/schema/roadmap.ts apps/api/drizzle
git commit -m "Хранить ссылку чекпоинта"
```

### Task 2.5: Проекция и публичный путь

**Files:**
- Modify: `apps/api/src/roadmap/roadmap.projection.ts`, `roadmap.projection.test.ts`
- Modify: `apps/api/src/roadmap/roadmap.repository.ts` (около строки 288)
- Modify: `apps/api/src/roadmap/roadmap.repository.test.ts`

- [ ] **Step 1: Падающие тесты**

В `roadmap.projection.test.ts`:

```ts
it('отдаёт ссылку чекпоинта при уровне чтения', () => {
  const projected = versionProjection(version, checkpoints, AccessLevel.Read) as RoadmapVersionDetail;

  expect(projected.checkpoints[0]?.url).toBe('https://tracker.example.com/TASK-17');
});

it('не отдаёт ссылку, когда просили без ссылок', () => {
  const projected = versionProjection(version, checkpoints, AccessLevel.Read, false) as RoadmapVersionDetail;

  expect(projected.checkpoints[0]).not.toHaveProperty('url');
});
```

В `roadmap.repository.test.ts` — интеграционный тест публичного пути:

```ts
it('публичная выдача не содержит ссылок на задачи', async () => {
  // …завести проект, версию, чекпоинт с url, публичную ссылку…
  const published = await repository.findByPublicToken(token);

  expect(published?.versions[0]?.checkpoints[0]).not.toHaveProperty('url');
});
```

Имя метода публичного чтения сверить по `roadmap.repository.ts` (около строки 270) и по вызову из `roadmap.controller.ts` — в плане оно приведено по памяти.

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `pnpm --filter @cairn/api test -- src/roadmap`

- [ ] **Step 3: Реализация**

`versionProjection` получает четвёртый параметр:

```ts
export function versionProjection(
  version: RoadmapVersionRow,
  checkpoints: RoadmapCheckpointRow[],
  level: AccessLevel,
  withLinks = true,
): RoadmapVersionMetadata | RoadmapVersionDetail {
```

и в ветке чтения собирает чекпоинт так:

```ts
checkpoints: checkpoints.map((checkpoint) => ({
  id: checkpoint.id,
  title: checkpoint.title,
  isDone: checkpoint.isDone,
  position: checkpoint.position,
  // Поле добавляется, а не обнуляется: публичная схема строгая, и `url: null`
  // был бы для неё такой же ошибкой, как и настоящий адрес.
  ...(withLinks ? { url: checkpoint.url } : {}),
})),
```

Умолчание `true` выбрано осознанно: забыть флаг на внутреннем пути — потерять ссылку, забыть на публичном — раскрыть её. Публичный путь один, он правится здесь же и покрыт тестом.

В `roadmap.repository.ts` в публичном чтении передать `false` и снять `as RoadmapVersionDetail` в пользу типа публичной версии.

- [ ] **Step 4: Запустить** → PASS. Затем `pnpm typecheck`.
- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/roadmap
git commit -m "Закрыть ссылки чекпоинтов от публичного роадмапа"
```

### Task 2.6: Чекпоинт кликается

**Files:**
- Modify: `apps/web/src/components/VersionDrawer/CheckpointList.tsx`
- Create: `apps/web/src/components/VersionDrawer/CheckpointList.test.tsx` (если ещё нет)

- [ ] **Step 1: Падающий тест**

```tsx
it('ведёт на задачу, когда ссылка задана', () => {
  render(<CheckpointList checkpoints={[withUrl]} canWrite onToggle={() => {}} onDelete={() => {}} />);

  const link = screen.getByRole('link', { name: withUrl.title });

  expect(link).toHaveAttribute('href', withUrl.url);
  expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
});

it('без ссылки оставляет формулировку текстом', () => {
  render(<CheckpointList checkpoints={[plain]} canWrite onToggle={() => {}} onDelete={() => {}} />);

  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});

it('переключает галочку только самим чекбоксом', async () => {
  const onToggle = vi.fn();
  render(<CheckpointList checkpoints={[withUrl]} canWrite onToggle={onToggle} onDelete={() => {}} />);

  await userEvent.click(screen.getByRole('link', { name: withUrl.title }));

  expect(onToggle).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Запустить, убедиться что падает**
- [ ] **Step 3: Реализация**

Формулировка со ссылкой рисуется `<a href target="_blank" rel="noopener noreferrer">`, без ссылки — прежним `<label htmlFor>`. Связь `label`→чекбокс при наличии ссылки разрывается намеренно: иначе клик по задаче и переключал бы галочку, и открывал вкладку. Доступность держится на `aria-label={checkpoint.title}`, который у чекбокса уже есть.

Если после правки компонент перевалит за 100 строк — вынести строку списка в `CheckpointItem.tsx` рядом.

- [ ] **Step 4: Запустить** → PASS.
- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/VersionDrawer
git commit -m "Открывать задачу по клику на чекпоинт"
```

### Task 2.7: Чтение заголовка чужой страницы

Самая опасная часть главы: сервер по просьбе пользователя идёт по произвольному адресу. Без проверок это инструмент разведки внутренней сети.

**Files:**
- Create: `apps/api/src/link-title/{link-title.module.ts,link-title.controller.ts,link-title.service.ts,link-title.guard.ts,link-title.guard.test.ts,link-title.service.test.ts}`
- Modify: `apps/api/src/app.module.ts`
- Modify: `packages/shared/src/schemas/roadmap.ts` (схемы запроса и ответа)

- [ ] **Step 1: Падающий тест на разбор адреса**

`link-title.guard.test.ts` — чистые тесты, без сети и без базы:

```ts
describe('assertPublicAddress', () => {
  it.each([
    'http://127.0.0.1/admin',
    'http://10.1.2.3/',
    'http://172.16.0.5/',
    'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/',
  ])('отвергает приватный адрес %s', (url) => {
    expect(() => assertPublicAddress(new URL(url), addressOf(url))).toThrow();
  });

  it.each(['ftp://example.com/', 'file:///etc/passwd'])('отвергает схему %s', (url) => {
    expect(() => assertPublicScheme(new URL(url))).toThrow();
  });

  it('пропускает публичный адрес', () => {
    expect(() => assertPublicAddress(new URL('https://example.com/'), '93.184.216.34')).not.toThrow();
  });
});
```

`169.254.169.254` в списке не случайно: это адрес метаданных облачных провайдеров, классическая цель такой подмены.

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `pnpm --filter @cairn/api test -- src/link-title`

- [ ] **Step 3: Реализация проверок**

`link-title.guard.ts` — чистые функции без ввода-вывода: разбор адреса отделён от похода в сеть, чтобы проверять его без контейнеров и без интернета.

Запрещённые диапазоны: `0.0.0.0/8`, `10.0.0.0/8`, `127.0.0.0/8`, `169.254.0.0/16`, `172.16.0.0/12`, `192.168.0.0/16`, `::1`, `fc00::/7`, `fe80::/10`. Схемы — только `http` и `https`.

- [ ] **Step 4: Реализация чтения**

`link-title.service.ts`:

- `dns.promises.lookup(hostname, { all: true })`, каждый полученный адрес — через `assertPublicAddress`; отказ, если хоть один приватный;
- `fetch` с `redirect: 'manual'`, не больше трёх переходов, каждый — с той же проверкой заново (иначе публичный адрес, редиректящий на `127.0.0.1`, проходит насквозь);
- `AbortController` с таймаутом 3 с;
- чтение потоком не больше 256 КБ;
- из тела берётся только содержимое `<title>`, обрезается по 300 символам (предел `title` чекпоинта), сущности `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;` раскрываются;
- любая неудача — `{ title: null }`, а не исключение: это удобство, а не обязанность.

`link-title.controller.ts` — `POST /projects/:projectId/roadmap/link-title`. Адрес начинается с проекта намеренно: право проверяется тем же путём, что у самого чекпоинта (запись в секцию «Роадмап»), и отдельной проверки прав на новом эндпоинте не заводится. Как именно попросить проверку — посмотреть в `roadmap.service.ts`; повторить, а не изобретать.

- [ ] **Step 5: Тест сервиса на подставном сервере**

Поднять `node:http` на `127.0.0.1` и проверить, что запрос к нему **отвергается** (адрес приватный) — это и есть главный тест. Отдельно — разбор `<title>` чистой функцией на строке HTML, без сети.

- [ ] **Step 6: Запустить** → PASS. Затем `pnpm typecheck`.
- [ ] **Step 7: Коммит**

```bash
git add apps/api/src/link-title apps/api/src/app.module.ts packages/shared/src/schemas/roadmap.ts
git commit -m "Читать заголовок задачи, не пуская сервер во внутреннюю сеть"
```

### Task 2.8: Ссылка и автоподстановка в форме

**Files:**
- Modify: `apps/web/src/components/CheckpointForm/*`
- Modify: `apps/web/src/api/hooks/useMutationRoadmap.ts`, `hooks/index.ts`
- Modify: `apps/web/src/components/VersionDrawer/types.ts` (тип `onAddCheckpoint`)

- [ ] **Step 1: Падающие тесты**

```tsx
it('подставляет заголовок в пустую формулировку', async () => {
  render(<CheckpointForm onSubmit={() => {}} onReadTitle={async () => 'Перевести биллинг'} />);

  await userEvent.type(screen.getByLabelText('Ссылка на задачу'), 'https://tracker.example.com/TASK-17');
  await userEvent.tab();

  expect(await screen.findByDisplayValue('Перевести биллинг')).toBeInTheDocument();
});

it('не затирает уже написанную формулировку', async () => {
  render(<CheckpointForm onSubmit={() => {}} onReadTitle={async () => 'Из трекера'} />);

  await userEvent.type(screen.getByLabelText('Формулировка'), 'Своя формулировка');
  await userEvent.type(screen.getByLabelText('Ссылка на задачу'), 'https://tracker.example.com/TASK-17');
  await userEvent.tab();

  expect(screen.getByLabelText('Формулировка')).toHaveValue('Своя формулировка');
});

it('молчит, когда заголовок прочитать не удалось', async () => {
  render(<CheckpointForm onSubmit={() => {}} onReadTitle={async () => null} />);

  await userEvent.type(screen.getByLabelText('Ссылка на задачу'), 'https://tracker.example.com/TASK-17');
  await userEvent.tab();

  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
```

Чтение вынесено в проп `onReadTitle`, а не зовётся хуком внутри: форма остаётся презентационной и проверяется без поднятия TanStack Query — так же, как `VersionDrawer`.

- [ ] **Step 2: Запустить, убедиться что падают**
- [ ] **Step 3: Реализация**

Поле «Ссылка на задачу» под формулировкой; чтение заголовка — по `onBlur` поля ссылки, только если формулировка пуста. Отправка — `{ title, url }`, пустая ссылка превращается в `null`. Неудача — молча.

Дебаунс не нужен: запрос идёт по уходу из поля, а не по каждому нажатию.

- [ ] **Step 4: Запустить весь веб и типы**

Run: `pnpm --filter @cairn/web test && pnpm typecheck`

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src
git commit -m "Заполнять формулировку из ссылки на задачу"
```

---

## Chunk 3: Поддомены

Результат: поддомен заводится из реестра доменов и из формы окружения через одни и те же эндпоинты; реестр показывает дерево; корень разбирается на глазах у пользователя.

### Файлы

| Файл | Ответственность |
|---|---|
| `apps/api/src/environments/environments.repository.ts` | `addDomain`, `removeDomain` |
| `apps/api/src/environments/environments.service.ts` | журнал |
| `apps/api/src/environments/environments.controller.ts` | два эндпоинта |
| `packages/shared/src/schemas/environment.ts` | схема одного адреса |
| `apps/web/src/components/DomainList/*` | дерево корней и поддоменов |
| `apps/web/src/components/SubdomainName/*` (создать) | имя с приглушённым корнем |
| `apps/web/src/components/DomainAddressForm/*` (создать) | один адрес с разбором корня |
| `apps/web/src/components/DomainsField/*` | комбобокс |

### Task 3.1: Эндпоинты одного адреса

**Files:**
- Modify: `packages/shared/src/schemas/environment.ts`
- Modify: `apps/api/src/environments/{environments.repository.ts,environments.service.ts,environments.controller.ts}`
- Modify: `apps/api/src/environments/{environments.repository.test.ts,environments.service.test.ts}`

- [ ] **Step 1: Падающие тесты репозитория**

```ts
it('добавляет один адрес, не трогая остальные', async () => {
  // окружение с ['stage.example.com']
  await testDb.db.transaction((tx) =>
    repository.addDomain(admin(), tx, projectId, environmentId, { name: 'api.example.com' }),
  );

  const environment = await repository.findById(admin(), projectId, environmentId);
  expect(environment.domains).toEqual(['api.example.com', 'stage.example.com']);
});

it('заводит корень нового адреса', async () => { /* … в domains появился example.com … */ });

it('отказывает уровню чтения', async () => {
  await expect(
    testDb.db.transaction((tx) =>
      repository.addDomain(reader(), tx, projectId, environmentId, { name: 'api.example.com' }),
    ),
  ).rejects.toThrow(ForbiddenException);
});

it('прячет окружение чужого проекта за 404', async () => { /* NotFoundException */ });

it('убирает адрес вместе с его статусами проверок', async () => { /* … */ });

it('не даёт завести тот же адрес дважды', async () => { /* ConflictException */ });
```

Помощники `admin()`, `reader()` и подъём базы взять из существующего `environments.repository.test.ts` — не выдумывать свои.

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `pnpm --filter @cairn/api test -- src/environments`

- [ ] **Step 3: Реализация**

В контракт — схема одного адреса:

```ts
/** Один адрес окружения: только имя, всё остальное выводится. */
export const environmentDomainCreateSchema = z.object({ name: domainSchema }).strict();
```

В репозитории — `addDomain` и `removeDomain`. Обе обязаны принимать субъект в сигнатуре и звать ту же проверку уровня, что `update`: репозиторий — единственный путь к данным, и проверку нельзя иметь возможность забыть (ТЗ 4.1).

`addDomain` повторяет хвост `replaceDomains` для одного имени: `ensureRoot` для корня, затем вставка. `removeDomain` повторяет её голову: сначала удалить `domainStatuses` записи, потом саму строку — внешние ключи стоят с `restrict`, каскадов в проекте нет.

Общую часть (`ensureRoot` + вставка) вынести в приватный метод, который зовут и `replaceDomains`, и `addDomain`: два места, заводящие корень по-разному, разойдутся при первой же правке.

В сервисе — журнал теми же действиями `EnvironmentUpdated`, метаданные `{ name: environment.name, fields: ['domains'] }`: снаружи это правка доменов окружения, и заводить новое действие журнала не нужно.

В контроллере:

```ts
@Post(':id/domains')
@Delete(':id/domains/:domainId')
```

Guard'а уровня доступа не добавлять — его здесь нет намеренно, уровень проверяет репозиторий.

- [ ] **Step 4: Запустить** → PASS.
- [ ] **Step 5: Коммит**

```bash
git add packages/shared/src/schemas/environment.ts apps/api/src/environments
git commit -m "Заводить и убирать адрес окружения по одному"
```

### Task 3.2: Имя поддомена с приглушённым корнем

**Files:**
- Create: `apps/web/src/components/SubdomainName/{index.ts,SubdomainName.tsx,types.ts,SubdomainName.test.tsx}`

- [ ] **Step 1: Падающий тест**

```tsx
it('приглушает корневую часть имени', () => {
  render(<SubdomainName name="api.example.com" root="example.com" />);

  expect(screen.getByText('api.')).toBeInTheDocument();
  expect(screen.getByText('example.com')).toHaveClass('text-muted-foreground');
});

it('корень показывает целиком, без приглушения', () => {
  render(<SubdomainName name="example.com" root="example.com" />);

  expect(screen.getByText('example.com')).not.toHaveClass('text-muted-foreground');
});
```

- [ ] **Step 2: Запустить, убедиться что падает**
- [ ] **Step 3: Реализация**

Серверный компонент (без `use client`): имя режется на префикс и корень, корень — `text-muted-foreground`. Адрес остаётся копируемым целиком — не вставлять между частями ничего, кроме самих символов имени.

- [ ] **Step 4: Запустить** → PASS.
- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/SubdomainName
git commit -m "Показывать поддомен вместе с его корнем"
```

### Task 3.3: Реестр становится деревом

**Files:**
- Modify: `apps/web/src/components/DomainList/{DomainList.tsx,DomainListItem.tsx,types.ts,DomainList.test.tsx}`
- Modify: `apps/web/src/app/(app)/domains/DomainsScreen.tsx`
- Modify: `apps/web/src/api/hooks/useQueryDomains.ts` (если нужен запрос деталей)

Реестр `GET /domains` отдаёт только корни со счётчиками; поддомены лежат в `GET /domains/:id`. Прежде чем писать код, реши, откуда брать поддомены для дерева:

- **предпочтительно** — добавить поддомены в `domainRowSchema` и отдавать их сразу в списке: `subdomainsOf` в репозитории уже вызывается для подсчёта счётчиков, данные есть, платить вторым запросом на каждый корень незачем;
- запасной путь — грузить детали по каждому корню, если первый вариант заденет что-то, чего не видно из плана.

При первом варианте это правка контракта и `domains.repository.ts:list` — с тестом на то, что поддомены пришли.

- [ ] **Step 1: Падающие тесты**

```tsx
it('показывает поддомены под их корнем без раскрытия', () => {
  render(<DomainList domains={[withSubdomains]} onDelete={() => {}} />);

  expect(screen.getByText('api.')).toBeInTheDocument();
});

it('ведёт с поддомена в его проект', () => {
  render(<DomainList domains={[withSubdomains]} onDelete={() => {}} />);

  expect(screen.getByRole('link', { name: 'Лавка' })).toHaveAttribute(
    'href',
    '/projects/11111111-1111-4111-8111-111111111111',
  );
});

it('корень без поддоменов остаётся одной строкой', () => { /* … */ });
```

- [ ] **Step 2: Запустить, убедиться что падают**
- [ ] **Step 3: Реализация**

Под строкой корня — вложенный `<ul>` с отступом, всегда видимый. Строка поддомена: `SubdomainName`, ссылки на проект и окружение, `×` для удаления (зовёт `DELETE` из Task 3.1).

Пустой реестр по-прежнему говорит «Доменов пока нет», но текст надо поправить: «Они появятся сами, когда в окружении будет вписан адрес» теперь неполно — адрес можно завести и здесь.

Следи за границей в 100 строк: `DomainListItem` почти наверняка придётся разделить на строку корня и строку поддомена.

- [ ] **Step 4: Запустить** → PASS.
- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/DomainList "apps/web/src/app/(app)/domains"
git commit -m "Показать реестр доменов деревом"
```

### Task 3.4: Форма адреса с разбором корня

**Files:**
- Create: `apps/web/src/components/DomainAddressForm/{index.ts,DomainAddressForm.tsx,types.ts,constants.ts,DomainAddressForm.test.tsx}`
- Modify: `apps/web/src/app/(app)/domains/new/NewDomainScreen.tsx`
- Modify: `apps/web/src/app/(app)/domains/[id]/...` (кнопка «Добавить поддомен» на карточке корня)

- [ ] **Step 1: Падающие тесты**

```tsx
it('называет корень введённого адреса', async () => {
  render(<DomainAddressForm knownRoots={['example.com']} projects={[]} onSubmit={() => {}} />);

  await userEvent.type(screen.getByLabelText('Адрес'), 'api.example.com');

  expect(screen.getByText(/example\.com/)).toBeInTheDocument();
  expect(screen.getByText(/уже в реестре/)).toBeInTheDocument();
});

it('предупреждает, что корень будет заведён', async () => { /* 'будет заведён' */ });

it('спрашивает проект и окружение только для поддомена', async () => {
  render(<DomainAddressForm knownRoots={[]} projects={projects} onSubmit={() => {}} />);

  await userEvent.type(screen.getByLabelText('Адрес'), 'example.com');
  expect(screen.queryByLabelText('Проект')).not.toBeInTheDocument();

  await userEvent.clear(screen.getByLabelText('Адрес'));
  await userEvent.type(screen.getByLabelText('Адрес'), 'api.example.com');
  expect(screen.getByLabelText('Проект')).toBeInTheDocument();
});

it('не отправляет поддомен без окружения', async () => { /* onSubmit не вызван */ });
```

- [ ] **Step 2: Запустить, убедиться что падают**
- [ ] **Step 3: Реализация**

`rootDomainOf` берётся из `@cairn/shared` — не переписывать правило в вебе, оно уже есть и покрыто тестами.

Ветвление: введён корень — показать поля владельца, регистратора, срока (переиспользовать `DomainForm`, а не копировать); введён поддомен — показать выбор проекта и окружения, оба обязательны. Отправка идёт либо в `POST /domains`, либо в `POST /projects/:projectId/environments/:environmentId/domains`.

На карточке корня — та же форма с зафиксированным суффиксом: вводится только левая часть.

- [ ] **Step 4: Запустить** → PASS.
- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/DomainAddressForm "apps/web/src/app/(app)/domains"
git commit -m "Принимать любой адрес одной формой"
```

### Task 3.5: Комбобокс в форме окружения

**Files:**
- Modify: `apps/web/src/components/DomainsField/{DomainsField.tsx,types.ts,DomainsField.test.tsx}`
- Modify: `apps/web/src/components/EnvironmentForm/EnvironmentForm.tsx`

- [ ] **Step 1: Падающие тесты**

```tsx
it('предлагает известные адреса', async () => {
  render(<DomainsField value={[]} onChange={() => {}} knownDomains={['api.example.com']} />);

  await userEvent.type(screen.getByLabelText('Домены'), 'api');

  expect(screen.getByRole('option', { name: 'api.example.com' })).toBeInTheDocument();
});

it('позволяет завести адрес, которого нет в списке', async () => {
  const onChange = vi.fn();
  render(<DomainsField value={[]} onChange={onChange} knownDomains={[]} />);

  await userEvent.type(screen.getByLabelText('Домены'), 'new.example.com');
  await userEvent.click(screen.getByRole('option', { name: /Создать/ }));

  expect(onChange).toHaveBeenCalledWith(['new.example.com']);
});

it('без списка работает как обычное поле ввода', async () => {
  render(<DomainsField value={[]} onChange={() => {}} />);

  await userEvent.type(screen.getByLabelText('Домены'), 'api');

  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});
```

Третий тест — не мелочь, а проверка правила из спеки: подрядчику список не показывается вовсе.

- [ ] **Step 2: Запустить, убедиться что падают**
- [ ] **Step 3: Реализация**

`knownDomains?: string[]` — необязательный проп. Пустой или отсутствующий список означает обычное поле ввода.

В `EnvironmentForm` список берётся **только** при `isSuperadmin`. Запрос к `GET /domains` делается по этому признаку заранее, а не «попробуем и поймаем 403»: подрядчику этот список раскрыл бы чужие адреса, а через них — существование чужих проектов, чего отсутствие доступа раскрывать не должно. Признак приходит из `/auth/me`; посмотри, как его уже получают другие экраны (`ServerField` решает ту же задачу через `canAssignServer`), и повтори этот способ.

Под полем — та же строка разбора корня, что в Task 3.4: она вычисляется из введённого пользователем и ничего чужого не раскрывает.

- [ ] **Step 4: Прогнать всё**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src
git commit -m "Выбирать адрес окружения из известных"
```

---

## Финальная проверка

- [ ] `pnpm test` — зелено во всех рабочих пространствах
- [ ] `pnpm typecheck` — чисто
- [ ] `pnpm build` — собирается
- [ ] `grep -rn "SummaryStatus\|useQueryStatusSummary" apps/web/src` — пусто
- [ ] Публичный роадмап открыт вручную по токену: ссылок на задачи в нём нет
- [ ] `CLAUDE.md` дополнен: реестр доменов принимает любой адрес; у чекпоинта есть ссылка на задачу, наружу не уходящая
