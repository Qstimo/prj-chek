import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DocPageList } from './DocPageList';

const page = {
  id: '11111111-1111-1111-1111-111111111111',
  title: 'Развёртывание',
  updatedAt: '2026-08-28T10:00:00.000Z',
};

describe('DocPageList', () => {
  it('перечисляет страницы и сообщает о выборе', async () => {
    const onSelect = vi.fn();
    render(
      <DocPageList pages={[page]} selectedId={null} onSelect={onSelect} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Развёртывание/ }));

    expect(onSelect).toHaveBeenCalledWith(page.id);
  });

  it('выбранная страница помечена', () => {
    const { container } = render(
      <DocPageList pages={[page]} selectedId={page.id} onSelect={vi.fn()} />,
    );

    expect(container.querySelector('[data-selected="true"]')).not.toBeNull();
  });

  it('пустой список объясняется по-разному читателю и пишущему', () => {
    const { rerender } = render(<DocPageList pages={[]} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText(/страниц пока нет\./i)).toBeInTheDocument();

    rerender(<DocPageList pages={[]} selectedId={null} canWrite onSelect={vi.fn()} />);
    expect(screen.getByText(/создайте первую/i)).toBeInTheDocument();
  });
});
