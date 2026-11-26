import { describe, expect, it } from 'vitest';

import { ModelProbeOutcome, TaskExportOutcome, TrackerKind } from '../enums';
import {
  MAX_TASK_EXPORT_BATCH,
  parseTrackerBaseUrl,
  projectTrackerSchema,
  TRACKER_BAD_URL,
  TRACKER_REJECTED,
  taskExportRequestSchema,
  taskExportResultSchema,
  taskExportSchema,
  taskSyncResultSchema,
  trackerBindingSchema,
  trackerBindingUpdateSchema,
  trackerConnectionSchema,
  trackerConnectionUpdateSchema,
  trackerProbeResultSchema,
  trackerTargetsSchema,
} from './tracker';

const ID = '11111111-1111-1111-1111-111111111111';

describe('trackerConnectionUpdateSchema', () => {
  const valid = {
    baseUrl: 'https://api.weeek.net/public/v1',
    workspaceId: null,
    isEnabled: true,
  };

  it('принимает настройку без поля ключа: «не менять»', () => {
    // Три состояния секрета — ровно как у узла модели: открыть форму,
    // ничего не трогая, и сохранить не должно стирать токен.
    expect(trackerConnectionUpdateSchema.parse(valid).secret).toBeUndefined();
  });

  it('принимает null в ключе: «убрать»', () => {
    expect(trackerConnectionUpdateSchema.parse({ ...valid, secret: null }).secret).toBeNull();
  });

  it('принимает строку в ключе: «поставить»', () => {
    expect(trackerConnectionUpdateSchema.parse({ ...valid, secret: 'weeek-token' }).secret).toBe(
      'weeek-token',
    );
  });

  it('отвергает пустую строку в ключе', () => {
    // Иначе «убрать токен» и «форма отправила незаполненное поле» были бы
    // одним и тем же.
    expect(trackerConnectionUpdateSchema.safeParse({ ...valid, secret: '' }).success).toBe(false);
  });

  it('отвергает лишние поля', () => {
    // `kind` приходит адресом ручки, а не телом: перечень — первичный ключ
    // строки, и тело, способное его переписать, меняло бы не ту настройку.
    expect(
      trackerConnectionUpdateSchema.safeParse({ ...valid, kind: TrackerKind.Weeek }).success,
    ).toBe(false);
  });

  it('отвергает http: токен ушёл бы по открытому каналу', () => {
    // У трекера нет вида «в контуре» (у `tracker_connections` нет колонки
    // размещения), значит ветки, в которой `http` оправдан, не бывает.
    expect(
      trackerConnectionUpdateSchema.safeParse({ ...valid, baseUrl: 'http://api.weeek.net/public/v1' })
        .success,
    ).toBe(false);
  });

  it('отвергает строку запроса и данные входа в адресе', () => {
    // Ровно так токен оказывается в адресе у части провайдеров, а из
    // адреса он уехал бы и на экран, и в журнал, и в текст отказа.
    expect(
      trackerConnectionUpdateSchema.safeParse({ ...valid, baseUrl: 'https://api.weeek.net/v1?token=t' })
        .success,
    ).toBe(false);
    expect(
      trackerConnectionUpdateSchema.safeParse({ ...valid, baseUrl: 'https://u:p@api.weeek.net/v1' })
        .success,
    ).toBe(false);
  });

  it('принимает адрес с замыкающей косой: нормализует его разборщик', () => {
    expect(
      trackerConnectionUpdateSchema.safeParse({
        ...valid,
        baseUrl: 'https://api.weeek.net/public/v1/',
      }).success,
    ).toBe(true);
  });
});

describe('parseTrackerBaseUrl', () => {
  it('снимает замыкающую косую черту', () => {
    // Адаптер дописывает `/tm/tasks`, и двойная косая дала бы `404`.
    expect(parseTrackerBaseUrl('https://api.weeek.net/public/v1/')).toBe(
      'https://api.weeek.net/public/v1',
    );
  });

  it('сохраняет путь, а не только имя узла', () => {
    // Адрес — то, что человек скопировал из документации Weeek: собрать
    // его обратно иначе значило бы послать запрос не туда.
    expect(parseTrackerBaseUrl('https://api.weeek.net/public/v1')).toBe(
      'https://api.weeek.net/public/v1',
    );
  });

  it.each([
    'http://api.weeek.net/public/v1',
    'https://api.weeek.net/v1?token=t',
    'https://api.weeek.net/v1#t',
    'https://u:p@api.weeek.net/v1',
    'ftp://api.weeek.net/v1',
    'не адрес',
  ])('отвергает негодный адрес %s кодом отказа', (raw) => {
    expect(() => parseTrackerBaseUrl(raw)).toThrow(TRACKER_BAD_URL);
  });
});

describe('trackerConnectionSchema', () => {
  it('токена в проекции нет ни одним полем, кроме «задан»', () => {
    // Токен не выходит ни в ответ ручки, ни в журнал, ни в текст отказа
    // (дизайн, 3.4). Ни длины, ни хвоста: хвост сужает перебор и не
    // отвечает ни на один вопрос, на который не отвечает «задан».
    const keys = Object.keys(trackerConnectionSchema.shape);

    expect(keys).toContain('hasSecret');
    expect(keys.filter((key) => /secret|token/i.test(key))).toEqual(['hasSecret']);
  });

  it('называет, почему трекер не работает, кодом, а не фразой', () => {
    const connection = trackerConnectionSchema.parse({
      kind: TrackerKind.Weeek,
      baseUrl: 'https://api.weeek.net/public/v1',
      workspaceId: null,
      hasSecret: false,
      isEnabled: true,
      isOperational: false,
      blockedBy: 'secret_missing',
      updatedAt: null,
      updatedByLabel: null,
    });

    expect(connection.blockedBy).toBe('secret_missing');
  });

  it('у настроенного трекера причины нет вовсе', () => {
    expect(
      trackerConnectionSchema.parse({
        kind: TrackerKind.Weeek,
        baseUrl: 'https://api.weeek.net/public/v1',
        workspaceId: '42',
        hasSecret: true,
        isEnabled: true,
        isOperational: true,
        blockedBy: null,
        updatedAt: '2026-11-20T10:00:00.000Z',
        updatedByLabel: 'владелец@cairn.local',
      }).isOperational,
    ).toBe(true);
  });
});

describe('trackerTargetsSchema', () => {
  it('принимает три независимых списка с родителями у досок и колонок', () => {
    // Три списка, а не дерево: Weeek отдаёт их тремя ручками, и сложить
    // их в дерево на сервере значило бы спрятать, какая именно вернулась
    // пустой — а это ровно то, что человек должен увидеть.
    const targets = trackerTargetsSchema.parse({
      projects: [{ id: '7', name: 'CAIRN' }],
      boards: [{ id: '11', name: 'Разработка', projectId: '7' }],
      columns: [{ id: '31', name: 'К работе', boardId: '11' }],
    });

    expect(targets.boards[0]?.projectId).toBe('7');
    expect(targets.columns[0]?.boardId).toBe('11');
  });

  it('идентификаторы чужой системы — строки, а не числа', () => {
    // Арифметики над ними нет, у второго трекера они могут быть не
    // числом, а большое число потеряло бы точность в `number`.
    expect(
      trackerTargetsSchema.safeParse({
        projects: [{ id: 7, name: 'CAIRN' }],
        boards: [],
        columns: [],
      }).success,
    ).toBe(false);
  });

  it('пустые списки законны: пространство может быть пустым', () => {
    expect(
      trackerTargetsSchema.parse({ projects: [], boards: [], columns: [] }).projects,
    ).toEqual([]);
  });
});

describe('trackerBindingUpdateSchema', () => {
  const valid = { externalProjectId: '7', boardId: '11', boardColumnId: '31' };

  it('принимает все три идентификатора', () => {
    expect(trackerBindingUpdateSchema.parse(valid).boardColumnId).toBe('31');
  });

  it('требует колонку: иначе задача легла бы «куда-нибудь»', () => {
    // Дизайн 3.5: без привязки выгрузка отказывает названной причиной, а
    // не угадывает место. Половина привязки — то же угадывание.
    const { boardColumnId, ...withoutColumn } = valid;

    expect(trackerBindingUpdateSchema.safeParse(withoutColumn).success).toBe(false);
  });

  it('отвергает пустые идентификаторы', () => {
    expect(trackerBindingUpdateSchema.safeParse({ ...valid, boardId: '' }).success).toBe(false);
  });

  it('отвергает лишние поля', () => {
    // `tracker` приходит не телом: трекер на установку один (дизайн, 10.1),
    // и выбор его в теле описывал бы настройку, которой нет.
    expect(trackerBindingUpdateSchema.safeParse({ ...valid, tracker: 'weeek' }).success).toBe(
      false,
    );
  });

  it('принимает общее условие завершения и пустоту', () => {
    expect(trackerBindingUpdateSchema.parse({ ...valid, completionColumnId: '99' })).toMatchObject({
      completionColumnId: '99',
    });
    expect(
      trackerBindingUpdateSchema.parse({ ...valid, completionColumnId: null }).completionColumnId,
    ).toBeNull();
    expect(trackerBindingUpdateSchema.parse(valid).completionColumnId).toBeUndefined();
  });
});

describe('trackerBindingSchema', () => {
  it('называет трекер: вторая выгрузка того же проекта пойдёт в другой', () => {
    expect(
      trackerBindingSchema.parse({
        tracker: TrackerKind.Weeek,
        externalProjectId: '7',
        boardId: '11',
        boardColumnId: '31',
        completionColumnId: '99',
        updatedAt: '2026-11-20T10:00:00.000Z',
        updatedByLabel: 'владелец@cairn.local',
      }),
    ).toMatchObject({ tracker: TrackerKind.Weeek, completionColumnId: '99' });
  });
});

describe('trackerProbeResultSchema', () => {
  it('исход без имени модели: у трекера модели нет вовсе', () => {
    // Своя схема рядом с `modelProbeResultSchema`, а не её повтор: там
    // `model` обязателен, и трекеру пришлось бы присылать пустую строку —
    // поле, которое ничего не значит, читается как «модель неизвестна».
    expect(
      trackerProbeResultSchema.parse({
        outcome: ModelProbeOutcome.Ok,
        status: 200,
        host: 'api.weeek.net',
        durationMs: 120,
      }),
    ).toMatchObject({ outcome: ModelProbeOutcome.Ok, host: 'api.weeek.net' });
  });

  it('отвергает тело чужого ответа под любым именем', () => {
    // `.strict()` здесь — не формальность: исход уходит на экран и в
    // журнал, а в теле чужого ответа бывает и сам токен в сообщении о
    // неверном заголовке.
    expect(
      trackerProbeResultSchema.safeParse({
        outcome: ModelProbeOutcome.Unauthorized,
        status: 401,
        host: 'api.weeek.net',
        durationMs: 3,
        body: '{"message":"Bearer weeek-token is invalid"}',
      }).success,
    ).toBe(false);
  });
});

describe('taskExportSchema', () => {
  const exported = {
    tracker: TrackerKind.Weeek,
    externalId: '4096',
    externalUrl: 'https://app.weeek.net/ws/42/project/7/task/4096',
    externalBoardId: '11',
    externalColumnId: '31',
    isCompleted: false,
    exportedAt: '2026-11-21T10:00:00.000Z',
    updatedAt: '2026-11-21T10:00:00.000Z',
    checkedAt: null,
    failureCode: null,
  };

  it('выгруженная и не закрытая задача — состояние, а не отсутствие зеркала', () => {
    // Различие с «не выгружалась» (`export: null`) смысловое: там задачи в
    // трекере нет вовсе, здесь она есть и открыта. Сведение их в один
    // `isCompleted: false` стёрло бы вопрос «а выгружали ли вообще».
    expect(taskExportSchema.parse(exported)).toMatchObject({
      externalId: '4096',
      isCompleted: false,
    });
  });

  it('«ни разу не спрашивали» отличимо от «спрашивали и не менялось»', () => {
    // `checked_at` пишется при **каждом** опросе, даже когда ничего не
    // изменилось (дизайн, 3.3). Поэтому пусто означает ровно «опроса ещё
    // не было» — та же ошибка, что аптайм без пропусков наблюдения:
    // молчание нельзя читать как «всё хорошо».
    expect(taskExportSchema.parse(exported).checkedAt).toBeNull();
    expect(taskExportSchema.parse({ ...exported, checkedAt: '2026-11-21T10:05:00.000Z' }).checkedAt).toBe(
      '2026-11-21T10:05:00.000Z',
    );
  });

  it('у удачного обмена кода неудачи нет вовсе', () => {
    expect(taskExportSchema.parse(exported).failureCode).toBeNull();
    expect(taskExportSchema.parse({ ...exported, failureCode: 'tracker_unavailable' }).failureCode).toBe(
      'tracker_unavailable',
    );
  });

  it('ссылки трекера может не быть: её формат живым токеном не проверен', () => {
    // Дизайн 10.4: формат человеческой ссылки неизвестен, и пустая ссылка
    // честно означает «мы её не знаем» — в отличие от собранной по
    // выдуманному шаблону, которая увела бы человека на `404`.
    expect(taskExportSchema.parse({ ...exported, externalUrl: null }).externalUrl).toBeNull();
  });

  it('доска названа всегда, колонка — нет: её назначает трекер', () => {
    // «Куда положили» известно из привязки до первого байта; «где лежит
    // сейчас» приходит ответом трекера, и ответ может колонку не назвать.
    // Подставить туда колонку привязки значило бы утверждать, что задачу
    // не двигали, — ровно то, за чем на экран и смотрят.
    expect(taskExportSchema.safeParse({ ...exported, externalBoardId: null }).success).toBe(false);
    expect(taskExportSchema.parse({ ...exported, externalColumnId: null }).externalColumnId).toBeNull();
  });

  it('отвергает тело чужого ответа под любым именем', () => {
    // `.strict()` здесь — не формальность: зеркало собирается из ответа
    // Weeek, и поле «как пришло» унесло бы на экран тело чужого ответа, в
    // котором бывает и сам токен в сообщении о неверном заголовке.
    expect(taskExportSchema.safeParse({ ...exported, payload: '{"token":"weeek-token"}' }).success).toBe(
      false,
    );
  });
});

describe('taskExportRequestSchema', () => {
  it('набор из одной задачи и есть одна задача', () => {
    // Одна ручка на одну и на много (план, C2): вторая ручка «выгрузить
    // одну» повторяла бы порядок действий, в котором запись в журнал
    // обязана идти до первого байта.
    expect(taskExportRequestSchema.parse({ taskIds: [ID] }).taskIds).toEqual([ID]);
  });

  it('пустой набор отвергается: выгружать нечего', () => {
    expect(taskExportRequestSchema.safeParse({ taskIds: [] }).success).toBe(false);
  });

  it('предел набора назван и держится', () => {
    // Выгрузка идёт по одному запросу на задачу и последовательно, потому
    // что чужой API считает частоту. Значит длина набора — это время
    // ответа **нашей** ручки: набор без предела оборвался бы по таймауту
    // браузера, и человек не узнал бы, сколько задач уже уехало.
    expect(MAX_TASK_EXPORT_BATCH).toBe(50);
    expect(
      taskExportRequestSchema.safeParse({
        taskIds: Array.from({ length: MAX_TASK_EXPORT_BATCH + 1 }, () => ID),
      }).success,
    ).toBe(false);
  });

  it('отвергает лишние поля', () => {
    // Доска и колонка приходят привязкой проекта, а не телом запроса:
    // иначе субъект с записью на «Роадмап» положил бы задачу на чужую
    // доску, минуя настройку (дизайн, 3.5).
    expect(taskExportRequestSchema.safeParse({ taskIds: [ID], boardId: '11' }).success).toBe(false);
  });

  it('требует идентификаторы задач, а не их формулировки', () => {
    // Наружу уходит содержимое проекта, и его источник — реестр задач, а
    // не тело запроса: присланная формулировка уехала бы в Weeek, не
    // совпав ни с одной задачей в журнале.
    expect(taskExportRequestSchema.safeParse({ taskIds: ['Оплата картой'] }).success).toBe(false);
  });
});

describe('taskExportResultSchema', () => {
  const mirror = {
    tracker: TrackerKind.Weeek,
    externalId: '4096',
    externalUrl: 'https://app.weeek.net/ws/4242/task/4096',
    externalBoardId: '11',
    externalColumnId: '31',
    isCompleted: false,
    exportedAt: '2026-11-23T10:00:00.000Z',
    updatedAt: '2026-11-23T10:00:00.000Z',
    checkedAt: null,
    failureCode: null,
  };

  it('удачная выгрузка несёт зеркало и не несёт кода неудачи', () => {
    const parsed = taskExportResultSchema.parse({
      taskId: ID,
      outcome: TaskExportOutcome.Created,
      failureCode: null,
      export: mirror,
    });

    expect(parsed.export?.externalId).toBe('4096');
    expect(parsed.failureCode).toBeNull();
  });

  it('повторная выгрузка отличается от первой: ссылка та же, исход другой', () => {
    // Решение владельца: повторная выгрузка **правит** задачу в трекере
    // (`PUT /tm/tasks/{id}`), а не заводит вторую. Если бы исход был один
    // на оба случая, экран не смог бы сказать, что именно произошло, —
    // а это разные события и в журнале (`task.exported` против
    // `task.export_updated`).
    expect(
      taskExportResultSchema.parse({
        taskId: ID,
        outcome: TaskExportOutcome.Updated,
        failureCode: null,
        export: mirror,
      }).outcome,
    ).toBe('updated');
  });

  it('неудача называет код обмена, а не текст чужого ответа', () => {
    // Тела чужого ответа здесь нет никогда: в нём бывает и эхо присланной
    // формулировки, и сам токен — в сообщении о неверном заголовке.
    const parsed = taskExportResultSchema.parse({
      taskId: ID,
      outcome: TaskExportOutcome.Failed,
      failureCode: TRACKER_REJECTED,
      export: null,
    });

    expect([parsed.outcome, parsed.failureCode]).toEqual(['failed', TRACKER_REJECTED]);
  });

  it('«до задачи не дошли» — свой исход, а не отсутствие строки в ответе', () => {
    // Первый отказ обмена останавливает набор, и у остальных задач не
    // произошло ничего. Промолчать о них значило бы сделать «не пробовали»
    // неотличимым от «ответ потерялся по дороге».
    expect(
      taskExportResultSchema.parse({
        taskId: ID,
        outcome: TaskExportOutcome.Skipped,
        failureCode: null,
        export: null,
      }).outcome,
    ).toBe('skipped');
  });

  it('отвергает тело чужого ответа под любым именем', () => {
    expect(
      taskExportResultSchema.safeParse({
        taskId: ID,
        outcome: TaskExportOutcome.Failed,
        failureCode: TRACKER_REJECTED,
        export: null,
        response: '{"error":"Bearer sk-... is invalid"}',
      }).success,
    ).toBe(false);
  });
});

describe('projectTrackerSchema', () => {
  it('отдаёт готовность трекера и привязку, но не адрес и не токен', () => {
    // Проектному субъекту нужен ответ на «можно ли выгружать», а не
    // настройка установки: адрес и токен принадлежат `/settings`, и имя
    // узла здесь означало бы, что подрядчик читает чужую настройку.
    const parsed = projectTrackerSchema.parse({
      isOperational: true,
      blockedBy: null,
      binding: {
        tracker: TrackerKind.Weeek,
        externalProjectId: '7',
        boardId: '11',
        boardColumnId: '31',
        completionColumnId: null,
        updatedAt: '2026-11-20T10:00:00.000Z',
        updatedByLabel: 'владелец@cairn.local',
      },
    });

    expect(Object.keys(parsed)).toEqual(['isOperational', 'blockedBy', 'binding']);
  });

  it('привязки может не быть: это состояние, а не ошибка', () => {
    expect(
      projectTrackerSchema.parse({ isOperational: false, blockedBy: 'secret_missing', binding: null })
        .binding,
    ).toBeNull();
  });
});

describe('taskSyncResultSchema', () => {
  it('отдаёт исход общей синхронизации без содержимого проекта', () => {
    expect(taskSyncResultSchema.parse({ checked: 3, found: 2, failureCode: null })).toEqual({
      checked: 3,
      found: 2,
      failureCode: null,
    });
  });

  it('называет код отказа, но не тело чужого ответа', () => {
    expect(
      taskSyncResultSchema.safeParse({
        checked: 1,
        found: 0,
        failureCode: TRACKER_REJECTED,
        response: '{"token":"weeek-token"}',
      }).success,
    ).toBe(false);
  });
});
