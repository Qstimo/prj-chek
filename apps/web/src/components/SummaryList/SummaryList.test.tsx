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
};

const VERSION_ID = '55555555-5555-5555-5555-555555555555';

const RELEASED: SummaryListItem = {
  ...TEXT_ONLY,
  id: '44444444-4444-4444-4444-444444444444',
  title: 'Итоги',
  taskCount: 4,
  isReleased: true,
  releasedVersionLabel: 'v1.4',
  releasedVersionId: VERSION_ID,
};

describe('история саммари', () => {
  it('состояние вычисляется из содержимого', () => {
    // Хранимой стадии нет: она разошлась бы с содержимым.
    render(<SummaryList items={[TEXT_ONLY, WITH_TASKS, RELEASED]} />);

    expect(screen.getByText('Текст')).toBeInTheDocument();
    expect(screen.getByText('Задачи: 12')).toBeInTheDocument();
    expect(screen.getByText('Ушло в v1.4')).toBeInTheDocument();
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

  it('пустая история говорит об этом', () => {
    render(<SummaryList items={[]} />);

    expect(screen.getByText(/пока нет/)).toBeInTheDocument();
  });

  it('называет проект: история сводная по всем проектам', () => {
    render(<SummaryList items={[TEXT_ONLY]} />);

    expect(screen.getByText('CAIRN')).toBeInTheDocument();
  });
});
