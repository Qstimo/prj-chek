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

  // Открытое падение входит в счёт окна, но лежит отдельно от закрытых:
  // без поправки на него подвал «показаны последние N» вылезал бы на
  // полной истории.
  const shown = incidents.past.length + (incidents.open ? 1 : 0);

  return (
    <div className="text-xs text-muted-foreground">
      {incidents.open && (
        <p className="text-destructive">{downSinceTextOf(incidents.open.startedAt)}</p>
      )}

      {incidents.past.length > 0 && (
        <details>
          {/* Счёт — из `fallsInWindow`, а не из длины списка: список усечён
              сервером, и счёт по нему застывал бы на пределе выдачи. */}
          <summary className="cursor-pointer">
            {fallCountTextOf(incidents.fallsInWindow, incidents.windowDays)}
          </summary>
          <ul className="space-y-0.5 pl-4">
            {incidents.past.map((incident) => (
              <li key={incident.id}>
                {dayTextOf(incident.startedAt)} — {durationTextOf(incident)}
                {incident.cause ? ` (${incident.cause})` : ''}
              </li>
            ))}
          </ul>
          {incidents.fallsInWindow > shown && (
            <p className="pl-4">Показаны последние {incidents.past.length}.</p>
          )}
        </details>
      )}
    </div>
  );
}
