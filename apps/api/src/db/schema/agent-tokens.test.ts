import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { agentTokens } from './agent-tokens';

describe('токены агентов', () => {
  it('у субъекта не больше одного токена', () => {
    const unique = getTableConfig(agentTokens).uniqueConstraints.find(
      (constraint) => constraint.name === 'agent_tokens_subject',
    );

    expect(unique?.columns.map((column) => column.name)).toEqual(['subject_id']);
  });

  it('срок жизни и хэш обязательны, флаг значений по умолчанию выключен', () => {
    expect(agentTokens.expiresAt.notNull).toBe(true);
    expect(agentTokens.tokenHash.notNull).toBe(true);
    expect(agentTokens.canRevealVariables.notNull).toBe(true);
    expect(agentTokens.canRevealVariables.default).toBe(false);
  });
});
