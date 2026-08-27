import { ApiError, messageForStatus } from './errors';

/** Разбирает ответ, превращая отказ в {@link ApiError}. */
export async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      (payload as { message?: string } | null)?.message ?? messageForStatus(response.status);

    throw new ApiError(response.status, message, payload);
  }

  return payload as T;
}
