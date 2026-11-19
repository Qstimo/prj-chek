import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import Page from './page';

describe('Прежний адрес экрана служб модели', () => {
  it('переадресует на «Настройки»', () => {
    // Адрес остаётся: у владельца он в закладках и в README (дизайн, 2.2).
    expect(() => Page()).toThrow('REDIRECT:/settings');
  });
});
