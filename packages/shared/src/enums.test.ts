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

describe('перечни служб модели', () => {
  it('узел — закрытый перечень, и в этой итерации он один', () => {
    // Настройки для службы, которой в сборке нет, не бывает: карточка
    // узла расшифровки показывала бы форму, сохранение в которой ни на
    // что не влияет (дизайн, 14.1 пункт 1).
    expect(Object.values(ModelServiceKind)).toEqual(['task_suggester']);
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
