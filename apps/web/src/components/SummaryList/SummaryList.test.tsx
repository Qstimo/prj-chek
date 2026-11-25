import type { SummaryListItem } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SummaryList } from './SummaryList';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';

const TEXT_ONLY: SummaryListItem = {
  id: '22222222-2222-2222-2222-222222222222',
  projectId: PROJECT_ID,
  projectName: 'CAIRN',
  occurredOn: '2026-11-16',
  title: 'Созвон по релизу',
  taskCount: 0,
  archivedCount: 0,
  releasedCount: 0,
  isReleased: false,
  releasedVersionLabel: null,
  releasedVersionId: null,
  createdAt: '2026-11-16T10:00:00.000Z',
};

const WITH_TASKS: SummaryListItem = {
  ...TEXT_ONLY,
  id: '33333333-3333-3333-3333-333333333333',
  title: 'Планирование',
  taskCount: 12,
  archivedCount: 0,
  releasedCount: 0,
};

const VERSION_ID = '55555555-5555-5555-5555-555555555555';

const RELEASED: SummaryListItem = {
  ...TEXT_ONLY,
  id: '44444444-4444-4444-4444-444444444444',
  title: 'Итоги',
  taskCount: 4,
  archivedCount: 0,
  releasedCount: 0,
  isReleased: true,
  releasedVersionLabel: 'v1.4',
  releasedVersionId: VERSION_ID,
};

describe('история саммари', () => {
  it('состояние вычисляется из содержимого', () => {
    // Хранимой стадии нет: она разошлась бы с содержимым.
    render(<SummaryList items={[TEXT_ONLY, WITH_TASKS, RELEASED]} />);

    expect(screen.getByText('Текст')).toBeInTheDocument();
    expect(screen.getByText('В работе')).toBeInTheDocument();
    expect(screen.getByText('Ушло в v1.4')).toBeInTheDocument();
  });

  it('строка называет три числа задач', () => {
    // Одного числа задач больше не хватает: после архива и выборочного
    // релиза «задач: 3» не говорит, где эти задачи.
    render(
      <SummaryList items={[{ ...WITH_TASKS, taskCount: 3, archivedCount: 2, releasedCount: 5 }]} />,
    );

    expect(screen.getByText('3 в работе · 2 в архиве · 5 в проекте')).toBeInTheDocument();
  });

  it('нули не показываются', () => {
    // «0 в архиве» рассказывал бы про отсутствующее и занимал бы место,
    // которое нужно числам, что есть.
    render(<SummaryList items={[{ ...WITH_TASKS, taskCount: 3 }]} />);

    expect(screen.getByText('3 в работе')).toBeInTheDocument();
    expect(screen.queryByText(/в архиве/)).not.toBeInTheDocument();
    expect(screen.queryByText(/в проекте/)).not.toBeInTheDocument();
  });

  it('саммари, где всё отложено, не называется «Текст»', () => {
    // Активных задач нет, но задачи есть: «Текст» означал бы, что
    // разбивки не было вовсе.
    render(<SummaryList items={[{ ...WITH_TASKS, taskCount: 0, archivedCount: 4 }]} />);

    expect(screen.getByText('В работе')).toBeInTheDocument();
    expect(screen.queryByText('Текст')).not.toBeInTheDocument();
  });

  it('у саммари без задач числа не названы вовсе', () => {
    render(<SummaryList items={[TEXT_ONLY]} />);

    expect(screen.queryByText(/в работе/)).not.toBeInTheDocument();
  });

  it('число задач не называется дважды', () => {
    // Состояние отвечает на «на какой стадии», числа — на «сколько и
    // где»: одно число в двух клетках разошлось бы при первой правке.
    render(<SummaryList items={[{ ...WITH_TASKS, taskCount: 12 }]} />);

    expect(screen.queryByText(/Задачи: 12/)).not.toBeInTheDocument();
  });

  it('скрытое обозначение версии не читается как «не сформирован»', () => {
    // isReleased — состояние потока, обозначение — данные роадмапа.
    render(
      <SummaryList
        items={[{ ...RELEASED, releasedVersionLabel: null, releasedVersionId: null }]}
      />,
    );

    expect(screen.getByText('Ушло в роадмап')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Ушло/ })).not.toBeInTheDocument();
  });

  it('«Ушло в v1.4» ведёт на саму версию, а не на полосу целиком', () => {
    // Роадмап держит открытую версию в адресе: без `?version` ссылка
    // привела бы к полосе, где версию ещё надо найти.
    render(<SummaryList items={[RELEASED]} />);

    expect(screen.getByRole('link', { name: 'Ушло в v1.4' })).toHaveAttribute(
      'href',
      `/projects/${PROJECT_ID}/roadmap?version=${VERSION_ID}`,
    );
  });

  it('заголовок ведёт на экран саммари', () => {
    render(<SummaryList items={[TEXT_ONLY]} />);

    expect(screen.getByRole('link', { name: 'Созвон по релизу' })).toHaveAttribute(
      'href',
      `/summaries/${TEXT_ONLY.id}`,
    );
  });

  it('нажимается вся строка, а не одни буквы заголовка', () => {
    // Ссылкой была только клетка заголовка: человек жал по дате, по
    // проекту, по числам — и строка не открывалась.
    render(<SummaryList items={[TEXT_ONLY]} />);

    const link = screen.getByRole('link', { name: 'Созвон по релизу' });

    expect(link.className).toMatch(/after:inset-0/);
    expect(link.closest('tr')?.className).toMatch(/relative/);
  });

  it('ссылка на версию не тонет под растянутой ссылкой строки', () => {
    // Растянутая ссылка накрывает всю строку: без своего слоя вторая
    // ссылка перестала бы нажиматься вовсе.
    render(<SummaryList items={[RELEASED]} />);

    expect(screen.getByRole('link', { name: 'Ушло в v1.4' }).className).toMatch(/relative/);
  });

  it('пустая история говорит об этом', () => {
    render(<SummaryList items={[]} />);

    expect(screen.getByText(/пока нет/)).toBeInTheDocument();
  });

  it('называет проект: история сводная по всем проектам', () => {
    render(<SummaryList items={[TEXT_ONLY]} />);

    expect(screen.getByText('CAIRN')).toBeInTheDocument();
  });
});
