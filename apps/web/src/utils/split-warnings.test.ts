import {
  StatusIndicator,
  StatusWarningKind,
  type StatusSummaryRow,
  type StatusWarning,
} from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { splitWarnings, splitWarningsByUrgency } from './split-warnings';

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

describe('splitWarnings', () => {
  it('делит предупреждения одного проекта без сводки', () => {
    // Ядро нужно экрану проекта: там сводки по проектам нет вовсе, а
    // делить «не отвечает» и «требует внимания» надо тем же правилом.
    const warnings: StatusWarning[] = [
      { kind: StatusWarningKind.HealthDown, subject: 'api.example.com', detail: 'не отвечает' },
      {
        kind: StatusWarningKind.HealthCheckMisconfigured,
        subject: 'api.example.com',
        detail: 'ручка не найдена',
      },
    ];

    const { critical, attention } = splitWarnings(warnings);

    expect(critical.map((warning) => warning.kind)).toEqual([StatusWarningKind.HealthDown]);
    expect(attention.map((warning) => warning.kind)).toEqual([
      StatusWarningKind.HealthCheckMisconfigured,
    ]);
  });

  it('сохраняет чужие поля предупреждения', () => {
    // Ядро обобщено по типу: ссылка сводки обязана доехать до панели.
    const linked = [
      {
        kind: StatusWarningKind.HealthDown,
        subject: 'Прод',
        detail: 'не отвечает',
        href: '/projects/1/infrastructure',
      },
    ];

    expect(splitWarnings(linked).critical[0]?.href).toBe('/projects/1/infrastructure');
  });

  it('на пустом списке отдаёт два пустых списка', () => {
    expect(splitWarnings([])).toEqual({ critical: [], attention: [] });
  });
});

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
