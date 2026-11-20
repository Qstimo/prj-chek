'use client';

import { Loader } from '@/components/Loader';
import type { AddressIncidentHistory, Incident, IncidentProbe } from '@cairn/shared';

import { useQueryAddressIncidents } from '@/api/hooks';
import {
  checksTextOf,
  downSinceTextOf,
  downtimeTextOf,
  exactDurationTextOf,
  incidentRangeTextOf,
  probePlacementTextOf,
  probePortsTextOf,
  probeVerdictTextOf,
  recoveryTextOf,
} from '@/components/AddressIncidents';
import { Drawer, DrawerWidth } from '@/components/Drawer';
import {
  checkedAtTextOf,
  healthNoteTextOf,
  healthTextOf,
  placementTextOf,
  registryTextOf,
  tlsTextOf,
} from '@/components/StatusByEnvironment';
import { WarningsPanel } from '@/components/WarningsPanel';

import type { IProps } from './types';
import { fallsTextOf, unobservedNoteOf, uptimeSummaryTextOf } from './utils';
import { registryExplanationOf } from '@/components/StatusByEnvironment/utils';

/**
 * Разбор одного адреса: три проверки по отдельности, разрешение имени,
 * доля времени «не отвечает» и полная история падений.
 *
 * Своя панель, а не раскрытие в таблице: таблица отвечает на вопрос «где
 * сломалось», а здесь человек разбирается «почему», и для этого нужны
 * расшифровки, которые в строку не вмещаются.
 *
 * Общий `Drawer`: фокус-ловушка, Esc и подложка — его, своей копии
 * у панели нет.
 */
export function AddressStatusPanel({ projectId, address, warnings, onClose }: IProps) {
  // Хук зовётся всегда — `null` вместо адреса означает «панель закрыта»,
  // и запрос не уходит.
  const history = useQueryAddressIncidents(projectId, address?.checkedAt ? address.domainId : null);

  if (!address) {
    return null;
  }

  const own = warnings.filter((warning) => warning.subject === address.name);
  const note = healthNoteTextOf(address);
  const placement = placementTextOf(address);

  return (
    <Drawer isOpen onClose={onClose} title="Разбор адреса" width={DrawerWidth.Half}>
      <h3 className="text-lg font-medium">{address.name}</h3>

      <dl className="grid gap-3 sm:grid-cols-2">
        <Check label="Доступность" value={healthTextOf(address)} note={note} />
        <Check label="Сертификат" value={tlsTextOf(address)} />
        <div><Check label="Домен" value={registryTextOf(address)} note={address.registryError ? registryExplanationOf(address.registryError) : null} />{address.registryError && <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">Ответ поставщика данных</summary><p className="mt-1 break-words">{address.registryError}</p></details>}</div>
        <Check label="Проверено" value={checkedAtTextOf(address.checkedAt)} />
        <Check label="Разрешение имени" value={placement ?? 'имя никуда не смотрит'} />
      </dl>

      <WarningsPanel warnings={own} />

      <section className="space-y-2">
        <h4 className="text-sm font-medium">История падений</h4>
        {!address.checkedAt ? <p className="text-sm text-muted-foreground">Ожидает первой проверки. Наблюдение за адресом ещё не началось.</p> : <History
          history={history.data}
          isPending={history.isPending}
          isError={history.isError}
          isFetching={history.isFetching}
          onLoadMore={() => void history.fetchNextPage({ cancelRefetch: false })}
          onRetry={() => void history.refetch()}
        />}
      </section>
    </Drawer>
  );
}

/**
 * Одно падение: отрезок, ход и граница возвращения.
 *
 * Три строки, а не одна: «день — длительность (причина)» отвечал только
 * на вопрос «сколько», и то округлённо. Здесь по отдельности названы
 * время начала и конца, точная длительность, причина в начале и в
 * конце, число подтвердивших проверок и вилка возвращения.
 *
 * Причина конца пишется только тогда, когда отличается от начальной:
 * «HTTP 500 → HTTP 500» — шум, а не наблюдение.
 */
function IncidentRow({ incident }: { incident: Incident }) {
  const changed = incident.lastCause && incident.lastCause !== incident.cause;
  const recovery = recoveryTextOf(incident);
  const duration = exactDurationTextOf(incident);

  return (
    <li className="border-l-2 border-border pl-3">
      <p className="text-sm tabular-nums">
        {incidentRangeTextOf(incident)}
        {duration && <span className="text-muted-foreground"> · {duration}</span>}
      </p>

      {incident.cause && (
        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
          {incident.cause}
          {changed && ` → ${incident.lastCause}`}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        {checksTextOf(incident.checks)}
        {recovery && ` · ${recovery}`}
      </p>

      {/* Слепок — под раскрытием: он отвечает на вопрос «к кому идти», а
          его задают не к каждой строке истории. У падений, заведённых до
          его появления, слепка нет, и выдумывать его нельзя. */}
      {incident.probe && <Probe probe={incident.probe} />}
    </li>
  );
}

/**
 * Слепок момента падения: вывод одной фразой, под ним — чем он измерен.
 *
 * Вывод сверху намеренно: он и есть то, зачем слепок снимался, а адреса
 * с портами под ним — основание, по которому его можно оспорить.
 */
function Probe({ probe }: { probe: IncidentProbe }) {
  const verdict = probeVerdictTextOf(probe);
  const ports = probePortsTextOf(probe);

  return (
    <details className="mt-1 text-xs text-muted-foreground">
      <summary className="cursor-pointer">Слепок момента падения</summary>
      {verdict && <p className="mt-1 text-foreground">{verdict}</p>}
      <p className="mt-1">{probePlacementTextOf(probe)}</p>
      {ports && <p className="[overflow-wrap:anywhere]">{ports}</p>}
      <p className="mt-1">снят {checkedAtTextOf(probe.at)}</p>
    </details>
  );
}

/** Одна проверка: значение и пометка под ним. */
function Check({ label, value, note }: { label: string; value: string; note?: string | null }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd>
        {value}
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </dd>
    </div>
  );
}

/**
 * История падений за окно: сводка и отрезки.
 *
 * Загрузка, отказ и пустая история разведены: гашение всех трёх одним
 * `return null` оставляло человека с доступом перед пустым местом.
 */
function History({
  history,
  isPending,
  isError,
  isFetching,
  onLoadMore,
  onRetry,
}: {
  history: AddressIncidentHistory | null | undefined;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
}) {
  if (isPending) {
    return <Loader />;
  }

  if (isError && !history) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Не удалось загрузить историю падений.
      </p>
    );
  }

  // `null` означает «секция не видна»: ручка отвечает 404 и на чужой
  // адрес, и при отсутствии выдачи — различать их нельзя.
  if (!history) {
    return <p className="text-sm text-muted-foreground">История падений недоступна.</p>;
  }

  const { summary, window } = history;

  return (
    <div className="space-y-2 text-sm">
      {isError && (
        <p role="alert" className="text-destructive">
          Не удалось обновить историю падений. Показаны ранее загруженные данные.{' '}
          <button type="button" onClick={onRetry} disabled={isFetching} className="underline">
            Повторить
          </button>
        </p>
      )}
      {history.open && (
        <p className="text-destructive">{downSinceTextOf(history.open.startedAt)}</p>
      )}

      <dl className="grid gap-2 sm:grid-cols-3">
        <Check label="По журналу инцидентов" value={summary.falls === 0 ? 'Инцидентов нет; аптайм не измерен' : uptimeSummaryTextOf(summary.uptime, window.days)} note={summary.unobservedSeconds > 0 ? 'Доля посчитана по наблюдавшемуся времени.' : null} />
        {summary.downSeconds > 0 && (
          <Check label="Не отвечал" value={downtimeTextOf(summary.downSeconds)} />
        )}
        <Check label="Падений" value={fallsTextOf(summary.falls, window.days)} />
        {/* Только при пропусках: «без наблюдения: 0» заставляло бы
            вчитываться в строку, которая ничего не сообщает. */}
        {summary.unobservedSeconds > 0 && (
          <Check
            label="Без наблюдения"
            value={downtimeTextOf(summary.unobservedSeconds)}
            note={unobservedNoteOf(summary.unobservedSeconds, window.days)}
          />
        )}
      </dl>

      {history.incidents.length > 0 && (
        <ul aria-label="Падения" className="space-y-2">
          {history.incidents.map((incident) => (
            <IncidentRow key={incident.id} incident={incident} />
          ))}
        </ul>
      )}

      {history.nextOffset !== null && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isFetching}
          className="rounded-md border px-3 py-1 disabled:opacity-50"
        >
          {isFetching ? 'Загрузка…' : 'Показать ещё'}
        </button>
      )}
    </div>
  );
}
