import type { ProjectListItem } from '@cairn/shared';

/** Параметр адреса с выбранными тегами. Повторяется по одному на тег. */
export const TAG_PARAM = 'tag';

/** Тег в фильтре: название и сколько проектов им помечено. */
export interface TagFacet {
  slug: string;
  label: string;
  count: number;
}

/**
 * Собирает кнопки фильтра из самой сводки, а не отдельным запросом.
 *
 * Так подсчёты не могут разойтись с показанным списком: фильтр отбирает
 * ровно то, что уже пришло. Проект, чей паспорт субъекту не виден,
 * приходит без тегов и в фильтр ничего не добавляет — гейт стоит на
 * сервере, и повторять его здесь нечем.
 *
 * Порядок — по названию, кириллица впереди латиницы: так же, как сервер
 * упорядочивает теги внутри проекта.
 */
export function collectTagFacets(projects: ProjectListItem[]): TagFacet[] {
  const facets = new Map<string, TagFacet>();

  for (const project of projects) {
    for (const tag of project.tags) {
      const known = facets.get(tag.slug);

      if (known) {
        known.count += 1;
      } else {
        facets.set(tag.slug, { slug: tag.slug, label: tag.label, count: 1 });
      }
    }
  }

  return [...facets.values()].sort((left, right) =>
    left.label.localeCompare(right.label, 'ru'),
  );
}

/**
 * Оставляет проекты, помеченные всеми выбранными тегами.
 *
 * Пересечение, а не объединение: выбрать «Web» и «Внутренний» значит
 * «внутренний веб», и объединение отвечало бы на вопрос, которого никто
 * не задавал — список и так показывает всё.
 *
 * Выбранный тег, которого нет ни у кого, даёт пустой список честно:
 * подменять его полным значило бы соврать про сохранённую ссылку.
 */
export function filterByTags(
  projects: ProjectListItem[],
  selected: string[],
): ProjectListItem[] {
  if (selected.length === 0) {
    return projects;
  }

  return projects.filter((project) => {
    const slugs = new Set(project.tags.map((tag) => tag.slug));

    return selected.every((slug) => slugs.has(slug));
  });
}

/**
 * Переключает тег в наборе выбранных.
 *
 * Порядок выбранных не значим — он нигде не показывается, — но
 * сохраняется: иначе адрес переписывался бы при каждом щелчке и история
 * браузера наполнялась бы одинаковыми ссылками с разным порядком.
 */
export function toggleTag(selected: string[], slug: string): string[] {
  return selected.includes(slug)
    ? selected.filter((item) => item !== slug)
    : [...selected, slug];
}
