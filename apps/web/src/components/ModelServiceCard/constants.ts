import {
  MODEL_SERVICE_BASE_URL_MISSING,
  MODEL_SERVICE_DISABLED,
  MODEL_SERVICE_FOLDER_MISSING,
  MODEL_SERVICE_SECRET_MISSING,
  MODEL_SERVICE_SECRET_UNDECRYPTABLE,
  ModelAuthScheme,
  ModelServiceKind,
  ModelServicePlacement,
  ModelServiceSource,
} from '@cairn/shared';

/** Названия узлов: человек правит разбивку, а не `task_suggester`. */
export const KIND_LABELS: Record<ModelServiceKind, string> = {
  [ModelServiceKind.TaskSuggester]: 'Разбивка саммари на задачи',
  [ModelServiceKind.Transcriber]: 'Расшифровка записи созвона',
};

/**
 * Откуда взята действующая настройка — первое, что видно на карточке.
 *
 * Формулировки отвечают на вопрос «почему оно берёт это», а не называют
 * техническое место: «Задано в интерфейсе» объясняет, почему правка
 * `.env` ничего не изменила (дизайн, 2.2).
 */
export const SOURCE_LABELS: Record<ModelServiceSource, string> = {
  [ModelServiceSource.Database]: 'Задано в интерфейсе',
  [ModelServiceSource.Environment]: 'Из окружения',
  [ModelServiceSource.None]: 'Не настроено',
};

/**
 * Почему узел не работает. Каждая причина чинится своим действием.
 *
 * Поэтому они и не сводятся в «не настроено»: ключ берут у провайдера,
 * адрес вписывают, `CAIRN_ENCRYPTION_KEY` возвращают прежний, а галочку
 * ставят обратно (дизайн, 4.1).
 */
export const BLOCKED_LABELS: Record<string, string> = {
  [MODEL_SERVICE_SECRET_MISSING]: 'Нет ключа',
  [MODEL_SERVICE_BASE_URL_MISSING]: 'Нет адреса',
  // Отдельно от ключа: каталог берут в той же консоли, но это другое
  // поле, и «нет ключа» отправило бы менять то, что уже верно.
  [MODEL_SERVICE_FOLDER_MISSING]: 'Нет каталога',
  [MODEL_SERVICE_SECRET_UNDECRYPTABLE]:
    'Ключ не расшифровывается: проверьте CAIRN_ENCRYPTION_KEY. Впишите ключ заново или сбросьте настройку к окружению',
  [MODEL_SERVICE_DISABLED]: 'Выключено',
};

/**
 * Схемы авторизации по-русски.
 *
 * «Bearer» и «Api-Key» остаются как есть: это значения заголовка, и
 * переводить их значило бы прятать то, что человек ищет в документации
 * провайдера.
 */
export const AUTH_SCHEME_LABELS: Record<ModelAuthScheme, string> = {
  [ModelAuthScheme.Bearer]: 'Bearer',
  [ModelAuthScheme.ApiKey]: 'Api-Key',
  [ModelAuthScheme.None]: 'Без ключа',
};

/** Вид узла: по адресу это не определяется, говорит человек. */
export const PLACEMENT_LABELS: Record<ModelServicePlacement, string> = {
  [ModelServicePlacement.External]: 'Внешний узел',
  [ModelServicePlacement.Local]: 'В вашем контуре',
};
