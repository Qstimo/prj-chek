import { describe, expect, it } from 'vitest';
import { RoadmapVersionState as State } from './enums';
import { defaultTaskVersion } from './task-planning';
import { taskPlanningUpdateSchema } from './schemas/task';

describe('релиз задач по умолчанию', () => {
  const version = (
    id: string,
    date: string | null,
    position: number,
    state = State.InProgress,
  ) => ({ id, plannedDate: date, position, state });
  it('берёт ближайшую дату только среди разрабатываемых, не меняя порядок исходного списка', () => {
    const versions = [
      version('late', '2026-12-01', 1),
      version('early', '2026-11-26', 3),
      version('released', '2026-11-01', 2, State.Released),
      version('planned', '2026-11-25', 4, State.Planned),
    ];
    expect(defaultTaskVersion(versions)?.id).toBe('early');
    expect(versions[0]?.id).toBe('late');
  });
  it('при отсутствии дат выбирает по позиции, а без разрабатываемых возвращает null', () => {
    expect(defaultTaskVersion([version('b', null, 2), version('a', null, 1)])?.id).toBe('a');
    expect(defaultTaskVersion([version('p', null, 1, State.Planned)])).toBeNull();
    expect(defaultTaskVersion([])).toBeNull();
  });
  it('правило явно обнуляется; произвольные поля и пустые идентификаторы запрещены', () => {
    expect(
      taskPlanningUpdateSchema.safeParse({ versionId: null, completionRule: null }).success,
    ).toBe(true);
    expect(
      taskPlanningUpdateSchema.safeParse({
        versionId: null,
        completionRule: { boardId: '11', columnId: '' },
      }).success,
    ).toBe(false);
    expect(
      taskPlanningUpdateSchema.safeParse({ versionId: null, projectId: 'other' }).success,
    ).toBe(false);
  });
});
