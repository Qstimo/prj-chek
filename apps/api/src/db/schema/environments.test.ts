import { EnvironmentKind } from '@cairn/shared';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { environmentDomains, environmentKindEnum, environments } from './environments';

describe('окружения', () => {
  it('перечисление вида совпадает с контрактом', () => {
    expect(environmentKindEnum.enumValues).toEqual(Object.values(EnvironmentKind));
  });

  it('имя уникально в пределах проекта', () => {
    // Глобальная уникальность была бы бессмысленной: «прод» есть у каждого проекта.
    const unique = getTableConfig(environments).uniqueConstraints.find(
      (constraint) => constraint.name === 'environments_project_name',
    );

    expect(unique?.columns.map((column) => column.name).sort()).toEqual(['name', 'project_id']);
  });

  it('требует имя и вид', () => {
    expect(environments.name.notNull).toBe(true);
    expect(environments.kind.notNull).toBe(true);
  });

  it('допускает окружение без адреса и проверки', () => {
    // Реестр заполняется постепенно, пустое поле честнее выдуманного.
    expect(environments.host.notNull).toBe(false);
    expect(environments.healthCheckUrl.notNull).toBe(false);
  });
});

describe('домены окружения', () => {
  it('домен уникален в пределах окружения', () => {
    const unique = getTableConfig(environmentDomains).uniqueConstraints.find(
      (constraint) => constraint.name === 'environment_domains_environment_name',
    );

    expect(unique?.columns.map((column) => column.name).sort()).toEqual([
      'environment_id',
      'name',
    ]);
  });

  it('домен не удаляется каскадом вместе с окружением', () => {
    // Запрет каскадов в системе абсолютный (спека этапа 1, 4.1):
    // домены удаляет репозиторий явной строкой в той же транзакции.
    const cascading = getTableConfig(environmentDomains)
      .foreignKeys.map((key) => key.onDelete)
      .filter((action) => action !== 'restrict');

    expect(cascading).toEqual([]);
  });
});
