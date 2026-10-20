import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { DbModule } from '../db/db.module';
import { PushNotifier } from './push.notifier';
import { PushRepository } from './push.repository';
import { PushSender, PUSH_TRANSPORT, realTransport } from './push.sender';

/** Модуль веб-пушей. */
@Module({
  imports: [DbModule, AccessModule],
  providers: [
    PushRepository,
    PushSender,
    PushNotifier,
    // Транспорт собирается один раз при старте: ключи читаются оттуда же,
    // откуда интервал прогона, и меняются перезапуском.
    { provide: PUSH_TRANSPORT, useFactory: realTransport },
  ],
  exports: [PushNotifier],
})
export class PushModule {}
