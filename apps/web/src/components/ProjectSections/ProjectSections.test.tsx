import { AccessLevel, ProjectLifecycle, Section } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProjectSections } from './ProjectSections';

const metadataOnly = {
  id: '11111111-1111-1111-1111-111111111111',
  slug: 'proekt',
  name: 'Проект',
  lifecycle: ProjectLifecycle.Active,
};

const detailed = {
  ...metadataOnly,
  purpose: 'Назначение проекта',
  stack: 'Next.js',
  repoUrl: 'https://example.com/repo',
  ownerUserId: null,
  notes: 'Заметки',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

describe('ProjectSections', () => {
  it('показывает название на любом уровне', () => {
    render(<ProjectSections project={metadataOnly} />);

    expect(screen.getByRole('heading', { name: 'Проект' })).toBeInTheDocument();
  });

  it('на уровне метаданных не показывает поля паспорта', () => {
    render(<ProjectSections project={metadataOnly} />);

    expect(screen.queryByText('Назначение')).not.toBeInTheDocument();
  });

  it('на уровне метаданных объясняет, почему полей нет', () => {
    // Пустая карточка без объяснения читается как ошибка загрузки.
    render(<ProjectSections project={metadataOnly} />);

    expect(screen.getByText(/содержимое скрыто/i)).toBeInTheDocument();
  });

  it('на уровне чтения показывает назначение и стек', () => {
    render(<ProjectSections project={detailed} />);

    expect(screen.getByText('Назначение проекта')).toBeInTheDocument();
    expect(screen.getByText('Next.js')).toBeInTheDocument();
  });

  it('показывает ссылку на репозиторий', () => {
    render(<ProjectSections project={detailed} />);

    expect(screen.getByRole('link', { name: /example\.com/ })).toHaveAttribute(
      'href',
      'https://example.com/repo',
    );
  });

  it('не показывает пустые поля', () => {
    render(<ProjectSections project={{ ...detailed, stack: null }} />);

    expect(screen.queryByText('Стек')).not.toBeInTheDocument();
  });

  it('показывает ссылку на инфраструктуру при доступе к секции', () => {
    render(
      <ProjectSections
        project={metadataOnly}
        sections={{ [Section.Infrastructure]: AccessLevel.Metadata }}
      />,
    );

    expect(screen.getByRole('link', { name: 'Инфраструктура' })).toHaveAttribute(
      'href',
      `/projects/${metadataOnly.id}/infrastructure`,
    );
  });

  it('не показывает недоступную секцию', () => {
    // Недоступные секции отсутствуют, а не выглядят заблокированными (ТЗ 8).
    render(<ProjectSections project={metadataOnly} sections={{}} />);

    expect(screen.queryByRole('link', { name: 'Инфраструктура' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Хроника' })).not.toBeInTheDocument();
  });

  it('показывает ссылку на переменные при доступе к секции', () => {
    render(
      <ProjectSections
        project={metadataOnly}
        sections={{ [Section.Variables]: AccessLevel.Metadata }}
      />,
    );

    expect(screen.getByRole('link', { name: 'Переменные' })).toHaveAttribute(
      'href',
      `/projects/${metadataOnly.id}/variables`,
    );
  });

  it('показывает ссылку на хронику при доступе к секции', () => {
    render(
      <ProjectSections
        project={metadataOnly}
        sections={{ [Section.Chronicle]: AccessLevel.Metadata }}
      />,
    );

    expect(screen.getByRole('link', { name: 'Хроника' })).toHaveAttribute(
      'href',
      `/projects/${metadataOnly.id}/chronicle`,
    );
  });
});
