import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DATABASE, DbModule } from '../db/db.module';
import { ProjectTrackerController } from './project-tracker.controller';
import { TaskExportsController } from './task-exports.controller';
import { TaskExportsRepository } from './task-exports.repository';
import { TASK_EXPORT_LOCK_DB, TaskExportsService } from './task-exports.service';
import { TrackerBindingsRepository } from './tracker-bindings.repository';
import { TrackerConnectionService } from './tracker-connection.service';
import { TrackerConnectionsRepository } from './tracker-connections.repository';
import { TRACKER_SOURCE } from './tracker';
import {
  TRACKER_POLL_LOCK_DB,
  TrackerPollRunnerService,
} from './tracker-poll-runner.service';
import { TrackerController } from './tracker.controller';
import { TrackerService } from './tracker.service';
import { TrackerConnectionSource } from './tracker.source';

/**
 * Модуль трекера задач.
 *
 * Наружу отдаёт источник порта, разрешённое подключение и репозиторий
 * привязок, а репозиторий подключений и репозиторий выгрузок остаются
 * внутри: настройку вправе писать лишь свои ручки под `SuperadminGuard`, а
 * читать её потребителям нужно уже разрешённой, с расшифрованным токеном;
 * выгрузками же не пользуется никто снаружи — и прогон опроса, который
 * шагом C3 собирались поселить рядом, живёт **в этом же** модуле (ниже
 * сказано, почему).
 *
 * `TasksModule` здесь **не импортируется**, хотя выгрузка работает с
 * задачами: репозиторий выгрузок читает `project_tasks` своим запросом, и
 * обратный импорт замкнул бы кольцо модулей — реестр задач уже зависит от
 * проекции зеркала. Кольцо пришлось бы разрывать `forwardRef`, то есть
 * прятать зависимость вместо того, чтобы её не иметь.
 *
 * `CryptoService` не импортируется: его модуль глобальный, и второго
 * механизма шифрования в системе не появляется.
 *
 * `AuthModule` обязателен: все три контроллера висят на `SessionGuard`.
 */
@Module({
  imports: [DbModule, AccessModule, AuditModule, AuthModule],
  controllers: [TrackerController, ProjectTrackerController, TaskExportsController],
  providers: [
    TrackerConnectionsRepository,
    TrackerBindingsRepository,
    TaskExportsRepository,
    TrackerConnectionService,
    TrackerService,
    TaskExportsService,
    // Прогон опроса живёт в **том же** модуле, что выгрузка: он спрашивает
    // о тех же строках тем же портом, а второй модуль рядом означал бы
    // второй токен источника и вторую регистрацию репозитория.
    TrackerPollRunnerService,
    // Замку тика нужно соединение на всё его время. В развёртывании оно
    // берётся из того же пула, что рабочие запросы (их там десяток, одного
    // не жалко); отдельным токеном он объявлен затем, что в тестах рабочий
    // пул состоит из единственного соединения — занять его значило бы
    // запереть сам прогон.
    { provide: TRACKER_POLL_LOCK_DB, useExisting: DATABASE },
    // Замку задачи — то же устройство и по той же причине: он держится на
    // своём соединении, пока записи обмена идут своими транзакциями на
    // рабочем. Свой токен, а не тот же: эти два замка подменяются в тестах
    // по отдельности — у них разные владельцы (прогон и ручка) и разное
    // время жизни (весь тик и один обмен).
    { provide: TASK_EXPORT_LOCK_DB, useExisting: DATABASE },
    // За токеном стоит источник адаптера, а не адаптер: настройка меняется
    // на ходу, значит и адаптер строится на каждый вызов.
    { provide: TRACKER_SOURCE, useClass: TrackerConnectionSource },
  ],
  exports: [TRACKER_SOURCE, TrackerConnectionService, TrackerBindingsRepository],
})
export class TrackerModule {}
