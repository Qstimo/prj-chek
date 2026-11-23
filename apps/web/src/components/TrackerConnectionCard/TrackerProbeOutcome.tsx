'use client';

import { OK_OUTCOME, OUTCOME_MESSAGES } from './constants';
import type { IProbeProps } from './types';

/**
 * Исход проверки связи с трекером.
 *
 * `role="status"` и место на карточке, а не всплывающее сообщение: по исходу
 * человек правит настройку, то есть результат нужен ему на экране, пока он
 * правит.
 *
 * Тела чужого ответа здесь нет и быть не может — его не отдаёт сервер
 * (контракт: `trackerProbeResultSchema` строгая). Код HTTP показывается
 * числом: `401` не раскрывает ничего, он известен и так, едва нажата
 * кнопка, — а в теле бывает и сам токен, в сообщении о неверном заголовке.
 */
export function TrackerProbeOutcome({ result }: IProbeProps) {
  const isOk = result.outcome === OK_OUTCOME;
  const seconds = (result.durationMs / 1000).toLocaleString('ru-RU', {
    maximumFractionDigits: 1,
  });

  return (
    <p
      role="status"
      className={`text-sm ${isOk ? 'text-emerald-600 dark:text-emerald-500' : 'text-amber-600 dark:text-amber-500'}`}
    >
      {OUTCOME_MESSAGES[result.outcome]}
      {result.status !== null && ` (ответ ${result.status})`}. Узел {result.host ?? '—'}, {seconds} с.
    </p>
  );
}
