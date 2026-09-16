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

/** Одна претензия проверки: путь до поля, вид и пояснение от zod. */
interface ValidationIssue {
  path: string;
  code?: string;
  message: string;
}

/**
 * Превращает отказ сервера в текст, который можно показать человеку.
 *
 * Бэкенд присылает разбор по полям (`issues`), и до этого он терялся:
 * пользователь видел «Неверные данные запроса» и гадал, какое поле не так.
 * Здесь путь до поля переводится в подпись интерфейса, а вид ошибки —
 * в русскую формулировку; исходное пояснение сохраняется, когда оно
 * написано в контракте осмысленно.
 */
export function describeApiError(error: unknown): string | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  if (!(error instanceof ApiError)) {
    return error.message;
  }

  const issues = issuesOf(error.details);

  if (issues.length === 0) {
    return error.message;
  }

  return issues.map(describeIssue).join('\n');
}

/** Достаёт разбор по полям из тела ответа, не доверяя его форме. */
function issuesOf(details: unknown): ValidationIssue[] {
  const raw = (details as { issues?: unknown } | null)?.issues;

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter(
    (issue): issue is ValidationIssue =>
      typeof issue === 'object' && issue !== null && typeof (issue as ValidationIssue).path === 'string',
  );
}

/** Собирает строку про одно поле: «Подпись — объяснение». */
function describeIssue(issue: ValidationIssue): string {
  // Путь приходит с индексом элемента (`domains.0`): для подписи нужно поле.
  const field = issue.path.split('.')[0] ?? issue.path;
  const label = FIELD_LABELS[field] ?? field;
  const explanation = ISSUE_MESSAGES[issue.code ?? ''] ?? issue.message;

  return `${label}: ${explanation}`;
}

/**
 * Подписи полей контракта.
 *
 * Общие для всех форм: имена полей в контракте одни и те же, и держать
 * перевод в каждой форме значило бы разойтись формулировками.
 */
const FIELD_LABELS: Record<string, string> = {
  name: 'Название',
  slug: 'Адрес в системе',
  purpose: 'Назначение',
  stack: 'Стек',
  repoUrl: 'Репозиторий',
  notes: 'Заметки',
  kind: 'Вид',
  domains: 'Домены',
  healthCheckUrl: 'Адрес проверки',
  serverId: 'Сервер',
  host: 'Адрес машины',
  ip: 'IP-адрес',
  provider: 'Провайдер',
  specs: 'Характеристики',
  owner: 'Владелец',
  registrar: 'Регистратор',
  paidUntil: 'Оплачен до',
  email: 'Почта',
  password: 'Пароль',
  code: 'Код',
  key: 'Ключ',
  value: 'Значение',
  title: 'Заголовок',
  body: 'Текст',
  content: 'Содержимое',
  level: 'Уровень',
};

/**
 * Формулировки по видам ошибок zod.
 *
 * Собственные сообщения контракта («Ожидается домен») написаны по-русски
 * и осмысленно, поэтому вид `custom` сюда не входит — его текст идёт как есть.
 */
const ISSUE_MESSAGES: Record<string, string> = {
  invalid_type: 'заполните поле',
  invalid_string: 'ожидается ссылка или адрес нужного вида',
  invalid_enum_value: 'выберите значение из списка',
  too_small: 'слишком короткое значение',
  too_big: 'слишком длинное значение',
  invalid_date: 'ожидается дата',
  not_multiple_of: 'недопустимое значение',
};
