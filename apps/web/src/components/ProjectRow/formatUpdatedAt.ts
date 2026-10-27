/** Короткая дата паспорта для строки реестра; пустое — если даты нет. */
export function formatUpdatedAt(value: string | null): string {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
