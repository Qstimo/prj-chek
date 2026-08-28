import { describe, expect, it } from 'vitest';

import { agentTokenCreateSchema, agentTokenUpdateSchema } from './agent-token';

describe('схема токена агента', () => {
  it('принимает имя, срок по умолчанию 90 дней, флаг выключен', () => {
    const parsed = agentTokenCreateSchema.parse({ label: 'Cursor Вадима' });

    expect(parsed.label).toBe('Cursor Вадима');
    expect(parsed.ttlDays).toBe(90);
    expect(parsed.canRevealVariables).toBe(false);
  });

  it('требует непустое имя', () => {
    expect(() => agentTokenCreateSchema.parse({ label: '  ' })).toThrow();
  });

  it('срок ограничен разумными пределами', () => {
    expect(agentTokenCreateSchema.parse({ label: 'X', ttlDays: 30 }).ttlDays).toBe(30);
    expect(() => agentTokenCreateSchema.parse({ label: 'X', ttlDays: 0 })).toThrow();
    expect(() => agentTokenCreateSchema.parse({ label: 'X', ttlDays: 10_000 })).toThrow();
  });

  it('правка меняет только флаг значений', () => {
    expect(agentTokenUpdateSchema.parse({ canRevealVariables: true }).canRevealVariables).toBe(
      true,
    );
    expect(() => agentTokenUpdateSchema.parse({ label: 'Новое' })).toThrow();
  });
});
