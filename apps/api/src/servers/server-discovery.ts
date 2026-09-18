import { StatusWarningKind, type StatusWarning } from '@cairn/shared';

/** Адрес окружения с результатом разрешения. */
export interface DiscoveryAddress {
  name: string;
  resolvedIp: string | null;
}

/** Окружение глазами правила: чем привязано и куда смотрят его адреса. */
export interface DiscoveryEnvironment {
  environmentName: string;
  /** Привязана ли машина человеком или прошлым прогоном. */
  isBound: boolean;
  /** Адрес привязанной машины; `null` — привязки нет либо адрес не задан. */
  boundIp: string | null;
  addresses: DiscoveryAddress[];
}

/** То же плюс реестр: нужен, только чтобы решить о заведении и привязке. */
export interface DiscoveryInput extends DiscoveryEnvironment {
  machinesByIp: Map<string, { id: string }[]>;
}

/** Что делать с машиной окружения. */
export interface DiscoveryDecision {
  /** Адрес, под который заводится машина; `null` — заводить нечего. */
  createIp: string | null;
  /** Машина, к которой привязывается окружение; `null` — не привязывать. */
  bindServerId: string | null;
  warnings: StatusWarning[];
}

/**
 * Решает судьбу машины окружения (спека 3.2–3.5).
 *
 * Правило одно на две стороны: прогон берёт из решения заведение и
 * привязку, чтение статуса — только предупреждения. Второй экземпляр
 * правила неизбежно разошёлся бы с первым.
 */
export function decideMachine(input: DiscoveryInput): DiscoveryDecision {
  const warnings = machineWarningsOf(input);
  const silent = { createIp: null, bindServerId: null, warnings };

  // Привязку, поставленную человеком, не трогаем ни при каких находках.
  if (input.isBound) {
    return silent;
  }

  const agreed = agreedIpOf(input.addresses);

  if (!agreed) {
    return silent;
  }

  const machines = input.machinesByIp.get(agreed) ?? [];

  // Дубль по адресу разбирает оператор: гадать, которая из двух машин
  // та самая, система не вправе.
  if (machines.length > 1) {
    return silent;
  }

  return machines.length === 1
    ? { createIp: null, bindServerId: machines[0]!.id, warnings }
    : { createIp: agreed, bindServerId: null, warnings };
}

/**
 * Предупреждения о машине: расхождение и спор адресов.
 *
 * Имя машины в текст не попадает: статус открыт уровню «метаданные»,
 * а имя сервера принадлежит уровню «чтение».
 */
export function machineWarningsOf(environment: DiscoveryEnvironment): StatusWarning[] {
  const resolved = environment.addresses.filter(
    (address): address is DiscoveryAddress & { resolvedIp: string } => address.resolvedIp !== null,
  );

  if (environment.isBound) {
    // Сравнивать не с чем: машина заведена без адреса, и дописывать
    // человеку его запись система не вправе.
    if (!environment.boundIp) {
      return [];
    }

    return resolved
      .filter((address) => address.resolvedIp !== environment.boundIp)
      .map((address) => ({
        kind: StatusWarningKind.ServerMismatch,
        subject: address.name,
        detail: `смотрит на ${address.resolvedIp}, а окружение привязано к другой машине`,
      }));
  }

  const distinct = [...new Set(resolved.map((address) => address.resolvedIp))];

  if (distinct.length < 2) {
    return [];
  }

  return [
    {
      kind: StatusWarningKind.AddressesDisagree,
      subject: environment.environmentName,
      detail: `адреса смотрят на разные машины: ${distinct.join(', ')}`,
    },
  ];
}

/** Единственный адрес, на котором сошлись все разрешившиеся имена. */
function agreedIpOf(addresses: DiscoveryAddress[]): string | null {
  const distinct = [
    ...new Set(
      addresses
        .map((address) => address.resolvedIp)
        .filter((ip): ip is string => ip !== null),
    ),
  ];

  return distinct.length === 1 ? distinct[0]! : null;
}
