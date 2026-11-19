'use client';

import { BROWSER_API_URL } from './config';
import { apiErrorOf } from './response';

/** Чем управляется идущая загрузка. */
export interface IUploadOptions {
  /** Сколько процентов записи уже ушло. Целое, от 0 до 100. */
  onProgress?: (percent: number) => void;
  /** Отмена загрузки: `xhr.abort()`, которого у `fetch` в проекте нет. */
  signal?: AbortSignal;
}

/**
 * Отправляет запись созвона сырым телом, сообщая процент по ходу.
 *
 * **Единственное место в приложении, где используется `XMLHttpRequest`**, и
 * причина названа: прогресса отправки `fetch` в браузерах не даёт вовсе.
 * При сорока мегабайтах с этим можно было жить, а при двух гигабайтах
 * неопределённый индикатор на двадцать минут читается как зависший экран
 * (дизайн, 8.2 и 8.4).
 *
 * Что здесь общее с {@link apiClient}, а не своё:
 *
 * - **разбор отказа** — ответ превращается в ту же `ApiError` общей
 *   {@link apiErrorOf}, чтобы `summaryFailureOf` работала одинаково
 *   независимо от транспорта;
 * - **cookie сессии** — `withCredentials`, иначе защищённый маршрут
 *   ответит отказом.
 *
 * Своё — ровно прогресс и отмена. Паспорт записи едет строкой запроса, а
 * телом уходят сырые байты: `multipart` принёс бы имя файла, которого мы
 * не хотим ни получать, ни хранить (дизайн, 5.2).
 */
export function uploadRecording<T>(
  path: string,
  body: Blob,
  contentType: string,
  options: IUploadOptions = {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = (): void => reject(abortError());

    if (options.signal?.aborted === true) {
      // Отмена успела дойти раньше, чем запрос ушёл: посылать байты уже
      // незачем, и открытый запрос пришлось бы закрывать тут же.
      abort();

      return;
    }

    request.open('POST', `${BROWSER_API_URL}${path}`);
    request.withCredentials = true;
    request.setRequestHeader('Content-Type', contentType);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        options.onProgress?.(Math.floor((event.loaded / event.total) * 100));
      }
    };

    request.onload = () => {
      const payload = payloadOf(request.responseText);

      if (request.status >= 200 && request.status < 300) {
        resolve(payload as T);

        return;
      }

      reject(apiErrorOf(request.status, payload));
    };

    // Код ответа здесь не придёт вовсе, и `0` — честный ответ на вопрос
    // «чем отказали»: ничем, связь оборвалась.
    request.onerror = () => reject(apiErrorOf(0, null));
    request.onabort = abort;

    options.signal?.addEventListener('abort', () => request.abort());

    request.send(body);
  });
}

/**
 * Отмена: ошибка с именем, по которому её узнаёт экран.
 *
 * `AbortError` — то же имя, которым отвечает прерванный `fetch`: отмена
 * загрузки не отказ сервера, и показывать её человеку как отказ нельзя.
 */
function abortError(): Error {
  const error = new Error('Загрузка отменена.');

  error.name = 'AbortError';

  return error;
}

/** Тело ответа или `null`: у `204` и у оборванного ответа его нет. */
function payloadOf(text: string): unknown {
  if (text.length === 0) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
