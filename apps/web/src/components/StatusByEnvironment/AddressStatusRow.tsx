'use client';

import { HealthState } from '@cairn/shared';

import type { IAddressProps } from './types';
import {
  checkedAtTextOf,
  healthNoteTextOf,
  healthTextOf,
  registryTextOf,
  tlsTextOf,
} from './utils';

/**
 * Одна строка таблицы: адрес и три проверки по отдельности.
 *
 * Три проверки рядом и в отдельных столбцах: они об одном имени, и
 * сводить их глазами из одной слитой фразы человеку приходилось самому.
 */
export function AddressStatusRow({ address, onSelect }: IAddressProps) {
  const note = healthNoteTextOf(address);

  return (
    <tr aria-label={address.name} className="border-t border-border align-top">
      <td className="py-1 pr-3 font-medium">
        {onSelect ? (
          <button
            type="button"
            onClick={() => onSelect(address.domainId)}
            className="text-left hover:underline"
          >
            {address.name}
          </button>
        ) : (
          address.name
        )}
      </td>

      <td className="py-1 pr-3" data-health={address.health ?? 'unknown'}>
        <span className={address.health === HealthState.Down ? 'text-destructive' : undefined}>
          {healthTextOf(address)}
        </span>
        {/* Пометка у живого адреса: 401 и редирект предупреждения не дают,
            и без неё зелёная строка выглядит как «приложение отвечает». */}
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </td>

      <td className="py-1 pr-3">{tlsTextOf(address)}</td>
      <td className="py-1 pr-3">{registryTextOf(address)}</td>
      <td className="py-1 text-muted-foreground">{checkedAtTextOf(address.checkedAt)}</td>
    </tr>
  );
}
