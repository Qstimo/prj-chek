import type { EnvironmentCreate } from '@cairn/shared';

import type { EnvironmentFormValues } from './types';

/** Что известно формe о правах и доступных списках на момент отправки. */
interface SubmitContext {
  /** Право привязывать окружение к машине. Есть только у суперадмина. */
  canAssignServer: boolean;
  /** Виден ли список платформ: от этого зависит, отправлять ли набор. */
  hasPlatforms: boolean;
}

/**
 * Собирает полезную нагрузку из значений формы.
 *
 * Два поля отправляются условно, и оба — чтобы не затереть чужое.
 * Привязку к машине принимает только суперадмин: у остальных API ответит
 * `403`. Набор платформ отправляется лишь когда список виден: пустой
 * набор при недоступном списке снял бы привязки, сделанные тем, у кого
 * доступ к «Инфо» есть.
 */
export function submitValuesOf(
  values: EnvironmentFormValues,
  { canAssignServer, hasPlatforms }: SubmitContext,
): EnvironmentCreate {
  return {
    name: values.name.trim(),
    kind: values.kind,
    healthCheckPath: emptyToNull(values.healthCheckPath),
    notes: emptyToNull(values.notes),
    domains: values.domains,
    ...(canAssignServer ? { serverId: values.serverId } : {}),
    ...(hasPlatforms ? { platformIds: values.platformIds } : {}),
  };
}

/** Превращает пустую строку в отсутствие значения. */
function emptyToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';

  return trimmed.length > 0 ? trimmed : null;
}
