import { RoadmapVersionState } from './enums';

/** Ближайший разрабатываемый релиз: дата, затем порядок роадмапа, затем id. */
export function defaultTaskVersion<
  T extends {
    id: string;
    state: RoadmapVersionState;
    plannedDate: string | null;
    position: number;
  },
>(versions: readonly T[]): T | null {
  return (
    [...versions]
      .filter((version) => version.state === RoadmapVersionState.InProgress)
      .sort(
        (a, b) =>
          (a.plannedDate ?? '9999-12-31').localeCompare(b.plannedDate ?? '9999-12-31') ||
          a.position - b.position ||
          a.id.localeCompare(b.id),
      )[0] ?? null
  );
}
