import { Logger, Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ChronicleModule } from '../chronicle/chronicle.module';
import { DATABASE, DbModule } from '../db/db.module';
import { ModelServicesModule } from '../model-services/model-services.module';
import { RoadmapModule } from '../roadmap/roadmap.module';
import { TasksModule } from '../tasks/tasks.module';
import { SummariesController } from './summaries.controller';
import { SummariesOverviewController } from './summaries-overview.controller';
import { SummariesRepository } from './summaries.repository';
import { SummariesService } from './summaries.service';
import { AUDIO_EXTRACTOR, type AudioExtractor } from './transcription/extractor';
import { FfmpegExtractor, ffmpegCommandsOf } from './transcription/ffmpeg.extractor';
import { RecordingStore } from './transcription/recording-store';
import { transcriberSettings } from './transcription/settings';
import {
  TRANSCRIPTION_RUN_LOCK_DB,
  TranscriptionRunnerService,
} from './transcription/transcription-runner.service';
import { TranscriptionsController } from './transcription/transcriptions.controller';
import { TranscriptionRepository } from './transcription/transcription.repository';
import { TranscriptionService } from './transcription/transcription.service';
import { UnavailableExtractor } from './transcription/unavailable.extractor';

/**
 * Модуль конструктора задач из саммари созвона.
 *
 * Хронику и роадмап не трогает, а пользуется их репозиториями: текст
 * живёт записью хроники, а результат уезжает в роадмап штатным путём.
 */
@Module({
  imports: [
    DbModule,
    AccessModule,
    AuditModule,
    AuthModule,
    ChronicleModule,
    RoadmapModule,
    TasksModule,
    ModelServicesModule,
  ],
  // Порядок значим: `GET …/summaries/transcriptions` и
  // `GET …/summaries/:id` живут на одном префиксе, и отвечает тот, кто
  // объявлен раньше. Поставь расшифровки вторыми — и очередь попадала бы в
  // маршрут саммари, получая `400` про негодный UUID.
  controllers: [TranscriptionsController, SummariesController, SummariesOverviewController],
  providers: [
    SummariesRepository,
    SummariesService,
    // Расшифровка живёт в **том же** модуле: это вторая итерация того же
    // потока, а второй модуль рядом означал бы второй токен порта, вторую
    // регистрацию и вторую точку, где можно забыть проверку права
    // (дизайн, 5).
    TranscriptionRepository,
    TranscriptionService,
    TranscriptionRunnerService,
    // Замку тика нужно соединение на всё его время. В развёртывании оно
    // берётся из того же пула, что рабочие запросы (их там десяток, одного
    // не жалко); отдельным токеном он объявлен затем, что в тестах рабочий
    // пул состоит из единственного соединения — занять его значило бы
    // запереть сам прогон.
    { provide: TRANSCRIPTION_RUN_LOCK_DB, useExisting: DATABASE },
    // Порт расшифровки здесь не строится вовсе: его источник живёт в
    // `ModelServicesModule` и строит адаптер на вызов, потому что узел
    // настраивается на экране. Извлечение остаётся фабрикой при старте, и
    // это не недоделка: «есть ли `ffmpeg` в системе» — вопрос к файловой
    // системе, он за время жизни процесса не меняется и экраном не
    // правится. Порты по-прежнему **не читают настройку друг друга**:
    // установка с `ffmpeg` и без ключа принимает видео, извлекает дорожку
    // и честно говорит, что отправлять её некуда (дизайн, 7.6).
    {
      provide: AUDIO_EXTRACTOR,
      useFactory: audioExtractorOf,
      inject: [RecordingStore],
    },
  ],
  // Источник адаптера приходит из `ModelServicesModule`: он строится из
  // одной только службы разрешения настройки, и проверка связи на экране
  // администрирования нуждается в том же источнике. Две регистрации одного
  // токена разошлись бы при первой правке фабрики.
  // Токенов портов в выдаче нет: пользуются ими службы этого же модуля, а
  // выдавать наружу порт, за которым стоит ключ, незачем.
  exports: [SummariesRepository, SummariesService],
})
export class SummariesModule {}

/**
 * Порт извлечения по тому, что нашлось в системе.
 *
 * Исполняемые файлы разрешаются **один раз** здесь: «есть ли файл» — вопрос
 * к файловой системе, и задавать его на каждую загрузку значило бы ходить
 * на диск ради того, что за время жизни процесса не меняется (дизайн, 7.4).
 *
 * Отсутствие пакета установку не ломает, а сужает: принимаются MP3, WAV и
 * OGG, видео получает названный отказ, всё остальное работает.
 */
function audioExtractorOf(store: RecordingStore): AudioExtractor {
  const logger = new Logger('AudioExtractor');
  const commands = ffmpegCommandsOf(transcriberSettings().ffmpeg);

  if (commands === null) {
    logger.log('Извлечение недоступно: принимаются только MP3, WAV и OGG');

    return new UnavailableExtractor();
  }

  logger.log(`Извлечение доступно: ${commands.ffmpeg}`);

  return new FfmpegExtractor(commands, store);
}
