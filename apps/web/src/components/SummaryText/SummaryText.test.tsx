import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SummaryText } from './SummaryText';

const HREF = '/projects/11111111-1111-1111-1111-111111111111/chronicle';

describe('текст саммари', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('показывает текст целиком, а не разметкой', () => {
    // Текст созвона недоверен: ни Markdown-рендера, ни
    // dangerouslySetInnerHTML здесь быть не должно.
    render(<SummaryText text={'<b>жирно</b>\nвторая строка'} chronicleHref={HREF} />);

    expect(screen.getByText(/<b>жирно<\/b>/)).toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
  });

  it('ведёт на запись в хронике проекта', () => {
    render(<SummaryText text="текст" chronicleHref={HREF} />);

    expect(screen.getByRole('link', { name: /хронике/ })).toHaveAttribute('href', HREF);
  });

  it('копирует текст в буфер', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    render(<SummaryText text="обсудили сроки" chronicleHref={HREF} />);

    await userEvent.click(screen.getByRole('button', { name: 'Скопировать' }));

    expect(writeText).toHaveBeenCalledWith('обсудили сроки');
  });

  it('отказ буфера объясняет, что текст можно выделить', async () => {
    // Буфер отдаётся не всякой странице: без объяснения кнопка выглядела
    // бы сломанной, а текст рядом и его можно выделить руками.
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    render(<SummaryText text="обсудили сроки" chronicleHref={HREF} />);

    await userEvent.click(screen.getByRole('button', { name: 'Скопировать' }));

    expect(await screen.findByText(/выделите/i)).toBeInTheDocument();
  });

  it('без буфера в браузере кнопка не падает', async () => {
    vi.stubGlobal('navigator', {});

    render(<SummaryText text="обсудили сроки" chronicleHref={HREF} />);

    await userEvent.click(screen.getByRole('button', { name: 'Скопировать' }));

    expect(await screen.findByText(/выделите/i)).toBeInTheDocument();
  });
});
