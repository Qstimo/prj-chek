import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WhatsNewIntro } from './WhatsNewIntro';

const mockPathname = { current: '/' };

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname.current,
}));

describe('WhatsNewIntro', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockPathname.current = '/';
  });

  it('показывает «Что нового» один раз при первом входе', async () => {
    render(<WhatsNewIntro />);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Что нового' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: 'Что нового' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(window.localStorage.getItem('cairn:whats-new-seen')).toBe('1');
    expect(screen.getByRole('link', { name: 'Что нового' })).toHaveAttribute('href', '/whats-new');
  });

  it('после первого просмотра показывает только плашку', async () => {
    window.localStorage.setItem('cairn:whats-new-seen', '1');
    render(<WhatsNewIntro />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Что нового' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('не открывает окно на самой странице «Что нового»', async () => {
    mockPathname.current = '/whats-new';
    render(<WhatsNewIntro />);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(window.localStorage.getItem('cairn:whats-new-seen')).toBe('1');
    expect(screen.getByRole('link', { name: 'Что нового' })).toHaveAttribute('href', '/whats-new');
  });
});
