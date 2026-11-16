import {
  SUGGESTER_DISABLED,
  SUGGESTER_UNAVAILABLE,
  SUMMARY_ALREADY_RELEASED,
  SUMMARY_TASKS_EMPTY,
  SUMMARY_TEXT_NOT_PLAIN,
  SUMMARY_TEXT_TOO_LONG,
  TaskSuggesterKind,
  type TaskSuggesterInfo,
} from '@cairn/shared';

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
  replaceQuestion: 'Текущий список задач будет заменён предложениями модели.',
  /** Предупреждение, а не запрет: релиз не блокируется (дизайн, 2.5). */
  stale: 'Текст поправили после разбивки — задачи могли устареть.',
  /** Длиннее кнопки формы намеренно: две одноимённые спорили бы за фокус. */
  release: 'Сформировать релиз на основании задач',
  releaseTitle: 'Релиз на основании задач',
  noRoadmapRight: 'Нет права на «Роадмап» этого проекта.',
  released: 'Задачи ушли в роадмап.',
} as const;

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
  [SUMMARY_ALREADY_RELEASED]: 'Релиз по этому саммари уже сформирован: задачи правятся в роадмапе.',
  [SUMMARY_TASKS_EMPTY]: 'Добавьте задачи в черновик: формировать релиз не из чего.',
  [SUMMARY_TEXT_NOT_PLAIN]: 'В тексте управляющие символы: его прислали в непригодном виде.',
};

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

  if (suggester.kind === TaskSuggesterKind.Local) {
    return `Разбивку делает ${host} в вашем контуре${model}. Текст саммари уходит на этот адрес, обработка идёт в вашем контуре.`;
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
