import { describe, expect, it } from 'vitest';

import { MAX_TASK_TITLE, tasksOf } from './validate';

describe('разбор вывода модели', () => {
  it('разбирает ожидаемую форму', () => {
    expect(tasksOf('{"tasks":["раз","два"]}', 50).tasks).toEqual([
      { title: 'раз' },
      { title: 'два' },
    ]);
  });

  it('снимает обёртку в заборе из кавычек', () => {
    // Маленькие модели ставят её постоянно, несмотря на запрос JSON.
    // Строгий отказ здесь означал бы неработающую кнопку.
    const raw = '```json\n{"tasks":["раз"]}\n```';

    expect(tasksOf(raw, 50).tasks).toEqual([{ title: 'раз' }]);
  });

  it('снимает болтовню вокруг объекта', () => {
    const raw = 'Вот задачи:\n{"tasks":["раз"]}\nГотово.';

    expect(tasksOf(raw, 50).tasks).toEqual([{ title: 'раз' }]);
  });

  it('негодный элемент выбрасывается поштучно', () => {
    // Один мусорный элемент не рушит весь ответ.
    expect(tasksOf('{"tasks":["раз",42,null,"два"]}', 50).tasks).toEqual([
      { title: 'раз' },
      { title: 'два' },
    ]);
  });

  it('снимает ведущие маркеры списка', () => {
    const raw = '{"tasks":["- раз","1. два","• три","2) четыре"]}';

    expect(tasksOf(raw, 50).tasks.map((task) => task.title)).toEqual([
      'раз',
      'два',
      'три',
      'четыре',
    ]);
  });

  it('сворачивает пробелы', () => {
    expect(tasksOf('{"tasks":["раз   \\n  два"]}', 50).tasks[0]?.title).toBe('раз два');
  });

  it('снимает управляющие и невидимые символы', () => {
    // Невидимый пробел в формулировке сделал бы две одинаковые на вид
    // строки разными — и для дедупликации, и для человека.
    expect(tasksOf('{"tasks":["раз\\u0007\\u200bдва"]}', 50).tasks[0]?.title).toBe('раз два');
  });

  it('режет до предела чекпоинта по границе слова', () => {
    const long = `${'слово '.repeat(60)}хвост`;
    const title = tasksOf(JSON.stringify({ tasks: [long] }), 50).tasks[0]?.title ?? '';

    expect(title.length).toBeLessThanOrEqual(MAX_TASK_TITLE);
    expect(MAX_TASK_TITLE).toBe(300);
    expect(title.endsWith('слово')).toBe(true);
  });

  it('длинное слово без пробелов всё равно укладывается в предел', () => {
    // Границы слова в строке может не оказаться вовсе; предел чекпоинта
    // при этом остаётся пределом, иначе отказ пришёл бы из базы.
    const title = tasksOf(JSON.stringify({ tasks: ['я'.repeat(400)] }), 50).tasks[0]?.title ?? '';

    expect(title).toHaveLength(MAX_TASK_TITLE);
  });

  it('выбрасывает пустые строки', () => {
    expect(tasksOf('{"tasks":["","   ","раз"]}', 50).tasks).toHaveLength(1);
  });

  it('выбрасывает дубли без учёта регистра и пробелов', () => {
    expect(tasksOf('{"tasks":["Сделать Х","сделать   х"]}', 50).tasks).toHaveLength(1);
  });

  it('режет до предела и называет отброшенное числом', () => {
    // Тихое урезание читалось бы как «столько и предложили».
    const raw = JSON.stringify({ tasks: Array.from({ length: 7 }, (_, i) => `задача ${i}`) });
    const result = tasksOf(raw, 5);

    expect(result.tasks).toHaveLength(5);
    expect(result.dropped).toBe(2);
  });

  it('мусор даёт пустой список, а не исключение', () => {
    // Решение «пусто» принимает вызывающий: он и отвечает отказом.
    expect(tasksOf('я не умею в json', 50)).toEqual({ tasks: [], dropped: 0 });
  });

  it('объект без tasks даёт пустой список', () => {
    expect(tasksOf('{"items":["раз"]}', 50)).toEqual({ tasks: [], dropped: 0 });
  });

  it('разметку в формулировке оставляет текстом', () => {
    // Экранирование — дело рендера, не валидации; калечить формулировку
    // здесь значило бы терять осмысленные задачи.
    expect(tasksOf('{"tasks":["<script>alert(1)</script>"]}', 50).tasks[0]?.title).toBe(
      '<script>alert(1)</script>',
    );
  });

  it('из вывода не берётся ничего, кроме формулировки', () => {
    // Ни адресов, ни тегов платформ, ни идентификаторов, ни обозначения
    // версии: модель не может назвать объект системы — ей нечем.
    const raw = '{"tasks":[{"title":"раз","url":"http://x","platformIds":["a"],"id":"b"}]}';

    expect(tasksOf(raw, 50).tasks).toEqual([]);
  });

  it('упоминание даты в формулировке остаётся', () => {
    // Инвариант ТЗ 1.4 соблюдён устройством черновика — колонки даты нет;
    // цензурировать текст значило бы ломать осмысленные задачи.
    expect(tasksOf('{"tasks":["успеть к демо в пятницу"]}', 50).tasks[0]?.title).toBe(
      'успеть к демо в пятницу',
    );
  });
});
