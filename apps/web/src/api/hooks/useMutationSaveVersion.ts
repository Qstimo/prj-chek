'use client';

import type { RoadmapVersionUpdate } from '@cairn/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ReleaseOp } from '@/components/VersionDrawer';

import { apiClient } from '../client';
import { ROADMAP_KEYS } from './useQueryRoadmap';

/** Черновик версии к отправке: патч паспорта и операции над клетками. */
interface SaveVersionInput {
  versionId: string;
  /** Пустой объект — паспорт не трогать. */
  patch: RoadmapVersionUpdate;
  ops: ReleaseOp[];
}

/**
 * Сохранение черновика версии: один щелчок — одна мутация.
 *
 * Запросы идут последовательно: сначала паспорт, затем выпуски в порядке
 * платформ. Паспорт первым — при ошибке на выпуске он уже на месте,
 * а смена состояния версии вместе с выпусками читается как одно действие.
 *
 * Отката при ошибке посередине нет: обратные запросы тоже могут упасть,
 * и тогда состояние стало бы неизвестным по-настоящему. Вместо него —
 * честный отчёт: роадмап перечитывается при любом исходе (`onSettled`),
 * панель остаётся открытой, и остаток черновика виден в ней как
 * несохранённый.
 *
 * Перечитывание одно, в конце: сброс после каждого запроса дёргал бы
 * экран столько раз, сколько платформ в проекте.
 */
export function useMutationSaveVersion(projectId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async ({ versionId, patch, ops }: SaveVersionInput) => {
      const base = `/projects/${projectId}/roadmap/versions/${versionId}`;

      if (Object.keys(patch).length > 0) {
        await apiClient(base, { method: 'PATCH', body: patch });
      }

      for (const op of ops) {
        const address = `${base}/releases/${op.platformId}`;

        if (op.kind === 'clear') {
          await apiClient(address, { method: 'DELETE' });

          continue;
        }

        await apiClient(address, { method: 'PUT', body: op.input });
      }
    },
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: ROADMAP_KEYS.forProject(projectId) });
    },
  });
}
