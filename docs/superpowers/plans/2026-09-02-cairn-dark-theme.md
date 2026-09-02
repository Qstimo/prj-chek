# Тёмная тема «спокойное стекло» — план реализации

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести `apps/web` на единственную тёмную тему с фиолетовым акцентом в калибровке C1 «спокойное стекло» по спеке `docs/superpowers/specs/2026-09-02-cairn-dark-theme-design.md`.

**Architecture:** Расширенный набор CSS-токенов в `globals.css` (`:root`, без `.dark`) + отображение в `tailwind.config.ts` закрывают ~90% экранов автоматически; поверх — точечные правки классов в девяти местах (навигация, карточки, табы, поля, строки переменных, список пользователей, журнал, бейджи, логин). Ни одного изменения поведения, API или разметки-логики.

**Tech Stack:** Tailwind CSS 3 (HSL-токены; прозрачность зашита в токены через отдельные `--*-alpha`-переменные, синтаксис `<alpha-value>` сознательно не используется — модификаторы вида `bg-primary/50` в коде не встречаются), Next.js 15, Vitest + React Testing Library.

**Про TDD:** задачи меняют только классы и CSS — поведение не меняется, и в `apps/web` нет ни одного ассерта на классы (проверено ревью спеки). Новые тесты на CSS-классы не пишутся сознательно: они закрепляли бы оформление, а не поведение, и превратились бы в шум при следующей правке темы. Дисциплина здесь другая: **после каждой задачи** прогонять существующие поведенческие тесты (`pnpm --filter @cairn/web test`) — они обязаны оставаться зелёными, потому что структура разметки почти не меняется. Единственное структурное изменение (обёртка таблицы журнала) покрыто существующим тестом `AuditTable`.

---

## Chunk 1: токены и точечные правки

### Task 1: Токены и Tailwind-конфигурация

**Files:**
- Modify: `apps/web/src/app/globals.css` (полная замена содержимого)
- Modify: `apps/web/tailwind.config.ts` (полная замена содержимого)
- Modify: `apps/web/src/app/layout.tsx:18` (класс `body`)

- [ ] **Step 1: Переписать `globals.css`**

Полное новое содержимое файла:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    color-scheme: dark;

    --background: 253 27% 7%;
    --foreground: 251 33% 96%;
    --muted: 0 0% 100%;
    --muted-alpha: 0.06;
    --muted-foreground: 254 12% 66%;
    --surface: 0 0% 100%;
    --surface-alpha: 0.045;
    --surface-strong-alpha: 0.08;
    --border: 0 0% 100%;
    --border-alpha: 0.08;
    --border-strong-alpha: 0.14;
    --primary: 254 83% 65%;
    --primary-foreground: 0 0% 100%;
    --accent-soft: 258 90% 66%;
    --ring: 258 90% 66%;
    --destructive: 0 72% 60%;
    --destructive-foreground: 0 0% 100%;
    --radius-card: 12px;
    --radius-control: 8px;
    --glow: 258 90% 66%;
  }

  body {
    @apply bg-background text-foreground;
    /* Свечение у верхнего горизонта (спека, раздел 2): fixed, чтобы не
       скроллилось. iOS Safari игнорирует fixed — там свечение поедет со
       скроллом; для self-hosted десктопного инструмента это приемлемо. */
    background-image: radial-gradient(
      ellipse 80% 55% at 65% -15%,
      hsl(var(--glow) / 0.16),
      transparent
    );
    background-attachment: fixed;
    font-family:
      -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif;
  }

  h1,
  h2,
  h3 {
    @apply tracking-tight;
  }

  /* Кольцо клавиатурного фокуса — у всех интерактивных элементов (спека, раздел 3). */
  a:focus-visible,
  button:focus-visible,
  input:focus-visible,
  textarea:focus-visible,
  select:focus-visible,
  summary:focus-visible {
    outline: 2px solid hsl(var(--ring) / 0.7);
    outline-offset: 2px;
  }
}
```

Пояснения (в файл не копировать):

- `--primary: 254 83% 65%` ≈ `#7c5cf0`, `--accent-soft`/`--ring`/`--glow: 258 90% 66%` ≈ `#8b5cf6` — из согласованных макетов;
- alpha-компоненты вынесены в отдельные переменные, потому что Tailwind-синтаксис `hsl(var(--x) / <alpha-value>)` не позволяет зашить прозрачность в саму переменную;
- фокус задан глобально в CSS, а не классами в каждом компоненте — иначе кольцо пришлось бы добавлять в ~30 мест.

- [ ] **Step 2: Переписать `tailwind.config.ts`**

Полное новое содержимое файла:

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        muted: 'hsl(var(--muted) / var(--muted-alpha))',
        'muted-foreground': 'hsl(var(--muted-foreground))',
        surface: 'hsl(var(--surface) / var(--surface-alpha))',
        'surface-strong': 'hsl(var(--surface) / var(--surface-strong-alpha))',
        border: 'hsl(var(--border) / var(--border-alpha))',
        'border-strong': 'hsl(var(--border) / var(--border-strong-alpha))',
        primary: 'hsl(var(--primary))',
        'primary-foreground': 'hsl(var(--primary-foreground))',
        'accent-soft': 'hsl(var(--accent-soft) / 0.22)',
        'accent-soft-foreground': 'hsl(var(--accent-soft))',
        destructive: 'hsl(var(--destructive))',
        'destructive-foreground': 'hsl(var(--destructive-foreground))',
      },
      // Голый класс `border` без цвета используется в ~25 местах (кнопки
      // «Раскрыть», «Скопировать» и т. п.) — без этого DEFAULT остался бы
      // светло-серым gray.200 из preflight и в тёмной теме резал бы глаз.
      borderColor: {
        DEFAULT: 'hsl(var(--border) / var(--border-alpha))',
      },
      borderRadius: {
        md: 'var(--radius-control)',
        lg: 'var(--radius-card)',
      },
      boxShadow: {
        // Единственная тень темы: мягкая, нейтральная (спека, раздел 3 — без ореолов).
        surface: '0 8px 24px rgba(0, 0, 0, 0.35)',
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 3: Убрать дубль фона в `layout.tsx`**

В `apps/web/src/app/layout.tsx` класс `body` не меняется (`min-h-screen antialiased` — фон и текст приходят из `@layer base`). Проверить, что это так, и ничего не править, если совпадает.

- [ ] **Step 4: Прогнать тесты и типизацию**

Run: `pnpm --filter @cairn/web test && pnpm --filter @cairn/web exec tsc --noEmit`
Expected: все тесты PASS, типизация без ошибок.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/globals.css apps/web/tailwind.config.ts
git commit -m "Задать токены тёмной темы «спокойное стекло»"
```

### Task 2: Навигация — стеклянная полоса

**Files:**
- Modify: `apps/web/src/components/AppNav/AppNav.tsx:13` (класс `nav`)
- Test (существующий, менять не нужно): `apps/web/src/components/AppNav/AppNav.test.tsx`

- [ ] **Step 1: Заменить класс `nav`**

Было:

```tsx
    <nav className="border-b border-border">
```

Стало:

```tsx
    <nav className="sticky top-0 z-10 border-b border-border bg-surface backdrop-blur-md">
```

- [ ] **Step 2: Прогнать тесты навигации**

Run: `pnpm --filter @cairn/web test -- AppNav`
Expected: PASS (тесты проверяют состав ссылок, не классы).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/AppNav/AppNav.tsx
git commit -m "Сделать навигацию стеклянной прилипающей полосой"
```

### Task 3: Карточка проекта и бейджи жизненного цикла

**Files:**
- Modify: `apps/web/src/components/ProjectCard/ProjectCard.tsx:16` (класс `Link`)
- Modify: `apps/web/src/components/ProjectCard/constants.ts:12-17` (`LIFECYCLE_STYLES`)

- [ ] **Step 1: Стеклянная карточка**

В `ProjectCard.tsx` заменить класс `Link`. Было:

```tsx
      className="block rounded-md border border-border p-4 transition hover:border-primary"
```

Стало:

```tsx
      className="block rounded-lg border border-border bg-surface p-4 transition hover:border-border-strong hover:bg-surface-strong"
```

- [ ] **Step 2: Бейджи — pill, «Работает» — фиолетовый**

В `constants.ts` заменить `LIFECYCLE_STYLES` (комментарий над константой сохранить):

```ts
export const LIFECYCLE_STYLES: Record<ProjectLifecycle, string> = {
  [ProjectLifecycle.Development]: 'bg-muted text-muted-foreground',
  [ProjectLifecycle.Active]: 'bg-accent-soft text-accent-soft-foreground',
  [ProjectLifecycle.Paused]: 'bg-muted text-muted-foreground',
  [ProjectLifecycle.Archived]: 'bg-muted text-muted-foreground',
};
```

И в `ProjectCard.tsx` в классе бейджа заменить `rounded-md` на `rounded-full` (pill по спеке, раздел 3):

```tsx
        <span className={`rounded-full px-2 py-1 text-xs ${LIFECYCLE_STYLES[project.lifecycle]}`}>
```

- [ ] **Step 3: Прогнать тесты карточки**

Run: `pnpm --filter @cairn/web test -- ProjectCard`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ProjectCard/
git commit -m "Перевести карточку проекта на стеклянную поверхность"
```

### Task 4: Табы секций проекта

**Files:**
- Modify: `apps/web/src/components/ProjectSections/ProjectSections.tsx:22-48` (`nav` со ссылками)

- [ ] **Step 1: Ссылки-подчёркивания → чипы**

Пять ссылок в `nav` оформлены одинаково (`className="underline"`). Заменить `nav` и класс каждой ссылки:

```tsx
      <nav className="flex flex-wrap gap-2">
```

и у каждой из пяти ссылок:

```tsx
            className="rounded-full border border-border bg-surface px-3 py-1 text-sm transition hover:border-border-strong hover:bg-surface-strong"
```

Состояния «активный таб» здесь нет: навигация видна только на странице «Инфо», а секции — отдельные страницы. `accent-soft` из макета используется бейджем «Работает» (Task 3); добавлять клиентское определение текущего пути ради подсветки — лишняя сложность (YAGNI). Приглушённый `text-muted-foreground` для неактивных табов из спеки тоже не применяется — раз активного состояния нет, все чипы равноправны, и обычный `foreground` на стеклянной заливке читабельнее; это осознанное отклонение от спеки, раздел 5, п. 3.

- [ ] **Step 2: Прогнать тесты секций**

Run: `pnpm --filter @cairn/web test -- ProjectSections`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ProjectSections/ProjectSections.tsx
git commit -m "Оформить ссылки секций проекта чипами"
```

### Task 5: Поля ввода

**Files:**
- Modify: `apps/web/src/components/TextField/TextField.tsx:7` (константа `className`)

- [ ] **Step 1: Тёмные поля**

Было:

```tsx
  const className = 'w-full rounded-md border border-border px-3 py-2';
```

Стало:

```tsx
  const className =
    'w-full rounded-md border border-border bg-surface px-3 py-2 transition focus:border-border-strong';
```

Кольцо фокуса приходит из глобального `:focus-visible` (Task 1) — здесь его не дублировать.

- [ ] **Step 2: Прогнать тесты поля**

Run: `pnpm --filter @cairn/web test -- TextField`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/TextField/TextField.tsx
git commit -m "Перевести поля ввода на стеклянную поверхность"
```

### Task 6: Строки переменных

**Files:**
- Modify: `apps/web/src/components/VariableTable/VariableRow.tsx:39` (класс `li`)

- [ ] **Step 1: Стеклянная строка**

Было:

```tsx
    <li className="space-y-2 rounded-md border border-border p-3">
```

Стало:

```tsx
    <li className="space-y-2 rounded-lg border border-border bg-surface p-3">
```

Ключ переменной уже `<code>` (моноширинный по умолчанию браузера) — менять не нужно. Кнопки «Раскрыть»/«История»/«Править» с голым классом `border` получают цвет `--border` через `borderColor.DEFAULT` из Task 1.

Спека (раздел 5, п. 4) называет это «таблицей в стеклянном контейнере», но `VariableTable` — это `ul` строк-карточек, не таблица; стекло наносится на каждую строку — осознанная адаптация, перестраивать разметку в таблицу не нужно.

- [ ] **Step 2: Прогнать тесты переменных**

Run: `pnpm --filter @cairn/web test -- VariableTable`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/VariableTable/VariableRow.tsx
git commit -m "Перевести строки переменных на стеклянную поверхность"
```

### Task 6.1: Строки списка пользователей

**Files:**
- Modify: `apps/web/src/components/UserList/UserListItem.tsx:25` (класс `li`)

- [ ] **Step 1: Стеклянная строка** (по образцу Task 6 — спека, раздел 5, п. 4 называет `UserList` явно)

Было:

```tsx
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
```

Стало:

```tsx
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3">
```

- [ ] **Step 2: Прогнать тесты списка пользователей**

Run: `pnpm --filter @cairn/web test -- UserList`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/UserList/UserListItem.tsx
git commit -m "Перевести строки списка пользователей на стеклянную поверхность"
```

### Task 7: Журнал действий — стеклянный контейнер

**Files:**
- Modify: `apps/web/src/components/AuditTable/AuditTable.tsx:16` (обёртка таблицы)

- [ ] **Step 1: Обёртка**

Было:

```tsx
    <div className="overflow-x-auto">
```

Стало:

```tsx
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
```

Внутренние `border-b border-border` у ячеек не трогать — токен уже полупрозрачный. У последней строки нижняя граница упрётся в рамку контейнера; чтобы не удвоить линию, у ячеек `tbody` дописать модификатор: заменить в четырёх `td` `border-b border-border` на `border-b border-border [tr:last-child_&]:border-b-0`. Если это покажется громоздким — допустимо оставить как есть и оценить визуально на смоуке (двойная линия — не блокер).

- [ ] **Step 2: Прогнать тесты журнала**

Run: `pnpm --filter @cairn/web test -- AuditTable`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/AuditTable/AuditTable.tsx
git commit -m "Поместить журнал действий в стеклянный контейнер"
```

### Task 8: Экран входа — свечение по центру

**Files:**
- Modify: `apps/web/src/app/login/page.tsx:6-12`

- [ ] **Step 1: Карточка входа со свечением**

Полное новое содержимое `page.tsx` (свечение — локальный `radial-gradient` через произвольное значение Tailwind; единственное место, где стекло выразительнее — спека, раздел 5):

```tsx
import { LoginScreen } from './LoginScreen';

/** Страница входа. Свечение по центру — акцент единственного экрана без данных. */
export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm items-center px-4 [background:radial-gradient(ellipse_60%_40%_at_50%_45%,hsl(var(--glow)/0.14),transparent)]">
      <div className="w-full rounded-lg border border-border bg-surface p-6 shadow-surface backdrop-blur-md">
        <LoginScreen />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Прогнать тесты входа**

Run: `pnpm --filter @cairn/web test -- Login`
Expected: PASS. Фильтру соответствует только `components/LoginForm/LoginForm.test.tsx` — у `LoginScreen` собственного теста нет, это не ошибка.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/login/page.tsx
git commit -m "Оформить экран входа стеклянной карточкой со свечением"
```

### Task 9: Полная проверка и визуальный смоук

**Files:** нет новых — только проверки.

- [ ] **Step 1: Все проверки монорепо**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: все рабочие пространства зелёные, сборка без ошибок.

- [ ] **Step 2: Визуальный смоук** (браузером, по списку спеки, раздел 6)

Поднять приложение и пройти: логин; сводка проектов; шесть секций проекта («Инфо», «Инфраструктура», «Переменные» — включая раскрытие значения, «Документация» — включая блоки кода в `Markdown` на заливке `bg-muted`, «Роадмап», «Хроника»); администрирование (журнал, пользователи, безопасность, доступы); страницы вне основного layout — публичный роадмап `app/roadmap/[token]` и приглашение `app/invite/[token]` (у них нет `AppNav`; убедиться, что фоновое свечение `body` присутствует и там). Проверить контраст текстовых пар (WCAG AA) и жёлтую `WarningsPanel` на тёмном фоне.

- [ ] **Step 3: Финальный коммит правок смоука** (если что-то докрутили)

```bash
git add -A apps/web && git commit -m "Докрутить тёмную тему по итогам смоука"
```
