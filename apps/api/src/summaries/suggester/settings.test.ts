import { ModelAuthScheme, ModelServicePlacement } from '@cairn/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_SUGGESTER_MAX_CHARS,
  DEFAULT_SUGGESTER_MAX_TASKS,
  DEFAULT_SUGGESTER_MODEL,
  DEFAULT_SUGGESTER_TIMEOUT_SECONDS,
  EXTERNAL_BASE_URL,
  SUGGESTER_API_KEY_ENV,
  SUGGESTER_AUTH_SCHEME_ENV,
  SUGGESTER_BASE_URL_ENV,
  SUGGESTER_FOLDER_ENV,
  SUGGESTER_NODE_ENV_NAMES,
  hostOf,
  suggesterSettings,
} from './settings';

/** Все переменные порта: тест их меняет, и каждая обязана восстановиться. */
const NAMES = [
  'CAIRN_TASK_SUGGESTER',
  'CAIRN_TASK_SUGGESTER_BASE_URL',
  'CAIRN_TASK_SUGGESTER_API_KEY',
  'CAIRN_TASK_SUGGESTER_AUTH_SCHEME',
  'CAIRN_TASK_SUGGESTER_FOLDER',
  'CAIRN_TASK_SUGGESTER_MODEL',
  'CAIRN_TASK_SUGGESTER_TIMEOUT_SECONDS',
  'CAIRN_TASK_SUGGESTER_MAX_CHARS',
  'CAIRN_TASK_SUGGESTER_MAX_TASKS',
];

describe('настройки предложителя', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));

    // Чистое окружение на каждую проверку: иначе ключ, оставленный
    // соседним тестом, включал бы порт там, где проверяется выключенный.
    for (const name of NAMES) {
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const name of NAMES) {
      if (saved[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = saved[name];
      }
    }
  });

  it('внешний адаптер без ключа выключен', () => {
    // Так совмещаются «по умолчанию внешний» и «self-hosted без внешних
    // зависимостей»: внешним путь становится от того, что его включили,
    // а не от того, что забыли выключить.
    process.env.CAIRN_TASK_SUGGESTER = 'external';
    process.env.CAIRN_TASK_SUGGESTER_API_KEY = '';

    expect(suggesterSettings().isEnabled).toBe(false);
  });

  it('внешний адаптер с ключом включён по умолчанию адреса', () => {
    process.env.CAIRN_TASK_SUGGESTER = 'external';
    process.env.CAIRN_TASK_SUGGESTER_API_KEY = 'ключ';

    const settings = suggesterSettings();

    expect(settings.isEnabled).toBe(true);
    expect(settings.baseUrl).toBe(EXTERNAL_BASE_URL);
  });

  it('пустой адрес от compose не отменяет умолчания внешнего адаптера', () => {
    // Compose передаёт `${VAR:-}` пустой строкой, а не отсутствующей
    // переменной: `docker compose config` показывает `BASE_URL: ""`.
    // Пустая строка не nullish, и `??` её не ловит — порт в контейнере
    // оказался бы выключен при вписанном ключе.
    process.env.CAIRN_TASK_SUGGESTER = 'external';
    process.env.CAIRN_TASK_SUGGESTER_BASE_URL = '';
    process.env.CAIRN_TASK_SUGGESTER_API_KEY = 'ключ';

    const settings = suggesterSettings();

    expect(settings.baseUrl).toBe(EXTERNAL_BASE_URL);
    expect(settings.isEnabled).toBe(true);
  });

  it('локальный адаптер без адреса выключен', () => {
    process.env.CAIRN_TASK_SUGGESTER = 'local';
    process.env.CAIRN_TASK_SUGGESTER_BASE_URL = '';

    expect(suggesterSettings().isEnabled).toBe(false);
  });

  it('локальный адаптер без ключа требует явной схемы none', () => {
    // Названная несовместимость: ключ обязателен, когда схема не `none`,
    // а умолчание схемы — `bearer`. Прежде `local` обходился без ключа
    // сам по себе, и это и было той двусмысленностью, из-за которой
    // «узел без ключа» и «забыли вписать ключ» в коде не различались
    // (дизайн, 6.2).
    process.env.CAIRN_TASK_SUGGESTER = 'local';
    process.env.CAIRN_TASK_SUGGESTER_BASE_URL = 'http://llm.internal/v1';
    process.env.CAIRN_TASK_SUGGESTER_API_KEY = '';

    expect(suggesterSettings().isEnabled).toBe(false);
  });

  it('разбор окружения отдаёт схему авторизации, а не домысливает её', () => {
    process.env[SUGGESTER_AUTH_SCHEME_ENV] = 'api_key';

    expect(suggesterSettings().authScheme).toBe(ModelAuthScheme.ApiKey);
  });

  it('умолчание схемы — bearer: так устроены OpenAI и ProxyAPI', () => {
    delete process.env[SUGGESTER_AUTH_SCHEME_ENV];

    expect(suggesterSettings().authScheme).toBe(ModelAuthScheme.Bearer);
  });

  it('мусор в схеме даёт умолчание, а не отказ', () => {
    // Тот же принцип, что у чисел: мусор означает умолчание.
    process.env[SUGGESTER_AUTH_SCHEME_ENV] = 'ПочтиApiKey';

    expect(suggesterSettings().authScheme).toBe(ModelAuthScheme.Bearer);
  });

  it('при схеме none ключ не требуется для включённости', () => {
    process.env[SUGGESTER_AUTH_SCHEME_ENV] = 'none';
    process.env[SUGGESTER_BASE_URL_ENV] = 'http://llm.internal:8000/v1';
    delete process.env[SUGGESTER_API_KEY_ENV];

    expect(suggesterSettings().isEnabled).toBe(true);
  });

  it('при схеме api_key ключ обязателен так же, как при bearer', () => {
    process.env[SUGGESTER_AUTH_SCHEME_ENV] = 'api_key';
    process.env[SUGGESTER_BASE_URL_ENV] = 'https://llm.api.cloud.yandex.net/v1';
    delete process.env[SUGGESTER_API_KEY_ENV];

    expect(suggesterSettings().isEnabled).toBe(false);
  });

  it('каталог читается и пустой означает отсутствие', () => {
    process.env[SUGGESTER_FOLDER_ENV] = ' b1g… ';

    expect(suggesterSettings().folder).toBe('b1g…');
  });

  it('каталога нет — null, а не пустая строка', () => {
    // `null` отвечает на «задан ли каталог» одним значением на оба
    // источника: в базе колонка обнуляема, и пустая строка здесь
    // разошлась бы с ней.
    delete process.env[SUGGESTER_FOLDER_ENV];

    expect(suggesterSettings().folder).toBeNull();
  });

  it('выключатель off отличим от неполноты настройки', () => {
    // Разрешение настройки показывает их разными причинами: `off` —
    // решение человека, неполнота — недоделанная настройка.
    process.env.CAIRN_TASK_SUGGESTER = 'off';
    process.env[SUGGESTER_API_KEY_ENV] = 'ключ';

    expect(suggesterSettings()).toMatchObject({ isOff: true, isEnabled: false });
  });

  it('имена переменных узла названы списком и не включают пределов потока', () => {
    // Список нужен экрану администрирования: он называет переменные,
    // которые перестали действовать, когда настройка задана в
    // интерфейсе. `MAX_CHARS` и `MAX_TASKS` в него не входят — они
    // остаются действующими всегда, потому что это поведение нашего
    // потока, а не свойство узла (дизайн, 7.1).
    expect(SUGGESTER_NODE_ENV_NAMES).toEqual([
      'CAIRN_TASK_SUGGESTER',
      'CAIRN_TASK_SUGGESTER_BASE_URL',
      'CAIRN_TASK_SUGGESTER_AUTH_SCHEME',
      'CAIRN_TASK_SUGGESTER_API_KEY',
      'CAIRN_TASK_SUGGESTER_MODEL',
      'CAIRN_TASK_SUGGESTER_FOLDER',
      'CAIRN_TASK_SUGGESTER_TIMEOUT_SECONDS',
    ]);
  });

  it('адрес внешнего API не подставляется локальному', () => {
    // Иначе `local` без адреса тихо ушёл бы наружу — ровно та подмена
    // границы передачи данных, которую запрещает дизайн.
    process.env.CAIRN_TASK_SUGGESTER = 'local';

    expect(suggesterSettings().baseUrl).toBe('');
  });

  it('off выключает порт при любом ключе', () => {
    process.env.CAIRN_TASK_SUGGESTER = 'off';
    process.env.CAIRN_TASK_SUGGESTER_API_KEY = 'ключ';

    expect(suggesterSettings().isEnabled).toBe(false);
  });

  it('умолчание — внешний адаптер', () => {
    delete process.env.CAIRN_TASK_SUGGESTER;

    expect(suggesterSettings().placement).toBe(ModelServicePlacement.External);
  });

  it('незнакомое значение вида даёт умолчание', () => {
    // Опечатка в `.env` не должна выключать порт молча: вид разбирается
    // как настройка, а включённость — ключом и адресом.
    process.env.CAIRN_TASK_SUGGESTER = 'внешний';

    expect(suggesterSettings().placement).toBe(ModelServicePlacement.External);
  });

  it('мусор в пределе ожидания даёт умолчание, а не бесконечность', () => {
    process.env.CAIRN_TASK_SUGGESTER_TIMEOUT_SECONDS = 'скоро';

    expect(suggesterSettings().timeoutSeconds).toBe(DEFAULT_SUGGESTER_TIMEOUT_SECONDS);
    expect(DEFAULT_SUGGESTER_TIMEOUT_SECONDS).toBe(60);
  });

  it('нулевой предел объёма даёт умолчание', () => {
    process.env.CAIRN_TASK_SUGGESTER_MAX_CHARS = '0';

    expect(suggesterSettings().maxChars).toBe(DEFAULT_SUGGESTER_MAX_CHARS);
    expect(DEFAULT_SUGGESTER_MAX_CHARS).toBe(40_000);
  });

  it('пределы читаются из настройки', () => {
    process.env.CAIRN_TASK_SUGGESTER_TIMEOUT_SECONDS = '15';
    process.env.CAIRN_TASK_SUGGESTER_MAX_CHARS = '1000';
    process.env.CAIRN_TASK_SUGGESTER_MAX_TASKS = '7';

    expect(suggesterSettings()).toMatchObject({
      timeoutSeconds: 15,
      maxChars: 1000,
      maxTasks: 7,
    });
  });

  it('число задач по умолчанию — пятьдесят', () => {
    expect(suggesterSettings().maxTasks).toBe(DEFAULT_SUGGESTER_MAX_TASKS);
    expect(DEFAULT_SUGGESTER_MAX_TASKS).toBe(50);
  });

  it('модель задаётся настройкой, а не кодом', () => {
    process.env.CAIRN_TASK_SUGGESTER_MODEL = 'своя-модель';

    expect(suggesterSettings().model).toBe('своя-модель');
    expect(DEFAULT_SUGGESTER_MODEL).toBe('gpt-4o-mini');
  });

  it('имя узла извлекается без пути и без ключа', () => {
    // Оно показывается человеку и попадает в журнал; полный адрес и
    // ключ — никуда.
    expect(hostOf('https://api.openai.com/v1/')).toBe('api.openai.com');
  });

  it('негодный адрес имени узла не даёт', () => {
    expect(hostOf('не адрес')).toBeNull();
  });

  it('имя узла настроек берётся из адреса', () => {
    process.env.CAIRN_TASK_SUGGESTER = 'local';
    process.env.CAIRN_TASK_SUGGESTER_BASE_URL = 'http://llm.internal:8080/v1';

    expect(suggesterSettings().host).toBe('llm.internal');
  });
});
