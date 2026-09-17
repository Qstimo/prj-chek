import { ProjectLifecycle, StatusIndicator } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProjectCard } from './ProjectCard';

const project = {
  id: '11111111-1111-1111-1111-111111111111',
  slug: 'proekt',
  name: 'Проект',
  lifecycle: ProjectLifecycle.Active,
};

describe('ProjectCard', () => {
  it('показывает название', () => {
    render(<ProjectCard project={project} />);

    expect(screen.getByText('Проект')).toBeInTheDocument();
  });

  it('переводит состояние жизненного цикла на русский', () => {
    render(<ProjectCard project={project} />);

    expect(screen.getByText('Работает')).toBeInTheDocument();
  });

  it('ведёт на карточку проекта', () => {
    render(<ProjectCard project={project} />);

    expect(screen.getByRole('link')).toHaveAttribute('href', `/projects/${project.id}`);
  });

  it('различает приостановленный проект', () => {
    // Приостановленный не должен выглядеть аварийным (ТЗ 6).
    render(<ProjectCard project={{ ...project, lifecycle: ProjectLifecycle.Paused }} />);

    expect(screen.getByText('Приостановлен')).toBeInTheDocument();
  });

  it('показывает архивный проект', () => {
    render(<ProjectCard project={{ ...project, lifecycle: ProjectLifecycle.Archived }} />);

    expect(screen.getByText('Архив')).toBeInTheDocument();
  });

  it('показывает индикатор состояния рядом со стадией', () => {
    render(<ProjectCard project={project} indicator={StatusIndicator.Down} />);

    expect(screen.getByText('Авария')).toBeInTheDocument();
  });

  it('без индикатора показывает только стадию', () => {
    render(<ProjectCard project={project} />);

    expect(screen.queryByText('Авария')).not.toBeInTheDocument();
  });
});
