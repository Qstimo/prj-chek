import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

/**
 * `ResizeObserver` в jsdom нет вовсе: это пробел среды, а не кода.
 *
 * Заглушка молчит — у jsdom нет укладки, и сообщать ей не о чем. Код,
 * который ею меряет, обязан сам переживать нулевую высоту: в тестах она
 * всегда ноль, а в браузере — настоящая.
 */
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;

// Компоненты используют навигацию Next.js, которой в тестовой среде нет.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));
