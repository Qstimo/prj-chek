'use client';

import { OK_OUTCOME, OUTCOME_MESSAGES } from './constants';
import type { IProps } from './types';

/**
 * Исход проверки связи на карточке узла.
 *
 * `role="status"` и место на карточке, а не всплывающее сообщение: по
 * исходу человек правит настройку, то есть результат нужен ему на экране,
 * пока он правит (дизайн, 12.2).
 *
 * Тела чужого ответа здесь нет и быть не может — его не отдаёт сервер. Код
 * HTTP показывается числом: `401` не раскрывает ничего, он известен и так,
 * едва администратор нажал кнопку, — а тело бывает и с эхом присланного, и
 * с самим ключом в сообщении о неверном заголовке (дизайн, 8.3).
 */
export function ModelProbeResult({ result }: IProps) {
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
      {result.status !== null && ` (ответ ${result.status})`}. Узел {result.host ?? '—'}, модель{' '}
      {result.model}, {seconds} с.
    </p>
  );
}
