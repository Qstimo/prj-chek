import type { TrackerConnection, TrackerConnectionUpdate } from '@cairn/shared';

import type { TrackerFormValues } from './types';
import { WEEEK_API_BASE_URL } from './constants';

/**
 * Черновик формы из действующего подключения.
 *
 * Поле токена начинается пустым всегда, даже когда токен задан: сервер его
 * не отдаёт, и подставлять туда нечего.
 */
export function valuesOf(connection: TrackerConnection): TrackerFormValues {
  return {
    workspaceId: connection.workspaceId ?? '',
    isEnabled: connection.isEnabled,
    secret: '',
    isSecretCleared: false,
  };
}

/**
 * Запись подключения из черновика.
 *
 * Три состояния токена различаются здесь, и промежуточного «пустая строка»
 * среди них нет: поле отсутствует — не менять, пустое значение — убрать,
 * строка — поставить. Пустое поле формы — это «не менять», поэтому и уходит
 * отсутствием поля, которое схема контракта иначе отвергнет.
 */
export function updateOf(values: TrackerFormValues): TrackerConnectionUpdate {
  const secret = values.secret.trim();
  const base = {
    baseUrl: WEEEK_API_BASE_URL,
    workspaceId: values.workspaceId.trim() === '' ? null : values.workspaceId.trim(),
    isEnabled: values.isEnabled,
  };

  if (secret !== '') {
    return { ...base, secret };
  }

  return values.isSecretCleared ? { ...base, secret: null } : base;
}
