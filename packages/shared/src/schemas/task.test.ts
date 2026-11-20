import { describe, expect, it } from 'vitest';

import { TaskOrigin } from '../enums';
import {
  MAX_PROJECT_TASK_TITLE,
  projectTaskCreateSchema,
  projectTaskSchema,
  projectTaskUpdateSchema,
} from './task';

const ID = '11111111-1111-1111-1111-111111111111';

/** Задача вне версии: размещения нет вовсе. */
const LOOSE = {
  id: ID,
  projectId: ID,
  title: 'Починить предел текста',
  url: null,
  origin: TaskOrigin.Manual,
  sourceSummaryId: null,
  platformIds: [],
  placement: null,
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:00.000Z',
};

describe('задача проекта', () => {
  it('разбирается без ссылки и без размещения', () => {
    expect(projectTaskSchema.parse(LOOSE).placement).toBeNull();
  });

  it('размещение приходит объектом, а не плоскими полями', () => {
    // «Вне версии» обязано читаться одним условием: четыре `null` рядом
    // проверялись бы по одному, и первая же забытая проверка дала бы
    // задачу, у которой версии нет, а позиция есть.
    const placed = projectTaskSchema.parse({
      ...LOOSE,
      placement: {
        versionId: ID,
        versionLabel: 'v1.2',
        isDone: false,
        position: 1,
        carriedFromVersionId: null,
      },
    });

    expect(placed.placement).toMatchObject({ versionLabel: 'v1.2', isDone: false });
  });

  it('у незакрытого размещения `isDone` ложь, а не отсутствие', () => {
    // Отличие от `placement: null` смысловое: там задачи в версии нет
    // вовсе, здесь она есть и не закрыта.
    const placed = projectTaskSchema.parse({
      ...LOOSE,
      placement: {
        versionId: ID,
        versionLabel: 'v1.2',
        isDone: false,
        position: 1,
        carriedFromVersionId: null,
      },
    });

    expect(placed.placement).not.toBeNull();
    expect(placed.placement?.isDone).toBe(false);
  });

  it('предел формулировки тот же, что у строки черновика саммари', () => {
    // Это одна и та же формулировка: строка черновика в релизе ею и
    // становится. Два числа разошлись бы на первой правке, и тогда
    // принятая в черновике задача не доехала бы до реестра.
    expect(MAX_PROJECT_TASK_TITLE).toBe(300);
    expect(() =>
      projectTaskCreateSchema.parse({ title: 'я'.repeat(MAX_PROJECT_TASK_TITLE + 1) }),
    ).toThrow();
  });

  it('создание требует формулировку и терпит отсутствие остального', () => {
    expect(projectTaskCreateSchema.parse({ title: 'Задача' })).toEqual({ title: 'Задача' });
  });

  it('пустая формулировка отвергается', () => {
    expect(() => projectTaskCreateSchema.parse({ title: '   ' })).toThrow();
  });

  it('лишнее поле в создании — отказ, а не молчаливое отбрасывание', () => {
    // Строгие схемы: `origin` задаёт сервер, и присланный клиентом
    // `origin: "model"` сделал бы признак «предложено моделью» ложью.
    expect(() =>
      projectTaskCreateSchema.parse({ title: 'Задача', origin: TaskOrigin.Summary }),
    ).toThrow();
  });

  it('правка без полей разбирается: отсутствие значит «не трогать»', () => {
    // Пустое тело — законный запрос «ничего не менять»: набор платформ
    // отсутствием поля и сохраняется, как в черновике саммари.
    expect(projectTaskUpdateSchema.parse({})).toEqual({});
  });

  it('в правке `url` снимается значением null, а не пустой строкой', () => {
    expect(projectTaskUpdateSchema.parse({ url: null }).url).toBeNull();
    expect(() => projectTaskUpdateSchema.parse({ url: '' })).toThrow();
  });

  it('пустой набор платформ в правке — «снять все»', () => {
    expect(projectTaskUpdateSchema.parse({ platformIds: [] }).platformIds).toEqual([]);
  });

  it('происхождение — закрытый перечень трёх путей', () => {
    // Задача приходит руками, из саммари и из роадмапа. Четвёртого пути
    // нет, и перечень обязан это удерживать.
    expect(Object.values(TaskOrigin)).toEqual(['manual', 'summary', 'roadmap']);
  });
});
