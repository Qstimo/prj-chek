import { describe, expect, it } from 'vitest';

import { chronicleEntryCreateSchema, chronicleEntryUpdateSchema } from './chronicle';
import { intakePayloadSchema } from './intake';

describe('схема записи хроники', () => {
  it('принимает запись с датой, заголовком и содержимым', () => {
    const parsed = chronicleEntryCreateSchema.parse({
      occurredOn: '2026-08-27',
      title: 'Встреча по релизу',
      content: 'Решили выпускать в пятницу.',
    });

    expect(parsed.occurredOn).toBe('2026-08-27');
  });

  it('требует заголовок и содержимое', () => {
    expect(() =>
      chronicleEntryCreateSchema.parse({ occurredOn: '2026-08-27', content: 'Текст' }),
    ).toThrow();
    expect(() =>
      chronicleEntryCreateSchema.parse({ occurredOn: '2026-08-27', title: 'Заголовок' }),
    ).toThrow();
  });

  it('отвергает дату не в формате ISO', () => {
    expect(() =>
      chronicleEntryCreateSchema.parse({
        occurredOn: '27.08.2026',
        title: 'З',
        content: 'С',
      }),
    ).toThrow();
  });

  it('правка допускает частичные данные', () => {
    expect(chronicleEntryUpdateSchema.parse({ title: 'Новый заголовок' }).title).toBe(
      'Новый заголовок',
    );
  });
});

describe('тело webhook', () => {
  it('принимает JSON с содержимым', () => {
    const parsed = intakePayloadSchema.parse({ content: 'Сводка встречи' });

    expect(parsed.content).toBe('Сводка встречи');
  });

  it('заголовок и дата необязательны', () => {
    const parsed = intakePayloadSchema.parse({
      title: 'Встреча',
      content: 'Сводка',
      occurredOn: '2026-08-27',
    });

    expect(parsed.title).toBe('Встреча');
  });

  it('отвергает пустое содержимое', () => {
    expect(() => intakePayloadSchema.parse({ content: '' })).toThrow();
  });
});
