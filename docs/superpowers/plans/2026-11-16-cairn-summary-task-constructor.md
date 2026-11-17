# Конструктор задач из саммари созвона — план реализации

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Текст саммари созвона попадает в проект записью «Хроники», модель через порт предлагает разбивку на задачи, человек правит разбивку в черновике и одной кнопкой превращает её в версию роадмапа с чекпоинтами — не задевая ни существующий код роадмапа, ни модель прав.

**Architecture:** Шесть частей по возрастанию связности. Сначала контракт и чистые функции — они ничего не ломают и нужны всему остальному. Затем база и чтение: две таблицы, две миграции, новая выборка прав и репозиторий саммари. Затем порт к модели тремя независимыми единицами — настройки, валидация вывода, адаптер — и шаг разбивки, который их связывает. Затем запись в роадмап одной транзакцией через чужие репозитории и ручки. Затем веб. Напоследок развёртывание, документация и полная проверка.

**Tech Stack:** pnpm workspaces, NestJS, Drizzle + PostgreSQL, zod в `packages/shared`, Next.js 15, TanStack Query, Vitest + React Testing Library, Testcontainers.

**Основание:** `docs/superpowers/specs/2026-11-16-cairn-summary-task-constructor-design.md`

---

## Как работать с этим планом

TDD: сначала падающий тест, затем реализация. Линтера в проекте нет.

| Что | Команда |
|---|---|
| Все тесты | `pnpm test` |
| Точечно API | `cd apps/api && npx vitest run src/путь` |
| Точечно веб | `cd apps/web && npx vitest run src/путь` |
| Точечно контракт | `cd packages/shared && npx vitest run src/путь` |
| Типы | `pnpm typecheck` |
| Миграция по схеме | `cd apps/api && pnpm db:generate` |

**Осторожно с `pnpm --filter ... test -- --run <путь>`**: двойное `--` съедает фильтр, и запускается весь набор, включая Testcontainers. Точечно — через `npx vitest run` из каталога приложения.

Соглашения: компонент до 100 строк в своей директории с `index.ts`, пропсы — `IProps` в `types.ts`, TSDoc на русском, `any` запрещён, массивы и объекты из JSX — в `constants.ts`, значение, использованное дважды, — `enum`, а не union.

**Интеграционные тесты поднимают PostgreSQL через Testcontainers** — нужен работающий docker. Фикстура — `apps/api/test/db-fixture.ts`, привилегии в ней не выдаются намеренно: их выдаёт миграция, которую тест и проверяет.

**Ни один тест не ходит в сеть.** Предложитель задач подменяется заглушкой по токену `TASK_SUGGESTER`, адаптер проверяется подменённым `fetch`.

### Структура файлов

| Файл | Ответственность |
|---|---|
| `packages/shared/src/schemas/summary.ts` | контракт саммари, черновика, настроек предложителя, нормализация текста |
| `packages/shared/src/schemas/day-date.ts` | `requiredDaySchema` — день без `nullable` |
| `apps/api/src/db/schema/summaries.ts` | таблицы `summaries` и `summary_task_drafts` |
| `apps/api/src/summaries/next-version-label.ts` | чистая функция следующего обозначения версии |
| `apps/api/src/summaries/summaries.repository.ts` | саммари и черновик с проверкой права |
| `apps/api/src/summaries/summaries.service.ts` | транзакции, журнал, вызов порта |
| `apps/api/src/summaries/summaries.controller.ts` | `projects/:projectId/summaries` |
| `apps/api/src/summaries/summaries-overview.controller.ts` | `summaries`, `summaries/projects`, `summaries/suggester` |
| `apps/api/src/summaries/suggester/task-suggester.ts` | интерфейс порта и токен внедрения |
| `apps/api/src/summaries/suggester/settings.ts` | разбор переменных окружения |
| `apps/api/src/summaries/suggester/validate.ts` | разбор и чистка вывода модели |
| `apps/api/src/summaries/suggester/openai-compatible.suggester.ts` | адаптер на оба пресета |
| `apps/api/src/summaries/suggester/disabled.suggester.ts` | порт выключен |
| `apps/api/src/access/access.service.ts` | новый `projectIdsWithLevel` |
| `apps/api/src/roadmap/roadmap.repository.ts` | новый `labelsForProject` |
| `apps/api/src/chronicle/chronicle.repository.ts` | `remove` уносит саммари и черновик |
| `apps/web/src/app/(app)/summaries/` | две страницы и два экрана |
| `apps/web/src/components/SummaryForm/` | создание: проект, дата, заголовок, текст, файл |
| `apps/web/src/components/SummaryTaskEditor/` | редактор черновика |
| `apps/web/src/components/SummaryReleaseForm/` | обозначение, состояние, плановая дата |
| `apps/web/src/components/SummaryList/` | история |
| `apps/web/src/api/hooks/useQuerySummaries.ts` | список, цели, детали, настройки порта |
| `apps/web/src/api/hooks/useMutationSummary.ts` | создание, разбивка, сохранение, релиз, удаление |

### Порядок частей

1. **Чанк 1** — контракт и чистые функции: перечни, обязательный день, схемы, следующее обозначение версии.
2. **Чанк 2** — база и чтение: таблицы, миграции, выборка прав, репозиторий саммари, уборка.
3. **Чанк 3** — порт: настройки, валидация вывода, адаптеры, шаг разбивки.
4. **Чанк 4** — запись в роадмап и ручки.
5. **Чанк 5** — веб.
6. **Чанк 6** — развёртывание, документация, полная проверка.

После чанка 2 система уже полезна без модели: саммари создаются, задачи набираются руками. После чанка 4 — полезна без веба: весь поток проходится через API.

---

## Чанк 1: Контракт и чистые функции

### Task 1: Перечни

**Files:**
- Modify: `packages/shared/src/enums.ts`
- Modify: `packages/shared/src/enums.test.ts`

- [ ] **Step 1: Написать падающий тест**

В `packages/shared/src/enums.test.ts` — рядом с существующими проверками перечней:

```ts
describe('перечни саммари', () => {
  it('у записи хроники появился третий источник', () => {
    // Запись, заведённую конструктором, нельзя путать с рукописной:
    // лента хроники показывает источник.
    expect(ChronicleSource.Summary).toBe('summary');
    expect(Object.values(ChronicleSource)).toEqual(['manual', 'webhook', 'summary']);
  });

  it('задача черновика помнит, кем предложена', () => {
    // Инвариант ТЗ 5.3: интерфейс обязан показать, что пришло от машины.
    expect(Object.values(SummaryTaskOrigin)).toEqual(['model', 'human']);
  });

  it('вид предложителя говорит, куда уходит текст', () => {
    expect(Object.values(TaskSuggesterKind)).toEqual(['external', 'local']);
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd packages/shared && npx vitest run src/enums.test.ts`
Expected: FAIL — `SummaryTaskOrigin` и `TaskSuggesterKind` не экспортированы, `ChronicleSource.Summary` не существует

- [ ] **Step 3: Дописать перечни**

В `packages/shared/src/enums.ts`: к `ChronicleSource` (строки 71–76) добавить третьим значением

```ts
  /** Саммари созвона, разобранное конструктором задач. */
  Summary = 'summary',
```

и рядом, после `ChronicleSource`:

```ts
/**
 * Кем предложена задача черновика саммари.
 *
 * Нужен инварианту «предложения модели применяются только после
 * подтверждения человеком» (ТЗ 5.3): без этого признака отличить
 * предложенное от набранного руками нечем.
 */
export enum SummaryTaskOrigin {
  Model = 'model',
  Human = 'human',
}

/** Вид предложителя задач: куда уходит текст саммари. */
export enum TaskSuggesterKind {
  /** Внешний LLM-API. */
  External = 'external',
  /** Свой OpenAI-совместимый endpoint в контуре. */
  Local = 'local',
}
```

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd packages/shared && npx vitest run src/enums.test.ts`
Expected: PASS, включая прежние проверки перечней

- [ ] **Step 5: Коммит**

```bash
git add packages/shared/src/enums.ts packages/shared/src/enums.test.ts
git commit -m "Завести перечни саммари и третий источник хроники"
```

### Task 2: Обязательный день

**Files:**
- Modify: `packages/shared/src/schemas/day-date.ts`
- Modify: `packages/shared/src/schemas/day-date.test.ts`
- Modify: `packages/shared/src/schemas/chronicle.ts`
- Modify: `packages/shared/src/schemas/chronicle.test.ts`

Цель — не завести третью копию проверки дня. В `chronicle.ts:7-10` живёт приватная `occurredOnSchema` — копия `dayDateSchema` без `nullable()`, потому что общая схема `null` допускает (`day-date.ts:41-45`), а колонка `chronicle_entries.occurred_on` — `notNull`. Саммари нужна та же проверка; вместо второй копии общая схема получает вариант без `nullable`, и на него переходят оба.

- [ ] **Step 1: Написать падающий тест**

В `packages/shared/src/schemas/day-date.test.ts`:

```ts
describe('requiredDaySchema', () => {
  it('принимает календарный день', () => {
    expect(requiredDaySchema.parse('2026-11-16')).toBe('2026-11-16');
  });

  it('отвергает пустоту: колонка дня события notNull', () => {
    // `dayDateSchema` допускает null ради плановой и фактической даты
    // версии; у дня события его быть не может — null дошёл бы до
    // PostgreSQL падением.
    expect(() => requiredDaySchema.parse(null)).toThrow();
  });

  it('отвергает несуществующий день', () => {
    expect(() => requiredDaySchema.parse('2026-02-30')).toThrow(NO_SUCH_DAY);
  });

  it('отвергает чужой формат', () => {
    expect(() => requiredDaySchema.parse('16.11.2026')).toThrow();
  });

  it('общая схема по-прежнему допускает пустоту', () => {
    // Сторож прежнего поведения: версия без плановой даты законна.
    expect(dayDateSchema.parse(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd packages/shared && npx vitest run src/schemas/day-date.test.ts`
Expected: FAIL — `requiredDaySchema` не экспортирована

- [ ] **Step 3: Завести схему и перевести на неё хронику**

В `packages/shared/src/schemas/day-date.ts`, **перед** `dayDateSchema`:

```ts
/**
 * День без времени, обязательный: дата события хроники и саммари.
 *
 * Отдельно от `dayDateSchema`, а не `.nullable()` поверх неё, ровно
 * наоборот: обязательный вариант — основной, а допускающий пустоту
 * получается из него. У хроники была своя копия этой проверки, потому
 * что общая схема допускает `null`; третья копия для саммари развела бы
 * формат по трём файлам.
 */
export const requiredDaySchema = z
  .string()
  .regex(DAY_PATTERN, 'Ожидается дата ГГГГ-ММ-ДД')
  .refine(isCalendarDay, NO_SUCH_DAY);
```

и `dayDateSchema` выразить через неё: `export const dayDateSchema = requiredDaySchema.nullable();`

В `packages/shared/src/schemas/chronicle.ts` убрать приватную `occurredOnSchema` (строки 7–10) и подставить `requiredDaySchema` в оба места, где она использовалась (`chronicleMetadataSchema`, `chronicleEntryCreateSchema`). Импорт из `./day-date` там уже есть — заменить список импортируемых имён.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd packages/shared && npx vitest run src/schemas/day-date.test.ts src/schemas/chronicle.test.ts`
Expected: PASS — и новые проверки, и все прежние проверки хроники

- [ ] **Step 5: Коммит**

```bash
git add packages/shared/src/schemas/day-date.ts packages/shared/src/schemas/day-date.test.ts packages/shared/src/schemas/chronicle.ts packages/shared/src/schemas/chronicle.test.ts
git commit -m "Свести проверку обязательного дня в одну схему"
```

### Task 3: Схемы саммари и нормализация текста

**Files:**
- Create: `packages/shared/src/schemas/summary.ts`
- Create: `packages/shared/src/schemas/summary.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Написать падающий тест**

`packages/shared/src/schemas/summary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { SummaryTaskOrigin } from '../enums';
import {
  MAX_SUMMARY_TASKS,
  normalizeSummaryText,
  summaryCreateSchema,
  summaryDetailSchema,
  summaryTasksReplaceSchema,
} from './summary';

const ID = '00000000-0000-0000-0000-000000000001';

/** Минимально полная деталь: от неё отталкиваются точечные проверки. */
const DETAIL = {
  id: ID,
  projectId: ID,
  projectName: 'CAIRN',
  occurredOn: '2026-11-16',
  title: 'Созвон по релизу',
  taskCount: 0,
  isReleased: false,
  releasedVersionLabel: null,
  createdAt: '2026-11-16T10:00:00.000Z',
  chronicleEntryId: ID,
  text: 'текст',
  tasks: [],
  suggester: null,
  releasedVersionId: null,
  isTextStale: false,
  suggestedVersionLabel: null,
};

describe('создание саммари', () => {
  it('принимает дату, заголовок и текст', () => {
    expect(() =>
      summaryCreateSchema.parse({ occurredOn: '2026-11-16', title: 'Созвон', text: 'текст' }),
    ).not.toThrow();
  });

  it('отвергает пустой текст', () => {
    expect(() =>
      summaryCreateSchema.parse({ occurredOn: '2026-11-16', title: 'Созвон', text: '   ' }),
    ).toThrow();
  });

  it('отвергает текст длиннее предела записи хроники', () => {
    // Предел взят оттуда, куда текст поедет: 65 536 у
    // `chronicleEntryCreate.content`. Иначе отказ пришёл бы не оттуда,
    // где его ждут.
    expect(() =>
      summaryCreateSchema.parse({
        occurredOn: '2026-11-16',
        title: 'Созвон',
        text: 'я'.repeat(65_537),
      }),
    ).toThrow();
  });

  it('отвергает пустую дату события', () => {
    expect(() =>
      summaryCreateSchema.parse({ occurredOn: null, title: 'Созвон', text: 'текст' }),
    ).toThrow();
  });

  it('отвергает лишнее поле', () => {
    // Строгая схема: лишний ключ — опечатка клиента, а не вольность.
    expect(() =>
      summaryCreateSchema.parse({
        occurredOn: '2026-11-16',
        title: 'Созвон',
        text: 'текст',
        projectId: ID,
      }),
    ).toThrow();
  });
});

describe('замена черновика', () => {
  it('строка без id — новая, набранная человеком', () => {
    const parsed = summaryTasksReplaceSchema.parse({ tasks: [{ title: 'Сделать' }] });

    expect(parsed.tasks[0]?.id).toBeUndefined();
  });

  it('позиции не принимаются: порядок задаёт порядок массива', () => {
    // Второе место для порядка разошлось бы с первым.
    expect(() =>
      summaryTasksReplaceSchema.parse({ tasks: [{ title: 'Сделать', position: 1 }] }),
    ).toThrow();
  });

  it('отвергает пустую формулировку', () => {
    expect(() => summaryTasksReplaceSchema.parse({ tasks: [{ title: '  ' }] })).toThrow();
  });

  it('отвергает формулировку длиннее чекпоинта', () => {
    expect(() =>
      summaryTasksReplaceSchema.parse({ tasks: [{ title: 'я'.repeat(301) }] }),
    ).toThrow();
  });

  it('отвергает массив длиннее предела формы', () => {
    const tasks = Array.from({ length: MAX_SUMMARY_TASKS + 1 }, () => ({ title: 'Сделать' }));

    expect(() => summaryTasksReplaceSchema.parse({ tasks })).toThrow();
  });

  it('пустой массив законен: черновик очищают перед новой разбивкой', () => {
    expect(summaryTasksReplaceSchema.parse({ tasks: [] }).tasks).toEqual([]);
  });
});

describe('деталь саммари', () => {
  it('подсказка обозначения версии может отсутствовать', () => {
    // `null` значит «подставлять нечего»: версий нет, в обозначениях нет
    // цифр, или у субъекта нет выдачи на роадмап.
    expect(summaryDetailSchema.parse(DETAIL).suggestedVersionLabel).toBeNull();
  });

  it('несёт признак устаревшего текста', () => {
    expect(summaryDetailSchema.parse({ ...DETAIL, isTextStale: true }).isTextStale).toBe(true);
  });

  it('задача несёт происхождение', () => {
    const parsed = summaryDetailSchema.parse({
      ...DETAIL,
      tasks: [{ id: ID, title: 'Сделать', position: 1, origin: SummaryTaskOrigin.Model }],
    });

    expect(parsed.tasks[0]?.origin).toBe(SummaryTaskOrigin.Model);
  });
});

describe('нормализация текста', () => {
  it('снимает один ведущий BOM', () => {
    expect(normalizeSummaryText('﻿текст')).toBe('текст');
  });

  it('второй BOM остаётся символом текста, а не снимается молча', () => {
    expect(normalizeSummaryText('﻿﻿текст')).toBe('﻿текст');
  });

  it('приводит переводы строк к LF', () => {
    // Иначе один и тот же текст менял бы длину от платформы автора.
    expect(normalizeSummaryText('раз\r\nдва')).toBe('раз\nдва');
  });

  it('оставляет перевод строки и табуляцию', () => {
    expect(normalizeSummaryText('раз\n\tдва')).toBe('раз\n\tдва');
  });

  it('отвергает NUL', () => {
    // До колонки `text` в PostgreSQL он не доходит вовсе.
    expect(() => normalizeSummaryText('раз\u0000два')).toThrow();
  });

  it('отвергает прочие управляющие символы, а не чистит молча', () => {
    // Текст созвона — то, что прислал человек; подменять его тихо нельзя.
    expect(() => normalizeSummaryText('раз\u0007два')).toThrow();
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd packages/shared && npx vitest run src/schemas/summary.test.ts`
Expected: FAIL — `Cannot find module './summary'`

- [ ] **Step 3: Написать схемы**

`packages/shared/src/schemas/summary.ts` — целиком по разделу 3 дизайна. Сверх схем из дизайна:

```ts
/** Предел числа задач в черновике: предел формы, а не доверия к модели. */
export const MAX_SUMMARY_TASKS = 200;

/** Управляющие символы, кроме перевода строки и табуляции. */
const FORBIDDEN_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/**
 * Приводит текст саммари к пригодному виду или отказывает.
 *
 * Общая функция для браузера и сервера: нормализовать по-разному значило
 * бы отправить наружу не то, что сохранено. Снимается один ведущий BOM
 * (его ставят редакторы Windows) и `CRLF`; управляющие символы —
 * **отказ**, а не чистка: подменять присланный человеком текст молча
 * нельзя. По длине тоже не обрезаем — отказ с настоящим числом даёт
 * человеку решить, что выбросить.
 */
export function normalizeSummaryText(raw: string): string {
  const text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

  if (FORBIDDEN_CONTROL.test(text)) {
    throw new Error(SUMMARY_TEXT_NOT_PLAIN);
  }

  return text;
}
```

Типы `z.infer` на каждую схему, как в соседних файлах контракта. В `packages/shared/src/index.ts` — строка `export * from './schemas/summary';` между `'./schemas/status'` и `'./schemas/totp'` (список отсортирован).

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd packages/shared && npx vitest run src/schemas/summary.test.ts`
Expected: PASS, 19 тестов

- [ ] **Step 5: Коммит**

```bash
git add packages/shared/src/schemas/summary.ts packages/shared/src/schemas/summary.test.ts packages/shared/src/index.ts
git commit -m "Завести контракт саммари и нормализацию текста"
```

### Task 4: Следующее обозначение версии

**Files:**
- Create: `apps/api/src/summaries/next-version-label.ts`
- Create: `apps/api/src/summaries/next-version-label.test.ts`

Обозначение версии в CAIRN — свободная строка (`label` ≤ 100, уникальная в проекте), не число. Функция даёт подсказку, а не решение.

- [ ] **Step 1: Написать падающий тест**

`apps/api/src/summaries/next-version-label.test.ts` — таблицей:

```ts
import { describe, expect, it } from 'vitest';

import { nextVersionLabel } from './next-version-label';

/** Версии проекта в порядке `position`: так их читает полоса роадмапа. */
function versions(...labels: string[]): { label: string; position: number }[] {
  return labels.map((label, index) => ({ label, position: index + 1 }));
}

describe('следующее обозначение версии', () => {
  it.each([
    [['v1.2'], 'v1.3'],
    [['1.0.9'], '1.0.10'],
    [['2026.11'], '2026.12'],
    [['v1.08'], 'v1.09'],
    [['v2 beta'], 'v3 beta'],
    [['release7'], 'release8'],
    [['v1.9'], 'v1.10'],
  ])('%s → %s', (labels, expected) => {
    // Увеличивается последняя группа цифр где угодно в строке: схему
    // версионирования проекта система не знает, и единственная
    // безопасная догадка — младшая группа. Поэтому v1.9 → v1.10, а не
    // v2.0.
    expect(nextVersionLabel(versions(...labels))).toBe(expected);
  });

  it('без версий подставлять нечего', () => {
    expect(nextVersionLabel([])).toBeNull();
  });

  it('обозначение без цифр подсказки не даёт', () => {
    // Угадывать «следующее» у MVP или «Осень» нечем, и выдумывать
    // v1.0 поверх чужой схемы нельзя.
    expect(nextVersionLabel(versions('MVP'))).toBeNull();
  });

  it('берёт последнюю версию по position, а не по строке', () => {
    // Тот же порядок, в котором версии читает полоса роадмапа: второй
    // порядок разошёлся бы с первым.
    expect(nextVersionLabel([
      { label: 'v3', position: 2 },
      { label: 'v9', position: 1 },
    ])).toBe('v4');
  });

  it('занятое обозначение перешагивается', () => {
    expect(nextVersionLabel(versions('v1.2', 'v1.3'))).toBe('v1.4');
  });

  it('десять занятых подряд — подсказки нет', () => {
    // Десять попыток, а не тысяча: это подсказка в заполненном поле.
    // Если занято десять следующих, человек посмотрит на роадмап сам.
    const labels = Array.from({ length: 12 }, (_, index) => `v1.${index + 1}`);

    expect(nextVersionLabel(versions(...labels))).toBeNull();
  });

  it('ширина с ведущими нулями сохраняется, пока помещается', () => {
    expect(nextVersionLabel(versions('v1.099'))).toBe('v1.100');
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries/next-version-label.test.ts`
Expected: FAIL — `Cannot find module './next-version-label'`

- [ ] **Step 3: Написать функцию**

`apps/api/src/summaries/next-version-label.ts`:

```ts
/** Обозначение версии и её место в последовательности. */
export interface VersionLabel {
  label: string;
  position: number;
}

/** Последняя группа цифр в строке: `v1.09` → префикс `v1.`, число `09`. */
const TRAILING_NUMBER = /^(.*?)(\d+)(\D*)$/;

/** Сколько раз перешагнуть занятое обозначение. */
const ATTEMPTS = 10;

/**
 * Подсказывает обозначение следующей версии (дизайн, раздел 7.4).
 *
 * Обозначение в CAIRN — свободная строка, и универсального «следующего»
 * у неё нет. Поэтому правило узкое и честное: берётся последняя версия
 * по `position`, в ней находится **последняя группа цифр где угодно**, и
 * она увеличивается на единицу с сохранением ширины. Цифр нет — `null`:
 * выдумывать `v1.0` поверх чужой схемы версионирования хуже, чем не
 * подсказать ничего.
 *
 * Полное соответствие числовому шаблону рассматривалось и отвергнуто:
 * `release7` и `v2 beta` встречаются, и отказ на них лишил бы подсказки
 * ровно тех, у кого обозначения не похожи на semver.
 */
export function nextVersionLabel(versions: VersionLabel[]): string | null {
  const last = [...versions].sort((a, b) => a.position - b.position).at(-1);

  if (!last) {
    return null;
  }

  const match = TRAILING_NUMBER.exec(last.label);

  if (!match) {
    return null;
  }

  const [, prefix = '', digits = '', suffix = ''] = match;
  const taken = new Set(versions.map((version) => version.label));
  let value = Number(digits);

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    value += 1;

    // Ширина сохраняется, пока число в неё помещается: `v1.08` → `v1.09`,
    // но `v1.99` → `v1.100`, а не `v1.00`.
    const candidate = `${prefix}${String(value).padStart(digits.length, '0')}${suffix}`;

    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  return null;
}
```

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/summaries/next-version-label.test.ts`
Expected: PASS, 13 тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/summaries/next-version-label.ts apps/api/src/summaries/next-version-label.test.ts
git commit -m "Завести подсказку следующего обозначения версии"
```

---

## Чанк 2: База и чтение

### Task 5: Таблицы саммари и черновика

**Files:**
- Create: `apps/api/src/db/schema/summaries.ts`
- Create: `apps/api/src/db/schema/summaries.test.ts`
- Modify: `apps/api/src/db/schema/chronicle.ts`
- Modify: `apps/api/src/db/schema/index.ts`

- [ ] **Step 1: Написать падающий тест**

`apps/api/src/db/schema/summaries.test.ts`:

```ts
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { summaries, summaryTaskDrafts } from './summaries';

describe('саммари', () => {
  it('ссылается на запись хроники, а не копирует текст', () => {
    // Вторая копия текста разошлась бы с первой при первой же правке.
    const columns = getTableConfig(summaries).columns.map((column) => column.name);

    expect(columns).toEqual(
      expect.arrayContaining(['project_id', 'chronicle_entry_id', 'released_version_id']),
    );
    expect(columns).not.toContain('text');
    expect(columns).not.toContain('content');
  });

  it('у записи хроники не больше одного саммари', () => {
    // Два черновика над одним текстом не отвечают на вопрос «какой
    // из них настоящий».
    expect(summaries.chronicleEntryId.isUnique).toBe(true);
  });

  it('помнит, чем и по какому тексту построена разбивка', () => {
    const columns = getTableConfig(summaries).columns.map((column) => column.name);

    expect(columns).toEqual(
      expect.arrayContaining([
        'suggester_name',
        'suggester_model',
        'suggested_at',
        'suggested_text_at',
      ]),
    );
  });

  it('стадии потока в таблице нет: она вычисляется', () => {
    // Хранимая стадия разошлась бы с содержимым при первом удалении
    // последней задачи.
    expect(getTableConfig(summaries).columns.map((column) => column.name)).not.toContain('state');
  });

  it('удалённая версия не делает саммари неудаляемым', () => {
    const link = getTableConfig(summaries).foreignKeys.find((key) =>
      key.reference().foreignColumns.some((column) => column.name === 'id' &&
        column.table[Symbol.for('drizzle:Name')] === 'roadmap_versions'),
    );

    expect(link?.onDelete).toBe('set null');
  });
});

describe('черновик задач', () => {
  it('беднее чекпоинта: ни адреса, ни платформ, ни даты', () => {
    // ТЗ 1.4 и дизайн 2.1: расширить роадмап через эту дверь нельзя
    // физически.
    const columns = getTableConfig(summaryTaskDrafts).columns.map((column) => column.name);

    expect(columns).toEqual(expect.arrayContaining(['summary_id', 'title', 'position', 'origin']));
    expect(columns).not.toContain('url');
    expect(columns).not.toContain('assignee_id');
    expect(columns).not.toContain('due_on');
    expect(columns).not.toContain('parent_id');
  });

  it('ссылки не каскадные: уборка явная', () => {
    // Каскадов в проекте нет — строки уносит репозиторий.
    expect(getTableConfig(summaryTaskDrafts).foreignKeys[0]?.onDelete).toBe('restrict');
  });

  it('читается по своему индексу в порядке позиций', () => {
    const index = getTableConfig(summaryTaskDrafts).indexes.find(
      (candidate) => candidate.config.name === 'summary_task_drafts_summary_idx',
    );

    expect(index?.config.unique).toBe(false);
  });
});
```

Способ проверить `onDelete` у конкретной ссылки подогнать под то, как это делают соседние тесты схем (`grep -n "foreignKeys" apps/api/src/db/schema/*.test.ts`) — выражение выше написано по смыслу, не по готовому образцу.

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/db/schema/summaries.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Написать схему**

`apps/api/src/db/schema/summaries.ts`:

```ts
import { SummaryTaskOrigin } from '@cairn/shared';
import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { chronicleEntries } from './chronicle';
import { projects } from './projects';
import { roadmapVersions } from './roadmap';
import { subjects } from './subjects';

/** Кем предложена задача черновика. Значения совпадают с контрактом. */
export const summaryTaskOriginEnum = pgEnum('summary_task_origin', [
  SummaryTaskOrigin.Model,
  SummaryTaskOrigin.Human,
]);

/**
 * Саммари созвона: черновик задач над записью хроники (дизайн, раздел 2).
 *
 * Своей колонки текста нет намеренно — текст лежит в
 * `chronicle_entries.content`, и вторая копия разошлась бы с первой при
 * первой же правке. Колонки стадии тоже нет: стадия вычисляется из
 * содержимого (задач нет / есть / релиз сформирован), а хранимая
 * разошлась бы с ним при удалении последней задачи.
 *
 * `released_version_id` — `set null` по образцу
 * `roadmap_checkpoints.carried_from_version_id`: удалённая версия не
 * обязана делать саммари неудаляемым, а «ушло в версию, которой больше
 * нет» честнее, чем молчание.
 */
export const summaries = pgTable(
  'summaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    /** Уникален: два черновика над одним текстом — вопрос без ответа. */
    chronicleEntryId: uuid('chronicle_entry_id')
      .notNull()
      .unique('summaries_chronicle_entry')
      .references(() => chronicleEntries.id, { onDelete: 'restrict' }),
    createdBySubjectId: uuid('created_by_subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    releasedVersionId: uuid('released_version_id').references(() => roadmapVersions.id, {
      onDelete: 'set null',
    }),
    /** Чем построена текущая разбивка. Ключ API сюда не попадает никогда. */
    suggesterName: text('suggester_name'),
    suggesterModel: text('suggester_model'),
    suggestedAt: timestamp('suggested_at', { withTimezone: true }),
    /**
     * Момент текста, по которому построена текущая разбивка.
     *
     * Нужен одному: заметить, что запись правили после разбивки, и
     * сказать об этом человеку. Предупреждение, а не отказ (раздел 2.5).
     */
    suggestedTextAt: timestamp('suggested_text_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('summaries_project_created_idx').on(table.projectId, table.createdAt.desc())],
);

/**
 * Задача черновика до переезда в роадмап.
 *
 * По составу полей **беднее** чекпоинта, а не богаче: ни адреса задачи,
 * ни тегов платформ, ни даты, ни исполнителя (ТЗ 1.4). Адрес и теги
 * ставятся после переезда штатной формой чекпоинта: придуманный моделью
 * тег платформы поставил бы в роадмап заявление, которого никто не
 * делал.
 *
 * Реляционная таблица, а не `draft jsonb`: проверять состав элементов в
 * базе пришлось бы своей SQL-функцией, а в проекте нет ни триггеров, ни
 * своих функций. Форму элементов проверяет zod на входе — там же, где
 * всё остальное.
 */
export const summaryTaskDrafts = pgTable(
  'summary_task_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    summaryId: uuid('summary_id')
      .notNull()
      .references(() => summaries.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    position: integer('position').notNull(),
    /** Признак «предложено моделью» для интерфейса и журнала релиза. */
    origin: summaryTaskOriginEnum('origin').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('summary_task_drafts_summary_idx').on(table.summaryId, table.position)],
);

/** Строка саммари. */
export type SummaryRow = typeof summaries.$inferSelect;

/** Строка черновика задач. */
export type SummaryTaskDraftRow = typeof summaryTaskDrafts.$inferSelect;
```

В `apps/api/src/db/schema/chronicle.ts` — третье значение в `pgEnum` (строки 8–11):

```ts
export const chronicleSourceEnum = pgEnum('chronicle_source', [
  ChronicleSource.Manual,
  ChronicleSource.Webhook,
  ChronicleSource.Summary,
]);
```

В `apps/api/src/db/schema/index.ts` — `export * from './summaries';` в алфавитном порядке.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/db/schema/summaries.test.ts`
Expected: PASS, 8 тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/db/schema/summaries.ts apps/api/src/db/schema/summaries.test.ts apps/api/src/db/schema/chronicle.ts apps/api/src/db/schema/index.ts
git commit -m "Завести таблицы саммари и черновика задач"
```

### Task 6: Миграции

**Files:**
- Create: `apps/api/drizzle/0033_*.sql` (имя сгенерирует drizzle-kit)
- Create: `apps/api/drizzle/0034_summary_privileges.sql`
- Modify: `apps/api/drizzle/meta/_journal.json` (первую — генератор, вторую вручную по образцу)
- Modify: `apps/api/test/db-fixture.ts`

Последние миграции в репозитории — `0031_roadmap_report_public_links.sql` и `0032_roadmap_report_privileges.sql`, значит свободны `0033` и `0034`.

- [ ] **Step 1: Сгенерировать миграцию по схеме**

Run: `cd apps/api && pnpm db:generate`
Expected: появился `drizzle/0033_<слово>.sql` и запись в `meta/_journal.json`

- [ ] **Step 2: Прочитать сгенерированное и проверить глазами**

Run: `cat apps/api/drizzle/0033_*.sql`

Обязательно должно быть:

- `ALTER TYPE "chronicle_source" ADD VALUE 'summary';`
- `CREATE TYPE "summary_task_origin" AS ENUM('model', 'human');`
- `CREATE TABLE "summaries"` и `CREATE TABLE "summary_task_drafts"` со всеми ссылками;
- уникальное ограничение на `chronicle_entry_id` и два индекса.

**Ловушка, которую надо проверить глазами:** в миграции не должно быть ни одной строки, которая **использует** значение `'summary'` — `INSERT`, `UPDATE … SET source = 'summary'`, значение по умолчанию. `ALTER TYPE … ADD VALUE` внутри транзакции допустим, но новое значение нельзя использовать в той же транзакции, и такая миграция упала бы. Генератор этого не делает; проверка нужна на случай ручной дописки. Это первый `ALTER TYPE … ADD VALUE` в репозитории (`grep "ALTER TYPE" apps/api/drizzle/*.sql` пуст), образца рядом нет.

- [ ] **Step 3: Написать миграцию привилегий**

`apps/api/drizzle/0034_summary_privileges.sql` по образцу `0032_roadmap_report_privileges.sql`:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON
  summaries, summary_task_drafts
TO cairn_app;
```

Зарегистрировать её в `apps/api/drizzle/meta/_journal.json` вручную по образцу соседних записей (`idx` на единицу больше, `tag` — имя файла без расширения, `when` — текущая метка времени в миллисекундах, `breakpoints: true`).

- [ ] **Step 4: Дополнить фикстуру**

В `apps/api/test/db-fixture.ts` (строки 76–85) добавить новые таблицы в `TRUNCATE`, **детьми первыми** — рядом с другими детьми, перед `chronicle_entries`:

```
summary_task_drafts, summaries,
```

- [ ] **Step 5: Прогнать интеграционный тест, который применяет миграции**

Run: `cd apps/api && npx vitest run src/db/schema/invariants.test.ts`
Expected: PASS — миграции применились в контейнере без ошибок

- [ ] **Step 6: Коммит**

```bash
git add apps/api/drizzle apps/api/test/db-fixture.ts
git commit -m "Применить таблицы саммари миграцией"
```

### Task 7: Проекты, где у субъекта есть уровень на секции

**Files:**
- Modify: `apps/api/src/access/access.service.ts`
- Modify: `apps/api/src/access/access.service.test.ts`

Зеркало существующей `subjectsWithLevel` (`access.service.ts:166-200`): та отвечает «кто видит это», новая — «что из этого видит он». `visibleProjectIds` не годится: она выбирает проекты по **любой** секции.

- [ ] **Step 1: Написать падающий тест**

В `apps/api/src/access/access.service.test.ts` — подготовку данных брать из соседних проверок файла:

```ts
describe('projectIdsWithLevel', () => {
  it('отдаёт только проекты с уровнем не ниже требуемого', async () => {
    // Выпадающий список саммари — ровно те проекты, куда субъект может
    // писать хронику.
    const ids = await access.projectIdsWithLevel(subject, Section.Chronicle, AccessLevel.Write);

    expect(ids).toEqual([writableProjectId]);
  });

  it('выдача на другую секцию в список не попадает', async () => {
    const ids = await access.projectIdsWithLevel(subject, Section.Chronicle, AccessLevel.Write);

    expect(ids).not.toContain(roadmapOnlyProjectId);
  });

  it('суперадмин получает все проекты', async () => {
    const ids = await access.projectIdsWithLevel(superadmin, Section.Chronicle, AccessLevel.Write);

    expect(ids).toHaveLength(await projectCount());
  });

  it('отозванный субъект не получает ничего', async () => {
    // Отзыв сильнее суперадминства — то же правило, что в resolveLevel.
    expect(
      await access.projectIdsWithLevel(revokedSuperadmin, Section.Chronicle, AccessLevel.Write),
    ).toEqual([]);
  });

  it('порядок уровней берётся из общего LEVEL_ORDER', async () => {
    // Уровень `read` ниже `write`: строки перечисления сравнивать нельзя,
    // и второго экземпляра порядка не заводится.
    expect(
      await access.projectIdsWithLevel(subject, Section.Chronicle, AccessLevel.Read),
    ).toEqual(expect.arrayContaining([writableProjectId, readableProjectId]));
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/access/access.service.test.ts`
Expected: FAIL — метода нет

- [ ] **Step 3: Добавить метод**

В `apps/api/src/access/access.service.ts`, рядом с `subjectsWithLevel`:

```ts
/**
 * Проекты, где у субъекта уровень на секции не ниже указанного.
 *
 * Обратная сторона {@link subjectsWithLevel}: тот отвечает «кто видит
 * это», этот — «что из этого видит он». Нужен экрану саммари: список
 * целей — ровно те проекты, куда субъект может писать хронику.
 *
 * `visibleProjectIds` здесь не годится: она выбирает проекты по любой
 * секции, а требуется одна конкретная и с уровнем.
 *
 * Суперадмины получают все проекты без выдач, отозванные — ни одного:
 * то же правило, что в `resolveLevel`.
 */
async projectIdsWithLevel(
  subject: RequestSubject,
  section: Section,
  minimum: AccessLevel,
  executor: Executor = this.db,
): Promise<string[]> {
  if (subject.isRevoked) {
    return [];
  }

  if (subject.isSuperadmin) {
    const all = await executor.select({ id: projects.id }).from(projects);

    return all.map((row) => row.id);
  }

  const allowed = Object.values(AccessLevel).filter(
    (level) => LEVEL_ORDER[level] >= LEVEL_ORDER[minimum],
  );

  const granted = await executor
    .selectDistinct({ projectId: grants.projectId })
    .from(grants)
    .where(
      and(
        eq(grants.subjectId, subject.id),
        eq(grants.section, section),
        inArray(grants.level, allowed),
      ),
    );

  return granted.map((row) => row.projectId);
}
```

Точные имена полей `RequestSubject` (`isRevoked`, `isSuperadmin`) и способ их проверки взять из `resolveLevel` (`access.service.ts:31-67`) — там это уже сделано, и расходиться нельзя.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/access/access.service.test.ts`
Expected: PASS, включая прежние проверки

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/access
git commit -m "Завести выборку проектов с уровнем на секции"
```

### Task 8: Обозначения версий проекта без сборки роадмапа

**Files:**
- Modify: `apps/api/src/roadmap/roadmap.repository.ts`
- Modify: `apps/api/src/roadmap/roadmap.repository.test.ts`

Подсказке обозначения нужны только `label` и `position`, а не весь роадмап с чекпоинтами, выпусками и сводкой. Это **единственная** правка роадмапа во всём изменении.

- [ ] **Step 1: Написать падающий тест**

В `apps/api/src/roadmap/roadmap.repository.test.ts`:

```ts
describe('labelsForProject', () => {
  it('отдаёт обозначения и позиции', async () => {
    const labels = await repository.labelsForProject(subject, projectId);

    expect(labels).toEqual([
      { label: 'v1.1', position: 1 },
      { label: 'v1.2', position: 2 },
    ]);
  });

  it('хватает уровня метаданных: обозначения видны и на нём', async () => {
    await expect(
      repository.labelsForProject(metadataSubject, projectId),
    ).resolves.toHaveLength(2);
  });

  it('без выдачи на роадмап проект не раскрывается', async () => {
    // Отсутствие доступа — 404, а не 403.
    await expect(repository.labelsForProject(outsider, projectId)).rejects.toThrow(
      SectionNotVisibleError,
    );
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/roadmap/roadmap.repository.test.ts`
Expected: FAIL — метода нет

- [ ] **Step 3: Добавить метод**

В `apps/api/src/roadmap/roadmap.repository.ts`:

```ts
/**
 * Обозначения версий проекта с их позициями.
 *
 * Нужен подсказке следующего обозначения в конструкторе задач: собирать
 * весь роадмап с чекпоинтами, выпусками и сводкой ради двух колонок
 * незачем. Уровня «метаданные» достаточно — обозначения версий видны
 * уже на нём (ТЗ 4.3).
 */
async labelsForProject(
  subject: RequestSubject,
  projectId: string,
  executor: Executor = this.db,
): Promise<{ label: string; position: number }[]> {
  await this.access.requireLevel(subject, projectId, Section.Roadmap, AccessLevel.Metadata, executor);

  return executor
    .select({ label: roadmapVersions.label, position: roadmapVersions.position })
    .from(roadmapVersions)
    .where(eq(roadmapVersions.projectId, projectId))
    .orderBy(asc(roadmapVersions.position));
}
```

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/roadmap/roadmap.repository.test.ts`
Expected: PASS, включая все прежние тесты роадмапа

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/roadmap/roadmap.repository.ts apps/api/src/roadmap/roadmap.repository.test.ts
git commit -m "Отдавать обозначения версий без сборки роадмапа"
```

### Task 9: Репозиторий саммари: создание и чтение

**Files:**
- Create: `apps/api/src/summaries/summaries.repository.ts`
- Create: `apps/api/src/summaries/summaries.repository.test.ts`

Интеграционный тест на `startTestDatabase()`; подготовку данных брать из `apps/api/src/chronicle/chronicle.repository.test.ts` — там уже есть проект, субъект и выдачи.

- [ ] **Step 1: Написать падающий тест**

```ts
describe('репозиторий саммари', () => {
  it('создаёт запись хроники и саммари одной транзакцией', async () => {
    const summary = await repository.create(writer, tx, projectId, {
      occurredOn: '2026-11-16',
      title: 'Созвон по релизу',
      text: 'обсудили сроки',
    });

    const [entry] = await testDb.rowsOf(chronicleEntries);

    expect(entry?.source).toBe(ChronicleSource.Summary);
    expect(summary.chronicleEntryId).toBe(entry?.id);
    expect(summary.text).toBe('обсудили сроки');
  });

  it('уровня чтения хроники не хватает', async () => {
    // Первое, что делает поток, — сохраняет текст.
    await expect(
      repository.create(reader, tx, projectId, CREATE_INPUT),
    ).rejects.toThrow(InsufficientLevelError);
  });

  it('без выдачи на хронику проект не раскрывается', async () => {
    await expect(
      repository.create(outsider, tx, projectId, CREATE_INPUT),
    ).rejects.toThrow(SectionNotVisibleError);
  });

  it('саммари чужого проекта выглядит несуществующим', async () => {
    // Выборка по (id, project_id), как requireEntry в хронике.
    await expect(
      repository.findById(writer, otherProjectId, summaryId),
    ).rejects.toThrow(SectionNotVisibleError);
  });

  it('список проекта отдаёт свежие сверху', async () => {
    const items = await repository.findForProject(writer, projectId);

    expect(items.map((item) => item.title)).toEqual(['второе', 'первое']);
  });

  it('обозначение версии-получателя скрыто без выдачи на роадмап', async () => {
    // Обозначение версии — данные роадмапа; «ушло в роадмап» —
    // состояние потока, и оно видно всегда.
    const [item] = await repository.findForProject(chronicleOnlyWriter, projectId);

    expect(item?.isReleased).toBe(true);
    expect(item?.releasedVersionLabel).toBeNull();
  });

  it('на уровне метаданных роадмапа обозначение видно', async () => {
    const [item] = await repository.findForProject(roadmapMetadataWriter, projectId);

    expect(item?.releasedVersionLabel).toBe('v1.3');
  });

  it('подсказка обозначения пуста без выдачи на роадмап', async () => {
    // Уровень спрашивается, а не ловится исключением: try/catch вокруг
    // requireLevel спрятал бы и настоящие ошибки.
    const detail = await repository.findById(chronicleOnlyWriter, projectId, summaryId);

    expect(detail.suggestedVersionLabel).toBeNull();
  });

  it('текст, поправленный после разбивки, помечен устаревшим', async () => {
    await markSuggested(summaryId, new Date('2026-11-16T10:00:00Z'));
    await editEntryAt(entryId, new Date('2026-11-16T12:00:00Z'));

    const detail = await repository.findById(writer, projectId, summaryId);

    expect(detail.isTextStale).toBe(true);
  });

  it('до разбивки текст устаревшим не считается', async () => {
    // `suggested_text_at` пуст: сравнивать не с чем, и предупреждать
    // не о чем.
    const detail = await repository.findById(writer, projectId, summaryId);

    expect(detail.isTextStale).toBe(false);
  });

  it('удаление уносит черновик перед саммари', async () => {
    await repository.remove(writer, tx, projectId, summaryId);

    expect(await testDb.rowsOf(summaryTaskDrafts)).toHaveLength(0);
    expect(await testDb.rowsOf(summaries)).toHaveLength(0);
  });

  it('удаление саммари запись хроники не трогает', async () => {
    // Запись — артефакт проекта, её удаление — действие секции «Хроника».
    await repository.remove(writer, tx, projectId, summaryId);

    expect(await testDb.rowsOf(chronicleEntries)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries/summaries.repository.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Написать репозиторий**

`apps/api/src/summaries/summaries.repository.ts`. Устройство:

- конструктор берёт `DATABASE`, `AccessService`, `ChronicleRepository` и `RoadmapRepository`;
- каждый публичный метод принимает `RequestSubject` первым аргументом и сам требует `Chronicle ≥ write` тем же исполнителем, которым работает (`requireLevel(… , tx)`);
- `create` зовёт `ChronicleRepository.create(subject, tx, projectId, input, ChronicleSource.Summary)` — проверку права делает он, и вторая проверка здесь была бы дублем, — затем вставляет строку `summaries` в той же транзакции с тем же `projectId`;
- `requireForWrite(subject, tx, projectId, id)` — приватная основа `findById`, `replaceTasks` и шага релиза: требует уровень и выбирает саммари по `(id, project_id)`; чужое бросает `SectionNotVisibleError`;
- `findById` собирает деталь: саммари, текст и `updated_at` записи хроники, задачи по `position`, `isTextStale` как `entry.updatedAt > summary.suggestedTextAt` (при пустом `suggestedTextAt` — `false`);
- обозначение версии-получателя и подсказка следующего считаются **через вопрос об уровне**: `access.resolveLevel(subject, projectId, Section.Roadmap)`, и только при уровне не ниже `Metadata` — `RoadmapRepository.labelsForProject` плюс `nextVersionLabel`. Перехват исключения от `requireLevel` прятал бы внутрь и настоящие ошибки;
- `remove` убирает `summary_task_drafts`, затем `summaries`; записи хроники не касается.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/summaries/summaries.repository.test.ts`
Expected: PASS, 12 тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/summaries/summaries.repository.ts apps/api/src/summaries/summaries.repository.test.ts
git commit -m "Завести репозиторий саммари"
```

### Task 10: Замена черновика целиком

**Files:**
- Modify: `apps/api/src/summaries/summaries.repository.ts`
- Modify: `apps/api/src/summaries/summaries.repository.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
describe('замена черновика', () => {
  it('нумерует позиции по порядку массива', async () => {
    // Позиции не принимаются от клиента: второе место для порядка
    // разошлось бы с первым.
    const detail = await repository.replaceTasks(writer, tx, projectId, summaryId, {
      tasks: [{ title: 'раз' }, { title: 'два' }, { title: 'три' }],
    });

    expect(detail.tasks.map((task) => task.position)).toEqual([1, 2, 3]);
  });

  it('строка с id сохраняет происхождение', async () => {
    // Иначе «предложено моделью» снималось бы первым же сохранением.
    const detail = await repository.replaceTasks(writer, tx, projectId, summaryId, {
      tasks: [{ id: modelTaskId, title: 'правленная формулировка' }],
    });

    expect(detail.tasks[0]?.origin).toBe(SummaryTaskOrigin.Model);
    expect(detail.tasks[0]?.title).toBe('правленная формулировка');
  });

  it('строка без id набрана человеком', async () => {
    const detail = await repository.replaceTasks(writer, tx, projectId, summaryId, {
      tasks: [{ title: 'дописал руками' }],
    });

    expect(detail.tasks[0]?.origin).toBe(SummaryTaskOrigin.Human);
  });

  it('исчезнувшая из массива строка удаляется', async () => {
    await repository.replaceTasks(writer, tx, projectId, summaryId, { tasks: [] });

    expect(await testDb.rowsOf(summaryTaskDrafts)).toHaveLength(0);
  });

  it('чужой id в массиве не подхватывает чужую строку', async () => {
    // Иначе правка черновика стала бы способом увести строку из другого
    // саммари.
    await expect(
      repository.replaceTasks(writer, tx, projectId, summaryId, {
        tasks: [{ id: foreignTaskId, title: 'чужая' }],
      }),
    ).rejects.toThrow();
  });

  it('после сформированного релиза черновик не правится', async () => {
    // Чекпоинты уже живут в роадмапе: правка задним числом развела бы
    // две правды о том, что уехало.
    await markReleased(summaryId);

    await expect(
      repository.replaceTasks(writer, tx, projectId, summaryId, { tasks: [{ title: 'поздно' }] }),
    ).rejects.toThrow(ConflictException);
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries/summaries.repository.test.ts`
Expected: FAIL — метода `replaceTasks` нет

- [ ] **Step 3: Написать метод**

`replaceTasks(subject, tx, projectId, summaryId, input)`:

1. `requireForWrite` — уровень и принадлежность проекту;
2. `released_version_id` заполнен → `ConflictException` с кодом `SUMMARY_ALREADY_RELEASED`;
3. прочитать существующие строки черновика **этого** саммари и собрать карту `id → origin`;
4. любой присланный `id`, которого в карте нет, — отказ: это либо исчезнувшая строка, либо чужая;
5. удалить все строки черновика саммари и вставить присланные заново, нумеруя `position` с 1 по порядку массива и подставляя `origin` из карты (или `Human` для строки без `id`). Полная замена проще, чем разностное обновление, и не требует отложенных обновлений на каждой перестановке позиций;
6. вернуть деталь (тот же сбор, что в `findById`).

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/summaries/summaries.repository.test.ts`
Expected: PASS, 18 тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/summaries
git commit -m "Заменять черновик задач целиком одним запросом"
```

### Task 11: Уборка саммари при удалении записи хроники

**Files:**
- Modify: `apps/api/src/chronicle/chronicle.repository.ts`
- Modify: `apps/api/src/chronicle/chronicle.repository.test.ts`

`summaries.chronicle_entry_id` — `restrict`, значит без уборки запись с саммари станет неудаляемой, и наружу вылезет ошибка драйвера.

- [ ] **Step 1: Написать падающий тест**

В `apps/api/src/chronicle/chronicle.repository.test.ts`:

```ts
it('удаление записи уносит саммари с его черновиком', async () => {
  // Каскадов в проекте нет, ссылка restrict: не унесём — удаление
  // упадёт на внешнем ключе, и запись станет неудаляемой.
  const { entryId } = await seedSummaryWithTasks();

  await repository.remove(subject, tx, projectId, entryId);

  expect(await testDb.rowsOf(summaryTaskDrafts)).toHaveLength(0);
  expect(await testDb.rowsOf(summaries)).toHaveLength(0);
  expect(await testDb.rowsOf(chronicleEntries)).toHaveLength(0);
});

it('удаление записи без саммари работает как раньше', async () => {
  const entry = await repository.create(subject, tx, projectId, CREATE_INPUT);

  await expect(repository.remove(subject, tx, projectId, entry.id)).resolves.toMatchObject({
    id: entry.id,
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/chronicle/chronicle.repository.test.ts`
Expected: FAIL — удаление упало на внешнем ключе

- [ ] **Step 3: Добавить уборку**

В `ChronicleRepository.remove` (`chronicle.repository.ts:111-124`), **до** `tx.delete(chronicleEntries)` — ровно так, как `removeVersion` убирает теги, выпуски и публичные ссылки перед версией (`roadmap.repository.ts:184-212`):

```ts
// Саммари ссылается на запись `restrict`, каскадов в проекте нет:
// без явной уборки запись с саммари стала бы неудаляемой. Отдельной
// записи в журнал удаление саммари не получает — человек удалял
// запись хроники, и журнал обязан описывать то, что он сделал.
const linked = await tx
  .select({ id: summaries.id })
  .from(summaries)
  .where(eq(summaries.chronicleEntryId, entryId));

if (linked.length > 0) {
  const ids = linked.map((row) => row.id);

  await tx.delete(summaryTaskDrafts).where(inArray(summaryTaskDrafts.summaryId, ids));
  await tx.delete(summaries).where(inArray(summaries.id, ids));
}
```

Импорты `summaries`, `summaryTaskDrafts` и `inArray` добавить к существующим.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/chronicle`
Expected: PASS, включая все прежние тесты хроники

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/chronicle
git commit -m "Уносить саммари вместе с записью хроники"
```

---

## Чанк 3: Порт «предложитель задач»

### Task 12: Настройки предложителя

**Files:**
- Create: `apps/api/src/summaries/suggester/settings.ts`
- Create: `apps/api/src/summaries/suggester/settings.test.ts`

Образец — `apps/api/src/status/checkers/settings.ts`: чистые функции, значения читаются при каждом вызове (иначе настройка зависела бы от порядка импортов, а тесты не могли бы её менять), мусор означает умолчание.

- [ ] **Step 1: Написать падающий тест**

```ts
describe('настройки предложителя', () => {
  it('внешний адаптер без ключа выключен', () => {
    // Так совмещаются «по умолчанию внешний» и «self-hosted без внешних
    // зависимостей»: внешним путь становится от того, что его включили,
    // а не от того, что забыли выключить.
    process.env.CAIRN_TASK_SUGGESTER = 'external';
    process.env.CAIRN_TASK_SUGGESTER_API_KEY = '';

    expect(suggesterSettings().isEnabled).toBe(false);
  });

  it('локальный адаптер без адреса выключен', () => {
    process.env.CAIRN_TASK_SUGGESTER = 'local';
    process.env.CAIRN_TASK_SUGGESTER_BASE_URL = '';

    expect(suggesterSettings().isEnabled).toBe(false);
  });

  it('локальный адаптер ключа не требует', () => {
    process.env.CAIRN_TASK_SUGGESTER = 'local';
    process.env.CAIRN_TASK_SUGGESTER_BASE_URL = 'http://llm.internal/v1';
    process.env.CAIRN_TASK_SUGGESTER_API_KEY = '';

    expect(suggesterSettings().isEnabled).toBe(true);
  });

  it('off выключает порт при любом ключе', () => {
    process.env.CAIRN_TASK_SUGGESTER = 'off';
    process.env.CAIRN_TASK_SUGGESTER_API_KEY = 'ключ';

    expect(suggesterSettings().isEnabled).toBe(false);
  });

  it('умолчание — внешний адаптер', () => {
    delete process.env.CAIRN_TASK_SUGGESTER;

    expect(suggesterSettings().kind).toBe(TaskSuggesterKind.External);
  });

  it('мусор в пределе ожидания даёт умолчание, а не бесконечность', () => {
    process.env.CAIRN_TASK_SUGGESTER_TIMEOUT_SECONDS = 'скоро';

    expect(suggesterSettings().timeoutSeconds).toBe(60);
  });

  it('нулевой предел объёма даёт умолчание', () => {
    process.env.CAIRN_TASK_SUGGESTER_MAX_CHARS = '0';

    expect(suggesterSettings().maxChars).toBe(40_000);
  });

  it('имя узла извлекается без пути и без ключа', () => {
    // Оно показывается человеку и попадает в журнал; полный адрес и
    // ключ — никуда.
    expect(hostOf('https://api.openai.com/v1/')).toBe('api.openai.com');
  });

  it('негодный адрес имени узла не даёт', () => {
    expect(hostOf('не адрес')).toBeNull();
  });
});
```

В `beforeEach` — сохранять и восстанавливать затронутые переменные окружения, как это делают соседние тесты настроек.

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries/suggester/settings.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Написать разбор**

`settings.ts` отдаёт `{ kind, baseUrl, apiKey, model, timeoutSeconds, maxChars, maxTasks, host, isEnabled }`. Умолчания — по таблице раздела 5.3 дизайна. `isEnabled` — `false`, когда `CAIRN_TASK_SUGGESTER=off`, когда у `external` пуст ключ или адрес, когда у `local` пуст адрес. Положительные числа разбираются одной приватной функцией, как в `status/checkers/settings.ts`.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/summaries/suggester/settings.test.ts`
Expected: PASS, 9 тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/summaries/suggester
git commit -m "Разобрать настройки предложителя задач"
```

### Task 13: Валидация вывода модели

**Files:**
- Create: `apps/api/src/summaries/suggester/validate.ts`
- Create: `apps/api/src/summaries/suggester/validate.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
describe('разбор вывода модели', () => {
  it('разбирает ожидаемую форму', () => {
    expect(tasksOf('{"tasks":["раз","два"]}', 50).tasks).toEqual([
      { title: 'раз' },
      { title: 'два' },
    ]);
  });

  it('снимает обёртку в заборе из кавычек', () => {
    // Маленькие модели ставят её постоянно, несмотря на запрос JSON.
    // Строгий отказ здесь означал бы неработающую кнопку.
    const raw = '```json\n{"tasks":["раз"]}\n```';

    expect(tasksOf(raw, 50).tasks).toEqual([{ title: 'раз' }]);
  });

  it('снимает болтовню вокруг объекта', () => {
    const raw = 'Вот задачи:\n{"tasks":["раз"]}\nГотово.';

    expect(tasksOf(raw, 50).tasks).toEqual([{ title: 'раз' }]);
  });

  it('негодный элемент выбрасывается поштучно', () => {
    // Один мусорный элемент не рушит весь ответ.
    expect(tasksOf('{"tasks":["раз",42,null,"два"]}', 50).tasks).toEqual([
      { title: 'раз' },
      { title: 'два' },
    ]);
  });

  it('снимает ведущие маркеры списка', () => {
    const raw = '{"tasks":["- раз","1. два","• три","2) четыре"]}';

    expect(tasksOf(raw, 50).tasks.map((task) => task.title)).toEqual([
      'раз',
      'два',
      'три',
      'четыре',
    ]);
  });

  it('сворачивает пробелы', () => {
    expect(tasksOf('{"tasks":["раз   \\n  два"]}', 50).tasks[0]?.title).toBe('раз два');
  });

  it('режет до предела чекпоинта по границе слова', () => {
    const long = `${'слово '.repeat(60)}хвост`;
    const title = tasksOf(JSON.stringify({ tasks: [long] }), 50).tasks[0]?.title ?? '';

    expect(title.length).toBeLessThanOrEqual(300);
    expect(title.endsWith('слово')).toBe(true);
  });

  it('выбрасывает пустые строки', () => {
    expect(tasksOf('{"tasks":["","   ","раз"]}', 50).tasks).toHaveLength(1);
  });

  it('выбрасывает дубли без учёта регистра и пробелов', () => {
    expect(tasksOf('{"tasks":["Сделать Х","сделать   х"]}', 50).tasks).toHaveLength(1);
  });

  it('режет до предела и называет отброшенное числом', () => {
    // Тихое урезание читалось бы как «столько и предложили».
    const raw = JSON.stringify({ tasks: Array.from({ length: 7 }, (_, i) => `задача ${i}`) });
    const result = tasksOf(raw, 5);

    expect(result.tasks).toHaveLength(5);
    expect(result.dropped).toBe(2);
  });

  it('мусор даёт пустой список, а не исключение', () => {
    // Решение «пусто» принимает вызывающий: он и отвечает отказом.
    expect(tasksOf('я не умею в json', 50)).toEqual({ tasks: [], dropped: 0 });
  });

  it('разметку в формулировке оставляет текстом', () => {
    // Экранирование — дело рендера, не валидации; калечить формулировку
    // здесь значило бы терять осмысленные задачи.
    expect(tasksOf('{"tasks":["<script>alert(1)</script>"]}', 50).tasks[0]?.title).toBe(
      '<script>alert(1)</script>',
    );
  });

  it('из вывода не берётся ничего, кроме формулировки', () => {
    // Ни адресов, ни тегов платформ, ни идентификаторов, ни обозначения
    // версии: модель не может назвать объект системы — ей нечем.
    const raw = '{"tasks":[{"title":"раз","url":"http://x","platformIds":["a"],"id":"b"}]}';

    expect(tasksOf(raw, 50).tasks).toEqual([]);
  });
});
```

Последняя проверка требует решения: элементы — **строки**, а объект `{title}` в них не принимается. Это проще защищать, чем строгий объект с выброшенными лишними полями: нечего «ремонтировать», и невозможно случайно пропустить новое поле.

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries/suggester/validate.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Написать функцию**

`tasksOf(raw: string, maxTasks: number): SuggestResult` — пять шагов раздела 5.5 дизайна, каждый приватной функцией: `jsonOf` (подстрока от первой `{` до последней `}`, `JSON.parse` в `try`), zod-схема `{ tasks: unknown[] }`, `cleanTitle` (управляющие и невидимые пробелы, свёртка пробелов, маркеры списка, обрезка до 300 по границе слова), дедупликация по нормализованному ключу, предел с подсчётом `dropped`.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/summaries/suggester/validate.test.ts`
Expected: PASS, 13 тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/summaries/suggester
git commit -m "Разбирать и чистить вывод модели"
```

### Task 14: Адаптеры и фабрика

**Files:**
- Create: `apps/api/src/summaries/suggester/task-suggester.ts`
- Create: `apps/api/src/summaries/suggester/openai-compatible.suggester.ts`
- Create: `apps/api/src/summaries/suggester/openai-compatible.suggester.test.ts`
- Create: `apps/api/src/summaries/suggester/disabled.suggester.ts`
- Create: `apps/api/src/summaries/summaries.module.ts`

- [ ] **Step 1: Написать падающий тест**

С подменённым `fetch` (`vi.stubGlobal('fetch', …)`), без сети:

```ts
describe('адаптер OpenAI-совместимого API', () => {
  it('наружу уходит ровно текст саммари и системная инструкция', async () => {
    // Сравнение тела целиком, а не по полям: иначе новое поле уехало бы
    // наружу незамеченным.
    const fetchMock = okWith('{"tasks":["раз"]}');

    await suggester().suggest('обсудили сроки', AbortSignal.timeout(1000));

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);

    expect(body).toEqual({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: '<<<НАЧАЛО ТЕКСТА>>>\nобсудили сроки\n<<<КОНЕЦ ТЕКСТА>>>' },
      ],
    });
  });

  it('ни названия проекта, ни переменных, ни адресов в запросе нет', async () => {
    const fetchMock = okWith('{"tasks":["раз"]}');

    await suggester().suggest('обсудили сроки', AbortSignal.timeout(1000));

    const sent = fetchMock.mock.calls[0]?.[1]?.body as string;

    expect(sent).not.toContain('CAIRN');
    expect(sent).not.toContain('prod.example.ru');
  });

  it('ключ уходит заголовком, когда задан', async () => {
    const fetchMock = okWith('{"tasks":["раз"]}');

    await suggester({ apiKey: 'секрет' }).suggest('текст', AbortSignal.timeout(1000));

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer секрет',
    });
  });

  it('без ключа заголовка нет: локальный endpoint его не требует', async () => {
    const fetchMock = okWith('{"tasks":["раз"]}');

    await suggester({ apiKey: '' }).suggest('текст', AbortSignal.timeout(1000));

    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Authorization');
  });

  it.each([429, 500, 503])('%i даёт отказ «не ответил»', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })));

    await expect(suggester().suggest('текст', AbortSignal.timeout(1000))).rejects.toMatchObject({
      code: SUGGESTER_UNAVAILABLE,
    });
  });

  it('обрыв по таймауту даёт тот же отказ', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('', 'AbortError')));

    await expect(suggester().suggest('текст', AbortSignal.timeout(1000))).rejects.toMatchObject({
      code: SUGGESTER_UNAVAILABLE,
    });
  });

  it('ключ не встречается ни в сообщении отказа, ни в его причине', async () => {
    // Секреты не в логах: `cause` чужого ответа наружу не разворачивается.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ключ секрет отвергнут')));

    const error = await suggester({ apiKey: 'секрет' })
      .suggest('текст', AbortSignal.timeout(1000))
      .catch((cause: unknown) => cause);

    expect(JSON.stringify(error)).not.toContain('секрет');
    expect(String(error)).not.toContain('секрет');
  });

  it('пустой разбор даёт отказ, а не пустой черновик', async () => {
    okWith('я не умею в json');

    await expect(suggester().suggest('текст', AbortSignal.timeout(1000))).rejects.toMatchObject({
      code: SUGGESTER_UNAVAILABLE,
    });
  });
});

describe('выключенный предложитель', () => {
  it('говорит, что не настроен, и в сеть не ходит', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(new DisabledSuggester().suggest('текст', AbortSignal.timeout(1))).rejects.toMatchObject({
      code: SUGGESTER_DISABLED,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries/suggester/openai-compatible.suggester.test.ts`
Expected: FAIL — модули не найдены

- [ ] **Step 3: Написать порт, адаптеры и фабрику**

`task-suggester.ts` — интерфейс `TaskSuggester`, тип `SuggestResult`, токен `export const TASK_SUGGESTER = Symbol('TASK_SUGGESTER');` и класс отказа с полем `code`.

`openai-compatible.suggester.ts` — один класс на **оба** пресета: llama.cpp и vLLM говорят тем же протоколом, и два класса различались бы только умолчаниями. `POST {baseUrl}/chat/completions`, таймаут через `AbortSignal.timeout(…)`, предел читаемого тела, разбор через `tasksOf`. Пустой результат — отказ `SUGGESTER_UNAVAILABLE`: пустой черновик человеку не нужен.

`disabled.suggester.ts` — `isEnabled: false`, `suggest` сразу бросает `SUGGESTER_DISABLED`. Нужен, потому что система self-hosted: установка без настроенной разбивки обязана работать, показывая выключенную кнопку с объяснением.

`summaries.module.ts` — провайдер по токену:

```ts
{
  provide: TASK_SUGGESTER,
  useFactory: (): TaskSuggester => {
    const settings = suggesterSettings();

    // Порт выбирается один раз при старте: подмена адаптера на ходу
    // сменила бы границу передачи данных молча. Автоматического
    // перехода на внешний адаптер при отказе локального нет и не
    // будет — это запрет, а не недоработка (дизайн, раздел 5.2).
    return settings.isEnabled ? new OpenAiCompatibleSuggester(settings) : new DisabledSuggester();
  },
}
```

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/summaries/suggester`
Expected: PASS

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/summaries
git commit -m "Завести адаптеры предложителя задач"
```

### Task 15: Шаг разбивки в сервисе

**Files:**
- Create: `apps/api/src/summaries/summaries.service.ts`
- Create: `apps/api/src/summaries/summaries.service.test.ts`
- Modify: `apps/api/src/audit/audit.types.ts`

- [ ] **Step 1: Написать падающий тест**

Интеграционный, с заглушкой по токену `TASK_SUGGESTER`:

```ts
describe('разбивка текста на задачи', () => {
  it('успех заменяет черновик и помечает строки машинными', async () => {
    const detail = await service.suggest(writer, projectId, summaryId);

    expect(detail.tasks.map((task) => task.origin)).toEqual([
      SummaryTaskOrigin.Model,
      SummaryTaskOrigin.Model,
    ]);
    expect(detail.suggester).toMatchObject({ model: 'тестовая', name: 'local' });
  });

  it('запись о передаче пишется до обращения к предложителю', async () => {
    // Нет записи — нет и передачи: иначе падение процесса оставило бы
    // текст ушедшим наружу без следа.
    const order: string[] = [];
    suggesterStub.suggest.mockImplementation(async () => {
      order.push('сеть');
      return { tasks: [{ title: 'раз' }], dropped: 0 };
    });
    onAuditInsert(() => order.push('журнал'));

    await service.suggest(writer, projectId, summaryId);

    expect(order).toEqual(['журнал', 'сеть']);
  });

  it('в журнале передачи — узел и длина, но не текст', async () => {
    await service.suggest(writer, projectId, summaryId);

    const [record] = await auditRecords(AuditAction.SummaryTasksSuggested);

    expect(record?.metadata).toEqual({
      suggester: 'local',
      model: 'тестовая',
      host: 'llm.internal',
      chars: 14,
    });
    expect(JSON.stringify(record)).not.toContain('обсудили сроки');
  });

  it('отказ оставляет прежний черновик', async () => {
    // Иначе неудачная попытка затирала бы список, который человек
    // правил двадцать минут.
    await service.replaceTasks(writer, projectId, summaryId, { tasks: [{ title: 'моё' }] });
    suggesterStub.suggest.mockRejectedValue(unavailable());

    await expect(service.suggest(writer, projectId, summaryId)).rejects.toThrow();

    const detail = await service.findById(writer, projectId, summaryId);

    expect(detail.tasks.map((task) => task.title)).toEqual(['моё']);
  });

  it('отказ пишется в журнал с кодом и длительностью, без чужого тела', async () => {
    suggesterStub.suggest.mockRejectedValue(unavailable('тело чужого ответа'));

    await expect(service.suggest(writer, projectId, summaryId)).rejects.toThrow();

    const [record] = await auditRecords(AuditAction.SummaryTasksSuggestionFailed);

    expect(record?.metadata).toMatchObject({ code: SUGGESTER_UNAVAILABLE });
    expect(record?.metadata).toHaveProperty('durationMs');
    expect(JSON.stringify(record)).not.toContain('тело чужого ответа');
  });

  it('успех отдельной записи не получает', async () => {
    // Запись о передаче уже закрыта, дописать в неё число предложенных
    // нечем; последствие фиксирует `summary.released`.
    await service.suggest(writer, projectId, summaryId);

    expect(await auditRecords(AuditAction.SummaryTasksSuggested)).toHaveLength(1);
    expect(await allSummaryActions()).toEqual([AuditAction.SummaryTasksSuggested]);
  });

  it('выключенный предложитель отвечает 409, а не 502', async () => {
    // Правильное действие клиента — «попросить администратора
    // включить», а не «повторить позже».
    withDisabledSuggester();

    await expect(service.suggest(writer, projectId, summaryId)).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: SUGGESTER_DISABLED }),
    });
  });

  it('текст длиннее предела отказывает до вызова, с настоящим числом', async () => {
    await seedLongText(summaryId, 50_000);

    await expect(service.suggest(writer, projectId, summaryId)).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: SUMMARY_TEXT_TOO_LONG, maxChars: 40_000 }),
    });
    expect(suggesterStub.suggest).not.toHaveBeenCalled();
  });

  it('второй одновременный вызов на субъекта отвергается', async () => {
    // Названная эксплуатационная граница: счётчик живёт в памяти
    // процесса и при нескольких репликах API перестаёт работать.
    suggesterStub.suggest.mockImplementation(() => never());

    const first = service.suggest(writer, projectId, summaryId);

    await expect(service.suggest(writer, projectId, summaryId)).rejects.toThrow();

    release();
    await first;
  });

  it('разбивка помнит момент текста', async () => {
    // По нему считается `isTextStale`.
    await service.suggest(writer, projectId, summaryId);

    const [row] = await testDb.rowsOf(summaries);

    expect(row?.suggestedTextAt).toEqual(entryUpdatedAt);
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries/summaries.service.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Написать сервис и действия журнала**

В `apps/api/src/audit/audit.types.ts` — пять значений в `AuditAction` (строки 4–84), рядом с действиями хроники:

```ts
  SummaryCreated = 'summary.created',
  SummaryTasksSuggested = 'summary.tasks_suggested',
  SummaryTasksSuggestionFailed = 'summary.tasks_suggestion_failed',
  SummaryReleased = 'summary.released',
  SummaryDeleted = 'summary.deleted',
```

`summaries.service.ts` — транзакции и журнал поверх репозитория, как `ChronicleService`. Шаг `suggest` по порядку:

1. короткая транзакция: `requireForWrite` (право и принадлежность), чтение текста, проверка длины против `suggester.maxChars` — отказ `409 SUMMARY_TEXT_TOO_LONG` с настоящим числом **до** всякой сети;
2. порт выключен → `409 SUGGESTER_DISABLED`;
3. занять место в счётчике одновременных вызовов субъекта (`Map<subjectId, true>` в сервисе); занято → отказ;
4. **в своей короткой транзакции** — `AuditService.record(tx, actor, { action: SummaryTasksSuggested, metadata: { suggester, model, host, chars } })`. Отступление от «журнал в одной транзакции с действием» названное: действие здесь — исходящая передача, и запись после неё потерялась бы при падении процесса, оставив текст ушедшим без следа;
5. вызов `suggester.suggest(text, signal)` **вне транзакции**: держать её открытой шестьдесят секунд нельзя — это занятое соединение из пула и замок на строке;
6. отказ → своя короткая транзакция с `SummaryTasksSuggestionFailed` (`{ suggester, host, code, durationMs }`, без тела чужого ответа) и `502 SUGGESTER_UNAVAILABLE` наружу; черновик при этом не тронут;
7. успех → транзакция: замена черновика строками с `origin = model`, запись `suggester_name`, `suggester_model`, `suggested_at` и `suggested_text_at` (равный `updated_at` записи хроники на момент чтения текста). Отдельной записи журнала об успехе нет;
8. освободить место в счётчике в `finally`.

Остальные методы сервиса (`create`, `replaceTasks`, `remove`, чтение) — по одной транзакции на действие, с `SummaryCreated` / `SummaryDeleted` в ней же. `summary.tasks_saved` не заводится: черновик — поверхность до подтверждения, и десяток строк «правил формулировку» на саммари сделал бы журнал нечитаемым.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/summaries/summaries.service.test.ts`
Expected: PASS, 10 тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/summaries apps/api/src/audit/audit.types.ts
git commit -m "Разбивать текст саммари на задачи через порт"
```

---

## Чанк 4: Запись в роадмап и ручки

### Task 16: Формирование релиза

**Files:**
- Modify: `apps/api/src/summaries/summaries.service.ts`
- Modify: `apps/api/src/summaries/summaries.service.test.ts`
- Modify: `apps/api/src/summaries/summaries.repository.ts`

**Рефакторинга роадмапа здесь не требуется, и это надо проверить, а не предположить.** `RoadmapRepository.createVersion` (`roadmap.repository.ts:102`) и `createCheckpoint` (`:218`) уже принимают `tx`, сами требуют `Roadmap ≥ write` (`:108`, `:225`), сами берут замок проекта (`:109`, `:226`) и сами отвергают `releasedDate` при платформах (`:110`); `AuditService.record` тоже принимает `tx` (`audit.service.ts:20`). Свою `db.transaction` открывают только сервисы (`roadmap.service.ts:137`, `:200`) — и именно поэтому зовём репозитории, а не их. **Ни один существующий файл роадмапа в этой задаче не меняется.**

- [ ] **Step 1: Написать падающий тест**

```ts
describe('формирование релиза', () => {
  it('из задач получается версия с чекпоинтами в том же порядке', async () => {
    const result = await service.release(writer, projectId, summaryId, { label: 'v1.3' });

    const checkpoints = await testDb.rowsOf(roadmapCheckpoints);

    expect(result).toEqual({ versionId: expect.any(String), label: 'v1.3', checkpointCount: 3 });
    expect(checkpoints.map((row) => [row.position, row.title])).toEqual([
      [1, 'раз'],
      [2, 'два'],
      [3, 'три'],
    ]);
  });

  it('у чекпоинтов нет ни адреса, ни тегов платформ', async () => {
    // Их в черновике нет и быть не может: придуманный моделью тег
    // поставил бы в роадмап заявление, которого никто не делал.
    await service.release(writer, projectId, summaryId, { label: 'v1.3' });

    expect((await testDb.rowsOf(roadmapCheckpoints)).every((row) => row.url === null)).toBe(true);
    expect(await testDb.rowsOf(checkpointPlatforms)).toHaveLength(0);
  });

  it('саммари помнит, куда уехало', async () => {
    const result = await service.release(writer, projectId, summaryId, { label: 'v1.3' });

    const [row] = await testDb.rowsOf(summaries);

    expect(row?.releasedVersionId).toBe(result.versionId);
  });

  it('журнал содержит и записи роадмапа, и запись саммари', async () => {
    // Журнал не должен становиться местом, где чекпоинты появляются
    // без записи.
    await service.release(writer, projectId, summaryId, { label: 'v1.3' });

    expect(await auditActions()).toEqual([
      AuditAction.RoadmapVersionCreated,
      AuditAction.CheckpointCreated,
      AuditAction.CheckpointCreated,
      AuditAction.CheckpointCreated,
      AuditAction.SummaryReleased,
    ]);
  });

  it('запись релиза называет, сколько задач предложила машина', async () => {
    await service.release(writer, projectId, summaryId, { label: 'v1.3' });

    const [record] = await auditRecords(AuditAction.SummaryReleased);

    expect(record?.metadata).toEqual({ label: 'v1.3', tasks: 3, fromModel: 2 });
  });

  it('повторный вызов отвергается', async () => {
    await service.release(writer, projectId, summaryId, { label: 'v1.3' });

    await expect(
      service.release(writer, projectId, summaryId, { label: 'v1.4' }),
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: SUMMARY_ALREADY_RELEASED }),
    });
  });

  it('пустой черновик формировать не из чего', async () => {
    await service.replaceTasks(writer, projectId, summaryId, { tasks: [] });

    await expect(
      service.release(writer, projectId, summaryId, { label: 'v1.3' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: SUMMARY_TASKS_EMPTY }),
    });
  });

  it('отказ на втором чекпоинте не оставляет ни версии, ни первого', async () => {
    // Одна транзакция на весь шаг: половины релиза не бывает.
    failOnCheckpoint(2);

    await expect(service.release(writer, projectId, summaryId, { label: 'v1.3' })).rejects.toThrow();

    expect(await testDb.rowsOf(roadmapVersions)).toHaveLength(0);
    expect(await testDb.rowsOf(roadmapCheckpoints)).toHaveLength(0);
    expect(await auditRecords(AuditAction.SummaryReleased)).toHaveLength(0);
  });

  it('без выдачи на роадмап — 404', async () => {
    // Отказ приходит из RoadmapRepository: своей проверки права не
    // добавляется.
    await expect(
      service.release(chronicleOnlyWriter, projectId, summaryId, { label: 'v1.3' }),
    ).rejects.toThrow(SectionNotVisibleError);
  });

  it('при уровне ниже записи — 403', async () => {
    await expect(
      service.release(roadmapReader, projectId, summaryId, { label: 'v1.3' }),
    ).rejects.toThrow(InsufficientLevelError);
  });

  it('занятое обозначение версии — 409 из роадмапа', async () => {
    await expect(
      service.release(writer, projectId, summaryId, { label: EXISTING_LABEL }),
    ).rejects.toThrow(ConflictException);
  });

  it('присланный releasedDate у проекта с платформой — 409 из роадмапа', async () => {
    // Интерфейс его не отправляет никогда, но контракт открыт: отказ
    // приходит оттуда, откуда его получают все.
    await seedPlatform(projectId);

    await expect(
      service.release(writer, projectId, summaryId, { label: 'v1.3', releasedDate: null }),
    ).rejects.toThrow(ConflictException);
  });

  it('устаревший текст релиз не блокирует', async () => {
    // Предупреждение, а не условие: судит человек, он видит и текст,
    // и задачи.
    await makeTextStale(summaryId);

    await expect(
      service.release(writer, projectId, summaryId, { label: 'v1.3' }),
    ).resolves.toBeDefined();
  });

  it('два одновременных вызова дают одну версию', async () => {
    // Строка саммари блокируется SELECT … FOR NO KEY UPDATE.
    const [first, second] = await Promise.allSettled([
      service.release(writer, projectId, summaryId, { label: 'v1.3' }),
      service.release(writer, projectId, summaryId, { label: 'v1.4' }),
    ]);

    expect([first.status, second.status].sort()).toEqual(['fulfilled', 'rejected']);
    expect(await testDb.rowsOf(roadmapVersions)).toHaveLength(1);
  });
});
```

Точные имена существующих действий журнала роадмапа взять из `apps/api/src/audit/audit.types.ts`.

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries/summaries.service.test.ts`
Expected: FAIL — метода `release` нет

- [ ] **Step 3: Написать шаг**

`SummariesService.release(subject, projectId, summaryId, body)` — **одна** `db.transaction`:

```ts
return this.db.transaction(async (tx) => {
  // Строка саммари блокируется отдельно от замка проекта: два
  // одновременных «сформировать релиз» не должны создать две версии.
  // Этого достаточно — кнопку нажимает человек, а не очередь.
  const summary = await this.repository.lockForRelease(subject, tx, projectId, summaryId);

  if (summary.releasedVersionId) {
    throw releaseConflict(SUMMARY_ALREADY_RELEASED);
  }

  const tasks = await this.repository.tasksOf(tx, summaryId);

  if (tasks.length === 0) {
    throw releaseConflict(SUMMARY_TASKS_EMPTY);
  }

  // Репозитории роадмапа, а не RoadmapService: сервисы открывают свою
  // транзакцию на каждый вызов (roadmap.service.ts:137, :200), и это
  // дало бы вложенный savepoint на каждый чекпоинт. Право и замок
  // проекта берёт сам репозиторий (roadmap.repository.ts:108-109).
  const version = await this.roadmap.createVersion(subject, tx, projectId, body);

  await this.audit.record(tx, actorOf(subject), {
    action: AuditAction.RoadmapVersionCreated,
    /* те же поля, что пишет RoadmapService при ручном создании */
  });

  for (const task of tasks) {
    const checkpoint = await this.roadmap.createCheckpoint(subject, tx, projectId, version.id, {
      title: task.title,
    });

    await this.audit.record(tx, actorOf(subject), { action: AuditAction.CheckpointCreated /* … */ });
  }

  await this.repository.markReleased(tx, summaryId, version.id);
  await this.audit.record(tx, actorOf(subject), {
    action: AuditAction.SummaryReleased,
    entityType: 'summary',
    entityId: summaryId,
    projectId,
    metadata: {
      label: version.label,
      tasks: tasks.length,
      fromModel: tasks.filter((task) => task.origin === SummaryTaskOrigin.Model).length,
    },
  });

  return { versionId: version.id, label: version.label, checkpointCount: tasks.length };
});
```

Поля записей `roadmap_version.created` и `checkpoint.created` взять **буквально** из `RoadmapService` (`roadmap.service.ts:137-230`): журнал обязан описывать то же событие теми же словами, иначе ручное и автоматическое создание в журнале разойдутся.

`lockForRelease` в репозитории — `requireForWrite` плюс `SELECT … FOR NO KEY UPDATE` по `summaries.id`.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/summaries src/roadmap`
Expected: PASS — и новые проверки, и все прежние тесты роадмапа без единой правки в нём

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/summaries
git commit -m "Формировать релиз из черновика задач одной транзакцией"
```

### Task 17: Контроллеры, модуль и коды ответов

**Files:**
- Create: `apps/api/src/summaries/summaries.controller.ts`
- Create: `apps/api/src/summaries/summaries.controller.test.ts`
- Create: `apps/api/src/summaries/summaries-overview.controller.ts`
- Create: `apps/api/src/summaries/summaries-overview.controller.test.ts`
- Modify: `apps/api/src/summaries/summaries.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
describe('ручки саммари проекта', () => {
  it('создание отвечает 201 и деталью', async () => {
    await request(app).post(`/projects/${projectId}/summaries`).send(CREATE_BODY).expect(201);
  });

  it('лишнее поле в теле — 400', async () => {
    await request(app)
      .post(`/projects/${projectId}/summaries`)
      .send({ ...CREATE_BODY, projectId })
      .expect(400);
  });

  it('без выдачи на хронику — 404, а не 403', async () => {
    // 403 сообщил бы, что проект существует.
    await asOutsider().get(`/projects/${projectId}/summaries`).expect(404);
  });

  it('при уровне чтения — 403', async () => {
    await asReader().post(`/projects/${projectId}/summaries`).send(CREATE_BODY).expect(403);
  });

  it('саммари чужого проекта — 404', async () => {
    await asWriter().get(`/projects/${otherProjectId}/summaries/${summaryId}`).expect(404);
  });

  it('удаление отвечает 204 без тела', async () => {
    await asWriter().delete(`/projects/${projectId}/summaries/${summaryId}`).expect(204, '');
  });

  it('недоступность предложителя — 502, а не 503', async () => {
    // Не отвечает вышестоящий узел, а наш сервис жив.
    await asWriter().post(`/projects/${projectId}/summaries/${summaryId}/tasks/suggest`).expect(502);
  });

  it('ручки правки текста у саммари нет', async () => {
    // Текст — запись хроники, и правится её собственной ручкой:
    // вторая завела бы вторую проверку права и второе журналирование
    // над одной строкой.
    await asWriter().patch(`/projects/${projectId}/summaries/${summaryId}/text`).send({}).expect(404);
  });

  it('негодный UUID — 400', async () => {
    await asWriter().get(`/projects/${projectId}/summaries/не-uuid`).expect(400);
  });
});

describe('сводные ручки', () => {
  it('история показывает только проекты, куда можно писать хронику', async () => {
    const { body } = await asPartialWriter().get('/summaries').expect(200);

    expect(body.map((item: { projectId: string }) => item.projectId)).toEqual([writableProjectId]);
  });

  it('без ни одного такого проекта — пустой список, а не 404', async () => {
    // Пустой список ничего не раскрывает и законен.
    await asOutsider().get('/summaries').expect(200, []);
  });

  it('цели выбора — те же проекты', async () => {
    const { body } = await asPartialWriter().get('/summaries/projects').expect(200);

    expect(body).toHaveLength(1);
  });

  it('настройки предложителя доступны любому вошедшему', async () => {
    await asOutsider().get('/summaries/suggester').expect(200);
  });

  it('в настройках нет ни ключа, ни полного адреса', async () => {
    // Секреты не в списочных ответах.
    const { body } = await asWriter().get('/summaries/suggester').expect(200);

    expect(JSON.stringify(body)).not.toContain(API_KEY);
    expect(body).not.toHaveProperty('baseUrl');
    expect(body.host).toBe('llm.internal');
  });

  it('без сессии — 401', async () => {
    await request(app).get('/summaries').expect(401);
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries`
Expected: FAIL — контроллеров нет

- [ ] **Step 3: Написать контроллеры и зарегистрировать модуль**

`SummariesController` — маршрут `projects/:projectId/summaries`, `@UseGuards(SessionGuard)`, **guard'а уровня нет**: уровень проверяет репозиторий, и дублирующая проверка в HTTP-слое разошлась бы с ним (как `chronicle.controller.ts:28-33`). `ParseUUIDPipe` на параметры, `ZodValidationPipe` на тела. Семь ручек по таблице раздела 4.2 дизайна; тело шага релиза валидируется **существующей** `roadmapVersionCreateSchema` — вторая схема для обычной версии рано или поздно разошлась бы с первой.

`SummariesOverviewController` — маршрут `summaries`, три ручки по таблице 4.1; образец «взгляда с другой стороны» — `grants/user-grants.controller.ts`.

`summaries.module.ts` — репозиторий, сервис, два контроллера, провайдер `TASK_SUGGESTER`; импорты `ChronicleModule` и `RoadmapModule` (экспортируемые из них репозитории проверить и при необходимости добавить в `exports`). `SummariesModule` — в `apps/api/src/app.module.ts`.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/summaries`
Expected: PASS

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/summaries apps/api/src/app.module.ts
git commit -m "Открыть ручки саммари"
```

---

## Чанк 5: Веб

### Task 18: Вкладка и подпись источника

**Files:**
- Modify: `apps/web/src/components/AppNav/constants.ts`
- Modify: `apps/web/src/components/AppNav/AppNav.test.tsx`
- Modify: `apps/web/src/components/ChronicleEntry/constants.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
it('вкладка «Саммари» видна обычному пользователю', () => {
  // Поток нужен не администратору, а тому, кто ведёт проект: пункт
  // живёт в COMMON_LINKS. Прятать его по выдачам значило бы считать
  // права при отрисовке навигации, а пустой экран ничего не раскрывает.
  render(<AppNav subject={plainUser()} />);

  expect(screen.getByRole('link', { name: 'Саммари' })).toHaveAttribute('href', '/summaries');
});

it('в пунктах суперадмина её нет', () => {
  render(<AppNav subject={superadmin()} />);

  expect(screen.getAllByRole('link', { name: 'Саммари' })).toHaveLength(1);
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/web && npx vitest run src/components/AppNav`
Expected: FAIL — ссылки нет

- [ ] **Step 3: Дописать пункт и подпись источника**

`COMMON_LINKS` получает второй элемент `{ href: '/summaries', label: 'Саммари' }`. В `ChronicleEntry/constants.ts` — русская подпись третьего источника: «Саммари созвона».

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/web && npx vitest run src/components/AppNav src/components/ChronicleEntry`
Expected: PASS

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/AppNav apps/web/src/components/ChronicleEntry
git commit -m "Завести вкладку «Саммари»"
```

### Task 19: Хуки запросов и мутаций

**Files:**
- Create: `apps/web/src/api/hooks/useQuerySummaries.ts`
- Create: `apps/web/src/api/hooks/useMutationSummary.ts`
- Create: `apps/web/src/api/hooks/useMutationSummary.test.tsx`
- Modify: `apps/web/src/api/hooks/index.ts`

- [ ] **Step 1: Написать падающий тест**

По образцу `useMutationChronicleEntry.test.tsx`:

```ts
it('сохранение черновика посылает только формулировки и порядок', async () => {
  // Позиции сервер нумерует сам по порядку массива.
  const { result } = renderHookWithClient(() => useMutationSaveSummaryTasks(projectId, summaryId));

  await act(() => result.current.mutateAsync({ tasks: [{ title: 'раз' }, { id: ID, title: 'два' }] }));

  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining(`/projects/${projectId}/summaries/${summaryId}/tasks`),
    expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ tasks: [{ title: 'раз' }, { id: ID, title: 'два' }] }),
    }),
  );
});

it('формирование релиза не посылает дату релиза', async () => {
  // Её нет в форме ни при каких платформах, и `releasedDate` не уходит
  // даже как null.
  const { result } = renderHookWithClient(() => useMutationReleaseSummary(projectId, summaryId));

  await act(() => result.current.mutateAsync({ label: 'v1.3', state: 'planned', plannedDate: '2026-12-01' }));

  const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);

  expect(body).not.toHaveProperty('releasedDate');
});

it('успешный релиз сбрасывает кэши саммари, хроники и роадмапа', async () => {
  const { result, queryClient } = renderHookWithClient(() =>
    useMutationReleaseSummary(projectId, summaryId),
  );
  const spy = vi.spyOn(queryClient, 'invalidateQueries');

  await act(() => result.current.mutateAsync(RELEASE_BODY));

  expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['summaries'] }));
  expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['roadmap', projectId] }));
});
```

Точные ключи кэша и способ обёртки хука взять из соседних хуков — расходиться нельзя.

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/web && npx vitest run src/api/hooks/useMutationSummary.test.tsx`
Expected: FAIL — модуля нет

- [ ] **Step 3: Написать хуки**

`useQuerySummaries` — список (`/summaries`), цели (`/summaries/projects`), деталь (`/projects/:id/summaries/:id`), настройки порта (`/summaries/suggester`). `useMutationSummary` — создание, разбивка, сохранение черновика, релиз, удаление; разбор `code` из тела отказа для сообщений экрана. Реэкспорт в `index.ts`.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/web && npx vitest run src/api/hooks/useMutationSummary.test.tsx`
Expected: PASS

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/api/hooks
git commit -m "Завести хуки саммари"
```

### Task 20: Форма создания и чтение текстового файла

**Files:**
- Create: `apps/web/src/components/SummaryForm/SummaryForm.tsx`
- Create: `apps/web/src/components/SummaryForm/types.ts`
- Create: `apps/web/src/components/SummaryForm/constants.ts`
- Create: `apps/web/src/components/SummaryForm/readTextFile.ts`
- Create: `apps/web/src/components/SummaryForm/readTextFile.test.ts`
- Create: `apps/web/src/components/SummaryForm/index.ts`
- Create: `apps/web/src/components/SummaryForm/SummaryForm.test.tsx`

- [ ] **Step 1: Написать падающий тест**

```ts
describe('чтение текстового файла', () => {
  it('читает UTF-8', async () => {
    expect(await readTextFile(fileWith('обсудили сроки', 'notes.txt'))).toBe('обсудили сроки');
  });

  it('размер проверяется до чтения', async () => {
    // Читать двести мегабайт, чтобы потом отказать по длине, незачем.
    const read = vi.spyOn(File.prototype, 'arrayBuffer');

    await expect(readTextFile(hugeFile('notes.txt'))).rejects.toThrow(/больше/);
    expect(read).not.toHaveBeenCalled();
  });

  it('негодная кодировка просит сохранить в UTF-8', async () => {
    // Иначе человек отправит наружу кракозябры, не заметив.
    await expect(readTextFile(cp1251File('notes.txt'))).rejects.toThrow(/UTF-8/);
  });

  it('чужое расширение не принимается', async () => {
    await expect(readTextFile(fileWith('данные', 'notes.pdf'))).rejects.toThrow();
  });

  it('MIME доказательством содержимого не считается', async () => {
    // Его ставит система по тому же расширению, и подделать его ничего
    // не стоит: решает расширение плюс успешное декодирование.
    const file = new File(['текст'], 'notes.bin', { type: 'text/plain' });

    await expect(readTextFile(file)).rejects.toThrow();
  });

  it('нормализует прочитанное той же функцией, что сервер', async () => {
    expect(await readTextFile(fileWith('﻿раз\r\nдва', 'notes.md'))).toBe('раз\nдва');
  });

  it('управляющие символы в файле — отказ', async () => {
    await expect(readTextFile(fileWith('раз\u0000два', 'notes.txt'))).rejects.toThrow();
  });
});

describe('форма создания саммари', () => {
  it('без выбранного проекта отправка выключена', () => {
    render(<SummaryForm projects={[]} />);

    expect(screen.getByRole('button', { name: /Создать/ })).toBeDisabled();
  });

  it('пустой список проектов объясняет, почему', () => {
    // Прятать вкладку значило бы считать выдачи при отрисовке навигации.
    render(<SummaryForm projects={[]} />);

    expect(screen.getByText(/писать хронику/)).toBeInTheDocument();
  });

  it('загруженный файл кладёт содержимое в правимое поле', async () => {
    // Человек видит и может поправить то, что отправляет.
    render(<SummaryForm projects={[PROJECT]} />);

    await userEvent.upload(screen.getByLabelText(/Загрузить файл/), fileWith('текст', 'n.txt'));

    expect(screen.getByLabelText(/Текст/)).toHaveValue('текст');
  });

  it('непустое поле заменяется файлом только после подтверждения', async () => {
    render(<SummaryForm projects={[PROJECT]} />);
    await userEvent.type(screen.getByLabelText(/Текст/), 'моё');

    await userEvent.upload(screen.getByLabelText(/Загрузить файл/), fileWith('чужое', 'n.txt'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/Текст/)).toHaveValue('моё');
  });

  it('имя файла нигде не показывается и не уходит', async () => {
    // Имена файлов на машинах людей нередко говорят больше содержимого.
    const onSubmit = vi.fn();
    render(<SummaryForm projects={[PROJECT]} onSubmit={onSubmit} />);

    await userEvent.upload(screen.getByLabelText(/Загрузить файл/), fileWith('текст', 'секретный-проект.txt'));
    await userEvent.click(screen.getByRole('button', { name: /Создать/ }));

    expect(JSON.stringify(onSubmit.mock.calls)).not.toContain('секретный-проект');
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/web && npx vitest run src/components/SummaryForm`
Expected: FAIL — компонента и утилиты нет

- [ ] **Step 3: Написать утилиту и форму**

`readTextFile.ts` — порядок проверок обязателен: размер → расширение (`.txt`, `.md`) → `new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())` → `normalizeSummaryText` из контракта. Сообщения отказов — в `constants.ts`.

`SummaryForm.tsx` — общий `Select` для проекта (из `GET /summaries/projects`), дата с умолчанием «сегодня» (как у `VersionFields`), заголовок, текст, кнопка загрузки файла и `ConfirmDialog` на замену непустого поля. Пустой список проектов — вместо формы объяснение.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/web && npx vitest run src/components/SummaryForm`
Expected: PASS, 13 тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/SummaryForm
git commit -m "Завести форму создания саммари с чтением текстового файла"
```

### Task 21: Редактор черновика

**Files:**
- Create: `apps/web/src/components/SummaryTaskEditor/SummaryTaskEditor.tsx`
- Create: `apps/web/src/components/SummaryTaskEditor/types.ts`
- Create: `apps/web/src/components/SummaryTaskEditor/constants.ts`
- Create: `apps/web/src/components/SummaryTaskEditor/index.ts`
- Create: `apps/web/src/components/SummaryTaskEditor/SummaryTaskEditor.test.tsx`

- [ ] **Step 1: Написать падающий тест**

```ts
describe('редактор черновика задач', () => {
  it('«вниз» меняет порядок двух строк', async () => {
    render(<SummaryTaskEditor tasks={[TASK_A, TASK_B]} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Ниже' })[0]!);

    expect(titles()).toEqual(['два', 'раз']);
  });

  it('перетаскивания нет: порядок меняется кнопками', () => {
    // Библиотеки DnD в проекте нет, а кнопки доступны с клавиатуры и
    // читалкой, в отличие от перетаскивания.
    render(<SummaryTaskEditor tasks={[TASK_A, TASK_B]} />);

    expect(screen.getAllByRole('button', { name: 'Выше' })).toHaveLength(2);
  });

  it('«Удалить» убирает строку', async () => {
    render(<SummaryTaskEditor tasks={[TASK_A, TASK_B]} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Удалить' })[0]!);

    expect(titles()).toEqual(['два']);
  });

  it('«Добавить задачу» добавляет пустую строку и ставит на неё фокус', async () => {
    // Работает и при выключенном предложителе: список можно набрать
    // руками целиком.
    render(<SummaryTaskEditor tasks={[]} />);

    await userEvent.click(screen.getByRole('button', { name: /Добавить задачу/ }));

    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByRole('textbox')).toHaveFocus();
  });

  it('до правки «Сохранить» выключена, после — доступна', async () => {
    // isDirty считается сравнением с загруженным набором — как у панели
    // версии.
    render(<SummaryTaskEditor tasks={[TASK_A]} />);

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();

    await userEvent.type(screen.getByRole('textbox'), ' ещё');

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled();
  });

  it('строка от модели помечена', () => {
    // Инвариант ТЗ 5.3: человек обязан видеть, что пришло от машины.
    render(<SummaryTaskEditor tasks={[{ ...TASK_A, origin: SummaryTaskOrigin.Model }]} />);

    expect(screen.getByText(/предложено моделью/)).toBeInTheDocument();
  });

  it('строка, набранная человеком, метки не несёт', () => {
    render(<SummaryTaskEditor tasks={[{ ...TASK_A, origin: SummaryTaskOrigin.Human }]} />);

    expect(screen.queryByText(/предложено моделью/)).not.toBeInTheDocument();
  });

  it('после сформированного релиза редактор только для чтения', () => {
    // Чекпоинты живут в роадмапе и правятся там.
    render(<SummaryTaskEditor tasks={[TASK_A]} isReleased />);

    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Удалить' })).not.toBeInTheDocument();
  });

  it('пустая формулировка сохраняться не даёт', async () => {
    render(<SummaryTaskEditor tasks={[TASK_A]} />);
    await userEvent.clear(screen.getByRole('textbox'));

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/web && npx vitest run src/components/SummaryTaskEditor`
Expected: FAIL — компонента нет

- [ ] **Step 3: Написать компонент**

Состояние черновика — в `useState` с `isDirty` по сравнению с пропом; кнопка «Сохранить» в прилипшей шапке, как у панели версии; все тексты — в `constants.ts`. Компонент чистый: `navigator`, запросы и подтверждения — на экране-контейнере.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/web && npx vitest run src/components/SummaryTaskEditor`
Expected: PASS, 9 тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/SummaryTaskEditor
git commit -m "Завести редактор черновика задач"
```

### Task 22: Экраны списка и саммари

**Files:**
- Create: `apps/web/src/app/(app)/summaries/page.tsx`
- Create: `apps/web/src/app/(app)/summaries/SummariesScreen.tsx`
- Create: `apps/web/src/app/(app)/summaries/SummariesScreen.test.tsx`
- Create: `apps/web/src/app/(app)/summaries/[id]/page.tsx`
- Create: `apps/web/src/app/(app)/summaries/[id]/SummaryScreen.tsx`
- Create: `apps/web/src/app/(app)/summaries/[id]/SummaryScreen.test.tsx`
- Create: `apps/web/src/components/SummaryList/` (компонент, типы, тексты, индекс, тест)
- Create: `apps/web/src/components/SummaryText/` (то же)

Страницы — в группе `(app)`, чтобы сработали проверка сессии и привязки второго фактора из `(app)/layout.tsx`.

- [ ] **Step 1: Написать падающий тест**

```ts
describe('история саммари', () => {
  it('состояние вычисляется из содержимого', () => {
    // Хранимой стадии нет: она разошлась бы с содержимым.
    render(<SummaryList items={[TEXT_ONLY, WITH_TASKS, RELEASED]} />);

    expect(screen.getByText('Текст')).toBeInTheDocument();
    expect(screen.getByText('Задачи: 12')).toBeInTheDocument();
    expect(screen.getByText('Ушло в v1.4')).toBeInTheDocument();
  });

  it('скрытое обозначение версии не читается как «не сформирован»', () => {
    // isReleased — состояние потока, обозначение — данные роадмапа.
    render(<SummaryList items={[{ ...RELEASED, releasedVersionLabel: null }]} />);

    expect(screen.getByText('Ушло в роадмап')).toBeInTheDocument();
  });

  it('«Ушло в v1.4» ведёт на открытую версию роадмапа', () => {
    render(<SummaryList items={[RELEASED]} />);

    expect(screen.getByRole('link', { name: 'Ушло в v1.4' })).toHaveAttribute(
      'href',
      `/projects/${RELEASED.projectId}/roadmap?version=${RELEASED.releasedVersionId}`,
    );
  });
});

describe('экран саммари', () => {
  it('подпись о передаче видна до нажатия кнопки', () => {
    // Постоянная, не всплывающая: она говорит правду до нажатия и
    // заменяет диалог подтверждения на каждый вызов.
    render(<SummaryScreen summary={TEXT_ONLY} suggester={EXTERNAL_SUGGESTER} />);

    expect(screen.getByText(/api\.openai\.com/)).toBeInTheDocument();
    expect(screen.getByText(/gpt-4o-mini/)).toBeInTheDocument();
  });

  it('локальный предложитель говорит про контур', () => {
    render(<SummaryScreen summary={TEXT_ONLY} suggester={LOCAL_SUGGESTER} />);

    expect(screen.getByText(/в вашем контуре/)).toBeInTheDocument();
  });

  it('выключенный предложитель объясняет, а не предлагает повтор', () => {
    render(<SummaryScreen summary={TEXT_ONLY} suggester={DISABLED_SUGGESTER} />);

    expect(screen.getByRole('button', { name: /Создать задачи/ })).toBeDisabled();
    expect(screen.getByText(/не настроена/)).toBeInTheDocument();
  });

  it('повторная разбивка непустого черновика спрашивает подтверждение', async () => {
    // Заменять правленный список молча нельзя.
    render(<SummaryScreen summary={WITH_TASKS} suggester={LOCAL_SUGGESTER} />);

    await userEvent.click(screen.getByRole('button', { name: /Создать задачи/ }));

    expect(screen.getByText(/будет заменён/)).toBeInTheDocument();
  });

  it('отказ разбивки объясняет по коду и не очищает список', async () => {
    render(<SummaryScreen summary={WITH_TASKS} suggester={failing(SUGGESTER_UNAVAILABLE)} />);

    await suggest();

    expect(screen.getByText(/не ответила/)).toBeInTheDocument();
    expect(screen.getAllByRole('textbox')).toHaveLength(WITH_TASKS.tasks.length);
  });

  it('предел объёма называет настоящее число', async () => {
    render(<SummaryScreen summary={LONG_TEXT} suggester={{ ...LOCAL_SUGGESTER, maxChars: 40_000 }} />);

    await suggest();

    expect(screen.getByText(/40 000/)).toBeInTheDocument();
  });

  it('устаревший текст предупреждает, но релиз не блокирует', () => {
    // Судит человек: он видит и текст, и задачи.
    render(<SummaryScreen summary={{ ...WITH_TASKS, isTextStale: true }} suggester={LOCAL_SUGGESTER} />);

    expect(screen.getByText(/задачи могли устареть/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Сформировать релиз/ })).toBeEnabled();
  });

  it('без права на роадмап кнопка релиза выключена с объяснением', () => {
    render(<SummaryScreen summary={WITH_TASKS} canRelease={false} suggester={LOCAL_SUGGESTER} />);

    expect(screen.getByRole('button', { name: /Сформировать релиз/ })).toBeDisabled();
    expect(screen.getByText(/Нет права на «Роадмап»/)).toBeInTheDocument();
  });

  it('после релиза шаги 2 и 3 исчезают, остаётся ссылка на версию', () => {
    render(<SummaryScreen summary={RELEASED_DETAIL} suggester={LOCAL_SUGGESTER} />);

    expect(screen.queryByRole('button', { name: /Создать задачи/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Сформировать релиз/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /v1\.4/ })).toBeInTheDocument();
  });

  it('формулировки выводятся текстом, а не разметкой', () => {
    // Вывод модели недоверен: никакого Markdown и
    // dangerouslySetInnerHTML.
    render(<SummaryScreen summary={withTask('<b>жирно</b>')} suggester={LOCAL_SUGGESTER} />);

    expect(screen.getByDisplayValue('<b>жирно</b>')).toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/web && npx vitest run "src/app/(app)/summaries" src/components/SummaryList`
Expected: FAIL — экранов нет

- [ ] **Step 3: Написать экраны**

`SummariesScreen` — кнопка «Новое саммари» (открывает `Drawer` с `SummaryForm`) и `SummaryList`. `SummaryScreen` — три блока по шагам потока (раздел 7.3 дизайна): текст с копированием и правкой через существующую мутацию записи хроники, редактор черновика с подписью о передаче и предупреждением об устаревшем тексте, кнопка релиза. Уход со страницы с несохранённым черновиком — существующий `ConfirmDialog`. Все тексты и сообщения по кодам отказов — в `constants.ts`.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/web && npx vitest run "src/app/(app)/summaries" src/components/SummaryList src/components/SummaryText`
Expected: PASS

- [ ] **Step 5: Коммит**

```bash
git add "apps/web/src/app/(app)/summaries" apps/web/src/components/SummaryList apps/web/src/components/SummaryText
git commit -m "Завести экраны саммари"
```

### Task 23: Форма релиза

**Files:**
- Create: `apps/web/src/components/SummaryReleaseForm/SummaryReleaseForm.tsx`
- Create: `apps/web/src/components/SummaryReleaseForm/types.ts`
- Create: `apps/web/src/components/SummaryReleaseForm/constants.ts`
- Create: `apps/web/src/components/SummaryReleaseForm/index.ts`
- Create: `apps/web/src/components/SummaryReleaseForm/SummaryReleaseForm.test.tsx`
- Modify: `apps/web/src/components/VersionFields/index.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
describe('форма релиза из саммари', () => {
  it('обозначение предзаполнено подсказкой', () => {
    render(<SummaryReleaseForm suggestedLabel="v1.3" taskCount={3} />);

    expect(screen.getByLabelText(/Обозначение/)).toHaveValue('v1.3');
  });

  it('без подсказки поле пусто и отправка выключена', () => {
    // Подсказки нет, когда версий нет, в обозначениях нет цифр или у
    // субъекта нет выдачи на роадмап.
    render(<SummaryReleaseForm suggestedLabel={null} taskCount={3} />);

    expect(screen.getByLabelText(/Обозначение/)).toHaveValue('');
    expect(screen.getByRole('button', { name: /Сформировать/ })).toBeDisabled();
  });

  it('введённое обозначение разблокирует отправку', async () => {
    render(<SummaryReleaseForm suggestedLabel={null} taskCount={3} />);

    await userEvent.type(screen.getByLabelText(/Обозначение/), 'Осень');

    expect(screen.getByRole('button', { name: /Сформировать/ })).toBeEnabled();
  });

  it('поля «Дата релиза» нет', () => {
    // Версия из созвона — работа впереди. А главное: чтобы узнать, есть
    // ли у проекта платформы, нужен уровень на «Инфо», которого у
    // субъекта этого потока может не быть вовсе.
    render(<SummaryReleaseForm suggestedLabel="v1.3" taskCount={3} />);

    expect(screen.queryByLabelText(/Дата релиза/)).not.toBeInTheDocument();
  });

  it('платформы проекта форма не запрашивает', () => {
    // Признак hasPlatforms потоку не нужен, и скрытого третьего
    // требования `Info ≥ metadata` у двух заявленных прав не появляется.
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<SummaryReleaseForm suggestedLabel="v1.3" taskCount={3} />);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('отправляет только обозначение, состояние и плановую дату', async () => {
    const onSubmit = vi.fn();
    render(<SummaryReleaseForm suggestedLabel="v1.3" taskCount={3} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: /Сформировать/ }));

    expect(onSubmit).toHaveBeenCalledWith({
      label: 'v1.3',
      state: RoadmapVersionState.Planned,
      plannedDate: expect.any(String),
    });
  });

  it('говорит, сколько незакрытых чекпоинтов будет создано', () => {
    render(<SummaryReleaseForm suggestedLabel="v1.3" taskCount={3} />);

    expect(screen.getByText(/3 незакрытыми чекпоинтами/)).toBeInTheDocument();
  });

  it('при опубликованном роадмапе предупреждает о публичной выдаче', () => {
    render(<SummaryReleaseForm suggestedLabel="v1.3" taskCount={3} isRoadmapPublic />);

    expect(screen.getByText(/публичную выдачу/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/web && npx vitest run src/components/SummaryReleaseForm`
Expected: FAIL — компонента нет

- [ ] **Step 3: Написать форму**

Свой компонент, а не `VersionFields`: набор полей здесь намеренно уже, и переиспользовать `VersionFields` пришлось бы соврав его пропу `hasPlatforms`. Внутренние `StateField` и `DateField` переиспользуются как есть — добавить их в `apps/web/src/components/VersionFields/index.ts` (сейчас экспортируется только `VersionFields`).

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/web && npx vitest run src/components/SummaryReleaseForm src/components/VersionFields`
Expected: PASS, включая прежние тесты `VersionFields`

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/SummaryReleaseForm apps/web/src/components/VersionFields
git commit -m "Завести форму релиза из саммари"
```

### Task 24: Названия действий в журнале

**Files:**
- Modify: `apps/web/src/components/AuditTable/constants.ts`

Сторож `AuditTable/constants.test.ts` вычитывает перечень `AuditAction` из исходника API регекспом (`constants.test.ts:17-32`) и падает на действии без названия. Пять новых значений появились в задаче 15 — значит сторож уже красный.

- [ ] **Step 1: Прогнать сторож и убедиться, что падает**

Run: `cd apps/web && npx vitest run src/components/AuditTable`
Expected: FAIL — у пяти действий нет русских названий

- [ ] **Step 2: Дописать названия**

В `ACTION_LABELS`, рядом с действиями хроники:

```ts
  'summary.created': 'Создано саммари',
  'summary.tasks_suggested': 'Запрошена разбивка саммари на задачи',
  'summary.tasks_suggestion_failed': 'Разбивка саммари не удалась',
  'summary.released': 'Из саммари сформирован релиз',
  'summary.deleted': 'Удалено саммари',
```

Формулировки без подробностей — метаданные на экране журнала не показываются ни у одного действия, поэтому название отвечает только на вопрос «что произошло», а «над чем» читается из колонки объекта (TSDoc над `ACTION_LABELS`).

- [ ] **Step 3: Прогнать — должно пройти**

Run: `cd apps/web && npx vitest run src/components/AuditTable`
Expected: PASS

- [ ] **Step 4: Коммит**

```bash
git add apps/web/src/components/AuditTable
git commit -m "Назвать новые действия журнала по-русски"
```

---

## Чанк 6: Развёртывание, документация, проверка

### Task 25: Переменные окружения и документация

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Дописать переменные в три места**

Все семь переменных — в `.env.example`, в `docker-compose.yml` (блок `api.environment`) и в README. **Все до одной:** пропущенная в compose переменная уже стоила проекту дефекта с интервалом проверок, и комментарий об этом висит в `docker-compose.yml:40-45`.

В `docker-compose.yml`, своим блоком с комментарием:

```yaml
      # Разбивка саммари на задачи. Без ключа при `external` порт
      # выключен: на свежей установке текст наружу не уходит до того,
      # как ключ впишут руками.
      CAIRN_TASK_SUGGESTER: ${CAIRN_TASK_SUGGESTER:-external}
      CAIRN_TASK_SUGGESTER_BASE_URL: ${CAIRN_TASK_SUGGESTER_BASE_URL:-}
      CAIRN_TASK_SUGGESTER_API_KEY: ${CAIRN_TASK_SUGGESTER_API_KEY:-}
      CAIRN_TASK_SUGGESTER_MODEL: ${CAIRN_TASK_SUGGESTER_MODEL:-gpt-4o-mini}
      CAIRN_TASK_SUGGESTER_TIMEOUT_SECONDS: ${CAIRN_TASK_SUGGESTER_TIMEOUT_SECONDS:-60}
      CAIRN_TASK_SUGGESTER_MAX_CHARS: ${CAIRN_TASK_SUGGESTER_MAX_CHARS:-40000}
      CAIRN_TASK_SUGGESTER_MAX_TASKS: ${CAIRN_TASK_SUGGESTER_MAX_TASKS:-50}
```

В README — раздел «Разбивка саммари на задачи» рядом с автопроверками: что `off` выключает порт целиком, что при `external` пустой ключ тоже выключает его, что `local` ключа не требует и закрывает утечку целиком, и что текст саммари уходит на настроенный адрес — это единственная исходящая передача данных проекта в системе.

- [ ] **Step 2: Обновить `CLAUDE.md`**

В раздел «Состояние репозитория» — абзацем: саммари созвона стало верхней вкладкой над проектами; текст живёт записью «Хроники» с третьим источником, задачи — черновиком в базе с признаком «предложено моделью»; разбивка идёт через порт с двумя пресетами (внешний API и свой OpenAI-совместимый endpoint), и без ключа порт выключен; «Сформировать релиз» создаёт версию с чекпоинтами одной транзакцией через репозитории роадмапа; поля «Дата релиза» в форме нет никогда, платформы проекта поток не запрашивает; правка текста после разбивки помечает задачи возможно устаревшими, но релиз не блокирует.

В раздел «Архитектурные инварианты», в пункт про журнал — что запись о передаче текста наружу идёт **до** сети: нет записи — нет и передачи.

В «Источники правды» — строку про `2026-11-16-cairn-summary-task-constructor-design.md` и одноимённый план.

Заодно — починить противоречие внутри файла: раздел «Порядок реализации» говорит «восемь этапов», раздел «Состояние репозитория» — «все десять этапов». Верно второе (этапы 9 и 10 есть и в `specs/`, и в коде — `servers/`, `domains/`).

- [ ] **Step 3: Коммит**

```bash
git add .env.example docker-compose.yml README.md CLAUDE.md
git commit -m "Описать конструктор задач в README и CLAUDE.md"
```

### Task 26: Полная проверка

- [ ] **Step 1: Все тесты**

Run: `pnpm test`
Expected: все рабочие пространства зелёные. Интеграционные поднимают PostgreSQL в контейнерах — нужен работающий docker.

- [ ] **Step 2: Типы**

Run: `pnpm typecheck`
Expected: без ошибок

- [ ] **Step 3: Сборка**

Run: `pnpm build`
Expected: без ошибок

- [ ] **Step 4: Проверка вживую с выключенным портом**

Поднять приложение **без** `CAIRN_TASK_SUGGESTER_API_KEY` и пройти поток руками: завести саммари, набрать три задачи руками, сформировать релиз.

Expected: кнопка «Создать задачи на основе текста» выключена с объяснением; задачи набираются и сохраняются; релиз создаёт версию с тремя незакрытыми чекпоинтами; переход ведёт на `/projects/:id/roadmap?version=…`; в журнале видны «Создано саммари», запись версии, три записи чекпоинтов и «Из саммари сформирован релиз»; в ленте хроники запись помечена источником «Саммари созвона».

- [ ] **Step 5: Проверка вживую с локальным портом**

Поднять любой OpenAI-совместимый endpoint в контуре (llama.cpp или vLLM) и выставить:

```bash
CAIRN_TASK_SUGGESTER=local \
CAIRN_TASK_SUGGESTER_BASE_URL=http://127.0.0.1:8080/v1 \
CAIRN_TASK_SUGGESTER_MODEL=<имя модели> \
pnpm --filter @cairn/api dev
```

Expected: подпись над кнопкой называет имя узла и модель и говорит «в вашем контуре»; разбивка возвращает список с метками «предложено моделью»; повторная разбивка спрашивает подтверждение; правка текста после разбивки показывает предупреждение и релиз не блокирует; в журнале есть «Запрошена разбивка саммари на задачи» и нет отдельной записи об успехе.

Отдельно проверить отказ: остановить endpoint и нажать кнопку.

Expected: `502`, сообщение «Разбивка не ответила», **прежний черновик на месте**, в журнале появилась «Разбивка саммари не удалась» с кодом и длительностью, а текста саммари в метаданных журнала нет.

- [ ] **Step 6: Проверка клавиатурой**

Пройти редактор черновика только клавиатурой: добавить задачу, переставить строки «Выше»/«Ниже», удалить, сохранить.

Expected: все действия достижимы, фокус после добавления стоит в новом поле.

- [ ] **Step 7: Итоговый коммит**

```bash
git add -A
git commit -m "Завершить конструктор задач из саммари"
```

---

## Что сознательно не делается

Полный список — в разделе 10 дизайна. Коротко: ни загрузки аудио и видео, ни транскрипции, ни диаризации; ни тегов платформ и адреса задачи в черновике; ни выбора существующей версии как цели; ни оптимистической блокировки черновика (`isDirty` и одна кнопка «Сохранить», как у панели версии); ни истории генераций и откатов формулировок; ни синхронизации саммари с версией после релиза; ни настройки предложителя через интерфейс; ни автоповторов платного вызова; ни автоматической нарезки длинного текста; ни предложений страниц документации из того же текста. Существующий код роадмапа этой работой не переписывается.
