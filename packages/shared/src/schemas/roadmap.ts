import { z } from 'zod';

import { PlatformReleaseState, RoadmapVersionState } from '../enums';
import { dayDateSchema } from './day-date';
import {
  platformIdsSchema,
  platformReleaseSchema,
  platformSchema,
  releaseSummaryRowSchema,
} from './platform';

/**
 * Адрес задачи во внешнем трекере.
 *
 * Принимает её не только чекпоинт: то же поле есть у задачи черновика
 * саммари, откуда значение и уезжает в чекпоинт. Вторая копия этой
 * проверки разошлась бы с первой пределом или признаком `nullable`, и
 * тогда отказ пришёл бы не оттуда, где его ждут.
 */
export const checkpointUrlSchema = z.string().trim().url().max(2000).nullable();

/**
 * Чекпоинт: формулировка результата и признак «закрыт» — и ничего больше.
 *
 * Исполнителей, оценок, дат, комментариев и вложенности не будет:
 * это сознательное ограничение ТЗ 1.4, удерживающее продукт от трекера.
 * Схемы строгие: лишние поля — ошибка, а не молчаливое отбрасывание.
 */
export const roadmapCheckpointSchema = z.object({
  id: z.string().uuid(),
  /**
   * Задача, которую это размещение держит в версии.
   *
   * Чекпоинт — **размещение задачи**, а не формулировка: формулировка,
   * ссылка и теги живут у задачи (`schemas/task.ts`) и приходят в этот
   * ответ join'ом. Поэтому они здесь остались: экран роадмапа показывает
   * их на месте, и второго запроса за ними делать незачем. Править их
   * ручкой чекпоинта нельзя — у поля одно место записи.
   */
  taskId: z.string().uuid(),
  title: z.string(),
  isDone: z.boolean(),
  position: z.number().int().positive(),
  /**
   * Ссылка на задачу во внешнем трекере.
   *
   * Указатель наружу, а не задача внутри: исполнителей, оценок и дат
   * у чекпоинта по-прежнему нет, и трекером продукт не становится (ТЗ 1.4).
   */
  url: checkpointUrlSchema,
  /**
   * Платформы, на которые едет результат. Необязательно и больше одной.
   *
   * Намеренно без `platformIdsSchema`: это выдача, а не приём, и
   * проверять в ней повторы и лимит незачем.
   */
  platformIds: z.array(z.string().uuid()),
});

/** Прогресс версии: вычисляется, не хранится (ТЗ 3.5). */
export const roadmapProgressSchema = z.object({
  done: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

/** Версия на уровне метаданных: паспорт и прогресс, без формулировок. */
export const roadmapVersionMetadataSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  state: z.nativeEnum(RoadmapVersionState),
  plannedDate: dayDateSchema,
  releasedDate: dayDateSchema,
  position: z.number().int().positive(),
  progress: roadmapProgressSchema,
  /**
   * Незакрытые чекпоинты версии. Вычисляется, не хранится (ТЗ 3.5).
   *
   * Поле рядом с прогрессом, а не «total − done» на вызывающей стороне:
   * признак расхождения считается из него же, и два разных вычитания
   * разошлись бы в тот момент, когда прогресс станет считаться иначе.
   */
  unfinished: z.number().int().nonnegative(),
  /**
   * Версия выпущена, а незакрытые чекпоинты остались.
   *
   * Это пометка, а не отказ: выпуск с незакрытыми чекпоинтами разрешён —
   * решение владельца продукта. Признак живёт в метаданных: публичная
   * выдача расширяет их, и уровень «метаданные» тоже обязан видеть
   * расхождение.
   */
  hasUnfinishedOnRelease: z.boolean(),
});

/** Версия на уровне чтения: плюс формулировки чекпоинтов и выпуски. */
export const roadmapVersionDetailSchema = roadmapVersionMetadataSchema.extend({
  checkpoints: z.array(roadmapCheckpointSchema),
  releases: z.array(platformReleaseSchema),
});

/** Стадия проекта: позиция текущей версии в последовательности. */
export const roadmapStageSchema = z.object({
  current: z.number().int().positive().nullable(),
  total: z.number().int().nonnegative(),
});

/** Роадмап проекта в проекции по уровню, со сводкой релизов. */
export const roadmapResponseSchema = z.object({
  stage: roadmapStageSchema,
  versions: z.array(z.union([roadmapVersionDetailSchema, roadmapVersionMetadataSchema])),
  summary: z.array(releaseSummaryRowSchema),
});

/** Создание версии. */
export const roadmapVersionCreateSchema = z
  .object({
    label: z.string().trim().min(1).max(100),
    plannedDate: dayDateSchema.optional(),
    releasedDate: dayDateSchema.optional(),
    state: z.nativeEnum(RoadmapVersionState).optional(),
  })
  .strict();

/** Правка версии, включая позицию в последовательности. */
export const roadmapVersionUpdateSchema = z
  .object({
    label: z.string().trim().min(1).max(100).optional(),
    plannedDate: dayDateSchema.optional(),
    releasedDate: dayDateSchema.optional(),
    state: z.nativeEnum(RoadmapVersionState).optional(),
    position: z.number().int().positive().optional(),
  })
  .strict();

/**
 * Создание чекпоинта — две формы одного действия, и ровно одна за раз.
 *
 * Либо кладём в версию **существующую** задачу реестра (она могла ждать
 * вне версий), либо заводим новую вместе с размещением — путь, которым
 * чекпоинты заводились всегда. Тело с обоими намерениями отвергается:
 * сервер не решает за человека, какое из двух главнее. Пустое тело — тоже
 * отказ: разместить нечего.
 *
 * Строгие объекты в обеих ветвях удерживают ограничение ТЗ 1.4: ни
 * исполнителя, ни даты, ни оценки сюда не просунуть.
 */
export const roadmapCheckpointCreateSchema = z.union([
  z.object({ taskId: z.string().uuid() }).strict(),
  z
    .object({
      title: z.string().trim().min(1).max(300),
      url: checkpointUrlSchema.optional(),
      /** Набор целиком; отсутствие поля означает «без платформ». */
      platformIds: platformIdsSchema.optional(),
    })
    .strict(),
]);

/**
 * Правка чекпоинта: только то, что принадлежит размещению.
 *
 * Формулировка, ссылка и теги платформ ушли к задаче, и это не косметика:
 * у поля одно место записи. Пока они правились здесь, одна и та же задача
 * в версии и в реестре могла называться по-разному, а «кто из двух прав» —
 * вопрос без ответа.
 */
export const roadmapCheckpointUpdateSchema = z
  .object({
    isDone: z.boolean().optional(),
    position: z.number().int().positive().optional(),
  })
  .strict();

/**
 * Код отказа переноса: открытой версии нет, а обозначения не дали.
 *
 * Код, а не разбор текста ответа: по нему интерфейс спрашивает обозначение
 * новой версии и повторяет перенос. Фразу можно переписать, код — нет.
 */
export const CARRY_OVER_NEEDS_LABEL = 'carry_over_needs_label';

/**
 * Перенос чекпоинта в другую версию.
 *
 * Три формы одного действия: указанная версия, новая версия с заданным
 * обозначением и пустое тело — «следующая открытая». Обе формы сразу
 * отвергаются: сервер не решает за человека, какое из двух намерений
 * главнее.
 *
 * Своего `versionId` в теле нет: исходная версия приходит адресом, и
 * второе место для неё разошлось бы с первым.
 */
export const checkpointCarryOverSchema = z
  .preprocess(
    // Тела может не быть вовсе: «следующая открытая версия» — это запрос
    // без тела, и разборщик HTTP отдаёт в этом случае `undefined`, а не
    // пустой объект. Отсутствие тела обязано значить то же, что `{}`.
    (body) => body ?? {},
    z
      .object({
        targetVersionId: z.string().uuid().optional(),
        newVersionLabel: z.string().trim().min(1).max(100).optional(),
      })
      .strict(),
  )
  .refine(
    (body) => !(body.targetVersionId !== undefined && body.newVersionLabel !== undefined),
    'Укажите либо существующую версию, либо обозначение новой',
  );

/**
 * Результат переноса: куда уехал чекпоинт.
 *
 * Обозначение версии-получателя в ответе обязательно: без него интерфейсу
 * нечего показать в «перенесено в v1.3», а второй запрос за роадмапом
 * показал бы состояние уже после чужих правок.
 */
export const checkpointCarryOverResultSchema = z.object({
  checkpoint: roadmapCheckpointSchema,
  targetVersion: z.object({ id: z.string().uuid(), label: z.string() }),
  /** Версия-получатель создана этим же действием. */
  versionCreated: z.boolean(),
});

/** Запрос заголовка по ссылке на задачу. */
export const linkTitleRequestSchema = z
  .object({ url: z.string().trim().url().max(2000) })
  .strict();

/** Ответ: заголовок либо его отсутствие — неудача чтения не ошибка. */
export const linkTitleResponseSchema = z.object({ title: z.string().nullable() });

/** Публичная ссылка роадмапа. */
export const publicLinkSchema = z.object({
  token: z.string(),
  url: z.string(),
});

/**
 * Чекпоинт в публичной выдаче: без ссылки на задачу.
 *
 * Публичная страница роадмапа открыта без авторизации, и ссылка раскрыла бы
 * адрес внутреннего трекера вместе с номером задачи. Отдельная схема, а не
 * проекция по уровню: публичная страница ходит именно под уровнем чтения,
 * и различать пути по уровню значило бы менять его смысл.
 *
 * Схема строгая: лишнее поле — ошибка, а не молчаливое отбрасывание. Тихое
 * отбрасывание скрыло бы ошибку проекции вместо того, чтобы её показать.
 */
export const publicCheckpointSchema = roadmapCheckpointSchema
  .omit({ url: true, taskId: true })
  .strict();

/** Версия в публичной выдаче. */
export const publicVersionSchema = roadmapVersionMetadataSchema.extend({
  checkpoints: z.array(publicCheckpointSchema),
  releases: z.array(platformReleaseSchema),
});

/** Публичный роадмап: то же, что видит уровень чтения внутри, без ссылок. */
export const publicRoadmapSchema = z.object({
  projectName: z.string(),
  stage: roadmapStageSchema,
  versions: z.array(publicVersionSchema),
  summary: z.array(releaseSummaryRowSchema),
});

/**
 * Выпуск платформы в отчёте по релизу: строка на каждую платформу проекта.
 *
 * Пустое состояние означает «идёт вместе с версией», а не «неизвестно»:
 * строки выпуска у такой платформы нет вовсе, и отчёт обязан сказать это
 * словами. Молчание о платформе читалось бы как «про неё забыли».
 *
 * Платформа целиком, а не ссылкой: отчёту нужен и `kind` — у серверной
 * платформы модерации не бывает, и говорить о ней в этих словах нельзя.
 */
export const reportReleaseSchema = z.object({
  platform: platformSchema,
  state: z.nativeEnum(PlatformReleaseState).nullable(),
  releasedDate: dayDateSchema,
  buildLabel: z.string().nullable(),
});

/**
 * Чекпоинт в отчёте: то же, что в роадмапе, плюс след переноса.
 *
 * `carriedFrom` — обозначение версии, из которой чекпоинт приехал, а не её
 * идентификатор: отчёт читают глазами, и второй запрос за обозначением
 * показал бы роадмап уже после чужих правок.
 */
export const reportCheckpointSchema = roadmapCheckpointSchema.extend({
  carriedFrom: z.string().nullable(),
});

/**
 * Чекпоинт, уехавший из версии в другую.
 *
 * Отдельный список, а не признак у чекпоинта версии: после переноса
 * чекпоинт этой версии уже не принадлежит, и в её собственном списке его
 * нет. Без этого списка отчёт умолчал бы о том, что из релиза выпало.
 *
 * `carriedTo` обязательно: строка попадает в список ровно потому, что
 * известна версия-получатель.
 */
export const carriedOutCheckpointSchema = roadmapCheckpointSchema.extend({
  carriedTo: z.string(),
});

/**
 * Отчёт по релизу версии (дизайн доводки, раздел 6).
 *
 * Третья проекция поверх тех же данных, что роадмап: паспорт версии,
 * выпуски по платформам, сводка «что в релизе, что в пути», чекпоинты с
 * отметкой готовности и следы переносов в обе стороны.
 *
 * Имён окружений и их здоровья здесь нет и быть не может: роадмап не
 * читает окружения — это секция «Инфраструктура» (инвариант ТЗ 4.1).
 *
 * Текст собран на сервере и приходит готовым в двух видах: иначе внутренняя
 * страница, публичная страница и буфер обмена разошлись бы при первой же
 * правке правила сборки.
 */
export const releaseReportSchema = z.object({
  version: roadmapVersionMetadataSchema,
  releases: z.array(reportReleaseSchema),
  summary: z.array(releaseSummaryRowSchema),
  checkpoints: z.array(reportCheckpointSchema),
  carriedOut: z.array(carriedOutCheckpointSchema),
  /** Тот же отчёт разметкой Markdown. */
  markdown: z.string(),
  /** Тот же отчёт без разметки — для буфера обмена и писем. */
  text: z.string(),
});

/**
 * Публичный отчёт по релизу: то же, без ссылок на задачи.
 *
 * Схема строгая на всех уровнях: лишнее поле — ошибка, а не молчаливое
 * отбрасывание. `url: null` для неё такая же ошибка, как настоящий адрес, —
 * проекция обязана поле **не добавлять**, а не обнулять, и строгость это
 * показывает вместо того, чтобы скрыть.
 */
export const publicReleaseReportSchema = releaseReportSchema
  .extend({
    projectName: z.string(),
    version: roadmapVersionMetadataSchema.strict(),
    checkpoints: z.array(reportCheckpointSchema.omit({ url: true }).strict()),
    carriedOut: z.array(carriedOutCheckpointSchema.omit({ url: true }).strict()),
  })
  .strict();

/** Чекпоинт. */
export type RoadmapCheckpoint = z.infer<typeof roadmapCheckpointSchema>;

/** Прогресс версии. */
export type RoadmapProgress = z.infer<typeof roadmapProgressSchema>;

/** Версия на уровне метаданных. */
export type RoadmapVersionMetadata = z.infer<typeof roadmapVersionMetadataSchema>;

/** Версия на уровне чтения. */
export type RoadmapVersionDetail = z.infer<typeof roadmapVersionDetailSchema>;

/** Стадия проекта. */
export type RoadmapStage = z.infer<typeof roadmapStageSchema>;

/** Роадмап проекта. */
export type RoadmapResponse = z.infer<typeof roadmapResponseSchema>;

/** Создание версии. */
export type RoadmapVersionCreate = z.infer<typeof roadmapVersionCreateSchema>;

/** Правка версии. */
export type RoadmapVersionUpdate = z.infer<typeof roadmapVersionUpdateSchema>;

/** Создание чекпоинта. */
export type RoadmapCheckpointCreate = z.infer<typeof roadmapCheckpointCreateSchema>;

/** Правка чекпоинта. */
export type RoadmapCheckpointUpdate = z.infer<typeof roadmapCheckpointUpdateSchema>;

/** Перенос чекпоинта. */
export type CheckpointCarryOver = z.infer<typeof checkpointCarryOverSchema>;

/** Результат переноса чекпоинта. */
export type CheckpointCarryOverResult = z.infer<typeof checkpointCarryOverResultSchema>;

/** Запрос заголовка по ссылке. */
export type LinkTitleRequest = z.infer<typeof linkTitleRequestSchema>;

/** Ответ с заголовком. */
export type LinkTitleResponse = z.infer<typeof linkTitleResponseSchema>;

/** Публичная ссылка. */
export type PublicLink = z.infer<typeof publicLinkSchema>;

/** Чекпоинт в публичной выдаче. */
export type PublicCheckpoint = z.infer<typeof publicCheckpointSchema>;

/** Версия в публичной выдаче. */
export type PublicVersion = z.infer<typeof publicVersionSchema>;

/** Публичный роадмап. */
export type PublicRoadmap = z.infer<typeof publicRoadmapSchema>;

/** Выпуск платформы в отчёте. */
export type ReportRelease = z.infer<typeof reportReleaseSchema>;

/** Чекпоинт в отчёте. */
export type ReportCheckpoint = z.infer<typeof reportCheckpointSchema>;

/** Чекпоинт, уехавший в другую версию. */
export type CarriedOutCheckpoint = z.infer<typeof carriedOutCheckpointSchema>;

/** Отчёт по релизу версии. */
export type ReleaseReport = z.infer<typeof releaseReportSchema>;

/** Публичный отчёт по релизу. */
export type PublicReleaseReport = z.infer<typeof publicReleaseReportSchema>;
