/** Склоняет число проектов на машине. */
export function pluralProjects(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return `${count} проектов`;
  }

  if (last === 1) {
    return `${count} проект`;
  }

  if (last >= 2 && last <= 4) {
    return `${count} проекта`;
  }

  return `${count} проектов`;
}
