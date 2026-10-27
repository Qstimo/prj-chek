import { ProjectLifecycle } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ProjectList } from './ProjectList';
import { PROJECT_LIST_VIEW_KEY } from './viewStorage';

const project = {
  id: '11111111-1111-1111-1111-111111111111',
  slug: 'proekt',
  name: 'Проект',
  lifecycle: ProjectLifecycle.Active,
  updatedAt: null,
  platforms: [],
  productionDomain: 'example.com',
  productionServerName: null,
};

describe('ProjectList', () => {
  it('по умолчанию показывает строки с доменом', () => {
    render(<ProjectList projects={[project]} />);

    expect(screen.getByText('Проект')).toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Название' })).toBeInTheDocument();
  });

  it('переключает на карточки и запоминает выбор', async () => {
    const user = userEvent.setup();
    render(<ProjectList projects={[project]} />);

    await user.click(screen.getByRole('button', { name: 'Карточки' }));

    expect(screen.queryByRole('columnheader', { name: 'Название' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(PROJECT_LIST_VIEW_KEY)).toBe('cards');
  });

  it('объясняет пустой список отсутствием выданных доступов', () => {
    // Пустая страница без объяснения выглядит как поломка, хотя это
    // нормальное состояние для нового пользователя (ТЗ 4.1).
    render(<ProjectList projects={[]} />);

    expect(screen.getByText(/доступ/i)).toBeInTheDocument();
  });

  it('показывает орган создания, когда он передан', () => {
    // Слот, а не флаг: кнопка открывает панель, и список из-за этого
    // не обязан читать предпочтение вида на сервере.
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
});
