import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import { checkDomainExpiry } from './checkers/domain.checker';
import { checkHealth } from './checkers/health.checker';
import { checkTls } from './checkers/tls.checker';
import { StatusRepository } from './status.repository';

/** Набор проверщиков; в тестах подменяется подделками. */
export interface Checkers {
  checkHealth: typeof checkHealth;
  checkTls: typeof checkTls;
  checkDomainExpiry: typeof checkDomainExpiry;
}

/** Токен внедрения набора проверщиков. */
export const STATUS_CHECKERS = Symbol('STATUS_CHECKERS');

/** Боевой набор проверщиков. */
export const REAL_CHECKERS: Checkers = { checkHealth, checkTls, checkDomainExpiry };

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
    @Optional() @Inject(STATUS_CHECKERS) private readonly checkers: Checkers = REAL_CHECKERS,
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
   * Обходит адреса окружений и пишет результаты.
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

    for (const address of targets.addresses) {
      try {
        const health = await this.checkers.checkHealth(address.name, address.healthCheckPath);
        const tls = await this.checkers.checkTls(address.name);
        const registry = await this.checkers.checkDomainExpiry(address.name);

        await this.repository.upsertAddressStatus(address.id, {
          health: health.health,
          latencyMs: health.latencyMs,
          healthError: health.error,
          tlsValidTo: tls.validTo,
          tlsError: tls.error,
          registryExpiresAt: registry.expiresAt,
          registryError: registry.error,
        });
      } catch (cause) {
        this.logger.warn(`Проверка адреса ${address.name} упала: ${cause}`);
      }
    }
  }
}
