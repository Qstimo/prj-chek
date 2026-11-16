'use client';

import { AddressIncidents } from '@/components/AddressIncidents';
import { Loader } from '@/components/Loader';
import { StatusByEnvironment, checkedAtTextOf } from '@/components/StatusByEnvironment';
import { pluralize } from '@/utils';

import type { IProps } from './types';
import { fallenOf, lastCheckedAtOf, windowDaysOf } from './utils';

/**
 * Сводная картина по проекту: таблица проверок и лента падений под ней.
 *
 * Живёт наверху «Инфраструктуры», а не в своей секции: список секций
 * закрыт и равен единицам выдачи доступа (ТЗ 4.1), и «Статус» рядом с
 * «Инфраструктурой» завёл бы единицу выдачи, которой в модели прав нет.
 *
 * Таблица отвечает на вопрос «как сейчас», лента — «что было»: смешивать
 * их в одной строке значит снова предлагать человеку сводить глазами.
 */
export function StatusOverview({
  status,
  incidents = [],
  incidentsPending = false,
  incidentsError = false,
  onSelect,
}: IProps) {
  const checkedAt = lastCheckedAtOf(status.domains);
  const fallen = fallenOf(incidents);
  const windowDays = windowDaysOf(incidents);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {checkedAt
          ? `Последняя проверка: ${checkedAtTextOf(checkedAt)}`
          : 'Проверок ещё не было: статус считается автоматически по расписанию.'}
      </p>

      <StatusByEnvironment
        environments={status.environments}
        addresses={status.domains}
        onSelect={onSelect}
      />

      <section className="space-y-1">
        <h3 className="text-sm font-medium">Падения</h3>

        {incidentsPending && <Loader label="Загрузка истории падений…" />}
        {incidentsError && (
          <p role="alert" className="text-sm text-destructive">
            Не удалось загрузить историю падений.
            {incidents.length > 0 && ' Показаны ранее загруженные данные.'}
          </p>
        )}

        {fallen.length === 0 ? (
          !incidentsPending && !incidentsError && (
            <p className="text-xs text-muted-foreground">
              Падений за {pluralize(windowDays, 'день', 'дня', 'дней')} не было.
            </p>
          )
        ) : (
          <ul aria-label="Падения адресов" className="space-y-1">
            {fallen.map((row) => (
              <li key={row.domainId}>
                {onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(row.domainId)}
                    className="text-sm font-medium hover:underline"
                  >
                    {row.name}
                  </button>
                ) : (
                  <span className="text-sm font-medium">{row.name}</span>
                )}
                <AddressIncidents incidents={row} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
