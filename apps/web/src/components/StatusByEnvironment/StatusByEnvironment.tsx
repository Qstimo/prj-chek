'use client';

import { AddressStatusRow } from './AddressStatusRow';
import { COLUMNS, TABLE_LABEL } from './constants';
import type { IProps } from './types';
import { checkedAtTextOf } from './utils';

/**
 * Статус проекта таблицей «окружение × адрес × три проверки» (ТЗ 6).
 *
 * Два списка — окружения отдельно, домены отдельно — оставляли человеку
 * работу сводить их глазами. Таблица отвечает сразу на оба вопроса: что
 * сломалось и насколько свежи сведения. Группа строк на окружение, а не
 * столбец с его именем: имя повторялось бы в каждой строке.
 */
export function StatusByEnvironment({ environments, addresses, onSelect }: IProps) {
  return (
    <div className="overflow-x-auto">
      <table aria-label={TABLE_LABEL} className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            {COLUMNS.map((column) => (
              <th key={column} scope="col" className="pb-1 pr-3 font-normal">
                {column}
              </th>
            ))}
          </tr>
        </thead>

        {environments.map((environment) => {
          const own = addresses.filter(
            (address) => address.environmentId === environment.environmentId,
          );

          return (
            <tbody key={environment.environmentId} aria-label={environment.name}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={COLUMNS.length}
                  className="border-t border-border pt-2 text-left font-medium"
                >
                  {environment.name}
                  {/* Время проверки у окружения — самая поздняя из проверок
                      его адресов: раньше неё сведения не устаревают. */}
                  <span className="pl-2 text-xs font-normal text-muted-foreground">
                    проверено {checkedAtTextOf(environment.checkedAt)}
                  </span>
                </th>
              </tr>

              {own.length === 0 ? (
                // Проверять нечем — значит, нечего и утверждать.
                <tr>
                  <td colSpan={COLUMNS.length} className="py-1 text-muted-foreground">
                    Нет адресов — проверять нечего
                  </td>
                </tr>
              ) : (
                own.map((address) => (
                  <AddressStatusRow key={address.domainId} address={address} onSelect={onSelect} />
                ))
              )}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
