import { describe, expect, it } from 'vitest';

import { TaskOrigin, TrackerKind } from '../enums';
import {
  MAX_PROJECT_TASK_TITLE,
  projectTaskCreateSchema,
  projectTaskSchema,
  projectTaskUpdateSchema,
} from './task';

const ID = '11111111-1111-1111-1111-111111111111';

/** Задача вне версии и не выгруженная: ни размещения, ни зеркала. */
const LOOSE = {
  id: ID,
  projectId: ID,
  title: 'Починить предел текста',
  url: null,
  origin: TaskOrigin.Manual,
  sourceSummaryId: null,
  platformIds: [],
  placement: null,
  export: null,
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:00.000Z',
};

/** Зеркало выгрузки: задача в трекере есть и там не закрыта. */
const EXPORT = {
  tracker: TrackerKind.Weeek,
  externalId: '4096',
  externalUrl: 'https://app.weeek.net/ws/42/project/7/task/4096',
  externalBoardId: '11',
  externalColumnId: '31',
  isCompleted: false,
  exportedAt: '2026-11-21T10:00:00.000Z',
  updatedAt: '2026-11-21T10:00:00.000Z',
  checkedAt: '2026-11-21T10:05:00.000Z',
  failureCode: null,
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

  it('«не выгружалась» читается одним условием', () => {
    // Объектом, а не плоскими полями, по той же причине, что размещение:
    // пустой `external_id` рядом с ложным `is_completed` означал бы и «не
    // выгружали», и «выгрузили, и там открыта» — одним и тем же.
    expect(projectTaskSchema.parse(LOOSE).export).toBeNull();
  });

  it('выгруженная и не закрытая задача отличается от невыгруженной', () => {
    // Два разных ответа на вопрос «что с ней в трекере»: «её там нет» и
    // «она там есть и открыта». Сводить их нельзя — на первом экран
    // показывает кнопку «Выгрузить», на втором ссылку наружу.
    const exported = projectTaskSchema.parse({ ...LOOSE, export: EXPORT });

    expect(exported.export).not.toBeNull();
    expect(exported.export?.isCompleted).toBe(false);
  });

  it('ссылка человека и ссылка трекера — разные поля', () => {
    // `url` вписал человек, и выгрузка его **не перезаписывает** (дизайн,
    // 3.1): одно поле на две ссылки означало бы, что первая же выгрузка
    // затёрла заметку, которую человек держал именно здесь.
    const exported = projectTaskSchema.parse({
      ...LOOSE,
      url: 'https://notes.example/oplata',
      export: EXPORT,
    });

    expect(exported.url).toBe('https://notes.example/oplata');
    expect(exported.export?.externalUrl).toBe(
      'https://app.weeek.net/ws/42/project/7/task/4096',
    );
  });

  it('зеркало закрытия не закрывает размещение', () => {
    // Решение владельца (дизайн, 5): внешний статус — только зеркало.
    // Поэтому «закрыта там, открыта здесь» — законное состояние задачи, и
    // контракт обязан его принимать, а не схлопывать в одно поле.
    const diverged = projectTaskSchema.parse({
      ...LOOSE,
      placement: {
        versionId: ID,
        versionLabel: 'v1.2',
        isDone: false,
        position: 1,
        carriedFromVersionId: null,
      },
      export: { ...EXPORT, isCompleted: true },
    });

    expect(diverged.export?.isCompleted).toBe(true);
    expect(diverged.placement?.isDone).toBe(false);
  });

  it('происхождение — закрытый перечень трёх путей', () => {
    // Задача приходит руками, из саммари и из роадмапа. Четвёртого пути
    // нет, и перечень обязан это удерживать.
    expect(Object.values(TaskOrigin)).toEqual(['manual', 'summary', 'roadmap']);
  });
});
