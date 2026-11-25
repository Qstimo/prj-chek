import type { TaskExport, TrackerKind, TrackerTaskDetails } from '@cairn/shared';

import type { TaskExportRow } from '../db/schema';

/**
 * Колонки выгрузки, как их отдаёт `left join`: все обнуляемы.
 *
 * Имя `exportUpdatedAt` вместо `updatedAt` не косметика: в одной строке
 * выборки рядом стоит `updated_at` **задачи**, и два поля с одним именем
 * означали бы, что одно из них молча затирает другое.
 */
export interface TaskExportColumns {
  details?: TrackerTaskDetails | null;
  tracker: TrackerKind | null;
  externalId: string | null;
  externalUrl: string | null;
  externalBoardId: string | null;
  externalColumnId: string | null;
  isCompleted: boolean | null;
  exportedAt: Date | null;
  exportUpdatedAt: Date | null;
  checkedAt: Date | null;
  failureCode: string | null;
}

/**
 * Зеркало выгрузки из присоединённой строки; `null` — не выгружалась.
 *
 * Объектом, а не плоскими полями у задачи, по той же причине, что
 * размещение: «не выгружалась» обязано читаться **одним** условием.
 *
 * Проверяются все обязательные колонки выгрузки, а не одна: `left join`
 * делает их обнуляемыми для типов, и подстановка умолчаний на месте
 * пропущенных («доска пустая», «выгрузили тогда же, когда правили задачу»)
 * соврала бы в ответе ровно там, где человек смотрит, куда уехала задача.
 * Отсутствие любой из них означает одно и то же: строки выгрузки нет.
 *
 * Своим файлом в `tracker/`, а не функцией внутри репозитория задач, с
 * шага C2: ту же проекцию строит ручка выгрузки — и строила бы вторым
 * экземпляром, который разошёлся бы с первым на первой правке. Живёт она
 * здесь, потому что зеркало принадлежит трекеру: реестр задач работает и
 * без него, а эта проекция без трекера не нужна вовсе.
 */
export function taskExportOf(row: TaskExportColumns): TaskExport | null {
  if (
    row.tracker === null ||
    row.externalId === null ||
    row.externalBoardId === null ||
    row.isCompleted === null ||
    row.exportedAt === null ||
    row.exportUpdatedAt === null
  ) {
    return null;
  }

  return {
    ...(row.details ? { details: row.details } : {}),
    tracker: row.tracker,
    externalId: row.externalId,
    externalUrl: row.externalUrl,
    externalBoardId: row.externalBoardId,
    externalColumnId: row.externalColumnId,
    isCompleted: row.isCompleted,
    exportedAt: row.exportedAt.toISOString(),
    updatedAt: row.exportUpdatedAt.toISOString(),
    // Пусто, пока опроса не было: время выгрузки здесь означало бы, что
    // статус спрашивали, хотя не спрашивали ни разу.
    checkedAt: row.checkedAt?.toISOString() ?? null,
    failureCode: row.failureCode,
  };
}

/**
 * Зеркало из целой строки таблицы.
 *
 * Отдельная обёртка, а не второе написание проекции: у строки `task_exports`
 * поле времени правки зовётся `updatedAt`, а в выборке задачи — иначе (см.
 * {@link TaskExportColumns}), и переименование здесь единственное отличие.
 */
export function taskExportOfRow(row: TaskExportRow): TaskExport {
  return taskExportOf({ ...row, exportUpdatedAt: row.updatedAt })!;
}
