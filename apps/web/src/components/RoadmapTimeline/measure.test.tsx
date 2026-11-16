import { RoadmapVersionState } from '@cairn/shared';
import { act, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { RoadmapTimeline } from './RoadmapTimeline';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('observes a wrapper that appears after an empty roadmap and reconnects after removal', () => {
  let width = 400;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
  const observers: { notify: () => void; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  vi.stubGlobal('ResizeObserver', class {
    observe = vi.fn();
    disconnect = vi.fn();
    constructor(notify: () => void) {
      observers.push({ notify, observe: this.observe, disconnect: this.disconnect });
    }
  });
  const versions = Array.from({ length: 12 }, (_, index) => ({
    id: String(index), label: `v${index}`, state: RoadmapVersionState.Planned,
    plannedDate: null, releasedDate: null, progress: { done: 0, total: 0 },
  }));
  const { container, rerender, unmount } = render(
    <RoadmapTimeline versions={[]} currentIndex={null} last={null} />,
  );
  expect(observers).toHaveLength(0);

  rerender(<RoadmapTimeline versions={versions} currentIndex={null} last={null} />);
  expect(observers).toHaveLength(1);
  expect(observers[0]!.observe).toHaveBeenCalledWith(container.querySelector('[data-form]'));
  expect(container.querySelectorAll('[data-knee]')).toHaveLength(3);

  width = 1200;
  act(() => observers[0]!.notify());
  expect(container.querySelectorAll('[data-knee]')).toHaveLength(0);

  rerender(<RoadmapTimeline versions={[]} currentIndex={null} last={null} />);
  expect(observers[0]!.disconnect).toHaveBeenCalledOnce();
  rerender(<RoadmapTimeline versions={versions} currentIndex={null} last={null} />);
  expect(observers).toHaveLength(2);
  unmount();
  expect(observers[1]!.disconnect).toHaveBeenCalledOnce();
});
