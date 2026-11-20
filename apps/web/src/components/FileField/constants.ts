/** Тексты файлового поля: одни на все его места. */
export const FILE_FIELD_TEXTS = {
  choose: 'Выбрать файл',
  drop: 'или перетащите файл сюда',
} as const;

/** Что выбрано: формат и размер, без имени файла. */
export function pickedNoteOf(format: string, size: string): string {
  return `Выбрано: ${format}, ${size}`;
}
