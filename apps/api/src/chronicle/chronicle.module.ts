import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { RecordingStore } from '../summaries/transcription/recording-store';
import { ChronicleController } from './chronicle.controller';
import { ChronicleRepository } from './chronicle.repository';
import { ChronicleService } from './chronicle.service';

/**
 * Модуль секции «Хроника».
 *
 * `RecordingStore` зарегистрирован здесь своей строкой, а не взят из
 * модуля саммари: `SummariesModule` импортирует этот модуль, и обратный
 * импорт замкнул бы круг. Своя копия ничего не стоит — состояния у
 * хранилища нет вовсе, каталог записей оно читает при каждом вызове.
 */
@Module({
  imports: [DbModule, AccessModule, AuditModule, AuthModule],
  controllers: [ChronicleController],
  providers: [ChronicleRepository, ChronicleService, RecordingStore],
  exports: [ChronicleRepository, ChronicleService],
})
export class ChronicleModule {}
