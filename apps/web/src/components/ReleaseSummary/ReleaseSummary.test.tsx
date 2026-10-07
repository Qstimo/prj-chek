import {
  PlatformKind,
  PlatformReleaseState,
  type Platform,
  type ReleasePending,
  type ReleaseRef,
} from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ReleaseSummary } from './ReleaseSummary';

const API: Platform = { id: 'p1', kind: PlatformKind.Server, name: 'API', position: 1 };
const STORE: Platform = { id: 'p2', kind: PlatformKind.Store, name: 'App Store', position: 2 };

/** Ссылка на выпуск в сводке. */
function ref(versionLabel: string, date: string | null, buildLabel: string | null = null): ReleaseRef {
  return { versionId: 'v1', versionLabel, buildLabel, date };
}

/** Строка сводки. */
function row(platform: Platform, released: ReleaseRef | null, pending: ReleasePending[]) {
  return { platform, released, pending };
}

describe('ReleaseSummary', () => {
  it('отвечает «релизов ещё не было»', () => {
    render(<ReleaseSummary summary={[row(STORE, null, [])]} />);

    expect(screen.getByText('Релизов ещё не было')).toBeInTheDocument();
  });

  it('показывает релиз с датой и то, что в пути', () => {
    render(
      <ReleaseSummary
        summary={[
          row(STORE, ref('v1.2', '2026-03-14'), [
            { ...ref('v1.3', null), state: PlatformReleaseState.InReview },
          ]),
        ]}
      />,
    );

    expect(screen.getByText('App Store')).toBeInTheDocument();
    expect(screen.getByText('в релизе v1.2')).toBeInTheDocument();
    expect(screen.getByText('14.03.2026')).toBeInTheDocument();
    expect(screen.getByText('на модерации v1.3')).toBeInTheDocument();
  });

  it('показывает обозначение сборки вместо обозначения версии', () => {
    render(<ReleaseSummary summary={[row(STORE, ref('v1.2', '2026-03-14', '1.2 (45)'), [])]} />);

    expect(screen.getByText('в релизе 1.2 (45)')).toBeInTheDocument();
  });

  it('держит порядок строк, пришедший от сервера', () => {
    // Порядок пропа расходится с `position` намеренно: иначе тест прошёл
    // бы и у компонента, который сортирует сам.
    render(<ReleaseSummary summary={[row(STORE, null, []), row(API, null, [])]} />);

    const names = screen.getAllByRole('term').map((node) => node.textContent);

    expect(names).toEqual(['App Store', 'API']);
  });

  it('без платформ не рисует ничего', () => {
    const { container } = render(<ReleaseSummary summary={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
