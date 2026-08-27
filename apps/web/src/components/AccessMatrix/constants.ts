import { AccessLevel, Section } from '@cairn/shared';

/** Названия секций на русском. Порядок соответствует ТЗ 3. */
export const SECTION_LABELS: { section: Section; label: string }[] = [
  { section: Section.Info, label: 'Инфо' },
  { section: Section.Infrastructure, label: 'Инфраструктура' },
  { section: Section.Variables, label: 'Переменные' },
  { section: Section.Docs, label: 'Документация' },
  { section: Section.Roadmap, label: 'Роадмап' },
  { section: Section.Chronicle, label: 'Хроника' },
];

/** Варианты уровня доступа. Пустое значение означает отсутствие выдачи. */
export const LEVEL_OPTIONS: { value: AccessLevel | ''; label: string }[] = [
  { value: '', label: 'Нет' },
  { value: AccessLevel.Metadata, label: 'Метаданные' },
  { value: AccessLevel.Read, label: 'Чтение' },
  { value: AccessLevel.Write, label: 'Запись' },
];
