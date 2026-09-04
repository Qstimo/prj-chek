# Роадмап с выезжающей панелью — план реализации

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Экран роадмапа — только диаграмма с датами релиза; вся работа с версией — в панели, выезжающей справа; у версии появляется фактическая дата релиза.

**Architecture:** Новое поле `releasedDate` проходит через shared-контракт (zod) → колонку Drizzle → проекцию API. Панель — общий компонент `Drawer` на Radix Dialog и презентационный `VersionDrawer` (данные и колбэки пропами), одинаковый для внутреннего экрана и публичной страницы. Диаграмма перестраивается с единого SVG на колонки-кнопки.

**Tech Stack:** pnpm workspaces, zod (`packages/shared`), NestJS + Drizzle + Testcontainers (`apps/api`), Next.js 15 + TanStack Query + `@radix-ui/react-dialog` + Tailwind + Vitest/RTL (`apps/web`).

**Источник правды:** `docs/superpowers/specs/2026-09-04-roadmap-drawer-design.md`. Разработка по @superpowers:test-driven-development: сначала падающий тест, затем реализация.

**Команды** (из корня репозитория, если не сказано иное):
- тесты shared: `pnpm --filter @cairn/shared test`
- тесты api: `cd apps/api && pnpm vitest run <файл>` (интеграционные поднимают PostgreSQL через Testcontainers — нужен Docker)
- тесты web: `cd apps/web && pnpm vitest run <файл>`
- typecheck всего репо: `pnpm typecheck`

**Замечание о зелёности:** внутри чанка 1 полный `pnpm typecheck` может быть красным между задачами (shared-тип меняется раньше, чем API и веб-фикстуры). К концу каждого чанка `pnpm typecheck` и затронутые тесты обязаны быть зелёными.

## Структура файлов

Создаются:
- `apps/api/drizzle/0016_*.sql` — миграция (генерируется drizzle-kit)
- `apps/web/src/utils/format-date.ts`, `format-date.test.ts`, `index.ts`
- `apps/web/src/components/Drawer/{index.ts, Drawer.tsx, types.ts, Drawer.test.tsx}`
- `apps/web/src/components/VersionDrawer/{index.ts, VersionDrawer.tsx, VersionPassport.tsx, DeleteVersionButton.tsx, types.ts, utils.ts, utils.test.ts, VersionDrawer.test.tsx}` + переезжающие `constants.ts`, `CheckpointList.tsx`
- `apps/web/src/components/RoadmapTimeline/{TimelineColumn.tsx, utils.ts, utils.test.ts}`
- `apps/web/src/components/VersionForm/DateField.tsx`
- `apps/web/src/app/(app)/projects/[id]/roadmap/{RoadmapVersionPanel.tsx, RoadmapScreen.test.tsx}`
- `apps/web/src/app/roadmap/[token]/PublicRoadmapView.test.tsx`

Изменяются: `packages/shared/src/schemas/roadmap.ts` (+тест), `apps/api/src/db/schema/roadmap.ts`, `apps/api/src/roadmap/{roadmap.repository.ts, roadmap.projection.ts}` (+тесты), `apps/web/tailwind.config.ts`, `apps/web/src/components/VersionForm/*`, `apps/web/src/components/RoadmapTimeline/*`, `RoadmapScreen.tsx`, `PublicRoadmapView.tsx`.

Удаляются: `apps/web/src/components/VersionCard/` целиком (после переезда `constants.ts` и `CheckpointList.tsx`).

---

## Chunk 1: Данные — shared, БД, API

### Task 1: Колонка `released_date` в БД

**Files:**
- Modify: `apps/api/src/db/schema/roadmap.ts:39`
- Create: `apps/api/drizzle/0016_*.sql` (генерируется)

- [ ] **Step 1: Добавить колонку в Drizzle-схему**

В `apps/api/src/db/schema/roadmap.ts` после строки `plannedDate`:

```ts
    plannedDate: date('planned_date', { mode: 'string' }),
    releasedDate: date('released_date', { mode: 'string' }),
```

- [ ] **Step 2: Сгенерировать миграцию**

Run: `cd apps/api && pnpm db:generate`
Expected: новый файл `apps/api/drizzle/0016_*.sql`.

- [ ] **Step 3: Проверить содержимое миграции**

Открыть сгенерированный файл. Expected ровно:

```sql
ALTER TABLE "roadmap_versions" ADD COLUMN "released_date" date;
```

Никакого backfill: существующие строки остаются с `NULL` (спека, раздел 1).

- [ ] **Step 4: Прогнать существующие тесты роадмапа API**

Run: `cd apps/api && pnpm vitest run src/roadmap`
Expected: PASS (колонка nullable, поведение не изменилось).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/schema/roadmap.ts apps/api/drizzle
git commit -m "Добавить колонку фактической даты релиза версии роадмапа

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 2: `releasedDate` в shared-схемах

**Files:**
- Modify: `packages/shared/src/schemas/roadmap.ts`
- Test: `packages/shared/src/schemas/roadmap.test.ts`

- [ ] **Step 1: Написать падающие тесты**

В `roadmap.test.ts`, в describe со схемами версии (рядом с тестами `plannedDate`):

```ts
it('принимает дату релиза при создании', () => {
  expect(
    roadmapVersionCreateSchema.parse({ label: 'v1', releasedDate: '2026-09-01' }).releasedDate,
  ).toBe('2026-09-01');
  expect(
    roadmapVersionCreateSchema.parse({ label: 'v1', releasedDate: null }).releasedDate,
  ).toBeNull();
});

it('отклоняет дату релиза не в формате ГГГГ-ММ-ДД', () => {
  expect(() =>
    roadmapVersionCreateSchema.parse({ label: 'v1', releasedDate: '01.09.2026' }),
  ).toThrow();
});

it('метаданные версии содержат дату релиза', () => {
  const version = roadmapVersionMetadataSchema.parse({
    id: '123e4567-e89b-12d3-a456-426614174000',
    label: 'v1',
    state: RoadmapVersionState.Released,
    plannedDate: null,
    releasedDate: '2026-09-01',
    position: 1,
    progress: { done: 0, total: 0 },
  });

  expect(version.releasedDate).toBe('2026-09-01');
});
```

Если `roadmapVersionMetadataSchema` или `RoadmapVersionState` не импортированы в тест-файле — добавить в существующие импорты.

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `pnpm --filter @cairn/shared test`
Expected: FAIL — `releasedDate` отбрасывается `.strict()` (create) и отсутствует в метаданных.

- [ ] **Step 3: Реализовать**

В `packages/shared/src/schemas/roadmap.ts`:

1. Переименовать `plannedDateSchema` в `dayDateSchema` с комментарием (используется и планом, и фактом):

```ts
/** Дата-день без времени: план и факт релиза. */
const dayDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата ГГГГ-ММ-ДД')
  .nullable();
```

2. Заменить все три использования `plannedDateSchema` на `dayDateSchema`.

3. В `roadmapVersionMetadataSchema` после `plannedDate`:

```ts
  plannedDate: dayDateSchema,
  releasedDate: dayDateSchema,
```

4. В `roadmapVersionCreateSchema` и `roadmapVersionUpdateSchema` после `plannedDate`:

```ts
    plannedDate: dayDateSchema.optional(),
    releasedDate: dayDateSchema.optional(),
```

- [ ] **Step 4: Прогнать тесты shared**

Run: `pnpm --filter @cairn/shared test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/roadmap.ts packages/shared/src/schemas/roadmap.test.ts
git commit -m "Добавить дату релиза в контракт версии роадмапа

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 3: `releasedDate` в репозитории и проекции API

**Files:**
- Modify: `apps/api/src/roadmap/roadmap.repository.ts:85` (createVersion)
- Modify: `apps/api/src/roadmap/roadmap.projection.ts:28`
- Test: `apps/api/src/roadmap/roadmap.repository.test.ts`
- Modify: фикстуры в `apps/api/src/roadmap/roadmap.projection.test.ts`, `apps/web/src/components/VersionCard/VersionCard.test.tsx` и `apps/web/src/components/PromoteToCheckpoint/PromoteToCheckpoint.test.tsx` (литералы версий без `releasedDate` перестанут проходить typecheck)

- [ ] **Step 1: Написать падающий интеграционный тест**

В `roadmap.repository.test.ts` (в describe про версии, использовать существующие хелперы `admin()` и `projectId`):

```ts
it('сохраняет и отдаёт фактическую дату релиза', async () => {
  const version = await testDb.db.transaction((tx) =>
    repository.createVersion(admin(), tx, projectId, {
      label: 'v1',
      state: RoadmapVersionState.Released,
      releasedDate: '2026-09-01',
    }),
  );

  expect(version.releasedDate).toBe('2026-09-01');

  const roadmap = await repository.findForProject(admin(), projectId);
  expect(roadmap.versions[0]!.releasedDate).toBe('2026-09-01');
});

it('правит фактическую дату релиза', async () => {
  const version = await testDb.db.transaction((tx) =>
    repository.createVersion(admin(), tx, projectId, { label: 'v1' }),
  );

  const updated = await testDb.db.transaction((tx) =>
    repository.updateVersion(admin(), tx, projectId, version.id, { releasedDate: '2026-09-02' }),
  );

  expect(updated.releasedDate).toBe('2026-09-02');
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd apps/api && pnpm vitest run src/roadmap/roadmap.repository.test.ts -t "дату релиза"`
Expected: FAIL — `createVersion` не пишет поле (первый тест: `null` вместо даты). Второй может пройти за счёт спреда `...input` в `updateVersion` — это нормально, тест остаётся как регрессионный.

- [ ] **Step 3: Реализовать**

В `roadmap.repository.ts`, `createVersion`, после `plannedDate`:

```ts
        plannedDate: input.plannedDate ?? null,
        releasedDate: input.releasedDate ?? null,
```

В `roadmap.projection.ts`, в объекте метаданных после `plannedDate`:

```ts
      plannedDate: version.plannedDate,
      releasedDate: version.releasedDate,
```

`updateVersion` менять не нужно: спред `...input` уже переносит поле.

- [ ] **Step 4: Прогнать тесты и typecheck, починить фикстуры**

Run: `cd apps/api && pnpm vitest run src/roadmap && cd ../.. && pnpm typecheck`
Expected: тесты PASS. Typecheck укажет на фикстуры, где литералы `RoadmapVersionRow`/`RoadmapVersionMetadata` собраны вручную: `roadmap.projection.test.ts`, `apps/web/src/components/VersionCard/VersionCard.test.tsx` и `apps/web/src/components/PromoteToCheckpoint/PromoteToCheckpoint.test.tsx` (массив `versions` передаётся в проп типа `(RoadmapVersionMetadata | RoadmapVersionDetail)[]`). Добавить в эти литералы `releasedDate: null` и повторить. Если typecheck укажет ещё какие-то файлы — починить и их тем же способом. К концу шага `pnpm typecheck` зелёный во всех рабочих пространствах.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/roadmap apps/web/src/components/VersionCard apps/web/src/components/PromoteToCheckpoint
git commit -m "Сохранять и отдавать фактическую дату релиза версии

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Chunk 2: Веб-фундамент — formatDate, Drawer, VersionForm

### Task 4: Утилита `formatDate`

**Files:**
- Create: `apps/web/src/utils/format-date.ts`, `apps/web/src/utils/index.ts`
- Test: `apps/web/src/utils/format-date.test.ts`

- [ ] **Step 1: Написать падающий тест**

`apps/web/src/utils/format-date.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { formatDate } from './format-date';

describe('formatDate', () => {
  it('день ГГГГ-ММ-ДД в русском формате', () => {
    expect(formatDate('2026-12-01')).toBe('01.12.2026');
  });
});
```

Run: `cd apps/web && pnpm vitest run src/utils/format-date.test.ts`
Expected: FAIL — модуля нет.

- [ ] **Step 2: Реализовать**

`apps/web/src/utils/format-date.ts`:

```ts
/**
 * Дата-день `ГГГГ-ММ-ДД` в русском формате `ДД.ММ.ГГГГ`.
 *
 * `T00:00:00` фиксирует местную полночь: без него строка дня трактуется
 * как UTC и в западных поясах дата уезжает на день назад.
 */
export function formatDate(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString('ru-RU');
}
```

`apps/web/src/utils/index.ts`:

```ts
export { formatDate } from './format-date';
```

- [ ] **Step 3: Прогнать тест**

Run: `cd apps/web && pnpm vitest run src/utils/format-date.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/utils
git commit -m "Добавить общий форматтер даты-дня по русской локали

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 5: Компонент `Drawer`

**Files:**
- Create: `apps/web/src/components/Drawer/{index.ts, Drawer.tsx, types.ts}`
- Modify: `apps/web/tailwind.config.ts` (анимация)
- Test: `apps/web/src/components/Drawer/Drawer.test.tsx`

- [ ] **Step 1: Написать падающие тесты**

`Drawer.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Drawer } from './Drawer';

describe('Drawer', () => {
  it('закрытая панель не рендерится', () => {
    render(
      <Drawer isOpen={false} onClose={vi.fn()} title="Панель">
        содержимое
      </Drawer>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('открытая панель показывает заголовок и содержимое', () => {
    render(
      <Drawer isOpen onClose={vi.fn()} title="Панель">
        содержимое
      </Drawer>,
    );

    expect(screen.getByRole('dialog', { name: 'Панель' })).toBeInTheDocument();
    expect(screen.getByText('содержимое')).toBeInTheDocument();
  });

  it('закрывается крестиком', async () => {
    const onClose = vi.fn();
    render(
      <Drawer isOpen onClose={onClose} title="Панель">
        содержимое
      </Drawer>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('закрывается по Esc', async () => {
    const onClose = vi.fn();
    render(
      <Drawer isOpen onClose={onClose} title="Панель">
        содержимое
      </Drawer>,
    );

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });
});
```

Закрытие кликом по подложке не тестируем: это поведение Radix Dialog, а
попадание в оверлей из jsdom нестабильно; Esc и крестик покрывают контракт
`onClose`.

Run: `cd apps/web && pnpm vitest run src/components/Drawer`
Expected: FAIL — компонента нет.

- [ ] **Step 2: Добавить анимацию в Tailwind**

В `apps/web/tailwind.config.ts`, внутрь `theme.extend`:

```ts
      keyframes: {
        'drawer-in': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
      },
      animation: {
        'drawer-in': 'drawer-in 0.2s ease-out',
      },
```

- [ ] **Step 3: Реализовать**

`types.ts`:

```ts
import type { ReactNode } from 'react';

/** Пропсы выезжающей панели. */
export interface IProps {
  isOpen: boolean;
  onClose: () => void;
  /** Заголовок — он же имя диалога для читалок. */
  title: string;
  children: ReactNode;
}
```

`Drawer.tsx`:

```tsx
'use client';

import * as Dialog from '@radix-ui/react-dialog';

import type { IProps } from './types';

/**
 * Панель, выезжающая справа (спека, раздел 3).
 *
 * Обёртка Radix Dialog: фокус-ловушка, Esc, клик по подложке и блокировка
 * прокрутки — от Radix. Подложка полупрозрачная: диаграмма остаётся видна.
 */
export function Drawer({ isOpen, onClose, title, children }: IProps) {
  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 w-full max-w-[480px] animate-drawer-in space-y-4 overflow-y-auto border-l border-border bg-background p-6"
        >
          <header className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-lg font-medium">{title}</Dialog.Title>
            <Dialog.Close
              aria-label="Закрыть"
              className="rounded-md border px-2 py-0.5 text-muted-foreground"
            >
              ×
            </Dialog.Close>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

`aria-describedby={undefined}` гасит предупреждение Radix об отсутствующем
описании: содержимое панели произвольное.

`index.ts`:

```ts
export { Drawer } from './Drawer';
export type { IProps } from './types';
```

- [ ] **Step 4: Прогнать тесты**

Run: `cd apps/web && pnpm vitest run src/components/Drawer`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/Drawer apps/web/tailwind.config.ts
git commit -m "Добавить выезжающую справа панель на Radix Dialog

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 6: Поле «Дата релиза» в `VersionForm`

**Files:**
- Modify: `apps/web/src/components/VersionForm/VersionForm.tsx`, `types.ts`
- Create: `apps/web/src/components/VersionForm/DateField.tsx`
- Test: `apps/web/src/components/VersionForm/VersionForm.test.tsx`

- [ ] **Step 1: Написать падающие тесты**

Добавить в `VersionForm.test.tsx`:

```tsx
it('поле даты релиза появляется только у выпущенной', async () => {
  render(<VersionForm onSubmit={vi.fn()} />);

  expect(screen.queryByLabelText('Дата релиза')).not.toBeInTheDocument();

  await userEvent.selectOptions(screen.getByLabelText('Состояние'), 'released');

  expect(screen.getByLabelText('Дата релиза')).toBeInTheDocument();
});

it('переключение в «выпущена» подставляет сегодняшнюю дату', async () => {
  render(<VersionForm onSubmit={vi.fn()} />);

  await userEvent.selectOptions(screen.getByLabelText('Состояние'), 'released');

  const today = new Intl.DateTimeFormat('sv-SE').format(new Date());
  expect(screen.getByLabelText('Дата релиза')).toHaveValue(today);
});

it('отправляет дату релиза выпущенной версии', async () => {
  const onSubmit = vi.fn();
  render(<VersionForm onSubmit={onSubmit} />);

  await userEvent.type(screen.getByLabelText('Обозначение'), 'v1.0');
  await userEvent.selectOptions(screen.getByLabelText('Состояние'), 'released');
  await userEvent.clear(screen.getByLabelText('Дата релиза'));
  await userEvent.type(screen.getByLabelText('Дата релиза'), '2026-09-01');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ releasedDate: '2026-09-01' }),
  );
});

it('для невыпущенной отправляет releasedDate: null', async () => {
  const onSubmit = vi.fn();
  render(
    <VersionForm
      initial={{
        label: 'v1.0',
        state: RoadmapVersionState.Released,
        plannedDate: null,
        releasedDate: '2026-09-01',
      }}
      onSubmit={onSubmit}
    />,
  );

  await userEvent.selectOptions(screen.getByLabelText('Состояние'), 'planned');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ releasedDate: null }));
});

it('берёт дату релиза из initial', () => {
  render(
    <VersionForm
      initial={{
        label: 'v1.0',
        state: RoadmapVersionState.Released,
        plannedDate: null,
        releasedDate: '2026-09-01',
      }}
      onSubmit={vi.fn()}
    />,
  );

  expect(screen.getByLabelText('Дата релиза')).toHaveValue('2026-09-01');
});
```

Существующий тест «отправляет обозначение, состояние и дату» дополнить
ожиданием `releasedDate: null` в объекте `toHaveBeenCalledWith`.

Run: `cd apps/web && pnpm vitest run src/components/VersionForm`
Expected: FAIL — поля нет; typecheck-ошибки в `initial` уйдут после правки `types.ts`.

- [ ] **Step 2: Реализовать**

`types.ts` — в `VersionFormInitial` после `plannedDate`:

```ts
  plannedDate: string | null;
  releasedDate: string | null;
```

`DateField.tsx` (общая разметка полей дат — плановая и релиза):

```tsx
'use client';

/** Пропсы поля даты. */
interface IProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}

/** Поле даты-дня с подписью. */
export function DateField({ id, label, value, onChange }: IProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-border px-3 py-2"
      />
    </div>
  );
}
```

`VersionForm.tsx` — целиком:

```tsx
'use client';

import { RoadmapVersionState, type RoadmapVersionCreate } from '@cairn/shared';
import { useState, type FormEvent } from 'react';

import { TextField } from '../TextField';
import { STATE_LABELS } from '../VersionCard';
import { DateField } from './DateField';
import type { IProps } from './types';

/** Форма версии роадмапа: обозначение, состояние, даты (ТЗ 3.5). */
export function VersionForm({ initial, onSubmit, error, isSubmitting = false }: IProps) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [state, setState] = useState<RoadmapVersionState>(
    initial?.state ?? RoadmapVersionState.Planned,
  );
  const [plannedDate, setPlannedDate] = useState(initial?.plannedDate ?? '');
  const [releasedDate, setReleasedDate] = useState(initial?.releasedDate ?? '');

  const isReleased = state === RoadmapVersionState.Released;
  const canSubmit = label.trim().length > 0 && !isSubmitting;

  function handleStateChange(next: RoadmapVersionState): void {
    setState(next);

    // Обычный случай — релиз случился сегодня; дату можно поправить.
    if (next === RoadmapVersionState.Released && releasedDate.length === 0) {
      setReleasedDate(today());
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    onSubmit({
      label: label.trim(),
      state,
      plannedDate: plannedDate.length > 0 ? plannedDate : null,
      // Не «выпущена» — null, чтобы дата не залипала от прежнего состояния.
      releasedDate: isReleased && releasedDate.length > 0 ? releasedDate : null,
    } satisfies RoadmapVersionCreate);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <TextField id="label" label="Обозначение" value={label} onChange={setLabel} />

      <div className="space-y-1">
        <label htmlFor="state" className="block text-sm font-medium">
          Состояние
        </label>
        <select
          id="state"
          value={state}
          onChange={(event) => handleStateChange(event.target.value as RoadmapVersionState)}
          className="w-full rounded-md border border-border px-3 py-2"
        >
          {Object.values(RoadmapVersionState).map((value) => (
            <option key={value} value={value}>
              {STATE_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <DateField id="plannedDate" label="Плановая дата" value={plannedDate} onChange={setPlannedDate} />

      {isReleased && (
        <DateField id="releasedDate" label="Дата релиза" value={releasedDate} onChange={setReleasedDate} />
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
      >
        {isSubmitting ? 'Сохранение…' : 'Сохранить'}
      </button>
    </form>
  );
}

/** Сегодняшний день `ГГГГ-ММ-ДД` по местному времени (sv-SE даёт ISO-порядок). */
function today(): string {
  return new Intl.DateTimeFormat('sv-SE').format(new Date());
}
```

Импорт `STATE_LABELS` из `../VersionCard` пока остаётся — переезд в задаче 8.

- [ ] **Step 3: Прогнать тесты**

Run: `cd apps/web && pnpm vitest run src/components/VersionForm`
Expected: PASS.

Затем `pnpm typecheck` из корня: PASS. `RoadmapScreen.tsx:100` собирает `initial` вручную — добавить туда `releasedDate: editing.releasedDate` (иначе typecheck упадёт на `VersionFormInitial`).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/VersionForm "apps/web/src/app/(app)/projects/[id]/roadmap/RoadmapScreen.tsx"
git commit -m "Добавить дату релиза в форму версии роадмапа

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Chunk 3: Диаграмма — колонки-кнопки с датами

### Task 7: Перестроить `RoadmapTimeline`

**Files:**
- Modify: `apps/web/src/components/RoadmapTimeline/{RoadmapTimeline.tsx, types.ts}`
- Create: `apps/web/src/components/RoadmapTimeline/{TimelineColumn.tsx, utils.ts, utils.test.ts}`
- Test: `apps/web/src/components/RoadmapTimeline/RoadmapTimeline.test.tsx`

- [ ] **Step 1: Написать падающие тесты**

Дополнить фикстуру `versions` в `RoadmapTimeline.test.tsx` полями дат:

```ts
const versions = [
  {
    id: '1',
    label: 'v1.0',
    state: RoadmapVersionState.Released,
    plannedDate: '2026-06-01',
    releasedDate: '2026-06-15',
    progress: { done: 1, total: 3 },
  },
  {
    id: '2',
    label: 'v2.0',
    state: RoadmapVersionState.InProgress,
    plannedDate: '2026-12-01',
    releasedDate: null,
    progress: { done: 1, total: 2 },
  },
  {
    id: '3',
    label: 'v3.0',
    state: RoadmapVersionState.Planned,
    plannedDate: null,
    releasedDate: null,
    progress: { done: 0, total: 0 },
  },
];
```

(во второй фикстуре `long` тоже добавить `plannedDate: null, releasedDate: null`).

Новые тесты дат вынести на утилиту — `utils.test.ts`:

```ts
import { RoadmapVersionState } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { dateLabelOf } from './utils';

const base = {
  id: '1',
  label: 'v1.0',
  plannedDate: null,
  releasedDate: null,
  progress: { done: 0, total: 0 },
};

describe('dateLabelOf', () => {
  it('выпущенная с датой — сама дата', () => {
    expect(
      dateLabelOf({ ...base, state: RoadmapVersionState.Released, releasedDate: '2026-06-15' }),
    ).toBe('15.06.2026');
  });

  it('выпущенная без даты — пусто, даже при плановой', () => {
    // После миграции у старых релизов даты нет; плановая с «ожидается» была бы ложью.
    expect(
      dateLabelOf({ ...base, state: RoadmapVersionState.Released, plannedDate: '2026-06-01' }),
    ).toBe('');
  });

  it('не выпущенная с плановой — «ожидается»', () => {
    expect(
      dateLabelOf({ ...base, state: RoadmapVersionState.Planned, plannedDate: '2026-12-01' }),
    ).toBe('ожидается 01.12.2026');
  });

  it('без дат — пусто', () => {
    expect(dateLabelOf({ ...base, state: RoadmapVersionState.InProgress })).toBe('');
  });
});
```

Новые тесты компонента — добавить в `RoadmapTimeline.test.tsx`:

```tsx
it('показывает даты под названиями', () => {
  render(<RoadmapTimeline versions={versions} currentIndex={1} />);

  expect(screen.getByText('15.06.2026')).toBeInTheDocument();
  expect(screen.getByText('ожидается 01.12.2026')).toBeInTheDocument();
});

it('с onSelect колонки — кнопки, клик отдаёт id версии', async () => {
  const onSelect = vi.fn();
  render(<RoadmapTimeline versions={versions} currentIndex={1} onSelect={onSelect} />);

  await userEvent.click(screen.getByRole('button', { name: 'Версия v2.0' }));

  expect(onSelect).toHaveBeenCalledWith('2');
});

it('кнопки версий доступны с клавиатуры', async () => {
  const onSelect = vi.fn();
  render(<RoadmapTimeline versions={versions} currentIndex={1} onSelect={onSelect} />);

  screen.getByRole('button', { name: 'Версия v1.0' }).focus();
  await userEvent.keyboard('{Enter}');

  expect(onSelect).toHaveBeenCalledWith('1');
});

it('без onSelect кнопок нет', () => {
  render(<RoadmapTimeline versions={versions} currentIndex={1} />);

  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
```

Добавить импорты `userEvent` и `vi` в тест-файл.

Run: `cd apps/web && pnpm vitest run src/components/RoadmapTimeline`
Expected: FAIL (нет `utils.ts`, нет дат и кнопок).

- [ ] **Step 2: Реализовать `utils.ts`**

Перенести `fractionOf` из `RoadmapTimeline.tsx`, добавить `dateLabelOf`:

```ts
import { RoadmapVersionState } from '@cairn/shared';

import { formatDate } from '@/utils';

import type { TimelineVersion } from './types';

/** Заполненность отметки: выпущенная всегда полная — выпущена, значит завершена. */
export function fractionOf(version: TimelineVersion): number {
  if (version.state === RoadmapVersionState.Released) {
    return 1;
  }

  if (version.progress.total === 0) {
    return 0;
  }

  return version.progress.done / version.progress.total;
}

/**
 * Подпись даты под названием версии (спека, раздел 2).
 *
 * Выпущенная без даты — пусто: фактическая дата неизвестна, показывать
 * плановую с «ожидается» для случившегося релиза было бы ложью.
 */
export function dateLabelOf(version: TimelineVersion): string {
  if (version.state === RoadmapVersionState.Released) {
    return version.releasedDate ? formatDate(version.releasedDate) : '';
  }

  return version.plannedDate ? `ожидается ${formatDate(version.plannedDate)}` : '';
}
```

- [ ] **Step 3: Реализовать `types.ts`**

```ts
import type { RoadmapProgress, RoadmapVersionState } from '@cairn/shared';

/** Версия на диаграмме: только то, что нужно отметке и подписи. */
export interface TimelineVersion {
  id: string;
  label: string;
  state: RoadmapVersionState;
  plannedDate: string | null;
  releasedDate: string | null;
  progress: RoadmapProgress;
}

/** Пропсы диаграммы роадмапа. */
export interface IProps {
  /** Версии по порядку последовательности. */
  versions: TimelineVersion[];
  /** Индекс текущей версии (0-based) либо null. */
  currentIndex: number | null;
  /** Клик по версии. Отсутствие — диаграмма статична. */
  onSelect?: (versionId: string) => void;
}
```

- [ ] **Step 4: Реализовать `TimelineColumn.tsx`**

```tsx
import { sectorPath } from './sector';
import type { TimelineVersion } from './types';
import { dateLabelOf, fractionOf } from './utils';

/** Геометрия отметки внутри колонки. */
const STEP = 96;
const CX = STEP / 2;
const CY = 28;
const RADIUS = 16;

/** Пропсы колонки диаграммы. */
interface IProps {
  version: TimelineVersion;
  isCurrent: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSelect?: (versionId: string) => void;
}

/**
 * Колонка диаграммы: отметка, название, дата.
 *
 * С обработчиком колонка — нативная кнопка: клик, фокус и клавиатура
 * без самодельной обвязки; сегменты линии соседних колонок смыкаются
 * на границах, образуя сплошную ось.
 */
export function TimelineColumn({ version, isCurrent, isFirst, isLast, onSelect }: IProps) {
  const content = (
    <>
      <svg aria-hidden="true" viewBox={`0 0 ${STEP} 56`} className="w-full">
        {!isFirst && (
          <line x1={0} y1={CY} x2={CX} y2={CY} className="stroke-border" strokeWidth="2" />
        )}
        {!isLast && (
          <line x1={CX} y1={CY} x2={STEP} y2={CY} className="stroke-border" strokeWidth="2" />
        )}
        <Mark version={version} isCurrent={isCurrent} />
      </svg>
      <span className="block break-words px-1 text-center text-xs">{version.label}</span>
      <span className="block min-h-4 px-1 text-center text-xs text-muted-foreground">
        {dateLabelOf(version)}
      </span>
    </>
  );

  if (!onSelect) {
    return <div className="min-w-0 flex-1">{content}</div>;
  }

  return (
    <button
      type="button"
      aria-label={`Версия ${version.label}`}
      onClick={() => onSelect(version.id)}
      className="min-w-0 flex-1 rounded-md"
    >
      {content}
    </button>
  );
}

/** Отметка: круг-основа, сектор прогресса, кольцо текущей. */
function Mark({ version, isCurrent }: { version: TimelineVersion; isCurrent: boolean }) {
  const sector = sectorPath(CX, CY, RADIUS, fractionOf(version));

  return (
    <g data-version={version.label} data-current={isCurrent ? 'true' : undefined}>
      <circle cx={CX} cy={CY} r={RADIUS} className="fill-background stroke-border" strokeWidth="2" />

      {sector === 'full' ? (
        <circle cx={CX} cy={CY} r={RADIUS} data-fill="full" className="fill-primary" />
      ) : (
        sector && <path d={sector} data-fill="partial" className="fill-primary" />
      )}

      {isCurrent && (
        <circle cx={CX} cy={CY} r={RADIUS + 5} className="fill-none stroke-primary" strokeWidth="2" />
      )}
    </g>
  );
}
```

Сегменты линии тянутся от края колонки до центра: круг непрозрачный
(`fill-background`) и рисуется поверх, поэтому линия под ним не видна,
а стыки колонок смыкаются без зазоров при любой ширине.

- [ ] **Step 5: Реализовать `RoadmapTimeline.tsx`**

```tsx
import { TimelineColumn } from './TimelineColumn';
import type { IProps } from './types';

/**
 * Временная линия роадмапа (ТЗ 3.5): версии — отметки, заполненность
 * равна прогрессу, текущая выделена кольцом, под названием — дата релиза.
 */
export function RoadmapTimeline({ versions, currentIndex, onSelect }: IProps) {
  if (versions.length === 0) {
    return <p className="text-muted-foreground">Версий пока нет.</p>;
  }

  return (
    <div role="group" aria-label="Диаграмма роадмапа" className="flex w-full max-w-2xl">
      {versions.map((version, index) => (
        <TimelineColumn
          key={version.id}
          version={version}
          isCurrent={index === currentIndex}
          isFirst={index === 0}
          isLast={index === versions.length - 1}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Прогнать тесты и typecheck**

Run: `cd apps/web && pnpm vitest run src/components/RoadmapTimeline && cd ../.. && pnpm typecheck`
Expected: PASS. Старые тесты (полный круг, кольцо, подписи вне SVG, пустое
состояние) проходят без изменений — `data-*`-атрибуты сохранены.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/RoadmapTimeline
git commit -m "Перестроить диаграмму роадмапа на колонки-кнопки с датами

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Chunk 4: Панель версии

### Task 8: Переезд `STATE_LABELS` и `CheckpointList` в `VersionDrawer`

**Files:**
- Move: `apps/web/src/components/VersionCard/constants.ts` → `apps/web/src/components/VersionDrawer/constants.ts`
- Move: `apps/web/src/components/VersionCard/CheckpointList.tsx` → `apps/web/src/components/VersionDrawer/CheckpointList.tsx`
- Create: `apps/web/src/components/VersionDrawer/index.ts`
- Modify: `apps/web/src/components/VersionForm/VersionForm.tsx:7`, `apps/web/src/components/VersionCard/{VersionCard.tsx, index.ts}`

- [ ] **Step 1: Перенести файлы**

```bash
mkdir -p apps/web/src/components/VersionDrawer
git mv apps/web/src/components/VersionCard/constants.ts apps/web/src/components/VersionDrawer/constants.ts
git mv apps/web/src/components/VersionCard/CheckpointList.tsx apps/web/src/components/VersionDrawer/CheckpointList.tsx
```

- [ ] **Step 2: Обновить импорты и барели**

`apps/web/src/components/VersionDrawer/index.ts` (пока без самого компонента — он в задаче 9):

```ts
export { STATE_LABELS } from './constants';
```

`VersionForm.tsx`: `import { STATE_LABELS } from '../VersionDrawer';`

`VersionCard/VersionCard.tsx`: импорты `CheckpointList` и `STATE_LABELS` — из `../VersionDrawer/CheckpointList` и `../VersionDrawer` (временно, до удаления карточки в задаче 12).

`VersionCard/index.ts`: убрать строку `export { STATE_LABELS } from './constants';`.

- [ ] **Step 3: Прогнать тесты и typecheck**

Run: `cd apps/web && pnpm vitest run src/components && cd ../.. && pnpm typecheck`
Expected: PASS — чистый переезд без изменения поведения.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components
git commit -m "Перенести подписи состояний и список чекпоинтов в VersionDrawer

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 9: Компонент `VersionDrawer`

**Files:**
- Create: `apps/web/src/components/VersionDrawer/{VersionDrawer.tsx, VersionPassport.tsx, DeleteVersionButton.tsx, types.ts, utils.ts, utils.test.ts}`
- Modify: `apps/web/src/components/VersionDrawer/index.ts`
- Test: `apps/web/src/components/VersionDrawer/VersionDrawer.test.tsx`

- [ ] **Step 1: Написать падающие тесты**

`utils.test.ts`:

```ts
import { RoadmapVersionState } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { isDetailed } from './utils';

const metadata = {
  id: '1',
  label: 'v1.0',
  state: RoadmapVersionState.Planned,
  plannedDate: null,
  releasedDate: null,
  position: 1,
  progress: { done: 0, total: 0 },
};

describe('isDetailed', () => {
  it('различает проекции по наличию чекпоинтов', () => {
    expect(isDetailed(metadata)).toBe(false);
    expect(isDetailed({ ...metadata, checkpoints: [] })).toBe(true);
  });
});
```

`VersionDrawer.test.tsx`:

```tsx
import { RoadmapVersionState } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { VersionDrawer } from './VersionDrawer';
import type { IVersionActions } from './types';

const detail = {
  id: '1',
  label: 'v1.0',
  state: RoadmapVersionState.InProgress,
  plannedDate: '2026-12-01',
  releasedDate: null,
  position: 1,
  progress: { done: 1, total: 2 },
  checkpoints: [
    { id: 'c1', title: 'Оплата', isDone: true, position: 1 },
    { id: 'c2', title: 'Доставка', isDone: false, position: 2 },
  ],
};

function makeActions(overrides: Partial<IVersionActions> = {}): IVersionActions {
  return {
    onToggleCheckpoint: vi.fn(),
    onAddCheckpoint: vi.fn(),
    onDeleteCheckpoint: vi.fn(),
    onSubmitVersion: vi.fn(),
    onDeleteVersion: vi.fn(),
    isSubmittingVersion: false,
    isSubmittingCheckpoint: false,
    ...overrides,
  };
}

describe('VersionDrawer', () => {
  it('просмотр: паспорт, прогресс и чекпоинты', () => {
    render(<VersionDrawer version={detail} isCurrent isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'v1.0' })).toBeInTheDocument();
    expect(screen.getByText('В работе')).toBeInTheDocument();
    expect(screen.getByText('01.12.2026')).toBeInTheDocument();
    expect(screen.getByText('1 из 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Оплата')).toBeChecked();
  });

  it('без actions органов управления нет', () => {
    render(<VersionDrawer version={detail} isCurrent={false} isOpen onClose={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Удалить версию' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Доставка')).toBeDisabled();
  });

  it('версия-метаданные — без блока чекпоинтов', () => {
    const { checkpoints: _checkpoints, ...metadata } = detail;
    render(<VersionDrawer version={metadata} isCurrent={false} isOpen onClose={vi.fn()} />);

    expect(screen.getByText('1 из 2')).toBeInTheDocument();
    expect(screen.queryByLabelText('Оплата')).not.toBeInTheDocument();
  });

  it('галочка чекпоинта зовёт onToggleCheckpoint', async () => {
    const actions = makeActions();
    render(
      <VersionDrawer version={detail} isCurrent={false} isOpen onClose={vi.fn()} actions={actions} />,
    );

    await userEvent.click(screen.getByLabelText('Доставка'));

    expect(actions.onToggleCheckpoint).toHaveBeenCalledWith('c2', true);
  });

  it('редактирование открывается и отменяется', async () => {
    render(
      <VersionDrawer
        version={detail}
        isCurrent={false}
        isOpen
        onClose={vi.fn()}
        actions={makeActions()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    expect(screen.getByLabelText('Обозначение')).toHaveValue('v1.0');

    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(screen.queryByLabelText('Обозначение')).not.toBeInTheDocument();
  });

  it('сохранение передаёт форму и колбэк возврата в просмотр', async () => {
    const actions = makeActions();
    render(
      <VersionDrawer version={detail} isCurrent={false} isOpen onClose={vi.fn()} actions={actions} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(actions.onSubmitVersion).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'v1.0' }),
      expect.any(Function),
    );
  });

  it('удаление версии — в два шага', async () => {
    const actions = makeActions();
    render(
      <VersionDrawer version={detail} isCurrent={false} isOpen onClose={vi.fn()} actions={actions} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Удалить версию' }));
    expect(actions.onDeleteVersion).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }));
    expect(actions.onDeleteVersion).toHaveBeenCalled();
  });
});
```

Run: `cd apps/web && pnpm vitest run src/components/VersionDrawer`
Expected: FAIL — компонентов нет.

- [ ] **Step 2: Реализовать `types.ts` и `utils.ts`**

`types.ts`:

```ts
import type {
  RoadmapCheckpointCreate,
  RoadmapVersionCreate,
  RoadmapVersionDetail,
  RoadmapVersionMetadata,
} from '@cairn/shared';

/** Действия уровня записи. Отсутствие блока — панель только на просмотр. */
export interface IVersionActions {
  onToggleCheckpoint: (checkpointId: string, isDone: boolean) => void;
  onAddCheckpoint: (input: RoadmapCheckpointCreate) => void;
  onDeleteCheckpoint: (checkpointId: string) => void;
  /** Сохранение полей версии; `onSuccess` возвращает панель в просмотр. */
  onSubmitVersion: (input: RoadmapVersionCreate, onSuccess: () => void) => void;
  onDeleteVersion: () => void;
  isSubmittingVersion: boolean;
  versionError?: string;
  isSubmittingCheckpoint: boolean;
}

/** Пропсы панели версии. */
export interface IProps {
  /** Версия в той проекции, которую вернул API. */
  version: RoadmapVersionMetadata | RoadmapVersionDetail;
  isCurrent: boolean;
  isOpen: boolean;
  onClose: () => void;
  actions?: IVersionActions;
}
```

`utils.ts` (переезжает хелпер из `VersionCard.tsx`):

```ts
import type { RoadmapVersionDetail, RoadmapVersionMetadata } from '@cairn/shared';

/** Отличает проекцию чтения от проекции метаданных. */
export function isDetailed(
  version: RoadmapVersionMetadata | RoadmapVersionDetail,
): version is RoadmapVersionDetail {
  return 'checkpoints' in version;
}
```

- [ ] **Step 3: Реализовать `VersionPassport.tsx`**

```tsx
import type { RoadmapVersionDetail, RoadmapVersionMetadata } from '@cairn/shared';

import { formatDate } from '@/utils';

import { STATE_LABELS } from './constants';

/** Пропсы паспорта версии. */
interface IProps {
  version: RoadmapVersionMetadata | RoadmapVersionDetail;
  isCurrent: boolean;
}

/** Паспорт версии: состояние, даты, прогресс. */
export function VersionPassport({ version, isCurrent }: IProps) {
  return (
    <dl className="space-y-1 text-sm">
      <PassportRow name="Состояние">
        {STATE_LABELS[version.state]}
        {isCurrent && ' — текущая'}
      </PassportRow>
      {version.plannedDate && (
        <PassportRow name="Плановая дата">{formatDate(version.plannedDate)}</PassportRow>
      )}
      {version.releasedDate && (
        <PassportRow name="Дата релиза">{formatDate(version.releasedDate)}</PassportRow>
      )}
      <PassportRow name="Прогресс">
        {version.progress.done} из {version.progress.total}
      </PassportRow>
    </dl>
  );
}

/** Строка паспорта: подпись и значение. */
function PassportRow({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground">{name}</dt>
      <dd>{children}</dd>
    </div>
  );
}
```

- [ ] **Step 4: Реализовать `DeleteVersionButton.tsx`**

```tsx
'use client';

import { useState } from 'react';

/** Пропсы кнопки удаления версии. */
interface IProps {
  onDelete: () => void;
}

/** Удаление версии в два шага: оно уносит все её чекпоинты. */
export function DeleteVersionButton({ onDelete }: IProps) {
  const [isConfirming, setIsConfirming] = useState(false);

  if (!isConfirming) {
    return (
      <button
        type="button"
        onClick={() => setIsConfirming(true)}
        className="rounded-md border px-3 py-1 text-sm"
      >
        Удалить версию
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={onDelete}
        className="rounded-md bg-destructive px-3 py-1 text-sm text-destructive-foreground"
      >
        Подтвердить удаление
      </button>
      <button
        type="button"
        onClick={() => setIsConfirming(false)}
        className="rounded-md border px-3 py-1 text-sm"
      >
        Отмена
      </button>
    </>
  );
}
```

- [ ] **Step 5: Реализовать `VersionDrawer.tsx`**

```tsx
'use client';

import { useState } from 'react';

import { CheckpointForm } from '../CheckpointForm';
import { Drawer } from '../Drawer';
import { VersionForm } from '../VersionForm';
import { CheckpointList } from './CheckpointList';
import { DeleteVersionButton } from './DeleteVersionButton';
import { VersionPassport } from './VersionPassport';
import type { IProps } from './types';
import { isDetailed } from './utils';

/**
 * Панель версии роадмапа: просмотр и правка (спека, раздел 3).
 *
 * Презентационный компонент: данные и колбэки — пропами, поэтому одинаково
 * работает на внутреннем экране и на публичной странице без TanStack Query.
 */
export function VersionDrawer({ version, isCurrent, isOpen, onClose, actions }: IProps) {
  const [isEditing, setIsEditing] = useState(false);
  const detail = isDetailed(version) ? version : null;

  function handleClose(): void {
    setIsEditing(false);
    onClose();
  }

  return (
    <Drawer isOpen={isOpen} onClose={handleClose} title={version.label}>
      {isEditing && actions ? (
        <VersionForm
          initial={{
            label: version.label,
            state: version.state,
            plannedDate: version.plannedDate,
            releasedDate: version.releasedDate,
          }}
          isSubmitting={actions.isSubmittingVersion}
          error={actions.versionError}
          onSubmit={(input) => actions.onSubmitVersion(input, () => setIsEditing(false))}
        />
      ) : (
        <VersionPassport version={version} isCurrent={isCurrent} />
      )}

      {isEditing && actions && (
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          className="rounded-md border px-3 py-1 text-sm"
        >
          Отмена
        </button>
      )}

      {detail && (
        <CheckpointList
          checkpoints={detail.checkpoints}
          canWrite={Boolean(actions)}
          onToggle={(checkpointId, isDone) => actions?.onToggleCheckpoint(checkpointId, isDone)}
          onDelete={(checkpointId) => actions?.onDeleteCheckpoint(checkpointId)}
        />
      )}

      {actions && (
        <CheckpointForm
          isSubmitting={actions.isSubmittingCheckpoint}
          onSubmit={actions.onAddCheckpoint}
        />
      )}

      {actions && !isEditing && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="rounded-md border px-3 py-1 text-sm"
          >
            Редактировать
          </button>
          <DeleteVersionButton onDelete={actions.onDeleteVersion} />
        </div>
      )}
    </Drawer>
  );
}
```

`index.ts`:

```ts
export { STATE_LABELS } from './constants';
export { VersionDrawer } from './VersionDrawer';
export type { IProps, IVersionActions } from './types';
```

- [ ] **Step 6: Прогнать тесты**

Run: `cd apps/web && pnpm vitest run src/components/VersionDrawer`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/VersionDrawer
git commit -m "Добавить панель версии роадмапа с просмотром и правкой

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Chunk 5: Экраны и зачистка

### Task 10: Переработать `RoadmapScreen`

**Files:**
- Modify: `apps/web/src/app/(app)/projects/[id]/roadmap/RoadmapScreen.tsx`
- Create: `apps/web/src/app/(app)/projects/[id]/roadmap/RoadmapVersionPanel.tsx`
- Create: `apps/web/src/app/(app)/projects/[id]/roadmap/CreateVersionPanel.tsx`
- Create: `apps/web/src/app/(app)/projects/[id]/roadmap/RoadmapPublicLink.tsx`
- Test: `apps/web/src/app/(app)/projects/[id]/roadmap/RoadmapScreen.test.tsx`

- [ ] **Step 1: Написать падающие тесты**

`RoadmapScreen.test.tsx`:

```tsx
import { AccessLevel, RoadmapVersionState, Section } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as hooks from '@/api/hooks';

import { RoadmapScreen } from './RoadmapScreen';

vi.mock('@/api/hooks');

const roadmap = {
  stage: { current: 1, total: 2 },
  versions: [
    {
      id: '1',
      label: 'v1.0',
      state: RoadmapVersionState.InProgress,
      plannedDate: null,
      releasedDate: null,
      position: 1,
      progress: { done: 0, total: 1 },
      checkpoints: [{ id: 'c1', title: 'Оплата', isDone: false, position: 1 }],
    },
    {
      id: '2',
      label: 'v2.0',
      state: RoadmapVersionState.Planned,
      plannedDate: null,
      releasedDate: null,
      position: 2,
      progress: { done: 0, total: 0 },
      checkpoints: [],
    },
  ],
};

/** Успешный query-результат для мока. */
function query<T>(data: T) {
  return { data, isPending: false, isError: false } as never;
}

/** Бездействующая мутация для мока. */
function mutation() {
  return { mutate: vi.fn(), isPending: false, error: null } as never;
}

beforeEach(() => {
  vi.mocked(hooks.useQueryRoadmap).mockReturnValue(query(roadmap));
  vi.mocked(hooks.useQuerySections).mockReturnValue(
    query({ [Section.Roadmap]: AccessLevel.Write }),
  );
  vi.mocked(hooks.useQueryPublicLink).mockReturnValue(query(null));
  vi.mocked(hooks.useMutationCreateVersion).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationUpdateVersion).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationDeleteVersion).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationCreateCheckpoint).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationUpdateCheckpoint).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationDeleteCheckpoint).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationPublishRoadmap).mockReturnValue(mutation());
  vi.mocked(hooks.useMutationUnpublishRoadmap).mockReturnValue(mutation());
});

describe('RoadmapScreen', () => {
  it('клик по версии открывает панель с её содержимым', async () => {
    render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    await userEvent.click(screen.getByRole('button', { name: 'Версия v1.0' }));

    expect(screen.getByRole('dialog', { name: 'v1.0' })).toBeInTheDocument();
    expect(screen.getByLabelText('Оплата')).toBeInTheDocument();
  });

  it('после закрытия панели версии открывается панель создания', async () => {
    render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    await userEvent.click(screen.getByRole('button', { name: 'Версия v1.0' }));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить версию' }));

    expect(screen.getByRole('dialog', { name: 'Новая версия' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'v1.0' })).not.toBeInTheDocument();
  });

  it('отправка формы создания вызывает мутацию и закрывает панель', async () => {
    // Мок сразу зовёт onSuccess — как успешный ответ сервера.
    const mutate = vi.fn((_input: unknown, options?: { onSuccess?: () => void }) =>
      options?.onSuccess?.(),
    );
    vi.mocked(hooks.useMutationCreateVersion).mockReturnValue(
      { mutate, isPending: false, error: null } as never,
    );
    render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    await userEvent.click(screen.getByRole('button', { name: 'Добавить версию' }));
    await userEvent.type(screen.getByLabelText('Обозначение'), 'v3.0');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'v3.0' }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(screen.queryByRole('dialog', { name: 'Новая версия' })).not.toBeInTheDocument();
  });

  it('панель закрывается, когда версия исчезла из данных', async () => {
    const { rerender } = render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    await userEvent.click(screen.getByRole('button', { name: 'Версия v1.0' }));
    expect(screen.getByRole('dialog', { name: 'v1.0' })).toBeInTheDocument();

    vi.mocked(hooks.useQueryRoadmap).mockReturnValue(
      query({ ...roadmap, versions: [roadmap.versions[1]!] }),
    );
    rerender(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('без права записи нет кнопки добавления', () => {
    vi.mocked(hooks.useQuerySections).mockReturnValue(
      query({ [Section.Roadmap]: AccessLevel.Read }),
    );
    render(<RoadmapScreen projectId="p1" isSuperadmin={false} />);

    expect(screen.queryByRole('button', { name: 'Добавить версию' })).not.toBeInTheDocument();
  });
});
```

О требовании спеки «открытие одной панели сбрасывает другую»: панель —
модальный диалог Radix, он помечает остальную страницу `aria-hidden`
и глушит на ней pointer-events. Пока панель версии открыта, кнопку
«Добавить версию» нельзя ни кликнуть, ни даже найти через `getByRole` —
взаимное исключение панелей обеспечивается самим модальным поведением,
второй одновременно открытой панели не бывает. Поэтому тест выше сначала
закрывает панель версии по Esc и лишь затем открывает панель создания —
это единственный достижимый пользователем сценарий, и он детерминирован.
Обработчики открытия (`setIsCreating(false)` в `onSelect` и `setSelectedVersionId(null)`
в обработчике «Добавить версию» ниже) всё равно сбрасывают соседнее
состояние — как страховка на случай будущего немодального режима;
отдельного теста на них не нужно.

Run: `cd apps/web && pnpm vitest run "src/app/(app)/projects/[id]/roadmap"`
Expected: FAIL — экран ещё старый.

- [ ] **Step 2: Реализовать `RoadmapVersionPanel.tsx`**

```tsx
'use client';

import type { RoadmapVersionDetail, RoadmapVersionMetadata } from '@cairn/shared';

import {
  useMutationCreateCheckpoint,
  useMutationDeleteCheckpoint,
  useMutationDeleteVersion,
  useMutationUpdateCheckpoint,
  useMutationUpdateVersion,
} from '@/api/hooks';
import { VersionDrawer } from '@/components/VersionDrawer';

/** Пропсы панели версии на внутреннем экране. */
interface IProps {
  projectId: string;
  version: RoadmapVersionMetadata | RoadmapVersionDetail;
  isCurrent: boolean;
  canWrite: boolean;
  onClose: () => void;
}

/** Панель версии на внутреннем экране: собирает мутации в `actions`. */
export function RoadmapVersionPanel({ projectId, version, isCurrent, canWrite, onClose }: IProps) {
  const updateVersion = useMutationUpdateVersion(projectId);
  const deleteVersion = useMutationDeleteVersion(projectId);
  const createCheckpoint = useMutationCreateCheckpoint(projectId);
  const updateCheckpoint = useMutationUpdateCheckpoint(projectId);
  const deleteCheckpoint = useMutationDeleteCheckpoint(projectId);

  return (
    <VersionDrawer
      version={version}
      isCurrent={isCurrent}
      isOpen
      onClose={onClose}
      actions={
        canWrite
          ? {
              onToggleCheckpoint: (checkpointId, isDone) =>
                updateCheckpoint.mutate({ versionId: version.id, checkpointId, input: { isDone } }),
              onAddCheckpoint: (input) =>
                createCheckpoint.mutate({ versionId: version.id, input }),
              onDeleteCheckpoint: (checkpointId) =>
                deleteCheckpoint.mutate({ versionId: version.id, checkpointId }),
              onSubmitVersion: (input, onSuccess) =>
                updateVersion.mutate({ versionId: version.id, input }, { onSuccess }),
              onDeleteVersion: () => deleteVersion.mutate(version.id, { onSuccess: onClose }),
              isSubmittingVersion: updateVersion.isPending,
              versionError: updateVersion.error?.message,
              isSubmittingCheckpoint: createCheckpoint.isPending,
            }
          : undefined
      }
    />
  );
}
```

Сверить сигнатуры мутаций с текущим `RoadmapScreen.tsx` (они уже вызываются
там с теми же аргументами) и с `useMutationRoadmap.test.tsx`.

- [ ] **Step 2а: Реализовать `CreateVersionPanel.tsx` и `RoadmapPublicLink.tsx`**

Эти две обёртки (по образцу `RoadmapVersionPanel`: маршрут-локальный компонент,
собирающий хуки) выносятся из экрана, чтобы `RoadmapScreen` уложился
в лимит 100 строк. Отдельных тестов у них нет: покрываются через
`RoadmapScreen.test.tsx`, где хуки замоканы на уровне бочонка `@/api/hooks`.

`CreateVersionPanel.tsx`:

```tsx
'use client';

import { useMutationCreateVersion } from '@/api/hooks';
import { Drawer } from '@/components/Drawer';
import { VersionForm } from '@/components/VersionForm';

/** Пропсы панели создания версии. */
interface IProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

/** Панель «Новая версия»: форма создания в выезжающем Drawer. */
export function CreateVersionPanel({ projectId, isOpen, onClose }: IProps) {
  const createVersion = useMutationCreateVersion(projectId);

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Новая версия">
      <VersionForm
        isSubmitting={createVersion.isPending}
        error={createVersion.error?.message}
        onSubmit={(input) => createVersion.mutate(input, { onSuccess: onClose })}
      />
    </Drawer>
  );
}
```

`RoadmapPublicLink.tsx`:

```tsx
'use client';

import {
  useMutationPublishRoadmap,
  useMutationUnpublishRoadmap,
  useQueryPublicLink,
} from '@/api/hooks';
import { PublicLinkPanel } from '@/components/PublicLinkPanel';

/** Пропсы блока публичной ссылки роадмапа. */
interface IProps {
  projectId: string;
  isSuperadmin: boolean;
}

/** Публичная ссылка роадмапа: собирает запрос и мутации публикации. */
export function RoadmapPublicLink({ projectId, isSuperadmin }: IProps) {
  const publicLink = useQueryPublicLink(projectId);
  const publish = useMutationPublishRoadmap(projectId);
  const unpublish = useMutationUnpublishRoadmap(projectId);

  return (
    <PublicLinkPanel
      link={publicLink.data ?? null}
      isSuperadmin={isSuperadmin}
      isPending={publish.isPending || unpublish.isPending}
      onPublish={() => publish.mutate()}
      onUnpublish={() => unpublish.mutate()}
    />
  );
}
```

- [ ] **Step 3: Переписать `RoadmapScreen.tsx`**

```tsx
'use client';

import { AccessLevel, Section } from '@cairn/shared';
import { useState } from 'react';

import { useQueryRoadmap, useQuerySections } from '@/api/hooks';
import { RoadmapTimeline } from '@/components/RoadmapTimeline';

import { CreateVersionPanel } from './CreateVersionPanel';
import { RoadmapPublicLink } from './RoadmapPublicLink';
import { RoadmapVersionPanel } from './RoadmapVersionPanel';

/** Пропсы экрана роадмапа. */
interface IProps {
  projectId: string;
  isSuperadmin: boolean;
}

/** Роадмап проекта: диаграмма, выезжающая панель версии, публичная ссылка. */
export function RoadmapScreen({ projectId, isSuperadmin }: IProps) {
  const roadmap = useQueryRoadmap(projectId);
  const sections = useQuerySections(projectId);

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  if (roadmap.isPending || sections.isPending) {
    return <p className="text-muted-foreground">Загрузка…</p>;
  }

  if (roadmap.isError || sections.isError) {
    return (
      <p role="alert" className="text-destructive">
        Не удалось загрузить роадмап.
      </p>
    );
  }

  const level = sections.data[Section.Roadmap];
  const canWrite = level === AccessLevel.Write;
  const canRead = canWrite || level === AccessLevel.Read;
  const currentIndex = roadmap.data.stage.current !== null ? roadmap.data.stage.current - 1 : null;
  // Панель открыта, пока версия есть в данных: удалили в другой вкладке — закрылась.
  const selectedIndex = roadmap.data.versions.findIndex(
    (version) => version.id === selectedVersionId,
  );
  const selected = selectedIndex === -1 ? null : roadmap.data.versions[selectedIndex]!;

  return (
    <div className="space-y-6">
      <RoadmapTimeline
        versions={roadmap.data.versions}
        currentIndex={currentIndex}
        onSelect={(versionId) => {
          setIsCreating(false);
          setSelectedVersionId(versionId);
        }}
      />

      {canWrite && (
        <button
          type="button"
          onClick={() => {
            setSelectedVersionId(null);
            setIsCreating(true);
          }}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >
          Добавить версию
        </button>
      )}

      {selected && (
        <RoadmapVersionPanel
          projectId={projectId}
          version={selected}
          isCurrent={selectedIndex === currentIndex}
          canWrite={canWrite}
          onClose={() => setSelectedVersionId(null)}
        />
      )}

      <CreateVersionPanel
        projectId={projectId}
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
      />

      {canRead && <RoadmapPublicLink projectId={projectId} isSuperadmin={isSuperadmin} />}
    </div>
  );
}
```

Итоговый `RoadmapScreen.tsx` — ~92 строки, в лимите 100.

- [ ] **Step 4: Прогнать тесты**

Run: `cd apps/web && pnpm vitest run "src/app/(app)/projects/[id]/roadmap"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(app)/projects/[id]/roadmap"
git commit -m "Перевести экран роадмапа на выезжающую панель версии

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 11: Переработать `PublicRoadmapView`

**Files:**
- Modify: `apps/web/src/app/roadmap/[token]/PublicRoadmapView.tsx`
- Test: `apps/web/src/app/roadmap/[token]/PublicRoadmapView.test.tsx`

- [ ] **Step 1: Написать падающие тесты**

`PublicRoadmapView.test.tsx`:

```tsx
import { RoadmapVersionState } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { PublicRoadmapView } from './PublicRoadmapView';

const roadmap = {
  projectName: 'Проект',
  stage: { current: 1, total: 1 },
  versions: [
    {
      id: '1',
      label: 'v1.0',
      state: RoadmapVersionState.InProgress,
      plannedDate: '2026-12-01',
      releasedDate: null,
      position: 1,
      progress: { done: 0, total: 1 },
      checkpoints: [{ id: 'c1', title: 'Оплата', isDone: false, position: 1 }],
    },
  ],
};

describe('PublicRoadmapView', () => {
  it('клик по версии открывает панель просмотра', async () => {
    render(<PublicRoadmapView roadmap={roadmap} />);

    await userEvent.click(screen.getByRole('button', { name: 'Версия v1.0' }));

    expect(screen.getByRole('dialog', { name: 'v1.0' })).toBeInTheDocument();
    expect(screen.getByLabelText('Оплата')).toBeInTheDocument();
  });

  it('панель — только чтение', async () => {
    render(<PublicRoadmapView roadmap={roadmap} />);

    await userEvent.click(screen.getByRole('button', { name: 'Версия v1.0' }));

    expect(screen.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Оплата')).toBeDisabled();
  });
});
```

Run: `cd apps/web && pnpm vitest run "src/app/roadmap"`
Expected: FAIL — представление ещё на карточках.

- [ ] **Step 2: Реализовать**

`PublicRoadmapView.tsx` — целиком:

```tsx
'use client';

import type { PublicRoadmap } from '@cairn/shared';
import { useState } from 'react';

import { RoadmapTimeline } from '@/components/RoadmapTimeline';
import { VersionDrawer } from '@/components/VersionDrawer';

/** Пропсы публичного представления. */
interface IProps {
  roadmap: PublicRoadmap;
}

/** Публичное представление роадмапа: диаграмма и панель просмотра. */
export function PublicRoadmapView({ roadmap }: IProps) {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  const currentIndex = roadmap.stage.current !== null ? roadmap.stage.current - 1 : null;
  const selectedIndex = roadmap.versions.findIndex((version) => version.id === selectedVersionId);
  const selected = selectedIndex === -1 ? null : roadmap.versions[selectedIndex]!;

  return (
    <>
      <RoadmapTimeline
        versions={roadmap.versions}
        currentIndex={currentIndex}
        onSelect={setSelectedVersionId}
      />

      {selected && (
        <VersionDrawer
          version={selected}
          isCurrent={selectedIndex === currentIndex}
          isOpen
          onClose={() => setSelectedVersionId(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Прогнать тесты**

Run: `cd apps/web && pnpm vitest run "src/app/roadmap"`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/roadmap
git commit -m "Перевести публичный роадмап на панель просмотра версии

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 12: Удалить `VersionCard`, финальная проверка

**Files:**
- Delete: `apps/web/src/components/VersionCard/` (вся директория)

- [ ] **Step 1: Проверить, что карточка нигде не используется**

Run: `grep -rn "VersionCard" apps/web/src --include="*.ts" --include="*.tsx" | grep -v "components/VersionCard/"`
Expected: пусто. Если что-то нашлось — сначала убрать использование.

- [ ] **Step 2: Удалить**

```bash
git rm -r apps/web/src/components/VersionCard
```

- [ ] **Step 3: Полная проверка репозитория**

Run: `pnpm typecheck && pnpm test`
Expected: PASS во всех рабочих пространствах (api-интеграционные требуют Docker).

- [ ] **Step 4: Commit**

```bash
git commit -m "Удалить карточку версии: её заменила выезжающая панель

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Финальная сверка со спекой**

Пройтись по разделам `docs/superpowers/specs/2026-09-04-roadmap-drawer-design.md`
чек-листом: releasedDate (БД, схемы, API, форма), правила дат на диаграмме,
клики и клавиатура, Drawer, режимы VersionDrawer, уровень «метаданные»,
экран, публичная страница, удаление VersionCard. Расхождения — доработать
до объявления работы завершённой (@superpowers:verification-before-completion).

Два сознательных отступления от спеки, не считающихся расхождениями:

- соединительная линия рисуется сегментами внутри SVG каждой колонки,
  а не абсолютно позиционированным элементом (раздел 2 спеки) — визуальный
  результат тот же, сегменты не требуют подгонки к ширине колонок;
- тест взаимного вытеснения панелей заменён на «после закрытия панели
  версии открывается панель создания»: панель модальна, второй
  одновременно открытой панели не бывает по построению (Task 10, Step 1).
