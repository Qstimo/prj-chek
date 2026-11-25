import {
  ModelProbeOutcome,
  TRACKER_NOT_CONFIGURED,
  TRACKER_REJECTED,
  TRACKER_UNAVAILABLE,
  TrackerKind,
} from '@cairn/shared';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { DisabledTracker } from './disabled.tracker';
import { TrackerFailure, type TrackerTarget } from './tracker';
import type { TrackerSettings } from './tracker.settings';
import {
  TRACKER_LIST_PAGE_SIZE,
  TRACKER_MAX_LIST_PAGES,
  WeeekTracker,
} from './weeek.tracker';

/** Токен, которого не должно быть ни в одном сообщении отказа. */
const TOKEN = 'weeek-token-ОЧЕНЬ-СЕКРЕТНЫЙ';

/** Настройки боевого вида: точечные проверки меняют одно поле. */
const SETTINGS: TrackerSettings = {
  kind: TrackerKind.Weeek,
  baseUrl: 'https://api.weeek.net/public/v1',
  token: TOKEN,
  host: 'api.weeek.net',
  workspaceId: '4242',
  timeoutSeconds: 20,
  isEnabled: true,
};

/** Привязка проекта: куда класть задачу. */
const TARGET: TrackerTarget = {
  externalProjectId: '7',
  boardId: '11',
  boardColumnId: '31',
};

/** Ответ с телом JSON и кодом `200`. */
function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

/** Тело запроса, прочитанное из аргументов подменённого `fetch`. */
function bodyOf(call: Parameters<typeof fetch>): Record<string, unknown> {
  return JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>;
}

/**
 * Полная страница строк: ровно столько, сколько адаптер просит.
 *
 * Длина берётся из константы исходника, а не из литерала: тест проверяет
 * правило «страница полна — спроси следующую», а не выбранное число.
 */
function fullPage(prefix: string): Record<string, unknown>[] {
  return Array.from({ length: TRACKER_LIST_PAGE_SIZE }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix}-${index}`,
  }));
}

/** Значение параметра строки запроса из аргументов подменённого `fetch`. */
function paramOf(call: Parameters<typeof fetch>, name: string): string | null {
  return new URL(String(call[0])).searchParams.get(name);
}

describe('WeeekTracker', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Один вызов адаптера с готовым ответом: сокращает каждую проверку. */
  function tracker(): WeeekTracker {
    return new WeeekTracker(SETTINGS);
  }

  describe('readTaskLink', () => {
    const url = 'https://app.weeek.net/ws/4242/task/42';
    it('проверяет пространство и доску, читает статус без POST и PUT', async () => {
      fetchMock.mockResolvedValueOnce(json({ success: true, workspace: { id: 4242 } }))
        .mockResolvedValueOnce(json({ success: true, task: { id: 42, isCompleted: true,
          locations: [{ projectId: 7, boardId: 11, boardColumnId: 32 }] } }));
      const state = await tracker().readTaskLink(url, TARGET, AbortSignal.timeout(1000));
      expect(state).toMatchObject({ externalId: '42', externalUrl: url, isCompleted: true,
        boardId: '11', boardColumnId: '32' });
      expect(fetchMock.mock.calls.map((call) => call[1].method)).toEqual(['GET', 'GET']);
      expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
        'https://api.weeek.net/public/v1/ws', 'https://api.weeek.net/public/v1/tm/tasks/42']);
    });

    it('одинаковый id в другом пространстве не связывается', async () => {
      fetchMock.mockResolvedValue(json({ success: true, workspace: { id: 99 } }));
      await expect(tracker().readTaskLink(url, TARGET, AbortSignal.timeout(1000))).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('задача на другой доске не связывается', async () => {
      fetchMock.mockResolvedValueOnce(json({ success: true, workspace: { id: 4242 } }))
        .mockResolvedValueOnce(json({ success: true, task: { id: 42,
          locations: [{ projectId: 7, boardId: 99 }] } }));
      await expect(tracker().readTaskLink(url, TARGET, AbortSignal.timeout(1000))).rejects.toThrow();
    });

    it('по произвольному URL не делает запрос с нашим токеном', async () => {
      await expect(tracker().readTaskLink('https://other.test/ws/4242/task/42', TARGET,
        AbortSignal.timeout(1000))).rejects.toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('readImportTasks', () => {
    const raw = { id: 42, title: 'Оплата', assignees: ['u1'], authorId: 'u2',
      dueDate: '2026-11-25', createdAt: '2026-11-01T09:00:00Z', isCompleted: true,
      locations: [{ projectId: 7, boardId: 11, boardColumnId: 31 }] };
    function respond(options: { membersFail?: boolean; repeat?: boolean } = {}) {
      fetchMock.mockImplementation((url: string) => {
        if (url.endsWith('/ws')) return Promise.resolve(json({ workspace: { id: 4242 } }));
        if (url.endsWith('/ws/members')) return Promise.resolve(options.membersFail ? json({}, 403) : json({ members: [
          { id: 'u1', firstName: 'Иван', lastName: 'Иванов' }, { id: 'u2', name: 'Мария' },
        ] }));
        const query = new URL(url).searchParams;
        expect(query.get('projectId')).toBe('7');
        expect(query.get('boardId')).toBe('11');
        expect(query.get('all')).toBe('1');
        return Promise.resolve(json({ tasks: [raw,
          { ...raw, id: 43, isDeleted: true },
          { ...raw, id: 44, locations: [{ projectId: 99, boardId: 12 }] },
        ], hasMore: options.repeat === true }));
      });
    }
    it('читает закрытые задачи, исполнителя, автора и даты; исключает удалённые и чужую доску', async () => {
      respond();
      const result = await tracker().readImportTasks(TARGET, AbortSignal.timeout(1000));
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0]).toMatchObject({ externalId: '42', title: 'Оплата', isCompleted: true,
        externalUrl: 'https://app.weeek.net/ws/4242/task/42',
        details: { dueAt: '2026-11-25', createdAt: '2026-11-01T09:00:00Z',
          assignees: [{ id: 'u1', name: 'Иван Иванов' }], author: { id: 'u2', name: 'Мария' } } });
      expect(result.peopleAvailable).toBe(true);
      expect(result.truncated).toBe(false);
      expect(fetchMock.mock.calls.every((call) => call[1].method === 'GET')).toBe(true);
    });
    it('отсутствие права на имена не блокирует задачи и не выдумывает имя', async () => {
      respond({ membersFail: true });
      const result = await tracker().readImportTasks(TARGET, AbortSignal.timeout(1000));
      expect(result.peopleAvailable).toBe(false);
      expect(result.tasks[0]?.details.assignees).toEqual([{ id: 'u1', name: 'u1' }]);
    });
    it('повторившаяся неполная выдача отмечается усечённой, а не полной', async () => {
      respond({ repeat: true });
      const result = await tracker().readImportTasks(TARGET, AbortSignal.timeout(1000));
      expect(result.truncated).toBe(true);
      expect(result.tasks).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });

  describe('createTask', () => {
    it('посылает формулировку и все три идентификатора привязки', async () => {
      fetchMock.mockResolvedValue(json({ success: true, task: { id: 42 } }));

      await tracker().createTask({ title: 'Поднять предел текста' }, TARGET, AbortSignal.timeout(1000));

      const [url, init] = fetchMock.mock.calls[0] as Parameters<typeof fetch>;
      expect(url).toBe('https://api.weeek.net/public/v1/tm/tasks');
      expect((init as RequestInit).method).toBe('POST');
      expect(bodyOf(fetchMock.mock.calls[0] as Parameters<typeof fetch>)).toEqual({
        title: 'Поднять предел текста',
        projectId: '7',
        boardId: '11',
        boardColumnId: '31',
      });
    });

    it('об исполнителях, сроках и оценках в теле нет ничего', async () => {
      // ТЗ 1.4 выносит их за объём, и ровно затем задачу и отправляют в
      // трекер: исполнителей ведёт он (дизайн, 2).
      fetchMock.mockResolvedValue(json({ success: true, task: { id: 42 } }));

      await tracker().createTask({ title: 'Задача' }, TARGET, AbortSignal.timeout(1000));

      const body = bodyOf(fetchMock.mock.calls[0] as Parameters<typeof fetch>);
      expect(Object.keys(body)).toEqual(['title', 'projectId', 'boardId', 'boardColumnId']);
    });

    it('предъявляет токен словом Bearer и запрещает переадресацию', async () => {
      fetchMock.mockResolvedValue(json({ success: true, task: { id: 42 } }));

      await tracker().createTask({ title: 'Задача' }, TARGET, AbortSignal.timeout(1000));

      const init = (fetchMock.mock.calls[0] as Parameters<typeof fetch>)[1] as RequestInit;
      expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
      // Иначе ответом `307` настроенный трекер увёл бы формулировки задач
      // на любой чужой адрес, сохранив метод и тело.
      expect(init.redirect).toBe('error');
    });

    it('отдаёт внешний id строкой, хотя Weeek присылает число', async () => {
      fetchMock.mockResolvedValue(
        json({ success: true, task: { id: 42, boardId: 11, boardColumnId: 31, isCompleted: false } }),
      );

      const state = await tracker().createTask({ title: 'Задача' }, TARGET, AbortSignal.timeout(1000));

      expect(state).toMatchObject({
        externalId: '42',
        boardId: '11',
        boardColumnId: '31',
        isCompleted: false,
      });
    });

    it('ссылку берёт из ответа, когда она там есть', async () => {
      // Формат человеческой ссылки живым токеном не проверен (дизайн,
      // 10.4), и присланная трекером всегда вернее собранной нами.
      fetchMock.mockResolvedValue(
        json({ success: true, task: { id: 42, url: 'https://app.weeek.net/ws/4242/board/11/42' } }),
      );

      const state = await tracker().createTask({ title: 'Задача' }, TARGET, AbortSignal.timeout(1000));

      // Адрес нарочно не совпадает с нашим шаблоном: иначе тест прошёл бы
      // и у адаптера, который присланную ссылку выбрасывает.
      expect(state.externalUrl).toBe('https://app.weeek.net/ws/4242/board/11/42');
    });

    it('сам узнаёт пространство токена и создаёт ссылку, когда id не вводили', async () => {
      fetchMock.mockResolvedValueOnce(json({ success: true, workspace: { id: 4242 } }))
        .mockResolvedValueOnce(json({ success: true, task: { id: 42 } }));

      const state = await new WeeekTracker({ ...SETTINGS, workspaceId: null }).createTask(
        { title: 'Задача' },
        TARGET,
        AbortSignal.timeout(1000),
      );

      expect(state.externalUrl).toBe('https://app.weeek.net/ws/4242/task/42');
      expect(fetchMock.mock.calls.map((call) => call[1].method)).toEqual(['GET', 'POST']);
    });

    it('отказ определения пространства не создаёт задачу без ссылки', async () => {
      fetchMock.mockResolvedValue(json({ success: true }));
      await expect(new WeeekTracker({ ...SETTINGS, workspaceId: null }).createTask(
        { title: 'Задача' }, TARGET, AbortSignal.timeout(1000),
      )).rejects.toMatchObject({ code: TRACKER_REJECTED });
      expect(fetchMock.mock.calls.map((call) => call[1].method)).toEqual(['GET']);
    });

    it('401 — отказ трекера: чинится правкой настройки', async () => {
      fetchMock.mockResolvedValue(new Response('{"message":"unauthorized"}', { status: 401 }));

      await expect(
        tracker().createTask({ title: 'Задача' }, TARGET, AbortSignal.timeout(1000)),
      ).rejects.toMatchObject({ code: TRACKER_REJECTED });
    });

    it('обрыв связи — «не ответил»: чинится повтором', async () => {
      fetchMock.mockRejectedValue(new Error('socket hang up'));

      await expect(
        tracker().createTask({ title: 'Задача' }, TARGET, AbortSignal.timeout(1000)),
      ).rejects.toMatchObject({ code: TRACKER_UNAVAILABLE });
    });

    it('переадресация — отказ, а не маршрут', async () => {
      // `redirect: 'error'` роняет сам `fetch`, то есть сюда приходит
      // отклонённое обещание: адрес трекера задаёт настройка, и ответ не
      // вправе его сменить.
      fetchMock.mockRejectedValue(new TypeError('unexpected redirect'));

      await expect(
        tracker().createTask({ title: 'Задача' }, TARGET, AbortSignal.timeout(1000)),
      ).rejects.toBeInstanceOf(TrackerFailure);
    });

    it('429 и 5xx — «не ответил», а не «отказал»', async () => {
      // Правильное действие человека при них — нажать ещё раз, а не искать
      // ошибку в настройке.
      for (const status of [429, 500, 502]) {
        fetchMock.mockResolvedValue(new Response('', { status }));

        await expect(
          tracker().createTask({ title: 'Задача' }, TARGET, AbortSignal.timeout(1000)),
        ).rejects.toMatchObject({ code: TRACKER_UNAVAILABLE });
      }
    });

    it('тело не по формату — отказ, а не задача без идентификатора', async () => {
      fetchMock.mockResolvedValue(json({ success: true }));

      await expect(
        tracker().createTask({ title: 'Задача' }, TARGET, AbortSignal.timeout(1000)),
      ).rejects.toMatchObject({ code: TRACKER_REJECTED });
    });
  });

  describe('updateTask', () => {
    it('правит задачу PUT: PATCH в Weeek не поддерживается', async () => {
      // Проверено живыми запросами: `PATCH /tm/tasks/{id}` — `405`
      // (дизайн, 6).
      fetchMock.mockResolvedValue(json({ success: true, task: { id: 42 } }));

      await tracker().updateTask('42', { title: 'Стало' }, AbortSignal.timeout(1000));

      const [url, init] = fetchMock.mock.calls[0] as Parameters<typeof fetch>;
      expect(url).toBe('https://api.weeek.net/public/v1/tm/tasks/42');
      expect((init as RequestInit).method).toBe('PUT');
      expect(bodyOf(fetchMock.mock.calls[0] as Parameters<typeof fetch>)).toEqual({
        title: 'Стало',
      });
    });

    it('доски в теле правки нет: повторная выгрузка задачу не переносит', async () => {
      // Человек мог сам перетащить её в другую колонку, и наша правка
      // формулировки не вправе возвращать её назад.
      fetchMock.mockResolvedValue(json({ success: true, task: { id: 42 } }));

      await tracker().updateTask('42', { title: 'Стало' }, AbortSignal.timeout(1000));

      expect(bodyOf(fetchMock.mock.calls[0] as Parameters<typeof fetch>)).not.toHaveProperty(
        'boardColumnId',
      );
    });
  });

  describe('readTasks', () => {
    it('спрашивает задачи доски и читает зеркало состояния', async () => {
      fetchMock.mockResolvedValue(
        json({
          success: true,
          tasks: [
            { id: 42, isCompleted: true, boardColumnId: 31 },
            { id: 43, isCompleted: false },
          ],
        }),
      );

      const states = await tracker().readTasks(TARGET, AbortSignal.timeout(1000));

      const [url, init] = fetchMock.mock.calls[0] as Parameters<typeof fetch>;
      expect(String(url).startsWith('https://api.weeek.net/public/v1/tm/tasks?')).toBe(true);
      expect((init as RequestInit).method).toBe('GET');
      const call = fetchMock.mock.calls[0] as Parameters<typeof fetch>;
      expect(paramOf(call, 'projectId')).toBe('7');
      expect(paramOf(call, 'boardId')).toBe('11');
      expect(states.map((state) => [state.externalId, state.isCompleted])).toEqual([
        ['42', true],
        ['43', false],
      ]);
    });

    it('пустой список — не отказ: задач на доске может не быть', async () => {
      fetchMock.mockResolvedValue(json({ success: true, tasks: [] }));

      await expect(tracker().readTasks(TARGET, AbortSignal.timeout(1000))).resolves.toEqual([]);
    });

    it('полная страница — не вся доска: задачи второй страницы доезжают', async () => {
      // Доска больше одной страницы — обычное дело, а задача, о которой
      // трекер не успел сказать, читается вызывающим как «о ней не было ни
      // слова»: зеркало замерло бы навсегда, показывая свежее «спрашивали
      // только что».
      fetchMock
        .mockResolvedValueOnce(json({ success: true, tasks: fullPage('первая') }))
        .mockResolvedValueOnce(json({ success: true, tasks: [{ id: 'со-второй' }] }));

      const states = await tracker().readTasks(TARGET, AbortSignal.timeout(1000));

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(paramOf(fetchMock.mock.calls[0] as Parameters<typeof fetch>, 'offset')).toBe('0');
      expect(paramOf(fetchMock.mock.calls[1] as Parameters<typeof fetch>, 'offset')).toBe(
        String(TRACKER_LIST_PAGE_SIZE),
      );
      expect(states).toHaveLength(TRACKER_LIST_PAGE_SIZE + 1);
      expect(states.at(-1)?.externalId).toBe('со-второй');
    });

    it('сервер, проигнорировавший смещение, в бесконечность не уводит', async () => {
      // Имена параметров пагинации живым токеном не проверены: сервер вправе
      // их не понять и отдать ту же страницу. Повторная страница кончает
      // обход, и задачи с неё не задваиваются.
      // Ответ собирается на каждый вызов: тело `Response` читается один
      // раз, и один объект на два запроса дал бы отказ разбора вместо той
      // же страницы — то есть тест проверял бы не то, что назван.
      fetchMock.mockImplementation(() =>
        Promise.resolve(json({ success: true, tasks: fullPage('одна-и-та-же') })),
      );

      const states = await tracker().readTasks(TARGET, AbortSignal.timeout(1000));

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(states).toHaveLength(TRACKER_LIST_PAGE_SIZE);
    });

    it('предел числа страниц держит работу тика конечной', async () => {
      // Чужая пагинация, отдающая полные страницы без конца, иначе читалась
      // бы до таймаута: предел — про время нашего тика, а не про полноту
      // зеркала.
      let page = 0;
      fetchMock.mockImplementation(() => {
        page += 1;

        return Promise.resolve(json({ success: true, tasks: fullPage(`страница-${page}`) }));
      });

      await tracker().readTasks(TARGET, AbortSignal.timeout(1000));

      expect(fetchMock).toHaveBeenCalledTimes(TRACKER_MAX_LIST_PAGES);
    });
  });

  describe('targets', () => {
    it('спрашивает доски с projectId, а колонки с boardId', async () => {
      fetchMock.mockImplementation((url: string) => {
        if (url.includes('/tm/projects')) {
          return Promise.resolve(json({ success: true, projects: [{ id: 7, name: 'CAIRN' }] }));
        }

        if (url.includes('/tm/boards')) {
          return Promise.resolve(
            json({ success: true, boards: [{ id: 11, name: 'Разработка', projectId: 7 }] }),
          );
        }

        return Promise.resolve(
          json({ success: true, boardColumns: [{ id: 31, name: 'Бэклог', boardId: 11 }] }),
        );
      });

      const targets = await tracker().targets(AbortSignal.timeout(1000));

      expect(targets).toEqual({
        projects: [{ id: '7', name: 'CAIRN' }],
        boards: [{ id: '11', name: 'Разработка', projectId: '7' }],
        columns: [{ id: '31', name: 'Бэклог', boardId: '11' }],
      });
      expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
        'https://api.weeek.net/public/v1/tm/projects',
        'https://api.weeek.net/public/v1/tm/boards?projectId=7',
        'https://api.weeek.net/public/v1/tm/board-columns?boardId=11',
      ]);
    });

    it('цель без идентификатора в список не попадает', async () => {
      // Пустой идентификатор в селекте означает «не выбрано»: такая цель
      // была бы неотличима от отсутствия выбора, а выбрать её и сохранить
      // всё равно нельзя — привязка требует непустых идентификаторов
      // (контракт, `trackerTargetSchema` и `trackerBindingUpdateSchema`).
      // Поэтому строка без `id` выбрасывается, а не отдаётся с пустым.
      fetchMock.mockImplementation((url: string) => {
        if (url.includes('/tm/projects')) {
          return Promise.resolve(
            json({ success: true, projects: [{ name: 'Безымянный' }, { id: 7, name: 'CAIRN' }] }),
          );
        }

        if (url.includes('/tm/boards')) {
          return Promise.resolve(json({ success: true, boards: [{ id: 0, name: 'Нулевая' }] }));
        }

        return Promise.resolve(json({ success: true, boardColumns: [{ name: 'Бэклог' }] }));
      });

      const targets = await tracker().targets(AbortSignal.timeout(1000));

      expect(targets).toEqual({
        projects: [{ id: '7', name: 'CAIRN' }],
        boards: [],
        columns: [],
      });
    });

    it('обходит каждый проект и доску, сохраняя родителя из запроса', async () => {
      fetchMock.mockImplementation((url: string) => {
        const request = new URL(url);
        expect(request.searchParams.has('perPage')).toBe(false);
        expect(request.searchParams.has('offset')).toBe(false);
        if (request.pathname.endsWith('/projects')) {
          return Promise.resolve(json({ success: true, projects: [{ id: 7 }, { id: 8 }] }));
        }
        if (request.pathname.endsWith('/boards')) {
          const projectId = request.searchParams.get('projectId');
          expect(['7', '8']).toContain(projectId);
          return Promise.resolve(json({ success: true, boards: [{ id: projectId === '7' ? 11 : 12 }] }));
        }
        const boardId = request.searchParams.get('boardId');
        expect(['11', '12']).toContain(boardId);
        return Promise.resolve(json({ success: true, boardColumns: [{ id: boardId === '11' ? 31 : 32 }] }));
      });

      const targets = await tracker().targets(AbortSignal.timeout(1000));

      expect(targets.boards).toEqual([
        { id: '11', name: '', projectId: '7' }, { id: '12', name: '', projectId: '8' },
      ]);
      expect(targets.columns).toEqual([
        { id: '31', name: '', boardId: '11' }, { id: '32', name: '', boardId: '12' },
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    it('без проектов не спрашивает доски и колонки без обязательных параметров', async () => {
      fetchMock.mockResolvedValue(json({ success: true, projects: [] }));
      await expect(tracker().targets(AbortSignal.timeout(1000))).resolves.toEqual({
        projects: [], boards: [], columns: [],
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('422 на досках сообщает путь и HTTP-код, не обвиняя токен и не раскрывая тело', async () => {
      fetchMock.mockResolvedValueOnce(json({ success: true, projects: [{ id: 7 }] }))
        .mockResolvedValueOnce(json({ message: TOKEN }, 422));
      const cause = await tracker().targets(AbortSignal.timeout(1000)).catch((error: Error) => error);
      expect(cause).toBeInstanceOf(TrackerFailure);
      expect((cause as Error).message).toContain('GET /tm/boards');
      expect((cause as Error).message).toContain('HTTP 422');
      expect((cause as Error).message).not.toContain('токен');
      expect((cause as Error).message).not.toContain(TOKEN);
    });
  });

  describe('probe', () => {
    it('читает пространство и ничего не создаёт', async () => {
      fetchMock.mockResolvedValue(json({ success: true, workspace: { id: 4242 } }));

      const result = await tracker().probe(AbortSignal.timeout(1000));

      const [url, init] = fetchMock.mock.calls[0] as Parameters<typeof fetch>;
      expect(url).toBe('https://api.weeek.net/public/v1/ws');
      expect((init as RequestInit).method).toBe('GET');
      expect(result).toMatchObject({
        outcome: ModelProbeOutcome.Ok,
        status: 200,
        host: 'api.weeek.net',
      });
    });

    it('отказ узла — исход проверки, а не исключение', async () => {
      fetchMock.mockResolvedValue(new Response('', { status: 401 }));

      await expect(tracker().probe(AbortSignal.timeout(1000))).resolves.toMatchObject({
        outcome: ModelProbeOutcome.Unauthorized,
        status: 401,
      });
    });

    it('обрыв связи — исход «не ответил» без кода', async () => {
      fetchMock.mockRejectedValue(new Error('socket hang up'));

      await expect(tracker().probe(AbortSignal.timeout(1000))).resolves.toMatchObject({
        outcome: ModelProbeOutcome.Unavailable,
        status: null,
      });
    });

    it('ответил, но не тем — bad_response', async () => {
      fetchMock.mockResolvedValue(new Response('<html>вход в кабинет</html>', { status: 200 }));

      await expect(tracker().probe(AbortSignal.timeout(1000))).resolves.toMatchObject({
        outcome: ModelProbeOutcome.BadResponse,
      });
    });

    it('исход не несёт тела чужого ответа ни одним полем', async () => {
      fetchMock.mockResolvedValue(
        new Response('{"message":"Bearer weeek-token-ОЧЕНЬ-СЕКРЕТНЫЙ is invalid"}', { status: 401 }),
      );

      const result = await tracker().probe(AbortSignal.timeout(1000));

      expect(Object.keys(result).sort()).toEqual(['durationMs', 'host', 'outcome', 'status']);
      expect(JSON.stringify(result)).not.toContain(TOKEN);
    });
  });

  describe('токен наружу не выходит', () => {
    it('ни в одном сообщении отказа токена нет', async () => {
      // Утверждение строкой по **всем** ветвям отказа разом: ровно так
      // токен и утекает — одной забытой подстановкой в один текст.
      const failures: string[] = [];
      const answers = [
        () => Promise.reject(new Error(`401 for Bearer ${TOKEN}`)),
        () => Promise.resolve(new Response(`{"token":"${TOKEN}"}`, { status: 401 })),
        () => Promise.resolve(new Response(`{"token":"${TOKEN}"}`, { status: 500 })),
        () => Promise.resolve(json({ success: true })),
      ];

      for (const answer of answers) {
        fetchMock.mockImplementation(answer);

        await tracker()
          .createTask({ title: 'Задача' }, TARGET, AbortSignal.timeout(1000))
          .catch((cause: unknown) => {
            failures.push(String(cause), JSON.stringify(cause));
          });
      }

      expect(failures).toHaveLength(8);
      for (const text of failures) {
        expect(text).not.toContain(TOKEN);
      }
    });

    it('имя узла в сообщении есть: человеку нужно знать, кто отказал', async () => {
      fetchMock.mockResolvedValue(new Response('', { status: 401 }));

      await expect(
        tracker().createTask({ title: 'Задача' }, TARGET, AbortSignal.timeout(1000)),
      ).rejects.toMatchObject({ message: expect.stringContaining('api.weeek.net') });
    });
  });
});

describe('DisabledTracker', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('в сеть не ходит ни одной операцией', async () => {
    // Без токена порт выключен — та же лестница, что у предложителя задач
    // и расшифровки (дизайн, 6).
    const port = new DisabledTracker();
    const signal = AbortSignal.timeout(1000);

    for (const call of [
      () => port.createTask({ title: 'Задача' }, TARGET, signal),
      () => port.updateTask('42', { title: 'Задача' }, signal),
      () => port.readTasks(TARGET, signal),
      () => port.targets(signal),
      () => port.probe(signal),
    ]) {
      await expect(call()).rejects.toMatchObject({ code: TRACKER_NOT_CONFIGURED });
    }

    expect(fetchMock).not.toHaveBeenCalled();
    expect(port.isEnabled).toBe(false);
  });
});
