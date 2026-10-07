import { PlatformKind, PlatformReleaseState } from '@cairn/shared';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  checkpointPlatforms,
  environmentPlatforms,
  platformKindEnum,
  platformReleaseStateEnum,
  projectPlatforms,
  versionPlatformReleases,
} from './platforms';

describe('платформы проекта', () => {
  it('перечисления совпадают с контрактом', () => {
    expect(platformKindEnum.enumValues).toEqual(Object.values(PlatformKind));
    expect(platformReleaseStateEnum.enumValues).toEqual(Object.values(PlatformReleaseState));
  });

  it('имя уникально в проекте', () => {
    const unique = getTableConfig(projectPlatforms).uniqueConstraints.find(
      (constraint) => constraint.name === 'project_platforms_project_name',
    );

    expect(unique?.columns.map((column) => column.name).sort()).toEqual(['name', 'project_id']);
  });

  it('требует вид, имя и позицию', () => {
    expect(projectPlatforms.kind.notNull).toBe(true);
    expect(projectPlatforms.name.notNull).toBe(true);
    expect(projectPlatforms.position.notNull).toBe(true);
  });
});

describe('выпуски', () => {
  it('у пары «версия × платформа» выпуск один', () => {
    // Выпуск — не отдельная вещь, а значение в клетке таблицы: вторая
    // строка на ту же пару означала бы два ответа на один вопрос.
    const unique = getTableConfig(versionPlatformReleases).uniqueConstraints.find(
      (constraint) => constraint.name === 'version_platform_releases_version_platform',
    );

    expect(unique?.columns.map((column) => column.name).sort()).toEqual([
      'platform_id',
      'version_id',
    ]);
  });

  it('состояние обязательно, дата и обозначение сборки — нет', () => {
    // «Вышла, дата неизвестна» — честное состояние; пустое обозначение
    // сборки означает «как у версии».
    expect(versionPlatformReleases.state.notNull).toBe(true);
    expect(versionPlatformReleases.releasedDate.notNull).toBe(false);
    expect(versionPlatformReleases.buildLabel.notNull).toBe(false);
  });

  it('дата выпуска — календарный день, а не отметка времени', () => {
    expect(versionPlatformReleases.releasedDate.getSQLType()).toBe('date');
  });
});

describe('связи', () => {
  it('связь окружения — пара без своего ключа', () => {
    // Состав ключа важен: проверка только на количество прошла бы и при
    // ключе на неправильных колонках.
    const [primary] = getTableConfig(environmentPlatforms).primaryKeys;

    expect(primary?.columns.map((column) => column.name).sort()).toEqual([
      'environment_id',
      'platform_id',
    ]);
  });

  it('тег чекпоинта — тоже пара', () => {
    const [primary] = getTableConfig(checkpointPlatforms).primaryKeys;

    expect(primary?.columns.map((column) => column.name).sort()).toEqual([
      'checkpoint_id',
      'platform_id',
    ]);
  });
});
