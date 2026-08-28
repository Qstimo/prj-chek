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
   * Обходит все цели и пишет результаты.
   *
   * Последовательно: масштаб системы — десятки проектов, и простота
   * важнее скорости (ТЗ 9). Падение одной цели не прерывает обход.
   */
  async runAll(): Promise<void> {
    const targets = await this.repository.listTargets();

    for (const environment of targets.environments) {
      try {
        const result = await this.checkers.checkHealth(environment.healthCheckUrl);
        await this.repository.upsertEnvironmentStatus(environment.id, result);
      } catch (cause) {
        this.logger.warn(`Проверка окружения ${environment.id} упала: ${cause}`);
      }
    }

    for (const domain of targets.domains) {
      try {
        const tls = await this.checkers.checkTls(domain.name);
        const registry = await this.checkers.checkDomainExpiry(domain.name);

        await this.repository.upsertDomainStatus(domain.id, {
          tlsValidTo: tls.validTo,
          tlsError: tls.error,
          registryExpiresAt: registry.expiresAt,
          registryError: registry.error,
        });
      } catch (cause) {
        this.logger.warn(`Проверка домена ${domain.name} упала: ${cause}`);
      }
    }
  }
}
