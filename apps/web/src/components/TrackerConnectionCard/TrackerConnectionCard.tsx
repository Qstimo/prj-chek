'use client';

import { BLOCKED_LABELS, TRACKER_LABELS } from './constants';
import type { IFieldProps, IProps } from './types';

/**
 * Карточка подключения трекера задач.
 *
 * Состояние названо словом, а не цветом индикатора: «Нет токена» и
 * «Выключено» чинятся разным действием, и одна бирка «не работает» на оба
 * случая отправила бы человека искать не то.
 *
 * Бирки источника, как у узлов модели, здесь нет вовсе: источник один —
 * база, запасного в окружении у трекера нет и не будет (дизайн, 3.4).
 * Адрес API задаёт приложение, на карточке он не показывается.
 *
 * О токене сказано ровно «задан» или «нет»: ни длины, ни хвоста — он сюда и
 * не приходит.
 */
export function TrackerConnectionCard({
  connection,
  onEdit,
  onProbe,
  onRemove,
  probe,
  isProbing = false,
}: IProps) {
  // Строки подключения нет вовсе, когда адреса нет: снимать нечего, и
  // кнопка снятия была бы кнопкой без действия.
  const isConfigured = connection.baseUrl !== '';

  return (
    <section className="space-y-3 rounded-md border border-border p-4">
      {/* Заголовком — имя трекера, а не «Трекер задач»: так называется
          блок страницы настроек, и второе такое же заглавие на карточке
          внутри него отвечало бы на вопрос, который уже задан. */}
      <h2 className="font-medium">{TRACKER_LABELS[connection.kind]}</h2>

      <p
        className={
          connection.isOperational ? 'text-sm' : 'text-sm text-amber-600 dark:text-amber-500'
        }
      >
        {connection.isOperational
          ? 'Подключено'
          : (connection.blockedBy && BLOCKED_LABELS[connection.blockedBy]) ?? 'Не подключено'}
      </p>

      <p className="text-sm text-muted-foreground">
        Подключите рабочее пространство один раз. Затем в разделе «Роадмап → Задачи проекта»
        выберите доску для каждого проекта и отправьте в неё нужные задачи.
      </p>

      <dl className="space-y-1">
        <TrackerField label="Пространство" value={connection.workspaceId ?? '—'} />
      </dl>

      {/* Одной строкой, а не парой «подпись — значение»: о токене
          сообщается ровно «задан» или «нет», и значения, которое стояло бы
          напротив подписи, здесь не существует. */}
      <p className="text-sm">{connection.hasSecret ? 'Токен задан' : 'Токена нет'}</p>

      {connection.updatedByLabel && (
        <p className="text-sm text-muted-foreground">
          Правил {connection.updatedByLabel}
          {connection.updatedAt && `, ${new Date(connection.updatedAt).toLocaleString('ru-RU')}`}
        </p>
      )}

      {probe}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md border border-border px-3 py-2 text-sm"
        >
          {isConfigured ? 'Настроить подключение' : 'Подключить Weeek'}
        </button>
        <button
          type="button"
          onClick={onProbe}
          disabled={!connection.isOperational || isProbing}
          className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
        >
          Проверить связь
        </button>
        {isConfigured && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md border border-border px-3 py-2 text-sm"
          >
            Убрать подключение
          </button>
        )}
      </div>
    </section>
  );
}

/** Строка паспорта подключения: подпись и значение. */
function TrackerField({ label, value }: IFieldProps) {
  return (
    <div className="flex flex-wrap gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all">{value}</dd>
    </div>
  );
}
