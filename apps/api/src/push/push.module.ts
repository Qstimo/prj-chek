import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { PushController } from './push.controller';
import { PushNotifier } from './push.notifier';
import { PushRepository } from './push.repository';
import { PushSender, PUSH_TRANSPORT, realTransport } from './push.sender';
import { PushService } from './push.service';

/** Модуль веб-пушей. */
@Module({
  imports: [DbModule, AccessModule, AuditModule, AuthModule],
  controllers: [PushController],
  providers: [
    PushRepository,
    PushSender,
    PushNotifier,
    PushService,
    // Транспорт собирается один раз при старте: ключи читаются оттуда же,
    // откуда интервал прогона, и меняются перезапуском.
    { provide: PUSH_TRANSPORT, useFactory: realTransport },
  ],
  exports: [PushNotifier],
})
export class PushModule {}
