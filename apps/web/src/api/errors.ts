/** Ошибка ответа API. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Возвращает человеческое объяснение кода ответа.
 *
 * Формулировка для `404` намеренно нейтральна: сказать «нет доступа»
 * значило бы раскрыть, что объект существует (ТЗ 4.2).
 */
export function messageForStatus(status: number): string {
  return STATUS_MESSAGES[status] ?? 'Не удалось выполнить запрос. Попробуйте ещё раз.';
}

/** Сообщения по кодам ответа. */
const STATUS_MESSAGES: Record<number, string> = {
  400: 'Проверьте заполненные поля.',
  401: 'Нужно войти заново.',
  403: 'Недостаточно прав для этого действия.',
  404: 'Не найдено.',
  409: 'Действие невозможно в текущем состоянии.',
};
