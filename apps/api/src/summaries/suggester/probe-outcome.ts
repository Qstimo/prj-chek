import { ModelProbeOutcome } from '@cairn/shared';

/**
 * Код ответа узла в исход проверки связи.
 *
 * Чистая функция в своём файле, потому что она понадобится и адаптеру
 * расшифровки: отображение кодов — свойство HTTP, а не нашего порта, и
 * второе место для него разошлось бы с первым.
 *
 * `429` стоит рядом с `5xx`, а не с `400`, намеренно: правильное
 * действие человека при нём — нажать ещё раз, а не искать ошибку в
 * настройке. По той же причине остальные `4xx` сведены к `bad_request`:
 * узел не принял наш запрос, и чинится это настройкой.
 */
export function probeOutcomeOf(status: number): ModelProbeOutcome {
  if (status >= 200 && status < 300) {
    return ModelProbeOutcome.Ok;
  }

  if (status === 401 || status === 403) {
    return ModelProbeOutcome.Unauthorized;
  }

  if (status === 404) {
    return ModelProbeOutcome.NotFound;
  }

  if (status === 429) {
    return ModelProbeOutcome.Unavailable;
  }

  // Переадресация сюда доходит только от узла, который отвечает не тем,
  // что мы спросили: сам адаптер её не выполняет (`redirect: 'error'`).
  return status >= 400 && status < 500 ? ModelProbeOutcome.BadRequest : ModelProbeOutcome.Unavailable;
}
