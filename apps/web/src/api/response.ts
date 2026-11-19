import { ApiError, messageForStatus } from './errors';

/** Вид тела успешного ответа. */
export type ResponseParse = 'json' | 'text';

/**
 * Разбирает ответ, превращая отказ в {@link ApiError}.
 *
 * Текстовый разбор нужен выгрузке `.env`: она отвечает не JSON,
 * а готовым текстом файла.
 */
export async function readResponse<T>(
  response: Response,
  parse: ResponseParse = 'json',
): Promise<T> {
  if (parse === 'text' && response.ok) {
    return (await response.text()) as T;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw apiErrorOf(response.status, payload);
  }

  return payload as T;
}

/**
 * Собирает {@link ApiError} из кода ответа и разобранного тела.
 *
 * Выделена из {@link readResponse}, а не скопирована в загрузку записи:
 * загрузка идёт на `XMLHttpRequest` ради прогресса отправки (дизайн, 8.4),
 * и второй путь разбора отказов был бы вторым местом, где живёт одно
 * правило, — первым же расхождением он показал бы человеку общую фразу
 * вместо названной причины.
 */
export function apiErrorOf(status: number, payload: unknown): ApiError {
  const message = (payload as { message?: string } | null)?.message ?? messageForStatus(status);

  return new ApiError(status, message, payload);
}
