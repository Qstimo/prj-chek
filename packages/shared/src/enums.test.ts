import { SummaryTaskState } from './enums';
import { describe, expect, it } from 'vitest';

import * as enums from './enums';
import {
  AccessLevel,
  ChronicleSource,
  ModelAuthScheme,
  ModelProbeOutcome,
  ModelServiceKind,
  ModelServicePlacement,
  ModelServiceSource,
  SummaryTaskOrigin,
  AuditSubjectKind,
  PlatformKind,
  PlatformReleaseState,
  Section,
  SubjectKind,
  TaskExportOutcome,
  TrackerKind,
  TranscriberKind,
  TranscriptionState,
} from './enums';

describe('Section', () => {
  it('содержит ровно шесть секций', () => {
    expect(Object.values(Section)).toHaveLength(6);
  });

  it('содержит все секции из ТЗ', () => {
    expect(Object.values(Section)).toEqual([
      'info',
      'infrastructure',
      'variables',
      'docs',
      'roadmap',
      'chronicle',
    ]);
  });
});

describe('AccessLevel', () => {
  it('содержит три уровня без значения «нет»', () => {
    expect(Object.values(AccessLevel)).toEqual(['metadata', 'read', 'write']);
  });
});

describe('AuditSubjectKind', () => {
  it('расширяет виды субъектов значением system', () => {
    expect(Object.values(AuditSubjectKind)).toEqual([
      ...Object.values(SubjectKind),
      'system',
    ]);
  });
});

describe('платформы', () => {
  it('вид отвечает на два вопроса поведения, а не перечисляет магазины', () => {
    // Магазинов много и новые появляются каждый год: значением перечня
    // их не удержать, поэтому имя платформы свободное.
    expect(Object.values(PlatformKind)).toEqual(['server', 'store', 'other']);
  });

  it('состояние выпуска не повторяет состояний версии', () => {
    // «Запланирована» и «в работе» — это состояние версии. Строка выпуска
    // с таким значением не сообщала бы ничего нового, и её отсутствие
    // как раз и означает «платформа идёт вместе с версией».
    const states = Object.values(PlatformReleaseState) as string[];

    expect(states).not.toContain('planned');
    expect(states).not.toContain('in_progress');
    expect(states).toEqual(['on_test', 'in_review', 'released', 'rejected']);
  });
});

describe('перечни саммари', () => {
  it('у записи хроники появился третий источник', () => {
    // Запись, заведённую конструктором, нельзя путать с рукописной:
    // лента хроники показывает источник.
    expect(ChronicleSource.Summary).toBe('summary');
    expect(Object.values(ChronicleSource)).toEqual(['manual', 'webhook', 'summary']);
  });

  it('задача черновика помнит, кем предложена', () => {
    // Инвариант ТЗ 5.3: интерфейс обязан показать, что пришло от машины.
    expect(Object.values(SummaryTaskOrigin)).toEqual(['model', 'human']);
  });

});

describe('перечни расшифровки', () => {
  it('вид службы говорит, куда уходит запись', () => {
    expect(Object.values(TranscriberKind)).toEqual(['external', 'local']);
  });

  it('у задачи шесть состояний, и три из них незакрытые', () => {
    // Все три различия — границы, а не оттенки прогресса, и по ним
    // принимается решение при перезапуске API (дизайн, 2.4): в `queued`
    // наружу не ушло ничего и работа не начата, в `extracting` работа
    // идёт у нас, в `sending` байты в пути.
    expect(Object.values(TranscriptionState)).toEqual([
      'queued',
      'extracting',
      'sending',
      'running',
      'done',
      'failed',
    ]);
  });

  it('четвёртого источника хроники не появилось', () => {
    // Расшифрованный текст по происхождению не отличается от
    // вставленного в ту же форму (дизайн, 1.3).
    expect(Object.values(ChronicleSource)).toEqual(['manual', 'webhook', 'summary']);
  });
});

describe('перечни служб модели', () => {
  it('узел — закрытый перечень, и узла без адаптера в нём нет', () => {
    // Правило прежнее (дизайн, 14.1 пункт 1): настройки для службы,
    // которой в сборке нет, не бывает — карточка такого узла показывала
    // бы форму, сохранение в которой ни на что не влияет. Изменилось не
    // правило, а сборка: у расшифровки адаптер есть, и узел появился.
    //
    // Порядок значим: он задаёт порядок карточек на экране, и идёт как
    // сам поток — сначала разбивка, потом расшифровка.
    expect(Object.values(ModelServiceKind)).toEqual(['task_suggester', 'transcriber']);
  });

  it('схема авторизации отвечает за одно слово в одном заголовке', () => {
    // `api_key` существует потому, что Yandex ждёт `Api-Key`, а не
    // `Bearer`; `none` — потому, что «узел без ключа» и «забыли вписать
    // ключ» обязаны различаться (дизайн, 6.2).
    expect(Object.values(ModelAuthScheme)).toEqual(['bearer', 'api_key', 'none']);
  });

  it('вид узла задаётся человеком и несёт прежние значения', () => {
    // Переименование `TaskSuggesterKind`: значения те же строки, значит
    // `summaries.suggester_name` миграции данных не требует.
    expect(Object.values(ModelServicePlacement)).toEqual(['external', 'local']);
  });

  it('источник настройки отвечает на первый вопрос экрана', () => {
    expect(Object.values(ModelServiceSource)).toEqual(['database', 'environment', 'none']);
  });

  it('исходов проверки связи шесть: по ним человек делает разное', () => {
    expect(Object.values(ModelProbeOutcome)).toEqual([
      'ok',
      'unauthorized',
      'not_found',
      'bad_request',
      'unavailable',
      'bad_response',
    ]);
  });

  it('прежнего перечня предложителя не осталось', () => {
    // Два перечня с одинаковыми значениями разошлись бы на втором порте.
    expect('TaskSuggesterKind' in enums).toBe(false);
  });
});

describe('перечень трекеров', () => {
  it('закрытый список с одним значением', () => {
    // Правило то же, что у `ModelServiceKind` до появления второго узла:
    // вид попадает в перечень, когда его адаптер в сборке **есть**.
    // Трекер на установку один (дизайн, 10.1), и значение без адаптера
    // дало бы настройку, сохранение в которой ни на что не влияет.
    expect(Object.values(TrackerKind)).toEqual(['weeek']);
  });

  it('это не вид службы модели: порты разные и включение одного не говорит о другом', () => {
    // Сведение их в один перечень связало бы «куда уходит текст саммари» с
    // «куда уходят формулировки задач», а это две разные настройки.
    expect(Object.values(ModelServiceKind)).not.toContain('weeek');
  });

  it('исходов выгрузки четыре: по ним человек делает разное', () => {
    // «Завели» и «исправили» различаются, потому что повторная выгрузка
    // правит задачу в трекере, а не заводит вторую (решение владельца), и
    // в журнале это два разных действия. «Не пробовали» — не неудача: до
    // этой задачи обмен не дошёл, и о ней не произошло ничего.
    expect(Object.values(TaskExportOutcome)).toEqual([
      'created',
      'updated',
      'failed',
      'skipped',
    ]);
  });

  it('исход выгрузки не закрывает задачу ни одним значением', () => {
    // Зеркало ничего не закрывает (дизайн, 5): чекпоинт закрывает человек,
    // прогресс версии считается только из чекпоинтов. Значение вроде
    // `completed` здесь означало бы, что выгрузка умеет закрывать.
    expect(Object.values(TaskExportOutcome)).not.toContain('completed');
    expect(Object.values(TaskExportOutcome)).not.toContain('done');
  });
});

it('состояния задачи саммари совпадают с контрактом базы', () => {
  expect(Object.values(SummaryTaskState)).toEqual(['active', 'archived', 'released']);
});
