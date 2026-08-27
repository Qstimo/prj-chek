'use client';

import type { AccessLevel } from '@cairn/shared';

import { LEVEL_OPTIONS, SECTION_LABELS } from './constants';
import type { IProps } from './types';

/**
 * Матрица «субъект × секция» — главный инструмент контроля суперадмина (ТЗ 8).
 *
 * Все шесть секций видны сразу, включая нереализованные: модель прав знает
 * о них с этапа 1, и выдать доступ заранее — нормальный сценарий (спека 4.3).
 *
 * Строки приходят по всем субъектам, а не только по тем, у кого уже есть
 * выдачи: иначе первому доступу неоткуда взяться — субъект без выдач
 * не появился бы в таблице, и выдать ему что-либо было бы нечем.
 */
export function AccessMatrix({ rows, onChange }: IProps) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground">
        Доступ пока никому не выдан: в системе нет других пользователей, кроме вас. Пригласите
        людей на странице «Пользователи», и они появятся в этой таблице.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className="border-b border-border p-2 text-left">
              Субъект
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
            <tr key={row.subjectId}>
              <th scope="row" className="border-b border-border p-2 text-left font-normal">
                {row.subjectLabel}
                {row.isRevoked && (
                  <span className="ml-2 text-xs text-muted-foreground">отозван</span>
                )}
              </th>
              {SECTION_LABELS.map(({ section, label }) => (
                <td key={section} className="border-b border-border p-2">
                  <select
                    aria-label={`${row.subjectLabel}, ${label}`}
                    value={row.levels[section] ?? ''}
                    onChange={(event) =>
                      onChange({
                        subjectId: row.subjectId,
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
  );
}
