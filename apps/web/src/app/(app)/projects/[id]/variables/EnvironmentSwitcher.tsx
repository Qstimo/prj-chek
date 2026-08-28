'use client';

import { useState } from 'react';

import { useQueryVariablesEnvironments } from '@/api/hooks';
import { KIND_LABELS } from '@/components/EnvironmentCard/constants';

import { VariablesScreen } from './VariablesScreen';

/** Пропсы переключателя окружений. */
interface IProps {
  projectId: string;
}

/**
 * Переключатель окружений страницы переменных.
 *
 * Список приходит по уровню секции «Переменные», а не «Инфраструктура»:
 * уровни выдаются независимо (спека 7).
 */
export function EnvironmentSwitcher({ projectId }: IProps) {
  const environments = useQueryVariablesEnvironments(projectId);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (environments.isPending) {
    return <p className="text-muted-foreground">Загрузка…</p>;
  }

  if (environments.isError) {
    return (
      <p role="alert" className="text-destructive">
        Не удалось загрузить окружения.
      </p>
    );
  }

  if (environments.data.length === 0) {
    return (
      <p className="text-muted-foreground">
        Переменные живут в окружениях. Сначала заведите окружение в разделе «Инфраструктура».
      </p>
    );
  }

  const activeId = selectedId ?? environments.data[0]!.id;

  return (
    <div className="space-y-4">
      <nav aria-label="Окружения" className="flex flex-wrap gap-2">
        {environments.data.map((environment) => (
          <button
            key={environment.id}
            type="button"
            onClick={() => setSelectedId(environment.id)}
            className={
              environment.id === activeId
                ? 'rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground'
                : 'rounded-md border px-3 py-1 text-sm'
            }
          >
            {environment.name} · {KIND_LABELS[environment.kind]}
          </button>
        ))}
      </nav>

      <VariablesScreen projectId={projectId} environmentId={activeId} />
    </div>
  );
}
