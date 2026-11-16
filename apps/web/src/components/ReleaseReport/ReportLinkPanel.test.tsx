import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ReportLinkPanel } from './ReportLinkPanel';

const link = { token: 'abc', url: 'https://cairn.local/roadmap/report/abc' };

describe('ReportLinkPanel', () => {
  it('показывает адрес опубликованного отчёта', () => {
    render(
      <ReportLinkPanel
        link={link}
        isSuperadmin={false}
        onPublish={vi.fn()}
        onUnpublish={vi.fn()}
      />,
    );

    expect(screen.getByText(link.url)).toBeInTheDocument();
  });

  it('читающему без публикации объясняет состояние и не даёт кнопки', () => {
    // Публикация — право суперадмина, и кнопка, которая всё равно ответит
    // отказом, хуже её отсутствия.
    render(
      <ReportLinkPanel
        link={null}
        isSuperadmin={false}
        onPublish={vi.fn()}
        onUnpublish={vi.fn()}
      />,
    );

    expect(screen.getByText(/отчёт не опубликован/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Опубликовать отчёт' })).not.toBeInTheDocument();
  });

  it('суперадмин видит последствие публикации и публикует', async () => {
    const onPublish = vi.fn();
    render(
      <ReportLinkPanel link={null} isSuperadmin onPublish={onPublish} onUnpublish={vi.fn()} />,
    );

    expect(screen.getByText(/всем, у кого есть ссылка/i)).toBeInTheDocument();
    // Инвариант проговаривается до нажатия: ссылки на задачи наружу не идут.
    expect(screen.getByText(/ссылки на задачи/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Опубликовать отчёт' }));

    expect(onPublish).toHaveBeenCalled();
  });

  it('отключение требует подтверждения', async () => {
    const onUnpublish = vi.fn();
    render(
      <ReportLinkPanel link={link} isSuperadmin onPublish={vi.fn()} onUnpublish={onUnpublish} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Отключить ссылку' }));
    expect(onUnpublish).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить отключение' }));
    expect(onUnpublish).toHaveBeenCalled();
  });

  it('копирует адрес и подтверждает это', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    render(
      <ReportLinkPanel link={link} isSuperadmin={false} onPublish={vi.fn()} onUnpublish={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Скопировать' }));

    expect(writeText).toHaveBeenCalledWith(link.url);
    expect(screen.getByRole('status')).toHaveTextContent(/скопировано/i);

    vi.unstubAllGlobals();
  });

  it('показывает отказ сервера, а не молчит', () => {
    render(
      <ReportLinkPanel
        link={null}
        isSuperadmin
        onPublish={vi.fn()}
        onUnpublish={vi.fn()}
        error="Недостаточно прав для этого действия."
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Недостаточно прав');
  });
});
