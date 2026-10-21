import type { IProps } from './types';
import { dayTextOf, downSinceTextOf, durationTextOf, fallCountTextOf } from './utils';

/**
 * История падений адреса: с каких пор лежит и сколько раз падал.
 *
 * Живёт у адреса на экране «Инфраструктура» — там же, где статус, и там
 * же верна проверка прав. Пустая история не рисует ничего: у адреса,
 * который не падал, сообщать нечего.
 */
export function AddressIncidents({ incidents }: IProps) {
  if (!incidents || (!incidents.open && incidents.past.length === 0)) {
    return null;
  }

  return (
    <div className="text-xs text-muted-foreground">
      {incidents.open && (
        <p className="text-destructive">{downSinceTextOf(incidents.open.startedAt)}</p>
      )}

      {incidents.past.length > 0 && (
        <details>
          <summary className="cursor-pointer">{fallCountTextOf(incidents.past.length)}</summary>
          <ul className="space-y-0.5 pl-4">
            {incidents.past.map((incident) => (
              <li key={incident.id}>
                {dayTextOf(incident.startedAt)} — {durationTextOf(incident)}
                {incident.cause ? ` (${incident.cause})` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
