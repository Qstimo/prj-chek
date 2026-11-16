'use client';

import type { TagFacet } from './tagFilter';

/** Пропсы фильтра по тегам. */
interface IProps {
  facets: TagFacet[];
  /** Выбранные теги — формы сопоставления, не названия. */
  selected: string[];
  onToggle: (slug: string) => void;
  onReset: () => void;
}

/**
 * Полоса фильтра по тегам.
 *
 * Кнопки-переключатели, а не селект: выбранных бывает несколько, и
 * видимое состояние «что сейчас отобрано» важнее компактности. Рядом с
 * каждым тегом — сколько проектов им помечено: кнопка, которая ничего
 * не отберёт, обязана это показывать до щелчка.
 */
export function TagFilterBar({ facets, selected, onToggle, onReset }: IProps) {
  if (facets.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Фильтр по тегам">
      <button
        type="button"
        aria-pressed={selected.length === 0}
        onClick={onReset}
        className={chipClass(selected.length === 0)}
      >
        Все
      </button>

      {facets.map((facet) => {
        const isOn = selected.includes(facet.slug);

        return (
          <button
            key={facet.slug}
            type="button"
            aria-pressed={isOn}
            onClick={() => onToggle(facet.slug)}
            className={chipClass(isOn)}
          >
            {facet.label}
            <span className="ml-1.5 text-xs text-muted-foreground">{facet.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Оформление кнопки: выбранная залита, остальные обведены. */
function chipClass(isOn: boolean): string {
  return [
    'rounded-full border px-3 py-1 text-sm transition',
    isOn
      ? 'border-transparent bg-surface-strong font-medium'
      : 'border-border text-muted-foreground hover:text-foreground',
  ].join(' ');
}
