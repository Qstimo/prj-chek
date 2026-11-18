import { ModelAuthScheme, TranscriberKind } from '@cairn/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_AUDIO_BITRATE,
  DEFAULT_EXTRACT_MINUTES,
  DEFAULT_TRANSCRIBER_MODEL,
  DEFAULT_TRANSCRIBER_TIMEOUT_SECONDS,
  DEFAULT_TRANSCRIPTION_MAX_MINUTES,
  DEFAULT_TRANSCRIPTION_POLL_SECONDS,
  FFMPEG_AUTO,
  FFMPEG_OFF,
  TRANSCRIBER_EXTERNAL_BASE_URL,
  TRANSCRIBER_NODE_ENV_NAMES,
  TRANSCRIPTION_ENV_NAMES,
  transcriberSettings,
} from './settings';

describe('настройки расшифровки', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(
      TRANSCRIPTION_ENV_NAMES.map((name) => [name, process.env[name]]),
    );

    // Чистое окружение на каждую проверку: иначе ключ, оставленный
    // соседним тестом, включал бы порт там, где проверяется выключенный.
    for (const name of TRANSCRIPTION_ENV_NAMES) {
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const name of TRANSCRIPTION_ENV_NAMES) {
      if (saved[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = saved[name];
      }
    }
  });

  it('без переменных порт выключен', () => {
    // Умолчание `off`, а не `external`: это выполнение обещания раздела
    // 6.2 первой итерации, и цена ошибки здесь выше — наружу уходит не
    // выжимка, а всё сказанное.
    expect(transcriberSettings().isEnabled).toBe(false);
    expect(transcriberSettings().kind).toBe(TranscriberKind.External);
  });

  it('внешнему нужны и ключ, и каталог', () => {
    // x-folder-id у SpeechKit не опционален: порт, включённый
    // наполовину, отказывал бы на каждом вызове вместо честной
    // выключенной кнопки.
    process.env.CAIRN_TRANSCRIBER = 'external';
    process.env.CAIRN_TRANSCRIBER_API_KEY = 'ключ';

    expect(transcriberSettings().isEnabled).toBe(false);

    process.env.CAIRN_TRANSCRIBER_FOLDER_ID = 'каталог';

    expect(transcriberSettings().isEnabled).toBe(true);
  });

  it('у external есть умолчание адреса, у local — нет', () => {
    // Подставить внешний адрес локальной установке значило бы тихо
    // отправить запись наружу: подмена названной границы.
    process.env.CAIRN_TRANSCRIBER = 'local';

    expect(transcriberSettings().baseUrl).toBe('');
  });

  it('пустая строка читается как отсутствие, а не как адрес', () => {
    // compose передаёт необъявленную переменную пустой строкой
    // (`${VAR:-}`), и на `??` порт оказался бы выключен при вписанном
    // ключе — то есть ровно там, где он настроен.
    process.env.CAIRN_TRANSCRIBER = 'external';
    process.env.CAIRN_TRANSCRIBER_BASE_URL = '   ';

    expect(transcriberSettings().baseUrl).toBe(TRANSCRIBER_EXTERNAL_BASE_URL);
  });

  it('off выключает при любом ключе', () => {
    process.env.CAIRN_TRANSCRIBER = 'off';
    process.env.CAIRN_TRANSCRIBER_API_KEY = 'ключ';
    process.env.CAIRN_TRANSCRIBER_FOLDER_ID = 'каталог';

    expect(transcriberSettings().isEnabled).toBe(false);
    expect(transcriberSettings().isOff).toBe(true);
  });

  it('мусор в числах даёт умолчание, а не ноль', () => {
    process.env.CAIRN_TRANSCRIBER_MAX_BYTES = 'сорок';
    process.env.CAIRN_TRANSCRIPTION_MAX_MINUTES = '-5';

    expect(transcriberSettings().maxSendBytes).toBe(41_943_040);
    expect(transcriberSettings().maxMinutes).toBe(120);
  });

  it('два предела читаются порознь и не путаются', () => {
    // До службы едет не загруженный файл, а дорожка; мерить их одним
    // числом значит либо запретить видео, либо пообещать службе то,
    // чего она не примет (дизайн, 3.6).
    process.env.CAIRN_RECORDING_MAX_BYTES = '1000';
    process.env.CAIRN_TRANSCRIBER_MAX_BYTES = '2000';

    expect(transcriberSettings().maxUploadBytes).toBe(1000);
    expect(transcriberSettings().maxSendBytes).toBe(2000);
  });

  it('предел загрузки по умолчанию — два гигабайта', () => {
    // Выведен из чужого предела длительности: четыре часа — самая
    // длинная запись, которую можно распознать, и четыре часа 720p это
    // примерно столько.
    expect(transcriberSettings().maxUploadBytes).toBe(2_147_483_648);
  });

  it('ffmpeg по умолчанию ищется в PATH', () => {
    expect(transcriberSettings().ffmpeg).toBe(FFMPEG_AUTO);
  });

  it('off у ffmpeg выключает извлечение при любом пакете в образе', () => {
    // Отсутствие — обстоятельство, off — решение администратора не
    // нагружать машину перекодированием. Без этого значения
    // единственным способом отказаться было бы удалить пакет.
    process.env.CAIRN_RECORDING_FFMPEG = 'off';

    expect(transcriberSettings().ffmpeg).toBe(FFMPEG_OFF);
  });

  it('путь к исполняемому берётся как написан', () => {
    // Ни `auto`, ни `off`: администратор назвал файл, и разрешать его
    // здесь нечем — это вопрос к файловой системе, и задаёт его фабрика
    // порта один раз при старте.
    process.env.CAIRN_RECORDING_FFMPEG = '/opt/ffmpeg/bin/ffmpeg';

    expect(transcriberSettings().ffmpeg).toBe('/opt/ffmpeg/bin/ffmpeg');
  });

  it('битрейт извлечения — настройка с умолчанием 24k', () => {
    // Компромисс точности и предела отправки, не измеренный на живом
    // материале; константа означала бы, что мы уже измерили.
    expect(transcriberSettings().audioBitrate).toBe(DEFAULT_AUDIO_BITRATE);
  });

  it('предел извлечения — тридцать минут, и он свой', () => {
    // Извлечение идёт у нас и измеряется минутами процессора, а обмен со
    // службой — секундами сети: одно число на оба означало бы либо убитый
    // ffmpeg, либо запрос, висящий полчаса.
    expect(transcriberSettings().extractMinutes).toBe(DEFAULT_EXTRACT_MINUTES);
    expect(transcriberSettings().timeoutSeconds).toBe(DEFAULT_TRANSCRIBER_TIMEOUT_SECONDS);
  });

  it('имя узла берётся из адреса, без пути и ключа', () => {
    process.env.CAIRN_TRANSCRIBER_BASE_URL = 'https://stt.api.cloud.yandex.net/stt/v3';

    expect(transcriberSettings().host).toBe('stt.api.cloud.yandex.net');
  });

  it('негодный адрес даёт пустое имя узла, а не аварию', () => {
    process.env.CAIRN_TRANSCRIBER_BASE_URL = 'не адрес';

    expect(transcriberSettings().host).toBeNull();
  });

  it('ноль в интервале опроса выключает цикл', () => {
    // Так работают тесты и локальная разработка — как у прогона
    // проверок статуса.
    process.env.CAIRN_TRANSCRIPTION_POLL_SECONDS = '0';

    expect(transcriberSettings().pollSeconds).toBe(0);
  });

  it('мусор в интервале опроса даёт умолчание, а не выключенный цикл', () => {
    // Ноль — решение, а мусор — опечатка, и принять опечатку за решение
    // значило бы выключить расшифровку молча.
    process.env.CAIRN_TRANSCRIPTION_POLL_SECONDS = 'каждые двадцать';

    expect(transcriberSettings().pollSeconds).toBe(DEFAULT_TRANSCRIPTION_POLL_SECONDS);
  });

  it('модель по умолчанию — general', () => {
    expect(transcriberSettings().model).toBe(DEFAULT_TRANSCRIBER_MODEL);
    expect(transcriberSettings().maxMinutes).toBe(DEFAULT_TRANSCRIPTION_MAX_MINUTES);
  });

  it('схема авторизации у внешнего — Api-Key, у своего узла заголовка нет', () => {
    // SpeechKit предъявляет ключ словом `Api-Key`, а не `Bearer`
    // (дизайн, таблица подтверждённого). Четырнадцатой переменной под
    // схему здесь нет намеренно: узел настраивается строкой
    // `model_services`, где схема — поле, а окружение осталось запасным
    // источником ровно шести названных переменных.
    process.env.CAIRN_TRANSCRIBER = 'external';

    expect(transcriberSettings().authScheme).toBe(ModelAuthScheme.ApiKey);

    process.env.CAIRN_TRANSCRIBER = 'local';

    expect(transcriberSettings().authScheme).toBe(ModelAuthScheme.None);
  });

  it('локальному узлу хватает адреса', () => {
    // Ключа он не требует, и требовать его значило бы запереть ровно тот
    // путь, которым запись никуда не уходит.
    process.env.CAIRN_TRANSCRIBER = 'local';
    process.env.CAIRN_TRANSCRIBER_BASE_URL = 'http://whisper:8000';

    expect(transcriberSettings().isEnabled).toBe(true);
    expect(transcriberSettings().kind).toBe(TranscriberKind.Local);
  });

  it('переменные узла — шесть, и пределов потока среди них нет', () => {
    // Экран администрирования называет их дважды: как действующий
    // источник и как «эти переменные больше не действуют». Пределы
    // потока там назвать нельзя — они действуют всегда.
    expect(TRANSCRIBER_NODE_ENV_NAMES).toEqual([
      'CAIRN_TRANSCRIBER',
      'CAIRN_TRANSCRIBER_BASE_URL',
      'CAIRN_TRANSCRIBER_API_KEY',
      'CAIRN_TRANSCRIBER_FOLDER_ID',
      'CAIRN_TRANSCRIBER_MODEL',
      'CAIRN_TRANSCRIBER_TIMEOUT_SECONDS',
    ]);
  });

  it('каталог записей здесь не читается: он принадлежит хранилищу', () => {
    // Второе место, читающее `CAIRN_RECORDINGS_DIR`, разошлось бы с
    // первым, а путь к тому нужен ровно `RecordingStore`.
    expect(TRANSCRIPTION_ENV_NAMES).not.toContain('CAIRN_RECORDINGS_DIR');
  });
});
