import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import { HealthState, ProjectLifecycle } from '@cairn/shared';

import { IncidentsService } from '../incidents/incidents.service';
import { ServersRepository } from '../servers/servers.repository';
import { decideMachine } from '../servers/server-discovery';
import { resolveAddress } from './checkers/address.checker';
import { checkDomainExpiry } from './checkers/domain.checker';
import { checkHealth, type HealthResult } from './checkers/health.checker';
import { checkTls } from './checkers/tls.checker';
import { INCIDENT_NOTIFIER, type IncidentNotifier } from './notifier';
import { StatusRepository, type AddressTarget } from './status.repository';

/** Набор проверщиков; в тестах подменяется подделками. */
export interface Checkers {
  checkHealth: typeof checkHealth;
  checkTls: typeof checkTls;
  checkDomainExpiry: typeof checkDomainExpiry;
  resolveAddress: typeof resolveAddress;
}

/** Токен внедрения набора проверщиков. */
export const STATUS_CHECKERS = Symbol('STATUS_CHECKERS');

/** Боевой набор проверщиков. */
export const REAL_CHECKERS: Checkers = {
  checkHealth,
  checkTls,
  checkDomainExpiry,
  resolveAddress,
};

/**
 * Прогон автопроверок (ТЗ 6).
 *
 * Фоновый цикл живёт в процессе API: интервал в минутах берётся из
 * `CAIRN_STATUS_CHECK_INTERVAL_MINUTES` (по умолчанию 15, `0` — выключено:
 * так в тестах и локальной разработке). Фоновые прогоны в журнал действий
 * не пишутся: это не действия субъекта.
 */
@Injectable()
export class StatusRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StatusRunnerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly repository: StatusRepository,
    private readonly servers: ServersRepository,
    @Optional() @Inject(STATUS_CHECKERS) private readonly checkers: Checkers = REAL_CHECKERS,
    private readonly incidents: IncidentsService,
    @Optional()
    @Inject(INCIDENT_NOTIFIER)
    private readonly notifier: IncidentNotifier | null = null,
  ) {}

  onModuleInit(): void {
    const minutes = Number(process.env.CAIRN_STATUS_CHECK_INTERVAL_MINUTES ?? '15');

    if (!Number.isFinite(minutes) || minutes <= 0) {
      return;
    }

    this.timer = setInterval(() => {
      void this.runAll().catch((cause) => this.logger.error(`Прогон проверок упал: ${cause}`));
    }, minutes * 60 * 1000);
    // Процесс не должен жить ради таймера.
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  /**
   * Обходит адреса, переспрашивает упавшие и сводит инциденты.
   *
   * Три фазы вместо одной: проверить, подтвердить, записать. Переспрос
   * нужен затем, что результат проверки теперь не только красит
   * индикатор, но и будит человека, — а цена ложной тревоги много выше
   * цены неверного цвета на четверть часа.
   *
   * Цель одна — адрес: все три проверки идут по одному и тому же имени,
   * и результат ложится одной строкой. Пока проверки шли порознь, они
   * могли описывать разные хосты, попадая в один индикатор.
   *
   * Последовательно: масштаб системы — десятки проектов, и простота
   * важнее скорости (ТЗ 9). Падение одного адреса не прерывает обход.
   */
  async runAll(): Promise<void> {
    const targets = await this.repository.listTargets();
    const health = new Map<string, HealthResult>();
    const suspects: AddressTarget[] = [];

    for (const address of targets.addresses) {
      try {
        const result = await this.checkers.checkHealth(address.name, address.healthCheckPath);
        const resolved = await this.checkers.resolveAddress(address.name);
        const tls = await this.checkers.checkTls(address.name);
        const registry = await this.checkers.checkDomainExpiry(address.name);

        health.set(address.id, result);

        if (result.health === HealthState.Down) {
          suspects.push(address);
        }

        await this.repository.upsertAddressStatus(address.id, {
          health: result.health,
          latencyMs: result.latencyMs,
          healthError: result.error,
          resolvedIp: resolved.ip,
          resolveError: resolved.error,
          tlsValidTo: tls.validTo,
          tlsError: tls.error,
          registryExpiresAt: registry.expiresAt,
          registryError: registry.error,
        });
      } catch (cause) {
        this.logger.warn(`Проверка адреса ${address.name} упала: ${cause}`);
      }
    }

    await this.recheck(suspects, health);
    await this.adoptMachines();
    await this.settleIncidents(targets.addresses, health);
  }

  /**
   * Переспрашивает упавшие адреса после одной общей паузы.
   *
   * Пауза одна на прогон, а не на адрес: десять лежащих адресов не
   * должны растягивать обход на пять минут. Переспрашивается только
   * health — TLS, разрешение имени и срок регистрации за полминуты не
   * меняются и будить человека не повод.
   */
  private async recheck(
    suspects: AddressTarget[],
    health: Map<string, HealthResult>,
  ): Promise<void> {
    if (suspects.length === 0) {
      return;
    }

    await this.pause();

    for (const address of suspects) {
      try {
        const result = await this.checkers.checkHealth(address.name, address.healthCheckPath);

        health.set(address.id, result);
        await this.repository.updateAddressHealth(address.id, {
          health: result.health,
          latencyMs: result.latencyMs,
          healthError: result.error,
        });
      } catch (cause) {
        this.logger.warn(`Переспрос адреса ${address.name} упал: ${cause}`);
      }
    }
  }

  /**
   * Пауза перед переспросом: `CAIRN_HEALTH_RECHECK_DELAY_SECONDS`.
   *
   * `0` означает «переспросить сразу, без паузы», а не «не
   * переспрашивать»: так в тестах. Выключателя у переспроса нет — он
   * дешёвый, и отказываться от него незачем.
   */
  private async pause(): Promise<void> {
    const seconds = Number(process.env.CAIRN_HEALTH_RECHECK_DELAY_SECONDS ?? '30');

    if (!Number.isFinite(seconds) || seconds <= 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }

  /**
   * Сводит инциденты и отдаёт события на рассылку.
   *
   * По всем адресам, а не только по подозреваемым: инцидент закрывает
   * как раз тот адрес, который ответил и в подозреваемых не был.
   *
   * Сначала запись, потом рассылка: падение процесса между ними теряет
   * пуш, но не теряет инцидент, — а человек увидит падение на экране.
   * Обратный порядок оставил бы уведомление без того, на что в нём
   * нажимают.
   */
  private async settleIncidents(
    addresses: AddressTarget[],
    health: Map<string, HealthResult>,
  ): Promise<void> {
    const events = await this.incidents.reconcile(
      addresses.map((address) => ({
        domainId: address.id,
        name: address.name,
        projectId: address.projectId,
        projectName: address.projectName,
        environmentName: address.environmentName,
        isPaused: address.lifecycle === ProjectLifecycle.Paused,
        health: health.get(address.id)?.health ?? null,
        healthError: health.get(address.id)?.error ?? null,
      })),
    );

    if (events.length === 0 || !this.notifier) {
      return;
    }

    try {
      // Отказ рассылки не должен валить прогон: статус важнее уведомления.
      await this.notifier.notify(events);
    } catch (cause) {
      this.logger.warn(`Рассылка уведомлений упала: ${cause}`);
    }
  }

  /**
   * Второй проход: машина окружения по его адресам (спека 3.2–3.4).
   *
   * Отдельно от обхода адресов, потому что решение принимается по
   * окружению целиком: привязка у него одна, а адресов несколько.
   */
  private async adoptMachines(): Promise<void> {
    const targets = await this.repository.listDiscoveryTargets();
    const machinesByIp = await this.servers.machinesByIp();

    for (const target of targets) {
      try {
        const decision = decideMachine({
          environmentName: target.environmentName,
          isBound: target.serverId !== null,
          // Привязанное окружение правило и так оставляет в покое, а
          // предупреждения о расхождении строит чтение статуса: адрес
          // привязанной машины прогону не нужен.
          boundIp: null,
          addresses: target.addresses,
          machinesByIp,
        });

        this.warnAboutDuplicates(target.addresses, machinesByIp);

        if (decision.createIp) {
          const created = await this.servers.createDiscovered(decision.createIp);

          machinesByIp.set(decision.createIp, [{ id: created.id }]);
          await this.servers.bindEnvironment(target.environmentId, created.id);
          continue;
        }

        if (decision.bindServerId) {
          await this.servers.bindEnvironment(target.environmentId, decision.bindServerId);
        }
      } catch (cause) {
        this.logger.warn(`Машина окружения ${target.environmentName} не определилась: ${cause}`);
      }
    }
  }

  /**
   * Сообщает оператору о дубле в реестре.
   *
   * В лог, а не предупреждением статуса: две машины с одним адресом —
   * беспорядок реестра, а не состояние чужого проекта.
   */
  private warnAboutDuplicates(
    addresses: { resolvedIp: string | null }[],
    machinesByIp: Map<string, { id: string }[]>,
  ): void {
    const duplicated = addresses
      .map((address) => address.resolvedIp)
      .filter((ip): ip is string => ip !== null)
      .find((ip) => (machinesByIp.get(ip) ?? []).length > 1);

    if (duplicated) {
      this.logger.warn(`В реестре две машины с адресом ${duplicated}`);
    }
  }
}
