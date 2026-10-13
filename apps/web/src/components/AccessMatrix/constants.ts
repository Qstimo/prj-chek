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

/** Пометка строки субъекта, который обходит выдачи. */
export const FULL_ACCESS_LABEL = 'Полный доступ';

/** Пояснение для карточки суперадмина. */
export const FULL_ACCESS_NOTE =
  'Полный доступ ко всем проектам и секциям: суперадминистратор обходит выдачи, и выдавать ему что-либо незачем.';

/** Варианты уровня доступа. Пустое значение означает отсутствие выдачи. */
export const LEVEL_OPTIONS: { value: AccessLevel | ''; label: string }[] = [
  { value: '', label: 'Нет' },
  { value: AccessLevel.Metadata, label: 'Метаданные' },
  { value: AccessLevel.Read, label: 'Чтение' },
  { value: AccessLevel.Write, label: 'Запись' },
];
