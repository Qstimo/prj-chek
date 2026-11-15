import { BadRequestException, ConflictException, HttpException } from '@nestjs/common';

/**
 * Тексты отказа по имени нарушенного ограничения.
 *
 * Репозитории проверяют повторы сами и отвечают `409` до похода в базу —
 * так человек получает отказ на своём языке. Эта карта нужна на случай,
 * когда проверку забыли или гонка проскочила мимо неё: ограничение в базе
 * срабатывает последним, и сырое нарушение ключа не должно выглядеть
 * падением сервера.
 */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  variables_environment_key: 'Переменная с таким ключом уже есть в окружении.',
  environments_project_name: 'Окружение с таким названием уже есть в проекте.',
  environment_domains_environment_name: 'Такой адрес уже есть в окружении.',
  doc_pages_project_title: 'Страница с таким заголовком уже есть в проекте.',
  project_platforms_project_name: 'Платформа с таким именем уже есть в проекте.',
  roadmap_versions_project_label: 'Версия с таким обозначением уже есть в проекте.',
  servers_name: 'Сервер с таким именем уже есть.',
  domains_name: 'Такой домен уже есть в реестре.',
  grants_subject_project_section: 'Выдача на эту секцию уже есть.',
};

/** Повтор по уникальному ключу. */
const UNIQUE_VIOLATION = '23505';

/**
 * Класс «негодные данные»: дата, которой не бывает (`22008`), строка длиннее
 * колонки (`22001`), непригодный текст для типа (`22P02`). Вход виноват —
 * значит `400`, а не `500`.
 */
const DATA_EXCEPTION_CLASS = '22';

/** Код SQLSTATE, если ошибка пришла от драйвера базы. */
function sqlStateOf(cause: unknown): string | null {
  if (typeof cause !== 'object' || cause === null) {
    return null;
  }

  const code = (cause as { code?: unknown }).code;

  return typeof code === 'string' ? code : null;
}

/**
 * Переводит ошибку драйвера базы в ответ API.
 *
 * Отдаёт `null`, если переводить нечего: ошибка уже является ответом API
 * либо к базе отношения не имеет. Такую нужно оставить как есть — падение
 * должно остаться падением, иначе настоящие поломки спрячутся за `400`.
 */
export function httpErrorOf(cause: unknown): HttpException | null {
  if (cause instanceof HttpException) {
    return null;
  }

  const code = sqlStateOf(cause);

  if (code === null) {
    return null;
  }

  if (code === UNIQUE_VIOLATION) {
    const constraint = (cause as { constraint_name?: unknown }).constraint_name;
    const known = typeof constraint === 'string' ? CONSTRAINT_MESSAGES[constraint] : undefined;

    return new ConflictException(known ?? 'Такая запись уже есть.');
  }

  if (code.startsWith(DATA_EXCEPTION_CLASS)) {
    return new BadRequestException('Значение не подходит: проверьте формат.');
  }

  return null;
}
