import {
  AccessLevel,
  SUGGESTER_DISABLED,
  SUGGESTER_UNAVAILABLE,
  SUMMARY_TASK_NOT_ACTIVE,
  SUMMARY_TASKS_EMPTY,
  SUMMARY_TEXT_NOT_PLAIN,
  SUMMARY_TEXT_TOO_LONG,
  ModelServicePlacement,
  type SummaryDetail,
  type TaskSuggesterInfo,
} from '@cairn/shared';

import { isWorkingState } from '@/components/SummaryRecording';

/** Тексты экрана истории. */
export const SCREEN_TEXTS = {
  create: 'Новое саммари',
  loadFailed: 'Не удалось загрузить историю саммари.',
} as const;

/** Тексты экрана саммари. */
export const SUMMARY_TEXTS = {
  loadFailed: 'Не удалось загрузить саммари.',
  notFound: 'Саммари не найдено.',
  textHeading: 'Текст',
  tasksHeading: 'Задачи',
  releaseHeading: 'Релиз',
  edit: 'Править',
  editTitle: 'Правка записи хроники',
  suggest: 'Создать задачи на основе текста',
  suggestAgain: 'Создать задачи на основе текста заново',
  suggesting: 'Разбиваем текст, это может занять минуту.',
  /** Заменять правленный руками список молча нельзя. */
  replaceLabel: 'Повторная разбивка текста',
  replaceConfirm: 'Заменить',
  /**
   * Потеря названа целиком: вместе с формулировками уносятся ссылки и
   * теги платформ, проставленные руками. Диалог, обещающий меньше, чем
   * делает, хуже отсутствия диалога (дизайн, 7.4).
   */
  replaceQuestion:
    'Текущий список задач будет заменён предложениями модели. Проставленные ссылки и теги платформ будут потеряны.',
  /** Предупреждение, а не запрет: релиз не блокируется (дизайн, 2.5). */
  stale: 'Текст поправили после разбивки — задачи могли устареть.',
  /** Длиннее кнопки формы намеренно: две одноимённые спорили бы за фокус. */
  release: 'Сформировать релиз на основании задач',
  releaseTitle: 'Релиз на основании задач',
  noRoadmapRight: 'Нет права на «Роадмап» этого проекта.',
  /** Роадмап виден, но уровень ниже записи: ручка ответила бы `403`. */
  roadmapBelowWrite: 'Доступ к «Роадмапу» этого проекта ниже записи.',
  /**
   * Черновик правлен и не сохранён: релиз его бы не увидел.
   *
   * Сервер читает черновик из базы, поэтому релиз с правкой в памяти
   * уехал бы со старой формулировкой — и исправить это было бы нечем:
   * после релиза `PUT …/tasks` отвечает `409`, а редактор становится
   * только для чтения (дизайн, раздел 7.3).
   */
  unsavedTasks: 'Сначала сохраните правки черновика: релиз формируется из сохранённых задач.',
  released: 'Задачи ушли в роадмап.',
  /**
   * Бирки состояния потока в шапке рабочего экрана.
   *
   * Шапка — единственное место, где состояние названо целиком; дальше
   * каждый блок говорит только о себе (дизайн, 4.1). Поэтому фразы здесь
   * короткие и не повторяют объяснений блоков: «Текст правили после
   * разбивки» — бирка, а «задачи могли устареть» — предупреждение шага
   * задач, и одно другое не заменяет.
   */
  badgeTranscribing: 'Идёт расшифровка',
  badgeSuggesting: 'Идёт разбивка',
  badgeStale: 'Текст правили после разбивки',
  badgeReleased: 'Релиз сформирован',
} as const;

/**
 * Бирки состояния потока — в порядке самого потока.
 *
 * Пустой список означает «всё обычно, работаем»: бирка «в работе» стояла
 * бы всегда и перестала бы читаться. Разбивка — единственное состояние,
 * которого в саммари нет: она живёт в полёте мутации, а не в данных.
 */
export function stateBadgesOf(summary: SummaryDetail, isSuggesting: boolean): string[] {
  const badges: string[] = [];

  if (summary.transcription !== null && isWorkingState(summary.transcription.state)) {
    badges.push(SUMMARY_TEXTS.badgeTranscribing);
  }

  if (isSuggesting) {
    badges.push(SUMMARY_TEXTS.badgeSuggesting);
  }

  if (summary.isTextStale) {
    badges.push(SUMMARY_TEXTS.badgeStale);
  }

  if (summary.isReleased) {
    badges.push(SUMMARY_TEXTS.badgeReleased);
  }

  return badges;
}

/**
 * Объяснения отказов по коду из контракта.
 *
 * По коду, а не по фразе ответа: фразу можно переписать, код — нет. Отказ
 * при этом не трогает черновик — вызов идёт до транзакции, и список,
 * который человек правил двадцать минут, остаётся на месте (дизайн, 5.4).
 */
export const FAILURE_MESSAGES: Record<string, string> = {
  [SUGGESTER_DISABLED]: 'Разбивка не настроена: обратитесь к администратору.',
  [SUGGESTER_UNAVAILABLE]: 'Разбивка не ответила. Попробуйте ещё раз.',
  [SUMMARY_TASK_NOT_ACTIVE]: 'Состояние задачи не допускает выбранного действия.',
  [SUMMARY_TASKS_EMPTY]: 'Добавьте задачи в черновик: формировать релиз не из чего.',
  [SUMMARY_TEXT_NOT_PLAIN]: 'В тексте управляющие символы: его прислали в непригодном виде.',
};

/**
 * Почему шаг «Релиз» выключен — или `undefined`, если он доступен.
 *
 * Три разные причины называются по-разному. Две из них про право (дизайн,
 * раздел 1.4): выдачи на «Роадмап» нет вовсе — ручка ответит `404`;
 * выдача есть, но ниже записи — `403`. Одна фраза на оба случая соврала
 * бы второму: он роадмап видит, и «нет права» прочитал бы как ошибку
 * системы. Право проверяется прежде черновика: сохранять правки тому,
 * кому релиз всё равно откажут, незачем.
 *
 * Третья — несохранённый черновик, и она про потерю работы, а не про
 * доступ (раздел 7.3).
 */
export function releaseBlockedNoteOf(
  level: AccessLevel | undefined,
  hasUnsavedTasks = false,
): string | undefined {
  if (level !== AccessLevel.Write) {
    return level === undefined ? SUMMARY_TEXTS.noRoadmapRight : SUMMARY_TEXTS.roadmapBelowWrite;
  }

  return hasUnsavedTasks ? SUMMARY_TEXTS.unsavedTasks : undefined;
}

/** Число с разделителями разрядов обычным пробелом. */
function spaced(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Объяснение отказа разбивки или релиза.
 *
 * Предел объёма называется настоящим числом из ответа: своё подставить
 * значило бы соврать о настройке узла. Кода нет — берётся сообщение
 * сервера: подменять сетевой сбой кодом порта нельзя.
 */
export function failureMessageOf(
  code: string | undefined,
  maxChars: number | undefined,
  fallback: string | undefined,
): string | undefined {
  if (code === SUMMARY_TEXT_TOO_LONG && maxChars !== undefined) {
    return `Текст длиннее ${spaced(maxChars)} знаков. Сократите или разделите на два саммари.`;
  }

  return (code === undefined ? undefined : FAILURE_MESSAGES[code]) ?? fallback;
}

/**
 * Постоянная подпись о передаче текста наружу (дизайн, раздел 5.7).
 *
 * Не всплывающая и не скрываемая: она говорит правду до нажатия и
 * заменяет диалог подтверждения на каждый вызов — диалог, который человек
 * видит двадцатый раз за день, перестаёт читаться. Ключа API здесь нет и
 * быть не может: ручка настроек его не отдаёт.
 */
export function suggesterNoticeOf(suggester: TaskSuggesterInfo): string {
  if (!suggester.isEnabled) {
    return FAILURE_MESSAGES[SUGGESTER_DISABLED] ?? '';
  }

  const host = suggester.host ?? 'настроенный узел';
  const model = suggester.model === null ? '' : `, модель ${suggester.model}`;

  if (suggester.placement === ModelServicePlacement.Local) {
    return `Разбивку делает ${host} в вашем контуре${model}. Текст саммари уходит на этот адрес; за пределы контура он не передаётся.`;
  }

  return `Разбивку делает ${host}${model}. Текст саммари уходит на этот адрес.`;
}

/** Отметка о текущей разбивке: чем и когда она построена. */
export function stampNoteOf(model: string, at: string): string {
  return `Разбито моделью ${model}, ${new Date(at).toLocaleDateString('ru-RU')}.`;
}

/**
 * Число отброшенных предложений.
 *
 * Названо на экране, потому что урезанный список без такой подписи
 * читается как «столько и предложили» (дизайн, раздел 5.5, пункт 5).
 */
export function droppedNoteOf(dropped: number): string {
  return `Отброшено предложений модели: ${dropped} — повторы, пустые и сверх предела.`;
}
