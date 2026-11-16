import { StatusWarningKind, type StatusWarning } from '@cairn/shared';

/**
 * Адрес окружения с результатом разрешения.
 *
 * Множество адресов, а не выбранный: резолверы ротируют порядок ответа, и
 * пока правило смотрело на первую запись, предупреждение о расхождении
 * мигало от прогона к прогону на исправной настройке. По множеству же
 * видно правду — имя за балансировщиком смотрит на пару машин, а имя за
 * CDN на край сети.
 */
export interface DiscoveryAddress {
  name: string;
  resolvedIps: string[];
}

/**
 * Сколько адресов у имени ещё говорит о машине.
 *
 * Больше — край сети: за CDN имя разрешается в десятки адресов, ни один
 * из которых машиной не является. Такое расхождение не лечится ничем и
 * висело бы вечно, поэтому о нём молчат. Это названная граница знания,
 * а не недоработка.
 */
export const EDGE_ADDRESS_LIMIT = 3;

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
 *
 * Говорится только о тех именах, которые ещё описывают машину: имя,
 * разрешившееся больше чем в {@link EDGE_ADDRESS_LIMIT} адресов, молчит
 * целиком — см. обоснование у самой границы.
 */
export function machineWarningsOf(environment: DiscoveryEnvironment): StatusWarning[] {
  const resolved = environment.addresses.filter(
    (address) =>
      address.resolvedIps.length > 0 && address.resolvedIps.length <= EDGE_ADDRESS_LIMIT,
  );

  if (environment.isBound) {
    // Сравнивать не с чем: машина заведена без адреса, и дописывать
    // человеку его запись система не вправе.
    if (!environment.boundIp) {
      return [];
    }

    const boundIp = environment.boundIp;

    return (
      resolved
        // Вхождение, а не равенство: балансировка отдаёт пару адресов, и
        // машина окружения — один из них. Пока сравнивался выбранный
        // адрес, предупреждение мигало вместе с порядком ответа DNS.
        .filter((address) => !address.resolvedIps.includes(boundIp))
        .map((address) => ({
          kind: StatusWarningKind.ServerMismatch,
          subject: address.name,
          detail: `смотрит на ${address.resolvedIps.join(', ')}, а окружение привязано к другой машине`,
        }))
    );
  }

  const groups = [...new Set(resolved.map((address) => keyOf(address.resolvedIps)))];

  // Сравниваются множества: два имени, смотрящие на одну и ту же пару
  // машин, согласны между собой, а не спорят.
  if (groups.length < 2) {
    return [];
  }

  const distinct = [...new Set(resolved.flatMap((address) => address.resolvedIps))].sort();

  return [
    {
      kind: StatusWarningKind.AddressesDisagree,
      subject: environment.environmentName,
      detail: `адреса смотрят на разные машины: ${distinct.join(', ')}`,
    },
  ];
}

/**
 * Единственный адрес, на котором сошлись все разрешившиеся имена.
 *
 * Именно единственный: имя с несколькими адресами не говорит, какая из
 * машин та самая, и заводить по нему запись в реестре значило бы
 * выдумать машину. Привязка ставится, только когда все имена окружения
 * дали одно и то же одно значение.
 */
function agreedIpOf(addresses: DiscoveryAddress[]): string | null {
  const resolved = addresses.filter((address) => address.resolvedIps.length > 0);
  const single = resolved.filter((address) => address.resolvedIps.length === 1);

  if (resolved.length === 0 || single.length !== resolved.length) {
    return null;
  }

  const distinct = [...new Set(single.map((address) => address.resolvedIps[0]!))];

  return distinct.length === 1 ? distinct[0]! : null;
}

/** Множество адресов как ключ сравнения: порядок ответа DNS не значим. */
function keyOf(ips: string[]): string {
  return [...ips].sort().join(',');
}
