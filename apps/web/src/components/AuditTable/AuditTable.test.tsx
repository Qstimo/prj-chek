import { AuditSubjectKind } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AuditTable } from './AuditTable';

const entry = {
  id: '11111111-1111-1111-1111-111111111111',
  subjectId: '22222222-2222-2222-2222-222222222222',
  subjectKind: AuditSubjectKind.User,
  subjectLabel: 'admin@cairn.local',
  action: 'project.created',
  entityType: 'project',
  entityId: '33333333-3333-3333-3333-333333333333',
  projectId: '33333333-3333-3333-3333-333333333333',
  metadata: { name: 'Проект' },
  createdAt: '2026-01-02T10:30:00.000Z',
};

describe('AuditTable', () => {
  it('переводит действие на русский', () => {
    render(<AuditTable entries={[entry]} />);

    expect(screen.getByText('Создан проект')).toBeInTheDocument();
  });

  it('показывает, кто выполнил действие', () => {
    render(<AuditTable entries={[entry]} />);

    expect(screen.getByText('admin@cairn.local')).toBeInTheDocument();
  });

  it('помечает машинные и системные действия', () => {
    // Пометка «человек или машина» требуется ТЗ 4.4.
    render(
      <AuditTable
        entries={[
          { ...entry, subjectId: null, subjectKind: AuditSubjectKind.System, subjectLabel: 'cli reset-totp' },
        ]}
      />,
    );

    expect(screen.getByText('Консоль')).toBeInTheDocument();
  });

  it('показывает дату в локальном формате', () => {
    render(<AuditTable entries={[entry]} />);

    expect(screen.getByText(/02\.01\.2026/)).toBeInTheDocument();
  });

  it('показывает неизвестное действие как есть', () => {
    // Новое событие не должно исчезать из журнала только потому,
    // что для него не завели перевод.
    render(<AuditTable entries={[{ ...entry, action: 'something.new' }]} />);

    expect(screen.getByText('something.new')).toBeInTheDocument();
  });

  it('объясняет пустой журнал', () => {
    render(<AuditTable entries={[]} />);

    expect(screen.getByText(/нет записей/i)).toBeInTheDocument();
  });
});
