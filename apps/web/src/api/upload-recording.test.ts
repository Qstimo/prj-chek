import { RECORDING_TOO_LARGE } from '@cairn/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from './errors';
import { uploadRecording } from './upload-recording';

/** Событие прогресса отправки, какое даёт браузер. */
interface IProgress {
  lengthComputable: boolean;
  loaded: number;
  total: number;
}

/**
 * Подменённый `XMLHttpRequest`.
 *
 * Своя заглушка, а не библиотека: нужны ровно четыре вещи — заголовки,
 * `withCredentials`, событие прогресса и возможность ответить когда
 * захочется. Настоящей сети в тестах нет нигде.
 */
class XhrStub {
  static last: XhrStub | undefined;

  readonly upload = { onprogress: null as ((event: IProgress) => void) | null };
  readonly headers: Record<string, string> = {};

  withCredentials = false;
  status = 0;
  responseText = '';
  aborted = false;
  method?: string;
  url?: string;
  body?: unknown;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    XhrStub.last = this;
  }

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  send(body: unknown): void {
    this.body = body;
  }

  abort(): void {
    this.aborted = true;
    this.onabort?.();
  }

  /** Браузер сообщил, сколько байт уже ушло. */
  progress(loaded: number, total: number): void {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }

  /** Сервер принял задачу. */
  succeed(payload: unknown): void {
    this.status = 202;
    this.responseText = JSON.stringify(payload);
    this.onload?.();
  }

  /** Сервер отказал с телом отказа. */
  fail(status: number, payload: unknown): void {
    this.status = status;
    this.responseText = JSON.stringify(payload);
    this.onload?.();
  }

  /** Связь оборвалась: ни кода ответа, ни тела. */
  break(): void {
    this.onerror?.();
  }
}

const ID = '00000000-0000-0000-0000-000000000001';
const PATH = `/projects/${ID}/summaries/transcriptions?occurredOn=2026-11-17&title=%D0%A1&uploadType=video%2Fmp4`;

/** Файл-пустышка: байты здесь не читаются, уходит он сам. */
const FILE = new File([new Uint8Array(8)], 'созвон.mp4');

/** Подменяет `XMLHttpRequest` и начинает загрузку. */
function startUpload(options: Parameters<typeof uploadRecording>[3] = {}): {
  promise: Promise<unknown>;
  xhr: XhrStub;
} {
  vi.stubGlobal('XMLHttpRequest', XhrStub);

  const promise = uploadRecording(PATH, FILE, 'video/mp4', options);

  return { promise, xhr: XhrStub.last as XhrStub };
}

describe('загрузка записи', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    XhrStub.last = undefined;
  });

  it('сообщает процент по ходу отправки', async () => {
    // На двух гигабайтах неопределённый индикатор на двадцать минут
    // читается как зависший экран, поэтому здесь `XHR`, а не `fetch`.
    const seen: number[] = [];
    const { promise, xhr } = startUpload({ onProgress: (percent) => seen.push(percent) });

    xhr.progress(50_000_000, 500_000_000);
    xhr.progress(500_000_000, 500_000_000);
    xhr.succeed({ id: ID });

    await promise;

    expect(seen).toEqual([10, 100]);
  });

  it('отдаёт разобранную задачу', async () => {
    const { promise, xhr } = startUpload();

    xhr.succeed({ id: ID, state: 'queued' });

    expect(await promise).toEqual({ id: ID, state: 'queued' });
  });

  it('прикладывает cookie сессии', () => {
    // Без withCredentials любой защищённый маршрут ответит отказом.
    const { promise, xhr } = startUpload();

    expect(xhr.withCredentials).toBe(true);

    xhr.succeed({});

    return promise;
  });

  it('тело уходит сырым файлом с объявленным типом', async () => {
    // Паспорт едет строкой запроса, а тело — сырыми байтами: `multipart`
    // принёс бы имя файла, которого мы не хотим ни получать, ни хранить.
    const { promise, xhr } = startUpload();

    expect(xhr.body).toBe(FILE);
    expect(xhr.headers['Content-Type']).toBe('video/mp4');
    expect(xhr.url).toBe(`/api${PATH}`);

    xhr.succeed({});

    await promise;
  });

  it('отказ разбирается той же ApiError, что у fetch-запросов', async () => {
    // Второй путь разбора отказов был бы вторым местом, где живёт одно
    // правило, и показал бы человеку общую фразу вместо причины.
    const { promise, xhr } = startUpload();

    xhr.fail(413, { code: RECORDING_TOO_LARGE, maxBytes: 2_147_483_648 });

    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({
      status: 413,
      details: { maxBytes: 2_147_483_648 },
    });
  });

  it('обрыв связи — тоже ApiError, а не чужая ошибка', async () => {
    const { promise, xhr } = startUpload();

    xhr.break();

    await expect(promise).rejects.toBeInstanceOf(ApiError);
  });

  it('отмена прерывает запрос', async () => {
    // Кнопки «Отменить загрузку» у fetch-запросов в приложении нет
    // нигде; здесь она нужна, потому что ждать двадцать минут молча
    // человек не должен.
    const controller = new AbortController();
    const { promise, xhr } = startUpload({ signal: controller.signal });

    controller.abort();

    expect(xhr.aborted).toBe(true);
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('отменённая до начала загрузка не отправляется вовсе', async () => {
    // Отмена успела дойти раньше, чем запрос ушёл: посылать байты уже
    // незачем.
    const controller = new AbortController();

    controller.abort();

    const { promise, xhr } = startUpload({ signal: controller.signal });

    expect(xhr.body).toBeUndefined();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });
});
