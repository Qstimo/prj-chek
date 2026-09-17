import { StatusIndicator, StatusWarningKind, type StatusSummaryRow } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { splitWarningsByUrgency } from './split-warnings';

const rows: StatusSummaryRow[] = [
  {
    projectId: '11111111-1111-4111-8111-111111111111',
    projectName: 'Лавка',
    indicator: StatusIndicator.Down,
    warnings: [
      { kind: StatusWarningKind.HealthDown, subject: 'Прод', detail: 'не отвечает' },
      {
        kind: StatusWarningKind.TlsExpiring,
        subject: 'shop.example.com',
        detail: 'сертификат до 01.10',
      },
    ],
  },
];

describe('splitWarningsByUrgency', () => {
  it('кладёт падение в срочные, а срок — в остальные', () => {
    const { critical, attention } = splitWarningsByUrgency(rows);

    expect(critical.map((warning) => warning.kind)).toEqual([StatusWarningKind.HealthDown]);
    expect(attention.map((warning) => warning.kind)).toEqual([StatusWarningKind.TlsExpiring]);
  });

  it('предваряет предмет именем проекта', () => {
    const { critical } = splitWarningsByUrgency(rows);

    expect(critical[0]?.subject).toBe('Лавка · Прод');
  });

  it('ведёт ссылкой в инфраструктуру проекта', () => {
    const { critical } = splitWarningsByUrgency(rows);

    expect(critical[0]?.href).toBe(
      '/projects/11111111-1111-4111-8111-111111111111/infrastructure',
    );
  });

  it('на пустой сводке отдаёт два пустых списка', () => {
    expect(splitWarningsByUrgency([])).toEqual({ critical: [], attention: [] });
  });
});
