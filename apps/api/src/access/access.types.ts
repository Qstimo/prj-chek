import type { SubjectKind } from '@cairn/shared';

/**
 * Действующий субъект запроса.
 *
 * Все методы доступа к данным принимают его первым аргументом, поэтому
 * проверку прав невозможно забыть — её не нужно вызывать отдельно (спека 5.4).
 *
 * Заполняется guard'ом аутентификации в чанке 7 и кладётся в `request.subject`.
 */
export interface RequestSubject {
  /** Идентификатор в таблице субъектов. */
  id: string;
  kind: SubjectKind;
  label: string;
  /** Суперадмин обходит таблицу выдач (ТЗ 4.1). */
  isSuperadmin: boolean;
  /** Отозванный субъект не получает доступа ни к чему. */
  isRevoked: boolean;
}
