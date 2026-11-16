'use client';

import { useEffect } from 'react';
import { useQueryAddressIncidents } from '@/api/hooks';
import { Loader } from '@/components/Loader';
import { dailyDowntime } from './timeline';

/** Fetch every page before treating the timeline as complete. */
export function IncidentCharts({ projectId, domainId, windowDays }: { projectId: string; domainId: string; windowDays: number }) {
  const history = useQueryAddressIncidents(projectId, domainId, { windowDays, limit: 200 });
  useEffect(() => {
    if (history.hasNextPage && !history.isFetching && !history.isError) {
      void history.fetchNextPage({ cancelRefetch: false });
    }
  }, [history.hasNextPage, history.isFetching, history.isError, history.fetchNextPage]);

  const data = history.data;
  const incomplete = data && (data.nextOffset !== null || data.incidents.length < data.summary.falls);
  const days = data ? dailyDowntime(data.window, data.incidents) : [];
  const maximum = Math.max(60, ...days.map((day) => day.seconds));
  return (
    <section aria-label="Графики инцидентов" className="min-w-0 rounded-xl border border-border bg-surface p-5 [overflow-wrap:anywhere]">
      <h3 className="font-medium">История доступности</h3>
      <p className="mt-1 text-xs text-muted-foreground">Только зарегистрированные интервалы падений. Отсутствие инцидентов не подтверждает измеренный аптайм. Дни показаны по UTC.</p>
      {(history.isPending || history.isFetching) && <Loader label="Загрузка полной истории инцидентов…" />}
      {history.isError && <p role="alert" className="mt-3 text-sm text-destructive">Не удалось загрузить полную историю.{data && ' Показаны ранее загруженные данные, они могут быть неполными.'} <button type="button" className="underline" disabled={history.isFetching} onClick={() => void history.refetch()}>Повторить</button></p>}
      {!history.isPending && !history.isError && !data && <p className="mt-4 text-sm text-muted-foreground">История недоступна.</p>}
      {data && <>
        <p className="mt-4 text-xs text-muted-foreground">Окно: {new Date(data.window.from).toLocaleDateString('ru-RU')} — {new Date(data.window.to).toLocaleDateString('ru-RU')} · {data.name}</p>
        {incomplete && <p role="status" className="mt-2 text-sm text-muted-foreground">История неполная: загружено {data.incidents.length} из {data.summary.falls} инцидентов. Итоговый график появится после загрузки всех страниц.</p>}
        {!incomplete && <>
          {data.incidents.length === 0 && <p className="my-4 text-sm">За выбранное окно инцидентов не зарегистрировано.</p>}
          <div className="mt-5 flex items-baseline justify-between gap-3"><h4 className="text-sm font-medium">Простой по дням</h4><span className="text-xs text-muted-foreground">минуты · максимум {Math.round(maximum / 60)}</span></div>
          <svg role="img" aria-label="Длительность зарегистрированных падений по дням" viewBox="0 0 720 150" className="mt-3 h-40 w-full" preserveAspectRatio="none">
            <line x1="0" x2="720" y1="140" y2="140" stroke="currentColor" className="text-border" />
            {days.map((day, index) => <rect key={day.date} x={index * 720 / days.length + 2} y={140 - day.seconds / maximum * 130} width={Math.max(1, 720 / days.length - 4)} height={Math.max(1, day.seconds / maximum * 130)} rx="2" className={day.seconds ? 'fill-amber-500' : 'fill-muted'}><title>{day.date}: {Math.round(day.seconds / 60)} мин.</title></rect>)}
          </svg>
          <div className="flex justify-between text-xs text-muted-foreground"><span>{days[0]?.date}</span><span>{days.at(-1)?.date}</span></div>
          <h4 className="mb-2 mt-6 text-sm font-medium">Лента инцидентов</h4>
          <div className="flex gap-1" aria-label="Дни с зарегистрированными падениями">
            {days.map((day) => <span key={day.date} title={`${day.date}: ${Math.round(day.seconds / 60)} мин.`} className={`h-7 min-w-0 flex-1 rounded-sm ${day.seconds ? 'bg-amber-500' : 'bg-muted'}`} />)}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Янтарный — зарегистрирован простой · серый — инцидентов нет</p>
          <details className="mt-4 text-xs"><summary className="cursor-pointer text-muted-foreground">Данные графика</summary><ul className="mt-2 grid gap-1 sm:grid-cols-3">{days.map((day) => <li key={day.date}>{day.date}: {Math.round(day.seconds / 60)} мин.</li>)}</ul></details>
        </>}
      </>}
    </section>
  );
}
