'use client';

import { ModelServiceSource } from '@cairn/shared';

import {
  AUTH_SCHEME_LABELS,
  BLOCKED_LABELS,
  KIND_LABELS,
  PLACEMENT_LABELS,
  SOURCE_LABELS,
} from './constants';
import { ServiceField } from './ServiceField';
import type { IProps } from './types';

/**
 * Карточка узла службы модели.
 *
 * Бирка источника — сверху, потому что это первый вопрос, который задают
 * (дизайн 12.2). Имён переменных окружения карточка не называет вовсе:
 * бирка уже ответила, а список из семи имён отвечал повторно и занимал
 * больше места, чем весь паспорт узла (дизайн 2026-11-19, 2.1).
 *
 * О ключе сказано ровно «задан» или «не задан»: ни длины, ни хвоста — он
 * сюда и не приходит (дизайн, 3.4).
 */
export function ModelServiceCard({
  settings,
  onEdit,
  onProbe,
  onClear,
  probe,
  isProbing = false,
}: IProps) {
  const isFromDatabase = settings.source === ModelServiceSource.Database;

  return (
    <section className="space-y-3 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">{KIND_LABELS[settings.kind]}</h2>
        <span className="rounded-md border border-border px-2 py-0.5 text-sm text-muted-foreground">
          {SOURCE_LABELS[settings.source]}
        </span>
      </div>

      <p className={settings.isOperational ? 'text-sm' : 'text-sm text-amber-600 dark:text-amber-500'}>
        {settings.isOperational
          ? 'Работает'
          : (settings.blockedBy && BLOCKED_LABELS[settings.blockedBy]) ?? 'Не настроено'}
      </p>

      <dl className="space-y-1">
        <ServiceField label="Узел" value={settings.host ?? '—'} />
        <ServiceField label="Адрес" value={settings.baseUrl || '—'} />
        <ServiceField label="Модель" value={settings.model || '—'} />
        <ServiceField label="Авторизация" value={AUTH_SCHEME_LABELS[settings.authScheme]} />
        <ServiceField label="Каталог" value={settings.folder ?? '—'} />
        <ServiceField label="Вид" value={PLACEMENT_LABELS[settings.placement]} />
        <ServiceField label="Ожидание" value={`${settings.timeoutSeconds} с`} />
      </dl>

      {/* Одной строкой, а не парой «подпись — значение»: о ключе
          сообщается ровно «задан» или «нет», и значения, которое стояло
          бы напротив подписи, здесь не существует. */}
      <p className="text-sm">{settings.hasSecret ? 'Ключ задан' : 'Ключа нет'}</p>

      {isFromDatabase && settings.updatedByLabel && (
        <p className="text-sm text-muted-foreground">
          Правил {settings.updatedByLabel}
          {settings.updatedAt && `, ${new Date(settings.updatedAt).toLocaleString('ru-RU')}`}
        </p>
      )}

      {probe}

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={onEdit} className="rounded-md border border-border px-3 py-2 text-sm">
          Править
        </button>
        <button
          type="button"
          onClick={onProbe}
          disabled={!settings.isOperational || isProbing}
          className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
        >
          Проверить связь
        </button>
        {isFromDatabase && (
          <button type="button" onClick={onClear} className="rounded-md border border-border px-3 py-2 text-sm">
            Вернуть настройку окружения
          </button>
        )}
      </div>
    </section>
  );
}
