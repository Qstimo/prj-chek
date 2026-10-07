import type { Platform, RoadmapCheckpointCreate } from '@cairn/shared';

/** Начальные значения: формулировка, ссылка и теги. */
export interface CheckpointFormValues {
  title: string;
  url: string | null;
  platformIds: string[];
}

/** Пропсы формы чекпоинта. */
export interface IProps {
  /**
   * Предзаполнение: правка существующего чекпоинта либо заголовок
   * записи хроники при создании.
   */
  initial?: Partial<CheckpointFormValues>;
  /** Подпись кнопки. По умолчанию форма создаёт. */
  submitLabel?: string;
  onSubmit: (input: RoadmapCheckpointCreate) => void;
  /**
   * Чтение заголовка страницы по ссылке на задачу.
   *
   * Пропом, а не хуком внутри: форма остаётся презентационной и проверяется
   * без поднятия TanStack Query. Неудача — `null`, а не исключение.
   */
  onReadTitle?: (url: string) => Promise<string | null>;
  /**
   * Платформы проекта для переключателей.
   *
   * Отсутствие пропа означает, что платформ нет: переключателей не будет,
   * и набор не отправляется.
   */
  platforms?: Platform[];
  isSubmitting?: boolean;
  /** Отказ сервера: показывается под полем. */
  error?: string;
  /**
   * Различитель идентификаторов полей.
   *
   * Форма добавления и форма правки живут на одной панели одновременно:
   * без различителя два поля получили бы один `id`, обе подписи указали
   * бы на первое, и поиск по подписи стал бы неоднозначным.
   */
  idPrefix?: string;
}
