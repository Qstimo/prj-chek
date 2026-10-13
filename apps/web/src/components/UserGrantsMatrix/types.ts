import type { AccessLevel, Section, UserGrantRow } from '@cairn/shared';

/** Проект, которому этому человеку ещё ничего не выдано. */
export interface ProjectCandidate {
  id: string;
  name: string;
}

/** Изменение ячейки: секция и новый уровень; пусто — отзыв. */
export interface SectionChange {
  section: Section;
  level: AccessLevel | null;
}

/** Пропсы матрицы доступов человека. */
export interface IProps {
  /** Проекты с выдачами и те, что только что добавлены в таблицу. */
  rows: UserGrantRow[];
  /** Остальные проекты — для добавления строки. */
  candidates: ProjectCandidate[];
  onChange: (projectId: string, change: SectionChange) => void;
  onAddProject: (projectId: string) => void;
}
