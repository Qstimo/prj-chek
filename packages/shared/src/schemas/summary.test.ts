import { describe, expect, it } from 'vitest';

import { PlatformKind, SummaryTaskOrigin, TranscriberKind, TranscriptionState } from '../enums';
import {
  MAX_SUMMARY_TASKS,
  normalizeSummaryText,
  summaryCreateSchema,
  summaryDetailSchema,
  summaryListItemSchema,
  summaryTasksReplaceSchema,
  summarySuggesterStampSchema,
} from './summary';

const ID = '00000000-0000-0000-0000-000000000001';
const PLATFORM_ID = '00000000-0000-0000-0000-000000000002';

/** Минимально полная строка истории: от неё отталкивается и деталь. */
const LIST_ITEM = {
  id: ID,
  projectId: ID,
  projectName: 'CAIRN',
  occurredOn: '2026-11-16',
  title: 'Созвон по релизу',
  taskCount: 0,
  isReleased: false,
  releasedVersionId: null,
  releasedVersionLabel: null,
  createdAt: '2026-11-16T10:00:00.000Z',
};

/** Минимально полная деталь: от неё отталкиваются точечные проверки. */
const DETAIL = {
  ...LIST_ITEM,
  chronicleEntryId: ID,
  text: 'текст',
  tasks: [],
  suggester: null,
  isTextStale: false,
  suggestedVersionLabel: null,
  platforms: [],
  recording: null,
  transcription: null,
};

/** Задача расшифровки, принёсшая текст этого саммари. */
const JOB = {
  id: ID,
  projectId: ID,
  projectName: 'CAIRN',
  summaryId: ID,
  occurredOn: null,
  title: null,
  state: TranscriptionState.Running,
  transcriber: TranscriberKind.External,
  model: 'general',
  host: 'stt.api.cloud.yandex.net',
  uploadBytes: 566_231_040,
  uploadType: 'video/mp4',
  audioBytes: 11_534_336,
  audioType: 'audio/ogg',
  hasRecording: true,
  failureCode: null,
  startedAt: '2026-11-17T10:00:00.000Z',
  sentAt: '2026-11-17T10:04:12.000Z',
  finishedAt: null,
};

describe('создание саммари', () => {
  it('принимает дату, заголовок и текст', () => {
    expect(() =>
      summaryCreateSchema.parse({ occurredOn: '2026-11-16', title: 'Созвон', text: 'текст' }),
    ).not.toThrow();
  });

  it('отвергает пустой текст', () => {
    expect(() =>
      summaryCreateSchema.parse({ occurredOn: '2026-11-16', title: 'Созвон', text: '   ' }),
    ).toThrow();
  });

  it('отвергает текст длиннее предела записи хроники', () => {
    // Предел взят оттуда, куда текст поедет: 65 536 у
    // `chronicleEntryCreate.content`. Иначе отказ пришёл бы не оттуда,
    // где его ждут.
    expect(() =>
      summaryCreateSchema.parse({
        occurredOn: '2026-11-16',
        title: 'Созвон',
        text: 'я'.repeat(65_537),
      }),
    ).toThrow();
  });

  it('отвергает пустую дату события', () => {
    expect(() =>
      summaryCreateSchema.parse({ occurredOn: null, title: 'Созвон', text: 'текст' }),
    ).toThrow();
  });

  it('отвергает лишнее поле', () => {
    // Строгая схема: лишний ключ — опечатка клиента, а не вольность.
    expect(() =>
      summaryCreateSchema.parse({
        occurredOn: '2026-11-16',
        title: 'Созвон',
        text: 'текст',
        projectId: ID,
      }),
    ).toThrow();
  });
});

describe('замена черновика', () => {
  it('строка без id — новая, набранная человеком', () => {
    const parsed = summaryTasksReplaceSchema.parse({ tasks: [{ title: 'Сделать' }] });

    expect(parsed.tasks[0]?.id).toBeUndefined();
  });

  it('позиции не принимаются: порядок задаёт порядок массива', () => {
    // Второе место для порядка разошлось бы с первым.
    expect(() =>
      summaryTasksReplaceSchema.parse({ tasks: [{ title: 'Сделать', position: 1 }] }),
    ).toThrow();
  });

  it('отвергает пустую формулировку', () => {
    expect(() => summaryTasksReplaceSchema.parse({ tasks: [{ title: '  ' }] })).toThrow();
  });

  it('отвергает формулировку длиннее чекпоинта', () => {
    expect(() =>
      summaryTasksReplaceSchema.parse({ tasks: [{ title: 'я'.repeat(301) }] }),
    ).toThrow();
  });

  it('отвергает массив длиннее предела формы', () => {
    const tasks = Array.from({ length: MAX_SUMMARY_TASKS + 1 }, () => ({ title: 'Сделать' }));

    expect(() => summaryTasksReplaceSchema.parse({ tasks })).toThrow();
  });

  it('пустой массив законен: черновик очищают перед новой разбивкой', () => {
    expect(summaryTasksReplaceSchema.parse({ tasks: [] }).tasks).toEqual([]);
  });
});

describe('строка истории', () => {
  it('несёт версию-получателя: ссылка ведёт на открытую версию', () => {
    // Дизайн 7.2 обещает `…/roadmap?version=<id>`, а без поля в строке
    // ссылка вела бы на полосу целиком.
    const parsed = summaryListItemSchema.parse({
      ...LIST_ITEM,
      isReleased: true,
      releasedVersionId: ID,
      releasedVersionLabel: 'v1.4',
    });

    expect(parsed.releasedVersionId).toBe(ID);
  });

  it('версия-получатель может быть скрыта: без выдачи на роадмап её нет', () => {
    expect(summaryListItemSchema.parse(LIST_ITEM).releasedVersionId).toBeNull();
  });
});

describe('деталь саммари', () => {
  it('подсказка обозначения версии может отсутствовать', () => {
    // `null` значит «подставлять нечего»: версий нет, в обозначениях нет
    // цифр, или у субъекта нет выдачи на роадмап.
    expect(summaryDetailSchema.parse(DETAIL).suggestedVersionLabel).toBeNull();
  });

  it('несёт признак устаревшего текста', () => {
    expect(summaryDetailSchema.parse({ ...DETAIL, isTextStale: true }).isTextStale).toBe(true);
  });

  it('задача несёт происхождение', () => {
    const parsed = summaryDetailSchema.parse({
      ...DETAIL,
      tasks: [
        {
          id: ID,
          title: 'Сделать',
          position: 1,
          origin: SummaryTaskOrigin.Model,
          url: null,
          platformIds: [],
        },
      ],
    });

    expect(parsed.tasks[0]?.origin).toBe(SummaryTaskOrigin.Model);
  });
});

describe('поля чекпоинта в черновике', () => {
  it('задача несёт ссылку и теги платформ', () => {
    // Два поля чекпоинта, которые заполняет человек до переезда: иначе
    // список пришлось бы проходить дважды (дизайн, раздел 1).
    const parsed = summaryDetailSchema.parse({
      ...DETAIL,
      tasks: [
        {
          id: ID,
          title: 'Сделать',
          position: 1,
          origin: SummaryTaskOrigin.Human,
          url: 'https://tracker.example/CAIRN-1',
          platformIds: [PLATFORM_ID],
        },
      ],
    });

    expect(parsed.tasks[0]?.url).toBe('https://tracker.example/CAIRN-1');
    expect(parsed.tasks[0]?.platformIds).toEqual([PLATFORM_ID]);
  });

  it('у задачи без ссылки она пуста, а не отсутствует', () => {
    // `null` — состояние «ссылки нет»; необязательного поля в выдаче не
    // бывает, иначе клиент различал бы два вида пустоты.
    expect(() =>
      summaryDetailSchema.parse({
        ...DETAIL,
        tasks: [{ id: ID, title: 'Сделать', position: 1, origin: SummaryTaskOrigin.Model }],
      }),
    ).toThrow();
  });

  it('деталь несёт платформы проекта для чипов', () => {
    const parsed = summaryDetailSchema.parse({
      ...DETAIL,
      platforms: [{ id: PLATFORM_ID, kind: PlatformKind.Server, name: 'API', position: 1 }],
    });

    expect(parsed.platforms[0]?.name).toBe('API');
  });

  it('пустой список платформ законен и накрывает два случая', () => {
    // «У проекта нет платформ» и «у субъекта нет выдачи на роадмап» —
    // намеренно неотличимы: отличимость второго и была бы утечкой
    // признака (дизайн, 3.2).
    expect(summaryDetailSchema.parse(DETAIL).platforms).toEqual([]);
  });
});

describe('деталь саммари: запись созвона', () => {
  it('записи может не быть вовсе: текст вставили руками', () => {
    expect(summaryDetailSchema.parse(DETAIL).recording).toBeNull();
    expect(summaryDetailSchema.parse(DETAIL).transcription).toBeNull();
  });

  it('несёт и размер дорожки, и размер загруженного', () => {
    // Человек загружал видео, а слушает дорожку, и экран обязан сказать
    // это так, чтобы он не удивился (дизайн, 8.5).
    const parsed = summaryDetailSchema.parse({
      ...DETAIL,
      recording: {
        bytes: 11_534_336,
        mediaType: 'audio/ogg',
        uploadBytes: 566_231_040,
        uploadType: 'video/mp4',
        isSourceRemoved: true,
        uploadedAt: '2026-11-17T10:00:00.000Z',
      },
      transcription: JOB,
    });

    expect(parsed.recording?.bytes).toBe(11_534_336);
    expect(parsed.recording?.uploadBytes).toBe(566_231_040);
    expect(parsed.transcription?.state).toBe(TranscriptionState.Running);
  });

  it('помнит, убран ли исходник', () => {
    // Исходник убирается при укладке текста (решение владельца 2), и
    // экран обязан сказать правду в обоих случаях: у саммари из видео —
    // «исходник убран», у саммари из mp3 — ничего, потому что убирать
    // было нечего (файл один).
    const fromMp3 = summaryDetailSchema.parse({
      ...DETAIL,
      recording: {
        bytes: 10_000_000,
        mediaType: 'audio/mpeg',
        uploadBytes: 10_000_000,
        uploadType: 'audio/mpeg',
        isSourceRemoved: false,
        uploadedAt: '2026-11-17T10:00:00.000Z',
      },
      transcription: null,
    });

    expect(fromMp3.recording?.isSourceRemoved).toBe(false);
  });
});

describe('замена черновика: два новых поля', () => {
  it('принимает ссылку и теги', () => {
    const parsed = summaryTasksReplaceSchema.parse({
      tasks: [
        {
          id: ID,
          title: 'Сделать',
          url: 'https://tracker.example/1',
          platformIds: [PLATFORM_ID],
        },
      ],
    });

    expect(parsed.tasks[0]?.platformIds).toEqual([PLATFORM_ID]);
  });

  it('отсутствие полей законно: означает «не трогать»', () => {
    // Редактор субъекта без выдачи на роадмап чипов не видит и набор не
    // отправляет — и теги выживают (дизайн, 3.3).
    const parsed = summaryTasksReplaceSchema.parse({ tasks: [{ id: ID, title: 'Сделать' }] });

    expect(parsed.tasks[0]?.platformIds).toBeUndefined();
    expect(parsed.tasks[0]?.url).toBeUndefined();
  });

  it('снять ссылку и теги можно явно', () => {
    const parsed = summaryTasksReplaceSchema.parse({
      tasks: [{ id: ID, title: 'Сделать', url: null, platformIds: [] }],
    });

    expect(parsed.tasks[0]?.url).toBeNull();
    expect(parsed.tasks[0]?.platformIds).toEqual([]);
  });

  it('отвергает адрес не адресом', () => {
    expect(() =>
      summaryTasksReplaceSchema.parse({ tasks: [{ title: 'Сделать', url: 'CAIRN-1' }] }),
    ).toThrow();
  });

  it('отвергает адрес длиннее предела чекпоинта', () => {
    // Предел взят оттуда, куда значение поедет: 2000 у `url` чекпоинта.
    const url = `https://tracker.example/${'a'.repeat(2000)}`;

    expect(() => summaryTasksReplaceSchema.parse({ tasks: [{ title: 'Сделать', url }] })).toThrow();
  });

  it('отвергает повторяющиеся теги', () => {
    // Та же `platformIdsSchema`, что у чекпоинта: своей схемы не заводим.
    expect(() =>
      summaryTasksReplaceSchema.parse({
        tasks: [{ title: 'Сделать', platformIds: [PLATFORM_ID, PLATFORM_ID] }],
      }),
    ).toThrow();
  });

  it('отвергает больше двадцати тегов на строку', () => {
    const platformIds = Array.from(
      { length: 21 },
      (_, index) => `00000000-0000-0000-0000-0000000000${String(index + 10)}`,
    );

    expect(() =>
      summaryTasksReplaceSchema.parse({ tasks: [{ title: 'Сделать', platformIds }] }),
    ).toThrow();
  });
});

describe('нормализация текста', () => {
  it('снимает один ведущий BOM', () => {
    expect(normalizeSummaryText('﻿текст')).toBe('текст');
  });

  it('второй BOM остаётся символом текста, а не снимается молча', () => {
    expect(normalizeSummaryText('﻿﻿текст')).toBe('﻿текст');
  });

  it('приводит переводы строк к LF', () => {
    // Иначе один и тот же текст менял бы длину от платформы автора.
    expect(normalizeSummaryText('раз\r\nдва')).toBe('раз\nдва');
  });

  it('оставляет перевод строки и табуляцию', () => {
    expect(normalizeSummaryText('раз\n\tдва')).toBe('раз\n\tдва');
  });

  it('отвергает NUL', () => {
    // До колонки `text` в PostgreSQL он не доходит вовсе.
    expect(() => normalizeSummaryText('раз\u0000два')).toThrow();
  });

  it('отвергает прочие управляющие символы, а не чистит молча', () => {
    // Текст созвона — то, что прислал человек; подменять его тихо нельзя.
    expect(() => normalizeSummaryText('раз\u0007два')).toThrow();
  });
});

describe('число отброшенных в отметке разбивки', () => {
  const stamp = { name: 'local', model: 'модель', at: '2026-11-16T10:00:00Z' };

  it.each([0, 7, null])('сохраняет значение %s, включая неизвестное у старой разбивки', (dropped) => {
    expect(summarySuggesterStampSchema.parse({ ...stamp, dropped })).toEqual({ ...stamp, dropped });
  });

  it.each([-1, 1.5, '7', undefined])('отвергает негодное или отсутствующее число %s', (dropped) => {
    expect(() => summarySuggesterStampSchema.parse({ ...stamp, dropped })).toThrow();
  });
});
