'use client';

import type { AccessLevel } from '@cairn/shared';

import { LEVEL_OPTIONS, SECTION_LABELS } from '../AccessMatrix/constants';
import { AddProjectField } from './AddProjectField';
import type { IProps } from './types';

/**
 * Матрица «проект × секция» одного человека.
 *
 * Строки — только проекты с выдачами: карточка отвечает на вопрос «куда
 * у него есть доступ», и полотно из «Нет» по всем проектам системы
 * на этот вопрос не отвечает (спека 2.4).
 *
 * Подписи секций и уровней берутся у проектной матрицы: модель прав одна,
 * и два набора формулировок разошлись бы.
 */
export function UserGrantsMatrix({ rows, candidates, onChange, onAddProject }: IProps) {
  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-muted-foreground">Нет доступа ни к одному проекту.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th scope="col" className="border-b border-border p-2 text-left">
                  Проект
                </th>
                {SECTION_LABELS.map(({ section, label }) => (
                  <th key={section} scope="col" className="border-b border-border p-2 text-left">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.projectId}>
                  <th scope="row" className="border-b border-border p-2 text-left font-normal">
                    {row.projectName}
                  </th>
                  {SECTION_LABELS.map(({ section, label }) => (
                    <td key={section} className="border-b border-border p-2">
                      <select
                        aria-label={`${row.projectName}, ${label}`}
                        value={row.levels[section] ?? ''}
                        onChange={(event) =>
                          onChange(row.projectId, {
                            section,
                            level: (event.target.value || null) as AccessLevel | null,
                          })
                        }
                        className="rounded-md border border-border px-2 py-1"
                      >
                        {LEVEL_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {candidates.length > 0 && (
        <AddProjectField candidates={candidates} onAdd={onAddProject} />
      )}
    </div>
  );
}
