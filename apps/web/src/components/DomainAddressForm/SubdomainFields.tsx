'use client';

import { useState } from 'react';

import { FormError } from '../FormError';
import { Select } from '../Select';
import type { IAddressOption } from './types';

/** Пропсы выбора проекта и окружения для поддомена. */
interface IProps {
  projects: IAddressOption[];
  environments: IAddressOption[];
  projectId: string;
  onProjectChange: (projectId: string) => void;
  onSubmit: (environmentId: string) => void;
  isSubmitting: boolean;
  error?: string;
}

/**
 * Проект и окружение поддомена: оба обязательны.
 *
 * Поддомена без окружения не бывает — это решение этапа 10: платят за
 * корень, а поддомен есть факт развёртывания, которое по нему отвечает.
 */
export function SubdomainFields({
  projects,
  environments,
  projectId,
  onProjectChange,
  onSubmit,
  isSubmitting,
  error,
}: IProps) {
  const [environmentId, setEnvironmentId] = useState('');

  const canSubmit = projectId.length > 0 && environmentId.length > 0 && !isSubmitting;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="address-project" className="block text-sm font-medium">
          Проект
        </label>
        <Select
          id="address-project"
          value={projectId}
          onChange={(next) => {
            onProjectChange(next);
            setEnvironmentId('');
          }}
        >
          <option value="">Выберите проект</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1">
        <label htmlFor="address-environment" className="block text-sm font-medium">
          Окружение
        </label>
        <Select id="address-environment" value={environmentId} onChange={setEnvironmentId}>
          <option value="">Выберите окружение</option>
          {environments.map((environment) => (
            <option key={environment.id} value={environment.id}>
              {environment.name}
            </option>
          ))}
        </Select>
      </div>

      <FormError message={error} />

      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => onSubmit(environmentId)}
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
      >
        Добавить адрес
      </button>
    </div>
  );
}
