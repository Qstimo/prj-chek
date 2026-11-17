import type { ModelServiceSettings, ModelServiceUpdate } from '@cairn/shared';

import type { ModelServiceFormValues } from './types';

/**
 * Черновик формы из действующей настройки.
 *
 * Поле ключа начинается пустым всегда, даже когда ключ задан: сервер его
 * не отдаёт, и подставлять туда нечего (дизайн, 3.4).
 */
export function valuesOf(settings: ModelServiceSettings): ModelServiceFormValues {
  return {
    baseUrl: settings.baseUrl,
    authScheme: settings.authScheme,
    model: settings.model,
    folder: settings.folder ?? '',
    placement: settings.placement,
    timeoutSeconds: String(settings.timeoutSeconds),
    isEnabled: settings.isEnabled,
    secret: '',
    isSecretCleared: false,
  };
}

/**
 * Запись настройки из черновика.
 *
 * Три состояния ключа различаются здесь, и промежуточного «пустая строка»
 * среди них нет: поле отсутствует — не менять, `null` — убрать, строка —
 * поставить. Пустое поле формы — это «не менять», поэтому и уходит
 * отсутствием поля, а не пустой строкой, которую схема отвергнет.
 */
export function updateOf(values: ModelServiceFormValues): ModelServiceUpdate {
  const secret = values.secret.trim();
  const base = {
    baseUrl: values.baseUrl.trim(),
    authScheme: values.authScheme,
    model: values.model.trim(),
    folder: values.folder.trim() === '' ? null : values.folder.trim(),
    placement: values.placement,
    timeoutSeconds: Number(values.timeoutSeconds),
    isEnabled: values.isEnabled,
  };

  if (secret !== '') {
    return { ...base, secret };
  }

  return values.isSecretCleared ? { ...base, secret: null } : base;
}
