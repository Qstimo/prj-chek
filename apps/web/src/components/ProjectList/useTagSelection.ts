'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { TAG_PARAM, toggleTag } from './tagFilter';

/** Выбранные теги и способ их переписать. */
export interface TagSelection {
  /** Формы сопоставления выбранных тегов в порядке выбора. */
  selected: string[];
  toggle: (slug: string) => void;
  reset: () => void;
}

/**
 * Выбор тегов живёт в адресе, а не в состоянии сводки.
 *
 * Тем же решением, что вид роадмапа: отобранный список обязан
 * пересылаться ссылкой — «вот наши веб-проекты» — и выживать перезагрузку.
 * Второй копии состояния рядом с адресом нет: она с ним разошлась бы.
 *
 * `replace`, а не `push`: щелчок по тегу — настройка взгляда, а не шаг.
 * Иначе «назад» отщёлкивал бы теги по одному вместо возврата туда,
 * откуда пришли.
 */
export function useTagSelection(): TagSelection {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const selected = params.getAll(TAG_PARAM).filter((slug) => slug.length > 0);

  const write = (slugs: string[]) => {
    const next = new URLSearchParams(params.toString());
    next.delete(TAG_PARAM);

    for (const slug of slugs) {
      next.append(TAG_PARAM, slug);
    }

    const query = next.toString();

    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return {
    selected,
    toggle: (slug) => write(toggleTag(selected, slug)),
    reset: () => write([]),
  };
}
