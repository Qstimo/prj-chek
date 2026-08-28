'use client';

import type { Variable, VariableVersion, VariablesEnvironment } from '@cairn/shared';
import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../client';

/** Ключи кэша переменных. */
export const VARIABLE_KEYS = {
  forEnvironment: (projectId: string, environmentId: string) =>
    ['variables', projectId, environmentId] as const,
  environments: (projectId: string) => ['variables-environments', projectId] as const,
  versions: (projectId: string, environmentId: string, variableId: string) =>
    ['variable-versions', projectId, environmentId, variableId] as const,
};

/** Переменные окружения: ключи и описания, без значений. */
export function useQueryVariables(projectId: string, environmentId: string) {
  return useQuery({
    queryKey: VARIABLE_KEYS.forEnvironment(projectId, environmentId),
    queryFn: () =>
      apiClient<Variable[]>(`/projects/${projectId}/environments/${environmentId}/variables`),
  });
}

/** Окружения проекта для переключателя — по уровню секции «Переменные». */
export function useQueryVariablesEnvironments(projectId: string) {
  return useQuery({
    queryKey: VARIABLE_KEYS.environments(projectId),
    queryFn: () =>
      apiClient<VariablesEnvironment[]>(`/projects/${projectId}/variables/environments`),
  });
}

/** История версий переменной без значений. */
export function useQueryVariableVersions(
  projectId: string,
  environmentId: string,
  variableId: string | null,
) {
  return useQuery({
    queryKey: VARIABLE_KEYS.versions(projectId, environmentId, variableId ?? 'нет'),
    enabled: variableId !== null,
    queryFn: () =>
      apiClient<VariableVersion[]>(
        `/projects/${projectId}/environments/${environmentId}/variables/${variableId}/versions`,
      ),
  });
}
