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
    const message =
      (payload as { message?: string } | null)?.message ?? messageForStatus(response.status);

    throw new ApiError(response.status, message, payload);
  }

  return payload as T;
}
