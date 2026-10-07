import { describe, expect, it } from 'vitest';

import { PlatformKind, PlatformReleaseState } from '../enums';
import {
  platformCreateSchema,
  platformIdsSchema,
  platformReleaseSetSchema,
  platformUpdateSchema,
  releaseStatesFor,
  releaseSummaryRowSchema,
} from './platform';

const PLATFORM_ID = '00000000-0000-0000-0000-000000000001';

describe('platformCreateSchema', () => {
  it('обрезает имя и отвергает лишние поля', () => {
    expect(platformCreateSchema.parse({ kind: PlatformKind.Store, name: ' RuStore ' })).toEqual({
      kind: PlatformKind.Store,
      name: 'RuStore',
    });

    expect(() =>
      platformCreateSchema.parse({ kind: PlatformKind.Store, name: 'RuStore', position: 1 }),
    ).toThrow();
  });
});

describe('platformUpdateSchema', () => {
  it('правит только имя', () => {
    // Вид несёт два инварианта, проверяемых при записи выпуска и при
    // привязке к окружению; смена вида прошла бы мимо обеих проверок.
    // Позиция не правится без перенумерации соседей — порядок сводки
    // стал бы недетерминированным.
    expect(platformUpdateSchema.parse({ name: 'Веб-админка' }).name).toBe('Веб-админка');

    expect(() => platformUpdateSchema.parse({ kind: PlatformKind.Server })).toThrow();
    expect(() => platformUpdateSchema.parse({ position: 1 })).toThrow();
  });
});

describe('platformIdsSchema', () => {
  it('без повторов и не длиннее двадцати', () => {
    expect(() => platformIdsSchema.parse([PLATFORM_ID, PLATFORM_ID])).toThrow();

    // Идентификаторы разные: одинаковые упёрлись бы в проверку
    // повторов, и лимит остался бы непроверенным.
    expect(() =>
      platformIdsSchema.parse(
        Array.from(
          { length: 21 },
          (_, index) => `00000000-0000-0000-0000-0000000000${String(index).padStart(2, '0')}`,
        ),
      ),
    ).toThrow();

    expect(platformIdsSchema.parse([])).toEqual([]);
  });
});

describe('releaseStatesFor', () => {
  it('отдаёт модерацию и отклонение только магазину', () => {
    // Модерация бывает у магазина, а не у нашей машины: один источник
    // правила и для выбора в интерфейсе, и для проверки на сервере.
    expect(releaseStatesFor(PlatformKind.Store)).toEqual([
      PlatformReleaseState.OnTest,
      PlatformReleaseState.InReview,
      PlatformReleaseState.Released,
      PlatformReleaseState.Rejected,
    ]);

    expect(releaseStatesFor(PlatformKind.Server)).toEqual([
      PlatformReleaseState.OnTest,
      PlatformReleaseState.Released,
    ]);

    expect(releaseStatesFor(PlatformKind.Other)).toEqual([
      PlatformReleaseState.OnTest,
      PlatformReleaseState.Released,
    ]);
  });
});

describe('platformReleaseSetSchema', () => {
  it('принимает состояние без даты и отвергает лишнее', () => {
    // «Вышла, дата неизвестна» — честное состояние, как у версий,
    // оставшихся без фактической даты после прошлой миграции.
    expect(platformReleaseSetSchema.parse({ state: PlatformReleaseState.Released })).toEqual({
      state: PlatformReleaseState.Released,
    });

    expect(() =>
      platformReleaseSetSchema.parse({
        state: PlatformReleaseState.Released,
        platformId: PLATFORM_ID,
      }),
    ).toThrow();
  });
});

describe('releaseSummaryRowSchema', () => {
  it('описывает платформу без релизов', () => {
    const row = releaseSummaryRowSchema.parse({
      platform: { id: PLATFORM_ID, kind: PlatformKind.Store, name: 'RuStore', position: 3 },
      released: null,
      pending: [],
    });

    expect(row.released).toBeNull();
  });
});
