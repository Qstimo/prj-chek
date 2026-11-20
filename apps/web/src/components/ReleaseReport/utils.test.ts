import { PlatformKind, PlatformReleaseState, RoadmapVersionState } from '@cairn/shared';
import { describe, expect, it, vi } from 'vitest';

import type { ReportView } from './types';
import {
  checkpointUrlOf,
  copyText,
  isBareReport,
  platformNamesOf,
  reportHrefOf,
  tagsOf,
} from './utils';

const store = { id: 'p1', kind: PlatformKind.Store, name: 'App Store', position: 1 };

const version = {
  id: 'v1',
  label: 'v1.2',
  state: RoadmapVersionState.Released,
  plannedDate: null,
  releasedDate: null,
  position: 1,
  progress: { done: 0, total: 0 },
  unfinished: 0,
  hasUnfinishedOnRelease: false,
};

/** Отчёт из одного паспорта: так приходит уровень «метаданные». */
const bare: ReportView = {
  version,
  releases: [],
  summary: [],
  checkpoints: [],
  carriedOut: [],
  markdown: '',
  text: '',
};

describe('platformNamesOf', () => {
  it('собирает имена платформ из строк выпусков', () => {
    // Другого источника имён у отчёта нет: теги чекпоинтов приходят
    // идентификаторами, а платформы перечислены только в выпусках.
    const names = platformNamesOf([
      { platform: store, state: PlatformReleaseState.Released, releasedDate: null, buildLabel: null },
    ]);

    expect(names.get('p1')).toBe('App Store');
  });
});

describe('tagsOf', () => {
  it('переводит теги в имена платформ', () => {
    expect(tagsOf(['p1'], new Map([['p1', 'App Store']]))).toEqual(['App Store']);
  });

  it('неизвестный тег пропускает молча', () => {
    // На уровне «метаданные» выпусков нет, а теги есть: падать в отчёте
    // хуже, чем не назвать платформу.
    expect(tagsOf(['p1', 'нет'], new Map([['p1', 'App Store']]))).toEqual(['App Store']);
  });
});

describe('checkpointUrlOf', () => {
  it('отдаёт адрес задачи внутренней выдачи', () => {
    expect(
      checkpointUrlOf({
        id: 'c1',
        taskId: 't-c1',
        title: 'Оплата',
        isDone: true,
        position: 1,
        url: 'https://tracker.local/T-1',
        platformIds: [],
        carriedFrom: null,
      }),
    ).toBe('https://tracker.local/T-1');
  });

  it('у публичной выдачи поля нет вовсе — и это не ошибка', () => {
    expect(
      checkpointUrlOf({
        id: 'c1',
        taskId: 't-c1',
        title: 'Оплата',
        isDone: true,
        position: 1,
        platformIds: [],
        carriedFrom: null,
      }),
    ).toBeNull();
  });
});

describe('isBareReport', () => {
  it('отчёт из одного паспорта узнаётся', () => {
    expect(isBareReport(bare)).toBe(true);
  });

  it('отчёт с выпусками паспортом не считается', () => {
    expect(
      isBareReport({
        ...bare,
        releases: [
          { platform: store, state: null, releasedDate: null, buildLabel: null },
        ],
      }),
    ).toBe(false);
  });
});

describe('copyText', () => {
  it('кладёт текст в буфер', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyText('отчёт')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('отчёт');

    vi.unstubAllGlobals();
  });

  it('сообщает о неудаче, а не бросает', async () => {
    // Без защищённого соединения буфера нет вовсе, и падение здесь
    // снесло бы страницу отчёта целиком.
    vi.stubGlobal('navigator', {});

    await expect(copyText('отчёт')).resolves.toBe(false);

    vi.unstubAllGlobals();
  });

  it('отказ браузера тоже неудача', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('нет разрешения')) },
    });

    await expect(copyText('отчёт')).resolves.toBe(false);

    vi.unstubAllGlobals();
  });
});

describe('адрес страницы отчёта', () => {
  it('собирается из проекта и версии', () => {
    // Один источник адреса на полосу версий, панель версии и страницу:
    // расхождение маршрута иначе нашлось бы только щелчком.
    expect(reportHrefOf('p-1', 'v-7')).toBe('/projects/p-1/roadmap/versions/v-7');
  });
});
