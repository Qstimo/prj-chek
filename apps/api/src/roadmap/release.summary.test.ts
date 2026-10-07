import { PlatformKind, PlatformReleaseState } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { releaseSummaryOf } from './release.summary';

const API = { id: 'p1', kind: PlatformKind.Server, name: 'API', position: 1 };
const STORE = { id: 'p2', kind: PlatformKind.Store, name: 'App Store', position: 2 };

const V1 = { id: 'v1', label: 'v1.2' };
const V2 = { id: 'v2', label: 'v1.3' };

/** Строка выпуска в том виде, в каком её читает правило. */
function release(
  version: { id: string },
  platform: { id: string },
  state: PlatformReleaseState,
  releasedDate: string | null,
  buildLabel: string | null = null,
) {
  return { versionId: version.id, platformId: platform.id, state, releasedDate, buildLabel };
}

describe('releaseSummaryOf', () => {
  it('строка есть у каждой платформы, даже без релизов', () => {
    const summary = releaseSummaryOf([API, STORE], [V1], []);

    expect(summary).toHaveLength(2);
    expect(summary[0]?.released).toBeNull();
    expect(summary[0]?.pending).toEqual([]);
  });

  it('строки идут в порядке платформ', () => {
    const summary = releaseSummaryOf([STORE, API], [V1], []);

    // Порядок приходит из списка платформ, уже упорядоченного выборкой.
    expect(summary.map((row) => row.platform.name)).toEqual(['App Store', 'API']);
  });

  it('в релизе — выпущенный выпуск самой поздней версии', () => {
    const [row] = releaseSummaryOf(
      [API],
      [V1, V2],
      [
        release(V1, API, PlatformReleaseState.Released, '2026-03-12'),
        release(V2, API, PlatformReleaseState.Released, '2026-03-16'),
      ],
    );

    expect(row?.released?.versionLabel).toBe('v1.3');
    expect(row?.released?.date).toBe('2026-03-16');
  });

  it('в пути — только то, что стоит после релиза', () => {
    // Отклонённая версия, которую уже обогнали, в сводке не висит:
    // сводка смотрит вперёд от текущего релиза.
    const [row] = releaseSummaryOf(
      [STORE],
      [V1, V2],
      [
        release(V1, STORE, PlatformReleaseState.Rejected, null),
        release(V2, STORE, PlatformReleaseState.Released, '2026-03-16'),
      ],
    );

    expect(row?.released?.versionLabel).toBe('v1.3');
    expect(row?.pending).toEqual([]);
  });

  it('показывает модерацию после текущего релиза', () => {
    const [row] = releaseSummaryOf(
      [STORE],
      [V1, V2],
      [
        release(V1, STORE, PlatformReleaseState.Released, '2026-03-14'),
        release(V2, STORE, PlatformReleaseState.InReview, null),
      ],
    );

    expect(row?.pending.map((entry) => entry.state)).toEqual([PlatformReleaseState.InReview]);
    expect(row?.pending[0]?.versionLabel).toBe('v1.3');
    expect(row?.pending[0]?.date).toBeNull();
  });

  it('без релиза показывает всё, что в пути, по порядку версий', () => {
    const [row] = releaseSummaryOf(
      [API],
      [V1, V2],
      [
        release(V2, API, PlatformReleaseState.OnTest, null),
        release(V1, API, PlatformReleaseState.OnTest, null),
      ],
    );

    expect(row?.pending.map((entry) => entry.versionLabel)).toEqual(['v1.2', 'v1.3']);
  });

  it('обозначение сборки берётся у выпуска, а не у версии', () => {
    const [row] = releaseSummaryOf(
      [STORE],
      [V1],
      [release(V1, STORE, PlatformReleaseState.Released, '2026-03-14', '1.2 (45)')],
    );

    expect(row?.released?.buildLabel).toBe('1.2 (45)');
  });

  it('молча пропускает выпуск неизвестной версии', () => {
    // Такого быть не может, пока выпуски уходят вместе с версией,
    // но падать на этом в сводке хуже, чем не показать строку.
    const [row] = releaseSummaryOf(
      [API],
      [V1],
      [release({ id: 'нет такой' }, API, PlatformReleaseState.Released, '2026-03-14')],
    );

    expect(row?.released).toBeNull();
  });
});
