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

  it('показывает орган создания, когда он передан', () => {
    // Слот, а не флаг: кнопка открывает панель, и список из-за этого
    // не обязан становиться клиентским.
    render(
      <ProjectList
        projects={[project]}
        createSlot={<button type="button">Создать проект</button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'Создать проект' })).toBeInTheDocument();
  });

  it('без слота создание не предлагает', () => {
    render(<ProjectList projects={[project]} />);

    expect(screen.queryByRole('button', { name: 'Создать проект' })).not.toBeInTheDocument();
  });

  it('в пустой системе зовёт суперадмина завести первый проект', () => {
    // Иначе администратор в пустой системе решит, что ему не выдали доступ,
    // хотя выдавать его некому и незачем.
    render(
      <ProjectList projects={[]} createSlot={<button type="button">Создать проект</button>} />,
    );

    expect(screen.getByRole('button', { name: 'Создать проект' })).toBeInTheDocument();
    expect(screen.queryByText(/доступ к проектам выдаёт/i)).not.toBeInTheDocument();
  });

  it('перечисляет проекты списком для программ чтения с экрана', () => {
    render(<ProjectList projects={[project]} />);

    expect(screen.getByRole('list')).toBeInTheDocument();
  });
});
