'use client';
import { useState } from 'react';
import { HealthState } from '@cairn/shared';
import { IncidentCharts } from './IncidentCharts';

import { AddressIncidents } from '@/components/AddressIncidents';
import { Loader } from '@/components/Loader';
import { StatusByEnvironment, checkedAtTextOf } from '@/components/StatusByEnvironment';
import { pluralize } from '@/utils';
import { Select } from '@/components/Select';

import type { IProps } from './types';
import { fallenOf, lastCheckedAtOf, windowDaysOf } from './utils';

/** Status dashboard within the existing Infrastructure permission. */
export function StatusOverview({
  projectId,
  status,
  incidents = [],
  incidentsPending = false,
  incidentsError = false,
  onSelect,
}: IProps) {
  const checkedAt = lastCheckedAtOf(status.domains);
  const windowDays = windowDaysOf(incidents);
  const [environmentId, setEnvironmentId] = useState('all');
  const [health, setHealth] = useState('all');
  const [chartAddress, setChartAddress] = useState('');
  const [chartDays, setChartDays] = useState(30);
  const addresses = status.domains.filter((address) => (environmentId === 'all' || address.environmentId === environmentId) && (health === 'all' || (address.health ?? 'unknown') === health));
  const environments = status.environments.filter((env) => (environmentId === 'all' || env.environmentId === environmentId) && (health === 'all' || addresses.some((address) => address.environmentId === env.environmentId)));
  const fallen = fallenOf(incidents).filter((row) => addresses.some((address) => address.domainId === row.domainId));
  const chartId = addresses.some((address) => address.domainId === chartAddress) ? chartAddress : addresses[0]?.domainId;

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Адресов', status.domains.length],
          ['В сети', status.domains.filter((a) => a.health === HealthState.Up).length],
          ['Не отвечают', status.domains.filter((a) => a.health === HealthState.Down).length],
          ['TLS требует внимания', status.domains.filter((a) => a.tlsTrusted === false || (a.tlsValidTo && Date.parse(a.tlsValidTo) - Date.now() <= 14 * 86_400_000)).length],
        ].map(([label, value]) => <div key={label} className="rounded-xl border border-border bg-surface p-4"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-2 text-3xl font-semibold tabular-nums">{value}</dd></div>)}
      </dl>
      <p className="text-xs text-muted-foreground">
        {checkedAt
          ? `Последняя проверка: ${checkedAtTextOf(checkedAt)}`
          : 'Ожидает первой проверки. Результата ещё нет.'}
      </p>

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <label className="space-y-2"><span className="text-xs text-muted-foreground">Окружение</span><Select label="Окружение" value={environmentId} onChange={setEnvironmentId}><option value="all">Все окружения</option>{status.environments.map((env) => <option key={env.environmentId} value={env.environmentId}>{env.name}</option>)}</Select></label>
        <label className="space-y-2"><span className="text-xs text-muted-foreground">Доступность</span><Select label="Фильтр доступности" value={health} onChange={setHealth}><option value="all">Все адреса</option><option value={HealthState.Up}>В сети</option><option value={HealthState.Down}>Не отвечают</option><option value="unknown">Нет данных</option></Select></label>
      </div>
      {addresses.length === 0 && <p className="text-sm text-muted-foreground">Нет адресов для выбранных фильтров.</p>}
      <StatusByEnvironment
        environments={environments}
        addresses={addresses}
        onSelect={onSelect}
      />

      {projectId && chartId && <div className="space-y-3">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <label className="min-w-0 space-y-2"><span className="text-xs text-muted-foreground">Адрес для графиков</span><Select label="Адрес для графиков" value={chartId} onChange={setChartAddress}>{addresses.map((address) => <option key={address.domainId} value={address.domainId}>{address.name}</option>)}</Select></label>
          <label className="space-y-2"><span className="text-xs text-muted-foreground">Период</span><Select label="Период графиков" value={String(chartDays)} onChange={(value) => setChartDays(Number(value))}><option value="7">7 дней</option><option value="30">30 дней</option><option value="90">90 дней</option></Select></label>
        </div>
        {addresses.find((address) => address.domainId === chartId)?.checkedAt
          ? <IncidentCharts projectId={projectId} domainId={chartId} windowDays={chartDays} />
          : <section aria-label="Графики инцидентов" className="rounded-xl border border-border bg-surface p-5"><h3 className="font-medium">История доступности</h3><p className="mt-2 text-sm text-muted-foreground">Ожидает первой проверки. Наблюдение за адресом ещё не началось; данных для графика нет.</p></section>}
      </div>}

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
              {addresses.length === 0 ? 'Для истории выберите адрес.' : addresses.every((address) => !address.checkedAt)
                ? 'Наблюдение ещё не началось. История появится после первой проверки.'
                : addresses.some((address) => !address.checkedAt) ? 'Для части адресов ещё нет результатов первой проверки. Отсутствие зарегистрированных инцидентов не подтверждает доступность.'
                : `Зарегистрированных падений за ${pluralize(windowDays, 'день', 'дня', 'дней')} нет. Это журнал инцидентов, а не измеренный аптайм.`}
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
