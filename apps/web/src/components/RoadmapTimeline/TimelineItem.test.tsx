import { RoadmapVersionState } from '@cairn/shared';
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TimelineHrefProvider } from './href';
import { TimelineItem } from './TimelineItem';
import type { TimelineVersion } from './types';

const version: TimelineVersion = {
  id: '1',
  label: 'v1.0',
  state: RoadmapVersionState.InProgress,
  plannedDate: null,
  releasedDate: null,
  progress: { done: 1, total: 2 },
};

/** Версия на полосе: элемент живёт только внутри списка. */
function renderItem(
  { hrefOf, onSelect }: { hrefOf?: (versionId: string) => string; onSelect?: () => void } = {},
) {
  const item = (
    <ul>
      <TimelineItem
        version={version}
        form="strip"
        isCurrent={false}
        isFirst
        isLast
        position={1}
        total={1}
        onSelect={onSelect}
      />
    </ul>
  );

  return render(hrefOf ? <TimelineHrefProvider hrefOf={hrefOf}>{item}</TimelineHrefProvider> : item);
}

describe('TimelineItem', () => {
  it('без адреса версия остаётся кнопкой', () => {
    // Сторож: на публичной странице роадмапа вести некуда, и ссылка там
    // увела бы читателя внутрь системы.
    renderItem({ onSelect: vi.fn() });

    expect(screen.getByRole('button', { name: 'Версия v1.0' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('с адресом версия становится ссылкой', () => {
    // Ссылка, а не кнопка: Ctrl+клик открывает отчёт в новой вкладке, а
    // адрес можно скопировать и прислать — у кнопки нет ни того, ни другого.
    renderItem({ hrefOf: (versionId) => `/projects/p1/roadmap/versions/${versionId}` });

    expect(screen.getByRole('link', { name: 'Версия v1.0' })).toHaveAttribute(
      'href',
      '/projects/p1/roadmap/versions/1',
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('простой щелчок открывает панель версии, а не уводит со страницы', () => {
    // Правка версии живёт в панели, и переход на отчёт при каждом щелчке
    // отнял бы единственный способ её открыть.
    const onSelect = vi.fn();
    renderItem({ hrefOf: () => '/projects/p1/roadmap/versions/1', onSelect });

    const link = screen.getByRole('link', { name: 'Версия v1.0' });
    const click = createEvent.click(link);
    fireEvent(link, click);

    expect(onSelect).toHaveBeenCalledWith('1');
    expect(click.defaultPrevented).toBe(true);
  });

  it('щелчок с Ctrl оставляют браузеру', () => {
    const onSelect = vi.fn();
    // Адрес с решёткой намеренно: щелчок остаётся неотменённым, и обычный
    // путь jsdom попытался бы пройти настоящей навигацией, которой в нём
    // нет, — в вывод тестов пошла бы ошибка вместо проверки.
    renderItem({ hrefOf: () => '#v1', onSelect });

    const link = screen.getByRole('link', { name: 'Версия v1.0' });
    const click = createEvent.click(link, { ctrlKey: true });
    fireEvent(link, click);

    expect(onSelect).not.toHaveBeenCalled();
    expect(click.defaultPrevented).toBe(false);
  });
});
