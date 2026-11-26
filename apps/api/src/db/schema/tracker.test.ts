import { TrackerKind } from '@cairn/shared';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { projectTasks } from './tasks';
import {
  taskExports,
  trackerConnections,
  trackerKindEnum,
  trackerProjectBindings,
} from './tracker';

describe('таблица tracker_connections', () => {
  it('ключ — значение перечня, а не суррогат', () => {
    // Как у `model_services`: «одно подключение на вид трекера» становится
    // инвариантом базы, запись — одним `ON CONFLICT (kind) DO UPDATE` без
    // гонки между двумя вкладками администратора, а адрес ручки читается
    // как `/tracker/weeek` — по смыслу, а не по `uuid`.
    expect(getTableConfig(trackerConnections).primaryKeys).toHaveLength(0);
    expect(trackerConnections.kind.primary).toBe(true);
    expect(getTableConfig(trackerConnections).columns.map((column) => column.name)).not.toContain(
      'id',
    );
  });

  it('токен обнуляем, а не пустая строка', () => {
    // `null` отвечает на «задан ли токен» без ключа шифрования вовсе;
    // пустая строка в шифрованной колонке — это шифротекст пустого
    // значения, то есть «токен задан и он пустой».
    expect(trackerConnections.secretEncrypted.notNull).toBe(false);
  });

  it('адрес обязателен: без него отправлять некуда', () => {
    expect(trackerConnections.baseUrl.notNull).toBe(true);
  });

  it('пространство обнуляемо: работу оно не блокирует', () => {
    // Токен сам принадлежит пространству, и порту этот идентификатор не
    // нужен ни в одной из четырёх операций — он нужен ссылке для человека.
    expect(trackerConnections.workspaceId.notNull).toBe(false);
  });

  it('выключатель отдельно от полноты настройки', () => {
    // Нужен, чтобы выключить выгрузку, не стирая токен.
    expect(trackerConnections.isEnabled.notNull).toBe(true);
    expect(trackerConnections.isEnabled.hasDefault).toBe(true);
  });

  it('автор правки не удаляется, пока настройка на него ссылается', () => {
    const [reference] = getTableConfig(trackerConnections).foreignKeys;

    expect(reference?.onDelete).toBe('restrict');
  });

  it('версий токена нет: прежний токен — отозванный токен', () => {
    // Механизм отката, возвращающий заведомо негодное, — не механизм
    // (решение узлов модели, дизайн 3.3). История смен живёт в журнале.
    expect(getTableConfig(trackerConnections).columns.map((column) => column.name)).not.toContain(
      'version',
    );
  });

  it('колонки размещения нет: ветки «свой трекер в контуре» не бывает', () => {
    // В отличие от узла модели: там `placement` решает, допустим ли `http`.
    // У чужого облачного трекера такого выбора нет, и колонка, у которой
    // одно законное значение, означала бы, что второе тоже законно.
    expect(getTableConfig(trackerConnections).columns.map((column) => column.name)).not.toContain(
      'placement',
    );
  });

  it('перечень базы совпадает с перечнем контракта', () => {
    // Единственный способ это гарантировать — брать значения из
    // контракта, а не переписывать их строками.
    expect(trackerKindEnum.enumValues).toEqual(Object.values(TrackerKind));
  });
});

describe('таблица tracker_project_bindings', () => {
  it('ключ — проект: «одна привязка на проект» становится инвариантом базы', () => {
    // Трекер на установку один (дизайн, 10.1), и пока это так, составной
    // ключ «проект × трекер» выражал бы правило, которого нет. Вид всё
    // равно назван колонкой: по ней вторая привязка получит свой ключ, не
    // переписывая существующие строки.
    expect(getTableConfig(trackerProjectBindings).primaryKeys).toHaveLength(0);
    expect(trackerProjectBindings.projectId.primary).toBe(true);
    expect(trackerProjectBindings.tracker.notNull).toBe(true);
  });

  it('все три идентификатора обязательны: половина привязки — угадывание', () => {
    // Без привязки выгрузка отказывает названной причиной, а не кладёт
    // задачу «куда-нибудь» (дизайн, 3.5). Привязка без колонки — то же
    // «куда-нибудь», только записанное в базу.
    expect(trackerProjectBindings.externalProjectId.notNull).toBe(true);
    expect(trackerProjectBindings.boardId.notNull).toBe(true);
    expect(trackerProjectBindings.boardColumnId.notNull).toBe(true);
  });

  it('идентификаторы чужой системы — текст, а не числа', () => {
    // Арифметики над ними нет, у второго трекера они могут быть не числом,
    // а `bigint` в JS потерял бы точность молча.
    const columns = getTableConfig(trackerProjectBindings).columns;

    for (const name of [
      'external_project_id',
      'board_id',
      'board_column_id',
      'completion_column_id',
    ]) {
      expect(columns.find((column) => column.name === name)?.columnType).toBe('PgText');
    }
    expect(trackerProjectBindings.completionColumnId.notNull).toBe(false);
  });

  it('проект с привязкой не удаляется молча', () => {
    // `restrict`, как у `project_tasks.project_id`: привязка — настройка
    // проекта, и каскад унёс бы её вместе с ответом на вопрос «куда мы
    // выгружали этот проект».
    const references = getTableConfig(trackerProjectBindings).foreignKeys;

    expect(references).toHaveLength(2);
    expect(references.every((reference) => reference.onDelete === 'restrict')).toBe(true);
  });
});

describe('таблица task_exports', () => {
  const columns = (): string[] =>
    getTableConfig(taskExports).columns.map((column) => column.name);

  it('ключ — пара «задача × трекер», и суррогата у строки нет', () => {
    // Составной уникум из дизайна 3.3 — он же ключ: ссылок на строку
    // выгрузки нет ни одной, и суррогатный `id` рядом с уникумом дал бы
    // два способа назвать одну строку. Он же делает повторную выгрузку
    // одним `ON CONFLICT (task_id, tracker) DO UPDATE` без гонки между
    // выгрузкой и прогоном опроса.
    const [key] = getTableConfig(taskExports).primaryKeys;

    expect(key?.columns.map((column) => column.name)).toEqual(['task_id', 'tracker']);
    expect(columns()).not.toContain('id');
  });

  it('зеркало живёт здесь, а не колонками задачи', () => {
    // Сторож решения 3.3: опрос пишет каждую минуту, формулировку правят
    // раз в неделю, и один `UPDATE` на обе цели — это конфликт правок там,
    // где его можно просто не создавать.
    const taskColumns = getTableConfig(projectTasks).columns.map((column) => column.name);

    for (const name of ['external_id', 'is_completed', 'checked_at']) {
      expect(taskColumns).not.toContain(name);
      expect(columns()).toContain(name);
    }
  });

  it('внешний идентификатор обязателен: им идут правка и опрос', () => {
    // Строка выгрузки заводится только после удачного создания задачи в
    // трекере (план, C2): отказ строки не создаёт вовсе, поэтому «выгрузка
    // есть, а идентификатора нет» — состояние, которого не бывает.
    expect(taskExports.externalId.notNull).toBe(true);
  });

  it('доска обязательна, колонка — нет: её назначает трекер', () => {
    // «Куда положили» известно из привязки до первого байта; «где лежит
    // сейчас» приходит ответом трекера, и ответ может колонку не назвать.
    expect(taskExports.externalBoardId.notNull).toBe(true);
    expect(taskExports.externalColumnId.notNull).toBe(false);
  });

  it('ссылка трекера — своя колонка, а не `project_tasks.url`', () => {
    // Инвариант дизайна 3.1: `url` вписал человек, и выгрузка его **не
    // перезаписывает**. Колонки `url` здесь нет вовсе — иначе появилось бы
    // второе место для той же ссылки, и правка одной расходилась бы с
    // другой молча.
    expect(taskExports.externalUrl.notNull).toBe(false);
    expect(columns()).not.toContain('url');
  });

  it('время опроса обнуляемо: «не спрашивали» — не «не менялось»', () => {
    // `checked_at` пишется при **каждом** опросе, даже когда ничего не
    // изменилось (дизайн, 3.3). Пустое значение означает ровно «опроса ещё
    // не было», и подставить туда `exported_at` значило бы утверждать, что
    // статус спрашивали, хотя не спрашивали ни разу.
    expect(taskExports.checkedAt.notNull).toBe(false);
    expect(taskExports.exportedAt.notNull).toBe(true);
    expect(taskExports.updatedAt.notNull).toBe(true);
  });

  it('внешнее закрытие — зеркало, и колонок прогресса здесь нет', () => {
    // Решение владельца (дизайн, 5): внешний статус ничего не закрывает.
    // Прогресс версии считается из `roadmap_checkpoints.is_done` и только
    // из них, и колонка `is_done` здесь означала бы второе место, откуда
    // прогресс можно сдвинуть — упавшим опросом или снятым токеном.
    expect(taskExports.isCompleted.notNull).toBe(true);
    expect(taskExports.isCompleted.hasDefault).toBe(true);
    expect(columns()).not.toContain('is_done');
    expect(columns()).not.toContain('position');
  });

  it('код неудачи обнуляем: после удачи его нет вовсе', () => {
    expect(taskExports.failureCode.notNull).toBe(false);
  });

  it('задача с выгрузкой не удаляется молча', () => {
    // `restrict`, а не каскад: задача в трекере остаётся жить (дизайн,
    // 10.5) — удалять чужую задачу по своей кнопке мы не вправе, — и
    // строку зеркала обязан унести явный путь удаления, который и решает,
    // что сказать человеку. Каскад унёс бы её молча, и ответ на вопрос
    // «а в Weeek она осталась?» пропал бы вместе со строкой.
    const [reference] = getTableConfig(taskExports).foreignKeys;

    expect(reference?.onDelete).toBe('restrict');
    expect(reference?.reference().foreignTable).toBe(projectTasks);
  });

  it('вид трекера — перечень, а не свободная строка', () => {
    // Второй трекер получит свою строку выгрузки у той же задачи, и ключ
    // это уже допускает. Свободная строка допускала бы и опечатку, у
    // которой зеркало лежало бы отдельной выгрузкой.
    expect(taskExports.tracker.notNull).toBe(true);
    expect(taskExports.tracker.enumValues).toEqual(trackerKindEnum.enumValues);
  });

  it('идентификаторы чужой системы — текст, а не числа', () => {
    const all = getTableConfig(taskExports).columns;

    for (const name of ['external_id', 'external_board_id', 'external_column_id']) {
      expect(all.find((column) => column.name === name)?.columnType).toBe('PgText');
    }
  });
});
