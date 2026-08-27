import { ProjectLifecycle } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProjectList } from './ProjectList';

const project = {
  id: '11111111-1111-1111-1111-111111111111',
  slug: 'proekt',
  name: 'Проект',
  lifecycle: ProjectLifecycle.Active,
};

describe('ProjectList', () => {
  it('показывает карточки проектов', () => {
    render(<ProjectList projects={[project]} />);

    expect(screen.getByText('Проект')).toBeInTheDocument();
  });

  it('объясняет пустой список отсутствием выданных доступов', () => {
    // Пустая страница без объяснения выглядит как поломка, хотя это
    // нормальное состояние для нового пользователя (ТЗ 4.1).
    render(<ProjectList projects={[]} />);

    expect(screen.getByText(/доступ/i)).toBeInTheDocument();
  });

  it('перечисляет проекты списком для программ чтения с экрана', () => {
    render(<ProjectList projects={[project]} />);

    expect(screen.getByRole('list')).toBeInTheDocument();
  });
});
