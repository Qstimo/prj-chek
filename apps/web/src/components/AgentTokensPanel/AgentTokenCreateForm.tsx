'use client';

import type { AgentTokenCreate } from '@cairn/shared';
import { useState } from 'react';

/** Пропсы формы создания токена. */
interface IProps {
  onCreate: (input: AgentTokenCreate) => void;
  isPending?: boolean;
}

const DEFAULT_TTL_DAYS = 90;

/**
 * Форма выпуска токена. Флаг значений сопровождается предупреждением:
 * раскрытые значения попадут в контекст модели агента (ТЗ 7.4).
 */
export function AgentTokenCreateForm({ onCreate, isPending = false }: IProps) {
  const [label, setLabel] = useState('');
  const [ttlDays, setTtlDays] = useState(DEFAULT_TTL_DAYS);
  const [canRevealVariables, setCanRevealVariables] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!label.trim()) {
          return;
        }
        onCreate({ label: label.trim(), ttlDays, canRevealVariables });
        setLabel('');
        setCanRevealVariables(false);
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Имя токена
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className="rounded-md border px-3 py-2"
            placeholder="Cursor Вадима"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Срок, дней
          <input
            type="number"
            min={1}
            max={3650}
            value={ttlDays}
            onChange={(event) => setTtlDays(Number(event.target.value))}
            className="w-28 rounded-md border px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
          Создать токен
        </button>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={canRevealVariables}
          onChange={(event) => setCanRevealVariables(event.target.checked)}
          className="mt-1"
        />
        <span>
          Разрешить раскрытие значений переменных.{' '}
          <span className="text-destructive">
            Раскрытые значения попадут в контекст модели агента — включайте только для доверенных
            инструментов.
          </span>
        </span>
      </label>
    </form>
  );
}
