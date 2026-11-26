import { z } from 'zod';

import { ModelServicePlacement, SummaryTaskOrigin, SummaryTaskState } from '../enums';
import { MAX_CHRONICLE_CONTENT_CHARS } from './chronicle';
import { requiredDaySchema } from './day-date';
import { platformIdsSchema, platformSchema } from './platform';
import { HAS_NUL, isNulFree } from './plain-text';
import { checkpointUrlSchema, roadmapVersionCreateSchema } from './roadmap';
import { transcriptionJobSchema } from './transcription';

/** Разбивка не настроена: ни адреса, ни ключа. */
export const SUGGESTER_DISABLED = 'suggester_disabled';
/** Текст длиннее предела, который принимает предложитель. */
export const SUMMARY_TEXT_TOO_LONG = 'summary_text_too_long';
/** Предложитель не ответил или ответил негодным. */
export const SUGGESTER_UNAVAILABLE = 'suggester_unavailable';
/** Состояние задачи не допускает выбранного действия. */
export const SUMMARY_TASK_NOT_ACTIVE = 'summary_task_not_active';
/** Черновик пуст: формировать релиз не из чего. */
export const SUMMARY_TASKS_EMPTY = 'summary_tasks_empty';
/** В тексте управляющие символы: его прислали в непригодном виде. */
export const SUMMARY_TEXT_NOT_PLAIN = 'summary_text_not_plain';

/** Предел числа задач в черновике: предел формы, а не доверия к модели. */
export const MAX_SUMMARY_TASKS = 200;

/**
 * Предел длины формулировки задачи.
 *
 * Столько принимает `roadmapCheckpointCreate`: иначе отказ пришёл бы не
 * оттуда, где его ждут. Названо константой, а не числом в схеме, чтобы
 * предел держала и форма — у `400` от zod нет кода, который интерфейс
 * сумел бы объяснить.
 */
export const MAX_SUMMARY_TASK_TITLE = 300;

/** Управляющие символы, кроме перевода строки и табуляции. */
const FORBIDDEN_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/**
 * Приводит текст саммари к пригодному виду или отказывает.
 *
 * Общая функция для браузера и сервера: нормализовать по-разному значило
 * бы отправить наружу не то, что сохранено. Снимается один ведущий BOM
 * (его ставят редакторы Windows) и `CRLF`; управляющие символы —
 * **отказ**, а не чистка: подменять присланный человеком текст молча
 * нельзя. По длине тоже не обрезаем — отказ с настоящим числом даёт
 * человеку решить, что выбросить.
 */
export function normalizeSummaryText(raw: string): string {
  const text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

  if (FORBIDDEN_CONTROL.test(text)) {
    throw new Error(SUMMARY_TEXT_NOT_PLAIN);
  }

  return text;
}

/** Предел объёма текста в контракте: столько принимает запись хроники. */
/**
 * Текст саммари.
 *
 * Предел **тот же**, что у содержимого записи хроники, и это не совпадение
 * числа: текст саммари и есть содержимое записи хроники — второй копии
 * текста в системе нет. Два числа здесь разошлись бы на первой же правке,
 * и тогда саммари принималось бы, а правка его текста отвергалась — или
 * наоборот.
 */
const summaryTextSchema = z.string().trim().min(1).max(MAX_CHRONICLE_CONTENT_CHARS);

/** Задача черновика: формулировка, порядок, происхождение, поля чекпоинта. */
export const summaryTaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  position: z.number().int().positive(),
  origin: z.nativeEnum(SummaryTaskOrigin),
  state: z.nativeEnum(SummaryTaskState),
  releasedVersionId: z.string().uuid().nullable(),
  releasedVersionLabel: z.string().nullable(),
  /** Подтверждённая задача реестра; скрыта без Roadmap Read. */
  taskId: z.string().uuid().nullable().optional(),
  /**
   * Ссылка на задачу во внешнем трекере.
   *
   * Поле чекпоинта, заполняемое человеком до переезда: иначе список
   * пришлось бы проходить дважды — здесь формулировки, в роадмапе
   * ссылки. У строки с `origin = model` всегда `null`: из вывода модели
   * берётся только формулировка (дизайн порта, 5.6 пункт 3).
   */
  url: checkpointUrlSchema,
  /**
   * Теги платформ. Намеренно без `platformIdsSchema`: это выдача, а не
   * приём, и проверять в ней повторы и предел незачем — ровно как у
   * `roadmapCheckpointSchema`.
   */
  platformIds: z.array(z.string().uuid()),
});

/** Чем построена текущая разбивка. Ключ API здесь не бывает никогда. */
export const summarySuggesterStampSchema = z.object({
  name: z.string(),
  model: z.string(),
  at: z.string(),
  /** null у прежних разбивок: историческое число не восстанавливается. */
  dropped: z.number().int().nonnegative().nullable(),
});

/** Строка истории саммари. */
export const summaryListItemSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  projectName: z.string(),
  /** Дата и заголовок приходят из записи хроники. День обязателен. */
  occurredOn: requiredDaySchema,
  title: z.string(),
  taskCount: z.number().int().nonnegative(),
  archivedCount: z.number().int().nonnegative(),
  releasedCount: z.number().int().nonnegative(),
  /** Релиз сформирован. Видно всегда: это состояние потока, а не роадмапа. */
  isReleased: z.boolean(),
  /**
   * Обозначение версии-получателя — только при `Roadmap ≥ metadata`.
   *
   * Отдельно от `isReleased`: обозначение версии — данные роадмапа, и
   * субъекту без выдачи на него оно не выходит. Без разделения «не
   * сформирован» было бы неотличимо от «сформирован, обозначение скрыто».
   */
  releasedVersionLabel: z.string().nullable(),
  /**
   * Версия-получатель — по тому же правилу, что обозначение.
   *
   * Нужна ссылке: роадмап держит открытую версию в адресе
   * (`…/roadmap?version=<id>`), и без идентификатора ссылка вела бы на
   * полосу целиком. Правило видимости одно с обозначением — ссылка в
   * секцию, которой субъект не видит, вела бы в `404`.
   */
  releasedVersionId: z.string().uuid().nullable(),
  createdAt: z.string(),
});

/** Саммари целиком: текст, черновик, платформы для тегов, подсказка версии. */
export const summaryDetailSchema = summaryListItemSchema.extend({
  /** Запись хроники с текстом: правка идёт её собственной ручкой. */
  chronicleEntryId: z.string().uuid(),
  text: z.string(),
  tasks: z.array(summaryTaskSchema),
  suggester: summarySuggesterStampSchema.nullable(),
  /**
   * Запись правили после того, как построена разбивка.
   *
   * Предупреждение, а не отказ: судит человек, он видит и текст, и
   * задачи. Флажок грубый — его двигает любая правка записи, включая
   * правку заголовка (дизайн, раздел 2.5).
   */
  isTextStale: z.boolean(),
  /**
   * Следующее обозначение версии, выведенное из существующих.
   *
   * `null` означает «подставлять нечего»: версий нет, их обозначения не
   * содержат чисел, или у субъекта нет выдачи на роадмап.
   */
  suggestedVersionLabel: z.string().nullable(),
  /**
   * Платформы проекта для чипов — только при `Roadmap ≥ metadata`.
   *
   * Пустой массив означает «показывать нечего» и накрывает два случая
   * намеренно неотличимо: у проекта нет платформ либо у субъекта нет
   * выдачи на роадмап. Отличимость второго от первого и была бы утечкой
   * признака (дизайн, 3.2).
   *
   * Гейт тот же, что у `releasedVersionLabel` и `suggestedVersionLabel`:
   * список платформ проекта роадмап отдаёт сам, в сводке релизов, и
   * «Инфо» здесь не участвует (дизайн, 3.1).
   */
  platforms: z.array(platformSchema),
  /**
   * Запись созвона, если она есть.
   *
   * Берётся у задачи расшифровки, принёсшей запись: своих колонок у
   * `summaries` под это не появилось (дизайн расшифровки, 2.2). `null`
   * означает «записи не было вовсе» — текст вставили в форму руками.
   */
  recording: z
    .object({
      /** Размер и тип **дорожки**: её человек и слушает (дизайн, 8.5). */
      bytes: z.number().int().positive(),
      mediaType: z.string(),
      /** Что было загружено: видео на полгигабайта или сразу аудио. */
      uploadBytes: z.number().int().positive(),
      uploadType: z.string(),
      /**
       * Исходник убран после укладки текста (решение владельца 2).
       *
       * Нужно экрану, чтобы сказать правду в обоих случаях: у саммари из
       * видео — «исходник убран», у саммари из `mp3` — ничего, потому что
       * убирать было нечего (файл один). Вычисляется как «`upload_path`
       * пуст, а `audio_path` нет»; гадать по типу содержимого нельзя —
       * загруженный `mp3` мог и перекодироваться, если был крупным.
       */
      isSourceRemoved: z.boolean(),
      uploadedAt: z.string(),
    })
    .nullable(),
  /**
   * Последняя расшифровка этого саммари: её состояние видно на экране.
   *
   * Берётся оттуда же, откуда `recording`, и по той же причине: таблицы
   * первой итерации про расшифровку ничего не знают.
   */
  transcription: transcriptionJobSchema.nullable(),
});

/**
 * Создание саммари: дата, заголовок, текст.
 *
 * Текст приводит к пригодному виду {@link normalizeSummaryText} — и в
 * браузере, и на сервере. Заголовку хватает запрета нулевого байта: он
 * уезжает в ту же колонку, что у рукописной записи хроники, и наружу к
 * модели не уходит вовсе.
 */
export const summaryCreateSchema = z
  .object({
    occurredOn: requiredDaySchema,
    title: z.string().trim().min(1).max(300).refine(isNulFree, HAS_NUL),
    text: summaryTextSchema,
  })
  .strict();

/**
 * Замена черновика целиком.
 *
 * Строка с `id` — оставить существующую (вместе с её происхождением), без
 * `id` — новая, набранная человеком. Позиции не принимаются: порядок задаёт
 * порядок массива, и второе место для порядка разошлось бы с первым.
 *
 * **Отсутствие ссылки или набора тегов означает «оставить как было»**, и
 * сохраняется прежнее значение по `id` — тем же способом, которым уже
 * сохраняется происхождение строки. Иначе редактор субъекта без выдачи на
 * роадмап, который чипов не видит и набор не отправляет, молча стирал бы
 * проставленные теги — работу того, у кого права есть (дизайн, 3.3). Снять
 * можно явно: `url: null` и `platformIds: []`. У строки без `id` сохранять
 * нечего: она новая, и отсутствие поля означает пустоту.
 */
export const summaryTasksReplaceSchema = z
  .object({
    tasks: z
      .array(
        z
          .object({
            id: z.string().uuid().optional(),
            title: z.string().trim().min(1).max(MAX_SUMMARY_TASK_TITLE),
            /** Отсутствие — «не трогать», `null` — «снять». */
            url: checkpointUrlSchema.optional(),
            /** Отсутствие — «не трогать», пустой массив — «снять все». */
            platformIds: platformIdsSchema.optional(),
          })
          .strict(),
      )
      .max(MAX_SUMMARY_TASKS),
  })
  .strict();

/** Набор отмеченных задач для одного действия. */
export const summaryTaskIdsSchema = z
  .object({
    taskIds: z.array(z.string().uuid()).min(1).max(MAX_SUMMARY_TASKS),
  })
  .strict();

export const summaryReleaseSchema = summaryTaskIdsSchema.extend({
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('new'), version: roadmapVersionCreateSchema }).strict(),
    z.object({ kind: z.literal('existing'), versionId: z.string().uuid() }).strict(),
  ]),
});

export type SummaryTaskIds = z.infer<typeof summaryTaskIdsSchema>;
export const summaryTransferResultSchema = z.object({ taskIds: z.array(z.string().uuid()) });
export type SummaryTransferResult = z.infer<typeof summaryTransferResultSchema>;
export type SummaryRelease = z.infer<typeof summaryReleaseSchema>;

/** Результат формирования релиза: куда уехали задачи. */
export const summaryReleaseResultSchema = z.object({
  versionId: z.string().uuid(),
  label: z.string(),
  checkpointCount: z.number().int().positive(),
});

/** Настройки предложителя, видимые пользователю. Ключа здесь нет. */
export const taskSuggesterInfoSchema = z.object({
  isEnabled: z.boolean(),
  /** `external` или `local`: куда уходит текст. */
  placement: z.nativeEnum(ModelServicePlacement),
  /** Имя узла из настроенного адреса, без пути и без ключа. */
  host: z.string().nullable(),
  model: z.string().nullable(),
  maxChars: z.number().int().positive(),
});

/** Тип данных контракта саммари. */
export type SummaryTask = z.infer<typeof summaryTaskSchema>;

/** Тип данных контракта саммари. */
export type SummarySuggesterStamp = z.infer<typeof summarySuggesterStampSchema>;

/** Тип данных контракта саммари. */
export type SummaryListItem = z.infer<typeof summaryListItemSchema>;

/** Тип данных контракта саммари. */
export type SummaryDetail = z.infer<typeof summaryDetailSchema>;

/** Тип данных контракта саммари. */
export type SummaryCreate = z.infer<typeof summaryCreateSchema>;

/** Тип данных контракта саммари. */
export type SummaryTasksReplace = z.infer<typeof summaryTasksReplaceSchema>;

/** Тип данных контракта саммари. */
export type SummaryReleaseResult = z.infer<typeof summaryReleaseResultSchema>;

/** Тип данных контракта саммари. */
export type TaskSuggesterInfo = z.infer<typeof taskSuggesterInfoSchema>;
