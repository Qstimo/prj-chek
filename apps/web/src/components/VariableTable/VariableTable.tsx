'use client';

import { VariableRow } from './VariableRow';
import type { IProps } from './types';

/** Переменные окружения: ключи и описания, значения — по запросу (ТЗ 3.3). */
export function VariableTable({
  variables,
  canReveal = false,
  canWrite = false,
  onReveal,
  onEdit,
  onDelete,
  onHistory,
}: IProps) {
  if (variables.length === 0) {
    return (
      <p className="text-muted-foreground">
        {canWrite
          ? 'Переменных пока нет. Добавьте первую или импортируйте .env.'
          : 'Переменных пока нет.'}
      </p>
    );
  }

  return (
    <ul aria-label="Переменные" className="grid gap-2">
      {variables.map((variable) => (
        <VariableRow
          key={variable.id}
          variable={variable}
          canReveal={canReveal}
          canWrite={canWrite}
          onReveal={onReveal}
          onEdit={() => onEdit(variable.id)}
          onDelete={() => onDelete(variable.id)}
          onHistory={() => onHistory(variable.id)}
        />
      ))}
    </ul>
  );
}
