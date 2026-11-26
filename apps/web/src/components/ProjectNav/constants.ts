import { Section } from '@cairn/shared';

/** Вкладки проекта. «Задачи» используют существующее право на «Роадмап». */
export const PROJECT_SECTIONS = [
  { section: Section.Info, label: 'Инфо', path: '' },
  { section: Section.Infrastructure, label: 'Инфраструктура', path: '/infrastructure' },
  { section: Section.Variables, label: 'Переменные', path: '/variables' },
  { section: Section.Docs, label: 'Документация', path: '/docs' },
  { section: Section.Roadmap, label: 'Роадмап', path: '/roadmap' },
  { section: Section.Roadmap, label: 'Задачи', path: '/tasks' },
  { section: Section.Chronicle, label: 'Хроника', path: '/chronicle' },
] as const;
