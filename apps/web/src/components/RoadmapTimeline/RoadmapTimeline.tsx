import { TimelineColumn } from './TimelineColumn';
import type { IProps } from './types';

/**
 * Временная линия роадмапа (ТЗ 3.5): версии — отметки, заполненность
 * равна прогрессу, текущая выделена кольцом, под названием — дата релиза.
 */
export function RoadmapTimeline({ versions, currentIndex, onSelect }: IProps) {
  if (versions.length === 0) {
    return <p className="text-muted-foreground">Версий пока нет.</p>;
  }

  return (
    <div role="group" aria-label="Диаграмма роадмапа" className="flex w-full max-w-2xl">
      {versions.map((version, index) => (
        <TimelineColumn
          key={version.id}
          version={version}
          isCurrent={index === currentIndex}
          isFirst={index === 0}
          isLast={index === versions.length - 1}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
