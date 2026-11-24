import {
  PlatformKind,
  PlatformReleaseState,
  RoadmapVersionState,
  type Platform,
  type ReleaseSummaryRow,
  type RoadmapVersionMetadata,
} from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import {
  releaseReportBodyOf,
  releaseReportOf,
  releaseReportText,
  type ReleaseReportBody,
} from './release.report';

const STORE: Platform = {
  id: 'p-store',
  kind: PlatformKind.Store,
  name: 'App Store',
  position: 1,
};

const API: Platform = { id: 'p-api', kind: PlatformKind.Server, name: 'API', position: 2 };

const VERSION: RoadmapVersionMetadata = {
  id: 'v-2',
  label: 'v1.2',
  state: RoadmapVersionState.Released,
  plannedDate: '2026-03-01',
  releasedDate: '2026-03-12',
  position: 2,
  progress: { done: 1, total: 2 },
  unfinished: 1,
  hasUnfinishedOnRelease: true,
};

/** Отчёт в том виде, в каком его читает сборщик текста. */
function body(overrides: Partial<ReleaseReportBody> = {}): ReleaseReportBody {
  return {
    version: VERSION,
    releases: [],
    summary: [],
    checkpoints: [],
    carriedOut: [],
    ...overrides,
  };
}

/** Чекпоинт отчёта: случаи отличаются от него одним полем. */
function checkpoint(
  title: string,
  overrides: { isDone?: boolean; platformIds?: string[]; carriedFrom?: string | null } = {},
) {
  return {
    id: `c-${title}`,
    // Размещение и задача — разные строки, и отчёт видит обе склеенными:
    // идентификаторы разные намеренно, иначе тест не заметил бы, что
    // отчёт читает не то поле.
    taskId: `t-${title}`,
    title,
    isDone: false,
    position: 1,
    url: null,
    platformIds: [],
    carriedFrom: null,
    ...overrides,
  };
}

describe('releaseReportText', () => {
  it('паспорт версии идёт под заголовком', () => {
    const markdown = releaseReportText(body(), { markdown: true });

    expect(markdown).toBe(
      [
        '# Отчёт по релизу v1.2',
        '',
        '- Состояние: Выпущена',
        '- План: 2026-03-01',
        '- Факт: 2026-03-12',
        '- Чекпоинты: 1 из 2',
        '- Незакрыто на выпуске: 1',
      ].join('\n'),
    );
  });

  it('тот же паспорт без разметки', () => {
    // Два вида одного текста, а не два текста: кнопки «Скопировать
    // Markdown» и «Скопировать текст» обязаны давать одно и то же.
    const text = releaseReportText(body(), { markdown: false });

    expect(text).toBe(
      [
        'Отчёт по релизу v1.2',
        '',
        'Состояние: Выпущена',
        'План: 2026-03-01',
        'Факт: 2026-03-12',
        'Чекпоинты: 1 из 2',
        'Незакрыто на выпуске: 1',
      ].join('\n'),
    );
  });

  it('у версии без дат и чекпоинтов остаётся осмысленный паспорт', () => {
    const text = releaseReportText(
      body({
        version: {
          ...VERSION,
          state: RoadmapVersionState.Planned,
          plannedDate: null,
          releasedDate: null,
          progress: { done: 0, total: 0 },
          unfinished: 0,
          hasUnfinishedOnRelease: false,
        },
      }),
      { markdown: false },
    );

    expect(text).toBe(
      ['Отчёт по релизу v1.2', '', 'Состояние: Запланирована', 'План: не задан'].join('\n'),
    );
  });

  it.each([
    [PlatformReleaseState.Released, 'App Store: вышла, 2026-03-12, сборка 1.2.3 (45)'],
    [PlatformReleaseState.OnTest, 'App Store: на тесте, 2026-03-12, сборка 1.2.3 (45)'],
    [PlatformReleaseState.InReview, 'App Store: на модерации, 2026-03-12, сборка 1.2.3 (45)'],
    [PlatformReleaseState.Rejected, 'App Store: отклонена, 2026-03-12, сборка 1.2.3 (45)'],
  ])('состояние выпуска %s называется словами', (state, expected) => {
    const text = releaseReportText(
      body({
        releases: [
          { platform: STORE, state, releasedDate: '2026-03-12', buildLabel: '1.2.3 (45)' },
        ],
      }),
      { markdown: false },
    );

    expect(text).toContain(expected);
    expect(text).toContain('Выпуски');
  });

  it('платформа без строки выпуска идёт вместе с версией', () => {
    // «Неизвестно» было бы неправдой: отсутствие строки выпуска означает
    // именно «едет вместе с версией».
    const text = releaseReportText(
      body({
        releases: [{ platform: API, state: null, releasedDate: null, buildLabel: null }],
      }),
      { markdown: false },
    );

    expect(text).toContain('API: идёт вместе с версией');
  });

  it('чекпоинты показывают готовность, теги и «принято из»', () => {
    const markdown = releaseReportText(
      body({
        releases: [{ platform: STORE, state: null, releasedDate: null, buildLabel: null }],
        checkpoints: [
          checkpoint('Оплата', { isDone: true, platformIds: [STORE.id] }),
          checkpoint('Возвраты', { carriedFrom: 'v1.1' }),
        ],
      }),
      { markdown: true },
    );

    expect(markdown).toContain('## Чекпоинты');
    expect(markdown).toContain('- [x] Оплата (App Store)');
    expect(markdown).toContain('- [ ] Возвраты — принято из v1.1');
  });

  it('без разметки готовность называется словом', () => {
    const text = releaseReportText(
      body({
        checkpoints: [checkpoint('Оплата', { isDone: true }), checkpoint('Возвраты')],
      }),
      { markdown: false },
    );

    expect(text).toContain('[готово] Оплата');
    expect(text).toContain('[не закрыт] Возвраты');
    expect(text).not.toContain('[x]');
  });

  it('неизвестный тег платформы пропускается молча', () => {
    // Такого быть не может, пока теги уходят вместе с платформой, но
    // падать в отчёте хуже, чем не назвать платформу.
    const text = releaseReportText(
      body({ checkpoints: [checkpoint('Оплата', { platformIds: ['нет такой'] })] }),
      { markdown: false },
    );

    expect(text).toContain('[не закрыт] Оплата');
    expect(text).not.toContain('(');
  });

  it('перенесённое в другие версии названо отдельным разделом', () => {
    // После переноса чекпоинт версии уже не принадлежит, и в её
    // собственном списке его нет: без раздела отчёт умолчал бы о том,
    // что из релиза выпало.
    const markdown = releaseReportText(
      body({
        carriedOut: [{ ...checkpoint('Отчёты'), carriedTo: 'v1.3' }],
      }),
      { markdown: true },
    );

    expect(markdown).toContain('## Перенесено в другие версии');
    expect(markdown).toContain('- Отчёты — перенесено в v1.3');
  });

  it('сводка говорит, что в релизе и что в пути', () => {
    const summary: ReleaseSummaryRow[] = [
      {
        platform: STORE,
        released: {
          versionId: 'v-2',
          versionLabel: 'v1.2',
          buildLabel: null,
          date: '2026-03-12',
        },
        pending: [
          {
            versionId: 'v-3',
            versionLabel: 'v1.3',
            buildLabel: null,
            date: null,
            state: PlatformReleaseState.OnTest,
          },
        ],
      },
      { platform: API, released: null, pending: [] },
    ];

    const text = releaseReportText(body({ summary }), { markdown: false });

    expect(text).toContain('Что в релизе, что в пути');
    expect(text).toContain('App Store: в релизе v1.2 (2026-03-12); в пути v1.3 — на тесте');
    expect(text).toContain('API: в релизе ничего');
  });

  it('пустые разделы не печатаются вовсе', () => {
    const markdown = releaseReportText(body(), { markdown: true });

    expect(markdown).not.toContain('## Выпуски');
    expect(markdown).not.toContain('## Чекпоинты');
    expect(markdown).not.toContain('## Перенесено');
    expect(markdown).not.toContain('## Что в релизе');
  });

  it('ссылка на задачу в текст не попадает никогда', () => {
    // Текст копируют в письмо и в чат, и он одинаков внутри и наружу:
    // адрес внутреннего трекера с номером задачи в нём не нужен ни там,
    // ни там (инвариант дизайна 1).
    const withUrl = {
      ...checkpoint('Оплата'),
      url: 'https://tracker.example.com/TASK-17',
    };

    const markdown = releaseReportText(
      body({ checkpoints: [withUrl], carriedOut: [{ ...withUrl, carriedTo: 'v1.3' }] }),
      { markdown: true },
    );

    expect(markdown).not.toContain('tracker.example.com');
    expect(markdown).not.toContain('TASK-17');
  });
});

describe('releaseReportOf', () => {
  const context = {
    platforms: [STORE, API],
    summary: [] as ReleaseSummaryRow[],
    carriedFrom: new Map<string, string>(),
    carriedOut: [],
  };

  it('выпуск есть у каждой платформы проекта, даже без строки', () => {
    const report = releaseReportOf(
      {
        ...VERSION,
        checkpoints: [],
        releases: [
          {
            platformId: STORE.id,
            state: PlatformReleaseState.Released,
            releasedDate: '2026-03-12',
            buildLabel: '1.2.3',
          },
        ],
      },
      context,
    );

    expect(report.releases).toHaveLength(2);
    expect(report.releases[0]).toMatchObject({ state: PlatformReleaseState.Released });
    expect(report.releases[1]).toMatchObject({ platform: API, state: null, buildLabel: null });
  });

  it('обозначение версии-источника садится на чекпоинт', () => {
    const report = releaseReportOf(
      {
        ...VERSION,
        releases: [],
        checkpoints: [
          {
            id: 'c-1',
            taskId: 't-1',
            title: 'Поиск',
            isDone: false,
            position: 1,
            url: null,
            platformIds: [],
          },
        ],
      },
      { ...context, carriedFrom: new Map([['c-1', 'v1.1']]) },
    );

    expect(report.checkpoints[0]?.carriedFrom).toBe('v1.1');
    expect(report.markdown).toContain('принято из v1.1');
  });

  it('версия без чекпоинтов и выпусков даёт отчёт, а не падение', () => {
    // Проекция уровня «метаданные» не несёт ни чекпоинтов, ни выпусков,
    // и отчёт обязан вести себя как панель: отдать паспорт, а не упасть
    // на `undefined`.
    const report = releaseReportOf(VERSION, {
      ...context,
      carriedOut: [{ ...checkpoint('Отчёты'), carriedTo: 'v1.3' }],
    });

    expect(report.checkpoints).toEqual([]);
    // Выпуски и перенесённое тоже молчат: про них на этом уровне ничего
    // не известно, а «идёт вместе с версией» было бы выдумкой.
    expect(report.releases).toEqual([]);
    expect(report.carriedOut).toEqual([]);
    expect(report.markdown).toContain('Отчёт по релизу v1.2');
    expect(report.markdown).not.toContain('Выпуски');
  });

  it('оба вида текста собраны тем же правилом, что и тело', () => {
    const report = releaseReportOf({ ...VERSION, checkpoints: [], releases: [] }, context);
    const expected = releaseReportBodyOf({ ...VERSION, checkpoints: [], releases: [] }, context);

    expect(report.markdown).toBe(releaseReportText(expected, { markdown: true }));
    expect(report.text).toBe(releaseReportText(expected, { markdown: false }));
  });
});
