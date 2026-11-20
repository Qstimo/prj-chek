import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useFileDrop } from './useFileDrop';

/** Событие броска с файлами: `DragEvent` в jsdom без `dataTransfer`. */
function dragEvent(type: string, files: File[] = [], types: string[] = ['Files']): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });

  Object.defineProperty(event, 'dataTransfer', { value: { files, types } });

  return event;
}

describe('бросок файла на страницу', () => {
  it('отдаёт брошенный файл', () => {
    const onFile = vi.fn();
    const file = new File(['данные'], 'созвон.mp4');

    renderHook(() => useFileDrop(onFile));

    act(() => void window.dispatchEvent(dragEvent('drop', [file])));

    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('показывает подсказку, пока файл тащат над страницей', () => {
    const { result } = renderHook(() => useFileDrop(vi.fn()));

    act(() => void window.dispatchEvent(dragEvent('dragover')));
    expect(result.current).toBe(true);

    act(() => void window.dispatchEvent(dragEvent('drop')));
    expect(result.current).toBe(false);
  });

  it('подсказки нет, когда тащат не файл, а выделенный текст', () => {
    const { result } = renderHook(() => useFileDrop(vi.fn()));

    act(() => void window.dispatchEvent(dragEvent('dragover', [], ['text/plain'])));

    expect(result.current).toBe(false);
  });

  it('отменяет умолчание браузера и при выключенном броске', () => {
    // Умолчание — открыть файл вместо страницы, и это потеря набранного
    // в открытой панели. Поэтому отменяется всегда, а гасится лишь
    // передача файла дальше.
    const onFile = vi.fn();

    renderHook(() => useFileDrop(onFile, false));

    const event = dragEvent('drop', [new File(['данные'], 'n.mp4')]);

    act(() => void window.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(true);
    expect(onFile).not.toHaveBeenCalled();
  });

  it('снимает слушателей при размонтировании', () => {
    const onFile = vi.fn();
    const { unmount } = renderHook(() => useFileDrop(onFile));

    unmount();
    window.dispatchEvent(dragEvent('drop', [new File(['данные'], 'n.mp4')]));

    expect(onFile).not.toHaveBeenCalled();
  });
});
