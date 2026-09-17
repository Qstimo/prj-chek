import { HealthState, type DomainStatus, type EnvironmentStatus } from '@cairn/shared';

/** Окружение, каким его видит проекция: имя и ключ, по которому группировать. */
export interface EnvironmentRef {
  id: string;
  name: string;
}

/**
 * Выводит здоровье окружений из статусов их адресов (спека 2.4).
 *
 * Вычисляется, а не хранится — того же рода правило, что прогресс версии
 * в роадмапе. Окружение аварийно, если мёртв хотя бы один его адрес: жив
 * ли остальной стенд, человеку неважно, пока один адрес не отвечает.
 * Не проверено ни одного — состояние неизвестно, и выдумывать его нельзя.
 */
export function environmentStatusesOf(
  environments: EnvironmentRef[],
  addresses: DomainStatus[],
): EnvironmentStatus[] {
  return environments.map((environment) => {
    const own = addresses.filter((address) => address.environmentId === environment.id);

    return {
      environmentId: environment.id,
      name: environment.name,
      health: healthOf(own),
      checkedAt: lastCheckedAtOf(own),
    };
  });
}

/** Сводит здоровье адресов в одно: молчание непроверенных не считается. */
function healthOf(addresses: DomainStatus[]): HealthState | null {
  if (addresses.some((address) => address.health === HealthState.Down)) {
    return HealthState.Down;
  }

  return addresses.some((address) => address.health === HealthState.Up) ? HealthState.Up : null;
}

/** Последняя из проверок адресов: раньше неё сведения не устаревают. */
function lastCheckedAtOf(addresses: DomainStatus[]): string | null {
  const checks = addresses
    .map((address) => address.checkedAt)
    .filter((checkedAt): checkedAt is string => checkedAt !== null);

  return checks.length > 0 ? checks.reduce((last, next) => (next > last ? next : last)) : null;
}
