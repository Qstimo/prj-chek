'use client';

import { Select } from '../Select';
import { TextField } from '../TextField';
import { FIELD_LABELS } from './constants';
import type { IPassportProps } from './types';

/**
 * Паспорт саммари: проект, дата созвона, заголовок.
 *
 * Три поля, одинаковые у всех трёх способов дать текст, — потому они и
 * стоят отдельно от выбора способа. Проект сохранённого саммари
 * неизменяем, поэтому спрашивается здесь и больше нигде: перенос в другой
 * проект сломал бы и происхождение записи хроники, и проверку прав,
 * которая уже состоялась (дизайн первой итерации, 7.2).
 */
export function PassportFields({ projects, values, onChange }: IPassportProps) {
  return (
    <>
      <div className="space-y-1">
        <label htmlFor="projectId" className="block text-sm font-medium">
          {FIELD_LABELS.projectId}
        </label>
        <Select
          id="projectId"
          value={values.projectId}
          onChange={(projectId) => onChange('projectId', projectId)}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
      </div>

      <TextField
        id="occurredOn"
        label={FIELD_LABELS.occurredOn}
        type="date"
        value={values.occurredOn}
        onChange={(occurredOn) => onChange('occurredOn', occurredOn)}
      />

      <TextField
        id="title"
        label={FIELD_LABELS.title}
        value={values.title}
        onChange={(title) => onChange('title', title)}
      />
    </>
  );
}
