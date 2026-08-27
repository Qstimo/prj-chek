import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Компоненты используют навигацию Next.js, которой в тестовой среде нет.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));
