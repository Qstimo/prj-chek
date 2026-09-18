import { StatusWarningKind } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { decideMachine, machineWarningsOf } from './server-discovery';

const SERVER_ID = '11111111-1111-4111-8111-111111111111';

/** Реестр по адресу: в большинстве случаев одна машина на адрес. */
function registry(...machines: { id: string; ip: string }[]): Map<string, { id: string }[]> {
  const byIp = new Map<string, { id: string }[]>();

  for (const machine of machines) {
    byIp.set(machine.ip, [...(byIp.get(machine.ip) ?? []), { id: machine.id }]);
  }

  return byIp;
}

describe('решение о машине', () => {
  it('окружение без привязки и один адрес — привязать к найденной машине', () => {
    const decision = decideMachine({
      environmentName: 'Прод',
      isBound: false,
      boundIp: null,
      addresses: [{ name: 'prod.example.com', resolvedIp: '203.0.113.10' }],
      machinesByIp: registry({ id: SERVER_ID, ip: '203.0.113.10' }),
    });

    expect(decision).toEqual({ createIp: null, bindServerId: SERVER_ID, warnings: [] });
  });

  it('незнакомый адрес заводит машину', () => {
    const decision = decideMachine({
      environmentName: 'Прод',
      isBound: false,
      boundIp: null,
      addresses: [{ name: 'prod.example.com', resolvedIp: '203.0.113.10' }],
      machinesByIp: registry(),
    });

    expect(decision).toMatchObject({ createIp: '203.0.113.10', bindServerId: null });
  });

  it('два адреса одной машины — одна привязка', () => {
    const decision = decideMachine({
      environmentName: 'Прод',
      isBound: false,
      boundIp: null,
      addresses: [
        { name: 'prod.example.com', resolvedIp: '203.0.113.10' },
        { name: 'api.example.com', resolvedIp: '203.0.113.10' },
      ],
      machinesByIp: registry({ id: SERVER_ID, ip: '203.0.113.10' }),
    });

    expect(decision.bindServerId).toBe(SERVER_ID);
    expect(decision.warnings).toEqual([]);
  });

  it('адреса разошлись — ни привязки, ни новой машины', () => {
    // Спор двух адресов не должен плодить записи в реестре, и выбирать
    // за человека «настоящий» адрес система не вправе.
    const decision = decideMachine({
      environmentName: 'Прод',
      isBound: false,
      boundIp: null,
      addresses: [
        { name: 'prod.example.com', resolvedIp: '203.0.113.10' },
        { name: 'api.example.com', resolvedIp: '198.51.100.7' },
      ],
      machinesByIp: registry(),
    });

    expect(decision.createIp).toBeNull();
    expect(decision.bindServerId).toBeNull();
    expect(decision.warnings[0]).toMatchObject({
      kind: StatusWarningKind.AddressesDisagree,
      subject: 'Прод',
    });
  });

  it('две машины с одним адресом — не привязываем', () => {
    // Дубль в реестре — беспорядок оператора: раннер пишет о нём в лог,
    // а состояние чужого проекта им не портится.
    const decision = decideMachine({
      environmentName: 'Прод',
      isBound: false,
      boundIp: null,
      addresses: [{ name: 'prod.example.com', resolvedIp: '203.0.113.10' }],
      machinesByIp: registry(
        { id: SERVER_ID, ip: '203.0.113.10' },
        { id: '22222222-2222-4222-8222-222222222222', ip: '203.0.113.10' },
      ),
    });

    expect(decision).toEqual({ createIp: null, bindServerId: null, warnings: [] });
  });

  it('привязанное окружение не трогается, даже если адрес совпал', () => {
    const decision = decideMachine({
      environmentName: 'Прод',
      isBound: true,
      boundIp: '203.0.113.10',
      addresses: [{ name: 'prod.example.com', resolvedIp: '203.0.113.10' }],
      machinesByIp: registry({ id: SERVER_ID, ip: '203.0.113.10' }),
    });

    expect(decision).toEqual({ createIp: null, bindServerId: null, warnings: [] });
  });

  it('неразрешённые адреса не значат ничего', () => {
    const decision = decideMachine({
      environmentName: 'Прод',
      isBound: false,
      boundIp: null,
      addresses: [{ name: 'prod.example.com', resolvedIp: null }],
      machinesByIp: registry(),
    });

    expect(decision).toEqual({ createIp: null, bindServerId: null, warnings: [] });
  });
});

describe('предупреждения о машине', () => {
  it('расхождение называет адрес и IP, но не машину', () => {
    // Имя машины принадлежит уровню «чтение», а статус открыт уровню
    // «метаданные»: назвать её здесь значило бы раскрыть невыданное.
    const [warning] = machineWarningsOf({
      environmentName: 'Прод',
      isBound: true,
      boundIp: '198.51.100.7',
      addresses: [{ name: 'prod.example.com', resolvedIp: '203.0.113.10' }],
    });

    expect(warning).toEqual({
      kind: StatusWarningKind.ServerMismatch,
      subject: 'prod.example.com',
      detail: 'смотрит на 203.0.113.10, а окружение привязано к другой машине',
    });
  });

  it('машина без известного адреса молчит', () => {
    // Сравнивать не с чем, а дописывать человеку его запись система
    // не вправе.
    expect(
      machineWarningsOf({
        environmentName: 'Прод',
        isBound: true,
        boundIp: null,
        addresses: [{ name: 'prod.example.com', resolvedIp: '203.0.113.10' }],
      }),
    ).toEqual([]);
  });

  it('разногласие адресов у привязанного окружения молчит', () => {
    // Привязка задана человеком, и объяснять нечего: об отклонившемся
    // адресе уже сказано расхождением.
    const warnings = machineWarningsOf({
      environmentName: 'Прод',
      isBound: true,
      boundIp: '203.0.113.10',
      addresses: [
        { name: 'prod.example.com', resolvedIp: '203.0.113.10' },
        { name: 'api.example.com', resolvedIp: '198.51.100.7' },
      ],
    });

    expect(warnings.map((warning) => warning.kind)).toEqual([StatusWarningKind.ServerMismatch]);
  });
});
