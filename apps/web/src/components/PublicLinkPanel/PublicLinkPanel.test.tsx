import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PublicLinkPanel } from './PublicLinkPanel';

const link = { token: 'abc', url: 'https://cairn.local/roadmap/abc' };

describe('PublicLinkPanel', () => {
  it('показывает адрес опубликованной страницы', () => {
    render(
      <PublicLinkPanel link={link} isSuperadmin={false} onPublish={vi.fn()} onUnpublish={vi.fn()} />,
    );

    expect(screen.getByText(link.url)).toBeInTheDocument();
  });

  it('читающему без публикации объясняет состояние', () => {
    render(
      <PublicLinkPanel link={null} isSuperadmin={false} onPublish={vi.fn()} onUnpublish={vi.fn()} />,
    );

    expect(screen.getByText(/не опубликован/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Опубликовать' })).not.toBeInTheDocument();
  });

  it('суперадмин видит предупреждение и публикует', async () => {
    const onPublish = vi.fn();
    render(<PublicLinkPanel link={null} isSuperadmin onPublish={onPublish} onUnpublish={vi.fn()} />);

    expect(screen.getByText(/всем, у кого есть ссылка/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));

    expect(onPublish).toHaveBeenCalled();
  });

  it('отключение требует подтверждения', async () => {
    const onUnpublish = vi.fn();
    render(<PublicLinkPanel link={link} isSuperadmin onPublish={vi.fn()} onUnpublish={onUnpublish} />);

    await userEvent.click(screen.getByRole('button', { name: 'Отключить ссылку' }));
    expect(onUnpublish).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить отключение' }));
    expect(onUnpublish).toHaveBeenCalled();
  });
});
