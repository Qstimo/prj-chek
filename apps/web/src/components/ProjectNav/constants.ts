import { Section } from '@cairn/shared';

/**
 * Разделы проекта в порядке, заданном ТЗ (раздел 3).
 *
 * «Инфо» — сама карточка проекта, поэтому её адрес совпадает с адресом
 * проекта. Список закрытый: секции — единицы выдачи доступа, и добавлять
 * в навигацию то, чего нет в модели прав, нельзя.
 */
export const PROJECT_SECTIONS = [
  { section: Section.Info, label: 'Инфо', path: '' },
  { section: Section.Infrastructure, label: 'Инфраструктура', path: '/infrastructure' },
  { section: Section.Variables, label: 'Переменные', path: '/variables' },
  { section: Section.Docs, label: 'Документация', path: '/docs' },
  { section: Section.Roadmap, label: 'Роадмап', path: '/roadmap' },
  { section: Section.Chronicle, label: 'Хроника', path: '/chronicle' },
] as const;
