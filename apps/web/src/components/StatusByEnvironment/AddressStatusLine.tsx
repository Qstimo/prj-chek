import { HealthState } from '@cairn/shared';

import type { IAddressProps } from './types';

/**
 * Одна строка статуса адреса: жив ли он, сертификат и срок регистрации.
 *
 * Три проверки рядом намеренно: они об одном имени, и разносить их по
 * разным спискам значило бы снова предлагать человеку сводить их глазами.
 */
export function AddressStatusLine({ address }: IAddressProps) {
  return (
    <>
      <span className="font-medium">{address.name}</span>
      {': '}
      <span>{healthTextOf(address)}</span>
      {'; '}
      <span>{tlsTextOf(address)}</span>
      {'; '}
      <span>{registryTextOf(address)}</span>
    </>
  );
}

/** Жив ли адрес: причина отказа важнее самого отказа. */
function healthTextOf({
  health,
  latencyMs,
  healthError,
}: IAddressProps['address']): string {
  if (health === null) {
    return 'не проверялся';
  }

  if (health === HealthState.Up) {
    return latencyMs === null ? 'работает' : `работает, ${latencyMs} мс`;
  }

  return `не отвечает (${healthError ?? 'без причины'})`;
}

/** Сертификат: ошибка проверки говорит больше, чем её отсутствие. */
function tlsTextOf({ tlsError, tlsValidTo }: IAddressProps['address']): string {
  if (tlsError) {
    return `TLS: ${tlsError}`;
  }

  return tlsValidTo ? `TLS до ${dayOf(tlsValidTo)}` : 'TLS не проверялся';
}

/** Срок регистрации по данным реестра зоны. */
function registryTextOf({
  registryError,
  registryExpiresAt,
}: IAddressProps['address']): string {
  if (registryError) {
    return `регистрация: ${registryError}`;
  }

  return registryExpiresAt
    ? `регистрация до ${dayOf(registryExpiresAt)}`
    : 'срок регистрации не проверялся';
}

/** День без времени: час проверки сертификата человеку не нужен. */
function dayOf(isoDate: string): string {
  return isoDate.slice(0, 10);
}
