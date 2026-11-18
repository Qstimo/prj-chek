import { TranscriberKind } from '@cairn/shared';
import { Logger, Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ChronicleModule } from '../chronicle/chronicle.module';
import { DATABASE, DbModule } from '../db/db.module';
import { ModelServicesModule } from '../model-services/model-services.module';
import { RoadmapModule } from '../roadmap/roadmap.module';
import { SummariesController } from './summaries.controller';
import { SummariesOverviewController } from './summaries-overview.controller';
import { SummariesRepository } from './summaries.repository';
import { SummariesService } from './summaries.service';
import { DisabledTranscriber } from './transcription/disabled.transcriber';
import { AUDIO_EXTRACTOR, type AudioExtractor } from './transcription/extractor';
import { FfmpegExtractor, ffmpegCommandsOf } from './transcription/ffmpeg.extractor';
import { RecordingStore } from './transcription/recording-store';
import { transcriberSettings } from './transcription/settings';
import { TRANSCRIBER, type Transcriber } from './transcription/transcriber';
import {
  TRANSCRIPTION_RUN_LOCK_DB,
  TranscriptionRunnerService,
} from './transcription/transcription-runner.service';
import { TranscriptionRepository } from './transcription/transcription.repository';
import { TranscriptionService } from './transcription/transcription.service';
import { UnavailableExtractor } from './transcription/unavailable.extractor';
import { YandexSpeechKitTranscriber } from './transcription/yandex-speechkit.transcriber';

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
    ModelServicesModule,
  ],
  controllers: [SummariesController, SummariesOverviewController],
  providers: [
    SummariesRepository,
    SummariesService,
    RecordingStore,
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
    // Две фабрики, и **ни одна не читает настройку другой**: порты
    // выключаются независимо, потому что различны по природе — расшифровка
    // уходит наружу и стоит денег, извлечение идёт на нашей машине
    // бесплатно. Установка с `ffmpeg` и без ключа принимает видео,
    // извлекает дорожку и честно говорит, что отправлять её некуда
    // (дизайн, 7.6).
    {
      provide: TRANSCRIBER,
      useFactory: transcriberOf,
      inject: [RecordingStore],
    },
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
 * Адаптер расшифровки по действующей настройке.
 *
 * Строится один раз при старте — и это названная граница, а не образец:
 * узел расшифровки пока настраивается **только окружением**, а переключение
 * адаптера есть правка `.env` и перезапуск, то есть действие суперадмина
 * (дизайн, 7.3).
 *
 * Когда в перечне `ModelServiceKind` появится значение `transcriber`
 * (одна строка перечня и одна миграция `ALTER TYPE` — дизайн настройки
 * служб модели, 7.3), эта фабрика станет **источником** по образцу
 * `ModelServiceTaskSuggesterSource`: адаптер начнёт рождаться на вызов, а
 * настройка — приходить из `ModelServiceSettingsService`, где база главнее
 * окружения. Сам адаптер при этом не изменится: он уже принимает настройку
 * в конструктор, а не читает её сам.
 *
 * Место под `local` — ветка с выключенным портом: обещать `local`,
 * которого нет, хуже, чем честно выключить (дизайн, 7.3).
 */
function transcriberOf(store: RecordingStore): Transcriber {
  const logger = new Logger('Transcriber');
  const settings = transcriberSettings();

  if (!settings.isEnabled || settings.kind === TranscriberKind.Local) {
    logger.log(
      settings.kind === TranscriberKind.Local
        ? 'Расшифровка: локальная служба не реализована, порт выключен'
        : 'Расшифровка не настроена: порт выключен',
    );

    return new DisabledTranscriber();
  }

  // Безопасное сообщение при старте: узел и модель, как у предложителя.
  // Ключа в нём нет ни при каких условиях.
  logger.log(`Расшифровка: ${settings.host ?? 'узел не назван'}, модель ${settings.model}`);

  return new YandexSpeechKitTranscriber(settings, store);
}

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
