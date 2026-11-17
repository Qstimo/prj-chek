import { ModelAuthScheme, ModelServiceKind, ModelServicePlacement } from '@cairn/shared';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  modelAuthSchemeEnum,
  modelServiceKindEnum,
  modelServicePlacementEnum,
  modelServices,
} from './model-services';

describe('таблица model_services', () => {
  it('ключ — значение перечня, а не суррогат', () => {
    // Одна настройка на узел становится инвариантом базы, а запись —
    // одним `ON CONFLICT (kind) DO UPDATE` без чтения-правки-записи
    // (дизайн, 3.2).
    expect(getTableConfig(modelServices).primaryKeys).toHaveLength(0);
    expect(modelServices.kind.primary).toBe(true);
  });

  it('суррогатного ключа нет вовсе', () => {
    // Он потребовал бы уникального индекса на `kind`, то есть того же
    // инварианта, выраженного дважды.
    expect(getTableConfig(modelServices).columns.map((column) => column.name)).not.toContain('id');
  });

  it('ключ службы обнуляем, а не пустая строка', () => {
    // `null` отвечает на «задан ли ключ» без ключа шифрования вовсе;
    // пустая строка в шифрованной колонке — это шифротекст пустого
    // значения (дизайн, 3.1).
    expect(modelServices.secretEncrypted.notNull).toBe(false);
  });

  it('имя модели обязательно', () => {
    expect(modelServices.model.notNull).toBe(true);
  });

  it('каталог шифрования не получает: он не удостоверение', () => {
    // Каталог — идентификатор учётной записи, который провайдер пишет в
    // адресной строке своей консоли (дизайн, 3.1).
    expect(getTableConfig(modelServices).columns.map((column) => column.name)).toContain('folder');
  });

  it('предел ожидания положителен проверкой базы', () => {
    // Ноль означал бы «не ждать вовсе», то есть отказ на каждом вызове.
    // Образец CHECK уже есть: summaries_suggester_dropped_nonnegative.
    const checks = getTableConfig(modelServices).checks.map((check) => check.name);

    expect(checks).toContain('model_services_timeout_positive');
  });

  it('автор правки не удаляется, пока настройка на него ссылается', () => {
    const [reference] = getTableConfig(modelServices).foreignKeys;

    expect(reference?.onDelete).toBe('restrict');
  });

  it('перечни базы совпадают с перечнями контракта', () => {
    // Единственный способ это гарантировать — брать значения из
    // контракта, а не переписывать их строками.
    expect(modelServiceKindEnum.enumValues).toEqual(Object.values(ModelServiceKind));
    expect(modelAuthSchemeEnum.enumValues).toEqual(Object.values(ModelAuthScheme));
    expect(modelServicePlacementEnum.enumValues).toEqual(Object.values(ModelServicePlacement));
  });

  it('версий значения нет: старый ключ API — отозванный ключ', () => {
    // Механизм отката, который возвращает заведомо негодное, — не
    // механизм (дизайн, 3.3). Таблица версий здесь была бы коллекцией
    // всех ключей, какие когда-либо были у установки.
    expect(getTableConfig(modelServices).columns.map((column) => column.name)).not.toContain(
      'version',
    );
  });
});
