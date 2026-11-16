import { TaskSuggesterKind } from '@cairn/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_SUGGESTER_MAX_CHARS,
  DEFAULT_SUGGESTER_MAX_TASKS,
  DEFAULT_SUGGESTER_MODEL,
  DEFAULT_SUGGESTER_TIMEOUT_SECONDS,
  EXTERNAL_BASE_URL,
  hostOf,
  suggesterSettings,
} from './settings';

/** Все переменные порта: тест их меняет, и каждая обязана восстановиться. */
const NAMES = [
  'CAIRN_TASK_SUGGESTER',
  'CAIRN_TASK_SUGGESTER_BASE_URL',
  'CAIRN_TASK_SUGGESTER_API_KEY',
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

  it('локальный адаптер ключа не требует', () => {
    process.env.CAIRN_TASK_SUGGESTER = 'local';
    process.env.CAIRN_TASK_SUGGESTER_BASE_URL = 'http://llm.internal/v1';
    process.env.CAIRN_TASK_SUGGESTER_API_KEY = '';

    expect(suggesterSettings().isEnabled).toBe(true);
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

    expect(suggesterSettings().kind).toBe(TaskSuggesterKind.External);
  });

  it('незнакомое значение вида даёт умолчание', () => {
    // Опечатка в `.env` не должна выключать порт молча: вид разбирается
    // как настройка, а включённость — ключом и адресом.
    process.env.CAIRN_TASK_SUGGESTER = 'внешний';

    expect(suggesterSettings().kind).toBe(TaskSuggesterKind.External);
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
