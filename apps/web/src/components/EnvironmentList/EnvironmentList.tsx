'use client';

import { EnvironmentCard } from '../EnvironmentCard';
import type { IProps } from './types';

/** Список окружений проекта (ТЗ 3.2). */
export function EnvironmentList({ environments, canWrite = false, onEdit, onDelete }: IProps) {
  if (environments.length === 0) {
    return (
      <p className="text-muted-foreground">
        {canWrite
          ? 'Окружений пока нет. Добавьте первое окружение — прод, стейдж или дев.'
          : 'Окружений пока нет.'}
      </p>
    );
  }

  return (
    <ul aria-label="Окружения" className="grid gap-3">
      {environments.map((environment) => (
        <li key={environment.id}>
          <EnvironmentCard
            environment={environment}
            canWrite={canWrite}
            onEdit={() => onEdit(environment.id)}
            onDelete={() => onDelete(environment.id)}
          />
        </li>
      ))}
    </ul>
  );
}
