import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { ModelServiceTaskSuggesterSource } from '../summaries/suggester/task-suggester.source';
import { TASK_SUGGESTER_SOURCE } from '../summaries/suggester/task-suggester';
import { RecordingStore } from '../summaries/transcription/recording-store';
import { ModelServiceTranscriberSource } from '../summaries/transcription/transcriber.source';
import { TRANSCRIBER_SOURCE } from '../summaries/transcription/transcriber';
import { ModelServiceSettingsService } from './model-service-settings.service';
import { ModelServicesController } from './model-services.controller';
import { ModelServicesRepository } from './model-services.repository';
import { ModelServicesService } from './model-services.service';

/**
 * Модуль настройки служб модели.
 *
 * Наружу отдаёт службу разрешения и источник адаптера: репозиторий
 * остаётся внутри, потому что писать настройку вправе лишь свои ручки под
 * `SuperadminGuard`, а читать её потребителям нужно уже разрешённой — с
 * выбранным источником и расшифрованным ключом (дизайн, 5.2).
 *
 * Источник адаптера предложителя живёт **здесь**, а не в
 * `SummariesModule`, и это не вкус: проверка связи — ручка
 * администрирования, значит ей нужен порт, а `SummariesModule` и так
 * импортирует этот модуль. Регистрация источника там заставила бы модули
 * импортировать друг друга. Строится источник из одной только службы
 * разрешения, то есть принадлежит этой стороне по существу.
 *
 * `CryptoService` не импортируется: его модуль глобальный, и второго
 * механизма шифрования в системе не появляется.
 */
@Module({
  imports: [DbModule, AuditModule, AuthModule],
  controllers: [ModelServicesController],
  providers: [
    ModelServicesRepository,
    ModelServiceSettingsService,
    ModelServicesService,
    // За токеном стоит источник адаптера, а не адаптер: настройка
    // меняется на ходу, значит и адаптер строится на каждый вызов
    // (дизайн, 9.2).
    { provide: TASK_SUGGESTER_SOURCE, useClass: ModelServiceTaskSuggesterSource },
    // Источник расшифровки живёт здесь по той же причине, что источник
    // предложителя: проверка связи — ручка администрирования, и порт нужен
    // ей самой. Хранилище записей ему нужно затем, что дорожка уходит
    // службе телом запроса, и читает файл адаптер.
    //
    // Регистрация хранилища **одна на систему** и стоит здесь, а не в
    // `SummariesModule`: тот этот модуль импортирует, обратное создало бы
    // кольцо. Две регистрации одного класса дали бы два экземпляра, то
    // есть два места, читающих каталог записей, — ровно та симметрия,
    // которой `CAIRN_RECORDINGS_DIR` и избегает.
    RecordingStore,
    { provide: TRANSCRIBER_SOURCE, useClass: ModelServiceTranscriberSource },
  ],
  exports: [ModelServiceSettingsService, TASK_SUGGESTER_SOURCE, TRANSCRIBER_SOURCE, RecordingStore],
})
export class ModelServicesModule {}
