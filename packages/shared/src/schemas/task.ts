import { z } from 'zod';

import { TaskOrigin } from '../enums';
import { platformIdsSchema } from './platform';
import { checkpointUrlSchema } from './roadmap';

/**
 * Предел длины формулировки задачи.
 *
 * То же число, что у строки черновика саммари (`MAX_SUMMARY_TASK_TITLE`), и
 * это не совпадение: строка черновика **становится** задачей на релизе.
 * Два числа разошлись бы на первой правке, и тогда принятая в черновике
 * формулировка не доехала бы до реестра — отказ пришёл бы на шаге, где
 * человек уже всё подтвердил.
 *
 * Своё объявление, а не импорт из `summary.ts`: предел принадлежит задаче,
 * а черновик — поверхность перед ней. Равенство удерживается тестом, а не
 * направлением импорта, потому что иначе реестр задач зависел бы от
 * конструктора саммари, который без него работает.
 */
export const MAX_PROJECT_TASK_TITLE = 300;

/** Задача не найдена или недоступна — отдаётся `404`, как везде. */
export const TASK_NOT_FOUND = 'task_not_found';

/** Задача уже стоит в версии: второй раз её положить нельзя. */
export const TASK_ALREADY_PLACED = 'task_already_placed';

/**
 * Задача стоит в версии, а её просят удалить.
 *
 * Отказ, а не каскад: удаление из реестра меняло бы прогресс версии с
 * другого экрана и молча. Сначала вынь из версии — тогда видно, что
 * прогресс изменился, и видно, кто это сделал.
 */
export const TASK_PLACED = 'task_placed';

/**
 * Размещение задачи в версии роадмапа.
 *
 * Объектом, а не плоскими полями у задачи: «вне версии» обязано читаться
 * **одним** условием. Четыре `null` рядом проверялись бы по одному, и
 * первая же забытая проверка дала бы задачу, у которой версии нет, а
 * позиция есть.
 *
 * «Закрыт» живёт здесь, а не у задачи, и это тот же инвариант ТЗ 3.5:
 * прогресс считается по версии. Признак у задачи означал бы, что вынутая
 * из версии задача меняет прогресс версии, в которой её уже нет.
 */
export const taskPlacementSchema = z.object({
  versionId: z.string().uuid(),
  versionLabel: z.string(),
  isDone: z.boolean(),
  position: z.number().int().positive(),
  /** Версия, из которой задачу перенесли: память `carry-over`. */
  carriedFromVersionId: z.string().uuid().nullable(),
});

/**
 * Задача проекта: формулировка, указатель наружу и место в версии.
 *
 * Чего у задачи нет и не будет: исполнителя, оценки, даты, комментариев и
 * вложенности (ТЗ 1.4). Ровно за этим её и отправляют во внешний трекер —
 * исполнителей ведёт он.
 */
export const projectTaskSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string(),
  /** Ссылка во внешний трекер, вписанная человеком. Наружу не отдаётся. */
  url: checkpointUrlSchema,
  origin: z.nativeEnum(TaskOrigin),
  /** Саммари, из которого задача приехала; `null` у остальных путей. */
  sourceSummaryId: z.string().uuid().nullable(),
  /**
   * Теги платформ. Намеренно без `platformIdsSchema`: это выдача, а не
   * приём, и проверять в ней повторы и предел незачем — ровно как у
   * `roadmapCheckpointSchema`.
   */
  platformIds: z.array(z.string().uuid()),
  /** `null` означает «задача есть, в версии её нет». */
  placement: taskPlacementSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * Создание задачи руками.
 *
 * `origin` в теле нет намеренно: его задаёт сервер по пути, которым задача
 * пришла. Присланный клиентом `origin: "summary"` сделал бы признак
 * «приехала из созвона» ложью, а он — единственный след происхождения.
 */
export const projectTaskCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_PROJECT_TASK_TITLE),
    url: checkpointUrlSchema.optional(),
    /** Набор целиком; отсутствие поля означает «без платформ». */
    platformIds: platformIdsSchema.optional(),
  })
  .strict();

/**
 * Правка задачи: формулировка, ссылка, теги.
 *
 * Пустое тело — законный запрос «ничего не менять»: набор платформ
 * сохраняется **отсутствием** поля, как в черновике саммари, а пустой
 * массив снимает все теги. Признака «закрыт» здесь нет: он у размещения,
 * и правится ручкой чекпоинта.
 */
export const projectTaskUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_PROJECT_TASK_TITLE).optional(),
    url: checkpointUrlSchema.optional(),
    platformIds: platformIdsSchema.optional(),
  })
  .strict();

/** Фильтр списка задач проекта. Значения живут в адресе экрана. */
export const projectTaskFilterSchema = z
  .object({
    /** Только задачи вне версий. */
    loose: z.coerce.boolean().optional(),
  })
  .strict();

/** Задача проекта. */
export type ProjectTask = z.infer<typeof projectTaskSchema>;

/** Размещение задачи в версии. */
export type TaskPlacement = z.infer<typeof taskPlacementSchema>;

/** Данные создания задачи. */
export type ProjectTaskCreate = z.infer<typeof projectTaskCreateSchema>;

/** Данные правки задачи. */
export type ProjectTaskUpdate = z.infer<typeof projectTaskUpdateSchema>;

/** Фильтр списка задач. */
export type ProjectTaskFilter = z.infer<typeof projectTaskFilterSchema>;
