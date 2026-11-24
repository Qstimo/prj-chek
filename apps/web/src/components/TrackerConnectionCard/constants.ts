import {
  ModelProbeOutcome,
  TRACKER_BASE_URL_MISSING,
  TRACKER_DISABLED,
  TRACKER_SECRET_MISSING,
  TRACKER_SECRET_UNDECRYPTABLE,
  TrackerKind,
} from '@cairn/shared';

/** Названия трекеров: человек подключает Weeek, а не `weeek`. */
export const TRACKER_LABELS: Record<TrackerKind, string> = {
  [TrackerKind.Weeek]: 'Weeek',
};

/**
 * Почему трекер не работает. Каждая причина чинится своим действием.
 *
 * Поэтому они и не сводятся в «не настроено»: токен берут в Weeek, адрес
 * вписывают, `CAIRN_ENCRYPTION_KEY` возвращают прежний, а галочку ставят
 * обратно (контракт, коды `blockedBy`).
 *
 * Про сброс к окружению здесь не сказано ничего, в отличие от карточки узла
 * модели: запасного источника в окружении у трекера нет и не будет (дизайн,
 * 3.4), и предложить «вернуть настройку окружения» значило бы послать
 * человека к переменным, которых не существует.
 */
export const BLOCKED_LABELS: Record<string, string> = {
  [TRACKER_SECRET_MISSING]: 'Нет токена',
  [TRACKER_BASE_URL_MISSING]: 'Нет адреса',
  [TRACKER_SECRET_UNDECRYPTABLE]:
    'Токен не расшифровывается: проверьте CAIRN_ENCRYPTION_KEY. Впишите токен заново',
  [TRACKER_DISABLED]: 'Выключено',
};

/**
 * Фразы по исходам проверки связи — собирает **интерфейс**, а не сервер.
 *
 * Исходы те же шесть, что у узлов модели (дизайн, 9.1): `ModelProbeOutcome`
 * описывает не узел модели, а чужой HTTP. Слова при этом свои, и это не
 * копия с подменёнными словами: у трекера нет имени модели, и фразы вроде
 * «неверное имя модели» или «лишний /v1» отправляли бы править то, чего в
 * этой настройке не существует.
 */
export const OUTCOME_MESSAGES: Record<ModelProbeOutcome, string> = {
  [ModelProbeOutcome.Ok]: 'Связь есть: трекер ответил, токен принят',
  [ModelProbeOutcome.Unauthorized]: 'Токен не принят. Проверьте токен в трекере',
  [ModelProbeOutcome.NotFound]: 'Ручки нет. Проверьте адрес подключения',
  [ModelProbeOutcome.BadRequest]: 'Трекер отказался от запроса: проверьте адрес и пространство',
  [ModelProbeOutcome.Unavailable]: 'Трекер не ответил. Попробуйте ещё раз',
  [ModelProbeOutcome.BadResponse]: 'Трекер ответил, но не тем: разобрать ответ не удалось',
};

/** Исход, после которого настройку чинить не нужно. */
export const OK_OUTCOME = ModelProbeOutcome.Ok;
