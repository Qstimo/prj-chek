import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { variableVersions, variables } from './variables';

describe('переменные', () => {
  it('ключ уникален в пределах окружения', () => {
    const unique = getTableConfig(variables).uniqueConstraints.find(
      (constraint) => constraint.name === 'variables_environment_key',
    );

    expect(unique?.columns.map((column) => column.name).sort()).toEqual([
      'environment_id',
      'key',
    ]);
  });

  it('значения в таблице переменных нет', () => {
    // Значение живёт только в версиях — зашифрованным (спека 3.1).
    const columns = getTableConfig(variables).columns.map((column) => column.name);

    expect(columns).not.toContain('value');
    expect(columns).not.toContain('value_encrypted');
  });
});

describe('версии значений', () => {
  it('номер версии уникален в пределах переменной', () => {
    const unique = getTableConfig(variableVersions).uniqueConstraints.find(
      (constraint) => constraint.name === 'variable_versions_variable_no',
    );

    expect(unique?.columns.map((column) => column.name).sort()).toEqual([
      'variable_id',
      'version_no',
    ]);
  });

  it('хранит только шифротекст и автора', () => {
    expect(variableVersions.valueEncrypted.notNull).toBe(true);
    expect(variableVersions.createdBySubjectId.notNull).toBe(true);
  });
});
