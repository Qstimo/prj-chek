'use client';

import type { ProjectTask } from '@cairn/shared';
import { useState } from 'react';

import { Select } from '../Select';

/** Пропсы выбора задачи из реестра. */
interface IProps {
  /** Задачи вне версий: пустой список сюда не приходит. */
  tasks: ProjectTask[];
  onPick: (taskId: string) => void;
  isSubmitting?: boolean;
}

/**
 * Выбор задачи реестра, которую кладут в эту версию.
 *
 * Отдельный контрол рядом с формой новой задачи, а не поле внутри неё:
 * это **другое** действие. Тело ручки у них тоже разное — «взять
 * существующую» посылает один `taskId`, а форма заводит задачу вместе с
 * размещением, и тело с обоими намерениями сервер отвергает.
 *
 * Выбор не отправляется сам: селект — не кнопка, и щелчок по списку не
 * обязан менять роадмап. Нажатие отдельное, и после него выбор
 * сбрасывается — та же задача второй раз не положится, сервер ответил бы
 * `409`, но предлагать её снова незачем.
 */
export function LooseTaskPicker({ tasks, onPick, isSubmitting = false }: IProps) {
  const [taskId, setTaskId] = useState('');

  return (
    <div className="space-y-1">
      <label htmlFor="loose-task" className="block text-sm font-medium">
        Взять задачу из реестра
      </label>
      <Select id="loose-task" value={taskId} onChange={setTaskId}>
        <option value="">Не выбрана</option>
        {tasks.map((task) => (
          <option key={task.id} value={task.id}>
            {task.title}
          </option>
        ))}
      </Select>
      <button
        type="button"
        disabled={taskId === '' || isSubmitting}
        onClick={() => {
          onPick(taskId);
          setTaskId('');
        }}
        className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
      >
        Добавить в версию
      </button>
    </div>
  );
}
