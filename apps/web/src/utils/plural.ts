/** Склоняет существительное по числу: 1 проект, 2 проекта, 5 проектов. */
export function pluralize(count: number, one: string, few: string, many: string): string {
  const lastTwo = count % 100;
  const last = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return `${count} ${many}`;
  }

  if (last === 1) {
    return `${count} ${one}`;
  }

  if (last >= 2 && last <= 4) {
    return `${count} ${few}`;
  }

  return `${count} ${many}`;
}

/** Число проектов на сущности реестра. */
export function pluralProjects(count: number): string {
  return pluralize(count, 'проект', 'проекта', 'проектов');
}

/** Число поддоменов корня. */
export function pluralSubdomains(count: number): string {
  return pluralize(count, 'поддомен', 'поддомена', 'поддоменов');
}
