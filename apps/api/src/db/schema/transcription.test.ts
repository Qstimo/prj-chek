import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { transcriptionJobs } from './transcription';

/** Имена колонок таблицы: по ним проверяется и состав, и его отсутствие. */
function columns(): string[] {
  return getTableConfig(transcriptionJobs).columns.map((column) => column.name);
}

/** Колонка по имени в базе: `notNull` читается прямо с неё, как у инцидентов. */
function columnOf(name: string) {
  return getTableConfig(transcriptionJobs).columns.find((column) => column.name === name);
}

describe('задачи расшифровки', () => {
  it('саммари обнуляемо: первая расшифровка идёт до его рождения', () => {
    // Главное решение дизайна (раздел 2.2): пока текста нет, саммари нет,
    // и ни одна таблица первой итерации не меняется.
    expect(columnOf('summary_id')?.notNull).toBe(false);
  });

  it('проект назван отдельно от саммари', () => {
    // Право проверяется до появления саммари, значит по проекту.
    expect(columns()).toContain('project_id');
  });

  it('помнит, кто попросил: прогон работает его правом', () => {
    // Системного действующего лица здесь нет: второй путь записи «от
    // системы, без проверки» был бы дыркой в модели прав.
    expect(columns()).toContain('requested_by_subject_id');
  });

  it('текста расшифровки в таблице нет', () => {
    // Текст не задерживается ни на шаг: из порта в память, оттуда в
    // chronicle_entries.content. Вторая копия — ровно то, от чего
    // избавляет отсутствие колонки текста у summaries.
    expect(columns()).not.toContain('text');
    expect(columns()).not.toContain('content');
    expect(columns()).not.toContain('transcript');
  });

  it('две тройки колонок про файлы: загруженное и дорожка', () => {
    // Размер и тип у них разные, и оба нужны: первый отвечает на «что
    // загрузили», второй — на «что ушло наружу». Это различие двух
    // пределов в модели данных (дизайн, 3.6).
    expect(columns()).toEqual(
      expect.arrayContaining([
        'upload_path',
        'upload_bytes',
        'upload_type',
        'audio_path',
        'audio_bytes',
        'audio_type',
      ]),
    );
  });

  it('дорожка обнуляема, загруженное — нет', () => {
    // audio_path is null значит «отдавать службе нечего, работа ещё не
    // сделана», а не «записи нет».
    expect(columnOf('audio_bytes')?.notNull).toBe(false);
    expect(columnOf('upload_bytes')?.notNull).toBe(true);
  });

  it('длительности записи в таблице нет, хотя ffprobe её знает', () => {
    // Колонку никто не читает: предел длительности принадлежит службе,
    // а размер дорожки система знает точно. Колонка, которую никто не
    // читает, — обязанность держать её согласованной бесплатно.
    expect(columns()).not.toContain('duration_seconds');
  });

  it('имени присланного файла в таблице нет', () => {
    // Имена файлов на машинах людей нередко говорят больше, чем
    // содержимое, — решение первой итерации про текстовый файл.
    expect(columns()).not.toContain('file_name');
    expect(columns()).not.toContain('original_name');
  });

  it('пути к файлам обнуляемы: файлов может уже не быть', () => {
    // У upload_path это обычное состояние, а не краевое: исходник
    // убирается при укладке текста (решение владельца 2), значит у
    // каждого успешного саммари он пуст.
    for (const name of ['upload_path', 'audio_path']) {
      expect(columnOf(name)?.notNull).toBe(false);
    }
  });

  it('размер и тип загруженного остаются после удаления файла', () => {
    // После решения об уборке исходника это уже не
    // предусмотрительность, а обязанность: у каждого успешного саммари
    // исходника нет, и единственный ответ на «что я загружал» — эти
    // две колонки.
    for (const name of ['upload_bytes', 'upload_type']) {
      expect(columnOf(name)?.notNull).toBe(true);
    }
  });

  it('помнит узел, куда ушла запись, и не помнит ключа', () => {
    expect(columns()).toContain('host');
    expect(columns()).not.toContain('api_key');
    expect(columns()).not.toContain('folder_id');
  });

  it('отличает момент приёма от момента отправки', () => {
    expect(columns()).toEqual(expect.arrayContaining(['started_at', 'sent_at', 'finished_at']));
  });

  it('ссылки не каскадные: уборка явная', () => {
    const cascading = getTableConfig(transcriptionJobs).foreignKeys.filter(
      (key) => key.onDelete !== 'restrict',
    );

    expect(cascading).toEqual([]);
  });

  it('все четыре ссылки на месте', () => {
    // Проект, саммари, субъект — и ни одной лишней: ключ и каталог
    // службы в таблице не живут.
    expect(getTableConfig(transcriptionJobs).foreignKeys).toHaveLength(3);
  });

  it('одна незакрытая расшифровка на саммари', () => {
    // Образец — address_incidents_open: правило живёт в базе, а не в
    // памяти процесса, и перезапуск API его не теряет. Состав состояний
    // в предикате проверяется поведением, в интеграционном тесте
    // миграции: `config.where` у drizzle — объект SQL, и сравнение его
    // строкой доказывало бы форму записи, а не правило.
    const active = getTableConfig(transcriptionJobs).indexes.find(
      (index) => index.config.name === 'transcription_jobs_active',
    );

    expect(active?.config.unique).toBe(true);
    expect(active?.config.where).toBeDefined();
  });

  it('очередь прогона читается своим индексом', () => {
    const queue = getTableConfig(transcriptionJobs).indexes.find(
      (index) => index.config.name === 'transcription_jobs_queue',
    );

    expect(queue?.config.unique).toBe(false);
    expect(queue?.config.where).toBeDefined();
  });

  it('история расшифровок проекта читается своим индексом', () => {
    // Частичные индексы выше видят только незакрытые строки, а экранная
    // очередь проекта читает и закончившиеся.
    const history = getTableConfig(transcriptionJobs).indexes.find(
      (index) => index.config.name === 'transcription_jobs_project_started',
    );

    expect(history?.config.unique).toBe(false);
    expect(history?.config.where).toBeUndefined();
  });
});
