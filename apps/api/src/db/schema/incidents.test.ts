import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { addressIncidents } from './incidents';

describe('инциденты адреса', () => {
  it('хранит отрезок времени и причину', () => {
    const columns = getTableConfig(addressIncidents).columns.map((column) => column.name);

    expect(columns).toEqual(
      expect.arrayContaining(['domain_id', 'started_at', 'resolved_at', 'cause']),
    );
  });

  it('открытый инцидент не имеет момента закрытия', () => {
    expect(addressIncidents.resolvedAt.notNull).toBe(false);
  });

  it('у адреса не больше одного открытого инцидента', () => {
    // Это и есть защита от второго пуша об одном падении: правило живёт
    // в базе, а не в памяти процесса, и перезапуск API его не теряет.
    const index = getTableConfig(addressIncidents).indexes.find(
      (candidate) => candidate.config.name === 'address_incidents_open',
    );

    expect(index?.config.unique).toBe(true);
    expect(index?.config.where).toBeDefined();
  });

  it('история адреса читается по своему индексу', () => {
    // Частичный уникальный покрывает только открытые строки, а история
    // читается по всем: без этого индекса запрос пошёл бы сканом по
    // таблице, которая намеренно не чистится.
    const index = getTableConfig(addressIncidents).indexes.find(
      (candidate) => candidate.config.name === 'address_incidents_domain',
    );

    expect(index?.config.unique).toBe(false);
  });

  it('ссылка на адрес не каскадная: уборка явная', () => {
    // Каскадов в проекте нет: строки уносит репозиторий окружений явно,
    // в той же транзакции, что и строки статусов.
    expect(getTableConfig(addressIncidents).foreignKeys[0]?.onDelete).toBe('restrict');
  });
});
