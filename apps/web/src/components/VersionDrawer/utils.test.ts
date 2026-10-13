import {
  PlatformKind,
  PlatformReleaseState,
  RoadmapVersionState,
  type Platform,
  type RoadmapVersionDetail,
} from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { draftOf, isDetailed, isDirtyOf, releaseOpsOf, versionPatchOf } from './utils';
import type { IVersionDraft } from './types';

const metadata = {
  id: '1',
  label: 'v1.0',
  state: RoadmapVersionState.Planned,
  plannedDate: null,
  releasedDate: null,
  position: 1,
  progress: { done: 0, total: 0 },
};

const API: Platform = { id: 'p1', kind: PlatformKind.Server, name: 'API', position: 1 };
const STORE: Platform = { id: 'p2', kind: PlatformKind.Store, name: 'App Store', position: 2 };

/** Версия уровня чтения: выпуски приходят только с ним. */
const detail: RoadmapVersionDetail = {
  ...metadata,
  checkpoints: [],
  releases: [
    {
      platformId: API.id,
      state: PlatformReleaseState.Released,
      releasedDate: '2026-03-14',
      buildLabel: null,
    },
  ],
};

describe('isDetailed', () => {
  it('различает проекции по наличию чекпоинтов', () => {
    expect(isDetailed(metadata)).toBe(false);
    expect(isDetailed({ ...metadata, checkpoints: [] })).toBe(true);
  });
});

describe('draftOf', () => {
  it('берёт поля версии, пустые как пустые строки', () => {
    // Пустая строка — то, что умеют поля ввода; `null` в них превратился
    // бы в строку «null».
    expect(draftOf(metadata, [])).toEqual({
      label: 'v1.0',
      state: RoadmapVersionState.Planned,
      plannedDate: '',
      releasedDate: '',
      releases: {},
    });
  });

  it('берёт клетки выпусков, а платформе без строки ставит прочерк', () => {
    const draft = draftOf(detail, [API, STORE]);

    expect(draft.releases[API.id]).toEqual({
      state: PlatformReleaseState.Released,
      releasedDate: '2026-03-14',
      buildLabel: '',
    });
    expect(draft.releases[STORE.id]).toBeNull();
  });
});

describe('versionPatchOf', () => {
  const draft = draftOf(metadata, []);

  it('нетронутый черновик не даёт патча', () => {
    expect(versionPatchOf(metadata, draft, false)).toEqual({});
  });

  it('отдаёт только изменённое поле', () => {
    expect(versionPatchOf(metadata, { ...draft, label: 'v1.1' }, false)).toEqual({
      label: 'v1.1',
    });
  });

  it('пустая дата уходит как null', () => {
    const withDate = { ...metadata, plannedDate: '2026-04-01' };

    expect(versionPatchOf(withDate, draftOf(metadata, []), false)).toEqual({ plannedDate: null });
  });

  it('у проекта с платформами дата релиза в патч не попадает', () => {
    // Сервер отвергает присутствие ключа (дизайн, раздел 3): дата
    // принадлежит выпуску, и отправка ключа обернулась бы 409.
    const patch = versionPatchOf(metadata, { ...draft, releasedDate: '2026-09-01' }, true);

    expect(patch).toEqual({});
    expect('releasedDate' in patch).toBe(false);
  });

  it('у проекта без платформ дата релиза в патч попадает', () => {
    expect(versionPatchOf(metadata, { ...draft, releasedDate: '2026-09-01' }, false)).toEqual({
      releasedDate: '2026-09-01',
    });
  });
});

describe('releaseOpsOf', () => {
  it('нетронутые клетки не дают операций', () => {
    expect(releaseOpsOf(detail, draftOf(detail, [API, STORE]), [API, STORE])).toEqual([]);
  });

  it('новая клетка ставится целиком', () => {
    const draft = draftOf(detail, [API, STORE]);
    const next: IVersionDraft = {
      ...draft,
      releases: {
        ...draft.releases,
        [STORE.id]: {
          state: PlatformReleaseState.InReview,
          releasedDate: '',
          buildLabel: '1.2 (45)',
        },
      },
    };

    expect(releaseOpsOf(detail, next, [API, STORE])).toEqual([
      {
        platformId: STORE.id,
        kind: 'set',
        input: {
          state: PlatformReleaseState.InReview,
          releasedDate: null,
          buildLabel: '1.2 (45)',
        },
      },
    ]);
  });

  it('правка одной даты отправляет всю тройку', () => {
    // `PUT` заменяет клетку целиком: посылка одного поля обнулила бы
    // соседние.
    const draft = draftOf(detail, [API]);
    const next: IVersionDraft = {
      ...draft,
      releases: { [API.id]: { ...draft.releases[API.id]!, releasedDate: '2026-03-20' } },
    };

    expect(releaseOpsOf(detail, next, [API])).toEqual([
      {
        platformId: API.id,
        kind: 'set',
        input: {
          state: PlatformReleaseState.Released,
          releasedDate: '2026-03-20',
          buildLabel: null,
        },
      },
    ]);
  });

  it('прочерк снимает выпуск', () => {
    const draft = draftOf(detail, [API]);

    expect(releaseOpsOf(detail, { ...draft, releases: { [API.id]: null } }, [API])).toEqual([
      { platformId: API.id, kind: 'clear' },
    ]);
  });

  it('операции идут в порядке платформ', () => {
    const draft = draftOf(detail, [API, STORE]);
    const cell = { state: PlatformReleaseState.OnTest, releasedDate: '', buildLabel: '' };
    const next: IVersionDraft = {
      ...draft,
      releases: { [API.id]: cell, [STORE.id]: cell },
    };

    expect(releaseOpsOf(detail, next, [API, STORE]).map((op) => op.platformId)).toEqual([
      API.id,
      STORE.id,
    ]);
  });

  it('на уровне метаданных операций не бывает', () => {
    // Выпуски приходят только с уровнем чтения, и сравнивать там нечего:
    // иначе панель на метаданных сняла бы все выпуски разом.
    expect(releaseOpsOf(metadata, draftOf(metadata, [API]), [API])).toEqual([]);
  });
});

describe('isDirtyOf', () => {
  it('пустой патч без операций — чисто', () => {
    expect(isDirtyOf({}, [])).toBe(false);
  });

  it('патч делает черновик грязным', () => {
    expect(isDirtyOf({ label: 'v2' }, [])).toBe(true);
  });

  it('операция делает черновик грязным', () => {
    expect(isDirtyOf({}, [{ platformId: API.id, kind: 'clear' }])).toBe(true);
  });
});
